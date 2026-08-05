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
