import { describe, expect, it } from 'vitest';
import { deadlineFor, effectiveDeadline, resultWindows } from '../src/domain/deadlines.js';

/** Giờ Việt Nam dạng ISO không múi giờ → Date. */
const vn = (local: string) => new Date(`${local}+07:00`);

describe('effectiveDeadline', () => {
  it.each([
    ['2026-10-21T22:59:00', '2026-10-21T22:59:00'],
    ['2026-10-21T23:00:00', '2026-10-22T08:00:00'],
    ['2026-10-22T03:00:00', '2026-10-22T08:00:00'],
    ['2026-10-22T06:59:00', '2026-10-22T08:00:00'],
    ['2026-10-22T07:00:00', '2026-10-22T07:00:00'],
    ['2026-12-31T23:30:00', '2027-01-01T08:00:00'],
  ])('%s VN -> %s VN', (base, expected) => {
    expect(effectiveDeadline(vn(base)).toISOString()).toBe(vn(expected).toISOString());
  });
});

describe('deadlineFor', () => {
  it('keeps base and effective deadline apart when extended overnight', () => {
    const { baseAt, at } = deadlineFor(vn('2026-10-21T22:30:00'), 2 * 3_600_000);
    expect(baseAt.toISOString()).toBe(vn('2026-10-22T00:30:00').toISOString());
    expect(at.toISOString()).toBe(vn('2026-10-22T08:00:00').toISOString());
  });

  it('leaves daytime deadlines untouched', () => {
    const { baseAt, at } = deadlineFor(vn('2026-10-21T10:00:00'), 6 * 3_600_000);
    expect(at.getTime()).toBe(baseAt.getTime());
  });
});

describe('resultWindows', () => {
  it('uses defaults and env overrides', () => {
    expect(resultWindows({})).toEqual({
      green: 7_200_000, yellow: 21_600_000, red: 43_200_000, grace: 3_600_000, evidence: 7_200_000, appeal: 21_600_000,
    });
    expect(resultWindows({ RESULT_WINDOWS: 'green:30m,appeal:1h,bogus:5h' })).toMatchObject({ green: 1_800_000, appeal: 3_600_000 });
  });
});
