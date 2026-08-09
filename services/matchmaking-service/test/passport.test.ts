import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { declareTier } from '../src/domain/passport.js';
import { handleRatingPeriodReady } from '../src/lib/ratingEventConsumer.js';

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
  await prisma.passport.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.processedEvent.deleteMany({
    where: { eventId: { in: [...processedEventIds] } },
  });
  await prisma.$disconnect();
});

describe('MMP-09 — standardized tier declaration', () => {
  it('AC-MMP-09-1: declaring TB initializes a high-RD Passport around TB', async () => {
    const user = newUser();
    const response = await request(app)
      .put('/passports/me/declaration')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ tier: 'intermediate' })
      .expect(200);

    expect(response.body).toMatchObject({
      userId: user.userId,
      declaredTier: 'intermediate',
      tier: 'intermediate',
      rating: 1500,
      rd: 350,
      uncertainty: 'high',
    });
  });

  it('AC-MMP-09-2: re-declaration shifts learned rating only within the D26 bound', async () => {
    const user = newUser();
    await prisma.passport.create({
      data: {
        userId: user.userId,
        declaredTier: 'intermediate',
        ratingMu: 1500,
        ratingRd: 100,
        ratingSigma: 0.06,
        matchesPlayed: 10,
        declaredAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
      },
    });

    const response = await request(app)
      .put('/passports/me/declaration')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ tier: 'advanced' })
      .expect(200);

    expect(response.body.rating).toBeGreaterThan(1500);
    expect(response.body.rating).toBeLessThanOrEqual(1550);
    expect(response.body.rating).not.toBe(1900);
    expect(response.body.rd).toBe(100);
    expect(response.body.sigma).toBe(0.06);
  });

  it('enforces the approved 30-day re-declaration cooldown', async () => {
    const user = newUser();
    await request(app)
      .put('/passports/me/declaration')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ tier: 'beginner' })
      .expect(200);

    const response = await request(app)
      .put('/passports/me/declaration')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ tier: 'advanced' })
      .expect(409);

    expect(response.body.error.code).toBe('TIER_REDECLARATION_COOLDOWN');
  });

  it('accepts exactly at T+30 days and serializes concurrent re-declarations', async () => {
    const user = newUser();
    const boundary = new Date('2026-08-08T00:00:00.000Z');
    await prisma.passport.create({
      data: {
        userId: user.userId,
        declaredTier: 'intermediate',
        ratingMu: 1500,
        ratingRd: 100,
        ratingSigma: 0.06,
        matchesPlayed: 5,
        declaredAt: new Date('2026-07-09T00:00:00.000Z'),
      },
    });

    const results = await Promise.allSettled([
      declareTier(user.userId, 'advanced', boundary),
      declareTier(user.userId, 'beginner', boundary),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  });
});

describe('MMP-11 — Player Passport views', () => {
  it('AC-MMP-11-1: owner sees rating, uncertainty and five completed matches', async () => {
    const user = newUser();
    await prisma.passport.create({
      data: {
        userId: user.userId,
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
      tier: 'intermediate_plus',
      rating: 1710,
      rd: 90,
      uncertainty: 'established',
      matchesPlayed: 5,
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
      tier: 'advanced',
      matchesPlayed: 12,
    });
    expect(response.body).not.toHaveProperty('rating');
    expect(response.body).not.toHaveProperty('rd');
    expect(response.body).not.toHaveProperty('recentMatches');
  });
});

describe('F-01 — idempotent runtime rating updates', () => {
  it('AC-F01-2: RatingPeriodReady persists one update and ignores replay', async () => {
    const user = newUser();
    const eventId = `RatingPeriodReady:${randomUUID()}`;
    processedEventIds.add(eventId);
    await prisma.passport.create({
      data: {
        userId: user.userId,
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
    const afterFirst = await prisma.passport.findUniqueOrThrow({
      where: { userId: user.userId },
    });
    await handleRatingPeriodReady(eventId, payload);
    const afterReplay = await prisma.passport.findUniqueOrThrow({
      where: { userId: user.userId },
    });

    expect(afterFirst.ratingMu).toBeGreaterThan(1600);
    expect(afterFirst.ratingRd).toBeLessThan(350);
    expect(afterFirst.matchesPlayed).toBe(1);
    expect(afterReplay).toEqual(afterFirst);
  });
});
