import { prisma } from '../lib/prisma.js';

export interface RevenueFilters {
  venueId?: string;
  from?: Date;
  to?: Date;
}

export async function listBusinessRevenue(businessUserId: string, filters: RevenueFilters) {
  const rows = await prisma.bookingRevenue.findMany({
    where: {
      businessUserId,
      ...(filters.venueId ? { venueId: filters.venueId } : {}),
      ...(filters.from || filters.to
        ? { endAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } }
        : {}),
    },
    orderBy: { endAt: 'desc' },
  });
  const open = await prisma.dispute.findMany({
    where: { bookingId: { in: rows.map((row) => row.bookingId) }, status: 'open' },
    select: { bookingId: true },
  });
  const blocked = new Set(open.map((row) => row.bookingId));
  return rows.map((row) => ({ ...row, disputeOpen: blocked.has(row.bookingId) }));
}

/** FIN-09/BR-FIN-16: chuyển phân vùng nội bộ, không sinh ledger. */
export async function releaseBookingRevenue(bookingId: string, now = new Date()): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1::int AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${bookingId}))) AS booking_lock`;
    const revenue = await tx.bookingRevenue.findUnique({ where: { bookingId } });
    if (!revenue || revenue.releasedAt || revenue.cancelledAt || revenue.releaseAt > now) return false;
    const openDispute = await tx.dispute.findFirst({ where: { bookingId: revenue.bookingId, status: 'open' } });
    if (openDispute) return false;
    await tx.$queryRaw`SELECT id FROM wallets WHERE id = ${revenue.businessWalletId} FOR UPDATE`;
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: revenue.businessWalletId } });
    if (wallet.pending < revenue.net) throw new Error('Doanh thu pending không đủ để đáo hạn');
    await tx.wallet.update({
      where: { id: wallet.id },
      data: { pending: { decrement: revenue.net }, available: { increment: revenue.net } },
    });
    await tx.bookingRevenue.update({ where: { bookingId: revenue.bookingId }, data: { releasedAt: now } });
    return true;
  });
}

export async function releaseMatureRevenue(now = new Date(), bookingIds?: readonly string[]): Promise<number> {
  if (bookingIds?.length === 0) return 0;
  const candidates = await prisma.bookingRevenue.findMany({
    where: {
      releasedAt: null,
      cancelledAt: null,
      releaseAt: { lte: now },
      ...(bookingIds ? { bookingId: { in: [...bookingIds] } } : {}),
    },
    select: { bookingId: true },
  });
  let released = 0;
  for (const candidate of candidates) {
    if (await releaseBookingRevenue(candidate.bookingId, now)) released += 1;
  }
  return released;
}
