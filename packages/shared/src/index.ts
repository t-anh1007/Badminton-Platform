import { z } from 'zod';
import { vietnamProvinceCodeSchema } from './competitiveMatches.js';

// @khoaluantn/shared — types/DTO/event schema dùng chung (contract only).
// Gboot: skeleton. Nội dung thật thêm dần ở G0..G7. KHÔNG chứa business logic
// hay entity của service (ADR 0004 / D18).

/** Tên các service trong hệ thống (dùng cho routing, logging). */
export const SERVICES = [
  'api-gateway',
  'account-service',
  'venue-booking-service',
  'finance-service',
  'matchmaking-service',
  'community-service',
] as const;

export type ServiceName = (typeof SERVICES)[number];

export * from './competitiveMatches.js';

/** Event tối giản để service nghiệp vụ yêu cầu tạo thông báo trong ứng dụng.
 * Không chứa URL tự do hoặc dữ liệu nhạy cảm; account-service là nơi dựng inbox. */
export const notificationCategories = ['booking', 'finance', 'match', 'dispute', 'support', 'security', 'community'] as const;
export const notificationActionKinds = [
  'booking.view', 'booking.pay', 'match.view', 'dispute.view', 'support.view', 'withdrawal.view',
  'admin.dispute.review', 'admin.withdrawal.review', 'admin.provider.review', 'admin.moderation.review', 'admin.ticket.view',
  // Kèo cạnh tranh v2 (specs/competitive-matches.md §11).
  'match.result.view', 'provider.match-result.review', 'admin.match-result.review', 'leaderboard.view',
  'reward.view', 'reward.payout.view', 'admin.reward-payout.review',
] as const;
export const requiredNotificationKinds = [
  'booking.shutdown_scheduled',
  'booking.shutdown_emergency',
  'match.shutdown_scheduled',
  'match.shutdown_emergency',
  'finance.shutdown_refund_completed',
  'finance.shutdown_refund_needs_attention',
] as const;
export const userNotificationRequestedSchema = z.object({
  recipient: z.discriminatedUnion('type', [
    z.object({ type: z.literal('user'), userId: z.string().uuid(), targetRole: z.enum(['player', 'provider', 'admin']) }).strict(),
    z.object({ type: z.literal('role'), targetRole: z.literal('admin') }).strict(),
  ]),
  category: z.enum(notificationCategories),
  kind: z.string().min(1).max(80),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(240),
  priority: z.enum(['action_required', 'update']),
  entityType: z.string().min(1).max(40).nullable().default(null),
  entityId: z.string().uuid().nullable().default(null),
  actionKind: z.enum(notificationActionKinds).nullable().default(null),
  actionExpiresAt: z.string().datetime().nullable().default(null),
  deliveryPolicy: z.enum(['preference_based', 'required']).default('preference_based'),
  /** Email giao dịch bắt buộc cho thông báo kèo cạnh tranh; account-service gửi sau khi đã ghi inbox. */
  emailPolicy: z.enum(['required', 'none']).default('none'),
  bookingBusinessCode: z.string().regex(/^BK-[0-9]{8}$/).nullable().default(null),
}).strict().superRefine((payload, context) => {
  if (payload.deliveryPolicy === 'required'
    && !(requiredNotificationKinds as readonly string[]).includes(payload.kind)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['deliveryPolicy'], message: 'Required delivery is not allowed for this notification kind' });
  }
});
export type UserNotificationRequestedPayload = z.infer<typeof userNotificationRequestedSchema>;

/** Danh tính tài khoản "Test demo / Vãng lai" — cố định để cổng đăng nhập demo
 * luôn dùng cùng một userId trên mọi service. Tài khoản này KHÔNG kèm dữ liệu
 * mẫu — đăng nhập vào là thấy đúng dữ liệu thật của hệ thống. */
export const DEMO_USER_ID = '00000000-0000-4000-8000-0000000d3701';
export const DEMO_EMAIL = 'demo@courtin.local';

/** Runtime contracts cho HTTP liên service (ADR 0004 / D18). */
export const publicMatchProfileSchema = z.object({
  userId: z.string().uuid(),
  displayName: z.string().min(1),
  avatarUrl: z.string().nullable(),
  identityVisibility: z.enum(['public', 'hidden']),
}).strict();

export type PublicMatchProfile = z.infer<typeof publicMatchProfileSchema>;

export const venueMatchContextSchema = z.object({
  bookingId: z.string().uuid(),
  ownerUserId: z.string().uuid().nullable(),
  status: z.enum(['held', 'confirmed', 'completed', 'cancelled']),
  priceSnapshot: z.string().regex(/^\d+$/),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  holdExpiresAt: z.string().datetime().nullable(),
  court: z.object({ id: z.string().uuid(), name: z.string().min(1) }).strict(),
  venue: z.object({
    id: z.string().uuid(),
    name: z.string().min(1),
    address: z.string(),
    lat: z.number(),
    lng: z.number(),
  }).strict(),
  providerUserId: z.string().uuid(),
  provinceCode: vietnamProvinceCodeSchema.nullable(),
}).strict();

export type VenueMatchContext = z.infer<typeof venueMatchContextSchema>;

/** Contract sự kiện kèo GĐ2. Các service chỉ trao đổi ID/snapshot, không entity/FK xuyên schema. */
export interface MatchCreatedPayload {
  matchId: string;
  organizerUserId: string;
  bookingId: string;
  capacity: number;
  feePerSlot: string;
  bookingPrice: string;
  organizerContribution: string;
  /** Hạn tìm đối X (find-opponent deadline) — dùng cho funding.cutoffAt và hạn
   * thanh toán của participant. PLAN_MATCH-DEPOSIT. */
  cutoffAt: string;
  /** PLAN_MATCH-DEPOSIT: hạn chủ kèo trả cọc (checkout ~10 phút). Finance dùng
   * cho organizer contribution.expiresAt; khác với cutoffAt (=X). Optional để
   * tương thích ngược event legacy (thiếu ⇒ finance dùng cutoffAt như cũ). */
  depositExpiresAt?: string;
  /** Kèo cạnh tranh v2. Optional để consumer vẫn đọc được event cũ (thiếu ⇒ hold, đơn, 5:5). */
  sourceType?: 'hold' | 'paid_booking';
  mode?: 'friendly' | 'ranked';
  discipline?: 'singles' | 'doubles';
  ratio?: '5:5' | '6:4' | '7:3';
  teamSize?: 1 | 2;
  /** Phần tiền giữ chờ kết quả = totalContribution - bookingPrice. */
  resultReserve?: string;
  /** bookingPrice + resultReserve = feePerSlot × (capacity - 1) + organizerContribution. */
  totalContribution?: string;
}

export interface JoinApprovedPayload {
  joinId: string;
  matchId: string;
  participantUserId: string;
  fee: string;
  expiresAt: string;
  /** Đội người tham gia đã chọn trước khi trả tiền (BR-CM-05). */
  teamSide?: 'A' | 'B';
  /** Thời điểm JOIN gốc; Finance dùng làm thứ tự JOIN khi chia phần lẻ (D57). */
  joinedAt?: string;
}

/** D29: participantFees + organizerContribution phải bằng bookingPrice ở producer và consumer. */
export interface MatchConfirmedPayload {
  matchId: string;
  bookingId: string;
  /** D39 fencing identity, persisted by matchmaking before the event is emitted. */
  attemptId: string;
  /** Venue-owned revision observed when this attempt was created. */
  venueRevision: number;
  participantCount: number;
  participantFees: string;
  organizerContribution: string;
  bookingPrice: string;
  /** Kèo cạnh tranh v2; thiếu ⇒ nguồn hold, tổng góp = bookingPrice. */
  sourceType?: 'hold' | 'paid_booking';
  resultReserve?: string;
  totalContribution?: string;
}

/** Finance phát đúng một lần khi phần tiền sân của kèo đã chốt (cả hai nguồn). */
export interface MatchFundingCompletedPayload {
  matchId: string;
  bookingId: string;
  sourceType: 'hold' | 'paid_booking';
}

export interface MatchCancelledPayload {
  matchId: string;
  bookingId: string;
  reason: 'organizer' | 'cutoff' | 'confirmed_booking_policy' | 'shutdown';
  paidJoinIds: string[];
  refundPercent?: number;
  shutdownId?: string;
  bookingBusinessCode?: string;
}

export interface MatchFeePaymentCompletedPayload {
  refType: 'matchFee';
  matchId: string;
  bookingId: string;
  contributionId: string;
  joinId: string | null;
  userId: string;
  role: 'participant' | 'organizer';
  amount: string;
  paidAt: string;
}

export interface MatchFeeRefundRequestedPayload {
  matchId: string;
  joinId: string;
  participantUserId: string;
  reason: 'withdraw_before_cutoff' | 'capacity_race' | 'payment_expired';
}

export interface BookingConfirmedPayload {
  bookingId: string;
  businessUserId: string;
  gross: string;
  venueId: string;
  endAt: string;
  source: 'marketplace' | 'internal';
}

export interface BookingCompletedPayload {
  bookingId: string;
  completedAt: string;
}

export interface MatchSettlementPaymentCompletedPayload {
  refType: 'matchSettlement';
  matchId: string;
  bookingId: string;
  attemptId: string;
  venueRevision: number;
}

/** Finance-owned, durable command dispatch after it has accepted all reserves. */
export interface MatchSettlementRequestedPayload {
  matchId: string;
  bookingId: string;
  attemptId: string;
  venueRevision: number;
}

export interface MatchSettlementTooLatePayload {
  matchId: string;
  bookingId: string;
}

/** D39: venue is the single atomic authority for match settlement races. */
export interface MatchBookingResolutionPayload {
  commandId: string;
  matchId: string;
  bookingId: string;
  attemptId: string | null;
  action: 'settle' | 'withdraw' | 'cancel';
  decision: 'confirmed' | 'held_revoked' | 'cancelled';
  /** The attempt that actually confirmed the booking, if any. */
  winningAttemptId: string | null;
  venueRevision: number;
}
