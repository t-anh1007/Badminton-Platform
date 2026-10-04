import type { LedgerEntry } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { bookingDetails } from './bookingReferences.js';

/** refType có refId là MatchContribution.id. */
const CONTRIBUTION_REFS = new Set(['matchFee', 'matchFeeCancellation', 'overpay_match_fee', 'partial_match_fee', 'late_match_fee']);
/** refType có refId là matchId. */
const MATCH_REFS = new Set(['matchOwnerRebalance', 'matchResultReserve', 'matchSettlementReturn']);
/** refType có refId là bookingId. */
const BOOKING_REFS = new Set(['booking', 'late_payment', 'overpay', 'partial_payment']);

/** Tên nghiệp vụ cho ví cá nhân; ví business giữ tiêu đề đã lưu lúc ghi sổ. */
function personalTitle(type: string, refType: string): string | undefined {
  switch (refType) {
    case 'booking': return type === 'refund' ? 'Hoàn tiền đặt sân' : type === 'payment' ? 'Thanh toán đặt sân' : undefined;
    case 'matchFee': return type === 'payment' ? 'Đóng phí tham gia kèo' : type === 'refund' ? 'Hoàn phí tham gia kèo' : undefined;
    case 'matchFeeCancellation': return 'Hoàn phí kèo do lịch sân bị hủy';
    case 'matchOwnerRebalance': return 'Hoàn phần tiền sân chủ kèo đã trả dư';
    case 'matchResult': return 'Nhận tiền từ quỹ kết quả kèo';
    case 'overpay_match_fee': return 'Tiền chuyển dư khi đóng phí kèo';
    case 'partial_match_fee': return 'Chuyển thiếu phí kèo - đã cộng vào ví';
    case 'late_match_fee': return 'Phí kèo chuyển muộn - đã cộng vào ví';
    case 'late_payment': return 'Tiền đặt sân chuyển muộn - đã cộng vào ví';
    case 'overpay': return 'Tiền chuyển dư khi đặt sân';
    case 'partial_payment': return 'Tiền đặt sân chuyển thiếu - đã cộng vào ví';
    case 'topup': return 'Nạp tiền vào ví';
    case 'reconciliation': return 'Nạp tiền vào ví (đối soát thủ công)';
    case 'dispute': return 'Hoàn tiền theo kết luận khiếu nại';
    case 'withdrawal': return type === 'payout' ? 'Rút tiền về ngân hàng' : undefined;
    default: return undefined;
  }
}

const timeFormat = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric',
});
const DISCIPLINE: Record<string, string> = { singles: 'đánh đơn', doubles: 'đánh đôi' };

/**
 * Chỉ để hiển thị: gắn tiêu đề nghiệp vụ + dòng mô tả (mã booking, sân, giờ chơi, loại kèo,
 * mã khiếu nại/chuyển khoản) cho lịch sử ví. Thiếu dữ liệu tra cứu thì bỏ trống, không chặn số dư.
 */
export async function describeLedgerEntries(entries: LedgerEntry[], walletType: string, ownerUserId: string | null) {
  const contributionIds = entries.filter((e) => CONTRIBUTION_REFS.has(e.refType)).map((e) => e.refId);
  const disputeIds = entries.filter((e) => e.refType === 'dispute').map((e) => e.refId);
  const withdrawalIds = entries.filter((e) => e.refType === 'withdrawal').map((e) => e.refId);
  const [contributions, disputes, withdrawals] = await Promise.all([
    contributionIds.length ? prisma.matchContribution.findMany({ where: { id: { in: contributionIds } }, select: { id: true, matchId: true } }) : [],
    disputeIds.length ? prisma.dispute.findMany({ where: { id: { in: disputeIds } }, select: { id: true, businessCode: true, bookingId: true } }) : [],
    withdrawalIds.length ? prisma.withdrawalRequest.findMany({ where: { id: { in: withdrawalIds } }, select: { id: true, transferCode: true } }) : [],
  ]);
  const matchOfContribution = new Map(contributions.map((c) => [c.id, c.matchId]));
  const matchIdOf = new Map<string, string>();
  for (const e of entries) {
    const matchId = CONTRIBUTION_REFS.has(e.refType) ? matchOfContribution.get(e.refId)
      : MATCH_REFS.has(e.refType) ? e.refId
        : e.refType === 'matchResult' ? (e.referenceSummary as { matchId?: string } | null)?.matchId
          : undefined;
    if (matchId) matchIdOf.set(e.id, matchId);
  }
  // Bút toán matchResult cũ chưa lưu matchId: khớp theo kèo của chủ ví được chốt cùng lúc (cùng transaction).
  const legacyResults = entries.filter((e) => e.refType === 'matchResult' && !matchIdOf.has(e.id));
  if (legacyResults.length && ownerUserId) {
    const finalized = await prisma.matchFunding.findMany({
      where: { resultFinalizedAt: { not: null }, contributions: { some: { userId: ownerUserId } } },
      select: { matchId: true, resultFinalizedAt: true },
    });
    for (const e of legacyResults) {
      const closest = finalized
        .map((f) => ({ matchId: f.matchId, gap: Math.abs(f.resultFinalizedAt!.getTime() - e.ts.getTime()) }))
        .filter((f) => f.gap <= 2 * 60_000)
        .sort((a, b) => a.gap - b.gap)[0];
      if (closest) matchIdOf.set(e.id, closest.matchId);
    }
  }
  const matchIds = [...new Set(matchIdOf.values())];
  const fundings = matchIds.length
    ? await prisma.matchFunding.findMany({ where: { matchId: { in: matchIds } }, select: { matchId: true, bookingId: true, discipline: true } })
    : [];
  const fundingOf = new Map(fundings.map((f) => [f.matchId, f]));
  const disputeOf = new Map(disputes.map((d) => [d.id, d]));
  const withdrawalOf = new Map(withdrawals.map((w) => [w.id, w]));

  const bookingIdOf = (e: LedgerEntry) => BOOKING_REFS.has(e.refType) ? e.refId
    : e.refType === 'dispute' ? disputeOf.get(e.refId)?.bookingId
      : fundingOf.get(matchIdOf.get(e.id) ?? '')?.bookingId;
  const bookings = await bookingDetails(entries.map(bookingIdOf).filter((id): id is string => Boolean(id)));

  return new Map(entries.map((e) => {
    const funding = fundingOf.get(matchIdOf.get(e.id) ?? '');
    const booking = bookings.get(bookingIdOf(e) ?? '');
    const place = booking && [booking.venueName, booking.courtName].filter(Boolean).join(' - ');
    const parts = [
      funding && `Kèo ${DISCIPLINE[funding.discipline] ?? ''}`.trim(),
      e.refType === 'dispute' && disputeOf.get(e.refId) && `Khiếu nại ${disputeOf.get(e.refId)!.businessCode}`,
      booking?.businessCode,
      place,
      booking?.startAt && `Giờ chơi ${timeFormat.format(booking.startAt)}`,
      e.refType === 'withdrawal' && withdrawalOf.get(e.refId) && `Mã chuyển khoản ${withdrawalOf.get(e.refId)!.transferCode}`,
    ].filter(Boolean) as string[];
    return [e.id, {
      title: walletType === 'personal' ? personalTitle(e.type, e.refType) : undefined,
      subtitle: parts.length ? parts.join(' · ') : undefined,
    }];
  }));
}
