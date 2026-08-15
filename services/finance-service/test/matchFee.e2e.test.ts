import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHmac, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { createServer, type Server } from 'node:http';
import jwt from 'jsonwebtoken';
import { connectRabbitMQ, publishEvent, startOutboxRelay } from '@khoaluantn/eventbus';
import { createApp as createFinanceApp } from '../src/app.js';
import { prisma as financePrisma } from '../src/lib/prisma.js';
import { bootstrapEventConsumption as bootstrapFinanceConsumer } from '../src/lib/eventConsumer.js';
import { createApp as createMatchmakingApp } from '../../matchmaking-service/src/app.js';
import { prisma as matchmakingPrisma } from '../../matchmaking-service/src/lib/prisma.js';
import { HttpVenueBookingClient } from '../../matchmaking-service/src/clients/venueBooking.js';
import { bootstrapMatchLifecycleEventConsumption } from '../../matchmaking-service/src/lib/matchLifecycleEventConsumer.js';
import { cancelMatchesAtCutoff } from '../../matchmaking-service/src/domain/matchLifecycle.js';
import { createApp as createVenueApp } from '../../venue-booking-service/src/app.js';
import { prisma as venuePrisma } from '../../venue-booking-service/src/lib/prisma.js';
import { bootstrapEventConsumption as bootstrapVenueConsumer } from '../../venue-booking-service/src/lib/eventConsumer.js';
import { completeEndedBookings } from '../../venue-booking-service/src/domain/booking.js';
import { CANCELLATION_POLICY } from '../../venue-booking-service/src/domain/cancellationPolicy.js';
import { seedPersonalBalance, waitFor } from './helpers.js';

const runP2FinanceE2E = process.env.RUN_P2_FIN_E2E === '1';
const describeP2FinanceE2E = runP2FinanceE2E ? describe : describe.skip;
const RABBITMQ_URL = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
const MATCH_PRICE = 200000n;
const MATCH_FEE = 50000n;
const COMMISSION = 20000n;

type OutboxClient = Pick<typeof financePrisma, 'outbox'>;
type StopConsumer = () => Promise<void>;
type StopRelay = () => Promise<void>;

let financeServer: Server | undefined;
let matchmakingServer: Server | undefined;
let venueServer: Server | undefined;
let financeBaseUrl = '';
let matchmakingBaseUrl = '';
let venueBaseUrl = '';
let stopFinanceConsumer: StopConsumer | undefined;
let stopMatchmakingConsumer: StopConsumer | undefined;
let stopVenueConsumer: StopConsumer | undefined;
let financeResolutionBarrier:
  | {
      matchId: string;
      entered: () => void;
      released: Promise<void>;
    }
  | undefined;
const originalVenueBookingServiceUrl = process.env.VENUE_BOOKING_SERVICE_URL;
const originalInternalServiceToken = process.env.INTERNAL_SERVICE_TOKEN;
const internalServiceToken = 'p2-m3-e2e-internal-service-token';
const stopRelays: StopRelay[] = [];

const matchAggregateIds = new Set<string>();
const financeAggregateIds = new Set<string>();
const venueAggregateIds = new Set<string>();
const matchIds: string[] = [];
const bookingIds: string[] = [];
const venueIds: string[] = [];
const providerIds: string[] = [];
const userIds: string[] = [];
const sepayExternalRefs: string[] = [];
let platformBefore: { id: string; available: bigint; pending: bigint; reserved: bigint } | null = null;
const queueNames = {
  finance: `p2-m3-finance-${randomUUID()}`,
  matchmaking: `p2-m3-matchmaking-${randomUUID()}`,
  venue: `p2-m3-venue-${randomUUID()}`,
};

function auth(userId: string) {
  return `Bearer ${jwt.sign(
    { sub: userId, roles: ['player'], type: 'access' },
    process.env.JWT_SECRET ?? 'change-me-in-real-env',
    { expiresIn: 300 },
  )}`;
}

async function listen(server: Server): Promise<string> {
  if (!server.listening) await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address() as AddressInfo | null;
  if (!address) throw new Error('Expected an HTTP server address');
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: Server | undefined): Promise<void> {
  if (!server?.listening) return;
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

async function startScopedRelay(client: OutboxClient, aggregateIds: Set<string>): Promise<StopRelay> {
  const { connection, channel } = await connectRabbitMQ(RABBITMQ_URL);
  const stop = startOutboxRelay({
    channel,
    intervalMs: 20,
    batchSize: 50,
    fetchUnpublished: async (limit) => {
      const ids = [...aggregateIds];
      if (ids.length === 0) return [];
      return client.outbox.findMany({
        where: { publishedAt: null, aggregateId: { in: ids } },
        orderBy: { createdAt: 'asc' },
        take: limit,
      });
    },
    markPublished: async (ids) => {
      await client.outbox.updateMany({ where: { id: { in: ids } }, data: { publishedAt: new Date() } });
    },
  });
  return async () => {
    stop();
    await new Promise((resolve) => setTimeout(resolve, 30));
    await channel.close();
    await connection.close();
  };
}

async function postJson<T>(
  baseUrl: string,
  path: string,
  authorization: string,
  body: unknown,
  expectedStatus: number,
): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { authorization, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as T;
  expect(response.status).toBe(expectedStatus);
  return payload;
}

async function postSepayWebhook(
  externalRef: string,
  amount: bigint,
  rawRef: string,
  expectedStatus = 200,
): Promise<void> {
  // `externalRef` (UUID e2e) đóng vai `id` SePay → giữ nguyên tính idempotent
  // khi test bắn trùng. `content` mang mã đối soát (rawRef).
  const raw = JSON.stringify({ id: externalRef, transferType: 'in', transferAmount: amount.toString(), content: rawRef });
  // Ký HMAC-SHA256 `{timestamp}.{raw_body}` đúng như SePay production.
  const secret = process.env.SEPAY_WEBHOOK_SECRET ?? 'dev-sepay-secret-change-me';
  const ts = Math.floor(Date.now() / 1000).toString();
  const signature = `sha256=${createHmac('sha256', secret).update(`${ts}.${raw}`).digest('hex')}`;
  const response = await fetch(`${financeBaseUrl}/webhooks/sepay`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-sepay-timestamp': ts,
      'x-sepay-signature': signature,
    },
    body: raw,
  });
  expect(response.status).toBe(expectedStatus);
}

/** Gate only Finance's D39 settlement command. Matchmaking receives an HTTP
 * client constructed with `venueBaseUrl`, so a user withdraw/cancel still races
 * against the real Venue endpoint while the finance-owned call is pending. */
async function startSettlementGate(options?: {
  failFirstSettlement?: boolean;
  holdAction?: 'settle' | 'cancel';
  holdOnlyFirst?: boolean;
}) {
  let release!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entered!: () => void;
  const enteredPromise = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let settlementCalls = 0;
  const server = createServer(async (req, res) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;
      const matchResolution = req.method === 'POST' && req.url?.includes('/match-resolution');
      if (matchResolution && body) {
        const command = JSON.parse(body.toString()) as { action?: string };
        if (command.action === (options?.holdAction ?? 'settle')) {
          settlementCalls += 1;
          entered();
          if (options?.failFirstSettlement && command.action === 'settle' && settlementCalls === 1) {
            res.statusCode = 503;
            res.end(JSON.stringify({ error: 'controlled temporary venue failure' }));
            return;
          }
          if (!options?.holdOnlyFirst || settlementCalls === 1) await released;
        }
      }
      const incomingContentType = req.headers['content-type'];
      const incomingType = Array.isArray(incomingContentType) ? incomingContentType[0] : incomingContentType;
      const incomingServiceToken = req.headers['x-internal-service-token'];
      const serviceToken = Array.isArray(incomingServiceToken) ? incomingServiceToken[0] : incomingServiceToken;
      const incomingAuthorization = req.headers.authorization;
      const authorization = Array.isArray(incomingAuthorization) ? incomingAuthorization[0] : incomingAuthorization;
      const headers: Record<string, string> = {};
      if (incomingType) headers['content-type'] = incomingType;
      if (serviceToken) headers['x-internal-service-token'] = serviceToken;
      if (authorization) headers.authorization = authorization;
      const upstream = await fetch(`${venueBaseUrl}${req.url ?? ''}`, {
        method: req.method,
        headers: Object.keys(headers).length > 0 ? headers : undefined,
        body: body && req.method !== 'GET' && req.method !== 'HEAD' ? body : undefined,
      });
      res.statusCode = upstream.status;
      const upstreamBody = Buffer.from(await upstream.arrayBuffer());
      const upstreamType = upstream.headers.get('content-type');
      if (upstreamType) res.setHeader('content-type', upstreamType);
      res.end(upstreamBody);
    } catch (error) {
      res.statusCode = 502;
      res.end(JSON.stringify({ error: String(error) }));
    }
  }).listen(0, '127.0.0.1');
  return {
    baseUrl: await listen(server),
    waitUntilSettlementEntered: () => enteredPromise,
    get settlementCalls() {
      return settlementCalls;
    },
    releaseSettlement: release,
    stop: () => close(server),
  };
}

async function waitForQueuesToDrain() {
  await waitFor(
    async () => {
      const { connection, channel } = await connectRabbitMQ(RABBITMQ_URL);
      try {
        const counts = await Promise.all(
          Object.values(queueNames).map(async (queue) => (await channel.checkQueue(queue)).messageCount),
        );
        return counts;
      } finally {
        await channel.close();
        await connection.close();
      }
    },
    (counts) => counts.every((count) => count === 0),
  );
}

/** Pause Finance's MatchBookingResolved consumer before it touches domain
 * state. This lets an actual Venue-confirmed booking relay D33 cancellation
 * events first, without taking any cross-service database lock. */
function pauseFinanceMatchBookingResolution(matchId: string) {
  let release!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let acquired!: () => void;
  const acquiredLock = new Promise<void>((resolve) => {
    acquired = resolve;
  });
  financeResolutionBarrier = { matchId, entered: acquired, released };
  return {
    waitUntilLocked: () => acquiredLock,
    release: release,
  };
}

async function createHeldBooking(organizerUserId: string, price = MATCH_PRICE, hoursUntilStart = 6) {
  const providerUserId = randomUUID();
  const provider = await venuePrisma.provider.create({
    data: { userId: providerUserId, orgName: `P2-M3 ${randomUUID()}`, status: 'approved' },
  });
  providerIds.push(provider.id);
  userIds.push(providerUserId);
  const venue = await venuePrisma.venue.create({
    data: { providerId: provider.id, name: 'P2 M3 Venue', address: 'Q1', lat: 10.77, lng: 106.7 },
  });
  venueIds.push(venue.id);
  const court = await venuePrisma.court.create({ data: { venueId: venue.id, name: `Court ${randomUUID()}` } });
  const startAt = new Date(Date.now() + hoursUntilStart * 60 * 60_000);
  const booking = await venuePrisma.booking.create({
    data: {
      courtId: court.id,
      userId: organizerUserId,
      source: 'marketplace',
      status: 'held',
      startAt,
      endAt: new Date(startAt.getTime() + 60 * 60_000),
      priceSnapshot: price,
      policySnapshot: CANCELLATION_POLICY,
      holdExpiresAt: new Date(Date.now() + 60 * 60_000),
    },
  });
  bookingIds.push(booking.id);
  venueAggregateIds.add(booking.id);
  return { booking, providerUserId };
}

async function createSplitMatch(organizerUserId: string, capacity = 4, price = MATCH_PRICE, hoursUntilStart = 6) {
  const { booking, providerUserId } = await createHeldBooking(organizerUserId, price, hoursUntilStart);
  const created = await postJson<{ id: string; bookingId: string; feePerSlot: string }>(
    matchmakingBaseUrl,
    '/matches',
    auth(organizerUserId),
    { bookingId: booking.id, capacity, feeMode: 'split' },
    201,
  );
  const fee = price / BigInt(capacity);
  expect(created.feePerSlot).toBe(fee.toString());
  matchIds.push(created.id);
  matchAggregateIds.add(created.id);
  financeAggregateIds.add(created.id);
  await waitFor(
    () => financePrisma.matchFunding.findUnique({ where: { matchId: created.id } }),
    (funding) => funding !== null,
  );
  return { matchId: created.id, bookingId: booking.id, providerUserId, fee, price };
}

async function approveParticipant(matchId: string, organizerUserId: string, participantUserId: string) {
  userIds.push(participantUserId);
  const join = await postJson<{ id: string }>(
    matchmakingBaseUrl,
    `/matches/${matchId}/joins`,
    auth(participantUserId),
    {},
    201,
  );
  matchAggregateIds.add(join.id);
  await postJson(matchmakingBaseUrl, `/matches/${matchId}/joins/${join.id}/approve`, auth(organizerUserId), {}, 200);
  const contribution = await waitFor(
    () => financePrisma.matchContribution.findUnique({ where: { joinId: join.id } }),
    (item) => item !== null,
  );
  financeAggregateIds.add(contribution.id);
  return { joinId: join.id, contributionId: contribution.id, participantUserId, amount: contribution.amount };
}

async function payApprovedParticipant(
  matchId: string,
  participant: Awaited<ReturnType<typeof approveParticipant>>,
  waitForConfirmation = true,
) {
  const { joinId, contributionId, participantUserId, amount } = participant;
  await seedPersonalBalance(participantUserId, amount);
  await postJson(financeBaseUrl, `/matches/${matchId}/joins/${joinId}/pay/balance`, auth(participantUserId), {}, 200);
  if (waitForConfirmation) {
    await waitFor(
      () => matchmakingPrisma.join.findUniqueOrThrow({ where: { id: joinId } }),
      (item) => item.status === 'confirmed',
    );
  }
  return { joinId, contributionId, participantUserId, amount };
}

async function approveAndPayParticipant(
  matchId: string,
  organizerUserId: string,
  participantUserId: string,
  waitForConfirmation = true,
) {
  const participant = await approveParticipant(matchId, organizerUserId, participantUserId);
  return payApprovedParticipant(matchId, participant, waitForConfirmation);
}

async function payOrganizerContribution(matchId: string, organizerUserId: string) {
  const contribution = await financePrisma.matchContribution.findUniqueOrThrow({
    where: { contributionKey: `organizer:${matchId}` },
  });
  financeAggregateIds.add(contribution.id);
  await seedPersonalBalance(organizerUserId, contribution.amount);
  await postJson(
    financeBaseUrl,
    `/matches/${matchId}/organizer-contribution/pay/balance`,
    auth(organizerUserId),
    {},
    200,
  );
}

async function assetTotal(scopedUserIds: string[]): Promise<bigint> {
  const wallets = await financePrisma.wallet.findMany({
    where: {
      OR: [{ userId: { in: scopedUserIds } }, { userId: null, walletType: 'platform' }],
    },
  });
  return wallets.reduce((sum, wallet) => sum + wallet.available + wallet.pending + wallet.reserved, 0n);
}

function eventIds(rows: Array<{ id: string; eventType: string }>) {
  return rows.map((row) => `${row.eventType}:${row.id}`);
}

describeP2FinanceE2E('AC-FIN-05-8 — real HTTP, RabbitMQ and outbox match-fee flow', () => {
  beforeAll(async () => {
    process.env.INTERNAL_SERVICE_TOKEN = internalServiceToken;
    platformBefore = await financePrisma.wallet.findFirst({
      where: { userId: null, walletType: 'platform' },
      select: { id: true, available: true, pending: true, reserved: true },
    });
    venueServer = createVenueApp().listen(0, '127.0.0.1');
    venueBaseUrl = await listen(venueServer);
    process.env.VENUE_BOOKING_SERVICE_URL = venueBaseUrl;
    financeServer = createFinanceApp().listen(0, '127.0.0.1');
    financeBaseUrl = await listen(financeServer);
    matchmakingServer = createMatchmakingApp({
      venueBookingClient: new HttpVenueBookingClient(venueBaseUrl),
    }).listen(0, '127.0.0.1');
    matchmakingBaseUrl = await listen(matchmakingServer);

    stopFinanceConsumer = await bootstrapFinanceConsumer({
      queueName: queueNames.finance,
      deleteQueueOnStop: true,
      beforeMatchBookingResolved: async (payload) => {
        const barrier = financeResolutionBarrier;
        if (barrier?.matchId === payload.matchId) {
          barrier.entered();
          await barrier.released;
        }
      },
    });
    stopVenueConsumer = await bootstrapVenueConsumer({ queueName: queueNames.venue, deleteQueueOnStop: true });
    stopMatchmakingConsumer = await bootstrapMatchLifecycleEventConsumption(new HttpVenueBookingClient(venueBaseUrl), {
      queueName: queueNames.matchmaking,
      deleteQueueOnStop: true,
    });
    stopRelays.push(
      await startScopedRelay(matchmakingPrisma, matchAggregateIds),
      await startScopedRelay(financePrisma, financeAggregateIds),
      await startScopedRelay(venuePrisma, venueAggregateIds),
    );
  }, 30000);

  afterAll(async () => {
    await Promise.allSettled(
      [stopFinanceConsumer?.(), stopVenueConsumer?.(), stopMatchmakingConsumer?.()].filter(Boolean),
    );
    await Promise.allSettled(stopRelays.map((stop) => stop()));
    await Promise.allSettled([close(financeServer), close(matchmakingServer), close(venueServer)]);

    const [matchRows, financeRows, venueRows] = await Promise.all([
      matchmakingPrisma.outbox.findMany({
        where: { aggregateId: { in: [...matchAggregateIds] } },
        select: { id: true, eventType: true },
      }),
      financePrisma.outbox.findMany({
        where: { aggregateId: { in: [...financeAggregateIds] } },
        select: { id: true, eventType: true },
      }),
      venuePrisma.outbox.findMany({
        where: { aggregateId: { in: [...venueAggregateIds] } },
        select: { id: true, eventType: true },
      }),
    ]);
    const processedIds = [...eventIds(matchRows), ...eventIds(financeRows), ...eventIds(venueRows)];
    await Promise.all([
      matchmakingPrisma.processedEvent.deleteMany({ where: { eventId: { in: processedIds } } }),
      financePrisma.processedEvent.deleteMany({ where: { eventId: { in: processedIds } } }),
      venuePrisma.processedEvent.deleteMany({ where: { eventId: { in: processedIds } } }),
    ]);

    const contributions = await financePrisma.matchContribution.findMany({
      where: { matchId: { in: matchIds } },
      select: { id: true },
    });
    const ledgerRefs = [...bookingIds, ...matchIds, ...contributions.map((item) => item.id)];
    const scopedWallets = await financePrisma.wallet.findMany({
      where: { userId: { in: userIds } },
      select: { id: true },
    });
    const platformAfter = await financePrisma.wallet.findFirst({ where: { userId: null, walletType: 'platform' } });
    if (platformBefore) {
      await financePrisma.wallet.update({
        where: { id: platformBefore.id },
        data: {
          available: platformBefore.available,
          pending: platformBefore.pending,
          reserved: platformBefore.reserved,
        },
      });
    }
    await financePrisma.ledgerEntry.deleteMany({
      where: {
        OR: [{ refId: { in: ledgerRefs } }, { walletId: { in: scopedWallets.map((wallet) => wallet.id) } }],
      },
    });
    const sepayEvents = await financePrisma.sepayEvent.findMany({
      where: { externalRef: { in: sepayExternalRefs } },
      select: { id: true },
    });
    await financePrisma.sepayAllocation.deleteMany({
      where: { sepayEventId: { in: sepayEvents.map((event) => event.id) } },
    });
    await financePrisma.sepayEvent.deleteMany({ where: { externalRef: { in: sepayExternalRefs } } });
    await financePrisma.paymentIntent.deleteMany({ where: { refId: { in: contributions.map((item) => item.id) } } });
    await financePrisma.outbox.deleteMany({ where: { aggregateId: { in: [...financeAggregateIds] } } });
    await financePrisma.bookingRevenue.deleteMany({ where: { bookingId: { in: bookingIds } } });
    await financePrisma.matchContribution.deleteMany({ where: { matchId: { in: matchIds } } });
    await financePrisma.matchFunding.deleteMany({ where: { matchId: { in: matchIds } } });
    await financePrisma.wallet.deleteMany({ where: { userId: { in: userIds } } });
    if (!platformBefore && platformAfter) {
      await financePrisma.wallet.delete({ where: { id: platformAfter.id } });
    }
    await matchmakingPrisma.outbox.deleteMany({ where: { aggregateId: { in: [...matchAggregateIds] } } });
    await matchmakingPrisma.matchResolution.deleteMany({ where: { matchId: { in: matchIds } } });
    await matchmakingPrisma.join.deleteMany({ where: { matchId: { in: matchIds } } });
    await matchmakingPrisma.match.deleteMany({ where: { id: { in: matchIds } } });
    await venuePrisma.outbox.deleteMany({ where: { aggregateId: { in: [...venueAggregateIds] } } });
    await venuePrisma.matchBookingCommand.deleteMany({ where: { bookingId: { in: bookingIds } } });
    await venuePrisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
    await venuePrisma.hold.deleteMany({ where: { court: { venueId: { in: venueIds } } } });
    await venuePrisma.court.deleteMany({ where: { venueId: { in: venueIds } } });
    await venuePrisma.venue.deleteMany({ where: { id: { in: venueIds } } });
    await venuePrisma.provider.deleteMany({ where: { id: { in: providerIds } } });
    if (originalVenueBookingServiceUrl === undefined) delete process.env.VENUE_BOOKING_SERVICE_URL;
    else process.env.VENUE_BOOKING_SERVICE_URL = originalVenueBookingServiceUrl;
    if (originalInternalServiceToken === undefined) delete process.env.INTERNAL_SERVICE_TOKEN;
    else process.env.INTERNAL_SERVICE_TOKEN = originalInternalServiceToken;
    await Promise.all([financePrisma.$disconnect(), matchmakingPrisma.$disconnect(), venuePrisma.$disconnect()]);
  }, 30000);

  it('conserves scoped system value through one completion and one cancellation, with empty queues', async () => {
    const organizerUserId = randomUUID();
    userIds.push(organizerUserId);
    const completed = await createSplitMatch(organizerUserId);
    const completedApproved = await Promise.all(
      [randomUUID(), randomUUID(), randomUUID()].map((participantUserId) =>
        approveParticipant(completed.matchId, organizerUserId, participantUserId),
      ),
    );
    const completedParticipants = await Promise.all(
      completedApproved.map((participant) => payApprovedParticipant(completed.matchId, participant)),
    );
    await waitFor(
      () => matchmakingPrisma.match.findUniqueOrThrow({ where: { id: completed.matchId } }),
      (match) => match.status === 'filled',
    );
    await payOrganizerContribution(completed.matchId, organizerUserId);
    await waitFor(
      () => financePrisma.matchFunding.findUniqueOrThrow({ where: { matchId: completed.matchId } }),
      (funding) => funding.status === 'settled',
    );
    await waitFor(
      () => venuePrisma.booking.findUniqueOrThrow({ where: { id: completed.bookingId } }),
      (booking) => booking.status === 'confirmed',
    );
    await waitFor(
      () => matchmakingPrisma.match.findUniqueOrThrow({ where: { id: completed.matchId } }),
      (match) => match.status === 'confirmed',
    );
    await waitFor(
      () => financePrisma.bookingRevenue.findUnique({ where: { bookingId: completed.bookingId } }),
      (revenue) => revenue !== null,
    );

    const completedFunding = await financePrisma.matchFunding.findUniqueOrThrow({
      where: { matchId: completed.matchId },
      include: { contributions: true },
    });
    expect(completedFunding.contributions.reduce((sum, contribution) => sum + contribution.amount, 0n)).toBe(
      MATCH_PRICE,
    );
    expect(completedFunding.contributions.map((contribution) => contribution.status)).toEqual([
      'settled',
      'settled',
      'settled',
      'settled',
    ]);
    const platformAfterSettlement = await financePrisma.wallet.findFirstOrThrow({
      where: { userId: null, walletType: 'platform' },
    });
    expect(platformAfterSettlement.reserved).toBe(platformBefore?.reserved ?? 0n);
    expect(platformAfterSettlement.available).toBe((platformBefore?.available ?? 0n) + COMMISSION);
    const business = await financePrisma.wallet.findFirstOrThrow({
      where: { userId: completed.providerUserId, walletType: 'business' },
    });
    expect(business.pending).toBe(MATCH_PRICE - COMMISSION);

    const completedEndAt = new Date(Date.now() - 1_000);
    await venuePrisma.booking.update({
      where: { id: completed.bookingId },
      data: { startAt: new Date(completedEndAt.getTime() - 60 * 60_000), endAt: completedEndAt },
    });
    expect(await completeEndedBookings()).toBeGreaterThanOrEqual(1);
    await waitFor(
      () => matchmakingPrisma.match.findUniqueOrThrow({ where: { id: completed.matchId } }),
      (match) => match.status === 'completed',
    );

    const cancelledOrganizerUserId = randomUUID();
    userIds.push(cancelledOrganizerUserId);
    const cancelled = await createSplitMatch(cancelledOrganizerUserId);
    const cancelledApproved = await Promise.all(
      [randomUUID(), randomUUID()].map((participantUserId) =>
        approveParticipant(cancelled.matchId, cancelledOrganizerUserId, participantUserId),
      ),
    );
    const cancelledParticipants = await Promise.all(
      cancelledApproved.map((participant) => payApprovedParticipant(cancelled.matchId, participant)),
    );
    await postJson(matchmakingBaseUrl, `/matches/${cancelled.matchId}/cancel`, auth(cancelledOrganizerUserId), {}, 200);
    await waitFor(
      () => financePrisma.matchFunding.findUniqueOrThrow({ where: { matchId: cancelled.matchId } }),
      (funding) => funding.status === 'cancelled',
    );
    await waitFor(
      () => venuePrisma.booking.findUniqueOrThrow({ where: { id: cancelled.bookingId } }),
      (booking) => booking.status === 'cancelled',
    );
    const cancelledContributions = await financePrisma.matchContribution.findMany({
      where: { matchId: cancelled.matchId },
    });
    expect(
      cancelledContributions
        .filter((contribution) => contribution.role === 'participant')
        .map((contribution) => contribution.status),
    ).toEqual(['refunded', 'refunded']);

    const cancelledParticipantUserIds = await matchmakingPrisma.join.findMany({
      where: { id: { in: cancelledParticipants.map((participant) => participant.joinId) } },
      select: { participantUserId: true },
    });
    const refundedWallets = await financePrisma.wallet.findMany({
      where: {
        userId: { in: cancelledParticipantUserIds.map((join) => join.participantUserId) },
        walletType: 'personal',
      },
    });
    expect(refundedWallets.map((wallet) => wallet.available).sort()).toEqual([MATCH_FEE, MATCH_FEE]);
    expect(
      (await financePrisma.wallet.findFirstOrThrow({ where: { userId: null, walletType: 'platform' } })).reserved,
    ).toBe(platformBefore?.reserved ?? 0n);

    const raceOrganizerUserId = randomUUID();
    userIds.push(raceOrganizerUserId);
    const race = await createSplitMatch(raceOrganizerUserId, 2);
    const raceParticipantUserIds = [randomUUID(), randomUUID()];
    userIds.push(...raceParticipantUserIds);
    const raceJoins = await Promise.all(
      raceParticipantUserIds.map(async (participantUserId) => {
        const join = await postJson<{ id: string }>(
          matchmakingBaseUrl,
          `/matches/${race.matchId}/joins`,
          auth(participantUserId),
          {},
          201,
        );
        matchAggregateIds.add(join.id);
        return { ...join, participantUserId };
      }),
    );
    const platformBeforeRace = await financePrisma.wallet.findFirstOrThrow({
      where: { userId: null, walletType: 'platform' },
    });
    const approvals = await Promise.all(
      raceJoins.map(async (join) => {
        const response = await fetch(`${matchmakingBaseUrl}/matches/${race.matchId}/joins/${join.id}/approve`, {
          method: 'POST',
          headers: { authorization: auth(raceOrganizerUserId), 'content-type': 'application/json' },
          body: '{}',
        });
        return {
          join,
          status: response.status,
          payload: (await response.json()) as { error?: { code?: string } },
        };
      }),
    );
    expect(approvals.map((approval) => approval.status).sort()).toEqual([200, 409]);
    const rejectedApproval = approvals.find((approval) => approval.status === 409)!;
    expect(rejectedApproval.payload.error?.code).toBe('MATCH_FULL');
    const winningApproval = approvals.find((approval) => approval.status === 200)!;
    const winningContribution = await waitFor(
      () => financePrisma.matchContribution.findUnique({ where: { joinId: winningApproval.join.id } }),
      (contribution) => contribution !== null,
    );
    financeAggregateIds.add(winningContribution.id);
    expect(
      await financePrisma.matchContribution.findUnique({ where: { joinId: rejectedApproval.join.id } }),
    ).toBeNull();
    expect(
      (await financePrisma.wallet.findFirstOrThrow({ where: { userId: null, walletType: 'platform' } })).reserved,
    ).toBe(platformBeforeRace.reserved);
    expect(await financePrisma.ledgerEntry.count({ where: { refId: race.matchId } })).toBe(0);
    await postJson(matchmakingBaseUrl, `/matches/${race.matchId}/cancel`, auth(raceOrganizerUserId), {}, 200);
    await waitFor(
      () => financePrisma.matchFunding.findUniqueOrThrow({ where: { matchId: race.matchId } }),
      (funding) => funding.status === 'cancelled',
    );

    const confirmedCancellationOrganizerUserId = randomUUID();
    userIds.push(confirmedCancellationOrganizerUserId);
    const confirmedCancellation = await createSplitMatch(confirmedCancellationOrganizerUserId, 4, 200007n, 12);
    const confirmedCancellationApproved = await Promise.all(
      [randomUUID(), randomUUID(), randomUUID()].map((participantUserId) =>
        approveParticipant(confirmedCancellation.matchId, confirmedCancellationOrganizerUserId, participantUserId),
      ),
    );
    const confirmedCancellationParticipants = await Promise.all(
      confirmedCancellationApproved.map((participant) =>
        payApprovedParticipant(confirmedCancellation.matchId, participant),
      ),
    );
    await payOrganizerContribution(confirmedCancellation.matchId, confirmedCancellationOrganizerUserId);
    await waitFor(
      () => matchmakingPrisma.match.findUniqueOrThrow({ where: { id: confirmedCancellation.matchId } }),
      (match) => match.status === 'confirmed',
    );
    await postJson(
      matchmakingBaseUrl,
      `/matches/${confirmedCancellation.matchId}/cancel`,
      auth(confirmedCancellationOrganizerUserId),
      {},
      200,
    );
    const bookingCancelled = await waitFor(
      () =>
        venuePrisma.outbox.findFirst({
          where: { aggregateId: confirmedCancellation.bookingId, eventType: 'BookingCancelled' },
        }),
      (event) => event !== null,
    );
    expect(bookingCancelled.payload).toMatchObject({ refundPercent: 50, reason: 'self' });
    await waitFor(
      () => financePrisma.matchFunding.findUniqueOrThrow({ where: { matchId: confirmedCancellation.matchId } }),
      (funding) => funding.status === 'cancelled',
    );
    const refundGross = (confirmedCancellation.price * 50n) / 100n;
    const participantRefund = (confirmedCancellation.fee * 50n) / 100n;
    const organizerRefund = refundGross - participantRefund * 3n;
    for (const participant of confirmedCancellationParticipants) {
      expect(
        await financePrisma.wallet.findFirstOrThrow({
          where: { userId: participant.participantUserId, walletType: 'personal' },
        }),
      ).toMatchObject({ available: participantRefund });
    }
    expect(
      await financePrisma.wallet.findFirstOrThrow({
        where: { userId: confirmedCancellationOrganizerUserId, walletType: 'personal' },
      }),
    ).toMatchObject({ available: organizerRefund });
    expect(
      (await financePrisma.bookingRevenue.findUniqueOrThrow({ where: { bookingId: confirmedCancellation.bookingId } }))
        .cancelledAt,
    ).not.toBeNull();

    const preCutoffOrganizerUserId = randomUUID();
    userIds.push(preCutoffOrganizerUserId);
    const preCutoff = await createSplitMatch(preCutoffOrganizerUserId, 2);
    const preCutoffParticipant = await approveAndPayParticipant(
      preCutoff.matchId,
      preCutoffOrganizerUserId,
      randomUUID(),
    );
    await waitFor(
      () => matchmakingPrisma.match.findUniqueOrThrow({ where: { id: preCutoff.matchId } }),
      (match) => match.status === 'filled',
    );
    await postJson(
      matchmakingBaseUrl,
      `/matches/${preCutoff.matchId}/joins/${preCutoffParticipant.joinId}/withdraw`,
      auth(preCutoffParticipant.participantUserId),
      {},
      200,
    );
    await waitFor(
      () => financePrisma.matchContribution.findUniqueOrThrow({ where: { id: preCutoffParticipant.contributionId } }),
      (contribution) => contribution.status === 'refunded',
    );
    expect(await matchmakingPrisma.match.findUniqueOrThrow({ where: { id: preCutoff.matchId } })).toMatchObject({
      status: 'open',
    });
    expect(
      await financePrisma.wallet.findFirstOrThrow({
        where: { userId: preCutoffParticipant.participantUserId, walletType: 'personal' },
      }),
    ).toMatchObject({ available: preCutoff.fee });

    const lateWithdrawOrganizerUserId = randomUUID();
    userIds.push(lateWithdrawOrganizerUserId);
    const lateWithdraw = await createSplitMatch(lateWithdrawOrganizerUserId);
    const lateWithdrawParticipant = await approveAndPayParticipant(
      lateWithdraw.matchId,
      lateWithdrawOrganizerUserId,
      randomUUID(),
    );
    await matchmakingPrisma.match.update({
      where: { id: lateWithdraw.matchId },
      data: { cutoffAt: new Date(Date.now() - 1_000) },
    });
    await postJson(
      matchmakingBaseUrl,
      `/matches/${lateWithdraw.matchId}/joins/${lateWithdrawParticipant.joinId}/withdraw`,
      auth(lateWithdrawParticipant.participantUserId),
      {},
      200,
    );
    expect(
      await financePrisma.matchContribution.findUniqueOrThrow({
        where: { id: lateWithdrawParticipant.contributionId },
      }),
    ).toMatchObject({ status: 'paid' });
    expect(
      await financePrisma.wallet.findFirstOrThrow({
        where: { userId: lateWithdrawParticipant.participantUserId, walletType: 'personal' },
      }),
    ).toMatchObject({ available: 0n });
    await postJson(
      matchmakingBaseUrl,
      `/matches/${lateWithdraw.matchId}/cancel`,
      auth(lateWithdrawOrganizerUserId),
      {},
      200,
    );
    await waitFor(
      () =>
        financePrisma.matchContribution.findUniqueOrThrow({ where: { id: lateWithdrawParticipant.contributionId } }),
      (contribution) => contribution.status === 'refunded',
    );
    expect(
      await financePrisma.wallet.findFirstOrThrow({
        where: { userId: lateWithdrawParticipant.participantUserId, walletType: 'personal' },
      }),
    ).toMatchObject({ available: lateWithdraw.fee });

    const cutoffOrganizerUserId = randomUUID();
    userIds.push(cutoffOrganizerUserId);
    const cutoff = await createSplitMatch(cutoffOrganizerUserId);
    const cutoffParticipant = await approveAndPayParticipant(cutoff.matchId, cutoffOrganizerUserId, randomUUID());
    await matchmakingPrisma.match.update({
      where: { id: cutoff.matchId },
      data: { cutoffAt: new Date(Date.now() - 1_000) },
    });
    expect(await cancelMatchesAtCutoff()).toBeGreaterThanOrEqual(1);
    await waitFor(
      () => financePrisma.matchContribution.findUniqueOrThrow({ where: { id: cutoffParticipant.contributionId } }),
      (contribution) => contribution.status === 'refunded',
    );
    await waitFor(
      () => venuePrisma.booking.findUniqueOrThrow({ where: { id: cutoff.bookingId } }),
      (booking) => booking.status === 'cancelled',
    );

    await waitForQueuesToDrain();
    const expectedSeededValue =
      MATCH_PRICE +
      MATCH_FEE * 2n +
      confirmedCancellation.price +
      preCutoff.fee +
      lateWithdraw.fee +
      cutoff.fee;
    expect(await assetTotal(userIds)).toBe(
      (platformBefore?.available ?? 0n) +
        (platformBefore?.pending ?? 0n) +
        (platformBefore?.reserved ?? 0n) +
        expectedSeededValue,
    );

    // The response IDs are intentionally consumed above: they prove each payment was
    // addressed to that exact contribution, never to another participant or organizer.
    expect(completedParticipants).toHaveLength(3);
  }, 45000);

  it('D39: held withdrawal revokes a pending settlement, refunds one contribution, and stale settlement cannot confirm', async () => {
    const organizerUserId = randomUUID();
    const participantUserId = randomUUID();
    userIds.push(organizerUserId, participantUserId);
    const match = await createSplitMatch(organizerUserId, 2);
    const participant = await approveAndPayParticipant(match.matchId, organizerUserId, participantUserId);
    await waitFor(
      () => matchmakingPrisma.match.findUniqueOrThrow({ where: { id: match.matchId } }),
      (item) => item.status === 'filled',
    );

    const gate = await startSettlementGate({ failFirstSettlement: true });
    const previousVenueUrl = process.env.VENUE_BOOKING_SERVICE_URL;
    process.env.VENUE_BOOKING_SERVICE_URL = gate.baseUrl;
    try {
      await payOrganizerContribution(match.matchId, organizerUserId);
      await gate.waitUntilSettlementEntered();
      // Finance consumer nacks the deliberate 503; the second attempt is the
      // same UUID command and remains pending behind the gate.
      await waitFor(
        () => gate.settlementCalls,
        (calls) => calls >= 2,
      );
      const settling = await waitFor(
        () => financePrisma.matchFunding.findUniqueOrThrow({ where: { matchId: match.matchId } }),
        (funding) => funding.status === 'settling' && funding.settlementAttemptId !== null,
      );
      const staleAttemptId = settling.settlementAttemptId!;

      const withdrawn = await postJson<{ status: string; refunded: boolean }>(
        matchmakingBaseUrl,
        `/matches/${match.matchId}/joins/${participant.joinId}/withdraw`,
        auth(participantUserId),
        {},
        200,
      );
      expect(withdrawn).toMatchObject({ status: 'withdrawn', refunded: true });

      // Let the stale finance request reach the real Venue after the revoke won.
      gate.releaseSettlement();
      await waitFor(
        () => financePrisma.matchContribution.findUniqueOrThrow({ where: { id: participant.contributionId } }),
        (contribution) => contribution.status === 'refunded',
      );
      await waitFor(
        () => financePrisma.matchFunding.findUniqueOrThrow({ where: { matchId: match.matchId } }),
        (funding) => funding.status === 'collecting',
      );
      await waitForQueuesToDrain();

      // A hand-published stale PaymentCompleted exercises the historical Venue
      // consumer path too: it is ignored, never a generic held -> confirmed.
      const { connection, channel } = await connectRabbitMQ(RABBITMQ_URL);
      try {
        publishEvent(
          channel,
          'PaymentCompleted',
          {
            refType: 'matchSettlement',
            matchId: match.matchId,
            bookingId: match.bookingId,
            attemptId: staleAttemptId,
            venueRevision: 0,
          },
          { messageId: randomUUID() },
        );
      } finally {
        await channel.close();
        await connection.close();
      }
      await waitForQueuesToDrain();
      expect(await venuePrisma.booking.findUniqueOrThrow({ where: { id: match.bookingId } })).toMatchObject({
        status: 'held',
      });
      expect(await matchmakingPrisma.match.findUniqueOrThrow({ where: { id: match.matchId } })).toMatchObject({
        status: 'open',
      });
      expect(
        await financePrisma.ledgerEntry.count({
          where: { refType: 'booking', refId: match.bookingId, type: 'settlement' },
        }),
      ).toBe(0);
    } finally {
      gate.releaseSettlement();
      await gate.stop();
      if (previousVenueUrl === undefined) delete process.env.VENUE_BOOKING_SERVICE_URL;
      else process.env.VENUE_BOOKING_SERVICE_URL = previousVenueUrl;
    }
  }, 30000);

  it('D39: organizer cancellation wins a pending settlement and atomically releases/refunds the held match', async () => {
    const organizerUserId = randomUUID();
    const participantUserId = randomUUID();
    userIds.push(organizerUserId, participantUserId);
    const match = await createSplitMatch(organizerUserId, 2);
    const participant = await approveAndPayParticipant(match.matchId, organizerUserId, participantUserId);
    const gate = await startSettlementGate();
    const previousVenueUrl = process.env.VENUE_BOOKING_SERVICE_URL;
    process.env.VENUE_BOOKING_SERVICE_URL = gate.baseUrl;
    try {
      await payOrganizerContribution(match.matchId, organizerUserId);
      await gate.waitUntilSettlementEntered();
      await waitFor(
        () => financePrisma.matchFunding.findUniqueOrThrow({ where: { matchId: match.matchId } }),
        (funding) => funding.status === 'settling',
      );
      await postJson(matchmakingBaseUrl, `/matches/${match.matchId}/cancel`, auth(organizerUserId), {}, 200);
      gate.releaseSettlement();
      await waitFor(
        () => financePrisma.matchFunding.findUniqueOrThrow({ where: { matchId: match.matchId } }),
        (funding) => funding.status === 'cancelled',
      );
      await waitForQueuesToDrain();
      expect(await venuePrisma.booking.findUniqueOrThrow({ where: { id: match.bookingId } })).toMatchObject({
        status: 'cancelled',
      });
      expect(await financePrisma.matchContribution.findMany({ where: { matchId: match.matchId } })).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: participant.contributionId, status: 'refunded' }),
          expect.objectContaining({ role: 'organizer', status: 'refunded' }),
        ]),
      );
      expect(
        await financePrisma.ledgerEntry.count({
          where: { refType: 'booking', refId: match.bookingId, type: 'settlement' },
        }),
      ).toBe(0);
    } finally {
      gate.releaseSettlement();
      await gate.stop();
      if (previousVenueUrl === undefined) delete process.env.VENUE_BOOKING_SERVICE_URL;
      else process.env.VENUE_BOOKING_SERVICE_URL = previousVenueUrl;
    }
  }, 30000);

  it('D39: a stale whole-match cancellation rebases after withdrawal won the same held revision', async () => {
    const organizerUserId = randomUUID();
    const participantUserId = randomUUID();
    userIds.push(organizerUserId, participantUserId);
    const match = await createSplitMatch(organizerUserId, 2);
    const participant = await approveAndPayParticipant(match.matchId, organizerUserId, participantUserId);
    const gate = await startSettlementGate({ holdAction: 'cancel', holdOnlyFirst: true });
    const raceServer = createMatchmakingApp({ venueBookingClient: new HttpVenueBookingClient(gate.baseUrl) }).listen(
      0,
      '127.0.0.1',
    );
    const raceBaseUrl = await listen(raceServer);
    try {
      const cancellation = postJson(raceBaseUrl, `/matches/${match.matchId}/cancel`, auth(organizerUserId), {}, 200);
      await gate.waitUntilSettlementEntered();

      const withdrawn = await postJson<{ status: string; refunded: boolean }>(
        matchmakingBaseUrl,
        `/matches/${match.matchId}/joins/${participant.joinId}/withdraw`,
        auth(participantUserId),
        {},
        200,
      );
      expect(withdrawn).toMatchObject({ status: 'withdrawn', refunded: true });

      // The first cancel is now stale. Its D39 retry uses the revision returned
      // by Venue and is the command that releases the still-held booking.
      gate.releaseSettlement();
      await cancellation;
      expect(gate.settlementCalls).toBeGreaterThanOrEqual(2);
      await waitFor(
        () => matchmakingPrisma.match.findUniqueOrThrow({ where: { id: match.matchId } }),
        (item) => item.status === 'cancelled',
      );
      await waitFor(
        () => venuePrisma.booking.findUniqueOrThrow({ where: { id: match.bookingId } }),
        (booking) => booking.status === 'cancelled',
      );
      await waitFor(
        () => financePrisma.matchContribution.findUniqueOrThrow({ where: { id: participant.contributionId } }),
        (contribution) => contribution.status === 'refunded',
      );
    } finally {
      gate.releaseSettlement();
      await Promise.allSettled([close(raceServer), gate.stop()]);
    }
  }, 30000);

  it('D39: venue confirmation wins first, so a later individual withdrawal receives no refund (D36)', async () => {
    const organizerUserId = randomUUID();
    const participantUserId = randomUUID();
    userIds.push(organizerUserId, participantUserId);
    const match = await createSplitMatch(organizerUserId, 2);
    const participant = await approveAndPayParticipant(match.matchId, organizerUserId, participantUserId);
    await payOrganizerContribution(match.matchId, organizerUserId);
    await waitFor(
      () => financePrisma.matchFunding.findUniqueOrThrow({ where: { matchId: match.matchId } }),
      (funding) => funding.status === 'settled',
    );
    await waitFor(
      () => venuePrisma.booking.findUniqueOrThrow({ where: { id: match.bookingId } }),
      (booking) => booking.status === 'confirmed',
    );
    const withdrawn = await postJson<{ status: string; refunded: boolean }>(
      matchmakingBaseUrl,
      `/matches/${match.matchId}/joins/${participant.joinId}/withdraw`,
      auth(participantUserId),
      {},
      200,
    );
    expect(withdrawn).toMatchObject({ status: 'withdrawn', refunded: false });
    await waitForQueuesToDrain();
    expect(
      await financePrisma.matchContribution.findUniqueOrThrow({ where: { id: participant.contributionId } }),
    ).toMatchObject({ status: 'settled' });
    expect(
      await financePrisma.wallet.findFirstOrThrow({
        where: { userId: participantUserId, walletType: 'personal' },
      }),
    ).toMatchObject({ available: 0n });
  }, 30000);

  it('D39/D33: confirmed-booking cancellation retries until contributor settlement is durable', async () => {
    const organizerUserId = randomUUID();
    const participantUserId = randomUUID();
    userIds.push(organizerUserId, participantUserId);
    const match = await createSplitMatch(organizerUserId, 2, MATCH_PRICE, 12);
    const participant = await approveAndPayParticipant(match.matchId, organizerUserId, participantUserId);
    const gate = await startSettlementGate();
    const previousVenueUrl = process.env.VENUE_BOOKING_SERVICE_URL;
    let resolutionBarrier: ReturnType<typeof pauseFinanceMatchBookingResolution> | undefined;
    process.env.VENUE_BOOKING_SERVICE_URL = gate.baseUrl;
    try {
      await payOrganizerContribution(match.matchId, organizerUserId);
      await gate.waitUntilSettlementEntered();
      await waitFor(
        () => financePrisma.matchFunding.findUniqueOrThrow({ where: { matchId: match.matchId } }),
        (funding) => funding.status === 'settling',
      );
      resolutionBarrier = pauseFinanceMatchBookingResolution(match.matchId);
      gate.releaseSettlement();
      await resolutionBarrier.waitUntilLocked();
      await waitFor(
        () => venuePrisma.booking.findUniqueOrThrow({ where: { id: match.bookingId } }),
        (booking) => booking.status === 'confirmed',
      );
      await waitFor(
        () => matchmakingPrisma.match.findUniqueOrThrow({ where: { id: match.matchId } }),
        (item) => item.status === 'confirmed',
      );

      await postJson(matchmakingBaseUrl, `/matches/${match.matchId}/cancel`, auth(organizerUserId), {}, 200);
      await waitFor(
        () => venuePrisma.outbox.findFirst({ where: { aggregateId: match.bookingId, eventType: 'BookingCancelled' } }),
        (event) => event?.publishedAt !== null,
      );
      expect(await financePrisma.matchFunding.findUniqueOrThrow({ where: { matchId: match.matchId } })).toMatchObject({
        status: 'settling',
      });
      expect(
        await financePrisma.matchContribution.findUniqueOrThrow({ where: { id: participant.contributionId } }),
      ).toMatchObject({ status: 'paid' });

      resolutionBarrier.release();
      await waitFor(
        () => financePrisma.matchFunding.findUniqueOrThrow({ where: { matchId: match.matchId } }),
        (funding) => funding.status === 'cancelled',
      );
      await waitFor(
        () => financePrisma.matchContribution.findUniqueOrThrow({ where: { id: participant.contributionId } }),
        (contribution) => contribution.status === 'refunded',
      );
      const organizerContribution = await financePrisma.matchContribution.findUniqueOrThrow({
        where: { contributionKey: `organizer:${match.matchId}` },
      });
      const contributorRefunds = await financePrisma.ledgerEntry.findMany({
        where: {
          type: 'refund',
          refType: 'matchFeeCancellation',
          refId: { in: [participant.contributionId, organizerContribution.id] },
        },
      });
      expect(contributorRefunds.map((entry) => entry.amount).sort()).toEqual([match.fee / 2n, match.fee / 2n]);
      const organizerWallet = await financePrisma.wallet.findFirstOrThrow({
        where: { userId: organizerUserId, walletType: 'personal' },
      });
      expect(
        await financePrisma.ledgerEntry.count({
          where: { walletId: organizerWallet.id, type: 'refund', refType: 'booking', refId: match.bookingId },
        }),
      ).toBe(0);
      await waitForQueuesToDrain();
    } finally {
      resolutionBarrier?.release();
      financeResolutionBarrier = undefined;
      gate.releaseSettlement();
      await gate.stop();
      if (previousVenueUrl === undefined) delete process.env.VENUE_BOOKING_SERVICE_URL;
      else process.env.VENUE_BOOKING_SERVICE_URL = previousVenueUrl;
    }
  }, 30000);

  it('AC-FIN-05-1: organizer cannot create a SePay intent before every participant has paid', async () => {
    const organizerUserId = randomUUID();
    userIds.push(organizerUserId);
    const match = await createSplitMatch(organizerUserId, 2);

    const response = await postJson<{ error: { code: string } }>(
      financeBaseUrl,
      `/matches/${match.matchId}/organizer-contribution/pay/sepay`,
      auth(organizerUserId),
      {},
      409,
    );

    expect(response.error.code).toBe('MATCH_NOT_FILLED');
    const organizerContribution = await financePrisma.matchContribution.findUniqueOrThrow({
      where: { contributionKey: `organizer:${match.matchId}` },
    });
    expect(
      await financePrisma.paymentIntent.count({
        where: { refType: 'matchFee', refId: organizerContribution.id },
      }),
    ).toBe(0);
  });

  it('AC-FIN-05-3: a valid organizer SePay intent received after cancellation credits the personal wallet once', async () => {
    const organizerUserId = randomUUID();
    const participantUserId = randomUUID();
    userIds.push(organizerUserId, participantUserId);
    const match = await createSplitMatch(organizerUserId, 2);
    await approveAndPayParticipant(match.matchId, organizerUserId, participantUserId);
    await waitFor(
      () => matchmakingPrisma.match.findUniqueOrThrow({ where: { id: match.matchId } }),
      (item) => item.status === 'filled',
    );
    const organizerContribution = await financePrisma.matchContribution.findUniqueOrThrow({
      where: { contributionKey: `organizer:${match.matchId}` },
    });
    financeAggregateIds.add(organizerContribution.id);
    const intent = await postJson<{ intentId: string; matchCode: string; amount: string }>(
      financeBaseUrl,
      `/matches/${match.matchId}/organizer-contribution/pay/sepay`,
      auth(organizerUserId),
      {},
      201,
    );
    expect(intent.amount).toBe(organizerContribution.amount.toString());
    const platformBeforeReceipt = await financePrisma.wallet.findFirstOrThrow({
      where: { userId: null, walletType: 'platform' },
    });
    let platformAfterCancellationReserved = platformBeforeReceipt.reserved;

    let releaseIntentLock!: () => void;
    const lockReleased = new Promise<void>((resolve) => {
      releaseIntentLock = resolve;
    });
    let intentLocked!: () => void;
    const intentLockReady = new Promise<void>((resolve) => {
      intentLocked = resolve;
    });
    const intentLock = financePrisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM payment_intents WHERE id = ${intent.intentId} FOR UPDATE`;
        intentLocked();
        await lockReleased;
      },
      { timeout: 30_000 },
    );
    await intentLockReady;

    const externalRef = randomUUID();
    sepayExternalRefs.push(externalRef);
    const webhook = postSepayWebhook(externalRef, organizerContribution.amount, intent.matchCode);
    try {
      // The webhook has already read the valid intent and is now blocked by the
      // row lock above before it can decide how to account for the transfer.
      await new Promise((resolve) => setTimeout(resolve, 100));
      await postJson(matchmakingBaseUrl, `/matches/${match.matchId}/cancel`, auth(organizerUserId), {}, 200);
      await waitFor(
        () => financePrisma.matchFunding.findUniqueOrThrow({ where: { matchId: match.matchId } }),
        (funding) => funding.status === 'cancelled',
      );
      platformAfterCancellationReserved = (
        await financePrisma.wallet.findFirstOrThrow({
          where: { id: platformBeforeReceipt.id },
        })
      ).reserved;
    } finally {
      releaseIntentLock();
      await intentLock;
    }

    await webhook;
    await postSepayWebhook(externalRef, organizerContribution.amount, intent.matchCode);

    expect(await financePrisma.paymentIntent.findUniqueOrThrow({ where: { id: intent.intentId } })).toMatchObject({
      status: 'failed',
    });
    expect(
      await financePrisma.matchContribution.findUniqueOrThrow({ where: { id: organizerContribution.id } }),
    ).toMatchObject({ status: 'pending' });
    expect(
      await financePrisma.wallet.findFirstOrThrow({
        where: { userId: organizerUserId, walletType: 'personal' },
      }),
    ).toMatchObject({ available: organizerContribution.amount });
    expect((await financePrisma.wallet.findFirstOrThrow({ where: { id: platformBeforeReceipt.id } })).reserved).toBe(
      platformAfterCancellationReserved,
    );
    expect(
      await financePrisma.ledgerEntry.count({
        where: { type: 'topup', refType: 'late_match_fee', refId: organizerContribution.id },
      }),
    ).toBe(1);
    expect(
      await financePrisma.ledgerEntry.count({
        where: { type: 'reserve', refType: 'matchFee', refId: organizerContribution.id },
      }),
    ).toBe(0);
    expect(await financePrisma.sepayEvent.count({ where: { externalRef } })).toBe(1);
  }, 30000);

  it('AC-FIN-05-3: a valid organizer SePay intent received after a pre-cutoff participant withdrawal credits the personal wallet once', async () => {
    const organizerUserId = randomUUID();
    const participantUserId = randomUUID();
    userIds.push(organizerUserId, participantUserId);
    const match = await createSplitMatch(organizerUserId, 2);
    const participant = await approveAndPayParticipant(match.matchId, organizerUserId, participantUserId);
    await waitFor(
      () => matchmakingPrisma.match.findUniqueOrThrow({ where: { id: match.matchId } }),
      (item) => item.status === 'filled',
    );
    const organizerContribution = await financePrisma.matchContribution.findUniqueOrThrow({
      where: { contributionKey: `organizer:${match.matchId}` },
    });
    financeAggregateIds.add(organizerContribution.id);
    const intent = await postJson<{ intentId: string; matchCode: string }>(
      financeBaseUrl,
      `/matches/${match.matchId}/organizer-contribution/pay/sepay`,
      auth(organizerUserId),
      {},
      201,
    );

    await postJson(
      matchmakingBaseUrl,
      `/matches/${match.matchId}/joins/${participant.joinId}/withdraw`,
      auth(participantUserId),
      {},
      200,
    );
    await waitFor(
      () => financePrisma.matchContribution.findUniqueOrThrow({ where: { id: participant.contributionId } }),
      (contribution) => contribution.status === 'refunded',
    );
    const platformAfterWithdrawal = await financePrisma.wallet.findFirstOrThrow({
      where: { userId: null, walletType: 'platform' },
    });

    const externalRef = randomUUID();
    sepayExternalRefs.push(externalRef);
    await postSepayWebhook(externalRef, organizerContribution.amount, intent.matchCode);
    await postSepayWebhook(externalRef, organizerContribution.amount, intent.matchCode);

    expect(
      await financePrisma.wallet.findFirstOrThrow({
        where: { userId: organizerUserId, walletType: 'personal' },
      }),
    ).toMatchObject({ available: organizerContribution.amount });
    const laterExternalRef = randomUUID();
    sepayExternalRefs.push(laterExternalRef);
    await postSepayWebhook(laterExternalRef, organizerContribution.amount, intent.matchCode);

    expect(await financePrisma.paymentIntent.findUniqueOrThrow({ where: { id: intent.intentId } })).toMatchObject({
      status: 'failed',
    });
    expect(
      await financePrisma.matchContribution.findUniqueOrThrow({ where: { id: organizerContribution.id } }),
    ).toMatchObject({ status: 'pending' });
    expect(
      await financePrisma.wallet.findFirstOrThrow({
        where: { userId: organizerUserId, walletType: 'personal' },
      }),
    ).toMatchObject({ available: organizerContribution.amount * 2n });
    expect((await financePrisma.wallet.findFirstOrThrow({ where: { id: platformAfterWithdrawal.id } })).reserved).toBe(
      platformAfterWithdrawal.reserved,
    );
    expect(
      await financePrisma.ledgerEntry.count({
        where: { type: 'topup', refType: 'late_match_fee', refId: organizerContribution.id },
      }),
    ).toBe(2);
    expect(
      await financePrisma.ledgerEntry.count({
        where: { type: 'reserve', refType: 'matchFee', refId: organizerContribution.id },
      }),
    ).toBe(0);
    expect(
      await financePrisma.sepayEvent.count({
        where: { externalRef: { in: [externalRef, laterExternalRef] }, status: 'matched_auto' },
      }),
    ).toBe(2);
  }, 30000);

  it('AC-FIN-05-3: concurrent distinct receipts for one match-fee intent reserve once and credit the terminal receipt', async () => {
    const organizerUserId = randomUUID();
    const participantUserId = randomUUID();
    userIds.push(organizerUserId, participantUserId);
    const match = await createSplitMatch(organizerUserId, 2);
    const join = await postJson<{ id: string }>(
      matchmakingBaseUrl,
      `/matches/${match.matchId}/joins`,
      auth(participantUserId),
      {},
      201,
    );
    matchAggregateIds.add(join.id);
    await postJson(
      matchmakingBaseUrl,
      `/matches/${match.matchId}/joins/${join.id}/approve`,
      auth(organizerUserId),
      {},
      200,
    );
    const contribution = await waitFor(
      () => financePrisma.matchContribution.findUnique({ where: { joinId: join.id } }),
      (item) => item !== null,
    );
    financeAggregateIds.add(contribution.id);
    const intent = await postJson<{ intentId: string; matchCode: string }>(
      financeBaseUrl,
      `/matches/${match.matchId}/joins/${join.id}/pay/sepay`,
      auth(participantUserId),
      {},
      201,
    );
    const platformBefore = await financePrisma.wallet.findFirstOrThrow({
      where: { userId: null, walletType: 'platform' },
    });

    let releaseIntentLock!: () => void;
    const lockReleased = new Promise<void>((resolve) => {
      releaseIntentLock = resolve;
    });
    let intentLocked!: () => void;
    const intentLockReady = new Promise<void>((resolve) => {
      intentLocked = resolve;
    });
    const intentLock = financePrisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM payment_intents WHERE id = ${intent.intentId} FOR UPDATE`;
        intentLocked();
        await lockReleased;
      },
      { timeout: 30_000 },
    );
    await intentLockReady;

    const firstExternalRef = randomUUID();
    const secondExternalRef = randomUUID();
    sepayExternalRefs.push(firstExternalRef, secondExternalRef);
    const receipts = Promise.all([
      postSepayWebhook(firstExternalRef, contribution.amount, intent.matchCode),
      postSepayWebhook(secondExternalRef, contribution.amount, intent.matchCode),
    ]);
    try {
      await new Promise((resolve) => setTimeout(resolve, 100));
    } finally {
      releaseIntentLock();
      await intentLock;
    }
    await receipts;

    expect(await financePrisma.paymentIntent.findUniqueOrThrow({ where: { id: intent.intentId } })).toMatchObject({
      status: 'completed',
    });
    expect(await financePrisma.matchContribution.findUniqueOrThrow({ where: { id: contribution.id } })).toMatchObject({
      status: 'paid',
    });
    expect((await financePrisma.wallet.findFirstOrThrow({ where: { id: platformBefore.id } })).reserved).toBe(
      platformBefore.reserved + contribution.amount,
    );
    expect(
      await financePrisma.wallet.findFirstOrThrow({
        where: { userId: participantUserId, walletType: 'personal' },
      }),
    ).toMatchObject({ available: contribution.amount });
    expect(
      await financePrisma.ledgerEntry.count({
        where: { type: 'reserve', refType: 'matchFee', refId: contribution.id },
      }),
    ).toBe(1);
    expect(
      await financePrisma.ledgerEntry.count({
        where: { type: 'topup', refType: 'late_match_fee', refId: contribution.id },
      }),
    ).toBe(1);
    expect(
      await financePrisma.sepayEvent.count({
        where: { externalRef: { in: [firstExternalRef, secondExternalRef] }, status: 'matched_auto' },
      }),
    ).toBe(2);
    expect(
      await financePrisma.sepayEvent.count({
        where: { externalRef: { in: [firstExternalRef, secondExternalRef] }, status: 'unmatched' },
      }),
    ).toBe(0);
  }, 30000);

  it('AC-FIN-05-6: a free match confirms through the normal organizer booking payment without MatchFunding', async () => {
    const organizerUserId = randomUUID();
    const participantUserId = randomUUID();
    userIds.push(organizerUserId, participantUserId);
    const { booking } = await createHeldBooking(organizerUserId);
    const created = await postJson<{ id: string; feePerSlot: string }>(
      matchmakingBaseUrl,
      '/matches',
      auth(organizerUserId),
      { bookingId: booking.id, capacity: 2, feeMode: 'free' },
      201,
    );
    matchIds.push(created.id);
    matchAggregateIds.add(created.id);
    financeAggregateIds.add(created.id);
    expect(created.feePerSlot).toBe('0');
    const join = await postJson<{ id: string }>(
      matchmakingBaseUrl,
      `/matches/${created.id}/joins`,
      auth(participantUserId),
      {},
      201,
    );
    matchAggregateIds.add(join.id);
    await postJson(
      matchmakingBaseUrl,
      `/matches/${created.id}/joins/${join.id}/approve`,
      auth(organizerUserId),
      {},
      200,
    );
    await waitFor(
      () => matchmakingPrisma.match.findUniqueOrThrow({ where: { id: created.id } }),
      (match) => match.status === 'filled',
    );
    await seedPersonalBalance(organizerUserId, MATCH_PRICE);
    financeAggregateIds.add(booking.id);
    await postJson(financeBaseUrl, `/bookings/${booking.id}/pay/balance`, auth(organizerUserId), {}, 200);
    await waitFor(
      () => venuePrisma.booking.findUniqueOrThrow({ where: { id: booking.id } }),
      (updatedBooking) => updatedBooking.status === 'confirmed',
    );
    await waitFor(
      () => matchmakingPrisma.match.findUniqueOrThrow({ where: { id: created.id } }),
      (match) => match.status === 'confirmed',
    );
    expect(await financePrisma.matchFunding.findUnique({ where: { matchId: created.id } })).toBeNull();
    expect(await financePrisma.matchContribution.count({ where: { matchId: created.id } })).toBe(0);
    expect(await financePrisma.ledgerEntry.count({ where: { refType: 'matchFee', refId: created.id } })).toBe(0);
  });
});
