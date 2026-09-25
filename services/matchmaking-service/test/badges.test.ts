import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { handleRatingPeriodReady } from '../src/lib/ratingEventConsumer.js';
import { closeSeason } from '../src/domain/seasons.js';
import type { AccountClient } from '../src/clients/account.js';

const accountClient: AccountClient = { getPublicMatchProfile: async () => null, getPublicDisplayNames: async (ids) => ids.map((userId) => ({ userId, displayName: null, avatarUrl: null })) };
const app = createApp({ accountClient });
const userIds: string[] = [];
const matchIds: string[] = [];
const seasonIds: string[] = [];
const eventIds: string[] = [];

afterAll(async () => {
  await prisma.playerBadge.deleteMany({ where: { seasonId: { in: seasonIds } } });
  const { purgeResultCases } = await import('./resultTestUtils.js');
  await purgeResultCases(matchIds);
  await prisma.matchRatingChange.deleteMany({ where: { matchId: { in: matchIds } } });
  await prisma.ratedEncounter.deleteMany({ where: { matchId: { in: matchIds } } });
  await prisma.processedEvent.deleteMany({ where: { eventId: { in: eventIds } } });
  await prisma.match.deleteMany({ where: { id: { in: matchIds } } });
  await prisma.seasonStat.deleteMany({ where: { seasonId: { in: seasonIds } } });
  await prisma.playerSeasonProfile.deleteMany({ where: { seasonId: { in: seasonIds } } });
  await prisma.season.deleteMany({ where: { id: { in: seasonIds } } });
  await prisma.passport.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.$disconnect();
});

async function season(name: string, start: string, end: string) {
  const created = await prisma.season.create({ data: { name, startAt: new Date(start), endAt: new Date(end) } });
  seasonIds.push(created.id);
  return created;
}

async function user(rating = 1500, discipline: 'singles' | 'doubles' = 'singles') {
  const userId = randomUUID();
  userIds.push(userId);
  await prisma.passport.create({ data: { userId, discipline, ratingMu: rating, ratingRd: 100, ratingSigma: 0.06 } });
  return userId;
}

/** Một kết quả ranked đã được giữ suất, kết thúc trong kỳ; `rated=false` mô phỏng trận vượt giới hạn 7 ngày. */
async function result(userId: string, win: boolean, endAt: string, rated = true) {
  const match = await prisma.match.create({
    data: { bookingId: randomUUID(), organizerUserId: userId, capacity: 2, feePerSlot: 0n, status: 'completed', mode: 'ranked', cutoffAt: new Date(endAt), endAt: new Date(endAt) },
  });
  matchIds.push(match.id);
  await prisma.ratedEncounter.create({ data: { matchId: match.id, userId, discipline: 'singles', opponentKey: randomUUID(), finalizedAt: new Date(endAt), rated } });
  const eventId = `RatingPeriodReady:${randomUUID()}`;
  eventIds.push(eventId);
  const payload = { matchId: match.id, userId, discipline: 'singles' as const, results: [{ opponentRating: 1500, opponentRd: 100, score: win ? 1 : 0 }] };
  await handleRatingPeriodReady(eventId, payload);
  return { eventId, payload };
}

const badgeTypes = async (userId: string) => (await prisma.playerBadge.findMany({ where: { userId }, orderBy: { badgeType: 'asc' } }))
  .map((badge) => badge.badgeType);

describe('Task 19 badges', () => {
  it('awards a streak badge at every multiple of five, resets on loss, skips non-rated results and ignores replay', async () => {
    await season('Kỳ 2097', '2097-01-01T00:00:00Z', '2097-06-01T00:00:00Z');
    const userId = await user();
    let last: Awaited<ReturnType<typeof result>> | undefined;
    for (let day = 1; day <= 4; day += 1) last = await result(userId, true, `2097-01-0${day}T10:00:00Z`);
    await result(userId, true, '2097-01-05T10:00:00Z', false); // trận vượt giới hạn: không tính chuỗi
    expect(await badgeTypes(userId)).toEqual([]);
    await result(userId, true, '2097-01-06T10:00:00Z');
    expect(await badgeTypes(userId)).toEqual(['WIN_STREAK_5']);
    await handleRatingPeriodReady(last!.eventId, last!.payload);
    for (let day = 7; day <= 11; day += 1) await result(userId, true, `2097-01-${String(day).padStart(2, '0')}T10:00:00Z`);
    expect(await badgeTypes(userId)).toEqual(['WIN_STREAK_10', 'WIN_STREAK_5']);
    await result(userId, false, '2097-01-12T10:00:00Z');
    for (let day = 13; day <= 16; day += 1) await result(userId, true, `2097-01-${day}T10:00:00Z`);
    expect(await badgeTypes(userId)).toEqual(['WIN_STREAK_10', 'WIN_STREAK_5']);
  });

  it('awards Top 10 and King of Court (ties included) only when the season closes, and keeps them in later seasons', async () => {
    const closing = await season('Kỳ 2098', '2098-01-01T00:00:00Z', '2098-03-01T00:00:00Z');
    const players: string[] = [];
    for (const rating of [1900, 1900, ...Array.from({ length: 10 }, (_, index) => 1850 - index)]) {
      const userId = await user(rating, 'doubles');
      players.push(userId);
      await prisma.seasonStat.create({ data: { seasonId: closing.id, userId, discipline: 'doubles', matchesPlayed: 6 } });
    }
    expect(await prisma.playerBadge.count({ where: { seasonId: closing.id } })).toBe(0);
    await closeSeason(closing.id, new Date('2098-03-02T00:00:00Z'));
    await closeSeason(closing.id, new Date('2098-03-03T00:00:00Z'));
    const [kingA, kingB] = players;
    expect(await badgeTypes(kingA!)).toEqual(['KING_OF_COURT', 'TOP_10']);
    expect(await badgeTypes(kingB!)).toEqual(['KING_OF_COURT', 'TOP_10']);
    expect(await badgeTypes(players[9]!)).toEqual(['TOP_10']); // hạng 10
    expect(await badgeTypes(players[10]!)).toEqual([]); // hạng 11
    expect(await prisma.playerBadge.count({ where: { seasonId: closing.id } })).toBe(12);

    await season('Kỳ 2098-2', '2098-03-01T00:00:00Z', '2098-06-01T00:00:00Z');
    const passport = await request(app).get(`/passports/${kingA}`).expect(200);
    expect(passport.body.badges).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Vua sân', disciplineLabel: 'Đôi', seasonName: 'Kỳ 2098', provinceName: null }),
      expect.objectContaining({ label: 'Top 10' }),
    ]));
    expect(JSON.stringify(passport.body.badges)).not.toMatch(/KING_OF_COURT|TOP_10|doubles/);
    const own = await request(app).get('/passports/me')
      .set('Authorization', `Bearer ${jwt.sign({ sub: kingA, roles: ['player'], type: 'access' }, process.env.JWT_SECRET ?? 'change-me-in-real-env')}`)
      .expect(200);
    expect(own.body.badges).toHaveLength(2);
  });
});

describe('G4 review — closing a season', () => {
  it('refuses to close while a result or rating is pending, then freezes the closed leaderboard', async () => {
    const target = await season('Kỳ 2088', '2088-01-01T00:00:00Z', '2088-03-01T00:00:00Z');
    const top = await user(1700, 'doubles');
    await prisma.seasonStat.create({ data: { seasonId: target.id, userId: top, discipline: 'doubles', matchesPlayed: 6 } });
    const pending = await prisma.match.create({
      data: { bookingId: randomUUID(), organizerUserId: top, capacity: 4, discipline: 'doubles', feePerSlot: 0n, status: 'completed', mode: 'ranked', cutoffAt: new Date('2088-02-01T00:00:00Z'), endAt: new Date('2088-02-01T00:00:00Z') },
    });
    matchIds.push(pending.id);
    const after = new Date('2088-03-02T00:00:00Z');
    await expect(closeSeason(target.id, after)).rejects.toMatchObject({ code: 'SEASON_RESULTS_PENDING' });
    await prisma.matchResultCase.create({ data: { matchId: pending.id, status: 'final', outcome: 'TEAM_A_WIN', declarationDeadlineAt: after } });
    await prisma.ratedEncounter.create({ data: { matchId: pending.id, userId: top, discipline: 'doubles', opponentKey: 'x', finalizedAt: after, rated: true } });
    await expect(closeSeason(target.id, after)).rejects.toMatchObject({ code: 'SEASON_RESULTS_PENDING' });
    await prisma.matchRatingChange.create({ data: { matchId: pending.id, userId: top, discipline: 'doubles', ratingBefore: 1690, ratingAfter: 1700, delta: 10 } });
    await closeSeason(target.id, after);

    await prisma.passport.update({ where: { userId_discipline: { userId: top, discipline: 'doubles' } }, data: { ratingMu: 1500, ratingRd: 300 } });
    const board = await request(app).get(`/competition/leaderboards?seasonId=${target.id}&discipline=doubles&band=from_1600`).expect(200);
    expect(board.body.items).toEqual([expect.objectContaining({ userId: top, rating: 1700, rank: 1 })]);
  });
});

