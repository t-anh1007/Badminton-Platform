import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { S3Client } from '@aws-sdk/client-s3';
import { S3ObjectStorageClient } from '@khoaluantn/object-storage';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { purgeResultCases } from './resultTestUtils.js';
import type { VenueBookingClient, VenueMatchContext } from '../src/clients/venueBooking.js';
import type { AccountClient } from '../src/clients/account.js';
import { allocateResultReserve, inferMatchOutcome } from '../src/domain/matchRules.js';
import { handleBookingCompletedForMatch } from '../src/lib/matchLifecycleEventConsumer.js';

const CHECKSUM = Buffer.alloc(32, 7).toString('base64');
const s3 = new S3Client({
  endpoint: 'http://127.0.0.1:9', region: 'us-east-1', forcePathStyle: true,
  credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
});
const storage = new S3ObjectStorageClient({ bucket: 'private-test', s3, privateBucket: true });
const send = vi.spyOn(s3, 'send');
const contexts = new Map<string, VenueMatchContext>();
const venueBookingClient = { getMatchContext: async (bookingId: string) => contexts.get(bookingId) ?? null } as unknown as VenueBookingClient;
const names = new Map<string, string>();
const accountClient: AccountClient = {
  getPublicMatchProfile: async (userId: string) => {
    const displayName = names.get(userId);
    return displayName ? { userId, displayName, avatarUrl: `https://img/${userId}.png`, identityVisibility: 'public' as const } : null;
  },
};
const app = createApp({ venueBookingClient, accountClient, resultStorage: storage });
const matchIds: string[] = [];
const eventIds: string[] = [];

beforeEach(() => {
  send.mockReset();
  send.mockResolvedValue({ ContentType: 'image/png', ContentLength: 2_000, ChecksumSHA256: CHECKSUM } as never);
});

afterAll(async () => {
  const caseIds = await purgeResultCases(matchIds);
  await prisma.outbox.deleteMany({ where: { OR: [{ aggregateId: { in: matchIds } }, ...caseIds.map((id) => ({ aggregateId: { contains: id } }))] } });
  await prisma.processedEvent.deleteMany({ where: { eventId: { in: eventIds } } });
  await prisma.join.deleteMany({ where: { matchId: { in: matchIds } } });
  await prisma.match.deleteMany({ where: { id: { in: matchIds } } });
  await prisma.$disconnect();
});

const token = (userId: string, roles = ['player']) => jwt.sign(
  { sub: userId, roles, type: 'access' }, process.env.JWT_SECRET ?? 'change-me-in-real-env', { expiresIn: 300 },
);
const evidence = (userId: string, count = 1) => Array.from({ length: count }, () => ({
  objectKey: `match/results/${userId}/${randomUUID()}.png`, mimeType: 'image/png',
}));
const A_WIN = [{ teamA: 21, teamB: 10 }, { teamA: 21, teamB: 15 }];
const B_WIN = [{ teamA: 10, teamB: 21 }, { teamA: 15, teamB: 21 }];

async function completedMatch(options: { endedAgoMs?: number; providerUserId?: string | null } = {}) {
  const organizerUserId = randomUUID();
  const opponentUserId = randomUUID();
  const bookingId = randomUUID();
  const endAt = new Date(Date.now() - (options.endedAgoMs ?? 60 * 60_000));
  const startAt = new Date(endAt.getTime() - 60 * 60_000);
  names.set(organizerUserId, 'Chủ kèo');
  names.set(opponentUserId, 'Đối thủ');
  const match = await prisma.match.create({
    data: {
      bookingId, organizerUserId, capacity: 2, feePerSlot: 120_000n, status: 'confirmed', ratio: 'six_four',
      cutoffAt: new Date(startAt.getTime() - 60 * 60_000), bookingPrice: 200_000n, startAt, endAt,
      providerUserId: options.providerUserId === undefined ? randomUUID() : options.providerUserId,
      joins: { create: { participantUserId: opponentUserId, status: 'confirmed', teamSide: 'B' } },
    },
  });
  matchIds.push(match.id);
  contexts.set(bookingId, {
    bookingId, ownerUserId: organizerUserId, status: 'completed', priceSnapshot: '200000',
    startAt: startAt.toISOString(), endAt: endAt.toISOString(), holdExpiresAt: null,
    court: { id: randomUUID(), name: 'Sân 3' },
    venue: { id: randomUUID(), name: 'Nhà thi đấu Q1', address: '12 Lê Lợi, Quận 1', lat: 10, lng: 106 },
  } as unknown as VenueMatchContext);
  const eventId = randomUUID();
  eventIds.push(eventId);
  await handleBookingCompletedForMatch(eventId, { bookingId, completedAt: new Date().toISOString() });
  return { match, organizerUserId, opponentUserId };
}

const claim = (matchId: string, userId: string, sets = A_WIN, items = evidence(userId)) => request(app)
  .post(`/matches/${matchId}/result-claims`).set('Authorization', `Bearer ${token(userId)}`).send({ sets, evidence: items });
const view = (matchId: string, userId: string) => request(app)
  .get(`/matches/${matchId}/result-case`).set('Authorization', `Bearer ${token(userId)}`);

describe('Task 11 score validation', () => {
  it.each([
    [[{ teamA: 21, teamB: 19 }, { teamA: 21, teamB: 0 }], 'TEAM_A_WIN'],
    [[{ teamA: 22, teamB: 20 }, { teamA: 20, teamB: 22 }, { teamA: 30, teamB: 29 }], 'TEAM_A_WIN'],
    [[{ teamA: 29, teamB: 30 }, { teamA: 28, teamB: 30 }], 'TEAM_B_WIN'],
    [[{ teamA: 21, teamB: 10 }, { teamA: 15, teamB: 10 }], 'TEAM_A_WIN'],
    [[{ teamA: 21, teamB: 10 }, { teamA: 10, teamB: 21 }, { teamA: 11, teamB: 14 }], 'TEAM_B_WIN'],
    [[{ teamA: 21, teamB: 10 }, { teamA: 10, teamB: 21 }, { teamA: 12, teamB: 12 }], 'NO_RESULT'],
    [[{ teamA: 21, teamB: 10 }, { teamA: 10, teamB: 21 }], 'NO_RESULT'],
  ] as const)('bo3 %j -> %s', (sets, outcome) => {
    expect(inferMatchOutcome({ format: 'bo3', sets: [...sets] }).outcome).toBe(outcome);
  });

  it('accepts bo5 to three sets and rejects impossible or surplus sets', () => {
    expect(inferMatchOutcome({
      format: 'bo5', sets: [{ teamA: 21, teamB: 3 }, { teamA: 3, teamB: 21 }, { teamA: 21, teamB: 3 }, { teamA: 3, teamB: 21 }, { teamA: 23, teamB: 21 }],
    })).toEqual({ outcome: 'TEAM_A_WIN', setWinsA: 3, setWinsB: 2 });
    for (const sets of [
      [{ teamA: 31, teamB: 29 }],
      [{ teamA: 25, teamB: 20 }],
      [{ teamA: 21, teamB: 20 }, { teamA: 21, teamB: 3 }],
      [{ teamA: 21, teamB: 3 }, { teamA: 21, teamB: 3 }, { teamA: 21, teamB: 3 }],
      [],
    ]) {
      expect(() => inferMatchOutcome({ format: 'bo3', sets })).toThrow();
    }
  });

  it('splits reserve by team with the organizer or earliest JOIN taking the remainder', () => {
    const teams = { A: ['org', 'a2'], B: ['b1', 'b2'] };
    expect(Object.fromEntries(allocateResultReserve(100_001n, 'NO_RESULT', teams)))
      .toEqual({ org: 25_000n, a2: 25_000n, b1: 25_001n, b2: 25_000n });
    expect(Object.fromEntries(allocateResultReserve(40_001n, 'TEAM_B_WIN', teams))).toEqual({ b1: 20_001n, b2: 20_000n });
    expect(Object.fromEntries(allocateResultReserve(40_001n, 'TEAM_A_WIN', teams))).toEqual({ org: 20_001n, a2: 20_000n });
  });
});

describe('Task 11 result claims', () => {
  it('opens declaration from the match endAt snapshot on BookingCompleted, once', async () => {
    const { match } = await completedMatch();
    const resultCase = await prisma.matchResultCase.findUniqueOrThrow({ where: { matchId: match.id } });
    expect(resultCase.status).toBe('declaration_open');
    expect(resultCase.declarationDeadlineAt.getTime()).toBe(match.endAt!.getTime() + 12 * 60 * 60_000);
    expect((await prisma.match.findUniqueOrThrow({ where: { id: match.id } })).status).toBe('completed');
    await handleBookingCompletedForMatch(randomUUID(), { bookingId: match.bookingId, completedAt: new Date().toISOString() });
    expect(await prisma.matchResultCase.count({ where: { matchId: match.id } })).toBe(1);
  });

  it('keeps claims roster-only, 1-3 evidence, within 12 hours, and rejects NO_RESULT or invalid scores', async () => {
    const { match, organizerUserId } = await completedMatch();
    const stranger = randomUUID();
    expect((await claim(match.id, stranger)).body.error.code).toBe('RESULT_ROSTER_ONLY');
    expect((await view(match.id, stranger)).status).toBe(403);
    expect((await claim(match.id, organizerUserId, A_WIN, [])).status).toBe(400);
    expect((await claim(match.id, organizerUserId, A_WIN, evidence(organizerUserId, 4))).status).toBe(400);
    expect((await claim(match.id, organizerUserId, [{ teamA: 21, teamB: 10 }, { teamA: 10, teamB: 21 }])).body.error.code)
      .toBe('RESULT_USE_INCIDENT');
    expect((await claim(match.id, organizerUserId, [{ teamA: 31, teamB: 10 }])).body.error.code).toBe('RESULT_SCORE_INVALID');

    const late = await completedMatch({ endedAgoMs: 12 * 60 * 60_000 + 1_000 });
    expect((await claim(late.match.id, late.organizerUserId)).body.error.code).toBe('RESULT_DECLARATION_CLOSED');
  });

  it('serializes concurrent first claims into one provisional case without finalizing', async () => {
    const { match, organizerUserId, opponentUserId } = await completedMatch();
    const responses = await Promise.all([claim(match.id, organizerUserId), claim(match.id, opponentUserId)]);
    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    const resultCase = await prisma.matchResultCase.findUniqueOrThrow({ where: { matchId: match.id }, include: { claims: true } });
    expect(resultCase).toMatchObject({ status: 'provisional', outcome: 'TEAM_A_WIN', version: 3, finalizedAt: null });
    expect(resultCase.claims.map((row) => row.createdAt.getTime() + 12 * 60 * 60_000))
      .toContain(resultCase.objectionDeadlineAt!.getTime());
    expect(await prisma.outbox.count({ where: { aggregateId: match.id, eventType: 'MatchResultFinalized' } })).toBe(0);
    expect((await claim(match.id, organizerUserId)).body.error.code).toBe('RESULT_CLAIM_EXISTS');
  });

  it('routes an opposite-winner claim to provider review, or straight to Admin when provider is in the roster', async () => {
    const withProvider = await completedMatch();
    await claim(withProvider.match.id, withProvider.organizerUserId);
    await claim(withProvider.match.id, withProvider.opponentUserId, B_WIN);
    expect(await prisma.matchResultCase.findUniqueOrThrow({ where: { matchId: withProvider.match.id } }))
      .toMatchObject({ status: 'provider_review', outcome: null });

    const organizerIsProvider = await completedMatch();
    await prisma.match.update({ where: { id: organizerIsProvider.match.id }, data: { providerUserId: organizerIsProvider.organizerUserId } });
    await claim(organizerIsProvider.match.id, organizerIsProvider.opponentUserId);
    await claim(organizerIsProvider.match.id, organizerIsProvider.organizerUserId, B_WIN);
    const adminCase = await prisma.matchResultCase.findUniqueOrThrow({ where: { matchId: organizerIsProvider.match.id } });
    expect(adminCase).toMatchObject({ status: 'admin_review', outcome: null });
    expect(adminCase.adminReviewStartedAt).not.toBeNull();
  });
});

describe('Task 11 player result read model', () => {
  it('returns authoritative booking, account identity, server deadlines/actions and roster-only money', async () => {
    const { match, organizerUserId, opponentUserId } = await completedMatch();
    await claim(match.id, opponentUserId, [{ teamA: 21, teamB: 19 }, { teamA: 21, teamB: 17 }]);
    const organizerItems = evidence(organizerUserId, 2);
    await claim(match.id, organizerUserId, A_WIN, organizerItems);

    const response = await view(match.id, opponentUserId);
    expect(response.status).toBe(200);
    const resultCase = response.body.resultCase;
    expect(resultCase).toMatchObject({
      matchId: match.id, status: 'provisional',
      match: {
        discipline: 'singles', format: 'bo3', ratio: '6:4',
        venue: { name: 'Nhà thi đấu Q1', address: '12 Lê Lợi, Quận 1' }, court: { name: 'Sân 3' },
        teams: [
          { side: 'A', players: [{ userId: organizerUserId, displayName: 'Chủ kèo', avatarUrl: `https://img/${organizerUserId}.png` }] },
          { side: 'B', players: [{ userId: opponentUserId, displayName: 'Đối thủ' }] },
        ],
      },
      provisional: { claimant: { userId: organizerUserId }, sets: A_WIN, outcome: 'TEAM_A_WIN' },
      viewerActions: { canClaim: false, canConfirm: true, canObject: true, canReportIncident: true },
      viewerMoney: { heldForResult: '20000', projectedReceivable: '0', projectedFinalCost: '120000', withdrawableIfFinal: true },
    });
    expect(resultCase.provisional.evidence).toHaveLength(2);
    expect(JSON.stringify(resultCase)).not.toContain('match/results/');
    expect(typeof resultCase.serverNow).toBe('string');

    const organizerView = (await view(match.id, organizerUserId)).body.resultCase;
    expect(organizerView.viewerMoney).toMatchObject({ projectedReceivable: '40000', projectedFinalCost: '80000' });

    const evidenceId = resultCase.provisional.evidence[0].id;
    const read = await request(app).get(`/matches/${match.id}/result-evidence/${evidenceId}/read`)
      .set('Authorization', `Bearer ${token(opponentUserId)}`);
    expect(read.status).toBe(200);
    expect(read.body.url).toContain('X-Amz-Signature=');
    const denied = await request(app).get(`/matches/${match.id}/result-evidence/${evidenceId}/read`)
      .set('Authorization', `Bearer ${token(randomUUID())}`);
    expect(denied.status).toBe(403);
  });

  it('signs checksum-bound evidence uploads for roster members through HTTP', async () => {
    const { match, opponentUserId } = await completedMatch();
    const response = await request(app).post(`/matches/${match.id}/result-evidence/uploads`)
      .set('Authorization', `Bearer ${token(opponentUserId)}`)
      .send({ mimeType: 'image/webp', size: 5 * 1024 * 1024, checksumSha256: CHECKSUM });
    expect(response.status).toBe(201);
    expect(response.body.upload.headers['x-amz-checksum-sha256']).toBe(CHECKSUM);
    const tooLarge = await request(app).post(`/matches/${match.id}/result-evidence/uploads`)
      .set('Authorization', `Bearer ${token(opponentUserId)}`)
      .send({ mimeType: 'image/webp', size: 5 * 1024 * 1024 + 1, checksumSha256: CHECKSUM });
    expect(tooLarge.body.error.code).toBe('RESULT_EVIDENCE_TOO_LARGE');
  });
});
