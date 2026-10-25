import { describe, expect, it } from 'vitest';
import type { OcrReading } from '@khoaluantn/ai';
import { buildDraft, classifyClaim, classifyImage, mapColumns, publicReasons, type ImageReadingInput } from '../src/domain/confidence.js';
import { InvalidScoreError } from '../src/domain/matchRules.js';

const startAt = new Date('2026-10-21T10:00:00.000Z');
const endAt = new Date('2026-10-21T12:00:00.000Z');
const match = { startAt, endAt };
const teams = { A: ['Nguyễn Văn Minh', 'Trần Hùng'], B: ['Lê Lan', 'Phạm Phúc'] };
const ctx = { format: 'bo3' as const, teams, match, cellThreshold: 0.9 };
const at = (minutes: number) => new Date(endAt.getTime() + minutes * 60_000);

function reading(sets: Array<[number, number] | [number, number, number | null]>, extra: Partial<OcrReading> = {}): OcrReading {
  return {
    boards: 1, isScreenshot: false, columns: { left: 'Minh-Hùng', right: 'Lan-Phúc' }, unreadable: false,
    sets: sets.map(([left, right, index]) => ({ index: index === undefined ? null : index, left, right, confLeft: 0.97, confRight: 0.96 })),
    ...extra,
  };
}

function image(id: string, read: OcrReading | null, signals: Partial<ImageReadingInput['signals']> = {}): ImageReadingInput {
  return {
    uploadId: id, reading: read,
    signals: { capturedAt: at(5), exactDuplicate: false, nearDuplicate: false, isScreenshot: false, multipleBoards: false, ...signals },
  };
}

const sheet = reading([[21, 18], [19, 21], [21, 15]]);

describe('classifyImage', () => {
  it('green when every check passes', () => {
    expect(classifyImage(image('u', sheet), match)).toEqual({ level: 'green', reasons: [] });
  });
  it('yellow without capture time', () => {
    expect(classifyImage(image('u', sheet, { capturedAt: null }), match)).toEqual({ level: 'yellow', reasons: ['NO_CAPTURE_TIME'] });
  });
  it('red when captured before start - 30 minutes', () => {
    const result = classifyImage(image('u', sheet, { capturedAt: new Date(startAt.getTime() - 31 * 60_000) }), match);
    expect(result).toEqual({ level: 'red', reasons: ['CAPTURED_BEFORE_START'] });
  });
  it('red on exact duplicate, yellow on near duplicate, yellow when captured late', () => {
    expect(classifyImage(image('u', sheet, { exactDuplicate: true }), match).level).toBe('red');
    expect(classifyImage(image('u', sheet, { nearDuplicate: true }), match)).toEqual({ level: 'yellow', reasons: ['NEAR_DUPLICATE'] });
    expect(classifyImage(image('u', sheet, { capturedAt: at(121) }), match).reasons).toEqual(['CAPTURED_LATE']);
  });
});

describe('mapColumns', () => {
  it('matches labels to teams ignoring accents and case', () => {
    expect(mapColumns({ left: 'minh - hung', right: 'LAN/PHUC' }, teams)).toBe('left_is_A');
    expect(mapColumns({ left: 'Lan', right: 'Minh' }, teams)).toBe('left_is_B');
    expect(mapColumns({ left: null, right: null }, teams)).toBeNull();
  });
});

describe('buildDraft', () => {
  it('a full sheet with matching names is green and AI-mapped', () => {
    const draft = buildDraft([image('u1', sheet)], ctx);
    expect(draft).toMatchObject({ level: 'green', columnMappedBy: 'ai', manualEntry: false, reasons: [] });
    expect(draft.sets.map((set) => [set.teamA, set.teamB])).toEqual([[21, 18], [19, 21], [21, 15]]);
  });

  it('orders flip-board photos (one set each) by capture time', () => {
    const flip = (left: number, right: number) => reading([[left, right]], { columns: { left: null, right: null } });
    const draft = buildDraft([
      image('late', flip(21, 15), { capturedAt: at(20) }),
      image('early', flip(21, 18), { capturedAt: at(0) }),
      image('mid', flip(19, 21), { capturedAt: at(10) }),
    ], ctx);
    expect(draft.sets.map((set) => set.sourceUploadId)).toEqual(['early', 'mid', 'late']);
    expect(draft.columnMappedBy).toBeNull();
    expect(draft.reasons).toContain('USER_COLUMN_MAPPING');
    expect(draft.level).toBe('yellow');
  });

  it('takes the latest photo when one set has two photos', () => {
    const draft = buildDraft([
      image('midgame', reading([[15, 10, 1]]), { capturedAt: at(-30) }),
      image('final', reading([[21, 17, 1]]), { capturedAt: at(0) }),
    ], ctx);
    expect(draft.sets).toEqual([{ teamA: 21, teamB: 17, sourceUploadId: 'final', lowConfidence: false }]);
  });

  it('flags photos of the same set that disagree on the set winner', () => {
    const draft = buildDraft([
      image('a', reading([[21, 17, 1]]), { capturedAt: at(0) }),
      image('b', reading([[17, 21, 1]]), { capturedAt: at(1) }),
    ], ctx);
    expect(draft.reasons).toContain('SET_IMAGES_CONFLICT');
    expect(draft.level).toBe('yellow');
  });

  it('marks every cell low-confidence when the AI reading breaks the rules', () => {
    const draft = buildDraft([image('u', reading([[21, 20], [21, 10]]))], ctx);
    expect(draft.sets.every((set) => set.lowConfidence)).toBe(true);
    const claim = classifyClaim(draft, { sets: [{ teamA: 22, teamB: 20 }, { teamA: 21, teamB: 10 }], columnMappedBy: 'ai', editedCells: [{ set: 0, side: 'A' }] }, { reputation: 'good' });
    expect(claim.level).toBe('yellow');
  });

  it('falls back to manual entry when no image was read', () => {
    const draft = buildDraft([image('u', null)], ctx);
    expect(draft).toMatchObject({ manualEntry: true, level: 'yellow', sets: [] });
    expect(draft.reasons).toContain('AI_UNAVAILABLE');
  });
});

describe('classifyClaim', () => {
  const draft = buildDraft([image('u1', sheet)], ctx);
  const submitted = { sets: [{ teamA: 21, teamB: 18 }, { teamA: 19, teamB: 21 }, { teamA: 21, teamB: 15 }], columnMappedBy: 'ai' as const, editedCells: [] };

  it('stays green when nothing changed', () => {
    expect(classifyClaim(draft, submitted, { reputation: 'good' })).toEqual({ level: 'green', reasons: [], outcome: 'TEAM_A_WIN' });
  });

  it('editing a confident cell is yellow with EDITED_CELL, even if FE does not say so', () => {
    const edited = { ...submitted, sets: [{ teamA: 21, teamB: 19 }, ...submitted.sets.slice(1)] };
    expect(classifyClaim(draft, edited, { reputation: 'good' })).toMatchObject({ level: 'yellow', reasons: ['EDITED_CELL'] });
  });

  it('user column mapping is never green', () => {
    expect(classifyClaim(draft, { ...submitted, columnMappedBy: 'user' }, { reputation: 'good' }).level).toBe('yellow');
  });

  it('low reputation caps at yellow and the reason is internal only', () => {
    const result = classifyClaim(draft, submitted, { reputation: 'low' });
    expect(result.level).toBe('yellow');
    expect(publicReasons(result.reasons)).toEqual([]);
  });

  it('accepts a tied time-out NO_RESULT', () => {
    const tied = buildDraft([image('u', reading([[21, 18], [18, 21], [15, 15]]))], ctx);
    const result = classifyClaim(tied, { sets: [{ teamA: 21, teamB: 18 }, { teamA: 18, teamB: 21 }, { teamA: 15, teamB: 15 }], columnMappedBy: 'ai', editedCells: [] }, { reputation: 'good' });
    expect(result.outcome).toBe('NO_RESULT');
  });

  it('rejects a finished 21-20 set', () => {
    expect(() => classifyClaim(draft, { ...submitted, sets: [{ teamA: 21, teamB: 20 }, { teamA: 21, teamB: 10 }] }, { reputation: 'good' }))
      .toThrow(InvalidScoreError);
  });
});
