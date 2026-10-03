import type { Join, Match, PartnerInvite, PartnerPayMode, Prisma } from '@prisma/client';
import type { JoinApprovedPayload, MatchFeeRefundRequestedPayload, MatchSlotBeneficiaryChangedPayload } from '@khoaluantn/shared';
import { AppError } from '../lib/errors.js';
import { writeOutbox } from '../lib/outbox.js';
import { prisma } from '../lib/prisma.js';
import { JOIN_HOLD_MINUTES } from './joins.js';
import { requestJoin } from './matches.js';
import { assertRankedEligibility } from './seasons.js';

// BR-CM-71..78 (D58): chủ kèo đôi mời đích danh partner vào slot Team A, tự trả hoặc chủ kèo trả thay.

type Tx = Prisma.TransactionClient;

const holdStart = (now: Date) => new Date(now.getTime() - JOIN_HOLD_MINUTES * 60_000);

async function lockMatch(tx: Tx, matchId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${matchId}, 0))`;
  const match = await tx.match.findUnique({ where: { id: matchId } });
  if (!match) throw new AppError(404, 'MATCH_NOT_FOUND', 'Không tìm thấy kèo.');
  return match;
}

/** JOIN slot trả thay còn hiệu lực: chủ kèo đang giữ để trả, đã trả chờ partner, hoặc partner đang chơi. */
export async function activePrepaidJoin(tx: Tx | typeof prisma, matchId: string, now: Date) {
  return tx.join.findFirst({
    where: {
      matchId, payerUserId: { not: null },
      OR: [{ status: { in: ['reserved', 'confirmed'] } }, { status: 'approved', approvedAt: { gt: holdStart(now) } }],
    },
  });
}

export async function pendingPartnerInvite(tx: Tx | typeof prisma, matchId: string) {
  return tx.partnerInvite.findFirst({ where: { matchId, status: 'pending' }, orderBy: { createdAt: 'desc' } });
}

/** Partner tự trả đã nhận lời và đang trong hold 10 phút: không được hủy/đổi/từ chối (BR-CM-75). */
async function inviteeInHold(tx: Tx, matchId: string, inviteeUserId: string, now: Date) {
  return Boolean(await tx.join.findFirst({
    where: { matchId, participantUserId: inviteeUserId, payerUserId: null, status: 'approved', approvedAt: { gt: holdStart(now) } },
  }));
}

async function notify(
  tx: Tx, userId: string, matchId: string, kind: string, title: string, body: string, actionRequired = false, email = false,
) {
  await writeOutbox(tx, {
    aggregateType: 'Notification', aggregateId: `${kind}:${matchId}:${userId}:${Date.now()}`, eventType: 'UserNotificationRequested',
    payload: {
      recipient: { type: 'user', userId, targetRole: 'player' }, category: 'match', kind, title, body,
      priority: actionRequired ? 'action_required' : 'update', entityType: 'match', entityId: matchId,
      actionKind: 'match.view', actionExpiresAt: null,
      // Lời mời đánh cặp luôn kèm email có link về kèo, bỏ qua tùy chọn tắt nhóm Kèo.
      ...(email ? { emailPolicy: 'required' as const } : {}),
    },
  });
}

async function sendInvite(tx: Tx, invite: Pick<PartnerInvite, 'inviteeUserId' | 'payMode'>, matchId: string) {
  await notify(tx, invite.inviteeUserId, matchId, 'match.partner_invited', 'Bạn được mời đánh cặp',
    invite.payMode === 'organizer'
      ? 'Chủ kèo mời bạn đánh cùng đội và đã trả phần phí của bạn. Mở kèo để nhận lời hoặc từ chối.'
      : 'Chủ kèo mời bạn đánh cùng đội. Mở kèo để nhận lời và thanh toán phần phí, hoặc từ chối.', true, true);
}

async function emitBeneficiary(tx: Tx, join: Pick<Join, 'id' | 'matchId'>, beneficiaryUserId: string | null, now: Date) {
  await writeOutbox(tx, {
    aggregateType: 'Join', aggregateId: join.id, eventType: 'MatchSlotBeneficiaryChanged',
    payload: { matchId: join.matchId, joinId: join.id, beneficiaryUserId, version: now.getTime() } satisfies MatchSlotBeneficiaryChangedPayload,
  });
}

export async function invitePartner(
  matchId: string,
  organizerUserId: string,
  input: { inviteeUserId: string; payMode: PartnerPayMode },
  now = new Date(),
) {
  return prisma.$transaction(async (tx) => {
    const match = await lockMatch(tx, matchId);
    if (match.organizerUserId !== organizerUserId) throw new AppError(403, 'MATCH_ORGANIZER_ONLY', 'Chỉ chủ kèo được mời đồng đội.');
    if (match.discipline !== 'doubles') throw new AppError(409, 'PARTNER_DOUBLES_ONLY', 'Chỉ kèo đánh đôi mới mời được đồng đội.');
    if (match.status !== 'open' || match.skillConfiguredAt === null || match.cutoffAt <= now) {
      throw new AppError(409, 'MATCH_NOT_OPEN', 'Kèo không còn mở nhận người chơi.');
    }
    if (input.inviteeUserId === organizerUserId) throw new AppError(409, 'PARTNER_IS_ORGANIZER', 'Không thể tự mời chính mình.');
    if (input.payMode === 'organizer' && match.feePerSlot === 0n) {
      throw new AppError(409, 'PARTNER_PREPAY_FREE_MATCH', 'Kèo miễn phí nên không cần trả giúp.');
    }
    if (match.mode === 'ranked') await assertRankedEligibility(tx, input.inviteeUserId, match.discipline, now);
    const inviteeJoined = await tx.join.findFirst({
      where: {
        matchId, participantUserId: input.inviteeUserId, payerUserId: null,
        OR: [{ status: { in: ['pending', 'confirmed'] } }, { status: 'approved', approvedAt: { gt: holdStart(now) } }],
      },
    });
    if (inviteeJoined) throw new AppError(409, 'PARTNER_ALREADY_IN_MATCH', 'Người này đã tham gia kèo.');

    const current = await pendingPartnerInvite(tx, matchId);
    if (current && await inviteeInHold(tx, matchId, current.inviteeUserId, now)) {
      throw new AppError(409, 'PARTNER_INVITE_LOCKED', 'Đồng đội đang thanh toán, chưa thể mời người khác.');
    }
    const prepaid = await activePrepaidJoin(tx, matchId, now);
    if (prepaid?.status === 'approved') throw new AppError(409, 'PARTNER_PREPAY_IN_PROGRESS', 'Bạn đang thanh toán phần của đồng đội.');
    if (prepaid?.status === 'confirmed') throw new AppError(409, 'PARTNER_SLOT_TAKEN', 'Đồng đội đã vào đội.');
    const takenA = await tx.join.count({
      where: {
        matchId, teamSide: 'A', payerUserId: null,
        OR: [{ status: 'confirmed' }, { status: 'approved', approvedAt: { gt: holdStart(now) } }],
      },
    });
    if (takenA > 0) throw new AppError(409, 'PARTNER_SLOT_TAKEN', 'Đội của bạn đã đủ người.');
    if (prepaid && input.payMode === 'self') {
      throw new AppError(409, 'PARTNER_SLOT_PREPAID', 'Bạn đã trả phần phí cho chỗ này. Hãy hủy lời mời để nhận lại tiền trước khi mời đồng đội tự trả.');
    }

    if (current) {
      await tx.partnerInvite.update({ where: { id: current.id }, data: { status: 'cancelled', respondedAt: now } });
      if (current.sentAt) {
        await notify(tx, current.inviteeUserId, matchId, 'match.partner_invite_cancelled', 'Lời mời đánh cặp đã bị hủy', 'Chủ kèo đã hủy lời mời đánh cặp.');
      }
    }
    const needsPayment = input.payMode === 'organizer' && !prepaid;
    const invite = await tx.partnerInvite.create({
      data: { matchId, inviteeUserId: input.inviteeUserId, payMode: input.payMode, sentAt: needsPayment ? null : now },
    });
    if (!needsPayment) {
      if (prepaid) await tx.join.update({ where: { id: prepaid.id }, data: { participantUserId: input.inviteeUserId } });
      await sendInvite(tx, invite, matchId);
      return { invite, prepaidJoinId: prepaid?.id ?? null };
    }
    // BR-CM-72: chủ kèo trả trước qua luồng giữ slot 10 phút; lời mời chỉ gửi khi PaymentCompleted về.
    const join = await tx.join.create({
      data: {
        matchId, participantUserId: input.inviteeUserId, payerUserId: organizerUserId,
        teamSide: 'A', status: 'approved', approvedAt: now,
      },
    });
    await writeOutbox(tx, {
      aggregateType: 'Join', aggregateId: join.id, eventType: 'JoinApproved',
      payload: {
        joinId: join.id, matchId,
        // Finance ghi khoản góp cho người trả; hoàn tiền luôn về đây (BR-CM-77).
        participantUserId: organizerUserId,
        fee: match.feePerSlot.toString(),
        expiresAt: new Date(now.getTime() + JOIN_HOLD_MINUTES * 60_000).toISOString(),
        teamSide: 'A',
        joinedAt: join.createdAt.toISOString(),
      } satisfies JoinApprovedPayload,
    });
    return { invite, prepaidJoinId: join.id };
  });
}

/** Chủ kèo hủy lời mời và nhả slot; khoản trả thay (nếu có) hoàn 100% về ví chủ kèo (BR-CM-75). */
export async function cancelPartnerInvite(matchId: string, organizerUserId: string, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const match = await lockMatch(tx, matchId);
    if (match.organizerUserId !== organizerUserId) throw new AppError(403, 'MATCH_ORGANIZER_ONLY', 'Chỉ chủ kèo được hủy lời mời.');
    if (match.cutoffAt <= now || !['open', 'filled'].includes(match.status)) {
      throw new AppError(409, 'MATCH_NOT_OPEN', 'Kèo đã qua hạn chốt kèo.');
    }
    const current = await pendingPartnerInvite(tx, matchId);
    if (current && await inviteeInHold(tx, matchId, current.inviteeUserId, now)) {
      throw new AppError(409, 'PARTNER_INVITE_LOCKED', 'Đồng đội đang thanh toán, chưa thể hủy lời mời.');
    }
    const prepaid = await activePrepaidJoin(tx, matchId, now);
    if (prepaid?.status === 'confirmed') throw new AppError(409, 'PARTNER_SLOT_TAKEN', 'Đồng đội đã vào đội.');
    if (!current && !prepaid) throw new AppError(404, 'PARTNER_INVITE_NOT_FOUND', 'Không có lời mời nào.');
    if (current) {
      await tx.partnerInvite.update({ where: { id: current.id }, data: { status: 'cancelled', respondedAt: now } });
      if (current.sentAt) {
        await notify(tx, current.inviteeUserId, matchId, 'match.partner_invite_cancelled', 'Lời mời đánh cặp đã bị hủy', 'Chủ kèo đã hủy lời mời đánh cặp.');
      }
    }
    let refunded = false;
    if (prepaid?.status === 'approved') {
      await tx.join.update({ where: { id: prepaid.id }, data: { status: 'rejected' } });
    } else if (prepaid?.status === 'reserved') {
      await tx.join.update({ where: { id: prepaid.id }, data: { status: 'withdrawn' } });
      await writeOutbox(tx, {
        aggregateType: 'Join', aggregateId: prepaid.id, eventType: 'MatchFeeRefundRequested',
        payload: { matchId, joinId: prepaid.id, participantUserId: organizerUserId, reason: 'withdraw_before_cutoff' } satisfies MatchFeeRefundRequestedPayload,
      });
      refunded = true;
    }
    return { cancelled: true, refunded };
  });
}

async function assertAnswerable(tx: Tx, match: Match, userId: string, now: Date) {
  const invite = await pendingPartnerInvite(tx, match.id);
  if (!invite || invite.inviteeUserId !== userId || !invite.sentAt) {
    throw new AppError(404, 'PARTNER_INVITE_NOT_FOUND', 'Không tìm thấy lời mời dành cho bạn.');
  }
  if (!['open', 'filled'].includes(match.status) || match.cutoffAt <= now) {
    throw new AppError(409, 'PARTNER_INVITE_EXPIRED', 'Lời mời đã hết hạn.');
  }
  return invite;
}

/** Partner nhận lời: trả thay thì vào Team A ngay; tự trả thì giữ slot Team A 10 phút để thanh toán (BR-CM-74). */
export async function acceptPartnerInvite(matchId: string, userId: string, now = new Date()) {
  const selfPay = await prisma.$transaction(async (tx) => {
    const match = await lockMatch(tx, matchId);
    const invite = await assertAnswerable(tx, match, userId, now);
    if (match.mode === 'ranked') await assertRankedEligibility(tx, userId, match.discipline, now);
    if (invite.payMode === 'self') return true;
    const prepaid = await activePrepaidJoin(tx, matchId, now);
    if (!prepaid || prepaid.status !== 'reserved' || prepaid.participantUserId !== userId) {
      throw new AppError(409, 'PARTNER_SLOT_UNAVAILABLE', 'Chỗ này không còn giữ cho bạn.');
    }
    await tx.join.update({ where: { id: prepaid.id }, data: { status: 'confirmed' } });
    await tx.partnerInvite.update({ where: { id: invite.id }, data: { status: 'accepted', respondedAt: now } });
    await emitBeneficiary(tx, prepaid, userId, now);
    const confirmed = await tx.join.count({ where: { matchId, status: 'confirmed' } });
    if (match.status === 'open' && confirmed === match.capacity - 1) {
      await tx.match.update({ where: { id: matchId }, data: { status: 'filled' } });
    }
    await notify(tx, match.organizerUserId, matchId, 'match.partner_accepted', 'Đồng đội đã nhận lời', 'Đồng đội đã vào đội của bạn.');
    return false;
  });
  if (!selfPay) return prisma.join.findFirstOrThrow({ where: { matchId, participantUserId: userId, status: 'confirmed' } });
  const join = await requestJoin(matchId, userId, 'A', now);
  // Kèo miễn phí xác nhận ngay; kèo có phí đánh dấu nhận lời khi PaymentCompleted về.
  if (join.status === 'confirmed') await prisma.$transaction((tx) => markSelfPayPartnerAccepted(tx, matchId, userId, now));
  return join;
}

/** Gọi khi JOIN Team A của partner tự trả được xác nhận. */
export async function markSelfPayPartnerAccepted(tx: Tx, matchId: string, userId: string, now: Date) {
  const invite = await tx.partnerInvite.findFirst({ where: { matchId, inviteeUserId: userId, status: 'pending', payMode: 'self' } });
  if (!invite) return;
  await tx.partnerInvite.update({ where: { id: invite.id }, data: { status: 'accepted', respondedAt: now } });
  const match = await tx.match.findUniqueOrThrow({ where: { id: matchId } });
  await notify(tx, match.organizerUserId, matchId, 'match.partner_accepted', 'Đồng đội đã nhận lời', 'Đồng đội đã thanh toán và vào đội của bạn.');
}

/** Gọi khi khoản trả thay của chủ kèo thanh toán xong: JOIN sang reserved và gửi lời mời (BR-CM-72). */
export async function markPrepaidSlotPaid(tx: Tx, join: Join, now: Date) {
  const invite = await tx.partnerInvite.findFirst({
    where: { matchId: join.matchId, status: 'pending', payMode: 'organizer', sentAt: null }, orderBy: { createdAt: 'desc' },
  });
  if (!invite) return;
  await tx.partnerInvite.update({ where: { id: invite.id }, data: { sentAt: now } });
  await sendInvite(tx, invite, join.matchId);
}

export async function declinePartnerInvite(matchId: string, userId: string, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const match = await lockMatch(tx, matchId);
    const invite = await assertAnswerable(tx, match, userId, now);
    if (await inviteeInHold(tx, matchId, userId, now)) {
      throw new AppError(409, 'PARTNER_INVITE_LOCKED', 'Bạn đang trong thời gian thanh toán, chưa thể từ chối.');
    }
    const updated = await tx.partnerInvite.update({ where: { id: invite.id }, data: { status: 'declined', respondedAt: now } });
    await notify(tx, match.organizerUserId, matchId, 'match.partner_declined', 'Đồng đội đã từ chối lời mời',
      invite.payMode === 'organizer'
        ? 'Tiền bạn đã trả vẫn được giữ cho chỗ này. Hãy mời người khác hoặc hủy lời mời để nhận lại tiền.'
        : 'Chỗ trong đội của bạn đã mở lại cho mọi người.');
    return updated;
  });
}

/**
 * BR-CM-76: partner của slot trả thay rút trước cutoff thì slot quay về chủ kèo, không hoàn tiền;
 * tiền kết quả trở lại người trả tới khi có partner mới. Caller tự mở lại kèo `filled`.
 */
export async function releasePrepaidSlot(tx: Tx, join: Join, match: Match, now: Date) {
  await tx.join.update({ where: { id: join.id }, data: { status: 'reserved' } });
  await emitBeneficiary(tx, join, null, now);
  await notify(tx, match.organizerUserId, match.id, 'match.partner_left', 'Đồng đội đã rời kèo',
    'Tiền bạn đã trả vẫn được giữ cho chỗ này. Hãy mời người khác hoặc hủy lời mời để nhận lại tiền.');
}

export const RECENT_PLAYERS_LIMIT = 20;

/**
 * Người từng chơi cùng (đồng đội/đối thủ) ở kèo đã diễn ra, mới nhất trước, tối đa 20.
 * Chủ kèo không có JOIN nên mặc định ở đội A; nhãn lấy theo trận gần nhất.
 */
export async function listRecentCoPlayers(userId: string, now = new Date()) {
  const matches = await prisma.match.findMany({
    where: {
      OR: [{ status: 'completed' }, { status: 'confirmed', endAt: { lt: now } }],
      AND: [{ OR: [{ organizerUserId: userId }, { joins: { some: { participantUserId: userId, status: 'confirmed' } } }] }],
    },
    include: { joins: { where: { status: 'confirmed' }, select: { participantUserId: true, teamSide: true } } },
    orderBy: [{ startAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    take: 200,
  });
  const people = new Map<string, { userId: string; relation: 'teammate' | 'opponent'; timesPlayed: number; lastPlayedAt: string }>();
  for (const match of matches) {
    const sides = [{ participantUserId: match.organizerUserId, teamSide: 'A' as const }, ...match.joins];
    const mySide = sides.find((side) => side.participantUserId === userId)?.teamSide;
    for (const other of sides) {
      if (other.participantUserId === userId) continue;
      const seen = people.get(other.participantUserId);
      if (seen) { seen.timesPlayed += 1; continue; }
      if (people.size >= RECENT_PLAYERS_LIMIT) continue;
      people.set(other.participantUserId, {
        userId: other.participantUserId,
        relation: mySide && other.teamSide === mySide ? 'teammate' : 'opponent',
        timesPlayed: 1,
        lastPlayedAt: (match.startAt ?? match.createdAt).toISOString(),
      });
    }
  }
  return [...people.values()];
}
