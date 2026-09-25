import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { fetchUnpublishedOutbox } from '../src/lib/outbox.js';

const databaseGate = describe.runIf(process.env.P2_G0_DATABASE_GATE === '1');
const prisma = new PrismaClient();

databaseGate('P2-G0 matchmaking database guards', () => {
  beforeEach(async () => {
    await prisma.evaluation.deleteMany();
    await prisma.join.deleteMany();
    await prisma.matchResolution.deleteMany();
    await prisma.match.deleteMany();
    await prisma.outbox.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('atomically leases one Outbox row to only one concurrent relay', async () => {
    await prisma.outbox.create({
      data: {
        aggregateType: 'Match',
        aggregateId: 'match-claim',
        eventType: 'MatchCreated',
        payload: { matchId: 'match-claim' },
      },
    });

    const [first, second] = await Promise.all([
      fetchUnpublishedOutbox(prisma, 1),
      fetchUnpublishedOutbox(prisma, 1),
    ]);

    expect(first.length + second.length).toBe(1);
    expect(await fetchUnpublishedOutbox(prisma, 1)).toHaveLength(0);
  });

  it('serializes contenders so capacity includes the organizer slot', async () => {
    const match = await prisma.match.create({
      data: {
        organizerUserId: 'organizer-1',
        bookingId: 'booking-1',
        capacity: 2,
        feePerSlot: 0n,
        cutoffAt: new Date(Date.now() + 60_000),
      },
    });
    const joins = await Promise.all([
      prisma.join.create({ data: { matchId: match.id, participantUserId: 'player-1' } }),
      prisma.join.create({ data: { matchId: match.id, participantUserId: 'player-2' } }),
    ]);

    const results = await Promise.allSettled(
      joins.map((join) => prisma.join.update({ where: { id: join.id }, data: { status: 'confirmed' } })),
    );

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(await prisma.join.count({ where: { matchId: match.id, status: 'confirmed' } })).toBe(1);
  });

  it('rejects self-evaluation at the database boundary', async () => {
    const match = await prisma.match.create({
      data: {
        organizerUserId: 'organizer-2',
        bookingId: 'booking-2',
        capacity: 2,
        feePerSlot: 0n,
        cutoffAt: new Date(Date.now() + 60_000),
      },
    });

    await expect(prisma.evaluation.create({
      data: { matchId: match.id, raterUserId: 'player-1', rateeUserId: 'player-1' },
    })).rejects.toThrow();
  });
});

// Không nằm sau gate: chỉ tạo và dọn đúng các dòng của chính test, không xóa dữ liệu dev.
describe('Competitive matches v2 — match configuration columns', () => {
  const ids: string[] = [];
  afterAll(async () => {
    await prisma.join.deleteMany({ where: { matchId: { in: ids } } });
    await prisma.match.deleteMany({ where: { id: { in: ids } } });
  });

  it('keeps legacy rows readable with defaults and null snapshots', async () => {
    const legacy = await prisma.match.create({ data: {
      organizerUserId: randomUUID(), bookingId: randomUUID(), capacity: 2, feePerSlot: 100000n, cutoffAt: new Date(Date.now() + 60_000),
    } });
    ids.push(legacy.id);
    expect(legacy).toMatchObject({
      sourceType: 'hold', mode: 'friendly', discipline: 'singles', ratio: 'five_five', format: 'bo3',
      bookingPrice: null, startAt: null, endAt: null, venueId: null, provinceCode: null, providerUserId: null,
    });
    const join = await prisma.join.create({ data: { matchId: legacy.id, participantUserId: randomUUID() } });
    expect(join.teamSide).toBeNull();
  });

  it('persists every competitive configuration field and team side', async () => {
    const startAt = new Date(Date.now() + 72 * 3_600_000);
    const match = await prisma.match.create({ data: {
      organizerUserId: randomUUID(), bookingId: randomUUID(), capacity: 4, feePerSlot: 60000n, cutoffAt: new Date(Date.now() + 60_000),
      sourceType: 'paid_booking', mode: 'ranked', discipline: 'doubles', ratio: 'six_four', format: 'bo5',
      bookingPrice: 200001n, startAt, endAt: new Date(startAt.getTime() + 120 * 60_000),
      venueId: randomUUID(), provinceCode: 'ho-chi-minh', providerUserId: randomUUID(),
    } });
    ids.push(match.id);
    const join = await prisma.join.create({ data: { matchId: match.id, participantUserId: randomUUID(), teamSide: 'B' } });
    expect(await prisma.match.findUniqueOrThrow({ where: { id: match.id } })).toMatchObject({
      sourceType: 'paid_booking', mode: 'ranked', discipline: 'doubles', ratio: 'six_four', format: 'bo5',
      bookingPrice: 200001n, startAt, provinceCode: 'ho-chi-minh',
    });
    expect(join.teamSide).toBe('B');
  });
});
