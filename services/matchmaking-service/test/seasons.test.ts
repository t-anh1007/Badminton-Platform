import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import {
  closeSeason, createSeason, findActiveSeason, seasonStatus, selectSeasonRegion, updateSeason,
} from '../src/domain/seasons.js';
import { requestJoin } from '../src/domain/matches.js';

// Mốc năm 2090 để không chồng với kỳ thật trong DB dùng chung; mọi hàm nhận `now`.
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const app = createApp();
const seasonIds: string[] = [];
const matchIds: string[] = [];
const userIds: string[] = [];
const token = (userId: string, roles: string[]) => jwt.sign(
  { sub: userId, roles, type: 'access' }, process.env.JWT_SECRET ?? 'change-me-in-real-env', { expiresIn: 300 },
);

afterAll(async () => {
  await prisma.seasonStat.deleteMany({ where: { seasonId: { in: seasonIds } } });
  await prisma.playerSeasonProfile.deleteMany({ where: { seasonId: { in: seasonIds } } });
  await prisma.season.deleteMany({ where: { id: { in: seasonIds } } });
  await prisma.outbox.deleteMany({ where: { aggregateId: { in: matchIds } } });
  const joinIds = (await prisma.join.findMany({ where: { matchId: { in: matchIds } }, select: { id: true } })).map((row) => row.id);
  await prisma.outbox.deleteMany({ where: { aggregateId: { in: joinIds } } });
  await prisma.join.deleteMany({ where: { matchId: { in: matchIds } } });
  await prisma.match.deleteMany({ where: { id: { in: matchIds } } });
  await prisma.passport.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.$disconnect();
});

async function season(name: string, startAt: Date, endAt: Date) {
  const created = await createSeason({ name, startAt, endAt });
  seasonIds.push(created.id);
  return created;
}

describe('Task 17 global season calendar', () => {
  it('rejects overlap, accepts exact adjacency, and has exactly one active season at any instant', async () => {
    const first = await season('Kỳ 2090-1', d('2090-01-01'), d('2090-04-01'));
    await expect(createSeason({ name: 'chồng', startAt: d('2090-03-01'), endAt: d('2090-06-01') })).rejects.toMatchObject({ code: 'SEASON_OVERLAP' });
    await expect(createSeason({ name: 'ngược', startAt: d('2090-09-01'), endAt: d('2090-08-01') })).rejects.toMatchObject({ code: 'SEASON_RANGE_INVALID' });
    const second = await season('Kỳ 2090-2', d('2090-04-01'), d('2090-07-01'));

    expect((await findActiveSeason(prisma, d('2090-02-01')))?.id).toBe(first.id);
    expect((await findActiveSeason(prisma, d('2090-04-01')))?.id).toBe(second.id);
    expect([
      seasonStatus(second, d('2090-02-01')), seasonStatus(second, d('2090-05-01')), seasonStatus(second, d('2090-07-01')),
    ]).toEqual(['scheduled', 'active', 'closing']);

    await expect(updateSeason(second.id, { startAt: d('2090-03-15') }, d('2090-02-01'))).rejects.toMatchObject({ code: 'SEASON_OVERLAP' });
    await expect(updateSeason(first.id, { startAt: d('2090-01-02') }, d('2090-02-01'))).rejects.toMatchObject({ code: 'SEASON_STARTED' });
    await expect(closeSeason(first.id, d('2090-03-01'))).rejects.toMatchObject({ code: 'SEASON_NOT_ENDED' });
    const closed = await closeSeason(first.id, d('2090-04-02'));
    expect(seasonStatus(closed, d('2090-04-02'))).toBe('closed');
  });

  it('locks the primary province once per season and starts the next season with empty stats', async () => {
    const current = await season('Kỳ 2091-1', d('2091-01-01'), d('2091-04-01'));
    const next = await season('Kỳ 2091-2', d('2091-04-01'), d('2091-07-01'));
    const userId = randomUUID();
    userIds.push(userId);
    await expect(selectSeasonRegion(userId, 'ha-noi', d('2090-12-01'))).rejects.toMatchObject({ code: 'NO_ACTIVE_SEASON' });
    await selectSeasonRegion(userId, 'ha-noi', d('2091-02-01'));
    await expect(selectSeasonRegion(userId, 'da-nang', d('2091-03-01'))).rejects.toMatchObject({ code: 'SEASON_REGION_LOCKED' });
    // Kỳ sau được chọn lại; Passport giữ nguyên, số liệu kỳ bắt đầu trống.
    await prisma.passport.create({ data: { userId, discipline: 'singles', ratingMu: 1650, ratingRd: 80, ratingSigma: 0.06, matchesPlayed: 9 } });
    await prisma.seasonStat.create({ data: { seasonId: current.id, userId, discipline: 'singles', matchesPlayed: 9, wins: 6 } });
    await selectSeasonRegion(userId, 'da-nang', d('2091-05-01'));
    expect(await prisma.seasonStat.count({ where: { seasonId: next.id, userId } })).toBe(0);
    expect(await prisma.passport.findUniqueOrThrow({ where: { userId_discipline: { userId, discipline: 'singles' } } }))
      .toMatchObject({ ratingMu: 1650, matchesPlayed: 9 });

    const invalid = await request(app).put('/competition/seasons/current/me/region')
      .set('Authorization', `Bearer ${token(userId, ['player'])}`).send({ provinceCode: 'sai-gon-cu' });
    expect(invalid.status).toBe(400);
  });

  it('pages the Admin list with business status and eligible-player counts', async () => {
    const target = await season('Kỳ 2092', d('2092-01-01'), d('2092-04-01'));
    const eligible = randomUUID(); const uncertain = randomUUID(); const tooFew = randomUUID();
    userIds.push(eligible, uncertain, tooFew);
    for (const [userId, rd, played] of [[eligible, 100, 5], [uncertain, 200, 7], [tooFew, 90, 4]] as const) {
      await prisma.passport.create({ data: { userId, discipline: 'doubles', ratingMu: 1500, ratingRd: rd, ratingSigma: 0.06 } });
      await prisma.seasonStat.create({ data: { seasonId: target.id, userId, discipline: 'doubles', matchesPlayed: played } });
    }
    const admin = `Bearer ${token(randomUUID(), ['admin'])}`;
    const page = await request(app).get('/competition/admin/seasons?page=1&pageSize=2').set('Authorization', admin).expect(200);
    expect(page.body).toMatchObject({ page: 1, pageSize: 2 });
    expect(page.body.items).toHaveLength(2);
    expect(page.body.total).toBeGreaterThanOrEqual(5);
    const all = await request(app).get('/competition/admin/seasons?pageSize=100').set('Authorization', admin).expect(200);
    expect(all.body.items.find((item: { id: string }) => item.id === target.id)).toEqual({
      id: target.id, name: 'Kỳ 2092', startAt: '2092-01-01T00:00:00.000Z', endAt: '2092-04-01T00:00:00.000Z',
      status: 'scheduled', eligiblePlayerCount: 1,
    });
    await request(app).get('/competition/admin/seasons').set('Authorization', `Bearer ${token(randomUUID(), ['player'])}`).expect(403);
    const created = await request(app).post('/competition/admin/seasons').set('Authorization', admin)
      .send({ name: 'Kỳ 2093', startAt: '2093-01-01T00:00:00.000Z', endAt: '2093-02-01T00:00:00.000Z' }).expect(201);
    seasonIds.push(created.body.season.id);
  });

  it('requires the season region before joining a ranked match but never blocks friendly play', async () => {
    await season('Kỳ 2094', d('2094-01-01'), d('2094-04-01'));
    const now = d('2094-02-01');
    const joinable = async (mode: 'ranked' | 'friendly') => {
      const match = await prisma.match.create({
        data: {
          organizerUserId: randomUUID(), bookingId: randomUUID(), capacity: 2, feePerSlot: 100_000n, mode, provinceCode: 'ha-noi',
          cutoffAt: d('2094-03-01'), skillConfiguredAt: now, status: 'open', bookingPrice: 200_000n,
        },
      });
      matchIds.push(match.id);
      await prisma.outbox.create({
        data: { aggregateType: 'Match', aggregateId: match.id, eventType: 'MatchCreated', payload: { matchId: match.id, feePerSlot: '100000' } },
      });
      return match;
    };
    const player = randomUUID();
    userIds.push(player);
    const ranked = await joinable('ranked');
    await expect(requestJoin(ranked.id, player, 'B', now)).rejects.toMatchObject({ code: 'SEASON_REGION_REQUIRED' });
    await expect(requestJoin((await joinable('friendly')).id, player, 'B', now)).resolves.toMatchObject({ participantUserId: player });
    await selectSeasonRegion(player, 'ha-noi', now);
    await expect(requestJoin(ranked.id, player, 'B', now)).resolves.toMatchObject({ participantUserId: player });
  });
});
