import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import type { MatchmakerCandidate, MatchmakerExplanationClient } from '@khoaluantn/ai';
import type { MatchBookingResolutionPayload } from '@khoaluantn/shared';
import type { VenueBookingClient, VenueMatchContext } from '../src/clients/venueBooking.js';

class FakeVenueBookingClient implements VenueBookingClient {
  readonly contexts = new Map<string, VenueMatchContext>();

  async getMatchContext(bookingId: string): Promise<VenueMatchContext | null> {
    return this.contexts.get(bookingId) ?? null;
  }

  async createBookingFromHold(): Promise<string> { throw new Error('not used'); }
  async cancelConfirmedBooking(): Promise<{ refundPercent: number }> { return { refundPercent: 50 }; }
  async resolveMatchBooking(): Promise<MatchBookingResolutionPayload> { throw new Error('not used'); }
}

class FakeMatchmakerClient implements MatchmakerExplanationClient {
  seenCandidates: readonly MatchmakerCandidate[] = [];

  async explain(candidates: readonly MatchmakerCandidate[]) {
    this.seenCandidates = candidates;
    return candidates.map((candidate) => ({
      matchId: candidate.matchId,
      reasonIndexes: [0],
    }));
  }
}

const venueClient = new FakeVenueBookingClient();
const matchmakerClient = new FakeMatchmakerClient();
const app = createApp({ venueBookingClient: venueClient, matchmakerClient });
const fallbackApp = createApp({
  venueBookingClient: venueClient,
  matchmakerClient: { explain: async () => { throw new Error('quota exceeded'); } },
});
const matchIds: string[] = [];
const passportUserIds: string[] = [];

function playerToken(userId: string): string {
  return jwt.sign(
    { sub: userId, roles: ['player'], type: 'access' },
    process.env.JWT_SECRET ?? 'change-me-in-real-env',
    { expiresIn: 300 },
  );
}

async function createOpenMatch(skillMin: 'beginner' | 'intermediate' | 'advanced') {
  const bookingId = randomUUID();
  const organizerUserId = randomUUID();
  const startAt = new Date(Date.now() + 3 * 60 * 60_000);
  venueClient.contexts.set(bookingId, {
    bookingId,
    ownerUserId: organizerUserId,
    status: 'held',
    priceSnapshot: '400000',
    startAt: startAt.toISOString(),
    endAt: new Date(startAt.getTime() + 60 * 60_000).toISOString(),
    holdExpiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    court: { id: randomUUID(), name: 'Sân 1' },
    venue: { id: randomUUID(), name: 'Cầu Lông Quận 1', address: 'Quận 1', lat: 10.77, lng: 106.7 },
  });
  const match = await prisma.match.create({
    data: {
      organizerUserId,
      bookingId,
      capacity: 4,
      feePerSlot: 100000n,
      cutoffAt: new Date(Date.now() + 2 * 60 * 60_000),
      skillMin,
      skillMax: skillMin,
    },
  });
  matchIds.push(match.id);
  return { match, organizerUserId };
}

afterEach(async () => {
  if (matchIds.length > 0) {
    const ids = matchIds.splice(0);
    const joins = await prisma.join.findMany({ where: { matchId: { in: ids } }, select: { id: true } });
    await prisma.outbox.deleteMany({ where: { aggregateId: { in: [...ids, ...joins.map((join) => join.id)] } } });
    await prisma.join.deleteMany({ where: { matchId: { in: ids } } });
    await prisma.matchResolution.deleteMany({ where: { matchId: { in: ids } } });
    await prisma.match.deleteMany({ where: { id: { in: ids } } });
  }
  if (passportUserIds.length > 0) {
    await prisma.passport.deleteMany({ where: { userId: { in: passportUserIds.splice(0) } } });
  }
  venueClient.contexts.clear();
  matchmakerClient.seenCandidates = [];
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('AI-01 matchmaker', () => {
  it('revalidates chat criteria and returns deterministic F-02 suggestions without action execution', async () => {
    const playerUserId = randomUUID(); passportUserIds.push(playerUserId);
    await prisma.passport.create({ data: { userId: playerUserId, ratingMu: 1500, ratingRd: 80, ratingSigma: 0.06 } });
    await createOpenMatch('intermediate');
    const response = await request(app).post('/matches/suggestions/ai/chat').set('Authorization', `Bearer ${playerToken(playerUserId)}`).send({ message: 'Tìm kèo tối nay', criteria: { area: 'Quận 1', feeMax: '120000' } }).expect(200);
    expect(response.body.normalizedCriteria.area).toBe('Quận 1'); expect(response.body.suggestions[0]).toMatchObject({ score: expect.any(Number), matchId: expect.any(String) }); expect(await prisma.join.count({ where: { participantUserId: playerUserId } })).toBe(0);
  });

  it('falls back from invalid normalized criteria and returns a navigation CTA for action requests', async () => {
    const playerUserId = randomUUID(); passportUserIds.push(playerUserId);
    await prisma.passport.create({ data: { userId: playerUserId, ratingMu: 1500, ratingRd: 80, ratingSigma: 0.06 } });
    await createOpenMatch('intermediate');
    const response = await request(app)
      .post('/matches/suggestions/ai/chat')
      .set('Authorization', `Bearer ${playerToken(playerUserId)}`)
      .send({ message: 'Tham gia kèo này giúp tôi', criteria: { feeMax: 'không hợp lệ' } })
      .expect(200);
    expect(response.body.normalizedCriteria).toEqual({});
    expect(response.body.actionPath).toBe('/matches');
    expect(response.body.answer).toContain('không tự thực hiện');
    expect(await prisma.join.count({ where: { participantUserId: playerUserId } })).toBe(0);
  });

  it('normalizes only criteria grounded in the player message before recomputing suggestions', async () => {
    const playerUserId = randomUUID(); passportUserIds.push(playerUserId);
    await prisma.passport.create({ data: { userId: playerUserId, ratingMu: 1500, ratingRd: 80, ratingSigma: 0.06 } });
    await createOpenMatch('intermediate');
    const response = await request(app)
      .post('/matches/suggestions/ai/chat')
      .set('Authorization', `Bearer ${playerToken(playerUserId)}`)
      .send({ message: 'Tìm kèo tại Phú Nhuận, tối đa 120.000đ' })
      .expect(200);
    expect(response.body.normalizedCriteria).toEqual({ area: 'Phú Nhuận', feeMax: '120000' });
    expect(response.body.suggestions.every((item: { matchId: string; score: number }) => item.matchId && Number.isFinite(item.score))).toBe(true);
  });
  it('AC-AI-01-1/2/4/5: ranks three public matches and leaves joining to the standard MMP-04 route', async () => {
    const playerUserId = randomUUID();
    passportUserIds.push(playerUserId);
    await prisma.passport.create({
      data: { userId: playerUserId, ratingMu: 1500, ratingRd: 80, ratingSigma: 0.06 },
    });
    const [{ match: lowMatch }, { match: highMatch }, { match: middleMatch, organizerUserId }] = await Promise.all([
      createOpenMatch('advanced'), createOpenMatch('intermediate'), createOpenMatch('beginner'),
    ]);

    const response = await request(app)
      .get('/matches/suggestions/ai?area=Quận%201')
      .set('Authorization', `Bearer ${playerToken(playerUserId)}`)
      .expect(200);

    expect(response.body.suggestions).toHaveLength(3);
    expect(response.body.suggestions.map((suggestion: { score: number }) => suggestion.score))
      .toEqual([...response.body.suggestions.map((suggestion: { score: number }) => suggestion.score)]
        .sort((left: number, right: number) => right - left));
    expect(response.body.suggestions).toEqual(expect.arrayContaining([
      expect.objectContaining({ matchId: highMatch.id, source: 'gemini', explanation: expect.any(String) }),
      expect.objectContaining({ matchId: middleMatch.id, source: 'gemini' }),
      expect.objectContaining({ matchId: lowMatch.id, source: 'gemini' }),
    ]));
    expect(JSON.stringify(matchmakerClient.seenCandidates)).not.toContain(organizerUserId);

    const topSuggestion = response.body.suggestions[0] as { matchId: string; joinPath: string };
    expect(topSuggestion.joinPath).toBe(`/matches/${topSuggestion.matchId}/joins`);
    expect(await prisma.join.count({ where: { participantUserId: playerUserId } })).toBe(0);
    await request(app)
      .post(topSuggestion.joinPath)
      .set('Authorization', `Bearer ${playerToken(playerUserId)}`)
      .expect(201);
  });

  it('AC-AI-01-3: returns ranked short fallback explanations when Gemini fails', async () => {
    const playerUserId = randomUUID();
    passportUserIds.push(playerUserId);
    await prisma.passport.create({
      data: { userId: playerUserId, ratingMu: 1500, ratingRd: 80, ratingSigma: 0.06 },
    });
    await Promise.all([createOpenMatch('intermediate'), createOpenMatch('advanced'), createOpenMatch('beginner')]);

    const response = await request(fallbackApp)
      .get('/matches/suggestions/ai?area=Quận%201')
      .set('Authorization', `Bearer ${playerToken(playerUserId)}`)
      .expect(200);

    expect(response.body.suggestions).toHaveLength(3);
    expect(response.body.suggestions).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'fallback', explanation: expect.stringContaining('Giải thích rút gọn') }),
    ]));
  });
});
