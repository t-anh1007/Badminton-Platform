import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/lib/prisma.js';
import { finalizeUndisputedResult } from '../src/domain/resultLifecycle.js';
import { handleRatingPeriodReady, type RatingPeriodReadyPayload } from '../src/lib/ratingEventConsumer.js';
import { purgeResultCases } from './resultTestUtils.js';

const DAY = 24 * 60 * 60_000;
const matchIds: string[] = [];
const userIds: string[] = [];
const seasonIds: string[] = [];
const eventIds: string[] = [];

afterAll(async () => {
  await purgeResultCases(matchIds);
  await prisma.ratedEncounter.deleteMany({ where: { matchId: { in: matchIds } } });
  await prisma.matchRatingChange.deleteMany({ where: { matchId: { in: matchIds } } });
  await prisma.outbox.deleteMany({ where: { aggregateId: { in: matchIds } } });
  await prisma.outbox.deleteMany({ where: { OR: userIds.map((id) => ({ aggregateId: { contains: id } })) } });
  await prisma.processedEvent.deleteMany({ where: { eventId: { in: eventIds } } });
  await prisma.join.deleteMany({ where: { matchId: { in: matchIds } } });
  await prisma.match.deleteMany({ where: { id: { in: matchIds } } });
  await prisma.seasonStat.deleteMany({ where: { seasonId: { in: seasonIds } } });
  await prisma.playerSeasonProfile.deleteMany({ where: { seasonId: { in: seasonIds } } });
  await prisma.season.deleteMany({ where: { id: { in: seasonIds } } });
  await prisma.passport.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.$disconnect();
});

function player(rating = 1500, rd = 100) {
  const userId = randomUUID();
  userIds.push(userId);
  return { userId, rating, rd };
}

async function passports(players: Array<{ userId: string; rating: number; rd: number }>, discipline: 'singles' | 'doubles') {
  for (const p of players) {
    await prisma.passport.create({ data: { userId: p.userId, discipline, ratingMu: p.rating, ratingRd: p.rd, ratingSigma: 0.06 } });
  }
}

/** Kèo đã chốt đội: A = [chủ kèo, ...], B = [...]; hồ sơ provisional với kết quả cho trước, đến hạn chốt tại `finalizedAt`. */
async function finalize(options: {
  a: string[]; b: string[]; outcome: 'TEAM_A_WIN' | 'TEAM_B_WIN'; finalizedAt: Date;
  mode?: 'ranked' | 'friendly'; endAt?: Date; provinceCode?: string;
}) {
  const doubles = options.a.length === 2;
  const endAt = options.endAt ?? new Date(options.finalizedAt.getTime() - DAY);
  const match = await prisma.match.create({
    data: {
      bookingId: randomUUID(), organizerUserId: options.a[0]!, capacity: doubles ? 4 : 2, discipline: doubles ? 'doubles' : 'singles',
      feePerSlot: 0n, status: 'completed', mode: options.mode ?? 'ranked', cutoffAt: new Date(endAt.getTime() - 2 * 60 * 60_000),
      startAt: new Date(endAt.getTime() - 60 * 60_000), endAt, provinceCode: options.provinceCode ?? null,
      joins: {
        create: [...options.a.slice(1).map((id) => ({ participantUserId: id, teamSide: 'A' as const })), ...options.b.map((id) => ({ participantUserId: id, teamSide: 'B' as const }))]
          .map((join) => ({ ...join, status: 'confirmed' as const })),
      },
    },
  });
  matchIds.push(match.id);
  const resultCase = await prisma.matchResultCase.create({
    data: {
      matchId: match.id, status: 'provisional', outcome: options.outcome,
      declarationDeadlineAt: options.finalizedAt, objectionDeadlineAt: new Date(options.finalizedAt.getTime() - 1),
    },
  });
  expect(await finalizeUndisputedResult(resultCase.id, options.finalizedAt)).toBe(true);
  return match;
}

const ratingEvents = async (matchId: string) => (await prisma.outbox.findMany({
  where: { aggregateId: matchId, eventType: 'RatingPeriodReady' }, orderBy: { createdAt: 'asc' },
})).map((row) => row.payload as unknown as RatingPeriodReadyPayload);

async function consume(payload: RatingPeriodReadyPayload) {
  const eventId = `RatingPeriodReady:${randomUUID()}`;
  eventIds.push(eventId);
  await handleRatingPeriodReady(eventId, payload);
}

const rated = async (matchId: string) => Object.fromEntries((await prisma.ratedEncounter.findMany({ where: { matchId } }))
  .map((row) => [row.userId, row.rated]));
const passport = (userId: string, discipline: 'singles' | 'doubles') =>
  prisma.passport.findUniqueOrThrow({ where: { userId_discipline: { userId, discipline } } });

describe('Task 18 rated results', () => {
  it('excludes friendly matches from rating', async () => {
    const [a, b] = [player(), player()];
    await passports([a, b], 'singles');
    const match = await finalize({ a: [a.userId], b: [b.userId], outcome: 'TEAM_A_WIN', finalizedAt: new Date('2095-01-10T00:00:00Z'), mode: 'friendly' });
    expect(await rated(match.id)).toEqual({});
    expect(await ratingEvents(match.id)).toEqual([]);

    // Ranked nhưng NO_RESULT (hết hạn khai + sự cố) cũng không có rating.
    const noResult = await prisma.match.create({
      data: { bookingId: randomUUID(), organizerUserId: a.userId, capacity: 2, feePerSlot: 0n, status: 'completed', mode: 'ranked', cutoffAt: new Date('2095-01-01T00:00:00Z'),
        joins: { create: { participantUserId: b.userId, teamSide: 'B', status: 'confirmed' } } },
    });
    matchIds.push(noResult.id);
    const resultCase = await prisma.matchResultCase.create({
      data: { matchId: noResult.id, status: 'incident_window', outcome: 'NO_RESULT', declarationDeadlineAt: new Date('2095-01-02T00:00:00Z'), incidentDeadlineAt: new Date('2095-01-03T00:00:00Z') },
    });
    expect(await finalizeUndisputedResult(resultCase.id, new Date('2095-01-03T00:00:00Z'))).toBe(true);
    expect(await rated(noResult.id)).toEqual({});
  });

  it('changes each singles player once, and replay with a new message id is a no-op', async () => {
    const [a, b] = [player(1500), player(1500)];
    await passports([a, b], 'singles');
    const match = await finalize({ a: [a.userId], b: [b.userId], outcome: 'TEAM_B_WIN', finalizedAt: new Date('2095-02-10T00:00:00Z') });
    const events = await ratingEvents(match.id);
    expect(events.map((event) => [event.userId, event.results[0]!.score])).toEqual(expect.arrayContaining([[a.userId, 0], [b.userId, 1]]));
    for (const event of events) await consume(event);
    for (const event of events) await consume(event);
    expect((await passport(b.userId, 'singles')).ratingMu).toBeGreaterThan(1500);
    expect((await passport(a.userId, 'singles')).ratingMu).toBeLessThan(1500);
    expect((await passport(b.userId, 'singles')).matchesPlayed).toBe(1);
    expect(await prisma.matchRatingChange.count({ where: { matchId: match.id } })).toBe(2);
  });

  it('doubles uses the mean opponent rating/RD and never touches the singles Passport', async () => {
    const [org, partner, b1, b2] = [player(1500, 100), player(1500, 100), player(1600, 80), player(1400, 120)];
    await passports([org, partner, b1, b2], 'doubles');
    await passports([org], 'singles');
    const match = await finalize({ a: [org.userId, partner.userId], b: [b1.userId, b2.userId], outcome: 'TEAM_A_WIN', finalizedAt: new Date('2095-03-10T00:00:00Z') });
    const events = await ratingEvents(match.id);
    expect(events.find((event) => event.userId === org.userId)!.results).toEqual([{ opponentRating: 1500, opponentRd: 100, score: 1 }]);
    for (const event of events) await consume(event);
    expect((await passport(org.userId, 'doubles')).matchesPlayed).toBe(1);
    expect(await passport(org.userId, 'singles')).toMatchObject({ ratingMu: 1500, matchesPlayed: 0 });
  });

  it('rates the same opposing pair once per rolling 7 days by finalizedAt, ignoring own-teammate changes', async () => {
    const [org, p1, p2, b1, b2] = [player(), player(), player(), player(), player()];
    await passports([org, p1, p2, b1, b2], 'doubles');
    const t0 = new Date('2095-04-01T00:00:00Z');
    await finalize({ a: [org.userId, p1.userId], b: [b1.userId, b2.userId], outcome: 'TEAM_A_WIN', finalizedAt: t0 });
    // Đổi đồng đội nhưng cùng cặp đối thủ: chủ kèo không được tính; b1/b2 gặp cặp đối thủ mới nên vẫn được tính.
    const second = await finalize({ a: [org.userId, p2.userId], b: [b1.userId, b2.userId], outcome: 'TEAM_A_WIN', finalizedAt: new Date(t0.getTime() + 7 * DAY - 1) });
    expect(await rated(second.id)).toEqual({ [org.userId]: false, [p2.userId]: true, [b1.userId]: true, [b2.userId]: true });
    expect((await ratingEvents(second.id)).map((event) => event.userId)).not.toContain(org.userId);
    // Đúng 7 ngày sau suất đã tính vẫn đủ điều kiện.
    const third = await finalize({ a: [org.userId, p1.userId], b: [b1.userId, b2.userId], outcome: 'TEAM_B_WIN', finalizedAt: new Date(t0.getTime() + 7 * DAY) });
    expect((await rated(third.id))[org.userId]).toBe(true);
  });

  it('the first officially finalized result reserves the slot even when its match ended later or events arrive reversed', async () => {
    const [a, b] = [player(), player()];
    await passports([a, b], 'singles');
    const finalizedFirst = await finalize({
      a: [a.userId], b: [b.userId], outcome: 'TEAM_A_WIN', finalizedAt: new Date('2095-05-02T00:00:00Z'), endAt: new Date('2095-05-01T12:00:00Z'),
    });
    const olderMatch = await finalize({
      a: [a.userId], b: [b.userId], outcome: 'TEAM_B_WIN', finalizedAt: new Date('2095-05-03T00:00:00Z'), endAt: new Date('2095-04-30T12:00:00Z'),
    });
    expect(await rated(olderMatch.id)).toEqual({ [a.userId]: false, [b.userId]: false });
    expect(await ratingEvents(olderMatch.id)).toEqual([]);
    // Consumer nhận event theo thứ tự ngược vẫn chỉ áp suất đã giữ.
    for (const event of (await ratingEvents(finalizedFirst.id)).reverse()) await consume(event);
    expect((await passport(a.userId, 'singles')).matchesPlayed).toBe(1);
  });

  it('updates season stats (results, wins, province matches, streaks) in the same user transaction', async () => {
    const season = await prisma.season.create({ data: { name: 'Kỳ 2095', startAt: new Date('2095-06-01T00:00:00Z'), endAt: new Date('2095-09-01T00:00:00Z') } });
    seasonIds.push(season.id);
    const [a, b] = [player(), player()];
    await passports([a, b], 'singles');
    await prisma.playerSeasonProfile.create({ data: { seasonId: season.id, userId: a.userId, provinceCode: 'ha-noi', lockedAt: season.startAt } });
    const results: Array<['TEAM_A_WIN' | 'TEAM_B_WIN', string]> = [['TEAM_A_WIN', 'ha-noi'], ['TEAM_A_WIN', 'da-nang'], ['TEAM_B_WIN', 'ha-noi']];
    for (const [index, [outcome, provinceCode]] of results.entries()) {
      // Cách nhau 8 ngày để luôn đủ điều kiện tính rating.
      const match = await finalize({
        a: [a.userId], b: [b.userId], outcome, provinceCode, finalizedAt: new Date(Date.UTC(2095, 5, 3 + index * 8)),
      });
      for (const event of await ratingEvents(match.id)) await consume(event);
    }
    const stat = await prisma.seasonStat.findUniqueOrThrow({
      where: { seasonId_userId_discipline: { seasonId: season.id, userId: a.userId, discipline: 'singles' } },
    });
    expect(stat).toMatchObject({ matchesPlayed: 3, wins: 2, provinceMatches: 2, currentWinStreak: 0, longestWinStreak: 2 });
    const changes = await prisma.matchRatingChange.findMany({ where: { userId: a.userId } });
    expect(stat.ratingGain).toBeCloseTo(changes.reduce((sum, change) => sum + change.delta, 0), 6);
  });
});

describe('G4 review — results apply in authoritative finalizedAt order', () => {
  it('produces the same rating chain and streak when RabbitMQ delivers a later result first', async () => {
    const [a, b] = [player(1500), player(1500)];
    await passports([a, b], 'singles');
    const first = await finalize({ a: [a.userId], b: [b.userId], outcome: 'TEAM_A_WIN', finalizedAt: new Date('2095-10-01T00:00:00Z') });
    const second = await finalize({ a: [a.userId], b: [b.userId], outcome: 'TEAM_B_WIN', finalizedAt: new Date('2095-10-09T00:00:00Z') });
    const laterEvent = (await ratingEvents(second.id)).find((event) => event.userId === a.userId)!;
    await consume(laterEvent);
    const changes = await prisma.matchRatingChange.findMany({ where: { userId: a.userId }, orderBy: { createdAt: 'asc' } });
    expect(changes.map((change) => change.matchId)).toEqual([first.id, second.id]);
    expect(changes[1]!.ratingBefore).toBe(changes[0]!.ratingAfter);
    expect(changes.map((change) => change.won)).toEqual([true, false]);
    // Event của trận đầu đến sau: không áp lại.
    await consume((await ratingEvents(first.id)).find((event) => event.userId === a.userId)!);
    expect(await prisma.matchRatingChange.count({ where: { userId: a.userId } })).toBe(2);
  });
});

