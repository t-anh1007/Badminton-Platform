import { prisma } from '../lib/prisma.js';

export async function getShutdownRefundPreview(bookingIds: string[]): Promise<Record<string, string>> {
  if (bookingIds.length === 0) return {};
  const [checkoutPayments, contributions] = await Promise.all([
    prisma.paymentIntent.findMany({
      where: { refType: 'booking', refId: { in: bookingIds }, status: 'completed' },
      select: { refId: true, amount: true },
    }),
    prisma.matchContribution.findMany({
      where: { funding: { bookingId: { in: bookingIds } }, status: { in: ['paid', 'settled'] } },
      select: { funding: { select: { bookingId: true } }, amount: true },
    }),
  ]);
  const amounts = new Map(bookingIds.map((id) => [id, 0n]));
  for (const payment of checkoutPayments) amounts.set(payment.refId, (amounts.get(payment.refId) ?? 0n) + payment.amount);
  for (const contribution of contributions) {
    const bookingId = contribution.funding.bookingId;
    amounts.set(bookingId, (amounts.get(bookingId) ?? 0n) + contribution.amount);
  }
  return Object.fromEntries([...amounts.entries()].map(([id, amount]) => [id, amount.toString()]));
}
