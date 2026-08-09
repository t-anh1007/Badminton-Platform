import type { SkillTier } from '@prisma/client';
import type { MatchCreatedPayload } from '@khoaluantn/shared';
import type { VenueBookingClient, VenueMatchContext } from '../clients/venueBooking.js';
import type { AccountClient } from '../clients/account.js';
import { AppError } from '../lib/errors.js';
import { writeOutbox } from '../lib/outbox.js';
import { prisma } from '../lib/prisma.js';
import { describeRating } from './rating.js';

const TIER_ORDER: Record<SkillTier, number> = {
  newcomer: 0,
  beginner: 1,
  intermediate: 2,
  intermediate_plus: 3,
  advanced: 4,
};

export interface MatchSearchFilters {
  skill?: SkillTier;
  area?: string;
  startFrom?: Date;
  endBefore?: Date;
  feeMax?: bigint;
  minOpenSlots: number;
}

export interface CreateMatchInput {
  bookingId?: string;
  holdId?: string;
  capacity: number;
  feeMode: 'free' | 'split';
  skillMin?: SkillTier;
  skillMax?: SkillTier;
}

const MATCH_CUTOFF_MINUTES = 60;

export async function createMatch(
  venueBookingClient: VenueBookingClient,
  organizerUserId: string,
  authorization: string,
  input: CreateMatchInput,
  now = new Date(),
) {
  const bookingId = input.bookingId
    ?? await venueBookingClient.createBookingFromHold(input.holdId!, authorization);
  const context = await venueBookingClient.getMatchContext(bookingId);
  const heldByOrganizer = context?.status === 'held'
    && context.ownerUserId === organizerUserId
    && context.holdExpiresAt !== null
    && new Date(context.holdExpiresAt) > now;
  if (!context || !heldByOrganizer) {
    throw new AppError(422, 'MATCH_SLOT_NOT_HELD', 'Slot sân không còn được organizer giữ hợp lệ.');
  }

  const cutoffAt = new Date(new Date(context.startAt).getTime() - MATCH_CUTOFF_MINUTES * 60_000);
  if (cutoffAt <= now) {
    throw new AppError(422, 'MATCH_CUTOFF_PASSED', 'Slot đã qua hạn chốt kèo.');
  }
  const price = BigInt(context.priceSnapshot);
  const feePerSlot = input.feeMode === 'free' ? 0n : price / BigInt(input.capacity);
  const organizerContribution = input.feeMode === 'free'
    ? price
    : price - feePerSlot * BigInt(input.capacity - 1);

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${bookingId}, 0))`;
    const existing = await tx.match.findUnique({ where: { bookingId } });
    if (existing) {
      const sameRequest = existing.organizerUserId === organizerUserId
        && existing.capacity === input.capacity
        && existing.feePerSlot === feePerSlot
        && existing.skillMin === (input.skillMin ?? null)
        && existing.skillMax === (input.skillMax ?? null);
      if (!sameRequest) {
        throw new AppError(409, 'BOOKING_MATCH_ALREADY_EXISTS', 'Booking đã được dùng cho một kèo khác.');
      }
      return existing;
    }

    const match = await tx.match.create({
      data: {
        organizerUserId,
        bookingId,
        capacity: input.capacity,
        feePerSlot,
        skillMin: input.skillMin,
        skillMax: input.skillMax,
        cutoffAt,
      },
    });
    await writeOutbox(tx, {
      aggregateType: 'Match',
      aggregateId: match.id,
      eventType: 'MatchCreated',
      payload: {
        matchId: match.id,
        organizerUserId,
        bookingId,
        capacity: match.capacity,
        feePerSlot: match.feePerSlot.toString(),
        bookingPrice: price.toString(),
        organizerContribution: organizerContribution.toString(),
        cutoffAt: match.cutoffAt.toISOString(),
      } satisfies MatchCreatedPayload,
    });
    return match;
  });
}

function skillIntersects(
  skill: SkillTier | undefined,
  min: SkillTier | null,
  max: SkillTier | null,
): boolean {
  if (!skill) return true;
  const requested = TIER_ORDER[skill];
  return requested >= (min ? TIER_ORDER[min] : 0) && requested <= (max ? TIER_ORDER[max] : 4);
}

function contextMatches(context: VenueMatchContext, filters: MatchSearchFilters): boolean {
  if (context.status === 'cancelled' || context.status === 'completed') return false;
  const startAt = new Date(context.startAt);
  if (filters.startFrom && startAt < filters.startFrom) return false;
  if (filters.endBefore && startAt >= filters.endBefore) return false;
  if (filters.area) {
    const haystack = `${context.venue.name} ${context.venue.address}`.toLocaleLowerCase('vi');
    if (!haystack.includes(filters.area.toLocaleLowerCase('vi'))) return false;
  }
  return true;
}

export async function findPublicMatches(
  venueBookingClient: VenueBookingClient,
  filters: MatchSearchFilters,
  now = new Date(),
) {
  const candidates = await prisma.match.findMany({
    where: {
      status: 'open',
      cutoffAt: { gt: now },
      ...(filters.feeMax === undefined ? {} : { feePerSlot: { lte: filters.feeMax } }),
    },
    include: { joins: { where: { status: { in: ['approved', 'confirmed'] } }, select: { id: true } } },
  });

  const hydrated = await Promise.all(candidates.map(async (match) => ({
    match,
    context: await venueBookingClient.getMatchContext(match.bookingId),
  })));

  return hydrated.flatMap(({ match, context }) => {
    const openSlots = match.capacity - 1 - match.joins.length;
    if (
      !context
      || openSlots < filters.minOpenSlots
      || !skillIntersects(filters.skill, match.skillMin, match.skillMax)
      || !contextMatches(context, filters)
    ) return [];

    return [{
      id: match.id,
      organizerUserId: match.organizerUserId,
      capacity: match.capacity,
      openSlots,
      feePerSlot: match.feePerSlot.toString(),
      skillMin: match.skillMin,
      skillMax: match.skillMax,
      cutoffAt: match.cutoffAt,
      startAt: context.startAt,
      endAt: context.endAt,
      court: context.court,
      venue: context.venue,
    }];
  }).sort((left, right) => left.startAt.localeCompare(right.startAt));
}

export async function getPublicMatchDetail(
  venueBookingClient: VenueBookingClient,
  accountClient: AccountClient,
  matchId: string,
  requester?: { id: string; roles: string[] },
  now = new Date(),
) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: { joins: { where: { status: { in: ['approved', 'confirmed'] } }, select: { id: true, status: true } } },
  });
  if (!match || match.status !== 'open' || match.cutoffAt <= now) {
    throw new AppError(404, 'MATCH_NOT_FOUND', 'Không tìm thấy kèo công khai.');
  }

  const [context, organizerProfile, organizerPassport] = await Promise.all([
    venueBookingClient.getMatchContext(match.bookingId),
    accountClient.getPublicMatchProfile(match.organizerUserId),
    prisma.passport.findUnique({ where: { userId: match.organizerUserId } }),
  ]);
  if (!context || !organizerProfile || context.status === 'cancelled' || context.status === 'completed') {
    throw new AppError(404, 'MATCH_NOT_FOUND', 'Không tìm thấy kèo công khai.');
  }

  const openSlots = match.capacity - 1 - match.joins.length;
  return {
    id: match.id,
    capacity: match.capacity,
    openSlots,
    feePerSlot: match.feePerSlot.toString(),
    skillMin: match.skillMin,
    skillMax: match.skillMax,
    cutoffAt: match.cutoffAt,
    startAt: context.startAt,
    endAt: context.endAt,
    court: context.court,
    venue: context.venue,
    organizer: {
      displayName: organizerProfile.displayName,
      identityVisibility: organizerProfile.identityVisibility,
      tier: organizerPassport
        ? describeRating({
          rating: organizerPassport.ratingMu,
          rd: organizerPassport.ratingRd,
          sigma: organizerPassport.ratingSigma,
        }).tier
        : null,
    },
    confirmedParticipants: match.joins.filter((join) => join.status === 'confirmed').length,
    actions: {
      canJoin: Boolean(
        requester?.roles.includes('player')
        && requester.id !== match.organizerUserId
        && openSlots > 0,
      ),
    },
  };
}

export async function requestJoin(matchId: string, participantUserId: string, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${matchId}, 0))`;
    const match = await tx.match.findUnique({ where: { id: matchId } });
    if (!match) throw new AppError(404, 'MATCH_NOT_FOUND', 'Không tìm thấy kèo.');
    if (match.status !== 'open' || match.cutoffAt <= now) {
      throw new AppError(409, 'MATCH_NOT_OPEN', 'Kèo không còn mở nhận người chơi.');
    }
    if (match.organizerUserId === participantUserId) {
      throw new AppError(409, 'ORGANIZER_ALREADY_PARTICIPATES', 'Organizer đã chiếm một chỗ trong kèo.');
    }
    const [reservedCount, activeJoin] = await Promise.all([
      tx.join.count({ where: { matchId, status: { in: ['approved', 'confirmed'] } } }),
      tx.join.findFirst({
        where: {
          matchId,
          participantUserId,
          status: { in: ['pending', 'approved', 'confirmed'] },
        },
      }),
    ]);
    if (activeJoin) throw new AppError(409, 'JOIN_ALREADY_ACTIVE', 'Đã có yêu cầu tham gia đang hoạt động.');
    if (reservedCount + 1 >= match.capacity) {
      throw new AppError(409, 'MATCH_FULL', 'Kèo đã hết chỗ.');
    }
    return tx.join.create({ data: { matchId, participantUserId } });
  });
}
