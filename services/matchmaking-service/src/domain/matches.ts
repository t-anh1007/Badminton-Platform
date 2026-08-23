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

// PLAN_MATCH-DEPOSIT (kèo đơn, cọc). Đặt thành config để chỉnh không rải rác.
const HOUR_MS = 3_600_000;
export const MIN_LEAD_HOURS = 24;      // DM3: chỉ tạo kèo khi slot còn >= 24h
export const MAX_ACTIVE_MATCHES = 3;   // DM7: trần kèo đang giữ slot / chủ kèo

/** DM5 — hạn tìm đối X theo thời gian dẫn L (giờ). */
export function computeMatchDeadline(now: Date, startAt: Date): Date {
  const leadHours = (startAt.getTime() - now.getTime()) / HOUR_MS;
  const holdHours = leadHours < 48 ? 6 : leadHours < 72 ? 12 : leadHours < 120 ? 18 : 24;
  return new Date(now.getTime() + holdHours * HOUR_MS);
}

export async function createMatch(
  venueBookingClient: VenueBookingClient,
  organizerUserId: string,
  authorization: string,
  input: CreateMatchInput,
  now = new Date(),
) {
  // DM1/DM13: chỉ kèo đơn 2 người, chia đôi phí. DM2: tạo từ slot đang giữ (hold).
  if (input.feeMode !== 'split') {
    throw new AppError(422, 'MATCH_DEPOSIT_SPLIT_ONLY', 'Kèo cọc chỉ hỗ trợ chia đôi phí.');
  }
  if (input.capacity !== 2) {
    throw new AppError(422, 'MATCH_SINGLES_ONLY', 'Hiện chỉ hỗ trợ kèo đơn 2 người.');
  }
  if (!input.holdId) {
    throw new AppError(422, 'MATCH_HOLD_REQUIRED', 'Cần giữ slot trước khi tạo kèo.');
  }

  // DM7: trần số kèo đang giữ slot đồng thời của chủ kèo.
  const activeCount = await prisma.match.count({
    where: { organizerUserId, status: { in: ['awaiting_deposit', 'open', 'filled'] } },
  });
  if (activeCount >= MAX_ACTIVE_MATCHES) {
    throw new AppError(409, 'MATCH_ACTIVE_LIMIT', `Bạn đang giữ ${MAX_ACTIVE_MATCHES} kèo; hãy hoàn tất hoặc hủy bớt trước.`);
  }

  const bookingId = await venueBookingClient.createBookingFromHold(input.holdId, authorization);
  const context = await venueBookingClient.getMatchContext(bookingId);
  const heldByOrganizer =
    context?.status === 'held' &&
    context.ownerUserId === organizerUserId &&
    context.holdExpiresAt !== null &&
    new Date(context.holdExpiresAt) > now;
  if (!context || !heldByOrganizer) {
    throw new AppError(422, 'MATCH_SLOT_NOT_HELD', 'Slot sân không còn được organizer giữ hợp lệ.');
  }

  const startAt = new Date(context.startAt);
  // DM3: chỉ cho tạo kèo khi slot còn ít nhất 24h tới giờ đá.
  if (startAt.getTime() - now.getTime() < MIN_LEAD_HOURS * HOUR_MS) {
    throw new AppError(422, 'MATCH_LEAD_TOO_SHORT', 'Chỉ tạo được kèo cho slot còn ít nhất 24 giờ nữa.');
  }
  const deadlineAt = computeMatchDeadline(now, startAt);
  const depositExpiresAt = new Date(context.holdExpiresAt!); // cửa sổ checkout (~10 phút)

  const price = BigInt(context.priceSnapshot);
  const feePerSlot = price / 2n;                 // đối trả 1/2 (kèo đơn)
  const organizerContribution = price - feePerSlot; // cọc chủ kèo = phần còn lại (bảo toàn giá trị)

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${bookingId}, 0))`;
    const existing = await tx.match.findUnique({ where: { bookingId } });
    if (existing) {
      const sameRequest =
        existing.organizerUserId === organizerUserId &&
        existing.capacity === 2 &&
        existing.feePerSlot === feePerSlot &&
        existing.skillMin === (input.skillMin ?? null) &&
        existing.skillMax === (input.skillMax ?? null);
      if (!sameRequest) {
        throw new AppError(409, 'BOOKING_MATCH_ALREADY_EXISTS', 'Booking đã được dùng cho một kèo khác.');
      }
      return existing;
    }

    const match = await tx.match.create({
      data: {
        organizerUserId,
        bookingId,
        capacity: 2,
        feePerSlot,
        skillMin: input.skillMin,
        skillMax: input.skillMax,
        status: 'awaiting_deposit',
        cutoffAt: deadlineAt,
        deadlineAt,
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
        capacity: 2,
        feePerSlot: feePerSlot.toString(),
        bookingPrice: price.toString(),
        organizerContribution: organizerContribution.toString(),
        cutoffAt: deadlineAt.toISOString(),
        depositExpiresAt: depositExpiresAt.toISOString(),
      } satisfies MatchCreatedPayload,
    });
    return match;
  });
}

function skillIntersects(skill: SkillTier | undefined, min: SkillTier | null, max: SkillTier | null): boolean {
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
  accountClient?: AccountClient,
) {
  const candidates = await prisma.match.findMany({
    where: {
      status: 'open',
      cutoffAt: { gt: now },
      ...(filters.feeMax === undefined ? {} : { feePerSlot: { lte: filters.feeMax } }),
    },
    include: {
      joins: {
        where: { status: { in: ['approved', 'confirmed'] } },
        select: { id: true },
      },
    },
  });

  if (candidates.length === 0) return [];

  const contexts = venueBookingClient.getMatchContexts
    ? await venueBookingClient.getMatchContexts(candidates.map((match) => match.bookingId))
    : await Promise.all(candidates.map((match) => venueBookingClient.getMatchContext(match.bookingId)));
  const hydrated = candidates.map((match, index) => ({ match, context: contexts[index] ?? null }));

  const rows = hydrated
    .flatMap(({ match, context }) => {
      const openSlots = match.capacity - 1 - match.joins.length;
      if (
        !context ||
        openSlots < filters.minOpenSlots ||
        !skillIntersects(filters.skill, match.skillMin, match.skillMax) ||
        !contextMatches(context, filters)
      )
        return [];

      return [
        {
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
        },
      ];
    })
    .sort((left, right) => left.startAt.localeCompare(right.startAt));
  if (!accountClient) return rows;
  return Promise.all(rows.map(async (row) => ({ ...row, organizer: await accountClient.getPublicMatchProfile(row.organizerUserId) })));
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
    include: {
      joins: {
        where: { status: { in: ['pending', 'approved', 'confirmed'] } },
        select: {
          id: true,
          participantUserId: true,
          status: true,
          approvedAt: true,
        },
      },
    },
  });
  if (!match) {
    throw new AppError(404, 'MATCH_NOT_FOUND', 'Không tìm thấy kèo công khai.');
  }

  const ownJoin = requester ? (match.joins.find((join) => join.participantUserId === requester.id) ?? null) : null;
  const isOrganizer = requester?.id === match.organizerUserId;
  const isPubliclyOpen = match.status === 'open' && match.cutoffAt > now;
  const canViewOwnLifecycle = Boolean(
    // PLAN_MATCH-DEPOSIT: chủ kèo phải xem được kèo awaiting_deposit để trả cọc.
    requester && (isOrganizer || ownJoin) && ['awaiting_deposit', 'open', 'filled', 'confirmed'].includes(match.status),
  );
  if (!isPubliclyOpen && !canViewOwnLifecycle) {
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

  const reservedJoins = match.joins.filter((join) => join.status === 'approved' || join.status === 'confirmed');
  const openSlots = match.capacity - 1 - reservedJoins.length;
  return {
    id: match.id,
    status: match.status,
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
      avatarUrl: organizerProfile.avatarUrl,
      identityVisibility: organizerProfile.identityVisibility,
      tier: organizerPassport
        ? describeRating({
            rating: organizerPassport.ratingMu,
            rd: organizerPassport.ratingRd,
            sigma: organizerPassport.ratingSigma,
          }).tier
        : null,
    },
    confirmedParticipants: reservedJoins.filter((join) => join.status === 'confirmed').length,
    actions: {
      canJoin: Boolean(
        requester?.roles.includes('player') &&
        match.status === 'open' &&
        match.cutoffAt > now &&
        requester.id !== match.organizerUserId &&
        !ownJoin &&
        openSlots > 0,
      ),
      isOrganizer,
      canPayOrganizerContribution: Boolean(
        // PLAN_MATCH-DEPOSIT: chủ kèo trả cọc ở bước awaiting_deposit (trước, không phải sau filled).
        isOrganizer && match.status === 'awaiting_deposit' && match.feePerSlot > 0n && !match.organizerContributionPaidAt,
      ),
      ownJoin: ownJoin
        ? {
            id: ownJoin.id,
            status: ownJoin.status,
            approvedAt: ownJoin.approvedAt,
          }
        : null,
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
      tx.join.count({
        where: { matchId, status: { in: ['approved', 'confirmed'] } },
      }),
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
