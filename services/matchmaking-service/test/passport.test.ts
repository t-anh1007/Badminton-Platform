import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { declareTier, getOwnPassport } from '../src/domain/passport.js';
import { handleRatingCorrectionApproved, handleRatingPeriodReady } from '../src/lib/ratingEventConsumer.js';

const app = createApp();
const createdUsers = new Set<string>();
const processedEventIds = new Set<string>();

function playerToken(userId: string): string {
  return jwt.sign(
    { sub: userId, roles: ['player'], type: 'access' },
    process.env.JWT_SECRET ?? 'change-me-in-real-env',
    { expiresIn: 300 },
  );
}

function newUser(): { userId: string; token: string } {
  const userId = randomUUID();
  createdUsers.add(userId);
  return { userId, token: playerToken(userId) };
}

afterAll(async () => {
  const userIds = [...createdUsers];
  const ownedMatches = await prisma.match.findMany({
    where: { organizerUserId: { in: userIds } },
    select: { id: true },
  });
  const ownedMatchIds = ownedMatches.map((match) => match.id);
  await prisma.evaluation.deleteMany({
    where: {
      OR: [{ rateeUserId: { in: userIds } }, { raterUserId: { in: userIds } }, { matchId: { in: ownedMatchIds } }],
    },
  });
  await prisma.join.deleteMany({ where: { matchId: { in: ownedMatchIds } } });
  await prisma.match.deleteMany({
    where: { organizerUserId: { in: userIds } },
  });
  await prisma.passportCorrection.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.passport.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.processedEvent.deleteMany({
    where: { eventId: { in: [...processedEventIds] } },
  });
  await prisma.$disconnect();
});

describe('BR-CM-52 — one self-declaration per discipline', () => {
  const declare = (token: string, body: Record<string, string>) => request(app)
    .put('/passports/me/declaration').set('Authorization', `Bearer ${token}`).send(body);

  it('declaring singles initializes a high-RD singles Passport and leaves doubles undeclared', async () => {
    const user = newUser();
    const response = await declare(user.token, { discipline: 'singles', tier: 'intermediate' }).expect(200);
    expect(response.body).toMatchObject({
      userId: user.userId,
      singles: {
        declaredTier: 'intermediate', tier: 'intermediate', rating: 1500, matchesPlayed: 0,
        ratingStability: 'high_uncertainty', leaderboardVisible: false,
      },
      doubles: null,
      canDeclare: { singles: false, doubles: true },
    });
    expect(response.body.singles).not.toHaveProperty('sigma');
    expect((await declare(user.token, { tier: 'intermediate' })).status).toBe(400);
  });

  it('rejects a second declaration of the same discipline even for a different tier', async () => {
    const user = newUser();
    await declare(user.token, { discipline: 'doubles', tier: 'beginner' }).expect(200);
    const response = await declare(user.token, { discipline: 'doubles', tier: 'advanced' }).expect(409);
    expect(response.body.error.code).toBe('LEVEL_ALREADY_DECLARED');
  });

  it('declaring doubles never changes an existing singles rating', async () => {
    const user = newUser();
    await prisma.passport.create({
      data: {
        userId: user.userId, discipline: 'singles', declaredTier: 'intermediate', ratingMu: 1620,
        ratingRd: 90, ratingSigma: 0.059, matchesPlayed: 11, declaredAt: new Date('2026-08-01T00:00:00.000Z'),
      },
    });
    const before = await prisma.passport.findUniqueOrThrow({ where: { userId_discipline: { userId: user.userId, discipline: 'singles' } } });
    const response = await declare(user.token, { discipline: 'doubles', tier: 'advanced' }).expect(200);
    expect(response.body.doubles).toMatchObject({ declaredTier: 'advanced', matchesPlayed: 0 });
    expect(response.body.singles).toMatchObject({ rating: 1620, matchesPlayed: 11, ratingStability: 'established', leaderboardVisible: false });
    expect(await prisma.passport.findUniqueOrThrow({ where: { userId_discipline: { userId: user.userId, discipline: 'singles' } } }))
      .toEqual(before);
  });

  it('serializes concurrent duplicate declarations into one Passport', async () => {
    const user = newUser();
    const results = await Promise.allSettled([
      declareTier(user.userId, 'singles', 'advanced'),
      declareTier(user.userId, 'singles', 'beginner'),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({ reason: { code: 'LEVEL_ALREADY_DECLARED' } });
    expect(await prisma.passport.count({ where: { userId: user.userId } })).toBe(1);
  });
});

describe('MMP-11 — Player Passport views', () => {
  it('uses the Vietnamese product name when a profile does not exist', async () => {
    const response = await request(app).get(`/passports/${randomUUID()}`).expect(404);
    expect(response.body.error.message).toBe('Hồ sơ trình độ chưa tồn tại.');
  });

  it('AC-MMP-11-1: owner sees rating, uncertainty and five completed matches', async () => {
    const user = newUser();
    await prisma.passport.create({
      data: {
        userId: user.userId,
        discipline: 'singles',
        declaredTier: 'intermediate_plus',
        ratingMu: 1710,
        ratingRd: 90,
        ratingSigma: 0.059,
        matchesPlayed: 5,
      },
    });
    const matches = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        prisma.match.create({
          data: {
            organizerUserId: user.userId,
            bookingId: randomUUID(),
            capacity: 4,
            feePerSlot: 0n,
            status: 'completed' as const,
            cutoffAt: new Date(Date.now() - (index + 1) * 60_000),
            completedAt: new Date(`2026-08-0${index + 1}T10:00:00.000Z`),
          },
        }),
      ),
    );
    const evaluatedPeerId = randomUUID();
    await prisma.join.createMany({
      data: [
        {
          matchId: matches[4]!.id,
          participantUserId: evaluatedPeerId,
          status: 'confirmed',
        },
        {
          matchId: matches[4]!.id,
          participantUserId: randomUUID(),
          status: 'pending',
        },
      ],
    });
    await prisma.evaluation.createMany({
      data: [
        {
          matchId: matches[0]!.id,
          raterUserId: randomUUID(),
          rateeUserId: user.userId,
          perceivedTier: 'newcomer',
          countedAt: new Date(),
        },
        {
          matchId: matches[1]!.id,
          raterUserId: randomUUID(),
          rateeUserId: user.userId,
          perceivedTier: 'advanced',
          countedAt: new Date(),
          flagged: true,
          reviewStatus: 'pending',
        },
        {
          matchId: matches[2]!.id,
          raterUserId: randomUUID(),
          rateeUserId: user.userId,
          perceivedTier: 'newcomer',
        },
        {
          matchId: matches[3]!.id,
          raterUserId: randomUUID(),
          rateeUserId: user.userId,
          perceivedTier: 'beginner',
          countedAt: new Date(),
        },
        {
          matchId: matches[4]!.id,
          raterUserId: randomUUID(),
          rateeUserId: user.userId,
          perceivedTier: 'beginner',
          countedAt: new Date(),
        },
        {
          matchId: matches[4]!.id,
          raterUserId: user.userId,
          rateeUserId: evaluatedPeerId,
          perceivedTier: 'intermediate',
          countedAt: new Date(),
        },
      ],
    });

    const response = await request(app).get('/passports/me').set('Authorization', `Bearer ${user.token}`).expect(200);

    expect(response.body).toMatchObject({
      userId: user.userId,
      singles: { tier: 'intermediate_plus', rating: 1710, ratingStability: 'established', matchesPlayed: 5 },
      doubles: null,
      evaluationScore: (1100 + 1300 + 1300) / 3,
      evaluationCount: 3,
      flaggedEvaluationCount: 1,
    });
    expect(response.body.recentMatches).toHaveLength(5);
    expect(response.body.recentMatches.map((match: { completedAt: string }) => match.completedAt)).toEqual([
      '2026-08-05T10:00:00.000Z',
      '2026-08-04T10:00:00.000Z',
      '2026-08-03T10:00:00.000Z',
      '2026-08-02T10:00:00.000Z',
      '2026-08-01T10:00:00.000Z',
    ]);
    expect(response.body.recentMatches[0].evaluationCandidates).toEqual([{ userId: evaluatedPeerId, submitted: true }]);
  });

  it('AC-MMP-11-2: public view exposes only tier and match count', async () => {
    const user = newUser();
    await prisma.passport.create({
      data: {
        userId: user.userId,
        discipline: 'doubles',
        declaredTier: 'advanced',
        ratingMu: 1900,
        ratingRd: 70,
        ratingSigma: 0.055,
        matchesPlayed: 12,
      },
    });

    const response = await request(app).get(`/passports/${user.userId}`).expect(200);

    expect(response.body).toEqual({
      userId: user.userId,
      singles: null,
      doubles: { tier: 'advanced', matchesPlayed: 12 },
      badges: [],
      displayName: 'Người chơi',
      avatarUrl: null,
      identityVisibility: 'hidden',
    });
    expect(JSON.stringify(response.body)).not.toMatch(/rating|"rd"|sigma/);
    expect(response.body).not.toHaveProperty('recentMatches');
  });
});

describe('F-01 — idempotent runtime rating updates', () => {
  it('AC-F01-2: RatingPeriodReady persists one update and ignores replay', async () => {
    const user = newUser();
    const eventId = `RatingPeriodReady:${randomUUID()}`;
    processedEventIds.add(eventId);
    await prisma.passport.create({ data: { userId: user.userId, discipline: 'doubles', ratingMu: 1500, ratingRd: 350, ratingSigma: 0.06 } });
    await prisma.passport.create({
      data: {
        userId: user.userId,
        discipline: 'singles',
        declaredTier: 'intermediate',
        ratingMu: 1500,
        ratingRd: 350,
        ratingSigma: 0.06,
      },
    });
    const payload = {
      matchId: randomUUID(),
      userId: user.userId,
      results: Array.from({ length: 8 }, (_, index) => ({
        opponentRating: 1700 + index * 10,
        opponentRd: 100,
        score: 1,
      })),
    };

    await handleRatingPeriodReady(eventId, payload);
    const singles = { userId_discipline: { userId: user.userId, discipline: 'singles' as const } };
    const afterFirst = await prisma.passport.findUniqueOrThrow({ where: singles });
    await handleRatingPeriodReady(eventId, payload);
    const afterReplay = await prisma.passport.findUniqueOrThrow({ where: singles });

    expect(afterFirst.ratingMu).toBeGreaterThan(1600);
    expect(afterFirst.ratingRd).toBeLessThan(350);
    expect(afterFirst.matchesPlayed).toBe(1);
    expect(afterReplay).toEqual(afterFirst);
    // Event cũ không có discipline chỉ cập nhật singles.
    expect(await prisma.passport.findUniqueOrThrow({ where: { userId_discipline: { userId: user.userId, discipline: 'doubles' } } }))
      .toMatchObject({ ratingMu: 1500, matchesPlayed: 0 });
  });

  it('applies a doubles rating period only to the doubles Passport', async () => {
    const user = newUser();
    const eventId = `RatingPeriodReady:${randomUUID()}`;
    processedEventIds.add(eventId);
    for (const discipline of ['singles', 'doubles'] as const) {
      await prisma.passport.create({ data: { userId: user.userId, discipline, ratingMu: 1500, ratingRd: 200, ratingSigma: 0.06 } });
    }
    await handleRatingPeriodReady(eventId, {
      matchId: randomUUID(), userId: user.userId, discipline: 'doubles',
      results: [{ opponentRating: 1600, opponentRd: 100, score: 1 }],
    });
    const rows = await prisma.passport.findMany({ where: { userId: user.userId }, orderBy: { discipline: 'asc' } });
    expect(rows.map((row) => [row.discipline, row.matchesPlayed, row.ratingMu > 1500])).toEqual([
      ['singles', 0, false], ['doubles', 1, true],
    ]);
  });
});

describe('BR-CM-54 — Admin-approved tier correction', () => {
  const approve = (userId: string, discipline: 'singles' | 'doubles', approvedTier: 'beginner' | 'advanced', ticketId = randomUUID()) =>
    ({ ticketId, userId, discipline, approvedTier, adminUserId: randomUUID() });

  it('resets a Passport without matches to the new tier center and audits the ticket/admin', async () => {
    const user = newUser();
    await declareTier(user.userId, 'doubles', 'intermediate');
    const event = approve(user.userId, 'doubles', 'advanced');
    await handleRatingCorrectionApproved(event);
    expect(await prisma.passport.findUniqueOrThrow({ where: { userId_discipline: { userId: user.userId, discipline: 'doubles' } } }))
      .toMatchObject({ declaredTier: 'advanced', ratingMu: 1900, ratingRd: 350 });
    expect(await prisma.passportCorrection.findUniqueOrThrow({ where: { ticketId: event.ticketId } }))
      .toMatchObject({ adminUserId: event.adminUserId, previousRating: 1500, newRating: 1900, matchesPlayed: 0 });
  });

  it('shifts a played Passport by at most 50 while keeping RD/sigma, and ignores replay', async () => {
    const user = newUser();
    await prisma.passport.create({
      data: { userId: user.userId, discipline: 'singles', declaredTier: 'intermediate', ratingMu: 1500, ratingRd: 90, ratingSigma: 0.058, matchesPlayed: 8 },
    });
    const event = approve(user.userId, 'singles', 'advanced');
    await handleRatingCorrectionApproved(event);
    await handleRatingCorrectionApproved(event);
    const passport = await prisma.passport.findUniqueOrThrow({ where: { userId_discipline: { userId: user.userId, discipline: 'singles' } } });
    expect(passport.ratingMu).toBeGreaterThan(1500);
    expect(passport.ratingMu).toBeLessThanOrEqual(1550);
    expect(passport).toMatchObject({ ratingRd: 90, ratingSigma: 0.058, matchesPlayed: 8, declaredTier: 'advanced' });
    expect(await prisma.passportCorrection.count({ where: { ticketId: event.ticketId } })).toBe(1);
  });

  it('still exposes no player API that alters an existing declaration', async () => {
    const user = newUser();
    await declareTier(user.userId, 'singles', 'beginner');
    await request(app).put('/passports/me/declaration').set('Authorization', `Bearer ${user.token}`)
      .send({ discipline: 'singles', tier: 'advanced' }).expect(409);
    await request(app).patch('/passports/me').set('Authorization', `Bearer ${user.token}`).send({ tier: 'advanced' }).expect(404);
  });
});

describe('G4 review — leaderboard visibility follows the current season rule', () => {
  it('needs five results in the active season as well as RD below 200', async () => {
    const user = newUser();
    const season = await prisma.season.create({ data: { name: 'Kỳ 2089', startAt: new Date('2089-01-01T00:00:00Z'), endAt: new Date('2089-04-01T00:00:00Z') } });
    try {
      await prisma.passport.create({ data: { userId: user.userId, discipline: 'singles', ratingMu: 1600, ratingRd: 90, ratingSigma: 0.06, matchesPlayed: 40 } });
      const now = new Date('2089-02-01T00:00:00Z');
      await prisma.seasonStat.create({ data: { seasonId: season.id, userId: user.userId, discipline: 'singles', matchesPlayed: 4 } });
      expect((await getOwnPassport(user.userId, now)).singles?.leaderboardVisible).toBe(false);
      await prisma.seasonStat.update({ where: { seasonId_userId_discipline: { seasonId: season.id, userId: user.userId, discipline: 'singles' } }, data: { matchesPlayed: 5, wins: 3, currentWinStreak: 2 } });
      const own = await getOwnPassport(user.userId, now);
      expect(own.singles?.leaderboardVisible).toBe(true);
      expect(own.singles?.season).toEqual({ matchesPlayed: 5, wins: 3, currentWinStreak: 2 });
      expect(own.singles).toMatchObject({ rating: 1600, leaderboardBand: 'from_1600' });
      // Hiển thị làm tròn 1600 nhưng nhóm bảng theo rating gốc như truy vấn BXH.
      await prisma.passport.update({ where: { userId_discipline: { userId: user.userId, discipline: 'singles' } }, data: { ratingMu: 1599.6 } });
      expect((await getOwnPassport(user.userId, now)).singles).toMatchObject({ rating: 1600, leaderboardBand: 'under_1600' });
    } finally {
      await prisma.seasonStat.deleteMany({ where: { seasonId: season.id } });
      await prisma.season.delete({ where: { id: season.id } });
    }
  });
});
