import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/lib/prisma.js';
import {
  getOrganizerContribution,
  handleJoinApproved,
  handleMatchBookingResolved,
  handleMatchConfirmed,
  handleMatchCreated,
  payMatchContributionWithBalance,
} from '../src/domain/matchFee.js';
import { calculateResultAllocations, handleMatchResultFinalized } from '../src/domain/matchResult.js';
import { ensurePlatformWallet } from '../src/domain/wallet.js';
import { recordBookingRevenue } from '../src/domain/revenue.js';
import { seedPersonalBalance } from './helpers.js';

const matchIds: string[] = [];
const eventIds: string[] = [];
const userIds: string[] = [];
const decisionIds: string[] = [];
const LOSER: Record<'5:5' | '6:4' | '7:3', bigint> = { '5:5': 5n, '6:4': 6n, '7:3': 7n };

afterAll(async () => {
  const contributionIds = (await prisma.matchContribution.findMany({ where: { matchId: { in: matchIds } }, select: { id: true } })).map((row) => row.id);
  const bookingIds = (await prisma.matchFunding.findMany({ where: { matchId: { in: matchIds } }, select: { bookingId: true } })).map((row) => row.bookingId);
  const walletIds = (await prisma.wallet.findMany({ where: { userId: { in: userIds } }, select: { id: true } })).map((row) => row.id);
  await prisma.ledgerEntry.deleteMany({
    where: {
      OR: [
        { walletId: { in: walletIds } },
        { refId: { in: [...contributionIds, ...bookingIds, ...matchIds] } },
        ...decisionIds.map((id) => ({ refId: { startsWith: id } })),
      ],
    },
  });
  await prisma.outbox.deleteMany({ where: { aggregateId: { in: [...contributionIds, ...matchIds] } } });
  await prisma.processedEvent.deleteMany({ where: { eventId: { in: eventIds } } });
  await prisma.bookingRevenue.deleteMany({ where: { bookingId: { in: bookingIds } } });
  await prisma.matchContribution.deleteMany({ where: { matchId: { in: matchIds } } });
  await prisma.matchFunding.deleteMany({ where: { matchId: { in: matchIds } } });
  await prisma.wallet.deleteMany({ where: { id: { in: walletIds } } });
  await prisma.$disconnect();
});

/** Kèo nguồn hold đã chốt tiền qua đúng luồng thật (MatchCreated -> JOIN trả tiền -> MatchConfirmed -> Venue settle). */
async function settledMatch(options: { discipline: 'singles' | 'doubles'; ratio: '5:5' | '6:4' | '7:3'; price: bigint }) {
  const capacity = options.discipline === 'doubles' ? 4 : 2;
  const reserve = (options.price * (2n * LOSER[options.ratio] - 10n)) / 10n;
  const total = options.price + reserve;
  const fee = total / BigInt(capacity);
  const organizerContribution = total - fee * BigInt(capacity - 1);
  const matchId = randomUUID(); const bookingId = randomUUID(); const organizerUserId = randomUUID(); const businessUserId = randomUUID();
  matchIds.push(matchId); userIds.push(organizerUserId, businessUserId);
  const created = `MatchCreated:${randomUUID()}`; eventIds.push(created);
  await handleMatchCreated(created, {
    matchId, bookingId, organizerUserId, capacity, feePerSlot: fee.toString(), bookingPrice: options.price.toString(),
    organizerContribution: organizerContribution.toString(), cutoffAt: new Date(Date.now() + 3_600_000).toISOString(),
    depositExpiresAt: new Date(Date.now() + 600_000).toISOString(), sourceType: 'hold', mode: 'ranked',
    discipline: options.discipline, ratio: options.ratio, teamSize: capacity === 4 ? 2 : 1,
    resultReserve: reserve.toString(), totalContribution: total.toString(),
  });
  await seedPersonalBalance(organizerUserId, organizerContribution);
  await payMatchContributionWithBalance(organizerUserId, (await getOrganizerContribution(matchId)).id);
  const sides = capacity === 4 ? (['A', 'B', 'B'] as const) : (['B'] as const);
  const players: Array<{ userId: string; teamSide: 'A' | 'B' }> = [];
  for (const teamSide of sides) {
    const userId = randomUUID(); const joinId = randomUUID(); userIds.push(userId); players.push({ userId, teamSide });
    const joinEvent = `JoinApproved:${randomUUID()}`; eventIds.push(joinEvent);
    await handleJoinApproved(joinEvent, { joinId, matchId, participantUserId: userId, fee: fee.toString(), expiresAt: new Date(Date.now() + 600_000).toISOString(), teamSide });
    await seedPersonalBalance(userId, fee);
    await payMatchContributionWithBalance(userId, (await prisma.matchContribution.findUniqueOrThrow({ where: { joinId } })).id);
  }
  const attemptId = randomUUID();
  const confirmed = `MatchConfirmed:${randomUUID()}`; const resolved = `MatchBookingResolved:${randomUUID()}`; const revenue = `BookingConfirmed:${randomUUID()}`;
  eventIds.push(confirmed, resolved, revenue);
  await handleMatchConfirmed(confirmed, {
    matchId, bookingId, attemptId, venueRevision: 0, participantCount: capacity - 1,
    participantFees: (fee * BigInt(capacity - 1)).toString(), organizerContribution: organizerContribution.toString(),
    bookingPrice: options.price.toString(), sourceType: 'hold', resultReserve: reserve.toString(), totalContribution: total.toString(),
  });
  await handleMatchBookingResolved(resolved, { commandId: attemptId, matchId, bookingId, attemptId, action: 'settle', decision: 'confirmed', winningAttemptId: attemptId, venueRevision: 1 });
  await recordBookingRevenue(revenue, { bookingId, businessUserId, venueId: randomUUID(), gross: options.price.toString(), endAt: new Date(Date.now() + 48 * 3_600_000).toISOString(), source: 'marketplace' });
  return { matchId, bookingId, organizerUserId, businessUserId, players, reserve };
}

async function finalize(matchId: string, outcome: 'TEAM_A_WIN' | 'TEAM_B_WIN' | 'NO_RESULT', decisionId = randomUUID()) {
  decisionIds.push(decisionId);
  const eventId = `MatchResultFinalized:${randomUUID()}`; eventIds.push(eventId);
  const payload = { matchId, decisionId, outcome, finalizedAt: new Date().toISOString() };
  await handleMatchResultFinalized(eventId, payload);
  return { eventId, payload };
}

const withdrawable = async (userId: string) => (await prisma.wallet.findFirst({ where: { userId, walletType: 'personal' } }))?.withdrawable ?? 0n;
const platformReserved = async () => (await prisma.wallet.findUniqueOrThrow({ where: { id: (await ensurePlatformWallet()).id } })).reserved;
const resultEntries = (decisionId: string) => prisma.ledgerEntry.findMany({ where: { refType: 'matchResult', refId: { startsWith: decisionId } } });

describe('Task 14 pure allocation', () => {
  const t = (ms: number) => new Date(ms);
  const contributions = [
    { userId: 'b-late', role: 'participant' as const, teamSide: 'B', createdAt: t(3) },
    { userId: 'org', role: 'organizer' as const, teamSide: 'A', createdAt: t(5) },
    { userId: 'a2', role: 'participant' as const, teamSide: 'A', createdAt: t(1) },
    { userId: 'b-early', role: 'participant' as const, teamSide: 'B', createdAt: t(2) },
  ];

  it('gives the organizer the remainder in team A and the earliest JOIN the remainder in team B', () => {
    expect(Object.fromEntries(calculateResultAllocations({ resultReserve: 80_001n, contributions }, 'TEAM_A_WIN')))
      .toEqual({ org: 40_001n, a2: 40_000n });
    expect(Object.fromEntries(calculateResultAllocations({ resultReserve: 80_001n, contributions }, 'TEAM_B_WIN')))
      .toEqual({ 'b-early': 40_001n, 'b-late': 40_000n });
    expect(Object.fromEntries(calculateResultAllocations({ resultReserve: 80_003n, contributions }, 'NO_RESULT')))
      .toEqual({ org: 20_001n, a2: 20_000n, 'b-early': 20_001n, 'b-late': 20_001n });
  });

  it('orders JOINs by the Matchmaking joinedAt, not by when Finance created the contribution', () => {
    const retried = [
      { userId: 'org', role: 'organizer' as const, teamSide: 'A', createdAt: t(1) },
      { userId: 'b1', role: 'participant' as const, teamSide: 'B', joinedAt: t(10), createdAt: t(50) },
      { userId: 'b2', role: 'participant' as const, teamSide: 'B', joinedAt: t(20), createdAt: t(30) },
    ];
    expect(Object.fromEntries(calculateResultAllocations({ resultReserve: 3n, contributions: retried }, 'TEAM_B_WIN')))
      .toEqual({ b1: 2n, b2: 1n });
  });

  it('treats legacy contributions without team as organizer A and participant B', () => {
    const legacy = [
      { userId: 'org', role: 'organizer' as const, teamSide: null, createdAt: t(1) },
      { userId: 'p', role: 'participant' as const, teamSide: null, createdAt: t(2) },
    ];
    expect(Object.fromEntries(calculateResultAllocations({ resultReserve: 3n, contributions: legacy }, 'NO_RESULT'))).toEqual({ org: 1n, p: 2n });
  });
});

describe('Task 14 result reserve release', () => {
  it('5:5 zero reserve records finalization without ledger entries', async () => {
    const fixture = await settledMatch({ discipline: 'singles', ratio: '5:5', price: 200_000n });
    const { payload } = await finalize(fixture.matchId, 'TEAM_A_WIN');
    expect(await resultEntries(payload.decisionId)).toHaveLength(0);
    const funding = await prisma.matchFunding.findUniqueOrThrow({ where: { matchId: fixture.matchId } });
    expect(funding.resultReserveStatus).toBe('none');
    expect(funding.resultFinalizedAt).not.toBeNull();
  });

  it('6:4 singles winner receives the whole reserve as withdrawable; BookingRevenue untouched; replay is a no-op', async () => {
    const fixture = await settledMatch({ discipline: 'singles', ratio: '6:4', price: 200_000n });
    expect(fixture.reserve).toBe(40_000n);
    const revenueBefore = await prisma.bookingRevenue.findUniqueOrThrow({ where: { bookingId: fixture.bookingId } });
    const reservedBefore = await platformReserved();
    const winnerBefore = await withdrawable(fixture.organizerUserId);
    const loser = fixture.players[0]!.userId;
    const loserBefore = await withdrawable(loser);

    const { eventId, payload } = await finalize(fixture.matchId, 'TEAM_A_WIN');
    await handleMatchResultFinalized(eventId, payload);
    await finalize(fixture.matchId, 'TEAM_B_WIN'); // quyết định khác đến sau: vẫn no-op

    expect(await withdrawable(fixture.organizerUserId)).toBe(winnerBefore + 40_000n);
    expect(await withdrawable(loser)).toBe(loserBefore);
    expect(await platformReserved()).toBe(reservedBefore - 40_000n);
    expect(await resultEntries(payload.decisionId)).toHaveLength(2);
    expect(await prisma.bookingRevenue.findUniqueOrThrow({ where: { bookingId: fixture.bookingId } })).toEqual(revenueBefore);
    expect(await prisma.matchFunding.findUniqueOrThrow({ where: { matchId: fixture.matchId } })).toMatchObject({ resultReserveStatus: 'released' });
  });

  it('7:3 doubles: team B splits an odd reserve with the earliest JOIN taking the remainder', async () => {
    const fixture = await settledMatch({ discipline: 'doubles', ratio: '7:3', price: 200_005n });
    expect(fixture.reserve).toBe(80_002n);
    const [, b1, b2] = fixture.players;
    const before = await Promise.all([b1!.userId, b2!.userId].map(withdrawable));
    const { payload } = await finalize(fixture.matchId, 'TEAM_B_WIN');
    expect(await withdrawable(b1!.userId)).toBe(before[0]! + 40_001n);
    expect(await withdrawable(b2!.userId)).toBe(before[1]! + 40_001n);
    const credits = (await resultEntries(payload.decisionId)).filter((entry) => entry.amount > 0n);
    expect(credits.reduce((sum, entry) => sum + entry.amount, 0n)).toBe(80_002n);
  });

  it('doubles NO_RESULT splits floor/2 to A and the rest to B across concurrent consumers exactly once', async () => {
    const fixture = await settledMatch({ discipline: 'doubles', ratio: '6:4', price: 200_003n });
    expect(fixture.reserve).toBe(40_000n);
    const decisionId = randomUUID();
    decisionIds.push(decisionId);
    const payload = { matchId: fixture.matchId, decisionId, outcome: 'NO_RESULT' as const, finalizedAt: new Date().toISOString() };
    const events = [randomUUID(), randomUUID(), randomUUID()].map((id) => `MatchResultFinalized:${id}`);
    eventIds.push(...events);
    await Promise.all(events.map((eventId) => handleMatchResultFinalized(eventId, payload)));
    const credits = (await resultEntries(decisionId)).filter((entry) => entry.amount > 0n);
    expect(credits).toHaveLength(4);
    expect(credits.every((entry) => entry.amount === 10_000n)).toBe(true);
  });

  it('refuses to release before funding settles and ignores cancelled matches', async () => {
    const matchId = randomUUID(); const organizerUserId = randomUUID(); userIds.push(organizerUserId); matchIds.push(matchId);
    const created = `MatchCreated:${randomUUID()}`; eventIds.push(created);
    await handleMatchCreated(created, {
      matchId, bookingId: randomUUID(), organizerUserId, capacity: 2, feePerSlot: '120000', bookingPrice: '200000',
      organizerContribution: '120000', cutoffAt: new Date(Date.now() + 3_600_000).toISOString(),
      sourceType: 'hold', discipline: 'singles', ratio: '6:4', resultReserve: '40000', totalContribution: '240000',
    });
    await expect(finalize(matchId, 'TEAM_A_WIN')).rejects.toThrow(/before match funding settled/);
    await prisma.matchFunding.update({ where: { matchId }, data: { status: 'cancelled' } });
    const { payload } = await finalize(matchId, 'TEAM_A_WIN');
    expect(await resultEntries(payload.decisionId)).toHaveLength(0);
  });
});
