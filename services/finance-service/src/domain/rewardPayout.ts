import { Prisma, type RewardPayout } from '@prisma/client';
import { z } from 'zod';
import { ObjectStorageError, type ImageMimeType, type PrivateObjectStorageClient } from '@khoaluantn/object-storage';
import type { RewardAwardsFinalizedPayload } from '@khoaluantn/shared';
import { AppError } from '../lib/errors.js';
import { writeOutbox } from '../lib/outbox.js';
import { prisma } from '../lib/prisma.js';

const DAY_MS = 24 * 60 * 60 * 1000;
/** BR-CM-69: Admin có 7 ngày lịch để chuyển khoản sau khi người nhận đủ thông tin. */
export const PAYOUT_WINDOW_MS = 7 * DAY_MS;
export const PAYOUT_PROOF_MAX_BYTES = 5 * 1024 * 1024;
const NAMESPACE = 'finance/rewards';

const awardsSchema = z.object({
  programId: z.string().uuid(),
  programName: z.string().min(1),
  awards: z.array(z.object({
    awardId: z.string().uuid(), userId: z.string().uuid(), rank: z.number().int().positive(),
    amount: z.string().regex(/^[1-9]\d*$/), claimDeadlineAt: z.string().datetime(),
  }).strict()),
}).strict();

function notify(tx: Prisma.TransactionClient, payout: Pick<RewardPayout, 'id' | 'userId'>, kind: string, title: string, body: string) {
  return writeOutbox(tx, {
    aggregateType: 'Notification', aggregateId: `${kind}:${payout.id}`, eventType: 'UserNotificationRequested',
    payload: {
      recipient: { type: 'user', userId: payout.userId, targetRole: 'player' }, category: 'finance', kind, title, body,
      priority: 'action_required', entityType: 'reward_payout', entityId: payout.id, actionKind: 'reward.payout.view',
      actionExpiresAt: null, emailPolicy: 'required',
    },
  });
}

/** Tạo khoản chi thưởng từ danh sách Admin đã duyệt; idempotent theo awardId. Không ghi ví/ledger (BR-CM-70). */
export async function handleRewardAwardsFinalized(eventId: string, raw: RewardAwardsFinalizedPayload) {
  const payload = awardsSchema.parse(raw);
  await prisma.$transaction(async (tx) => {
    if (await tx.processedEvent.findUnique({ where: { eventId } })) return;
    for (const award of payload.awards) {
      if (await tx.rewardPayout.findUnique({ where: { awardId: award.awardId } })) continue;
      const payout = await tx.rewardPayout.create({
        data: {
          awardId: award.awardId, programId: payload.programId, programName: payload.programName, rank: award.rank,
          userId: award.userId, amount: BigInt(award.amount), claimDeadlineAt: new Date(award.claimDeadlineAt),
        },
      });
      await notify(tx, payout, 'reward.won', 'Bạn đạt giải thưởng', `${payload.programName}: bổ sung thông tin nhận thưởng trong 7 ngày.`);
    }
    await tx.processedEvent.create({ data: { eventId } });
  });
}

export interface PayoutInformation {
  recipientName: string; email: string; phone: string; address: string;
  bankCode: string; bankAccountNumber: string; bankAccountName: string;
}

/** BR-CM-68: người đạt giải bổ sung đủ thông tin trước hạn nhận; đúng hạn là đã mất quyền. */
export async function submitPayoutInformation(userId: string, payoutId: string, input: PayoutInformation, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${payoutId}, 0))`;
    const payout = await tx.rewardPayout.findUnique({ where: { id: payoutId } });
    if (!payout || payout.userId !== userId) throw new AppError('REWARD_PAYOUT_NOT_FOUND', 'Không tìm thấy khoản thưởng.', 404);
    if (payout.status === 'awaiting_information' && now >= payout.claimDeadlineAt) {
      throw new AppError('REWARD_CLAIM_EXPIRED', 'Đã quá hạn bổ sung thông tin nhận thưởng.', 409);
    }
    if (payout.status !== 'awaiting_information' && payout.status !== 'ready_to_pay') {
      throw new AppError('REWARD_PAYOUT_CLOSED', 'Khoản thưởng không còn nhận cập nhật thông tin.', 409);
    }
    const updated = await tx.rewardPayout.update({
      where: { id: payoutId },
      data: {
        ...input, status: 'ready_to_pay', informationSubmittedAt: now,
        payoutDeadlineAt: payout.payoutDeadlineAt ?? new Date(now.getTime() + PAYOUT_WINDOW_MS),
      },
    });
    if (payout.status === 'awaiting_information') {
      // BR-CM-69: đủ thông tin thì Admin có 7 ngày chuyển khoản.
      await writeOutbox(tx, {
        aggregateType: 'Notification', aggregateId: `reward.payout_ready:${payout.id}`, eventType: 'UserNotificationRequested',
        payload: {
          recipient: { type: 'role', targetRole: 'admin' }, category: 'finance', kind: 'reward.payout_ready',
          title: 'Có khoản thưởng chờ chuyển', body: `${payout.programName}: người nhận đã bổ sung đủ thông tin.`,
          priority: 'action_required', entityType: 'reward_payout', entityId: payout.id,
          actionKind: 'admin.reward-payout.review', actionExpiresAt: null, emailPolicy: 'required',
        },
      });
    }
    return updated;
  });
}

/** Chỉ hủy khoản chưa đủ thông tin khi đã tới hạn nhận; không chuyển xuống hạng sau. ready_to_pay không bao giờ tự hủy. */
export async function cancelExpiredClaims(now = new Date(), payoutIds?: string[]) {
  const expired = await prisma.rewardPayout.findMany({
    where: { ...(payoutIds && { id: { in: payoutIds } }), status: 'awaiting_information', claimDeadlineAt: { lte: now } },
    select: { id: true },
  });
  for (const { id } of expired) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id}, 0))`;
      const cancelled = await tx.rewardPayout.updateMany({
        where: { id, status: 'awaiting_information', claimDeadlineAt: { lte: now } }, data: { status: 'cancelled', cancelledAt: now },
      });
      if (cancelled.count === 0) return;
      const payout = await tx.rewardPayout.findUniqueOrThrow({ where: { id } });
      await notify(tx, payout, 'reward.claim_expired', 'Giải thưởng đã hết hạn nhận', `${payout.programName}: đã quá 7 ngày chưa bổ sung thông tin.`);
    });
  }
  return expired.length;
}

function storageError(error: unknown): never {
  if (error instanceof ObjectStorageError) throw new AppError(error.code, error.message, 400);
  throw error;
}

export async function authorizeProofUpload(
  storage: PrivateObjectStorageClient,
  adminUserId: string,
  input: { mimeType: ImageMimeType; size: number; checksumSha256: string },
) {
  if (input.size > PAYOUT_PROOF_MAX_BYTES) throw new AppError('REWARD_PROOF_TOO_LARGE', 'Ảnh chứng từ tối đa 5 MB.', 400);
  return storage.authorizeUpload({ namespace: NAMESPACE, ownerUserId: adminUserId, mimeType: input.mimeType, checksumSha256: input.checksumSha256 })
    .catch(storageError);
}

/** BR-CM-69: xác nhận bước hai với mã giao dịch và ảnh chứng từ đã commit; khoản đã trả là bất biến. */
export async function markPayoutPaid(
  storage: PrivateObjectStorageClient,
  adminUserId: string,
  payoutId: string,
  input: { transactionReference: string; proofObjectKey: string },
  now = new Date(),
) {
  const mimeType: ImageMimeType = input.proofObjectKey.endsWith('.png') ? 'image/png' : input.proofObjectKey.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
  const proof = await storage.inspectOwnedObject({
    objectKey: input.proofObjectKey, namespace: NAMESPACE, ownerUserId: adminUserId, mimeType, maxBytes: PAYOUT_PROOF_MAX_BYTES,
  }).catch(storageError);
  if (!proof.checksumSha256) throw new AppError('OBJECT_CHECKSUM_REQUIRED', 'Ảnh chứng từ chưa có mã kiểm tra.', 400);
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${payoutId}, 0))`;
      const payout = await tx.rewardPayout.findUnique({ where: { id: payoutId } });
      if (!payout) throw new AppError('REWARD_PAYOUT_NOT_FOUND', 'Không tìm thấy khoản thưởng.', 404);
      if (payout.status !== 'ready_to_pay') throw new AppError('REWARD_PAYOUT_NOT_PAYABLE', 'Khoản thưởng không ở trạng thái chờ chuyển.', 409);
      const paid = await tx.rewardPayout.update({
        where: { id: payoutId },
        data: {
          status: 'paid', paidAt: now, paidByUserId: adminUserId, transactionReference: input.transactionReference,
          proofObjectKey: input.proofObjectKey, proofMimeType: mimeType, proofSize: proof.size, proofChecksumSha256: proof.checksumSha256,
        },
      });
      await notify(tx, paid, 'reward.paid', 'Đã chuyển tiền thưởng', `${paid.programName}: Admin đã chuyển khoản, mã giao dịch ${input.transactionReference}.`);
      return paid;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError('REWARD_TRANSACTION_REFERENCE_USED', 'Mã giao dịch đã được dùng cho khoản khác.', 409);
    }
    throw error;
  }
}

const RANK_LABEL = (rank: number) => `Hạng ${rank}`;

/** Người nhận xem: nhãn chương trình/hạng/tiền, hạn nhận, cờ đủ thông tin; không trả khóa ảnh thô. */
export function playerPayoutView(payout: RewardPayout, now: Date) {
  const complete = Boolean(payout.recipientName && payout.email && payout.phone && payout.address
    && payout.bankCode && payout.bankAccountNumber && payout.bankAccountName);
  return {
    id: payout.id, serverNow: now.toISOString(), programId: payout.programId, programName: payout.programName,
    achievementLabel: RANK_LABEL(payout.rank), amount: payout.amount.toString(), status: payout.status,
    claimDeadlineAt: payout.claimDeadlineAt.toISOString(), payoutDeadlineAt: payout.payoutDeadlineAt?.toISOString() ?? null,
    informationComplete: complete, paidAt: payout.paidAt?.toISOString() ?? null, transactionReference: payout.transactionReference,
  };
}

/** Danh sách Admin: không trả thông tin người nhận/ngân hàng/chứng từ; chỉ trang chi tiết mới có. */
export function adminPayoutListItem(payout: RewardPayout, now: Date) {
  return {
    ...playerPayoutView(payout, now),
    overdue: payout.status === 'ready_to_pay' && payout.payoutDeadlineAt !== null && now > payout.payoutDeadlineAt,
  };
}

export function adminPayoutView(payout: RewardPayout, now: Date) {
  return {
    ...playerPayoutView(payout, now),
    userId: payout.userId,
    receiver: {
      recipientName: payout.recipientName, email: payout.email, phone: payout.phone, address: payout.address,
      bankCode: payout.bankCode, bankAccountNumber: payout.bankAccountNumber, bankAccountName: payout.bankAccountName,
    },
    overdue: payout.status === 'ready_to_pay' && payout.payoutDeadlineAt !== null && now > payout.payoutDeadlineAt,
    proof: payout.proofObjectKey && {
      mimeType: payout.proofMimeType, size: payout.proofSize, checksumSha256: payout.proofChecksumSha256,
    },
    paidByUserId: payout.paidByUserId, cancelledAt: payout.cancelledAt?.toISOString() ?? null,
  };
}
