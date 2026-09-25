import type { MatchDiscipline as DbDiscipline, MatchRatio as DbRatio, MatchSourceType, SkillTier, TeamSide } from '@prisma/client';
import type { JoinApprovedPayload, MatchCreatedPayload, MatchRatio } from '@khoaluantn/shared';
import { RATIO_FROM_DB, RATIO_TO_DB, calculateMatchFunding, capacityOf, formatAllowed, participantSlots, teamSize } from './matchRules.js';
import type { VenueBookingClient, VenueMatchContext } from '../clients/venueBooking.js';
import type { AccountClient } from '../clients/account.js';
import { AppError } from '../lib/errors.js';
import { writeOutbox } from '../lib/outbox.js';
import { prisma } from '../lib/prisma.js';
import { describeRating } from './rating.js';
import { JOIN_HOLD_MINUTES, reservedTeamSlots } from './joins.js';

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
  mode: 'friendly' | 'ranked';
  discipline: 'singles' | 'doubles';
  ratio: MatchRatio;
  format: 'bo3' | 'bo5';
  skillMin?: SkillTier;
  skillMax?: SkillTier;
}

// PLAN_MATCH-DEPOSIT (kèo đơn, cọc). Đặt thành config để chỉnh không rải rác.
const HOUR_MS = 3_600_000;
export const MIN_LEAD_HOURS = 24;      // DM3: chỉ tạo kèo khi slot còn >= 24h

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
  // BR-CM-01: nguồn là hold còn hiệu lực hoặc booking đã thanh toán của chính chủ kèo.
  const sourceType = input.bookingId ? 'paid_booking' as const : 'hold' as const;
  let bookingId: string;
  if (sourceType === 'hold') {
    if (!input.holdId) throw new AppError(422, 'MATCH_HOLD_REQUIRED', 'Cần giữ slot trước khi tạo kèo.');
    bookingId = await venueBookingClient.createBookingFromHold(input.holdId, authorization);
  } else {
    bookingId = input.bookingId!;
  }
  const context = await venueBookingClient.getMatchContext(bookingId);
  const ownedSource = sourceType === 'hold'
    ? context?.status === 'held' && context.ownerUserId === organizerUserId
      && context.holdExpiresAt !== null && new Date(context.holdExpiresAt) > now
    : context?.status === 'confirmed' && context.ownerUserId === organizerUserId;
  if (!context || !ownedSource) {
    throw sourceType === 'hold'
      ? new AppError(422, 'MATCH_SLOT_NOT_HELD', 'Slot sân không còn được organizer giữ hợp lệ.')
      : new AppError(422, 'MATCH_BOOKING_NOT_OWNED', 'Chỉ booking đã thanh toán của chính bạn mới chuyển được thành kèo.');
  }

  const startAt = new Date(context.startAt);
  const endAt = new Date(context.endAt);
  // BR-CM-02: chỉ cho tạo kèo khi slot còn ít nhất 24h tới giờ đá.
  if (startAt.getTime() - now.getTime() < MIN_LEAD_HOURS * HOUR_MS) {
    throw new AppError(422, 'MATCH_LEAD_TOO_SHORT', 'Chỉ tạo được kèo cho slot còn ít nhất 24 giờ nữa.');
  }
  if (!formatAllowed(input.format, startAt, endAt)) {
    throw new AppError(422, 'MATCH_FORMAT_NOT_ALLOWED', 'Booking từ 90 phút trở xuống chỉ áp dụng thể thức BO3.');
  }
  if (input.mode === 'ranked' && !context.provinceCode) {
    throw new AppError(422, 'MATCH_PROVINCE_REQUIRED', 'Cơ sở chưa có tỉnh/thành nên chưa tạo được kèo xếp hạng.');
  }
  const deadlineAt = computeMatchDeadline(now, startAt);

  const capacity = capacityOf(input.discipline);
  const price = BigInt(context.priceSnapshot);
  const funding = calculateMatchFunding(price, input.ratio, capacity);
  const ratio = RATIO_TO_DB[input.ratio];

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${bookingId}, 0))`;
    const existing = await tx.match.findUnique({ where: { bookingId } });
    if (existing) {
      const sameRequest =
        existing.organizerUserId === organizerUserId &&
        existing.sourceType === sourceType &&
        existing.mode === input.mode &&
        existing.discipline === input.discipline &&
        existing.ratio === ratio &&
        existing.format === input.format &&
        existing.skillMin === (input.skillMin ?? null) &&
        existing.skillMax === (input.skillMax ?? null);
      if (!sameRequest) {
        throw new AppError(409, 'BOOKING_MATCH_ALREADY_EXISTS', 'Booking đã được dùng cho một kèo khác.');
      }
      return existing;
    }

    // Nguồn hold: chủ kèo trả phần tiền kèo trước khi kèo mở (luồng awaiting_deposit hiện có).
    // Nguồn booking đã thanh toán: tiền sân đã trả chính là phần của chủ kèo, kèo mở ngay.
    const paidBooking = sourceType === 'paid_booking';
    const match = await tx.match.create({
      data: {
        organizerUserId,
        bookingId,
        capacity,
        feePerSlot: funding.feePerSlot,
        skillMin: input.skillMin,
        skillMax: input.skillMax,
        skillConfiguredAt: now,
        status: paidBooking ? 'open' : 'awaiting_deposit',
        organizerContributionPaidAt: paidBooking ? now : null,
        cutoffAt: deadlineAt,
        deadlineAt,
        sourceType,
        mode: input.mode,
        discipline: input.discipline,
        ratio,
        format: input.format,
        bookingPrice: price,
        startAt,
        endAt,
        venueId: context.venue.id,
        provinceCode: context.provinceCode,
        providerUserId: context.providerUserId,
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
        capacity,
        feePerSlot: funding.feePerSlot.toString(),
        bookingPrice: price.toString(),
        organizerContribution: funding.organizerContribution.toString(),
        cutoffAt: deadlineAt.toISOString(),
        ...(paidBooking ? {} : { depositExpiresAt: new Date(context.holdExpiresAt!).toISOString() }),
        sourceType,
        mode: input.mode,
        discipline: input.discipline,
        ratio: input.ratio,
        teamSize: teamSize(input.discipline),
        resultReserve: funding.resultReserve.toString(),
        totalContribution: funding.totalContribution.toString(),
      } satisfies MatchCreatedPayload,
    });
    return match;
  });
}

type FundingSource = {
  sourceType: MatchSourceType;
  ratio: DbRatio;
  discipline: DbDiscipline;
  bookingPrice: bigint | null;
  feePerSlot: bigint;
  capacity: number;
  organizerUserId: string;
  organizerContributionPaidAt: Date | null;
};

/** Một view tiền do server tính cho màn 01-02; React chỉ định dạng, không tự tính lại. */
export function matchFundingView(match: FundingSource, viewer: { id: string; joinStatus: 'approved' | 'confirmed' | null } | null) {
  // Kèo cũ (trước v2) không có snapshot giá nên không dựng view tiền v2.
  if (match.bookingPrice === null) return null;
  const price = match.bookingPrice;
  const funding = calculateMatchFunding(price, RATIO_FROM_DB[match.ratio], capacityOf(match.discipline));
  const isOrganizer = viewer?.id === match.organizerUserId;
  const paidBooking = match.sourceType === 'paid_booking';
  let viewerDue = funding.feePerSlot;
  if (isOrganizer) viewerDue = paidBooking || match.organizerContributionPaidAt ? 0n : funding.organizerContribution;
  else if (viewer?.joinStatus === 'confirmed') viewerDue = 0n;
  return {
    bookingPrice: price.toString(),
    totalContribution: funding.totalContribution.toString(),
    resultHeldAmount: funding.resultReserve.toString(),
    regularSlotAmount: funding.feePerSlot.toString(),
    // Phần của chủ kèo và khoản hoàn cho chủ kèo là dữ liệu tiền cá nhân: chỉ chủ kèo xem (BR-CM-61).
    organizerContribution: isOrganizer ? funding.organizerContribution.toString() : null,
    viewerAdditionalAmountDue: viewer ? viewerDue.toString() : null,
    organizerRefundAtLock: isOrganizer ? (paidBooking ? price - funding.organizerContribution : 0n).toString() : null,
    organizerRefundWithdrawable: isOrganizer ? paidBooking : null,
  };
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
      status: { in: ['open', 'filled', 'confirmed'] },
      skillConfiguredAt: { not: null },
      OR: [
        { status: 'open', cutoffAt: { gt: now } },
        { status: { in: ['filled', 'confirmed'] } },
      ],
      ...(filters.feeMax === undefined ? {} : { feePerSlot: { lte: filters.feeMax } }),
    },
    include: {
      joins: {
        where: {
          OR: [
            { status: 'confirmed' },
            { status: 'approved', approvedAt: { gt: new Date(now.getTime() - JOIN_HOLD_MINUTES * 60_000) } },
          ],
        },
        select: { id: true, status: true, approvedAt: true },
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
          businessCode: match.businessCode,
          status: match.status,
          paymentPending: match.joins.some((join) => join.status === 'approved'),
          organizerUserId: match.organizerUserId,
          capacity: match.capacity,
          openSlots,
          feePerSlot: match.feePerSlot.toString(),
          sourceType: match.sourceType,
          mode: match.mode,
          discipline: match.discipline,
          ratio: RATIO_FROM_DB[match.ratio],
          format: match.format,
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

// Danh tính theo hồ sơ tài khoản; hồ sơ private dùng nhãn trung tính (D31).
export function publicIdentity(userId: string, profile: Awaited<ReturnType<AccountClient['getPublicMatchProfile']>>) {
  const visible = profile?.identityVisibility === 'public';
  return { userId, displayName: visible ? profile!.displayName : 'Người chơi', avatarUrl: visible ? profile!.avatarUrl : null };
}

export async function participantIdentity(accountClient: AccountClient, userId: string) {
  return publicIdentity(userId, await accountClient.getPublicMatchProfile(userId));
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
          teamSide: true,
          createdAt: true,
        },
      },
    },
  });
  if (!match) {
    throw new AppError(404, 'MATCH_NOT_FOUND', 'Không tìm thấy kèo công khai.');
  }

  const ownJoinCandidate = requester ? (match.joins.find((join) => join.participantUserId === requester.id) ?? null) : null;
  const ownJoin = ownJoinCandidate?.status === 'approved'
    && (!ownJoinCandidate.approvedAt || ownJoinCandidate.approvedAt.getTime() + JOIN_HOLD_MINUTES * 60_000 <= now.getTime())
    ? null
    : ownJoinCandidate;
  const isOrganizer = requester?.id === match.organizerUserId;
  const isPubliclyVisible = match.skillConfiguredAt !== null && (
    (match.status === 'open' && match.cutoffAt > now) || ['filled', 'confirmed'].includes(match.status)
  );
  const canViewOwnLifecycle = Boolean(
    // PLAN_MATCH-DEPOSIT: chủ kèo phải xem được kèo awaiting_deposit để trả cọc.
    requester && (isOrganizer || ownJoin) && ['awaiting_deposit', 'open', 'filled', 'confirmed', 'completed'].includes(match.status),
  );
  if (!isPubliclyVisible && !canViewOwnLifecycle) {
    throw new AppError(404, 'MATCH_NOT_FOUND', 'Không tìm thấy kèo công khai.');
  }

  const [context, organizerProfile, organizerPassport] = await Promise.all([
    venueBookingClient.getMatchContext(match.bookingId),
    accountClient.getPublicMatchProfile(match.organizerUserId),
    prisma.passport.findUnique({ where: { userId: match.organizerUserId } }),
  ]);
  if (!context || !organizerProfile || context.status === 'cancelled' || (context.status === 'completed' && !canViewOwnLifecycle)) {
    throw new AppError(404, 'MATCH_NOT_FOUND', 'Không tìm thấy kèo công khai.');
  }

  const reservedJoins = match.joins.filter((join) => join.status === 'confirmed' || (
    join.status === 'approved'
    && join.approvedAt !== null
    && join.approvedAt.getTime() + JOIN_HOLD_MINUTES * 60_000 > now.getTime()
  ));
  const confirmedJoins = reservedJoins.filter((join) => join.status === 'confirmed');
  const confirmedParticipantProfiles = await Promise.all(
    confirmedJoins.map(async (join) => {
      const profile = await accountClient.getPublicMatchProfile(join.participantUserId);
      return {
        displayName: profile?.identityVisibility === 'public' ? profile.displayName : 'Người chơi',
        avatarUrl: profile?.identityVisibility === 'public' ? profile.avatarUrl : null,
        identityVisibility: profile?.identityVisibility ?? 'hidden',
      };
    }),
  );
  const openSlots = match.capacity - 1 - reservedJoins.length;
  const sideOpen = (side: TeamSide) => participantSlots(match.discipline, side)
    - reservedJoins.filter((join) => (join.teamSide ?? 'B') === side).length;
  const canJoinBase = Boolean(
    requester?.roles.includes('player') &&
    match.status === 'open' &&
    match.skillConfiguredAt !== null &&
    match.cutoffAt > now &&
    requester.id !== match.organizerUserId &&
    !ownJoin &&
    openSlots > 0,
  );
  const identity = async (userId: string) => (userId === match.organizerUserId
    ? publicIdentity(userId, organizerProfile)
    : participantIdentity(accountClient, userId));
  const organizerPaid = match.sourceType === 'paid_booking' || Boolean(match.organizerContributionPaidAt);
  const participants = [
    { ...(await identity(match.organizerUserId)), teamSide: 'A' as TeamSide, role: 'organizer' as const, paymentState: organizerPaid ? 'paid' as const : 'awaiting_payment' as const },
    ...await Promise.all([...reservedJoins].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).map(async (join) => ({
      ...(await identity(join.participantUserId)),
      teamSide: join.teamSide ?? 'B' as TeamSide,
      role: 'participant' as const,
      paymentState: join.status === 'confirmed' ? 'paid' as const : 'awaiting_payment' as const,
    }))),
  ];
  const lockPending = ['open', 'filled'].includes(match.status) && match.cutoffAt > now;
  return {
    id: match.id,
    businessCode: match.businessCode,
    status: match.status,
    capacity: match.capacity,
    openSlots,
    feePerSlot: match.feePerSlot.toString(),
    skillMin: match.skillMin,
    skillMax: match.skillMax,
    skillConfiguredAt: match.skillConfiguredAt,
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
    confirmedParticipants: confirmedJoins.length,
    confirmedParticipantProfiles,
    paymentPending: reservedJoins.some((join) => join.status === 'approved'),
    sourceType: match.sourceType,
    mode: match.mode,
    discipline: match.discipline,
    ratio: RATIO_FROM_DB[match.ratio],
    format: match.format,
    bookingPrice: match.bookingPrice?.toString() ?? null,
    teamSlots: (['A', 'B'] as const).map((side) => ({ side, size: teamSize(match.discipline), open: Math.max(0, sideOpen(side)) })),
    participants,
    funding: matchFundingView(match, requester ? { id: requester.id, joinStatus: ownJoin && ownJoin.status !== 'pending' ? ownJoin.status as 'approved' | 'confirmed' : null } : null),
    actions: {
      canJoinTeamA: canJoinBase && sideOpen('A') > 0,
      canJoinTeamB: canJoinBase && sideOpen('B') > 0,
      // Tiền kèo chỉ nhận trước hạn chốt; sau đó scheduler xử lý, không mở thanh toán dù JOIN còn hạn 10 phút.
      canPay: match.cutoffAt > now && (
        (ownJoin?.status === 'approved' && match.status === 'open')
        || (isOrganizer && match.status === 'awaiting_deposit' && !match.organizerContributionPaidAt)
      ),
      canWithdrawBeforeLock: Boolean(ownJoin && ownJoin.status !== 'pending' && lockPending),
      // Roster đã khóa được báo sự cố trước/trong/sau trận; server kiểm tra hạn hồ sơ (BR-CM-34).
      canReportIncident: Boolean(
        match.endAt && ['confirmed', 'completed'].includes(match.status)
        && (isOrganizer || ownJoin?.status === 'confirmed'),
      ),
      canJoin: Boolean(
        requester?.roles.includes('player') &&
        match.status === 'open' &&
        match.skillConfiguredAt !== null &&
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

/** `requestedSide` bỏ trống (Tìm nhanh) thì xếp vào đội còn chỗ, ưu tiên đội B. */
export async function requestJoin(matchId: string, participantUserId: string, requestedSide?: TeamSide, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${matchId}, 0))`;
    const match = await tx.match.findUnique({ where: { id: matchId } });
    if (!match) throw new AppError(404, 'MATCH_NOT_FOUND', 'Không tìm thấy kèo.');
    if (match.status !== 'open' || match.skillConfiguredAt === null || match.cutoffAt <= now) {
      throw new AppError(409, 'MATCH_NOT_OPEN', 'Kèo không còn mở nhận người chơi.');
    }
    if (match.organizerUserId === participantUserId) {
      throw new AppError(409, 'ORGANIZER_ALREADY_PARTICIPATES', 'Organizer đã chiếm một chỗ trong kèo.');
    }
    await tx.join.updateMany({
      where: {
        matchId,
        status: 'approved',
        approvedAt: { lte: new Date(now.getTime() - JOIN_HOLD_MINUTES * 60_000) },
      },
      data: { status: 'rejected', approvedAt: null },
    });
    const [reservedCount, activeJoin, fundingEvent] = await Promise.all([
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
      tx.outbox.findFirst({
        where: { aggregateId: matchId, eventType: 'MatchCreated' },
        select: { id: true },
      }),
    ]);
    if (activeJoin) throw new AppError(409, 'JOIN_ALREADY_ACTIVE', 'Đã có yêu cầu tham gia đang hoạt động.');
    if (reservedCount + 1 >= match.capacity) {
      throw new AppError(409, 'MATCH_FULL', 'Kèo đã hết chỗ hoặc đang có người thanh toán.');
    }
    // BR-CM-05: đơn chỉ còn đội B; đôi còn 1 chỗ đội A (cạnh chủ kèo) và 2 chỗ đội B.
    let teamSide: TeamSide | undefined;
    for (const side of requestedSide ? [requestedSide] : ['B', 'A'] as const) {
      if (await reservedTeamSlots(tx, matchId, side, now) < participantSlots(match.discipline, side)) { teamSide = side; break; }
    }
    if (!teamSide) throw new AppError(409, 'MATCH_TEAM_FULL', 'Đội này đã đủ người. Hãy chọn đội còn chỗ.');
    if (match.feePerSlot > 0n && !fundingEvent) {
      throw new AppError(409, 'MATCH_FUNDING_NOT_INITIALIZED', 'Kèo chưa khởi tạo dữ liệu chia phí. Vui lòng tạo kèo mới.');
    }
    const join = await tx.join.create({
      data: {
        matchId,
        participantUserId,
        teamSide,
        status: match.feePerSlot === 0n ? 'confirmed' : 'approved',
        approvedAt: now,
      },
    });
    if (match.feePerSlot === 0n && reservedCount + 1 === match.capacity - 1) {
      await tx.match.update({ where: { id: match.id }, data: { status: 'filled' } });
    }
    await writeOutbox(tx, {
      aggregateType: 'Join',
      aggregateId: join.id,
      eventType: 'JoinApproved',
      payload: {
        joinId: join.id,
        matchId,
        participantUserId,
        fee: match.feePerSlot.toString(),
        expiresAt: new Date(now.getTime() + JOIN_HOLD_MINUTES * 60_000).toISOString(),
        teamSide,
        joinedAt: join.createdAt.toISOString(),
      } satisfies JoinApprovedPayload,
    });
    return join;
  });
}

export async function listMyConfirmedMatches(venueBookingClient: VenueBookingClient, userId: string) {
  const matches = await prisma.match.findMany({
    where: {
      status: { in: ['confirmed', 'completed'] },
      OR: [
        { organizerUserId: userId },
        { joins: { some: { participantUserId: userId, status: 'confirmed' } } },
      ],
    },
    orderBy: { createdAt: 'desc' },
  });
  if (matches.length === 0) return [];
  const contexts = venueBookingClient.getMatchContexts
    ? await venueBookingClient.getMatchContexts(matches.map((match) => match.bookingId))
    : await Promise.all(matches.map((match) => venueBookingClient.getMatchContext(match.bookingId)));
  return matches.flatMap((match, index) => {
    const context = contexts[index];
    if (!context) return [];
    return [{
      id: match.id,
      businessCode: match.businessCode,
      status: match.status,
      participationRole: match.organizerUserId === userId ? 'organizer' as const : 'participant' as const,
      participationLabel: 'Kèo đã tham gia',
      feePerSlot: match.feePerSlot.toString(),
      startAt: context.startAt,
      endAt: context.endAt,
      court: context.court,
      venue: context.venue,
    }];
  });
}

export async function configureMatchSkillRange(
  matchId: string,
  organizerUserId: string,
  input: { skillMin: SkillTier; skillMax: SkillTier },
  now = new Date(),
) {
  if (TIER_ORDER[input.skillMin] > TIER_ORDER[input.skillMax]) {
    throw new AppError(422, 'MATCH_SKILL_RANGE_INVALID', 'Bậc tối thiểu không được cao hơn bậc tối đa.');
  }
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${matchId}, 0))`;
    const match = await tx.match.findUnique({ where: { id: matchId } });
    if (!match) throw new AppError(404, 'MATCH_NOT_FOUND', 'Không tìm thấy kèo.');
    if (match.organizerUserId !== organizerUserId) {
      throw new AppError(403, 'MATCH_ORGANIZER_REQUIRED', 'Chỉ chủ kèo được thiết lập bậc trình độ.');
    }
    if (match.skillConfiguredAt) {
      if (match.skillMin === input.skillMin && match.skillMax === input.skillMax) {
        return { id: match.id, skillMin: match.skillMin, skillMax: match.skillMax, skillConfiguredAt: match.skillConfiguredAt };
      }
      throw new AppError(409, 'MATCH_SKILL_ALREADY_CONFIGURED', 'Bậc trình độ của kèo đã được thiết lập.');
    }
    if (match.status !== 'open' || !match.organizerContributionPaidAt) {
      throw new AppError(409, 'MATCH_SKILL_SETUP_NOT_READY', 'Kèo phải được thanh toán cọc và đang mở trước khi thiết lập bậc.');
    }
    return tx.match.update({
      where: { id: matchId },
      data: { ...input, skillConfiguredAt: now },
      select: { id: true, skillMin: true, skillMax: true, skillConfiguredAt: true },
    });
  });
}
