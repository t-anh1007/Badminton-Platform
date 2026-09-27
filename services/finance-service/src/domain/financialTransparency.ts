import { bookingDetails } from './bookingReferences.js';
import { prisma } from '../lib/prisma.js';

export type TransparencyStatus = 'pending' | 'available' | 'disputed' | 'cancelled';

export interface TransparencyFilters {
  venueId?: string;
  from?: Date;
  to?: Date;
  status?: TransparencyStatus;
  page: number;
  pageSize: number;
}

export function maskBankAccount(value: string | null | undefined): string | null {
  const clean = value?.trim();
  if (!clean) return null;
  return `•••• ${clean.slice(-4)}`;
}

function money(value: bigint | null | undefined) {
  return (value ?? 0n).toString();
}

function refundedOf(row: { gross: bigint | null; net: bigint | null; commission: bigint | null }) {
  return (row.gross ?? 0n) - (row.net ?? 0n) - (row.commission ?? 0n);
}

type RevenueRow = { gross: bigint; net: bigint; commission: bigint };
/** Ngày/tháng theo giờ Việt Nam (UTC+7) để nhóm doanh thu đúng ngày chủ sân nhìn thấy. */
const vietnamDate = (date: Date) => new Date(date.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);

/** Gom doanh thu booking theo khóa (ngày, tháng, cơ sở, chủ sân) — mỗi nhóm giữ nguyên gross = hoàn + phí + chủ sân. */
function revenueSeries<T extends RevenueRow>(rows: T[], keyOf: (row: T) => string) {
  const groups = new Map<string, { gross: bigint; refunded: bigint; commission: bigint; net: bigint; count: number }>();
  for (const row of rows) {
    const key = keyOf(row);
    const group = groups.get(key) ?? { gross: 0n, refunded: 0n, commission: 0n, net: 0n, count: 0 };
    group.gross += row.gross; group.refunded += refundedOf(row); group.commission += row.commission; group.net += row.net; group.count += 1;
    groups.set(key, group);
  }
  return [...groups].map(([key, group]) => ({
    key, gross: money(group.gross), refunded: money(group.refunded), commission: money(group.commission), net: money(group.net), count: group.count,
  }));
}

function endAtRange(from?: Date, to?: Date) {
  return from || to ? { endAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {};
}

export async function listProviderFinancialTransparency(userId: string, filters: TransparencyFilters) {
  const baseWhere = {
    businessUserId: userId,
    ...(filters.venueId ? { venueId: filters.venueId } : {}),
    ...endAtRange(filters.from, filters.to),
  };
  const openDisputes = await prisma.dispute.findMany({
    where: { status: 'open', bookingId: { in: (await prisma.bookingRevenue.findMany({ where: baseWhere, select: { bookingId: true } })).map((row) => row.bookingId) } },
    select: { bookingId: true },
  });
  const disputedIds = openDisputes.map((row) => row.bookingId);
  const statusWhere = filters.status === 'available' ? { releasedAt: { not: null } }
    : filters.status === 'cancelled' ? { cancelledAt: { not: null } }
      : filters.status === 'disputed' ? { bookingId: { in: disputedIds } }
        : filters.status === 'pending' ? { releasedAt: null, cancelledAt: null, bookingId: { notIn: disputedIds } }
          : {};
  const where = { ...baseWhere, ...statusWhere };
  const [wallet, total, rows, totals, withdrawn, seriesRows] = await Promise.all([
    prisma.wallet.findFirst({ where: { userId, walletType: 'business' } }),
    prisma.bookingRevenue.count({ where }),
    prisma.bookingRevenue.findMany({
      where,
      orderBy: [{ endAt: 'desc' }, { bookingId: 'desc' }],
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    prisma.bookingRevenue.aggregate({ where, _sum: { gross: true, net: true, commission: true } }),
    prisma.withdrawalRequest.aggregate({ where: { sellerUserId: userId, walletType: 'business' }, _sum: { paidAmount: true } }),
    prisma.bookingRevenue.findMany({ where, select: { venueId: true, endAt: true, gross: true, net: true, commission: true } }),
  ]);
  const bookingIds = rows.map((row) => row.bookingId);
  const bookingCodes = await bookingDetails(bookingIds);
  const intents = bookingIds.length ? await prisma.paymentIntent.findMany({
    where: { refType: 'booking', refId: { in: bookingIds } }, orderBy: { createdAt: 'desc' },
  }) : [];
  const intentIds = intents.map((row) => row.id);
  const bankEvents = intentIds.length ? await prisma.sepayEvent.findMany({
    where: { matchedType: 'PaymentIntent', matchedId: { in: intentIds } }, orderBy: { receivedAt: 'desc' },
  }) : [];
  const disputeSet = new Set(disputedIds);
  return {
    summary: {
      available: money(wallet?.available), pending: money(wallet?.pending), reserved: money(wallet?.reserved),
      gross: money(totals._sum.gross), net: money(totals._sum.net), commission: money(totals._sum.commission),
      // Hoàn tiền chỉ giảm net/commission (refund.ts), gross giữ nguyên nên phần chênh chính là tiền đã hoàn khách.
      refunded: money(refundedOf(totals._sum)), withdrawn: money(withdrawn._sum.paidAmount),
    },
    byDay: revenueSeries(seriesRows, (row) => vietnamDate(row.endAt)).sort((a, b) => a.key.localeCompare(b.key)),
    byVenue: revenueSeries(seriesRows, (row) => row.venueId).sort((a, b) => Number(BigInt(b.gross) - BigInt(a.gross))),
    transactions: {
      items: rows.map((row) => {
        const intent = intents.find((candidate) => candidate.refId === row.bookingId);
        const bankEvent = intent ? bankEvents.find((candidate) => candidate.matchedId === intent.id) : undefined;
        const status: TransparencyStatus = row.cancelledAt ? 'cancelled' : disputeSet.has(row.bookingId) ? 'disputed' : row.releasedAt ? 'available' : 'pending';
        return {
          bookingId: row.bookingId, bookingCode: bookingCodes.get(row.bookingId)?.businessCode ?? null, startAt: bookingCodes.get(row.bookingId)?.startAt ?? null, venueId: row.venueId, gross: money(row.gross), net: money(row.net), commission: money(row.commission), refunded: money(refundedOf(row)),
          endAt: row.endAt, releaseAt: row.releaseAt, releasedAt: row.releasedAt, status,
          payment: intent ? {
            method: intent.method, provider: intent.method === 'sepay' ? 'SePay' : 'Ví COURTIN',
            businessCode: bankEvent?.businessCode ?? null,
            amount: money(bankEvent?.amount ?? intent.amount), providerReference: bankEvent?.externalRef ?? null,
            confirmedAt: bankEvent?.receivedAt ?? null, reconciliationStatus: bankEvent?.status ?? (intent.method === 'balance' ? 'internal' : 'pending'),
            senderAccount: null, collectionAccount: null,
          } : null,
        };
      }),
      total, page: filters.page, pageSize: filters.pageSize,
    },
  };
}

export async function listProviderWithdrawalTransparency(userId: string, page: number, pageSize: number) {
  const where = { sellerUserId: userId, walletType: 'business' as const };
  const [total, rows] = await Promise.all([
    prisma.withdrawalRequest.count({ where }),
    prisma.withdrawalRequest.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  const eventIds = rows.map((row) => row.sePayEventId).filter((value): value is string => Boolean(value));
  const events = eventIds.length ? await prisma.sepayEvent.findMany({ where: { id: { in: eventIds } } }) : [];
  return {
    items: rows.map((row) => {
      const event = row.sePayEventId ? events.find((candidate) => candidate.id === row.sePayEventId) : undefined;
      return {
        id: row.id, amount: money(row.amount), paidAmount: money(row.paidAmount), status: row.status,
        transferCode: row.transferCode, bankCode: row.bankCode, bankAccountName: row.bankAccountName,
        bankAccountMasked: maskBankAccount(row.bankAccountNumber), createdAt: row.createdAt, processedAt: row.processedAt,
        bankTransactionCode: event?.businessCode ?? null, providerReference: event?.externalRef ?? null, bankConfirmedAt: event?.receivedAt ?? null,
      };
    }),
    total, page, pageSize,
  };
}

/** Bộ lọc from/to (theo giờ kết thúc booking) chỉ áp cho phần doanh thu đặt sân; số dư ví và ngân hàng luôn là hiện tại. */
export async function getAdminFinancialTransparency(page: number, pageSize: number, range: { from?: Date; to?: Date } = {}) {
  const revenueWhere = endAtRange(range.from, range.to);
  const [wallets, revenue, withdrawals, actual, allocated, total, events, bankByDirection, rewards, seriesRows] = await Promise.all([
    prisma.wallet.groupBy({ by: ['walletType'], _sum: { available: true, pending: true, reserved: true } }),
    prisma.bookingRevenue.aggregate({ where: revenueWhere, _sum: { gross: true, net: true, commission: true } }),
    prisma.withdrawalRequest.findMany({ select: { amount: true, paidAmount: true, status: true } }),
    prisma.sepayEvent.aggregate({ _sum: { amount: true } }),
    prisma.sepayAllocation.aggregate({ _sum: { amount: true } }),
    prisma.sepayEvent.count(),
    prisma.sepayEvent.findMany({
      include: { allocations: true }, orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize, take: pageSize,
    }),
    prisma.sepayEvent.groupBy({ by: ['direction'], _sum: { amount: true } }),
    prisma.rewardPayout.groupBy({ by: ['status'], _sum: { amount: true } }),
    prisma.bookingRevenue.findMany({ where: revenueWhere, select: { businessUserId: true, endAt: true, gross: true, net: true, commission: true } }),
  ]);
  const sumWallet = (type: 'personal' | 'business' | 'platform', field: 'available' | 'pending' | 'reserved') =>
    wallets.find((row) => row.walletType === type)?._sum[field] ?? 0n;
  const bank = (direction: 'in' | 'out') => bankByDirection.find((row) => row.direction === direction)?._sum.amount ?? 0n;
  const reward = (paid: boolean) => rewards.filter((row) => (row.status === 'paid') === paid && row.status !== 'cancelled')
    .reduce((sum, row) => sum + (row._sum.amount ?? 0n), 0n);
  const reservedPayout = withdrawals.filter((row) => row.status === 'pending' || row.status === 'partially_paid')
    .reduce((sum, row) => sum + row.amount - (row.paidAmount ?? 0n), 0n);
  const paidPayout = withdrawals.reduce((sum, row) => sum + (row.paidAmount ?? 0n), 0n);
  const actualAmount = actual._sum.amount ?? 0n;
  const allocatedAmount = allocated._sum.amount ?? 0n;
  return {
    summary: {
      customerPayments: money(revenue._sum.gross), ownerPending: money(sumWallet('business', 'pending')),
      ownerAvailable: money(sumWallet('business', 'available')), reservedPayout: money(reservedPayout),
      paidPayout: money(paidPayout), platformRevenue: money(sumWallet('platform', 'available')),
      bankMovement: money(actualAmount), allocatedMovement: money(allocatedAmount), difference: money(actualAmount - allocatedAmount),
      // Phân rã để UI hiển thị "tổng = các phần" (gross = hoàn + phí + chủ sân; tiền đang giữ theo từng loại ví).
      bookingGross: money(revenue._sum.gross), bookingRefunded: money(refundedOf(revenue._sum)),
      bookingCommission: money(revenue._sum.commission), bookingNet: money(revenue._sum.net),
      bankIn: money(bank('in')), bankOut: money(bank('out')),
      ownerReserved: money(sumWallet('business', 'reserved')),
      playerAvailable: money(sumWallet('personal', 'available')), playerReserved: money(sumWallet('personal', 'reserved')),
      platformReserved: money(sumWallet('platform', 'reserved')),
      rewardPaid: money(reward(true)), rewardPending: money(reward(false)),
    },
    byMonth: revenueSeries(seriesRows, (row) => vietnamDate(row.endAt).slice(0, 7)).sort((a, b) => a.key.localeCompare(b.key)),
    byOwner: revenueSeries(seriesRows, (row) => row.businessUserId).sort((a, b) => Number(BigInt(b.gross) - BigInt(a.gross))).slice(0, 10),
    transactions: {
      items: events.map((event) => ({
        id: event.id, businessCode: event.businessCode, direction: event.direction, amount: money(event.amount), provider: 'SePay',
        providerReference: event.externalRef, receivedAt: event.receivedAt, status: event.status,
        businessReference: event.rawRef || null, matchedType: event.matchedType,
        allocatedAmount: money(event.allocations.reduce((sum, row) => sum + row.amount, 0n)),
      })),
      total, page, pageSize,
    },
  };
}
