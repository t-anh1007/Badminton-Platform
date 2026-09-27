import type { BookingStatus, CancellationReason, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { HttpAccountDisplayNameClient, type AccountDisplayNameClient } from '../clients/account.js';
import { vietnamDateEndExclusiveInstant, vietnamDateStartInstant } from '../lib/vietnamTime.js';

export type ProviderBookingTimeScope = 'all' | 'past' | 'current' | 'future';

export interface ProviderBookingFilters {
  query?: string;
  venueId?: string;
  courtId?: string;
  status?: BookingStatus;
  timeScope: ProviderBookingTimeScope;
  from?: Date;
  to?: Date;
  page: number;
  pageSize: number;
}

export interface ProviderBookingRow {
  id: string;
  businessCode: string;
  source: 'marketplace' | 'internal';
  status: BookingStatus;
  startAt: Date;
  endAt: Date;
  priceSnapshot: string;
  holdExpiresAt: Date | null;
  cancellationReason: CancellationReason | null;
  matchDepositPaid: boolean;
  manualCustomerNotificationRequired: boolean;
  customer: { label: string; guestContact?: string };
  court: { id: string; name: string; venue: { id: string; name: string; address: string } };
}

export interface ProviderBookingDetail extends ProviderBookingRow {
  cancellationRefundPercent: number | null;
  courtChangedAt: Date | null;
}

const bookingInclude = {
  court: { include: { venue: true } },
  shutdownItems: { select: { id: true }, take: 1 },
} satisfies Prisma.BookingInclude;
type LoadedProviderBooking = Prisma.BookingGetPayload<{ include: typeof bookingInclude }>;

function visibleBookingWhere(paidMatchHoldIds: string[]): Prisma.BookingWhereInput {
  return {
    OR: [
      { status: { in: ['confirmed', 'completed'] } },
      { status: 'cancelled', cancellationReason: { not: null } },
      ...(paidMatchHoldIds.length
        ? [{ status: 'held' as const, holdId: { in: paidMatchHoldIds } }]
        : []),
    ],
  };
}

function timeWhere(scope: ProviderBookingTimeScope, now: Date): Prisma.BookingWhereInput {
  if (scope === 'past') return { endAt: { lte: now } };
  if (scope === 'current') {
    return {
      startAt: { lte: now },
      endAt: { gt: now },
      status: { not: 'cancelled' },
    };
  }
  if (scope === 'future') {
    return {
      startAt: { gt: now },
      status: { not: 'cancelled' },
    };
  }
  return {};
}

function baseWhere(
  userId: string,
  input: ProviderBookingFilters,
  paidMatchHoldIds: string[],
): Prisma.BookingWhereInput {
  const filters: Prisma.BookingWhereInput[] = [
    { court: { venue: { provider: { userId } } } },
    visibleBookingWhere(paidMatchHoldIds),
  ];
  const query = input.query?.trim();

  if (input.venueId) filters.push({ court: { venueId: input.venueId } });
  if (input.courtId) filters.push({ courtId: input.courtId });
  if (input.status) filters.push({ status: input.status });
  if (query) {
    filters.push({
      OR: [
        { businessCode: { contains: query, mode: 'insensitive' } },
        { id: { contains: query, mode: 'insensitive' } },
        { guestName: { contains: query, mode: 'insensitive' } },
        { court: { name: { contains: query, mode: 'insensitive' } } },
        { court: { venue: { name: { contains: query, mode: 'insensitive' } } } },
      ],
    });
  }
  if (input.from || input.to) {
    filters.push({
      startAt: {
        ...(input.from ? { gte: vietnamDateStartInstant(input.from) } : {}),
        ...(input.to ? { lt: vietnamDateEndExclusiveInstant(input.to) } : {}),
      },
    });
  }

  return { AND: filters };
}

function projectBooking(
  booking: LoadedProviderBooking,
  displayNames: Map<string, string>,
  paidMatchHoldIds: Set<string>,
): ProviderBookingRow {
  const internal = booking.source === 'internal';
  return {
    id: booking.id,
    businessCode: booking.businessCode,
    source: booking.source,
    status: booking.status,
    startAt: booking.startAt,
    endAt: booking.endAt,
    priceSnapshot: booking.priceSnapshot.toString(),
    holdExpiresAt: booking.holdExpiresAt,
    cancellationReason: booking.cancellationReason,
    matchDepositPaid: booking.status === 'held'
      && booking.holdId !== null
      && paidMatchHoldIds.has(booking.holdId),
    manualCustomerNotificationRequired: internal && booking.status === 'cancelled' && booking.shutdownItems.length > 0,
    customer: {
      label: internal
        ? (booking.guestName ?? 'Khách vãng lai')
        : (booking.userId ? (displayNames.get(booking.userId) ?? 'Người chơi') : 'Người chơi'),
      ...(internal && booking.guestContact ? { guestContact: booking.guestContact } : {}),
    },
    court: {
      id: booking.court.id,
      name: booking.court.name,
      venue: {
        id: booking.court.venue.id,
        name: booking.court.venue.name,
        address: booking.court.venue.address,
      },
    },
  };
}

export async function listProviderBookings(
  userId: string,
  input: ProviderBookingFilters,
  accountClient: AccountDisplayNameClient = new HttpAccountDisplayNameClient(),
) {
  const now = new Date();
  const paidMatchHoldIds = (await prisma.hold.findMany({
    where: { purpose: 'match' },
    select: { id: true },
  })).map((hold) => hold.id);
  const paidMatchHoldIdSet = new Set(paidMatchHoldIds);
  const base = baseWhere(userId, input, paidMatchHoldIds);
  const where: Prisma.BookingWhereInput = { AND: [base, timeWhere(input.timeScope, now)] };

  const [total, bookings, all, completed, current, future] = await prisma.$transaction([
    prisma.booking.count({ where }),
    prisma.booking.findMany({
      where,
      include: bookingInclude,
      orderBy: [{ startAt: 'desc' }, { id: 'desc' }],
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
    prisma.booking.count({ where: base }),
    prisma.booking.count({ where: { AND: [base, { status: 'completed' }] } }),
    prisma.booking.count({ where: { AND: [base, timeWhere('current', now)] } }),
    prisma.booking.count({ where: { AND: [base, timeWhere('future', now)] } }),
  ]);

  let displayNames = new Map<string, string>();
  try {
    const profiles = await accountClient.getPublicDisplayNames(
      bookings.flatMap((booking) => booking.userId ? [booking.userId] : []),
    );
    displayNames = new Map(
      profiles.flatMap((profile) => profile.displayName ? [[profile.userId, profile.displayName]] : []),
    );
  } catch {
    // Display names are best-effort enrichment; booking management remains available.
  }

  const items = bookings.map((booking) => projectBooking(booking, displayNames, paidMatchHoldIdSet));
  return {
    items,
    total,
    page: input.page,
    pageSize: input.pageSize,
    summary: {
      all,
      completed,
      current,
      future,
    },
  };
}

export async function getProviderBookingDetail(
  userId: string,
  bookingId: string,
  accountClient: AccountDisplayNameClient = new HttpAccountDisplayNameClient(),
): Promise<ProviderBookingDetail> {
  const booking = await prisma.booking.findFirst({
    where: {
      id: bookingId,
      court: { venue: { provider: { userId } } },
    },
    include: bookingInclude,
  });
  if (!booking) throw new AppError('BOOKING_NOT_FOUND', 'Không tìm thấy booking.', 404);

  const paidMatchHoldIds = booking.holdId
    ? (await prisma.hold.findMany({
        where: { id: booking.holdId, purpose: 'match' },
        select: { id: true },
      })).map((hold) => hold.id)
    : [];
  const meaningful = booking.status === 'confirmed'
    || booking.status === 'completed'
    || (booking.status === 'cancelled' && booking.cancellationReason !== null)
    || (booking.status === 'held' && booking.holdId !== null && paidMatchHoldIds.includes(booking.holdId));
  if (!meaningful) throw new AppError('BOOKING_NOT_FOUND', 'Không tìm thấy booking.', 404);

  let displayNames = new Map<string, string>();
  try {
    const profiles = await accountClient.getPublicDisplayNames(booking.userId ? [booking.userId] : []);
    displayNames = new Map(
      profiles.flatMap((profile) => profile.displayName ? [[profile.userId, profile.displayName]] : []),
    );
  } catch {
    // Display names are best-effort enrichment; booking details remain available.
  }

  return {
    ...projectBooking(booking, displayNames, new Set(paidMatchHoldIds)),
    cancellationRefundPercent: booking.cancellationRefundPercent,
    courtChangedAt: booking.courtChangedAt,
  };
}
