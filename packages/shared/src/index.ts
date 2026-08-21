import { z } from 'zod';

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

/** Danh tính tài khoản "Test demo / Vãng lai" — cố định để cổng đăng nhập demo
 * luôn dùng cùng một userId trên mọi service. Tài khoản này KHÔNG kèm dữ liệu
 * mẫu — đăng nhập vào là thấy đúng dữ liệu thật của hệ thống. */
export const DEMO_USER_ID = '00000000-0000-4000-8000-0000000d3701';
export const DEMO_EMAIL = 'demo@courtin.local';

/** Runtime contracts cho HTTP liên service (ADR 0004 / D18). */
export const publicMatchProfileSchema = z.object({
  userId: z.string().uuid(),
  displayName: z.string().min(1),
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
  cutoffAt: string;
}

export interface JoinApprovedPayload {
  joinId: string;
  matchId: string;
  participantUserId: string;
  fee: string;
  expiresAt: string;
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
}

export interface MatchCancelledPayload {
  matchId: string;
  bookingId: string;
  reason: 'organizer' | 'cutoff' | 'confirmed_booking_policy';
  paidJoinIds: string[];
  refundPercent?: number;
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
