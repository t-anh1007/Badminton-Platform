import { shouldRequeue } from '@khoaluantn/eventbus';
import type { Channel, ConsumeMessage } from 'amqplib';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { connectRabbitMQ } from '@khoaluantn/eventbus';
import type {
  BookingConfirmedPayload,
  BookingCompletedPayload,
  MatchConfirmedPayload,
  MatchFeePaymentCompletedPayload,
  MatchFeeRefundRequestedPayload,
  MatchCancelledPayload,
  MatchBookingResolutionPayload,
  MatchSettlementTooLatePayload,
} from '@khoaluantn/shared';
import type { VenueBookingClient, VenueMatchContext } from '../clients/venueBooking.js';
import { HttpVenueBookingClient } from '../clients/venueBooking.js';
import { writeOutbox } from './outbox.js';
import { prisma } from './prisma.js';
import { applyMatchBookingResolution } from '../domain/matchLifecycle.js';

const QUEUE_NAME = 'matchmaking.match-lifecycle';

const matchFeePaymentSchema = z.object({
  refType: z.literal('matchFee'),
  matchId: z.string().uuid(),
  bookingId: z.string().uuid(),
  contributionId: z.string().uuid(),
  joinId: z.string().uuid().nullable(),
  userId: z.string().uuid(),
  role: z.enum(['participant', 'organizer']),
  amount: z.string().regex(/^[1-9]\d*$/),
  paidAt: z.string().datetime(),
}).strict();

const bookingConfirmedSchema = z.object({
  bookingId: z.string().uuid(),
  businessUserId: z.string().uuid(),
  gross: z.string().regex(/^[1-9]\d*$/),
  venueId: z.string().uuid(),
  endAt: z.string().datetime(),
  source: z.enum(['marketplace', 'internal']),
}).passthrough();

function eventIdOf(message: ConsumeMessage): string {
  const type = message.fields.routingKey;
  if (message.properties.messageId) return `${type}:${message.properties.messageId}`;
  return `${type}:${createHash('sha256').update(message.content).digest('hex')}`;
}

async function requestFundingIfReady(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  matchId: string,
  context: VenueMatchContext,
  now: Date,
) {
  const match = await tx.match.findUniqueOrThrow({ where: { id: matchId } });
  if (
    match.status !== 'filled'
    || !match.organizerContributionPaidAt
    || match.fundingRequestedAt
  ) return;
  if (context.status !== 'held' || context.bookingId !== match.bookingId) {
    throw new Error('Filled match booking is not held for settlement');
  }
  const participantCount = await tx.join.count({ where: { matchId, status: 'confirmed' } });
  if (participantCount !== match.capacity - 1) return;
  const bookingPrice = BigInt(context.priceSnapshot);
  const participantFees = match.feePerSlot * BigInt(participantCount);
  const organizerContribution = bookingPrice - participantFees;
  if (organizerContribution <= 0n || participantFees + organizerContribution !== bookingPrice) {
    throw new Error('Match funding violates D29 conservation');
  }
  const attemptId = randomUUID();
  await tx.match.update({
    where: { id: match.id },
    data: { fundingRequestedAt: now, settlementAttemptId: attemptId },
  });
  await writeOutbox(tx, {
    aggregateType: 'Match',
    aggregateId: match.id,
    eventType: 'MatchConfirmed',
    payload: {
      matchId: match.id,
      bookingId: match.bookingId,
      attemptId,
      venueRevision: match.settlementVenueRevision,
      participantCount,
      participantFees: participantFees.toString(),
      organizerContribution: organizerContribution.toString(),
      bookingPrice: bookingPrice.toString(),
    } satisfies MatchConfirmedPayload,
  });
}

export async function handleMatchFeePaymentCompleted(
  eventId: string,
  raw: MatchFeePaymentCompletedPayload,
  venueBookingClient: VenueBookingClient,
  now = new Date(),
) {
  const payload = matchFeePaymentSchema.parse(raw);
  const matchSnapshot = await prisma.match.findUnique({ where: { id: payload.matchId } });
  if (!matchSnapshot || matchSnapshot.bookingId !== payload.bookingId) {
    throw new Error('PaymentCompleted does not match Match');
  }
  const context = await venueBookingClient.getMatchContext(payload.bookingId);
  if (!context) throw new Error('PaymentCompleted booking context unavailable');

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${payload.matchId}, 0))`;
    if (await tx.processedEvent.findUnique({ where: { eventId } })) return;
    const match = await tx.match.findUniqueOrThrow({ where: { id: payload.matchId } });
    const paidAt = new Date(payload.paidAt);
    if (payload.role === 'participant') {
      const join = payload.joinId
        ? await tx.join.findUnique({ where: { id: payload.joinId } })
        : null;
      if (!join || join.matchId !== match.id || join.participantUserId !== payload.userId) {
        throw new Error('Participant payment does not match JOIN');
      }
      if (join.paymentContributionId === payload.contributionId && join.status === 'confirmed') {
        await tx.processedEvent.create({ data: { eventId } });
        return;
      }
      const approvedDeadline = join.approvedAt
        ? new Date(join.approvedAt.getTime() + 10 * 60_000)
        : null;
      const confirmedCount = await tx.join.count({ where: { matchId: match.id, status: 'confirmed' } });
      const invalid = join.status !== 'approved'
        || !approvedDeadline
        || paidAt > approvedDeadline
        || paidAt >= match.cutoffAt
        || confirmedCount + 1 >= match.capacity;
      if (invalid) {
        if (join.status === 'approved' || join.status === 'pending') {
          await tx.join.update({ where: { id: join.id }, data: { status: 'rejected' } });
        }
        await writeOutbox(tx, {
          aggregateType: 'Join',
          aggregateId: join.id,
          eventType: 'MatchFeeRefundRequested',
          payload: {
            matchId: match.id,
            joinId: join.id,
            participantUserId: join.participantUserId,
            reason: confirmedCount + 1 >= match.capacity ? 'capacity_race' : 'payment_expired',
          } satisfies MatchFeeRefundRequestedPayload,
        });
      } else {
        await tx.join.update({
          where: { id: join.id },
          data: {
            status: 'confirmed',
            feePaidAt: paidAt,
            paymentContributionId: payload.contributionId,
          },
        });
        if (confirmedCount + 1 === match.capacity - 1) {
          await tx.match.update({ where: { id: match.id }, data: { status: 'filled' } });
        }
      }
    } else {
      if (payload.userId !== match.organizerUserId || payload.joinId !== null) {
        throw new Error('Organizer contribution does not match Match');
      }
      if (!match.organizerContributionPaidAt) {
        await tx.match.update({
          where: { id: match.id },
          data: {
            organizerContributionPaidAt: paidAt,
            organizerContributionId: payload.contributionId,
          },
        });
      }
    }
    await requestFundingIfReady(tx, match.id, context, now);
    await tx.processedEvent.create({ data: { eventId } });
  });
}

export async function handleBookingConfirmedForMatch(
  eventId: string,
  raw: BookingConfirmedPayload,
  now = new Date(),
) {
  const payload = bookingConfirmedSchema.parse(raw);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${payload.bookingId}, 0))`;
    if (await tx.processedEvent.findUnique({ where: { eventId } })) return;
    const match = await tx.match.findUnique({ where: { bookingId: payload.bookingId } });
    if (match && match.status === 'filled' && (match.fundingRequestedAt || match.feePerSlot === 0n)) {
      await tx.match.update({
        where: { id: match.id },
        data: { status: match.completedAt ? 'completed' : 'confirmed' },
      });
    }
    await tx.processedEvent.create({ data: { eventId, processedAt: now } });
  });
}

/** D39 recovery path: this is intentionally independent from the HTTP caller.
 * If that caller crashes after Venue commits its command, this outbox event
 * still advances the local match state exactly once. */
export async function handleMatchBookingResolved(
  eventId: string,
  raw: MatchBookingResolutionPayload,
  now = new Date(),
) {
  const payload = z.object({
    commandId: z.string().uuid(), matchId: z.string().uuid(), bookingId: z.string().uuid(),
    attemptId: z.string().uuid().nullable(), action: z.enum(['settle', 'withdraw', 'cancel']),
    decision: z.enum(['confirmed', 'held_revoked', 'cancelled']),
    winningAttemptId: z.string().uuid().nullable(), venueRevision: z.number().int().nonnegative(),
  }).strict().parse(raw);
  const recoveredAction = await applyMatchBookingResolution(payload, now);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${payload.matchId}, 0))`;
    if (await tx.processedEvent.findUnique({ where: { eventId } })) return;
    const match = await tx.match.findUnique({ where: { id: payload.matchId } });
    if (!recoveredAction.applied && match && match.bookingId === payload.bookingId) {
      if (payload.action === 'settle' && payload.decision === 'confirmed'
        && payload.winningAttemptId === payload.attemptId) {
        await tx.match.update({
          where: { id: match.id },
          data: { status: 'confirmed', settlementVenueRevision: Math.max(match.settlementVenueRevision, payload.venueRevision) },
        });
      } else if (payload.action === 'settle' && payload.decision === 'held_revoked'
        && match.settlementAttemptId === payload.attemptId) {
        await tx.match.update({
          where: { id: match.id },
          data: {
            fundingRequestedAt: null,
            settlementAttemptId: null,
            settlementVenueRevision: Math.max(match.settlementVenueRevision, payload.venueRevision),
            status: match.status === 'filled' ? 'open' : match.status,
          },
        });
      } else if (payload.action === 'settle' && payload.decision === 'cancelled'
        && match.status !== 'confirmed' && match.status !== 'cancelled') {
        const paidJoins = await tx.join.findMany({
          where: { matchId: match.id, feePaidAt: { not: null } }, select: { id: true },
        });
        await tx.join.updateMany({
          where: { matchId: match.id, status: { in: ['pending', 'approved', 'confirmed'] } },
          data: { status: 'withdrawn' },
        });
        await tx.match.update({ where: { id: match.id }, data: { status: 'cancelled' } });
        await writeOutbox(tx, {
          aggregateType: 'Match', aggregateId: match.id, eventType: 'MatchCancelled',
          payload: {
            matchId: match.id, bookingId: match.bookingId, reason: 'cutoff',
            paidJoinIds: paidJoins.map((join) => join.id),
          } satisfies MatchCancelledPayload,
        });
      }
    }
    await tx.processedEvent.create({ data: { eventId, processedAt: now } });
  });
}

export async function handleMatchSettlementFailed(eventId: string, raw: MatchSettlementTooLatePayload) {
  const payload = z.object({ matchId: z.string().uuid(), bookingId: z.string().uuid() }).strict().parse(raw);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${payload.matchId}, 0))`;
    if (await tx.processedEvent.findUnique({ where: { eventId } })) return;
    const match = await tx.match.findUnique({ where: { id: payload.matchId } });
    if (match && match.bookingId === payload.bookingId && match.status !== 'confirmed') {
      await tx.join.updateMany({
        where: { matchId: match.id, status: { in: ['pending', 'approved', 'confirmed'] } },
        data: { status: 'withdrawn' },
      });
      await tx.match.update({ where: { id: match.id }, data: { status: 'cancelled' } });
    }
    await tx.processedEvent.create({ data: { eventId } });
  });
}

export async function handleBookingCompletedForMatch(eventId: string, raw: BookingCompletedPayload) {
  const payload = z.object({ bookingId: z.string().uuid(), completedAt: z.string().datetime() }).strict().parse(raw);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${payload.bookingId}, 0))`;
    if (await tx.processedEvent.findUnique({ where: { eventId } })) return;
    const match = await tx.match.findUnique({ where: { bookingId: payload.bookingId } });
    if (match && match.status !== 'cancelled') {
      await tx.match.update({
        where: { id: match.id },
        data: {
          status: match.status === 'confirmed' ? 'completed' : match.status,
          completedAt: new Date(payload.completedAt),
        },
      });
    }
    await tx.processedEvent.create({ data: { eventId } });
  });
}

async function consumeMessage(
  channel: Channel,
  message: ConsumeMessage | null,
  venueBookingClient: VenueBookingClient,
) {
  if (!message) return;
  try {
    const envelope = z.object({ type: z.string(), payload: z.unknown() }).passthrough()
      .parse(JSON.parse(message.content.toString()));
    if (envelope.type === 'PaymentCompleted') {
      const candidate = z.object({ refType: z.string().optional() }).passthrough().parse(envelope.payload);
      if (candidate.refType === 'matchFee') {
        await handleMatchFeePaymentCompleted(
          eventIdOf(message),
          envelope.payload as MatchFeePaymentCompletedPayload,
          venueBookingClient,
        );
      }
    } else if (envelope.type === 'BookingConfirmed') {
      await handleBookingConfirmedForMatch(
        eventIdOf(message),
        envelope.payload as BookingConfirmedPayload,
      );
    } else if (envelope.type === 'MatchSettlementFailed') {
      await handleMatchSettlementFailed(eventIdOf(message), envelope.payload as MatchSettlementTooLatePayload);
    } else if (envelope.type === 'BookingCompleted') {
      await handleBookingCompletedForMatch(eventIdOf(message), envelope.payload as BookingCompletedPayload);
    } else if (envelope.type === 'MatchBookingResolved') {
      await handleMatchBookingResolved(eventIdOf(message), envelope.payload as MatchBookingResolutionPayload);
    }
    channel.ack(message);
  } catch (error) {
    console.error('[matchmaking-service match lifecycle consumer]', error);
    // Requeue vô điều kiện là bẫy poison message: event không bao giờ xử lý
    // được sẽ quay lại ngay, đốt CPU consumer + broker + DB vô hạn. Thử lại
    // đúng một lần rồi bỏ.
    channel.nack(message, false, shouldRequeue(error, message));
  }
}

export async function bootstrapMatchLifecycleEventConsumption(
  venueBookingClient: VenueBookingClient = new HttpVenueBookingClient(),
  options?: { queueName?: string; deleteQueueOnStop?: boolean },
): Promise<() => Promise<void>> {
  const { connection, channel } = await connectRabbitMQ(
    process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672',
  );
  const queueName = options?.queueName ?? QUEUE_NAME;
  await channel.assertQueue(queueName, { durable: !options?.deleteQueueOnStop, autoDelete: Boolean(options?.deleteQueueOnStop) });
  await channel.bindQueue(queueName, 'domain-events', 'PaymentCompleted');
  await channel.bindQueue(queueName, 'domain-events', 'BookingConfirmed');
  await channel.bindQueue(queueName, 'domain-events', 'MatchSettlementFailed');
  await channel.bindQueue(queueName, 'domain-events', 'BookingCompleted');
  await channel.bindQueue(queueName, 'domain-events', 'MatchBookingResolved');
  const inFlight = new Set<Promise<void>>();
  const { consumerTag } = await channel.consume(queueName, (message) => {
    const task = consumeMessage(channel, message, venueBookingClient);
    inFlight.add(task);
    void task.finally(() => inFlight.delete(task));
  });
  return async () => {
    await channel.cancel(consumerTag);
    await Promise.allSettled([...inFlight]);
    if (options?.deleteQueueOnStop) await channel.deleteQueue(queueName);
    await channel.close();
    await connection.close();
  };
}
