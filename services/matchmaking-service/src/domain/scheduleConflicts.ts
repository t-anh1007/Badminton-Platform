import type { VenueBookingClient } from '../clients/venueBooking.js';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

export interface PlayerScheduleConflict {
  kind: 'match' | 'booking';
  role: 'organizer' | 'participant' | 'booker';
  startAt: string;
  endAt: string;
  court: { id: string; name: string };
  venue: { id: string; name: string; address: string };
}

function overlaps(startAt: string, endAt: string, requestedStart: Date, requestedEnd: Date) {
  return new Date(startAt) < requestedEnd && new Date(endAt) > requestedStart;
}

export async function findPlayerScheduleConflicts(
  venueBookingClient: VenueBookingClient,
  userId: string,
  startAt: Date,
  endAt: Date,
  excludeMatchId?: string,
): Promise<PlayerScheduleConflict[]> {
  const activeApprovedAfter = new Date(Date.now() - 10 * 60_000);
  const activeJoinWhere: Prisma.JoinWhereInput = {
    participantUserId: userId,
    OR: [
      { status: { in: ['pending', 'confirmed'] } },
      { status: 'approved', approvedAt: { gt: activeApprovedAfter } },
    ],
  };
  const matches = await prisma.match.findMany({
    where: {
      id: excludeMatchId ? { not: excludeMatchId } : undefined,
      status: { in: ['awaiting_deposit', 'open', 'filled', 'confirmed'] },
      OR: [
        { organizerUserId: userId },
        { joins: { some: activeJoinWhere } },
      ],
    },
    include: {
      joins: {
        where: activeJoinWhere,
        select: { id: true },
      },
    },
  });
  const contexts = matches.length === 0
    ? []
    : venueBookingClient.getMatchContexts
      ? await venueBookingClient.getMatchContexts(matches.map((match) => match.bookingId))
      : await Promise.all(matches.map((match) => venueBookingClient.getMatchContext(match.bookingId)));

  const matchConflicts: PlayerScheduleConflict[] = matches.flatMap((match, index) => {
    const context = contexts[index];
    if (!context || !['held', 'confirmed'].includes(context.status)
      || !overlaps(context.startAt, context.endAt, startAt, endAt)) return [];
    return [{
      kind: 'match' as const,
      role: match.organizerUserId === userId ? 'organizer' as const : 'participant' as const,
      startAt: context.startAt,
      endAt: context.endAt,
      court: context.court,
      venue: { id: context.venue.id, name: context.venue.name, address: context.venue.address },
    }];
  });

  const matchBookingIds = matches.map((match) => match.bookingId);
  const bookingConflicts = venueBookingClient.getPlayerScheduleConflicts
    ? await venueBookingClient.getPlayerScheduleConflicts(userId, startAt, endAt, matchBookingIds)
    : [];
  return [
    ...matchConflicts,
    ...bookingConflicts.map((conflict) => ({
      kind: 'booking' as const,
      role: 'booker' as const,
      startAt: conflict.startAt,
      endAt: conflict.endAt,
      court: conflict.court,
      venue: conflict.venue,
    })),
  ].sort((left, right) => left.startAt.localeCompare(right.startAt));
}
