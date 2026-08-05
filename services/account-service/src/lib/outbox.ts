import type { Prisma, PrismaClient } from '@prisma/client';
import type { OutboxRow } from '@khoaluantn/eventbus';

/** Ghi một dòng Outbox trong CÙNG transaction với thay đổi domain. */
export async function writeOutbox(
  tx: Prisma.TransactionClient,
  params: { aggregateType: string; aggregateId: string; eventType: string; payload: unknown },
): Promise<void> {
  await tx.outbox.create({
    data: {
      aggregateType: params.aggregateType,
      aggregateId: params.aggregateId,
      eventType: params.eventType,
      payload: params.payload as Prisma.InputJsonValue,
    },
  });
}

/** Lấy các dòng chưa publish, khóa bằng FOR UPDATE SKIP LOCKED để relay chạy
 * song song (nhiều instance) không đọc trùng nhau. */
export async function fetchUnpublishedOutbox(prisma: PrismaClient, limit: number): Promise<OutboxRow[]> {
  return prisma.$queryRaw<OutboxRow[]>`
    SELECT id, "aggregateType", "aggregateId", "eventType", payload, "createdAt"
    FROM outbox
    WHERE "publishedAt" IS NULL
    ORDER BY "createdAt" ASC
    LIMIT ${limit}
    FOR UPDATE SKIP LOCKED
  `;
}

export async function markOutboxPublished(prisma: PrismaClient, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await prisma.outbox.updateMany({
    where: { id: { in: ids } },
    data: { publishedAt: new Date() },
  });
}
