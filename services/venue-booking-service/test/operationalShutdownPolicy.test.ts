import { describe, expect, it } from 'vitest';
import { canCommitDuringShutdown, canTransitionShutdown, isAffectedBooking, scheduledCloseInstant } from '../src/domain/operationalShutdownPolicy.js';

describe('operational shutdown policy', () => {
  it('starts a scheduled close at midnight in Vietnam and includes crossing bookings', () => {
    const cutoff = scheduledCloseInstant('2026-09-26');
    expect(cutoff.toISOString()).toBe('2026-09-25T17:00:00.000Z');
    expect(isAffectedBooking('scheduled_close', cutoff, new Date('2026-09-25T17:00:00.000Z'))).toBe(false);
    expect(isAffectedBooking('scheduled_close', cutoff, new Date('2026-09-25T17:00:00.001Z'))).toBe(true);
  });

  it('includes a booking already in progress when emergency starts', () => {
    const stoppedAt = new Date('2026-09-26T11:30:00.000Z');
    expect(isAffectedBooking('emergency', stoppedAt, new Date('2026-09-26T12:00:00.000Z'))).toBe(true);
    expect(isAffectedBooking('emergency', stoppedAt, stoppedAt)).toBe(false);
  });

  it('permits only previously existing commitments during winding down', () => {
    const confirmedAt = new Date('2026-09-23T10:00:00.000Z');
    const expectedInactiveAt = new Date('2026-09-26T12:00:00.000Z');
    const endAt = new Date('2026-09-26T11:00:00.000Z');
    const shutdown = { mode: 'winding_down' as const, createdAt: confirmedAt, effectiveAt: null, expectedInactiveAt };
    expect(canCommitDuringShutdown(shutdown, endAt, new Date('2026-09-23T09:59:59.000Z'))).toBe(true);
    expect(canCommitDuringShutdown(shutdown, endAt, new Date('2026-09-23T10:00:01.000Z'))).toBe(false);
    expect(canCommitDuringShutdown(shutdown, new Date('2026-09-26T12:00:00.001Z'), new Date('2026-09-23T09:59:59.000Z'))).toBe(false);
  });

  it('permits only slots ending by scheduled cutoff and rejects all emergency commitments', () => {
    const cutoff = scheduledCloseInstant('2026-09-26');
    expect(canCommitDuringShutdown({ mode: 'scheduled_close', createdAt: cutoff, effectiveAt: cutoff, expectedInactiveAt: cutoff }, cutoff)).toBe(true);
    expect(canCommitDuringShutdown({ mode: 'scheduled_close', createdAt: cutoff, effectiveAt: cutoff, expectedInactiveAt: cutoff }, new Date(cutoff.getTime() + 1))).toBe(false);
    expect(canCommitDuringShutdown({ mode: 'emergency', createdAt: cutoff, effectiveAt: cutoff, expectedInactiveAt: cutoff }, cutoff)).toBe(false);
  });

  it('rejects malformed scheduled dates rather than normalizing them', () => {
    expect(() => scheduledCloseInstant('2026-02-30')).toThrow();
  });

  it('allows safe mode changes, but never downgrades an emergency stop', () => {
    expect(canTransitionShutdown('winding_down', 'scheduled_close')).toBe(true);
    expect(canTransitionShutdown('scheduled_close', 'winding_down')).toBe(true);
    expect(canTransitionShutdown('scheduled_close', 'emergency')).toBe(true);
    expect(canTransitionShutdown('emergency', 'winding_down')).toBe(false);
    expect(canTransitionShutdown('emergency', 'scheduled_close')).toBe(false);
  });
});
