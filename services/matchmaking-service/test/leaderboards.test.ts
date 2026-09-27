import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import type { AccountClient } from '../src/clients/account.js';
import { sweepRatingAging } from '../src/domain/passport.js';
import { purgeResultCases } from './resultTestUtils.js';

const names = new Map<string, string>();
const accountClient: AccountClient = {
  getPublicMatchProfile: async () => null,
  getPublicDisplayNames: async (userIds) => userIds.map((userId) => ({ userId, displayName: names.get(userId) ?? null, avatarUrl: null })),
};
const app = createApp({ accountClient });
const userIds: string[] = [];
const matchIds: string[] = [];
let seasonId = '';
const token = (userId: string) => `Bearer ${jwt.sign({ sub: userId, roles: ['player'], type: 'access' }, process.env.JWT_SECRET ?? 'change-me-in-real-env', { expiresIn: 300 })}`;

async function ranked(input: { rating: number; rd?: number; played?: number; wins?: number; province?: string; provinceMatches?: number; name?: string }) {
  const userId = randomUUID();
  userIds.push(userId);
  if (input.name) names.set(userId, input.name);
  await prisma.passport.create({ data: { userId, discipline: 'doubles', ratingMu: input.rating, ratingRd: input.rd ?? 100, ratingSigma: 0.06 } });
  await prisma.seasonStat.create({
    data: { seasonId, userId, discipline: 'doubles', matchesPlayed: input.played ?? 5, wins: input.wins ?? 3, provinceMatches: input.provinceMatches ?? 0 },
  });
  if (input.province) await prisma.playerSeasonProfile.create({ data: { seasonId, userId, provinceCode: input.province, lockedAt: new Date() } });
  return userId;
}

beforeAll(async () => {
  seasonId = (await prisma.season.create({ data: { name: 'Kỳ 2096', startAt: new Date('2096-01-01T00:00:00Z'), endAt: new Date('2096-04-01T00:00:00Z') } })).id;
});

afterAll(async () => {
  await purgeResultCases(matchIds);
  await prisma.matchRatingChange.deleteMany({ where: { matchId: { in: matchIds } } });
  await prisma.join.deleteMany({ where: { matchId: { in: matchIds } } });
  await prisma.match.deleteMany({ where: { id: { in: matchIds } } });
  await prisma.seasonStat.deleteMany({ where: { seasonId } });
  await prisma.playerSeasonProfile.deleteMany({ where: { seasonId } });
  await prisma.season.deleteMany({ where: { id: seasonId } });
  await prisma.passport.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.$disconnect();
});

const board = (query: string, viewer?: string) => {
  const call = request(app).get(`/competition/leaderboards?seasonId=${seasonId}&discipline=doubles&${query}`);
  return viewer ? call.set('Authorization', token(viewer)) : call;
};

describe('Task 18 leaderboards', () => {
  it('lists only eligible players by band with shared ranks, a public-field allowlist, pagination and a pinned viewer', async () => {
    const top = await ranked({ rating: 1650, name: 'Anh A' });
    const tie = await ranked({ rating: 1650.4 });
    const third = await ranked({ rating: 1600 }); // đúng 1600 thuộc nhóm từ 1600
    await ranked({ rating: 1700, played: 4 }); // chưa đủ 5 kết quả
    await ranked({ rating: 1700, rd: 200 }); // RD 200 là bất định cao
    const almost = await ranked({ rating: 1599.6, rd: 199.999 });

    const upper = await board('band=from_1600&page=1&pageSize=2', third).expect(200);
    expect(upper.body).toMatchObject({ total: 3, page: 1, pageSize: 2 });
    expect(upper.body.items.map((item: { userId: string; rank: number }) => [item.userId, item.rank]))
      .toEqual([[top, 1], [tie, 1]].sort((x, y) => String(x[0]).localeCompare(String(y[0]))));
    expect(Object.keys(upper.body.items[0]).sort()).toEqual(['avatarUrl', 'displayName', 'matchesPlayed', 'provinceCode', 'rank', 'rating', 'userId', 'wins']);
    expect(upper.body.items.find((item: { userId: string }) => item.userId === top).displayName).toBe('Anh A');
    expect(upper.body.items.find((item: { userId: string }) => item.userId === tie).displayName).toBe('Người chơi');
    expect(upper.body.viewer).toMatchObject({ userId: third, rank: 3, rating: 1600 });
    expect(typeof upper.body.serverNow).toBe('string');

    const lower = await board('band=under_1600').expect(200);
    expect(lower.body.items.map((item: { userId: string }) => item.userId)).toContain(almost);
    // Vượt 1600 là chuyển bảng ngay (không chờ kỳ sau).
    await prisma.passport.update({ where: { userId_discipline: { userId: almost, discipline: 'doubles' } }, data: { ratingMu: 1601 } });
    expect((await board('band=from_1600').expect(200)).body.items.map((item: { userId: string }) => item.userId)).toContain(almost);
  });

  it('province boards need the locked province and five province matches', async () => {
    const qualified = await ranked({ rating: 1300, province: 'hue', provinceMatches: 5 });
    await ranked({ rating: 1310, province: 'hue', provinceMatches: 4 });
    await ranked({ rating: 1320, province: 'da-nang', provinceMatches: 6 });
    const response = await board('band=under_1600&scope=province&provinceCode=hue').expect(200);
    expect(response.body.items.map((item: { userId: string; provinceCode: string }) => [item.userId, item.provinceCode])).toEqual([[qualified, 'hue']]);
  });
});

describe('Task 18 Passport match history', () => {
  it('pages singles and doubles history separately with nullable non-rated delta', async () => {
    const me = randomUUID(); const opp = randomUUID();
    userIds.push(me, opp);
    names.set(opp, 'Đối thủ');
    const make = async (discipline: 'singles' | 'doubles', finalizedAt: string, delta: number | null) => {
      const match = await prisma.match.create({
        data: {
          bookingId: randomUUID(), organizerUserId: opp, capacity: 2, discipline, feePerSlot: 0n, status: 'completed', mode: 'ranked',
          cutoffAt: new Date(finalizedAt), endAt: new Date(finalizedAt), joins: { create: { participantUserId: me, teamSide: 'B', status: 'confirmed' } },
        },
      });
      matchIds.push(match.id);
      const resultCase = await prisma.matchResultCase.create({
        data: { matchId: match.id, status: 'final', outcome: 'TEAM_B_WIN', finalizedAt: new Date(finalizedAt), declarationDeadlineAt: new Date(finalizedAt) },
      });
      await prisma.resultClaim.create({
        data: {
          caseId: resultCase.id, claimantUserId: me, outcome: 'TEAM_B_WIN', setWinsA: 0, setWinsB: 2,
          sets: { create: [{ position: 0, teamA: 15, teamB: 21 }, { position: 1, teamA: 19, teamB: 21 }] },
        },
      });
      if (delta !== null) await prisma.matchRatingChange.create({ data: { matchId: match.id, userId: me, discipline, ratingBefore: 1500, ratingAfter: 1500 + delta, delta } });
      return match;
    };
    const rated = await make('singles', '2096-02-02T00:00:00Z', 12.4);
    const unrated = await make('singles', '2096-02-01T00:00:00Z', null);
    await make('doubles', '2096-02-03T00:00:00Z', 5);

    const page = await request(app).get('/passports/me/matches?discipline=singles&page=1&pageSize=1').set('Authorization', token(me)).expect(200);
    expect(page.body).toMatchObject({ total: 2, page: 1, pageSize: 1 });
    expect(page.body.items).toEqual([{
      matchId: rated.id, businessCode: rated.businessCode, endedAt: '2096-02-02T00:00:00.000Z', discipline: 'singles', mode: 'ranked', outcome: 'win',
      scoreLabel: '21-15, 21-19', opponents: [{ userId: opp, displayName: 'Đối thủ', avatarUrl: null }], ratingDelta: 12,
    }]);
    const second = await request(app).get('/passports/me/matches?discipline=singles&page=2&pageSize=1').set('Authorization', token(me)).expect(200);
    expect(second.body.items[0]).toMatchObject({ matchId: unrated.id, ratingDelta: null });
    const doubles = await request(app).get('/passports/me/matches?discipline=doubles').set('Authorization', token(me)).expect(200);
    expect(doubles.body.total).toBe(1);
  });
});

describe('Task 18 RD aging', () => {
  it('ages RD once per missed 7-day period, caps at 350, and replays as a no-op', async () => {
    const userId = randomUUID();
    userIds.push(userId);
    await prisma.passport.create({ data: { userId, discipline: 'singles', ratingMu: 1500, ratingRd: 300, ratingSigma: 0.06 } });
    const start = new Date('2096-05-01T00:00:00Z');
    await sweepRatingAging(start, [userId]);
    const rd = async () => (await prisma.passport.findUniqueOrThrow({ where: { userId_discipline: { userId, discipline: 'singles' } } }));
    expect(await rd()).toMatchObject({ ratingRd: 300, lastAgedAt: start });
    const later = new Date(start.getTime() + 15 * 24 * 60 * 60_000);
    await sweepRatingAging(later, [userId]);
    const aged = await rd();
    expect(aged.ratingRd).toBeGreaterThan(300);
    expect(aged.lastAgedAt).toEqual(new Date(start.getTime() + 14 * 24 * 60 * 60_000));
    await sweepRatingAging(later, [userId]);
    expect((await rd()).ratingRd).toBe(aged.ratingRd);
    // Trần 350: RD sát trần sau nhiều kỳ không hoạt động không vượt 350.
    await prisma.passport.update({ where: { userId_discipline: { userId, discipline: 'singles' } }, data: { ratingRd: 349.5 } });
    await sweepRatingAging(new Date(start.getTime() + 400 * 24 * 60 * 60_000), [userId]);
    expect((await rd()).ratingRd).toBe(350);
  });
});
