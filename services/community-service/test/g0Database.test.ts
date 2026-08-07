import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { fetchUnpublishedOutbox } from '../src/lib/outbox.js';

const databaseGate = describe.runIf(process.env.P2_G0_DATABASE_GATE === '1');
const prisma = new PrismaClient();

databaseGate('P2-G0 community database guards', () => {
  beforeEach(async () => {
    await prisma.outbox.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('atomically leases one Outbox row to only one concurrent relay', async () => {
    await prisma.outbox.create({
      data: {
        aggregateType: 'Post',
        aggregateId: 'post-claim',
        eventType: 'ContentReported',
        payload: { postId: 'post-claim' },
      },
    });

    const [first, second] = await Promise.all([
      fetchUnpublishedOutbox(prisma, 1),
      fetchUnpublishedOutbox(prisma, 1),
    ]);

    expect(first.length + second.length).toBe(1);
    expect(await fetchUnpublishedOutbox(prisma, 1)).toHaveLength(0);
  });
});
