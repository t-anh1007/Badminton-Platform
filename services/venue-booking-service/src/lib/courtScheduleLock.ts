import type { Prisma } from '@prisma/client';

/** Serialize cross-table changes that affect availability of one court. Holds
 * and confirmed-booking moves live in different tables, so their individual
 * EXCLUDE constraints need this shared database lock at the boundary. */
export async function lockCourtSchedule(tx: Prisma.TransactionClient, courtId: string): Promise<void> {
  await tx.$queryRaw`SELECT 1::int AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${'court-schedule:' + courtId}))) AS court_lock`;
}
