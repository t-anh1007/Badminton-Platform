import { z } from 'zod';
import { allocateResultReserve, type MatchOutcome, type MatchResultFinalizedPayload, type TeamSide } from '@khoaluantn/shared';
import { prisma } from '../lib/prisma.js';
import { ensurePlatformWallet, getOrCreateWallet, postLedgerEntry } from './wallet.js';

const matchResultFinalizedSchema = z.object({
  matchId: z.string().uuid(),
  decisionId: z.string().uuid(),
  outcome: z.enum(['TEAM_A_WIN', 'TEAM_B_WIN', 'NO_RESULT']),
  finalizedAt: z.string().datetime(),
}).strict();

interface AllocationFunding {
  resultReserve: bigint;
  contributions: Array<{ userId: string; role: 'organizer' | 'participant'; teamSide: string | null; joinedAt?: Date | null; createdAt: Date }>;
}

/**
 * BR-CM-16..22: Finance tự tính lại từ funding/contribution đã lưu, không tin số tiền từ event.
 * Đội theo teamSide (contribution cũ: chủ kèo A, người tham gia B); thứ tự JOIN theo joinedAt từ Matchmaking,
 * contribution cũ thiếu joinedAt thì dùng lúc tạo contribution.
 */
export function calculateResultAllocations(funding: AllocationFunding, outcome: MatchOutcome): Map<string, bigint> {
  const teams: Record<TeamSide, string[]> = { A: [], B: [] };
  const ordered = [...funding.contributions].sort((a, b) => (a.role === b.role
    ? (a.joinedAt ?? a.createdAt).getTime() - (b.joinedAt ?? b.createdAt).getTime()
    : a.role === 'organizer' ? -1 : 1));
  for (const contribution of ordered) {
    const side = (contribution.teamSide ?? (contribution.role === 'organizer' ? 'A' : 'B')) as TeamSide;
    teams[side].push(contribution.userId);
  }
  return allocateResultReserve(funding.resultReserve, outcome, teams);
}

/** Phân bổ result reserve đúng một lần vào số dư cá nhân rút được; không chạm BookingRevenue/hoa hồng/ví business. */
export async function handleMatchResultFinalized(eventId: string, raw: MatchResultFinalizedPayload, now = new Date()) {
  const payload = matchResultFinalizedSchema.parse(raw);
  await ensurePlatformWallet();
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${payload.matchId}, 0))`;
    if (await tx.processedEvent.findUnique({ where: { eventId } })) return;
    const funding = await tx.matchFunding.findUnique({
      where: { matchId: payload.matchId },
      include: { contributions: { where: { status: 'settled' } } },
    });
    if (!funding) throw new Error('MatchResultFinalized has no match funding');
    // Kèo đã hủy/hoàn hoặc đã phân bổ: replay là no-op.
    if (funding.status === 'cancelled' || funding.resultFinalizedAt || funding.resultReserveStatus === 'refunded') {
      await tx.processedEvent.create({ data: { eventId } });
      return;
    }
    // Kết quả final chỉ đến sau khi kèo đã chốt tiền; khác đi là lỗi thứ tự, để retry thay vì đoán.
    if (funding.status !== 'settled') throw new Error('MatchResultFinalized before match funding settled');
    if (funding.resultReserve > 0n) {
      const allocations = calculateResultAllocations(funding, payload.outcome);
      const platform = await tx.wallet.findFirstOrThrow({ where: { userId: null, walletType: 'platform' } });
      for (const [userId, amount] of allocations) {
        if (amount === 0n) continue;
        const refId = `${payload.decisionId}:${userId}`;
        await postLedgerEntry(tx, { walletId: platform.id, amount: -amount, type: 'release', refType: 'matchResult', refId, field: 'reserved' });
        const personal = await getOrCreateWallet(tx, userId, 'personal');
        await postLedgerEntry(tx, { walletId: personal.id, amount, type: 'release', refType: 'matchResult', refId, withdrawableDelta: amount });
      }
    }
    await tx.matchFunding.update({
      where: { matchId: funding.matchId },
      data: { resultReserveStatus: funding.resultReserve > 0n ? 'released' : 'none', resultFinalizedAt: now },
    });
    await tx.processedEvent.create({ data: { eventId } });
  });
}
