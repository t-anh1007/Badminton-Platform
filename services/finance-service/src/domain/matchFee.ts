import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type {
  JoinApprovedPayload,
  MatchCancelledPayload,
  MatchConfirmedPayload,
  MatchCreatedPayload,
  MatchFeePaymentCompletedPayload,
  MatchFeeRefundRequestedPayload,
  MatchBookingResolutionPayload,
  MatchSettlementPaymentCompletedPayload,
  MatchSettlementRequestedPayload,
  MatchSettlementTooLatePayload,
} from '@khoaluantn/shared';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { writeOutbox } from '../lib/outbox.js';
import { ensurePlatformWallet, getOrCreateWallet, postLedgerEntry } from './wallet.js';
import { resolveMatchBooking } from '../lib/venueBookingClient.js';

const positiveMoney = z.string().regex(/^[1-9]\d*$/);
const nonNegativeMoney = z.string().regex(/^\d+$/);

const matchCreatedSchema = z.object({
  matchId: z.string().uuid(),
  organizerUserId: z.string().uuid(),
  bookingId: z.string().uuid(),
  capacity: z.number().int().min(2),
  feePerSlot: nonNegativeMoney,
  bookingPrice: positiveMoney,
  organizerContribution: positiveMoney,
  cutoffAt: z.string().datetime(),
}).strict();

const joinApprovedSchema = z.object({
  joinId: z.string().uuid(),
  matchId: z.string().uuid(),
  participantUserId: z.string().uuid(),
  fee: nonNegativeMoney,
  expiresAt: z.string().datetime(),
}).strict();

const matchConfirmedSchema = z.object({
  matchId: z.string().uuid(),
  bookingId: z.string().uuid(),
  attemptId: z.string().uuid(),
  venueRevision: z.number().int().nonnegative(),
  participantCount: z.number().int().min(0),
  participantFees: nonNegativeMoney,
  organizerContribution: nonNegativeMoney,
  bookingPrice: positiveMoney,
}).strict();

const matchCancelledSchema = z.object({
  matchId: z.string().uuid(),
  bookingId: z.string().uuid(),
  reason: z.enum(['organizer', 'cutoff', 'confirmed_booking_policy']),
  paidJoinIds: z.array(z.string().uuid()),
  refundPercent: z.number().int().min(0).max(100).optional(),
}).strict();

const refundRequestedSchema = z.object({
  matchId: z.string().uuid(),
  joinId: z.string().uuid(),
  participantUserId: z.string().uuid(),
  reason: z.enum(['withdraw_before_cutoff', 'capacity_race', 'payment_expired']),
}).strict();

async function markProcessed(tx: Prisma.TransactionClient, eventId: string) {
  await tx.processedEvent.create({ data: { eventId } });
}

export async function handleMatchCreated(eventId: string, raw: MatchCreatedPayload): Promise<void> {
  const payload = matchCreatedSchema.parse(raw);
  const fee = BigInt(payload.feePerSlot);
  const price = BigInt(payload.bookingPrice);
  const organizerContribution = BigInt(payload.organizerContribution);
  const expected = fee === 0n
    ? organizerContribution
    : fee * BigInt(payload.capacity - 1) + organizerContribution;
  if (expected !== price) throw new Error('MatchCreated violates D29 value conservation');

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${payload.matchId}, 0))`;
    if (await tx.processedEvent.findUnique({ where: { eventId } })) return;
    // Free matches pay the booking through FIN-03/04 and therefore must not
    // create a second match-funding path.
    if (fee > 0n) {
      await tx.matchFunding.create({
        data: {
          matchId: payload.matchId,
          bookingId: payload.bookingId,
          organizerUserId: payload.organizerUserId,
          capacity: payload.capacity,
          feePerSlot: fee,
          bookingPrice: price,
          organizerContribution,
          cutoffAt: new Date(payload.cutoffAt),
          contributions: {
            create: {
              contributionKey: `organizer:${payload.matchId}`,
              userId: payload.organizerUserId,
              role: 'organizer',
              amount: organizerContribution,
              expiresAt: new Date(payload.cutoffAt),
            },
          },
        },
      });
    }
    await markProcessed(tx, eventId);
  });
}

export async function handleJoinApproved(eventId: string, raw: JoinApprovedPayload): Promise<void> {
  const payload = joinApprovedSchema.parse(raw);
  const fee = BigInt(payload.fee);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${payload.matchId}, 0))`;
    if (await tx.processedEvent.findUnique({ where: { eventId } })) return;
    if (fee > 0n) {
      const funding = await tx.matchFunding.findUnique({ where: { matchId: payload.matchId } });
      if (!funding || funding.status !== 'collecting' || funding.feePerSlot !== fee) {
        throw new Error('JoinApproved does not match an active MatchFunding');
      }
      await tx.matchContribution.create({
        data: {
          contributionKey: payload.joinId,
          matchId: payload.matchId,
          joinId: payload.joinId,
          userId: payload.participantUserId,
          role: 'participant',
          amount: fee,
          expiresAt: new Date(payload.expiresAt),
        },
      });
    }
    await markProcessed(tx, eventId);
  });
}

function assertContributionPayable(
  contribution: { status: string; expiresAt: Date | null },
  funding: { status: string; cutoffAt: Date },
  now: Date,
) {
  if (funding.status !== 'collecting') throw new AppError('MATCH_NOT_COLLECTING', 'Kèo không còn thu phí.', 409);
  if (contribution.status !== 'pending') throw new AppError('MATCH_FEE_ALREADY_PAID', 'Khoản phí đã được xử lý.', 409);
  if ((contribution.expiresAt && contribution.expiresAt <= now) || funding.cutoffAt <= now) {
    throw new AppError('MATCH_FEE_EXPIRED', 'Cửa sổ thanh toán phí đã hết hạn.', 409);
  }
}

async function assertOrganizerCanFund(
  tx: Prisma.TransactionClient,
  contribution: { role: string; matchId: string },
  capacity: number,
) {
  if (contribution.role !== 'organizer') return;
  const paidParticipants = await tx.matchContribution.count({
    where: { matchId: contribution.matchId, role: 'participant', status: 'paid' },
  });
  if (paidParticipants !== capacity - 1) {
    throw new AppError('MATCH_NOT_FILLED', 'Chỉ thanh toán phần organizer sau khi đủ participant.', 409);
  }
}

async function reserveContribution(
  tx: Prisma.TransactionClient,
  contributionId: string,
  method: 'balance' | 'sepay',
  now: Date,
  paymentIntentId?: string,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${contributionId}, 0))`;
  const contribution = await tx.matchContribution.findUnique({
    where: { id: contributionId },
    include: { funding: true },
  });
  if (!contribution) throw new AppError('MATCH_CONTRIBUTION_NOT_FOUND', 'Không tìm thấy khoản góp.', 404);
  assertContributionPayable(contribution, contribution.funding, now);
  await assertOrganizerCanFund(tx, contribution, contribution.funding.capacity);
  const platform = await tx.wallet.findFirstOrThrow({ where: { userId: null, walletType: 'platform' } });
  await postLedgerEntry(tx, {
    walletId: platform.id,
    amount: contribution.amount,
    type: 'reserve',
    refType: 'matchFee',
    refId: contribution.id,
    field: 'reserved',
  });
  const updated = await tx.matchContribution.update({
    where: { id: contribution.id },
    data: { status: 'paid', paymentMethod: method, paymentIntentId, paidAt: now },
  });
  await writeOutbox(tx, {
    aggregateType: 'MatchContribution',
    aggregateId: contribution.id,
    eventType: 'PaymentCompleted',
    payload: {
      refType: 'matchFee',
      matchId: contribution.matchId,
      bookingId: contribution.funding.bookingId,
      contributionId: contribution.id,
      joinId: contribution.joinId,
      userId: contribution.userId,
      role: contribution.role,
      amount: contribution.amount.toString(),
      paidAt: now.toISOString(),
    } satisfies MatchFeePaymentCompletedPayload,
  });
  return updated;
}

export async function payMatchContributionWithBalance(
  userId: string,
  contributionId: string,
  now = new Date(),
) {
  await ensurePlatformWallet();
  const contribution = await prisma.matchContribution.findUnique({
    where: { id: contributionId },
    include: { funding: true },
  });
  if (!contribution || contribution.userId !== userId) {
    throw new AppError('MATCH_CONTRIBUTION_NOT_FOUND', 'Không tìm thấy khoản góp của bạn.', 404);
  }
  assertContributionPayable(contribution, contribution.funding, now);
  const wallet = await prisma.wallet.findFirst({ where: { userId, walletType: 'personal' } });
  if (!wallet) throw new AppError('INSUFFICIENT_BALANCE', 'Số dư không đủ.', 402);

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM wallets WHERE id = ${wallet.id} FOR UPDATE`;
    const fresh = await tx.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
    if (fresh.available < contribution.amount) {
      throw new AppError('INSUFFICIENT_BALANCE', 'Số dư không đủ.', 402);
    }
    await postLedgerEntry(tx, {
      walletId: wallet.id,
      amount: -contribution.amount,
      type: 'payment',
      refType: 'matchFee',
      refId: contribution.id,
    });
    return reserveContribution(tx, contribution.id, 'balance', now);
  });
}

export async function getParticipantContribution(matchId: string, joinId: string) {
  const contribution = await prisma.matchContribution.findUnique({ where: { joinId } });
  if (!contribution || contribution.matchId !== matchId || contribution.role !== 'participant') {
    throw new AppError('MATCH_CONTRIBUTION_NOT_FOUND', 'Không tìm thấy khoản góp.', 404);
  }
  return contribution;
}

export async function getOrganizerContribution(matchId: string) {
  const contribution = await prisma.matchContribution.findUnique({
    where: { contributionKey: `organizer:${matchId}` },
  });
  if (!contribution) throw new AppError('MATCH_CONTRIBUTION_NOT_FOUND', 'Không tìm thấy phần góp organizer.', 404);
  return contribution;
}

export async function createMatchContributionSepayIntent(userId: string, contributionId: string, now = new Date()) {
  const contribution = await prisma.matchContribution.findUnique({
    where: { id: contributionId },
    include: { funding: true },
  });
  if (!contribution || contribution.userId !== userId) {
    throw new AppError('MATCH_CONTRIBUTION_NOT_FOUND', 'Không tìm thấy khoản góp của bạn.', 404);
  }
  assertContributionPayable(contribution, contribution.funding, now);
  await assertOrganizerCanFund(prisma, contribution, contribution.funding.capacity);
  const existing = await prisma.paymentIntent.findFirst({
    where: { userId, refType: 'matchFee', refId: contribution.id, status: 'pending' },
  });
  if (existing) return { intentId: existing.id, matchCode: existing.matchCode!, amount: existing.amount.toString() };
  const matchCode = `KLT${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
  const intent = await prisma.paymentIntent.create({
    data: {
      userId,
      amount: contribution.amount,
      method: 'sepay',
      refType: 'matchFee',
      refId: contribution.id,
      matchCode,
    },
  });
  return { intentId: intent.id, matchCode, amount: intent.amount.toString() };
}

export async function reserveMatchContributionFromSepay(
  tx: Prisma.TransactionClient,
  contributionId: string,
  paymentIntentId: string,
  now = new Date(),
) {
  return reserveContribution(tx, contributionId, 'sepay', now, paymentIntentId);
}

async function refundPaidContribution(tx: Prisma.TransactionClient, contributionId: string, now: Date) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${contributionId}, 0))`;
  const contribution = await tx.matchContribution.findUnique({ where: { id: contributionId } });
  if (!contribution || contribution.status === 'refunded' || contribution.status === 'pending') return;
  if (contribution.status !== 'paid') {
    throw new Error('Settled contribution must be refunded through BookingCancelled');
  }
  const [platform, personal] = await Promise.all([
    tx.wallet.findFirstOrThrow({ where: { userId: null, walletType: 'platform' } }),
    getOrCreateWallet(tx, contribution.userId, 'personal'),
  ]);
  await postLedgerEntry(tx, {
    walletId: platform.id,
    amount: -contribution.amount,
    type: 'refund',
    refType: 'matchFee',
    refId: contribution.id,
    field: 'reserved',
  });
  await postLedgerEntry(tx, {
    walletId: personal.id,
    amount: contribution.amount,
    type: 'refund',
    refType: 'matchFee',
    refId: contribution.id,
  });
  await tx.matchContribution.update({
    where: { id: contribution.id },
    data: { status: 'refunded', refundedAt: now },
  });
}

export async function handleMatchFeeRefundRequested(
  eventId: string,
  raw: MatchFeeRefundRequestedPayload,
  now = new Date(),
) {
  const payload = refundRequestedSchema.parse(raw);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${payload.matchId}, 0))`;
    if (await tx.processedEvent.findUnique({ where: { eventId } })) return;
    const contribution = await tx.matchContribution.findUnique({ where: { joinId: payload.joinId } });
    if (!contribution || contribution.matchId !== payload.matchId || contribution.userId !== payload.participantUserId) {
      throw new Error('Refund request does not match contribution');
    }
    await refundPaidContribution(tx, contribution.id, now);
    await markProcessed(tx, eventId);
  });
}

function assertFullyReservedFunding(funding: {
  capacity: number;
  bookingPrice: bigint;
  organizerContribution: bigint;
  contributions: Array<{ role: string; status: string; amount: bigint }>;
}) {
  const participants = funding.contributions.filter((item) => item.role === 'participant' && item.status === 'paid');
  const organizer = funding.contributions.find((item) => item.role === 'organizer');
  const participantFees = participants.reduce((sum, item) => sum + item.amount, 0n);
  if (!organizer || participants.length !== funding.capacity - 1 || organizer.status !== 'paid'
    || organizer.amount !== funding.organizerContribution
    || participantFees + organizer.amount !== funding.bookingPrice) {
    throw new Error('Match settlement violates FIN-05 conservation');
  }
}

async function refundCollectingFunding(
  tx: Prisma.TransactionClient,
  funding: { matchId: string; contributions: Array<{ id: string; status: string }> },
  now: Date,
) {
  for (const contribution of funding.contributions) {
    if (contribution.status === 'paid') await refundPaidContribution(tx, contribution.id, now);
  }
  await tx.matchFunding.update({
    where: { matchId: funding.matchId }, data: { status: 'cancelled', cancelledAt: now },
  });
}

/** D39 phase 1: finance verifies every reserved contribution, records only a
 * local `settling` intent, then asks Venue to atomically decide. No reserve or
 * contribution ledger entry is consumed at this stage. */
export async function handleMatchConfirmed(eventId: string, raw: MatchConfirmedPayload, now = new Date()) {
  const payload = matchConfirmedSchema.parse(raw);
  await ensurePlatformWallet();
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${payload.matchId}, 0))`;
    if (await tx.processedEvent.findUnique({ where: { eventId } })) return;
    const funding = await tx.matchFunding.findUnique({ where: { matchId: payload.matchId }, include: { contributions: true } });
    if (!funding || funding.bookingId !== payload.bookingId) throw new Error('MatchConfirmed does not match funding');
    if (funding.status === 'settled' || funding.status === 'cancelled') {
      await markProcessed(tx, eventId);
      return;
    }
    // A higher venue revision is a newer attempt after a held revoke. A lower
    // one is terminally stale and must not displace the current fencing token.
    if (funding.status === 'settling' && (payload.venueRevision < funding.settlementVenueRevision
      || (payload.venueRevision === funding.settlementVenueRevision
        && funding.settlementAttemptId !== payload.attemptId))) {
      await markProcessed(tx, eventId);
      return;
    }
    assertFullyReservedFunding(funding);
    const participants = funding.contributions.filter((item) => item.role === 'participant' && item.status === 'paid');
    const participantFees = participants.reduce((sum, item) => sum + item.amount, 0n);
    if (participants.length !== payload.participantCount
      || participantFees !== BigInt(payload.participantFees)
      || funding.organizerContribution !== BigInt(payload.organizerContribution)
      || funding.bookingPrice !== BigInt(payload.bookingPrice)) {
      throw new Error('MatchConfirmed payload violates FIN-05 conservation');
    }
    await tx.matchFunding.update({
      where: { matchId: funding.matchId },
      data: {
        status: 'settling', settlementAttemptId: payload.attemptId,
        settlementVenueRevision: payload.venueRevision,
      },
    });
    await writeOutbox(tx, {
      aggregateType: 'MatchFunding', aggregateId: funding.matchId, eventType: 'MatchSettlementRequested',
      payload: {
        matchId: funding.matchId, bookingId: funding.bookingId,
        attemptId: payload.attemptId, venueRevision: payload.venueRevision,
      } satisfies MatchSettlementRequestedPayload,
    });
    await markProcessed(tx, eventId);
  });
}

/** The finance outbox dispatch is durable. A retry invokes the same Venue
 * command UUID, and it is skipped if a held revoke has already superseded this
 * attempt in MatchFunding. */
export async function handleMatchSettlementRequested(eventId: string, raw: MatchSettlementRequestedPayload) {
  const payload = z.object({
    matchId: z.string().uuid(), bookingId: z.string().uuid(), attemptId: z.string().uuid(),
    venueRevision: z.number().int().nonnegative(),
  }).strict().parse(raw);
  let shouldCall = false;
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${payload.matchId}, 0))`;
    if (await tx.processedEvent.findUnique({ where: { eventId } })) return;
    const funding = await tx.matchFunding.findUnique({ where: { matchId: payload.matchId } });
    if (funding && funding.bookingId === payload.bookingId && funding.status === 'settling'
      && funding.settlementAttemptId === payload.attemptId
      && funding.settlementVenueRevision === payload.venueRevision) shouldCall = true;
  });
  if (!shouldCall) {
    await prisma.$transaction(async (tx) => {
      if (!await tx.processedEvent.findUnique({ where: { eventId } })) await markProcessed(tx, eventId);
    });
    return;
  }
  await resolveMatchBooking({ ...payload, commandId: payload.attemptId });
  await prisma.$transaction(async (tx) => {
    if (!await tx.processedEvent.findUnique({ where: { eventId } })) await markProcessed(tx, eventId);
  });
}

/** D39 phase 2: only Venue's durable decision may consume platform reserve and
 * mark contribution receipts settled. All competing/late results are ignored
 * by attempt id + revision, while held revokes return to collecting unchanged. */
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
  await ensurePlatformWallet();
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${payload.matchId}, 0))`;
    if (await tx.processedEvent.findUnique({ where: { eventId } })) return;
    const funding = await tx.matchFunding.findUnique({ where: { matchId: payload.matchId }, include: { contributions: true } });
    if (!funding || funding.bookingId !== payload.bookingId) {
      await markProcessed(tx, eventId);
      return;
    }
    const currentAttempt = funding.settlementAttemptId === payload.attemptId;
    const revision = Math.max(funding.settlementVenueRevision, payload.venueRevision);
    if (payload.decision === 'confirmed' && payload.action === 'settle'
      && currentAttempt && payload.winningAttemptId === payload.attemptId && funding.status === 'settling') {
      assertFullyReservedFunding(funding);
      const platform = await tx.wallet.findFirstOrThrow({ where: { userId: null, walletType: 'platform' } });
      await postLedgerEntry(tx, {
        walletId: platform.id, amount: -funding.bookingPrice, type: 'settlement',
        refType: 'booking', refId: funding.bookingId, field: 'reserved',
      });
      await tx.matchContribution.updateMany({ where: { matchId: funding.matchId, status: 'paid' }, data: { status: 'settled' } });
      await tx.matchFunding.update({
        where: { matchId: funding.matchId },
        data: { status: 'settled', settledAt: now, settlementVenueRevision: revision },
      });
      await writeOutbox(tx, {
        aggregateType: 'MatchFunding', aggregateId: funding.matchId, eventType: 'PaymentCompleted',
        payload: {
          refType: 'matchSettlement', matchId: funding.matchId, bookingId: funding.bookingId,
          attemptId: payload.attemptId!, venueRevision: revision,
        } satisfies MatchSettlementPaymentCompletedPayload,
      });
    } else if (payload.decision === 'held_revoked' && currentAttempt && funding.status === 'settling') {
      // No ledger mutation: funds were only reserved. A later re-fill can use
      // the same organizer receipt and issue a new, higher fencing revision.
      await tx.matchFunding.update({
        where: { matchId: funding.matchId },
        data: { status: 'collecting', settlementAttemptId: null, settlementVenueRevision: revision },
      });
    } else if (payload.decision === 'cancelled' && (payload.action === 'cancel' || payload.action === 'settle')
      && (funding.status === 'collecting' || funding.status === 'settling')) {
      await refundCollectingFunding(tx, funding, now);
    }
    await markProcessed(tx, eventId);
  });
}

export async function handleMatchSettlementTooLate(
  eventId: string,
  raw: MatchSettlementTooLatePayload,
  now = new Date(),
) {
  const payload = z.object({ matchId: z.string().uuid(), bookingId: z.string().uuid() }).strict().parse(raw);
  await ensurePlatformWallet();
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${payload.matchId}, 0))`;
    if (await tx.processedEvent.findUnique({ where: { eventId } })) return;
    const funding = await tx.matchFunding.findUnique({
      where: { matchId: payload.matchId }, include: { contributions: true },
    });
    if (!funding || funding.bookingId !== payload.bookingId) throw new Error('Late settlement does not match funding');
    if (funding.status === 'settled') {
      const platform = await tx.wallet.findFirstOrThrow({ where: { userId: null, walletType: 'platform' } });
      await postLedgerEntry(tx, {
        walletId: platform.id,
        amount: funding.bookingPrice,
        type: 'refund',
        refType: 'matchSettlementReturn',
        refId: funding.matchId,
        field: 'reserved',
      });
      await tx.matchContribution.updateMany({
        where: { matchId: funding.matchId, status: 'settled' }, data: { status: 'paid' },
      });
      for (const contribution of funding.contributions) {
        if (contribution.status === 'settled') await refundPaidContribution(tx, contribution.id, now);
      }
      await tx.matchFunding.update({
        where: { matchId: funding.matchId }, data: { status: 'cancelled', cancelledAt: now },
      });
      await writeOutbox(tx, {
        aggregateType: 'MatchFunding', aggregateId: funding.matchId, eventType: 'MatchSettlementFailed',
        payload,
      });
    }
    await markProcessed(tx, eventId);
  });
}

export async function handleMatchCancelled(eventId: string, raw: MatchCancelledPayload, now = new Date()) {
  const payload = matchCancelledSchema.parse(raw);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${payload.matchId}, 0))`;
    if (await tx.processedEvent.findUnique({ where: { eventId } })) return;
    const funding = await tx.matchFunding.findUnique({
      where: { matchId: payload.matchId },
      include: { contributions: true },
    });
    if (!funding) {
      await markProcessed(tx, eventId);
      return;
    }
    // A D33 confirmed-booking cancellation is money-finalized solely by the
    // matching BookingCancelled event after D39 has made this funding settled.
    // Requeue instead of accidentally treating the pending `settling` state as
    // a held-match cancellation and refunding 100 percent.
    if (funding.status === 'settling' && payload.reason === 'confirmed_booking_policy') {
      throw new Error('MatchCancelled awaits D39 settlement resolution');
    }
    if (funding.status === 'collecting' || funding.status === 'settling') {
      await refundCollectingFunding(tx, funding, now);
    } else if (funding.status === 'settled' && payload.reason !== 'confirmed_booking_policy') {
      throw new Error('Settled match can only cancel through booking policy');
    }
    await markProcessed(tx, eventId);
  });
}
