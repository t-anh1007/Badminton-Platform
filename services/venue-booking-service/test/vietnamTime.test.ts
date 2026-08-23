import { describe, expect, it } from 'vitest';
import {
  vietnamDateEndExclusiveInstant,
  vietnamDateIdentifier,
  vietnamDateStartInstant,
  vietnamMinuteOfDay,
  vietnamMinuteToInstant,
  vietnamWeekday,
} from '../src/lib/vietnamTime.js';

describe('Vietnam calendar time', () => {
  const date = new Date('2026-08-23T00:00:00.000Z');

  it('maps a Vietnam date and minute to the persisted UTC instant', () => {
    expect(vietnamMinuteToInstant(date, 19 * 60).toISOString()).toBe('2026-08-23T12:00:00.000Z');
    expect(vietnamDateStartInstant(date).toISOString()).toBe('2026-08-22T17:00:00.000Z');
    expect(vietnamDateEndExclusiveInstant(date).toISOString()).toBe('2026-08-23T17:00:00.000Z');
  });

  it('reads persisted instants in Vietnam local time', () => {
    const instant = new Date('2026-08-23T12:00:00.000Z');
    expect(vietnamMinuteOfDay(instant)).toBe(19 * 60);
    expect(vietnamWeekday(instant)).toBe(0);
    expect(vietnamDateIdentifier(instant).toISOString()).toBe('2026-08-23T00:00:00.000Z');
  });
});
