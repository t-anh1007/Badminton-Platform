import { describe, expect, it } from 'vitest';
import { calculateMatchFunding, formatAllowed, participantSlots } from '../src/domain/matchRules.js';

describe('BR-CM-10..15 — match funding math (loser:winner)', () => {
  it.each([
    // AC-CM-04: P=200.000, 6:4 thu 120.000/đội và giữ 40.000; 7:3 thu 140.000/đội và giữ 80.000.
    ['5:5', 200000n, 2, { resultReserve: 0n, totalContribution: 200000n, feePerSlot: 100000n, organizerContribution: 100000n }],
    ['6:4', 200000n, 2, { resultReserve: 40000n, totalContribution: 240000n, feePerSlot: 120000n, organizerContribution: 120000n }],
    ['7:3', 200000n, 2, { resultReserve: 80000n, totalContribution: 280000n, feePerSlot: 140000n, organizerContribution: 140000n }],
    ['6:4', 200000n, 4, { resultReserve: 40000n, totalContribution: 240000n, feePerSlot: 60000n, organizerContribution: 60000n }],
    // Giá lẻ: chủ kèo nhận toàn bộ phần dư.
    ['5:5', 200001n, 2, { resultReserve: 0n, totalContribution: 200001n, feePerSlot: 100000n, organizerContribution: 100001n }],
    ['6:4', 200001n, 4, { resultReserve: 40000n, totalContribution: 240001n, feePerSlot: 60000n, organizerContribution: 60001n }],
    ['7:3', 100003n, 4, { resultReserve: 40001n, totalContribution: 140004n, feePerSlot: 35001n, organizerContribution: 35001n }],
    ['7:3', 99999n, 4, { resultReserve: 39999n, totalContribution: 139998n, feePerSlot: 34999n, organizerContribution: 35001n }],
  ] as const)('%s P=%s capacity=%s', (ratio, price, capacity, expected) => {
    expect(calculateMatchFunding(price, ratio, capacity)).toEqual(expected);
  });

  it('conserves every đồng and never gives a non-organizer more than the organizer', () => {
    for (const ratio of ['5:5', '6:4', '7:3'] as const) {
      for (const capacity of [2, 4] as const) {
        for (let price = 0n; price <= 1_000n; price += 7n) {
          const f = calculateMatchFunding(price * 1000n + (price % 9n), ratio, capacity);
          const base = price * 1000n + (price % 9n);
          expect(f.totalContribution).toBe(base + f.resultReserve);
          expect(f.feePerSlot * BigInt(capacity - 1) + f.organizerContribution).toBe(f.totalContribution);
          expect(f.organizerContribution - f.feePerSlot).toBeGreaterThanOrEqual(0n);
          expect(f.organizerContribution - f.feePerSlot).toBeLessThan(BigInt(capacity));
        }
      }
    }
  });
});

describe('BR-CM-05/08 — team slots and format', () => {
  it('singles leaves only team B; doubles leaves one A slot and two B slots', () => {
    expect([participantSlots('singles', 'A'), participantSlots('singles', 'B')]).toEqual([0, 1]);
    expect([participantSlots('doubles', 'A'), participantSlots('doubles', 'B')]).toEqual([1, 2]);
  });

  it('allows BO5 only for bookings longer than 90 minutes', () => {
    const start = new Date('2026-10-01T11:00:00.000Z');
    const at = (minutes: number) => new Date(start.getTime() + minutes * 60_000);
    expect(formatAllowed('bo3', start, at(60))).toBe(true);
    expect(formatAllowed('bo5', start, at(90))).toBe(false);
    expect(formatAllowed('bo5', start, at(91))).toBe(true);
  });
});
