import { bookingReferences } from './bookingReferences.js';
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

export async function listProviderFinancialTransparency(userId: string, filters: TransparencyFilters) {
  const baseWhere = {
    businessUserId: userId,
    ...(filters.venueId ? { venueId: filters.venueId } : {}),
    ...(filters.from || filters.to ? {
      endAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) },
    } : {}),
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
  const [wallet, total, rows, totals] = await Promise.all([
    prisma.wallet.findFirst({ where: { userId, walletType: 'business' } }),
    prisma.bookingRevenue.count({ where }),
    prisma.bookingRevenue.findMany({
      where,
      orderBy: [{ endAt: 'desc' }, { bookingId: 'desc' }],
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    prisma.bookingRevenue.aggregate({ where: baseWhere, _sum: { gross: true, net: true, commission: true } }),
  ]);
  const bookingIds = rows.map((row) => row.bookingId);
  const bookingCodes = await bookingReferences(bookingIds);
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
    },
    transactions: {
      items: rows.map((row) => {
        const intent = intents.find((candidate) => candidate.refId === row.bookingId);
        const bankEvent = intent ? bankEvents.find((candidate) => candidate.matchedId === intent.id) : undefined;
        const status: TransparencyStatus = row.cancelledAt ? 'cancelled' : disputeSet.has(row.bookingId) ? 'disputed' : row.releasedAt ? 'available' : 'pending';
        return {
          bookingId: row.bookingId, bookingCode: bookingCodes.get(row.bookingId) ?? null, venueId: row.venueId, gross: money(row.gross), net: money(row.net), commission: money(row.commission),
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

export async function getAdminFinancialTransparency(page: number, pageSize: number) {
  const [wallets, revenue, withdrawals, actual, allocated, total, events] = await Promise.all([
    prisma.wallet.findMany({ select: { walletType: true, available: true, pending: true, reserved: true } }),
    prisma.bookingRevenue.aggregate({ _sum: { gross: true, net: true, commission: true } }),
    prisma.withdrawalRequest.findMany({ select: { amount: true, paidAmount: true, status: true } }),
    prisma.sepayEvent.aggregate({ _sum: { amount: true } }),
    prisma.sepayAllocation.aggregate({ _sum: { amount: true } }),
    prisma.sepayEvent.count(),
    prisma.sepayEvent.findMany({
      include: { allocations: true }, orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize, take: pageSize,
    }),
  ]);
  const sumWallet = (type: 'business' | 'platform', field: 'available' | 'pending' | 'reserved') =>
    wallets.filter((row) => row.walletType === type).reduce((sum, row) => sum + row[field], 0n);
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
    },
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
