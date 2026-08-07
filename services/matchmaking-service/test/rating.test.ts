import { describe, expect, it } from 'vitest';
import {
  coldStart,
  describeRating,
  redeclarationRating,
  updateRating,
  type RatingResult,
} from '../src/domain/rating.js';

describe('F-01 — Glicko-2 rating with uncertainty', () => {
  it('AC-F01-1: cold-start TB has the approved center and high uncertainty', () => {
    expect(describeRating(coldStart('intermediate'))).toMatchObject({
      tier: 'intermediate',
      rating: 1500,
      rd: 350,
      sigma: 0.06,
      uncertainty: 'high',
    });
  });

  it('AC-F01-2: repeated wins over stronger players increase rating and reduce RD', () => {
    const start = coldStart('intermediate');
    const wins: RatingResult[] = Array.from({ length: 8 }, (_, index) => ({
      opponentRating: 1700 + index * 10,
      opponentRd: 100,
      score: 1,
    }));
    const updated = updateRating(start, wins);

    expect(updated.rating).toBeGreaterThan(start.rating);
    expect(updated.rd).toBeLessThan(start.rd);
    expect(describeRating(updated).tier).not.toBe('intermediate');
  });

  it('AC-F01-3: equal ratings with different RD expose different confidence', () => {
    const uncertain = describeRating({ rating: 1500, rd: 300, sigma: 0.06 });
    const established = describeRating({ rating: 1500, rd: 80, sigma: 0.06 });

    expect(uncertain.rating).toBe(established.rating);
    expect(uncertain.uncertainty).toBe('high');
    expect(established.uncertainty).toBe('established');
  });

  it('AC-F01-4: identical inputs are deterministic regardless of input order', () => {
    const current = { rating: 1520, rd: 120, sigma: 0.06 };
    const results: RatingResult[] = [
      { opponentRating: 1400, opponentRd: 90, score: 1 },
      { opponentRating: 1650, opponentRd: 110, score: 0.5 },
      { opponentRating: 1800, opponentRd: 130, score: 0 },
    ];

    expect(updateRating(current, results)).toEqual(updateRating(current, [...results].reverse()));
  });

  it('matches the canonical Glicko-2 worked example', () => {
    const updated = updateRating(
      { rating: 1500, rd: 200, sigma: 0.06 },
      [
        { opponentRating: 1400, opponentRd: 30, score: 1 },
        { opponentRating: 1550, opponentRd: 100, score: 0 },
        { opponentRating: 1700, opponentRd: 300, score: 0 },
      ],
    );

    expect(updated.rating).toBeCloseTo(1464.06, 1);
    expect(updated.rd).toBeCloseTo(151.52, 1);
    expect(updated.sigma).toBeCloseTo(0.059996, 5);
  });

  it('D26 bounds re-declaration influence without resetting learned RD/sigma', () => {
    const current = { rating: 1500, rd: 350, sigma: 0.06 };
    expect(redeclarationRating(current, 'advanced')).toEqual({ rating: 1550, rd: 350, sigma: 0.06 });
  });
});
