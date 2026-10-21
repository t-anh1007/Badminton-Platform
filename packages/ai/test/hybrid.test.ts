import { describe, expect, it } from 'vitest';
import { cosine, rrf, topByCosine } from '../src/index.js';

describe('hybrid retrieval helpers', () => {
  it('fuses rankings with RRF', () => {
    expect(rrf([['a', 'b', 'c'], ['c', 'a']])).toEqual(['a', 'c', 'b']);
  });

  it('works when one branch is empty (embedding failed)', () => {
    expect(rrf([[], ['x']])).toEqual(['x']);
  });

  it('keeps first-seen order on ties and applies the limit', () => {
    expect(rrf([['a', 'b'], ['b', 'a']])).toEqual(['a', 'b']);
    expect(rrf([['a', 'b', 'c']], 60, 2)).toEqual(['a', 'b']);
  });

  it('computes cosine without NaN', () => {
    expect(cosine([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });

  it('ranks items by cosine', () => {
    expect(topByCosine([1, 0], [{ id: 'y', vector: [0, 1] }, { id: 'x', vector: [1, 0.1] }], 1)).toEqual(['x']);
  });
});
