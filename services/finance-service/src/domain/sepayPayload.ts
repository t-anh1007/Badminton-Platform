import { z } from 'zod';
import type { IncomingTransfer } from './sepayWebhook.js';
import type { OutgoingTransfer } from './outgoingTransfer.js';

/**
 * Payload webhook THẬT của SePay (developer.sepay.vn — "Lập trình Webhooks").
 * SePay bắn MỘT sự kiện cho mỗi biến động số dư; ta chỉ dùng các field cần cho
 * đối soát, phần còn lại giữ lại để log/kiểm tra chứ không tác động nghiệp vụ.
 *
 * - `id`            : khóa duy nhất phía SePay → dùng làm khóa idempotency.
 * - `transferType`  : 'in' (tiền vào) / 'out' (tiền ra) → rẽ nhánh handler.
 * - `transferAmount`: số tiền (VND, số nguyên dương).
 * - `code`          : mã thanh toán SePay tự tách được (nếu cấu hình VA/mẫu).
 * - `content`       : nội dung chuyển khoản đầy đủ (ngân hàng thường chèn thêm
 *                     tiền tố), dùng để tự trích mã khi `code` trống.
 */
export const sepayWebhookPayloadSchema = z.object({
  id: z.union([z.number(), z.string()]),
  gateway: z.string().optional(),
  transactionDate: z.string().optional(),
  accountNumber: z.string().nullish(),
  subAccount: z.string().nullish(),
  code: z.string().nullish(),
  content: z.string().nullish(),
  transferType: z.enum(['in', 'out']),
  // SePay gửi số; chấp nhận cả chuỗi số. Chặn <= 0 để không tạo bút toán rác.
  transferAmount: z.union([z.number(), z.string()]).transform((value, ctx) => {
    const normalized = typeof value === 'number' ? value : Number(value);
    if (!Number.isInteger(normalized) || normalized <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'transferAmount phải là số nguyên dương' });
      return z.NEVER;
    }
    return BigInt(Math.trunc(normalized));
  }),
  accumulated: z.union([z.number(), z.string()]).optional(),
  referenceCode: z.string().nullish(),
  description: z.string().nullish(),
});

export type SepayWebhookPayload = z.infer<typeof sepayWebhookPayloadSchema>;

// Mã nội dung do hệ thống sinh: KLT + 8 hex hoa (thu tiền vào), WD + 12 hex hoa
// (chi tiền ra). Ngân hàng thường nối thêm tiền tố kiểu "MBVCB.123.KLTAB12CD34"
// nên phải trích bằng regex thay vì so khớp cả chuỗi content.
const MATCH_CODE_PATTERN = {
  in: /KLT[0-9A-F]{8}/i,
  out: /WD[0-9A-F]{12}/i,
} as const;

/** Trích mã đối soát: ưu tiên `code` SePay tách sẵn, sau đó dò trong `content`.
 * Không tìm thấy → trả về chuỗi rỗng để đẩy vào hàng chờ đối soát tay (unmatched),
 * KHÔNG đoán bừa để tránh khớp nhầm ví/yêu cầu rút. */
export function extractMatchCode(
  direction: 'in' | 'out',
  code: string | null | undefined,
  content: string | null | undefined,
): string {
  const pattern = MATCH_CODE_PATTERN[direction];
  if (code && pattern.test(code)) return code.toUpperCase();
  const found = content?.match(pattern);
  return found ? found[0].toUpperCase() : '';
}

export type MappedSepayEvent =
  | { direction: 'in'; transfer: IncomingTransfer }
  | { direction: 'out'; transfer: OutgoingTransfer };

/** Chuẩn hóa payload SePay → transfer nội bộ mà domain logic đang dùng. */
export function mapSepayWebhookPayload(payload: SepayWebhookPayload): MappedSepayEvent {
  const rawRef = extractMatchCode(payload.transferType, payload.code, payload.content);
  const transfer = {
    // `id` là khóa chính phía SePay, ổn định qua các lần retry → idempotency.
    externalRef: String(payload.id),
    amount: payload.transferAmount,
    rawRef,
  };
  return payload.transferType === 'in'
    ? { direction: 'in', transfer }
    : { direction: 'out', transfer };
}
