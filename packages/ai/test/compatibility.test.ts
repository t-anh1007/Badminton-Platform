import { describe, expect, it } from 'vitest';
import { calculateCompatibility, suggestBalancedGroups } from '../src/index.js';

describe('F-02 — compatibility score and explanation', () => {
  it('AC-F02-1: returns a high score with concrete reasons for nearby ratings', () => {
    const result = calculateCompatibility({
      player: { rating: 1500, rd: 80 },
      match: { targetRating: 1515, targetRd: 85, timeMatches: true, locationMatches: true },
    });

    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.explanation).toContain('lệch rating 15');
    expect(result.explanation).toContain('khung giờ');
  });

  it('AC-F02-2: returns a low score and names a large skill gap', () => {
    const result = calculateCompatibility({
      player: { rating: 1100, rd: 80 },
      match: { targetRating: 1900, targetRd: 80, timeMatches: true, locationMatches: true },
    });

    expect(result.score).toBeLessThan(40);
    expect(result.explanation).toContain('lệch rating 800');
  });

  it('AC-F02-3: always returns a non-empty explanation with every score', () => {
    const results = [
      calculateCompatibility({
        player: { rating: 1500, rd: 350 },
        match: { targetRating: 1500, targetRd: 80, timeMatches: false, locationMatches: false },
      }),
      calculateCompatibility({
        player: { rating: 1300, rd: 180 },
        match: { targetRating: 1600, targetRd: 90, timeMatches: true, locationMatches: false },
      }),
    ];

    expect(results.every((result) => Number.isInteger(result.score) && result.explanation.trim().length > 0)).toBe(true);
  });
});

describe('F-04 — balanced group proposals', () => {
  it('AC-F04-1: partitions eight players into two low-variance groups of four with explanations', () => {
    const proposal = suggestBalancedGroups([
      { userId: 'p1', rating: 1200 }, { userId: 'p2', rating: 1250 },
      { userId: 'p3', rating: 1300 }, { userId: 'p4', rating: 1350 },
      { userId: 'p5', rating: 1650 }, { userId: 'p6', rating: 1700 },
      { userId: 'p7', rating: 1750 }, { userId: 'p8', rating: 1800 },
    ], 4);

    expect(proposal.groups.map((group) => group.memberUserIds)).toEqual([
      ['p1', 'p2', 'p3', 'p4'],
      ['p5', 'p6', 'p7', 'p8'],
    ]);
    expect(proposal.groups.every((group) => group.ratingVariance <= 3125 && group.explanation.length > 0)).toBe(true);
    expect(proposal.unmatchedUserIds).toEqual([]);
  });

  it('AC-F04-2: returns a confirmation-required suggestion without creating a match or payment', () => {
    const proposal = suggestBalancedGroups([
      { userId: 'p1', rating: 1400 }, { userId: 'p2', rating: 1450 },
      { userId: 'p3', rating: 1500 }, { userId: 'p4', rating: 1550 },
    ], 4);

    expect(proposal).toMatchObject({ requiresConfirmation: true, createdMatchIds: [], paymentActions: [] });
  });

  it('AC-F04-3: leaves a transparent unmatched remainder instead of forcing an imbalanced group', () => {
    const proposal = suggestBalancedGroups([
      { userId: 'p1', rating: 1200 }, { userId: 'p2', rating: 1250 },
      { userId: 'p3', rating: 1300 }, { userId: 'p4', rating: 1350 },
      { userId: 'p5', rating: 2000 },
    ], 4);

    expect(proposal.groups).toHaveLength(1);
    expect(proposal.unmatchedUserIds).toEqual(['p5']);
    expect(proposal.unmatchedExplanation).toContain('1 người');
  });
});
