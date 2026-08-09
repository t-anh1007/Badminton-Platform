import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { handleBookingCompletedForMatch, handleBookingConfirmedForMatch } from '../src/lib/matchLifecycleEventConsumer.js';

const app = createApp();
const matchIds: string[] = [];
const userIds = new Set<string>();
const eventIds: string[] = [];

function token(userId: string, roles: string[]): string {
  return jwt.sign(
    { sub: userId, roles, type: 'access' },
    process.env.JWT_SECRET ?? 'change-me-in-real-env',
    { expiresIn: 300 },
  );
}

function player(): { id: string; token: string } {
  const id = randomUUID();
  userIds.add(id);
  return { id, token: token(id, ['player']) };
}

async function completedMatch(players: Array<{ id: string }>, completedAt = new Date()) {
  const organizer = player();
  const match = await prisma.match.create({
    data: {
      organizerUserId: organizer.id,
      bookingId: randomUUID(),
      capacity: Math.max(2, players.length + 1),
      feePerSlot: 0n,
      status: 'completed',
      cutoffAt: new Date(completedAt.getTime() - 2 * 60 * 60_000),
      completedAt,
      joins: {
        create: players.map((entry) => ({
          participantUserId: entry.id,
          status: 'confirmed',
          approvedAt: completedAt,
          feePaidAt: completedAt,
        })),
      },
    },
  });
  matchIds.push(match.id);
  return match;
}

function submit(
  matchId: string,
  rater: { token: string },
  rateeUserId: string,
  perceivedTier: 'newcomer' | 'beginner' | 'intermediate' | 'intermediate_plus' | 'advanced',
) {
  return request(app)
    .post(`/matches/${matchId}/evaluations`)
    .set('Authorization', `Bearer ${rater.token}`)
    .send({ rateeUserId, perceivedTier });
}

afterAll(async () => {
  await prisma.evaluation.deleteMany({ where: { matchId: { in: matchIds } } });
  await prisma.join.deleteMany({ where: { matchId: { in: matchIds } } });
  await prisma.match.deleteMany({ where: { id: { in: matchIds } } });
  await prisma.passport.deleteMany({ where: { userId: { in: [...userIds] } } });
  await prisma.processedEvent.deleteMany({ where: { eventId: { in: eventIds } } });
  await prisma.$disconnect();
});

describe('MMP-10 — post-match evaluations', () => {
  it('AC-MMP-10-1: a confirmed player can submit a same-match evaluation within 72 hours', async () => {
    const rater = player();
    const ratee = player();
    const match = await completedMatch([rater, ratee]);

    const response = await submit(match.id, rater, ratee.id, 'intermediate').expect(201);

    expect(response.body).toMatchObject({
      matchId: match.id,
      raterUserId: rater.id,
      rateeUserId: ratee.id,
      perceivedTier: 'intermediate',
      flagged: false,
    });
    expect(response.body.countedAt).toEqual(expect.any(String));
  });

  it('AC-MMP-10-2: a player outside the completed match receives 403', async () => {
    const rater = player();
    const ratee = player();
    const outsider = player();
    const match = await completedMatch([rater, ratee]);

    const response = await submit(match.id, outsider, ratee.id, 'intermediate').expect(403);

    expect(response.body.error.code).toBe('EVALUATION_NOT_MATCH_PARTICIPANT');
  });

  it('AC-MMP-10-3: submission after the approved 72-hour window is rejected', async () => {
    const rater = player();
    const ratee = player();
    const match = await completedMatch([rater, ratee], new Date(Date.now() - 72 * 60 * 60_000 - 1));

    const response = await submit(match.id, rater, ratee.id, 'intermediate').expect(409);

    expect(response.body.error.code).toBe('EVALUATION_WINDOW_CLOSED');
  });

  it('AC-MMP-10-4: a player cannot evaluate themself', async () => {
    const rater = player();
    const match = await completedMatch([rater]);

    const response = await submit(match.id, rater, rater.id, 'intermediate').expect(409);

    expect(response.body.error.code).toBe('SELF_EVALUATION');
  });

  it('preserves a BookingCompleted received before BookingConfirmed and completes the match when confirmation arrives', async () => {
    const bookingId = randomUUID();
    const match = await prisma.match.create({
      data: {
        organizerUserId: player().id,
        bookingId,
        capacity: 2,
        feePerSlot: 50_000n,
        status: 'filled',
        cutoffAt: new Date(),
        fundingRequestedAt: new Date(),
      },
    });
    matchIds.push(match.id);
    const completedEventId = `BookingCompleted:${randomUUID()}`;
    const confirmedEventId = `BookingConfirmed:${randomUUID()}`;
    eventIds.push(completedEventId, confirmedEventId);
    const completedAt = new Date().toISOString();

    await handleBookingCompletedForMatch(completedEventId, { bookingId, completedAt });
    expect(await prisma.match.findUniqueOrThrow({ where: { id: match.id } })).toMatchObject({
      status: 'filled', completedAt: new Date(completedAt),
    });
    await handleBookingConfirmedForMatch(confirmedEventId, {
      bookingId,
      businessUserId: randomUUID(),
      gross: '100000',
      venueId: randomUUID(),
      endAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      source: 'marketplace',
    });
    expect(await prisma.match.findUniqueOrThrow({ where: { id: match.id } })).toMatchObject({
      status: 'completed', completedAt: new Date(completedAt),
    });
  });
});

describe('F-07 — fair evaluation assistant', () => {
  it('AC-F07-1/4: an outlier is flagged with an explanation and cannot change the Passport automatically', async () => {
    const ratee = player();
    const raters = [player(), player(), player(), player()];
    await prisma.passport.create({
      data: { userId: ratee.id, declaredTier: 'intermediate', ratingMu: 1500, ratingRd: 100, ratingSigma: 0.06 },
    });
    const match = await completedMatch([...raters, ratee]);
    for (const rater of raters.slice(0, 3)) {
      await submit(match.id, rater, ratee.id, 'intermediate').expect(201);
    }

    const flagged = await submit(match.id, raters[3]!, ratee.id, 'advanced').expect(201);

    expect(flagged.body).toMatchObject({ flagged: true, flagReason: 'outlier_median_2_tiers', countedAt: null });
    const passport = await request(app)
      .get('/passports/me')
      .set('Authorization', `Bearer ${ratee.token}`)
      .expect(200);
    expect(passport.body).toMatchObject({ rating: 1500, rd: 100, matchesPlayed: 0, evaluationCount: 3 });
  });

  it('AC-F07-2: the third reciprocal top-tier evaluation in 30 days is flagged for Admin', async () => {
    const first = player();
    const second = player();
    const matches = await Promise.all([0, 1, 2].map(() => completedMatch([first, second])));
    for (const match of matches.slice(0, 2)) {
      await submit(match.id, first, second.id, 'advanced').expect(201);
      await submit(match.id, second, first.id, 'advanced').expect(201);
    }
    await submit(matches[2]!.id, first, second.id, 'advanced').expect(201);

    const flagged = await submit(matches[2]!.id, second, first.id, 'advanced').expect(201);

    expect(flagged.body).toMatchObject({
      flagged: true,
      flagReason: 'reciprocal_top_tier_3_matches_30_days',
      countedAt: null,
    });
  });

  it('uses match completion time, not late evaluation submission time, for the 30-day collusion window', async () => {
    const first = player();
    const second = player();
    const expiredCompletion = new Date(Date.now() - 31 * 24 * 60 * 60_000);
    const oldMatches = await Promise.all([0, 1].map(() => completedMatch([first, second], expiredCompletion)));
    await prisma.evaluation.createMany({
      data: oldMatches.flatMap((match) => [
        { matchId: match.id, raterUserId: first.id, rateeUserId: second.id, perceivedTier: 'advanced', countedAt: new Date(Date.now() - 28 * 24 * 60 * 60_000), createdAt: new Date(Date.now() - 28 * 24 * 60 * 60_000) },
        { matchId: match.id, raterUserId: second.id, rateeUserId: first.id, perceivedTier: 'advanced', countedAt: new Date(Date.now() - 28 * 24 * 60 * 60_000), createdAt: new Date(Date.now() - 28 * 24 * 60 * 60_000) },
      ]),
    });
    const current = await completedMatch([first, second]);
    await submit(current.id, first, second.id, 'advanced').expect(201);
    const response = await submit(current.id, second, first.id, 'advanced').expect(201);

    expect(response.body).toMatchObject({ flagged: false, flagReason: null });
  });

  it('serializes reciprocal top-tier detection across concurrent completed matches', async () => {
    const first = player();
    const second = player();
    const matches = await Promise.all([0, 1, 2].map(() => completedMatch([first, second])));
    const responses = await Promise.all(matches.flatMap((match) => [
      submit(match.id, first, second.id, 'advanced'),
      submit(match.id, second, first.id, 'advanced'),
    ]));

    expect(responses).toHaveLength(6);
    expect(responses.every((response) => response.status === 201)).toBe(true);
    expect(responses.some((response) => response.body.flagReason === 'reciprocal_top_tier_3_matches_30_days')).toBe(true);
  });

  it('AC-F07-3: an Admin can approve a flagged evaluation into the Passport aggregate or reject it permanently', async () => {
    const admin = player();
    const ratee = player();
    const raters = [player(), player(), player(), player()];
    await prisma.passport.create({
      data: { userId: ratee.id, declaredTier: 'intermediate', ratingMu: 1500, ratingRd: 100, ratingSigma: 0.06 },
    });
    const match = await completedMatch([...raters, ratee]);
    for (const rater of raters.slice(0, 3)) {
      await submit(match.id, rater, ratee.id, 'intermediate').expect(201);
    }
    const flagged = await submit(match.id, raters[3]!, ratee.id, 'advanced').expect(201);

    const approved = await request(app)
      .patch(`/matches/${match.id}/evaluations/${flagged.body.id}/review`)
      .set('Authorization', `Bearer ${token(admin.id, ['admin'])}`)
      .send({ decision: 'approve' })
      .expect(200);
    expect(approved.body).toMatchObject({ flagged: false, reviewStatus: 'approved' });
    expect(approved.body.countedAt).toEqual(expect.any(String));

    const passport = await request(app)
      .get('/passports/me')
      .set('Authorization', `Bearer ${ratee.token}`)
      .expect(200);
    expect(passport.body).toMatchObject({ evaluationCount: 4, evaluationScore: 1600 });

    const otherMatch = await completedMatch([...raters, ratee]);
    for (const rater of raters.slice(0, 3)) {
      await submit(otherMatch.id, rater, ratee.id, 'intermediate').expect(201);
    }
    const toReject = await submit(otherMatch.id, raters[3]!, ratee.id, 'advanced').expect(201);
    const rejected = await request(app)
      .patch(`/matches/${otherMatch.id}/evaluations/${toReject.body.id}/review`)
      .set('Authorization', `Bearer ${token(admin.id, ['admin'])}`)
      .send({ decision: 'reject' })
      .expect(200);
    expect(rejected.body).toMatchObject({ flagged: true, reviewStatus: 'rejected', countedAt: null });
    const retried = await request(app)
      .patch(`/matches/${otherMatch.id}/evaluations/${toReject.body.id}/review`)
      .set('Authorization', `Bearer ${token(admin.id, ['admin'])}`)
      .send({ decision: 'approve' })
      .expect(409);
    expect(retried.body.error.code).toBe('EVALUATION_ALREADY_REVIEWED');
  });
});
