import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { createServer, type Server } from 'node:http';
import jwt from 'jsonwebtoken';
import { S3Client } from '@aws-sdk/client-s3';
import { S3ObjectStorageClient } from '@khoaluantn/object-storage';
import { connectRabbitMQ, startOutboxRelay } from '@khoaluantn/eventbus';
import { createApp as createFinanceApp } from '../src/app.js';
import { prisma as financePrisma } from '../src/lib/prisma.js';
import { bootstrapEventConsumption as bootstrapFinanceConsumer } from '../src/lib/eventConsumer.js';
import { createApp as createMatchmakingApp } from '../../matchmaking-service/src/app.js';
import { prisma as matchmakingPrisma } from '../../matchmaking-service/src/lib/prisma.js';
import { HttpVenueBookingClient } from '../../matchmaking-service/src/clients/venueBooking.js';
import type { AccountClient } from '../../matchmaking-service/src/clients/account.js';
import { bootstrapMatchLifecycleEventConsumption } from '../../matchmaking-service/src/lib/matchLifecycleEventConsumer.js';
import { cancelMatchesAtCutoff } from '../../matchmaking-service/src/domain/matchLifecycle.js';
import { createApp as createVenueApp } from '../../venue-booking-service/src/app.js';
import { prisma as venuePrisma } from '../../venue-booking-service/src/lib/prisma.js';
import { bootstrapEventConsumption as bootstrapVenueConsumer } from '../../venue-booking-service/src/lib/eventConsumer.js';
import { completeEndedBookings } from '../../venue-booking-service/src/domain/booking.js';
import { seedPersonalBalance, waitFor } from './helpers.js';
import { purgeResultCases } from '../../matchmaking-service/test/resultTestUtils.js';

/**
 * Kèo cạnh tranh v2 qua HTTP, RabbitMQ và outbox thật: hold -> cọc chủ kèo -> JOIN theo đội ->
 * chốt tiền ở cutoff -> booking hoàn tất -> khai/chốt kết quả -> Finance nhả result reserve.
 */
const runP2FinanceE2E = process.env.RUN_P2_FIN_E2E === '1';
const describeP2FinanceE2E = runP2FinanceE2E ? describe : describe.skip;
const RABBITMQ_URL = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
const CHECKSUM = Buffer.alloc(32, 3).toString('base64');
const HOUR = 60 * 60_000;

type StopFn = () => Promise<void>;

let financeServer: Server | undefined;
let matchmakingServer: Server | undefined;
let venueServer: Server | undefined;
let financeBaseUrl = '';
let matchmakingBaseUrl = '';
const stops: StopFn[] = [];
const originalVenueBookingServiceUrl = process.env.VENUE_BOOKING_SERVICE_URL;
const originalInternalServiceToken = process.env.INTERNAL_SERVICE_TOKEN;

const matchAggregateIds = new Set<string>();
const financeAggregateIds = new Set<string>();
const venueAggregateIds = new Set<string>();
const matchIds: string[] = [];
const bookingIds: string[] = [];
const venueIds: string[] = [];
const providerIds: string[] = [];
const userIds: string[] = [];
let platformBefore: { id: string; available: bigint; pending: bigint; reserved: bigint } | null = null;
const queueNames = {
  finance: `v2-finance-${randomUUID()}`,
  matchmaking: `v2-matchmaking-${randomUUID()}`,
  venue: `v2-venue-${randomUUID()}`,
};

const s3 = new S3Client({
  endpoint: 'http://127.0.0.1:9', region: 'us-east-1', forcePathStyle: true,
  credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
});
vi.spyOn(s3, 'send').mockResolvedValue({ ContentType: 'image/png', ContentLength: 2_000, ChecksumSHA256: CHECKSUM } as never);
const resultStorage = new S3ObjectStorageClient({ bucket: 'private-test', s3, privateBucket: true });
const accountClient: AccountClient = {
  getPublicMatchProfile: async (userId: string) => ({ userId, displayName: `P-${userId.slice(0, 4)}`, avatarUrl: null, identityVisibility: 'public' as const }),
};

function auth(userId: string, roles = ['player']) {
  return `Bearer ${jwt.sign({ sub: userId, roles, type: 'access' }, process.env.JWT_SECRET ?? 'change-me-in-real-env', { expiresIn: 300 })}`;
}

async function listen(server: Server): Promise<string> {
  if (!server.listening) await new Promise<void>((resolve) => server.once('listening', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function close(server: Server | undefined): Promise<void> {
  if (!server?.listening) return;
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

async function startScopedRelay(client: Pick<typeof financePrisma, 'outbox'>, aggregateIds: Set<string>): Promise<StopFn> {
  const { connection, channel } = await connectRabbitMQ(RABBITMQ_URL);
  const stop = startOutboxRelay({
    channel, intervalMs: 20, batchSize: 50,
    fetchUnpublished: async (limit) => {
      const ids = [...aggregateIds];
      if (ids.length === 0) return [];
      return client.outbox.findMany({ where: { publishedAt: null, aggregateId: { in: ids } }, orderBy: { createdAt: 'asc' }, take: limit });
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

async function send<T>(baseUrl: string, path: string, authorization: string, body: unknown, expectedStatus: number): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST', headers: { authorization, 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const text = await response.text();
  expect(response.status, text).toBe(expectedStatus);
  return (text ? JSON.parse(text) : {}) as T;
}

/** Slot 10:00 giờ Việt Nam sau 48 giờ (BR-CM-02 cần ≥24 giờ), bảng giá đúng giờ đó. */
async function createHold(organizerUserId: string, price: bigint) {
  const providerUserId = randomUUID();
  userIds.push(providerUserId);
  const provider = await venuePrisma.provider.create({ data: { userId: providerUserId, orgName: `V2 ${randomUUID()}`, status: 'approved' } });
  providerIds.push(provider.id);
  const venue = await venuePrisma.venue.create({
    data: { providerId: provider.id, name: 'Sân V2', address: 'Q1', lat: 10.77, lng: 106.7, provinceCode: 'ho-chi-minh' },
  });
  venueIds.push(venue.id);
  const court = await venuePrisma.court.create({ data: { venueId: venue.id, name: `Court ${randomUUID()}` } });
  const startAt = new Date(Date.now() + 48 * HOUR);
  startAt.setUTCHours(3, 0, 0, 0);
  const local = new Date(startAt.getTime() + 7 * HOUR);
  await venuePrisma.pricingRule.create({
    data: {
      courtId: court.id, weekday: local.getUTCDay(), startMinute: local.getUTCHours() * 60,
      endMinute: local.getUTCHours() * 60 + 60, price, effectiveFrom: new Date(startAt.getTime() - 60_000),
    },
  });
  const hold = await venuePrisma.hold.create({
    data: { courtId: court.id, userId: organizerUserId, startAt, endAt: new Date(startAt.getTime() + HOUR), expiresAt: new Date(Date.now() + 10 * 60_000) },
  });
  return { hold, providerUserId };
}

/** Kèo xếp hạng cần Passport của loại hình; DB local dùng chung có thể đang có kỳ xếp hạng (như production) nên cần cả khu vực kỳ. */
async function ensureRankedReady(userId: string) {
  await matchmakingPrisma.passport.createMany({
    data: (['singles', 'doubles'] as const).map((discipline) => ({
      userId, discipline, declaredTier: 'intermediate' as const, ratingMu: 1500, ratingRd: 350, ratingSigma: 0.06, declaredAt: new Date(),
    })),
  });
  const season = await matchmakingPrisma.season.findFirst({ where: { closedAt: null, startAt: { lte: new Date() }, endAt: { gt: new Date() } } });
  if (season) await matchmakingPrisma.playerSeasonProfile.create({ data: { seasonId: season.id, userId, provinceCode: 'ho-chi-minh', lockedAt: new Date() } });
}

async function createMatch(options: { discipline: 'singles' | 'doubles'; ratio: '5:5' | '6:4' | '7:3'; price: bigint; mode?: 'friendly' | 'ranked' }) {
  const organizerUserId = randomUUID();
  userIds.push(organizerUserId);
  await ensureRankedReady(organizerUserId);
  const { hold, providerUserId } = await createHold(organizerUserId, options.price);
  const created = await send<{ id: string; bookingId: string }>(matchmakingBaseUrl, '/matches', auth(organizerUserId), {
    holdId: hold.id, mode: options.mode ?? 'ranked', discipline: options.discipline, ratio: options.ratio, format: 'bo3',
  }, 201);
  matchIds.push(created.id);
  bookingIds.push(created.bookingId);
  matchAggregateIds.add(created.id);
  financeAggregateIds.add(created.id);
  venueAggregateIds.add(created.bookingId);
  const organizerContribution = await waitFor(
    () => financePrisma.matchContribution.findUnique({ where: { contributionKey: `organizer:${created.id}` } }),
    (item) => item !== null,
  );
  financeAggregateIds.add(organizerContribution.id);
  await seedPersonalBalance(organizerUserId, organizerContribution.amount);
  await send(financeBaseUrl, `/matches/${created.id}/organizer-contribution/pay/balance`, auth(organizerUserId), {}, 200);
  await waitFor(() => matchmakingPrisma.match.findUniqueOrThrow({ where: { id: created.id } }), (match) => match.status === 'open');
  return { matchId: created.id, bookingId: created.bookingId, organizerUserId, providerUserId, organizerPaid: organizerContribution.amount };
}

async function joinAndPay(matchId: string, _organizerUserId: string, teamSide: 'A' | 'B') {
  const participantUserId = randomUUID();
  userIds.push(participantUserId);
  await ensureRankedReady(participantUserId);
  const join = await send<{ id: string }>(matchmakingBaseUrl, `/matches/${matchId}/joins`, auth(participantUserId), { teamSide }, 201);
  matchAggregateIds.add(join.id);
  // Kèo v2 duyệt JOIN tự động khi còn chỗ ở đội đã chọn.
  const contribution = await waitFor(() => financePrisma.matchContribution.findUnique({ where: { joinId: join.id } }), (item) => item !== null);
  financeAggregateIds.add(contribution.id);
  await seedPersonalBalance(participantUserId, contribution.amount);
  await send(financeBaseUrl, `/matches/${matchId}/joins/${join.id}/pay/balance`, auth(participantUserId), {}, 200);
  await waitFor(() => matchmakingPrisma.join.findUniqueOrThrow({ where: { id: join.id } }), (item) => item.status === 'confirmed');
  return { userId: participantUserId, joinId: join.id, contributionId: contribution.id, amount: contribution.amount };
}

/** Cutoff chốt tiền (Venue settle), rồi đẩy booking về quá khứ để Venue hoàn tất và mở hồ sơ kết quả. */
async function settleAndComplete(match: { matchId: string; bookingId: string }) {
  await matchmakingPrisma.match.update({ where: { id: match.matchId }, data: { cutoffAt: new Date(Date.now() - 1_000) } });
  await cancelMatchesAtCutoff();
  await waitFor(() => financePrisma.matchFunding.findUniqueOrThrow({ where: { matchId: match.matchId } }), (funding) => funding.status === 'settled');
  await waitFor(() => matchmakingPrisma.match.findUniqueOrThrow({ where: { id: match.matchId } }), (item) => item.status === 'confirmed');
  const revenue = await waitFor(() => financePrisma.bookingRevenue.findUnique({ where: { bookingId: match.bookingId } }), (item) => item !== null);
  const endAt = new Date(Date.now() - 1_000);
  await venuePrisma.booking.update({ where: { id: match.bookingId }, data: { startAt: new Date(endAt.getTime() - HOUR), endAt } });
  await matchmakingPrisma.match.update({ where: { id: match.matchId }, data: { startAt: new Date(endAt.getTime() - HOUR), endAt } });
  expect(await completeEndedBookings()).toBeGreaterThanOrEqual(1);
  await waitFor(() => matchmakingPrisma.matchResultCase.findUnique({ where: { matchId: match.matchId } }), (item) => item?.status === 'declaration_open');
  return revenue;
}

const evidence = (userId: string) => [{ objectKey: `match/results/${userId}/${randomUUID()}.png`, mimeType: 'image/png' }];
const withdrawable = async (userId: string) => (await financePrisma.wallet.findFirst({ where: { userId, walletType: 'personal' } }))?.withdrawable ?? 0n;
const released = (matchId: string) => waitFor(
  () => financePrisma.matchFunding.findUniqueOrThrow({ where: { matchId } }),
  (funding) => funding.resultFinalizedAt !== null,
);

async function assetTotal(scopedUserIds: string[]): Promise<bigint> {
  const wallets = await financePrisma.wallet.findMany({ where: { OR: [{ userId: { in: scopedUserIds } }, { userId: null, walletType: 'platform' }] } });
  return wallets.reduce((sum, wallet) => sum + wallet.available + wallet.pending + wallet.reserved, 0n);
}

describeP2FinanceE2E('Competitive matches v2 — real HTTP, RabbitMQ and outbox money flow', () => {
  beforeAll(async () => {
    process.env.INTERNAL_SERVICE_TOKEN = 'v2-e2e-internal-service-token';
    platformBefore = await financePrisma.wallet.findFirst({
      where: { userId: null, walletType: 'platform' }, select: { id: true, available: true, pending: true, reserved: true },
    });
    venueServer = createVenueApp().listen(0, '127.0.0.1');
    const venueBaseUrl = await listen(venueServer);
    process.env.VENUE_BOOKING_SERVICE_URL = venueBaseUrl;
    financeServer = createFinanceApp().listen(0, '127.0.0.1');
    financeBaseUrl = await listen(financeServer);
    matchmakingServer = createMatchmakingApp({
      venueBookingClient: new HttpVenueBookingClient(venueBaseUrl), accountClient, resultStorage,
    }).listen(0, '127.0.0.1');
    matchmakingBaseUrl = await listen(matchmakingServer);
    stops.push(
      await bootstrapFinanceConsumer({ queueName: queueNames.finance, deleteQueueOnStop: true }),
      await bootstrapVenueConsumer({ queueName: queueNames.venue, deleteQueueOnStop: true }),
      await bootstrapMatchLifecycleEventConsumption(new HttpVenueBookingClient(venueBaseUrl), { queueName: queueNames.matchmaking, deleteQueueOnStop: true }),
      await startScopedRelay(matchmakingPrisma, matchAggregateIds),
      await startScopedRelay(financePrisma, financeAggregateIds),
      await startScopedRelay(venuePrisma, venueAggregateIds),
    );
  }, 30000);

  afterAll(async () => {
    await Promise.allSettled(stops.map((stop) => stop()));
    await Promise.allSettled([close(financeServer), close(matchmakingServer), close(venueServer)]);
    const outboxIds = async (client: Pick<typeof financePrisma, 'outbox'>, ids: Set<string>) => (await client.outbox.findMany({
      where: { aggregateId: { in: [...ids] } }, select: { id: true, eventType: true },
    })).map((row) => `${row.eventType}:${row.id}`);
    const processedIds = [
      ...await outboxIds(matchmakingPrisma, matchAggregateIds), ...await outboxIds(financePrisma, financeAggregateIds), ...await outboxIds(venuePrisma, venueAggregateIds),
    ];
    await Promise.all([
      matchmakingPrisma.processedEvent.deleteMany({ where: { eventId: { in: processedIds } } }),
      financePrisma.processedEvent.deleteMany({ where: { eventId: { in: processedIds } } }),
      venuePrisma.processedEvent.deleteMany({ where: { eventId: { in: processedIds } } }),
    ]);
    const contributions = (await financePrisma.matchContribution.findMany({ where: { matchId: { in: matchIds } }, select: { id: true } })).map((row) => row.id);
    const scopedWallets = (await financePrisma.wallet.findMany({ where: { userId: { in: userIds } }, select: { id: true } })).map((row) => row.id);
    const platformAfter = await financePrisma.wallet.findFirst({ where: { userId: null, walletType: 'platform' } });
    if (platformBefore) {
      await financePrisma.wallet.update({
        where: { id: platformBefore.id },
        data: { available: platformBefore.available, pending: platformBefore.pending, reserved: platformBefore.reserved },
      });
    }
    const resultCases = await matchmakingPrisma.matchResultCase.findMany({ where: { matchId: { in: matchIds } }, include: { adminDecision: true } });
    const decisionIds = resultCases.flatMap((row) => [row.id, row.adminDecision?.id].filter((id): id is string => Boolean(id)));
    await financePrisma.ledgerEntry.deleteMany({
      where: {
        OR: [
          { refId: { in: [...bookingIds, ...matchIds, ...contributions] } }, { walletId: { in: scopedWallets } },
          ...decisionIds.map((id) => ({ refId: { startsWith: id } })),
        ],
      },
    });
    await financePrisma.paymentIntent.deleteMany({ where: { refId: { in: contributions } } });
    await financePrisma.outbox.deleteMany({ where: { aggregateId: { in: [...financeAggregateIds] } } });
    await financePrisma.bookingRevenue.deleteMany({ where: { bookingId: { in: bookingIds } } });
    await financePrisma.matchContribution.deleteMany({ where: { matchId: { in: matchIds } } });
    await financePrisma.matchFunding.deleteMany({ where: { matchId: { in: matchIds } } });
    await financePrisma.wallet.deleteMany({ where: { userId: { in: userIds } } });
    if (!platformBefore && platformAfter) await financePrisma.wallet.delete({ where: { id: platformAfter.id } });
    const caseIds = await purgeResultCases(matchIds, matchmakingPrisma);
    await matchmakingPrisma.outbox.deleteMany({
      where: { OR: [{ aggregateId: { in: [...matchAggregateIds] } }, ...caseIds.map((id) => ({ aggregateId: { contains: id } }))] },
    });
    await matchmakingPrisma.matchResolution.deleteMany({ where: { matchId: { in: matchIds } } });
    await matchmakingPrisma.matchRatingChange.deleteMany({ where: { userId: { in: userIds } } });
    await matchmakingPrisma.ratedEncounter.deleteMany({ where: { userId: { in: userIds } } });
    await matchmakingPrisma.playerBadge.deleteMany({ where: { userId: { in: userIds } } });
    await matchmakingPrisma.seasonStat.deleteMany({ where: { userId: { in: userIds } } });
    await matchmakingPrisma.playerSeasonProfile.deleteMany({ where: { userId: { in: userIds } } });
    await matchmakingPrisma.passport.deleteMany({ where: { userId: { in: userIds } } });
    await matchmakingPrisma.join.deleteMany({ where: { matchId: { in: matchIds } } });
    await matchmakingPrisma.match.deleteMany({ where: { id: { in: matchIds } } });
    await venuePrisma.outbox.deleteMany({ where: { aggregateId: { in: [...venueAggregateIds] } } });
    await venuePrisma.matchBookingCommand.deleteMany({ where: { bookingId: { in: bookingIds } } });
    await venuePrisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
    await venuePrisma.hold.deleteMany({ where: { court: { venueId: { in: venueIds } } } });
    await venuePrisma.pricingRule.deleteMany({ where: { court: { venueId: { in: venueIds } } } });
    await venuePrisma.court.deleteMany({ where: { venueId: { in: venueIds } } });
    await venuePrisma.venue.deleteMany({ where: { id: { in: venueIds } } });
    await venuePrisma.provider.deleteMany({ where: { id: { in: providerIds } } });
    if (originalVenueBookingServiceUrl === undefined) delete process.env.VENUE_BOOKING_SERVICE_URL;
    else process.env.VENUE_BOOKING_SERVICE_URL = originalVenueBookingServiceUrl;
    if (originalInternalServiceToken === undefined) delete process.env.INTERNAL_SERVICE_TOKEN;
    else process.env.INTERNAL_SERVICE_TOKEN = originalInternalServiceToken;
    await Promise.all([financePrisma.$disconnect(), matchmakingPrisma.$disconnect(), venuePrisma.$disconnect()]);
  }, 30000);

  it('hold 6:4 doubles: undisputed result releases the reserve to the winners as withdrawable and leaves BookingRevenue untouched', async () => {
    const match = await createMatch({ discipline: 'doubles', ratio: '6:4', price: 200_000n });
    const partner = await joinAndPay(match.matchId, match.organizerUserId, 'A');
    const [b1, b2] = [await joinAndPay(match.matchId, match.organizerUserId, 'B'), await joinAndPay(match.matchId, match.organizerUserId, 'B')];
    await waitFor(() => matchmakingPrisma.match.findUniqueOrThrow({ where: { id: match.matchId } }), (item) => item.status === 'filled');
    const funding = await financePrisma.matchFunding.findUniqueOrThrow({ where: { matchId: match.matchId }, include: { contributions: true } });
    expect(funding).toMatchObject({ resultReserve: 40_000n, totalContribution: 240_000n });
    expect(funding.contributions.reduce((sum, item) => sum + item.amount, 0n)).toBe(240_000n);

    const revenue = await settleAndComplete(match);
    expect(revenue.gross).toBe(200_000n);
    expect(await financePrisma.matchFunding.findUniqueOrThrow({ where: { matchId: match.matchId } })).toMatchObject({ resultReserveStatus: 'locked' });

    await send(matchmakingBaseUrl, `/matches/${match.matchId}/result-claims`, auth(match.organizerUserId), {
      sets: [{ teamA: 21, teamB: 15 }, { teamA: 21, teamB: 18 }], evidence: evidence(match.organizerUserId),
    }, 201);
    const before = await Promise.all([match.organizerUserId, partner.userId, b1.userId, b2.userId].map(withdrawable));
    await send(matchmakingBaseUrl, `/matches/${match.matchId}/result-responses/confirm`, auth(b1.userId), {}, 200);
    await send(matchmakingBaseUrl, `/matches/${match.matchId}/result-responses/confirm`, auth(b2.userId), {}, 200);

    await released(match.matchId);
    expect(await financePrisma.matchFunding.findUniqueOrThrow({ where: { matchId: match.matchId } })).toMatchObject({ resultReserveStatus: 'released' });
    const after = await Promise.all([match.organizerUserId, partner.userId, b1.userId, b2.userId].map(withdrawable));
    expect(after.map((value, index) => value - before[index]!)).toEqual([20_000n, 20_000n, 0n, 0n]);
    expect(await financePrisma.bookingRevenue.findUniqueOrThrow({ where: { bookingId: match.bookingId } })).toEqual(revenue);
  }, 60000);

  it('singles 7:3 dispute: provider recommendation is non-binding and only the Admin decision releases money', async () => {
    const match = await createMatch({ discipline: 'singles', ratio: '7:3', price: 200_000n });
    const opponent = await joinAndPay(match.matchId, match.organizerUserId, 'B');
    const revenue = await settleAndComplete(match);

    await send(matchmakingBaseUrl, `/matches/${match.matchId}/result-claims`, auth(match.organizerUserId), {
      sets: [{ teamA: 21, teamB: 3 }, { teamA: 21, teamB: 4 }], evidence: evidence(match.organizerUserId),
    }, 201);
    await send(matchmakingBaseUrl, `/matches/${match.matchId}/result-responses/object`, auth(opponent.userId), {
      reason: 'Tôi thắng', evidence: evidence(opponent.userId),
    }, 201);
    await send(matchmakingBaseUrl, `/matches/${match.matchId}/provider-recommendation`, auth(match.providerUserId, ['provider']), {
      outcome: 'TEAM_A_WIN', reason: 'Theo camera',
    }, 201);
    expect(await financePrisma.matchFunding.findUniqueOrThrow({ where: { matchId: match.matchId } })).toMatchObject({
      resultReserveStatus: 'locked', resultFinalizedAt: null,
    });

    const adminUserId = randomUUID();
    const { preview } = await send<{ preview: { caseVersion: number; previewToken: string; rows: Array<{ userId: string; amount: string }> } }>(
      matchmakingBaseUrl, `/matches/${match.matchId}/admin-decision/preview`, auth(adminUserId, ['admin']), { outcome: 'TEAM_B_WIN', reason: 'Bằng chứng B' }, 200,
    );
    expect(preview.rows.find((row) => row.userId === opponent.userId)?.amount).toBe('80000');
    const before = await withdrawable(opponent.userId);
    await send(matchmakingBaseUrl, `/matches/${match.matchId}/admin-decision`, auth(adminUserId, ['admin']), {
      outcome: 'TEAM_B_WIN', reason: 'Bằng chứng B', caseVersion: preview.caseVersion, previewToken: preview.previewToken, confirm: true,
    }, 201);

    await released(match.matchId);
    expect(await withdrawable(opponent.userId)).toBe(before + 80_000n);
    expect(await financePrisma.bookingRevenue.findUniqueOrThrow({ where: { bookingId: match.bookingId } })).toEqual(revenue);
  }, 60000);

  it('refunds a pre-cutoff withdrawal and every contribution of an underfilled match at cutoff, conserving value', async () => {
    const withdrawn = await createMatch({ discipline: 'singles', ratio: '5:5', price: 200_000n, mode: 'friendly' });
    const leaver = await joinAndPay(withdrawn.matchId, withdrawn.organizerUserId, 'B');
    await send(matchmakingBaseUrl, `/matches/${withdrawn.matchId}/joins/${leaver.joinId}/withdraw`, auth(leaver.userId), {}, 200);
    await waitFor(() => financePrisma.matchContribution.findUniqueOrThrow({ where: { id: leaver.contributionId } }), (item) => item.status === 'refunded');
    expect(await withdrawable(leaver.userId)).toBe(leaver.amount);

    const underfilled = await createMatch({ discipline: 'doubles', ratio: '6:4', price: 200_000n });
    const lone = await joinAndPay(underfilled.matchId, underfilled.organizerUserId, 'B');
    await matchmakingPrisma.match.update({ where: { id: underfilled.matchId }, data: { cutoffAt: new Date(Date.now() - 1_000) } });
    await cancelMatchesAtCutoff();
    await waitFor(() => financePrisma.matchFunding.findUniqueOrThrow({ where: { matchId: underfilled.matchId } }), (item) => item.status === 'cancelled');
    await waitFor(() => financePrisma.matchContribution.findUniqueOrThrow({ where: { id: lone.contributionId } }), (item) => item.status === 'refunded');
    await waitFor(() => venuePrisma.booking.findUniqueOrThrow({ where: { id: underfilled.bookingId } }), (item) => item.status === 'cancelled');
    expect(await withdrawable(lone.userId)).toBe(lone.amount);
    expect(await withdrawable(underfilled.organizerUserId)).toBe(underfilled.organizerPaid);

    const seeded = withdrawn.organizerPaid + leaver.amount + underfilled.organizerPaid + lone.amount;
    const scoped = [withdrawn.organizerUserId, leaver.userId, underfilled.organizerUserId, lone.userId];
    const platform = await financePrisma.wallet.findFirstOrThrow({ where: { userId: null, walletType: 'platform' } });
    const scopedPersonal = (await assetTotal(scoped)) - (platform.available + platform.pending + platform.reserved);
    // Kèo 1 còn mở giữ cọc chủ kèo ở platform.reserved; mọi khoản khác đã về ví cá nhân.
    expect(scopedPersonal + withdrawn.organizerPaid).toBe(seeded);
  }, 60000);

  it('D39 v2: a withdrawal persisted before cutoff races the cutoff settlement; Venue fencing picks one and money is conserved', async () => {
    const match = await createMatch({ discipline: 'singles', ratio: '6:4', price: 200_000n });
    const participant = await joinAndPay(match.matchId, match.organizerUserId, 'B');
    await waitFor(() => matchmakingPrisma.match.findUniqueOrThrow({ where: { id: match.matchId } }), (item) => item.status === 'filled');

    // Cổng giữ lệnh Venue theo action: cả rút (Matchmaking) lẫn chốt (Finance) đều bị giữ để test chọn thứ tự.
    const held = new Map<string, () => void>();
    const entered = new Map<string, () => void>();
    const enteredPromises = new Map(['withdraw', 'settle'].map((action) => [action, new Promise<void>((resolve) => entered.set(action, resolve))]));
    const releases = new Map(['withdraw', 'settle'].map((action) => [action, new Promise<void>((resolve) => held.set(action, resolve))]));
    const venueUrl = process.env.VENUE_BOOKING_SERVICE_URL!;
    const gate = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      if (req.method === 'POST' && req.url?.includes('/match-resolution') && body) {
        const action = (JSON.parse(body.toString()) as { action?: string }).action ?? '';
        if (releases.has(action)) {
          entered.get(action)!();
          await releases.get(action);
        }
      }
      const headers: Record<string, string> = {};
      for (const name of ['content-type', 'x-internal-service-token', 'authorization']) {
        const value = req.headers[name];
        if (typeof value === 'string') headers[name] = value;
      }
      const upstream = await fetch(`${venueUrl}${req.url ?? ''}`, { method: req.method, headers, body: body && req.method !== 'GET' ? body : undefined });
      res.statusCode = upstream.status;
      res.setHeader('content-type', upstream.headers.get('content-type') ?? 'application/json');
      res.end(Buffer.from(await upstream.arrayBuffer()));
    }).listen(0, '127.0.0.1');
    const gateUrl = await listen(gate);
    const gatedMatchmaking = createMatchmakingApp({ venueBookingClient: new HttpVenueBookingClient(gateUrl), accountClient, resultStorage }).listen(0, '127.0.0.1');
    const gatedMatchmakingUrl = await listen(gatedMatchmaking);
    process.env.VENUE_BOOKING_SERVICE_URL = gateUrl;
    try {
      const withdrawal = fetch(`${gatedMatchmakingUrl}/matches/${match.matchId}/joins/${participant.joinId}/withdraw`, {
        method: 'POST', headers: { authorization: auth(participant.userId), 'content-type': 'application/json' }, body: '{}',
      });
      await enteredPromises.get('withdraw');
      // Lệnh rút đã ghi bền trước hạn; giờ mới qua cutoff và scheduler yêu cầu chốt tiền.
      await matchmakingPrisma.match.update({ where: { id: match.matchId }, data: { cutoffAt: new Date() } });
      await cancelMatchesAtCutoff();
      await enteredPromises.get('settle');
      expect(await financePrisma.matchFunding.findUniqueOrThrow({ where: { matchId: match.matchId } })).toMatchObject({ status: 'settling' });

      held.get('withdraw')!();
      const response = await withdrawal;
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ status: 'withdrawn', refunded: true });
      held.get('settle')!();

      await waitFor(() => financePrisma.matchFunding.findUniqueOrThrow({ where: { matchId: match.matchId } }), (funding) => funding.status === 'collecting');
      await waitFor(() => matchmakingPrisma.match.findUniqueOrThrow({ where: { id: match.matchId } }), (item) => item.status === 'open' && item.fundingRequestedAt === null);
      await cancelMatchesAtCutoff();
      await waitFor(() => financePrisma.matchFunding.findUniqueOrThrow({ where: { matchId: match.matchId } }), (funding) => funding.status === 'cancelled');
      await waitFor(() => financePrisma.matchContribution.findUniqueOrThrow({ where: { id: participant.contributionId } }), (item) => item.status === 'refunded');
      expect(await venuePrisma.booking.findUniqueOrThrow({ where: { id: match.bookingId } })).toMatchObject({ status: 'cancelled' });
      expect(await financePrisma.ledgerEntry.count({ where: { refType: 'booking', refId: match.bookingId, type: 'settlement' } })).toBe(0);
      expect(await financePrisma.bookingRevenue.findUnique({ where: { bookingId: match.bookingId } })).toBeNull();
      expect(await withdrawable(participant.userId)).toBe(participant.amount);
      await waitFor(() => withdrawable(match.organizerUserId), (value) => value === match.organizerPaid);
    } finally {
      held.forEach((release) => release());
      process.env.VENUE_BOOKING_SERVICE_URL = venueUrl;
      await Promise.allSettled([close(gatedMatchmaking), close(gate)]);
    }
  }, 60000);
});
