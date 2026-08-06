/** BR-BOK-05 — Chính sách hủy thống nhất toàn nền tảng (D9, D10), chủ sân
 * không cấu hình được. Đây là nguồn sự thật DUY NHẤT cho bậc thang — cả
 * BOK-07 (chốt `policySnapshot` lúc tạo booking, BR-BOK-06) lẫn BOK-08 (hiển
 * thị mức hoàn dự kiến) đều tái dùng từ đây. G5 (BOK-09/FIN-07) sẽ tái dùng
 * tiếp khi thực sự thực thi hoàn tiền. */
export const CANCELLATION_POLICY = {
  tiers: [
    { minHoursBeforeStart: 24, refundPercent: 100 },
    { minHoursBeforeStart: 6, refundPercent: 50 },
    { minHoursBeforeStart: 0, refundPercent: 0 },
  ],
} as const;

interface PolicyTier {
  minHoursBeforeStart: number;
  refundPercent: number;
}

/** Mức hoàn (%) theo một bậc thang cho trước — dùng chung cho chính sách hiện
 * hành lẫn `policySnapshot` của booking cũ. Tiers không cần sắp xếp sẵn; duyệt
 * theo ngưỡng giảm dần. */
function refundPercentFor(tiers: readonly PolicyTier[], hoursUntilStart: number): number {
  const sorted = [...tiers].sort((a, b) => b.minHoursBeforeStart - a.minHoursBeforeStart);
  for (const tier of sorted) {
    if (hoursUntilStart >= tier.minHoursBeforeStart) return tier.refundPercent;
  }
  return 0;
}

/** Mức hoàn (%) theo CHÍNH SÁCH HIỆN HÀNH — dùng khi chưa có snapshot. */
export function getRefundPercentage(hoursUntilStart: number): number {
  return refundPercentFor(CANCELLATION_POLICY.tiers, hoursUntilStart);
}

/** BR-BOK-06 — Mức hoàn (%) theo `policySnapshot` lưu trong booking. Nền tảng
 * đổi chính sách về sau KHÔNG áp ngược lên booking cũ, nên preview phải đọc
 * snapshot chứ không phải hằng hiện hành. Snapshot không hợp lệ/null -> rơi về
 * chính sách hiện hành (an toàn cho booking nội bộ hoặc dữ liệu cũ). */
export function getRefundPercentageFromSnapshot(snapshot: unknown, hoursUntilStart: number): number {
  const tiers = (snapshot as { tiers?: PolicyTier[] } | null)?.tiers;
  if (!Array.isArray(tiers) || tiers.length === 0) return getRefundPercentage(hoursUntilStart);
  return refundPercentFor(tiers, hoursUntilStart);
}
