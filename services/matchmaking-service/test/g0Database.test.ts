import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { fetchUnpublishedOutbox } from '../src/lib/outbox.js';

const databaseGate = describe.runIf(process.env.P2_G0_DATABASE_GATE === '1');
const prisma = new PrismaClient();

databaseGate('P2-G0 matchmaking database guards', () => {
  beforeEach(async () => {
    await prisma.evaluation.deleteMany();
    await prisma.join.deleteMany();
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
