import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import type { MatchBookingResolutionPayload } from '@khoaluantn/shared';
import type { VenueBookingClient, VenueMatchContext } from '../src/clients/venueBooking.js';

class FakeVenueBookingClient implements VenueBookingClient {
  async getMatchContext(): Promise<VenueMatchContext | null> { return null; }
  async createBookingFromHold(): Promise<string> { throw new Error('not used'); }
  async cancelConfirmedBooking(): Promise<{ refundPercent: number }> { return { refundPercent: 50 }; }
  async resolveMatchBooking(): Promise<MatchBookingResolutionPayload> { throw new Error('not used'); }
}

const app = createApp({ venueBookingClient: new FakeVenueBookingClient() });
const createdMatchIds: string[] = [];
const passportUserIds: string[] = [];

function playerToken(userId: string): string {
  return jwt.sign(
    { sub: userId, roles: ['player'], type: 'access' },
    process.env.JWT_SECRET ?? 'change-me-in-real-env',
    { expiresIn: 300 },
  );
}

afterEach(async () => {
  if (createdMatchIds.length > 0) {
    const ids = createdMatchIds.splice(0);
    const joins = await prisma.join.findMany({ where: { matchId: { in: ids } }, select: { id: true } });
    await prisma.outbox.deleteMany({ where: { aggregateId: { in: [...ids, ...joins.map((join) => join.id)] } } });
    await prisma.join.deleteMany({ where: { matchId: { in: ids } } });
    await prisma.matchResolution.deleteMany({ where: { matchId: { in: ids } } });
    await prisma.match.deleteMany({ where: { id: { in: ids } } });
  }
  if (passportUserIds.length > 0) {
    await prisma.passport.deleteMany({ where: { userId: { in: passportUserIds.splice(0) } } });
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('F-02 — compatibility shown to the organizer', () => {
  it('returns a score and grounded explanation for each pending join', async () => {
    const organizerUserId = randomUUID();
    const participantUserId = randomUUID();
    passportUserIds.push(organizerUserId, participantUserId);
    const match = await prisma.match.create({
      data: {
        organizerUserId,
        bookingId: randomUUID(),
        capacity: 4,
        feePerSlot: 100000n,
        cutoffAt: new Date(Date.now() + 2 * 60 * 60_000),
        skillMin: 'intermediate',
        skillMax: 'intermediate',
      },
    });
    createdMatchIds.push(match.id);
    await prisma.passport.createMany({
      data: [
        { userId: organizerUserId, ratingMu: 1515, ratingRd: 85, ratingSigma: 0.06 },
        { userId: participantUserId, ratingMu: 1515, ratingRd: 80, ratingSigma: 0.06 },
      ],
    });
    await prisma.join.create({ data: { matchId: match.id, participantUserId } });

    const response = await request(app)
      .get(`/matches/${match.id}/joins/pending`)
      .set('Authorization', `Bearer ${playerToken(organizerUserId)}`)
      .expect(200);

    expect(response.body.joins).toEqual([
      expect.objectContaining({
        participantUserId,
        compatibilityScore: expect.any(Number),
        compatibilityExplanation: expect.stringContaining('lệch rating 15'),
      }),
    ]);
    expect(response.body.joins[0].compatibilityScore).toBeGreaterThanOrEqual(80);
    expect(response.body.joins[0].compatibilityExplanation).toContain('chưa có dữ liệu khung giờ');
  });

  it('grounds the rating component in the match skill range, not the organizer rating', async () => {
    const organizerUserId = randomUUID();
    const participantUserId = randomUUID();
    passportUserIds.push(organizerUserId, participantUserId);
    const match = await prisma.match.create({
      data: {
        organizerUserId,
        bookingId: randomUUID(),
        capacity: 4,
        feePerSlot: 100000n,
        cutoffAt: new Date(Date.now() + 2 * 60 * 60_000),
        skillMin: 'advanced',
        skillMax: 'advanced',
      },
    });
    createdMatchIds.push(match.id);
    await prisma.passport.createMany({
      data: [
        { userId: organizerUserId, ratingMu: 1100, ratingRd: 80, ratingSigma: 0.06 },
        { userId: participantUserId, ratingMu: 1100, ratingRd: 80, ratingSigma: 0.06 },
      ],
    });
    await prisma.join.create({ data: { matchId: match.id, participantUserId } });

    const response = await request(app)
      .get(`/matches/${match.id}/joins/pending`)
      .set('Authorization', `Bearer ${playerToken(organizerUserId)}`)
      .expect(200);

    expect(response.body.joins[0]).toEqual(expect.objectContaining({
      compatibilityScore: expect.any(Number),
      compatibilityExplanation: expect.stringContaining('lệch rating 800'),
    }));
    expect(response.body.joins[0].compatibilityScore).toBeLessThan(40);
  });
});
