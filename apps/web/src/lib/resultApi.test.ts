import { afterEach, describe, expect, it, vi } from 'vitest';
import { estimateLevel, readResultPhotos, confirmResultV2, type ResultDraft } from './resultApi';
import { MatchApiError } from './matchApi';

const draft = (patch: Partial<ResultDraft> = {}): ResultDraft => ({
  format: 'bo3', columnMappedBy: 'ai', level: 'green', reasons: [], manualEntry: false,
  sets: [{ teamA: 21, teamB: 18, sourceUploadId: 'u1', lowConfidence: false }, { teamA: 21, teamB: 15, sourceUploadId: 'u1', lowConfidence: false }],
  ...patch,
});

describe('estimateLevel (Q8: mức dự kiến ở FE, server vẫn là chuẩn)', () => {
  it('keeps green when nothing changed', () => {
    expect(estimateLevel(draft(), { columnMapping: null, editedCells: [] })).toEqual({ level: 'green', reasons: [] });
  });
  it('turns yellow when a cell is edited', () => {
    expect(estimateLevel(draft(), { columnMapping: null, editedCells: [{ set: 1, side: 'B' }] })).toEqual({ level: 'yellow', reasons: ['EDITED_CELL'] });
  });
  it('turns yellow when the reporter picks the columns or AI could not', () => {
    expect(estimateLevel(draft(), { columnMapping: 'left_is_B', editedCells: [] }).reasons).toEqual(['USER_COLUMN_MAPPING']);
    expect(estimateLevel(draft({ columnMappedBy: null, level: 'yellow', reasons: ['USER_COLUMN_MAPPING'] }), { columnMapping: null, editedCells: [] }))
      .toEqual({ level: 'yellow', reasons: ['USER_COLUMN_MAPPING'] });
  });
  it('turns yellow for sets typed by hand', () => {
    const typed = draft({ sets: [{ teamA: null, teamB: null, sourceUploadId: null, lowConfidence: true }], manualEntry: true, level: 'yellow', reasons: ['AI_UNAVAILABLE'] });
    expect(estimateLevel(typed, { columnMapping: null, editedCells: [] })).toEqual({ level: 'yellow', reasons: ['AI_UNAVAILABLE', 'MANUAL_SET'] });
  });
  it('never lifts a red draft', () => {
    expect(estimateLevel(draft({ level: 'red', reasons: ['EXACT_DUPLICATE'] }), { columnMapping: null, editedCells: [] }).level).toBe('red');
  });
});

describe('result photo API', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uploads each photo then reads them into one draft', async () => {
    const calls: Array<{ url: string; method?: string; body?: unknown }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method, body: init?.body });
      if (url.endsWith('/result-evidence/uploads')) {
        return new Response(JSON.stringify({ upload: { objectKey: `k${calls.length}`, uploadUrl: 'https://r2.test/put', headers: {}, expiresAt: '' } }));
      }
      if (url === 'https://r2.test/put') return new Response('', { status: 200 });
      return new Response(JSON.stringify({ draftId: 'd1', draft: draft(), images: [], columns: { left: null, right: null }, viewerQuota: { photosUsed: 0, photosLimit: 7, draftsLeft: 14 } }));
    }));
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
    const result = await readResultPhotos('m1', [file]);
    expect(result.draftId).toBe('d1');
    const read = calls.find((call) => String(call.url).endsWith('/matches/m1/result-uploads'))!;
    expect(JSON.parse(String(read.body)).items[0]).toMatchObject({ objectKey: 'k1', mimeType: 'image/jpeg' });
    expect(JSON.parse(String(read.body)).items[0].checksumSha256).toMatch(/=$/);
  });

  it('rejects photos over 15 MB or of the wrong type before uploading', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const big = new File([new Uint8Array(15 * 1024 * 1024 + 1)], 'big.jpg', { type: 'image/jpeg' });
    await expect(readResultPhotos('m1', [big])).rejects.toMatchObject({ code: 'RESULT_EVIDENCE_TOO_LARGE' });
    await expect(readResultPhotos('m1', [new File(['x'], 'a.heic', { type: 'image/heic' })])).rejects.toMatchObject({ code: 'RESULT_EVIDENCE_MIME' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces server error codes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { code: 'RESULT_VERSION_STALE', message: 'x' } }), { status: 409 })));
    const error = await confirmResultV2('m1', 3).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(MatchApiError);
    expect((error as MatchApiError).code).toBe('RESULT_VERSION_STALE');
  });
});
