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
}
