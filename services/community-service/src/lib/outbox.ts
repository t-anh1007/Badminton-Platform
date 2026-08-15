import type { Prisma, PrismaClient } from '@prisma/client';
import type { OutboxRow } from '@khoaluantn/eventbus';

/** Writes an event in the same transaction as its community state change. */
export async function writeOutbox(
  tx: Prisma.TransactionClient,
  params: { aggregateType: string; aggregateId: string; eventType: string; payload: unknown },
): Promise<void> {
  await tx.outbox.create({
    data: { ...params, payload: params.payload as Prisma.InputJsonValue },
  });
}

/** Atomically leases unpublished rows so concurrent relays cannot claim them. */
export async function fetchUnpublishedOutbox(prisma: PrismaClient, limit: number): Promise<OutboxRow[]> {
  return prisma.$queryRaw<OutboxRow[]>`
    WITH candidates AS (
      SELECT id
      FROM outbox
      WHERE "publishedAt" IS NULL
        AND ("claimedAt" IS NULL OR "claimedAt" < NOW() - INTERVAL '30 seconds')
      ORDER BY "createdAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE outbox AS claimed
    SET "claimedAt" = NOW()
    FROM candidates
    WHERE claimed.id = candidates.id
    RETURNING claimed.id, claimed."aggregateType", claimed."aggregateId",
      claimed."eventType", claimed.payload, claimed."createdAt"
  `;
}

export async function markOutboxPublished(prisma: PrismaClient, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await prisma.outbox.updateMany({
    where: { id: { in: ids } },
    data: { claimedAt: null, publishedAt: new Date() },
  });
}
