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
import { objectResult, sweepResultReviews } from '../src/domain/resultLifecycle.js';

const CHECKSUM = Buffer.alloc(32, 5).toString('base64');
const s3 = new S3Client({
  endpoint: 'http://127.0.0.1:9', region: 'us-east-1', forcePathStyle: true,
  credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
});
const storage = new S3ObjectStorageClient({ bucket: 'private-test', s3, privateBucket: true });
const send = vi.spyOn(s3, 'send');
const contexts = new Map<string, VenueMatchContext>();
const venueBookingClient = { getMatchContext: async (bookingId: string) => contexts.get(bookingId) ?? null } as unknown as VenueBookingClient;
const accountClient: AccountClient = {
  getPublicMatchProfile: async (userId: string) => ({ userId, displayName: `P-${userId.slice(0, 4)}`, avatarUrl: null, identityVisibility: 'public' as const }),
};
const app = createApp({ venueBookingClient, accountClient, resultStorage: storage });
const matchIds: string[] = [];
const HOUR = 60 * 60_000;

beforeEach(() => {
  send.mockReset();
  send.mockResolvedValue({ ContentType: 'image/png', ContentLength: 2_000, ChecksumSHA256: CHECKSUM } as never);
});

afterAll(async () => {
  const caseIds = await purgeResultCases(matchIds);
  await prisma.outbox.deleteMany({ where: { OR: [{ aggregateId: { in: matchIds } }, ...caseIds.map((id) => ({ aggregateId: { contains: id } }))] } });
  await prisma.join.deleteMany({ where: { matchId: { in: matchIds } } });
  await prisma.match.deleteMany({ where: { id: { in: matchIds } } });
  await prisma.$disconnect();
});

const token = (userId: string, roles: string[]) => jwt.sign(
  { sub: userId, roles, type: 'access' }, process.env.JWT_SECRET ?? 'change-me-in-real-env', { expiresIn: 300 },
);
const as = (userId: string, roles: string[]) => ({ Authorization: `Bearer ${token(userId, roles)}` });
const adminId = randomUUID();
const admin = as(adminId, ['admin']);

/** Kèo đơn 6:4 giá sân 200.000 (reserve 40.000), hồ sơ provisional TEAM_A_WIN. */
async function disputed(options: { providerIsOpponent?: boolean; mode?: 'friendly' | 'ranked' } = {}) {
  const organizer = randomUUID();
  const opponent = randomUUID();
  const providerUserId = options.providerIsOpponent ? opponent : randomUUID();
  const bookingId = randomUUID();
  const startAt = new Date(Date.now() - 3 * HOUR);
  const match = await prisma.match.create({
    data: {
      bookingId, organizerUserId: organizer, capacity: 2, feePerSlot: 120_000n, status: 'completed', ratio: 'six_four',
      mode: options.mode ?? 'ranked', cutoffAt: new Date(startAt.getTime() - HOUR), startAt, endAt: new Date(startAt.getTime() + HOUR),
      bookingPrice: 200_000n, providerUserId,
      joins: { create: { participantUserId: opponent, status: 'confirmed', teamSide: 'B' } },
    },
  });
  matchIds.push(match.id);
  contexts.set(bookingId, {
    bookingId, ownerUserId: organizer, status: 'completed', priceSnapshot: '200000',
    startAt: startAt.toISOString(), endAt: match.endAt!.toISOString(), holdExpiresAt: null,
    court: { id: randomUUID(), name: 'Sân 2' }, venue: { id: randomUUID(), name: 'CLB Tân Bình', address: '1 Cộng Hòa', lat: 10, lng: 106 },
  } as unknown as VenueMatchContext);
  await prisma.matchResultCase.create({
    data: {
      matchId: match.id, status: 'provisional', outcome: 'TEAM_A_WIN',
      declarationDeadlineAt: new Date(Date.now() + 9 * HOUR), objectionDeadlineAt: new Date(Date.now() + 9 * HOUR),
    },
  });
  await objectResult(storage, {
    matchId: match.id, userId: opponent, reason: 'Tôi thắng set 2',
    evidence: [{ objectKey: `match/results/${opponent}/${randomUUID()}.png`, mimeType: 'image/png' }],
  });
  const resultCase = await prisma.matchResultCase.findUniqueOrThrow({ where: { matchId: match.id } });
  return { match, resultCase, organizer, opponent, providerUserId };
}

const notificationCount = (caseId: string, kind: string) => prisma.outbox.count({
  where: { eventType: 'UserNotificationRequested', aggregateId: `${kind}:${caseId}:admin` },
});

describe('Task 13 provider recommendation', () => {
  it('lets only the owning provider review; the recommendation is non-binding and never finalizes', async () => {
    const { match, resultCase, providerUserId } = await disputed();
    expect(resultCase.status).toBe('provider_review');
    const provider = as(providerUserId, ['provider']);

    const queue = await request(app).get('/matches/provider/result-cases?pageSize=1').set(provider);
    expect(queue.body).toMatchObject({ total: 1, page: 1, pageSize: 1, items: [{ caseId: resultCase.id, status: 'provider_review' }] });
    expect((await request(app).get('/matches/provider/result-cases').set(as(randomUUID(), ['provider']))).body.total).toBe(0);
    expect((await request(app).get(`/matches/provider/result-cases/${resultCase.id}`).set(as(randomUUID(), ['provider']))).status).toBe(404);

    const detail = (await request(app).get(`/matches/provider/result-cases/${resultCase.id}`).set(provider)).body.resultCase;
    expect(detail).toMatchObject({
      booking: { venue: { name: 'CLB Tân Bình', address: '1 Cộng Hòa' }, court: { name: 'Sân 2' } },
      actions: { canRecommend: true },
      responses: [{ kind: 'object', reason: 'Tôi thắng set 2' }],
    });
    expect(detail.actions).not.toHaveProperty('canPreviewDecision');
    const evidenceId = detail.responses[0].evidenceIds[0];
    expect((await request(app).get(`/matches/${match.id}/result-evidence/${evidenceId}/read`).set(provider)).body.url).toContain('X-Amz-Signature=');

    expect((await request(app).post(`/matches/${match.id}/provider-recommendation`).set(as(randomUUID(), ['provider']))
      .send({ outcome: 'TEAM_B_WIN', reason: 'x' })).status).toBe(404);
    const recommended = await request(app).post(`/matches/${match.id}/provider-recommendation`).set(provider)
      .send({ outcome: 'TEAM_B_WIN', reason: 'Camera cho thấy B thắng' });
    expect(recommended.status).toBe(201);
    const after = await prisma.matchResultCase.findUniqueOrThrow({ where: { id: resultCase.id } });
    expect(after).toMatchObject({ status: 'admin_review', outcome: null, finalizedAt: null });
    expect(await prisma.outbox.count({ where: { aggregateId: match.id, eventType: 'MatchResultFinalized' } })).toBe(0);
    expect((await request(app).post(`/matches/${match.id}/provider-recommendation`).set(provider)
      .send({ outcome: 'TEAM_A_WIN', reason: 'đổi ý' })).body.error.code).toBe('RESULT_PROVIDER_REVIEW_CLOSED');
    // Hết bước provider thì không còn đọc bằng chứng.
    expect((await request(app).get(`/matches/${match.id}/result-evidence/${evidenceId}/read`).set(provider)).status).toBe(403);
  });

  it('skips the provider straight to Admin when the provider is in the roster', async () => {
    const { match, resultCase, opponent } = await disputed({ providerIsOpponent: true });
    expect(resultCase).toMatchObject({ status: 'admin_review', providerDeadlineAt: null });
    expect(resultCase.adminReviewStartedAt).not.toBeNull();
    expect((await request(app).post(`/matches/${match.id}/provider-recommendation`).set(as(opponent, ['provider']))
      .send({ outcome: 'TEAM_B_WIN', reason: 'x' })).status).toBe(404);
    expect((await request(app).get(`/matches/provider/result-cases/${resultCase.id}`).set(as(opponent, ['provider']))).status).toBe(404);
  });
});

describe('Task 13 SLA scheduler', () => {
  it('escalates after 24 hours and reminds Admin at 24h, 48h and every 24h without touching the result', async () => {
    const { resultCase } = await disputed();
    const start = resultCase.providerDeadlineAt!;
    await sweepResultReviews(new Date(start.getTime() - 1_000), matchIds);
    expect((await prisma.matchResultCase.findUniqueOrThrow({ where: { id: resultCase.id } })).status).toBe('provider_review');

    await sweepResultReviews(start, matchIds);
    const escalated = await prisma.matchResultCase.findUniqueOrThrow({ where: { id: resultCase.id } });
    expect(escalated).toMatchObject({ status: 'admin_review', adminReviewStartedAt: start });

    for (const hours of [24, 48, 72, 96]) await sweepResultReviews(new Date(start.getTime() + hours * HOUR), matchIds);
    await sweepResultReviews(new Date(start.getTime() + 96 * HOUR), matchIds); // replay cùng mốc không nhắc lại
    expect(await notificationCount(resultCase.id, 'match.result.admin_reminder')).toBe(1);
    expect(await notificationCount(resultCase.id, 'match.result.admin_overdue')).toBe(3);
    const final = await prisma.matchResultCase.findUniqueOrThrow({ where: { id: resultCase.id } });
    expect(final).toMatchObject({ status: 'admin_review', outcome: null, finalizedAt: null });

    const queue = await request(app).get('/matches/admin/result-cases?pageSize=100').set(admin);
    expect(queue.body.items.find((item: { caseId: string }) => item.caseId === resultCase.id)).toMatchObject({ adminOverdue: false });
  });
});

describe('Task 13 Admin decision', () => {
  it('pages the Admin queue and requires preview version plus explicit confirmation', async () => {
    const cases = await Promise.all([disputed(), disputed(), disputed()]);
    for (const { resultCase } of cases) await sweepResultReviews(resultCase.providerDeadlineAt!, matchIds);
    const page = await request(app).get('/matches/admin/result-cases?page=1&pageSize=2').set(admin);
    expect(page.body).toMatchObject({ page: 1, pageSize: 2 });
    expect(page.body.items).toHaveLength(2);
    expect(page.body.total).toBeGreaterThanOrEqual(3);
    expect((await request(app).get('/matches/admin/result-cases').set(as(randomUUID(), ['player']))).status).toBe(403);

    const { match, resultCase, organizer, opponent } = cases[0]!;
    const detail = (await request(app).get(`/matches/admin/result-cases/${resultCase.id}`).set(admin)).body.resultCase;
    expect(detail.actions).toEqual({ canPreviewDecision: true });

    const preview = (await request(app).post(`/matches/${match.id}/admin-decision/preview`).set(admin)
      .send({ outcome: 'TEAM_B_WIN', reason: 'Bằng chứng rõ' })).body.preview;
    expect(preview).toMatchObject({
      outcome: 'TEAM_B_WIN', ratingEffect: 'apply_ranked_result', bookingRevenueEffect: 'no_change',
      rows: [{ userId: organizer, amount: '0', withdrawable: true }, { userId: opponent, amount: '40000', withdrawable: true }],
    });

    const decide = (body: Record<string, unknown>, by = admin) => request(app).post(`/matches/${match.id}/admin-decision`).set(by).send(body);
    const base = { outcome: 'TEAM_B_WIN', reason: 'Bằng chứng rõ', caseVersion: preview.caseVersion, previewToken: preview.previewToken };
    expect((await decide({ ...base })).status).toBe(400);
    expect((await decide({ ...base, previewToken: undefined, confirm: true })).status).toBe(400);
    expect((await decide({ ...base, caseVersion: preview.caseVersion - 1, confirm: true })).body.error.code).toBe('RESULT_CASE_VERSION_CONFLICT');
    // Confirm phải khớp đúng outcome/reason đã preview và đúng Admin đã preview.
    expect((await decide({ ...base, outcome: 'TEAM_A_WIN', confirm: true })).body.error.code).toBe('RESULT_PREVIEW_MISMATCH');
    expect((await decide({ ...base, reason: 'Lý do khác', confirm: true })).body.error.code).toBe('RESULT_PREVIEW_MISMATCH');
    expect((await decide({ ...base, confirm: true }, as(randomUUID(), ['admin']))).body.error.code).toBe('RESULT_PREVIEW_MISMATCH');
    const decided = await decide({ ...base, confirm: true });
    expect(decided.status).toBe(201);
    const playerView = (await request(app).get(`/matches/${match.id}/result-case`).set(as(opponent, ['player']))).body.resultCase;
    expect(playerView).toMatchObject({ status: 'final', finalOutcome: 'TEAM_B_WIN', provisional: null });

    expect(await prisma.matchResultCase.findUniqueOrThrow({ where: { id: resultCase.id } })).toMatchObject({ status: 'final', outcome: 'TEAM_B_WIN' });
    const events = await prisma.outbox.findMany({ where: { aggregateId: match.id, eventType: 'MatchResultFinalized' } });
    expect(events).toHaveLength(1);
    expect(events[0]!.payload).toMatchObject({ matchId: match.id, decisionId: decided.body.decision.decisionId, outcome: 'TEAM_B_WIN' });
    expect((await decide({ ...base, caseVersion: preview.caseVersion + 1, confirm: true })).body.error.code)
      .toBe('RESULT_ADMIN_REVIEW_CLOSED');
  });
});
