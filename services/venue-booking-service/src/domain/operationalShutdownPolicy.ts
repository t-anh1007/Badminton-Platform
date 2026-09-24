import { vietnamDateStartInstant } from '../lib/vietnamTime.js';

export type ShutdownMode = 'winding_down' | 'scheduled_close' | 'emergency';

export function canTransitionShutdown(from: ShutdownMode | null, to: ShutdownMode): boolean {
  return from !== 'emergency' || to === 'emergency';
}

export interface EffectiveShutdown {
  mode: ShutdownMode;
  createdAt: Date;
  effectiveAt: Date | null;
  expectedInactiveAt: Date | null;
}

/** Date-only value supplied by the provider; never use the server timezone. */
export function scheduledCloseInstant(dateOnly: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) throw new Error('Ngày đóng không hợp lệ.');
  const [year, month, day] = dateOnly.split('-').map(Number) as [number, number, number];
  const identifier = new Date(Date.UTC(year, month - 1, day));
  if (identifier.getUTCFullYear() !== year || identifier.getUTCMonth() !== month - 1 || identifier.getUTCDate() !== day) {
    throw new Error('Ngày đóng không hợp lệ.');
  }
  return vietnamDateStartInstant(identifier);
}

export function isAffectedBooking(mode: ShutdownMode, effectiveAt: Date, bookingEndAt: Date): boolean {
  return mode !== 'winding_down' && bookingEndAt.getTime() > effectiveAt.getTime();
}

/** Existing commitment time is the original hold/booking creation instant. */
export function canCommitDuringShutdown(
  shutdown: EffectiveShutdown | null,
  endAt: Date,
  existingCreatedAt?: Date,
): boolean {
  if (!shutdown) return true;
  if (shutdown.mode === 'emergency') return false;
  if (shutdown.mode === 'scheduled_close') {
    return Boolean(shutdown.effectiveAt && endAt <= shutdown.effectiveAt);
  }
  return Boolean(
    existingCreatedAt
    && existingCreatedAt <= shutdown.createdAt
    && shutdown.expectedInactiveAt
    && endAt <= shutdown.expectedInactiveAt,
  );
}
