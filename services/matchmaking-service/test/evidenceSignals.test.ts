import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  NEAR_DUPLICATE_MAX_HAMMING, dhash64, hamming, prepareImage, readCapturedAt,
} from '../src/domain/evidenceSignals.js';

/** Ảnh nền xám có các khối tối, đủ chi tiết cho dHash. */
async function scoreSheet(width = 800, height = 600, seed = 1, exif?: Record<string, string>) {
  const blocks = Array.from({ length: 6 }, (_, index) => ({
    input: { create: { width: 80, height: 60, channels: 3 as const, background: { r: 20, g: 20, b: 20 } } },
    left: Math.floor(((index * 131 * seed) % 9) * (width / 10)),
    top: Math.floor(((index * 71 * seed) % 7) * (height / 8)),
  }));
  let image = sharp({ create: { width, height, channels: 3, background: { r: 230, g: 230, b: 230 } } }).composite(blocks).jpeg({ quality: 95 });
  if (exif) image = image.withExifMerge({ IFD0: {}, IFD2: exif } as never);
  return image.toBuffer();
}

describe('readCapturedAt', () => {
  it('reads DateTimeOriginal as Vietnam time when no offset is present', async () => {
    const bytes = await scoreSheet(800, 600, 1, { DateTimeOriginal: '2026:10:21 19:30:05' });
    const result = await readCapturedAt(bytes);
    expect(result.source).toBe('exif');
    expect(result.capturedAt?.toISOString()).toBe('2026-10-21T12:30:05.000Z');
  });

  it('honours OffsetTimeOriginal', async () => {
    const bytes = await scoreSheet(800, 600, 1, { DateTimeOriginal: '2026:10:21 19:30:05', OffsetTimeOriginal: '+09:00' });
    expect((await readCapturedAt(bytes)).capturedAt?.toISOString()).toBe('2026-10-21T10:30:05.000Z');
  });

  it('returns none for a PNG without EXIF', async () => {
    const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#fff' } }).png().toBuffer();
    expect(await readCapturedAt(png)).toEqual({ capturedAt: null, source: 'none' });
  });
});

describe('dHash', () => {
  it('re-compressed copy stays within the near-duplicate threshold', async () => {
    const original = await scoreSheet();
    const recompressed = await sharp(original).jpeg({ quality: 60 }).toBuffer();
    expect(hamming(await dhash64(original), await dhash64(recompressed))).toBeLessThanOrEqual(NEAR_DUPLICATE_MAX_HAMMING);
  });

  it('different images are far apart', async () => {
    const a = await dhash64(await scoreSheet(800, 600, 1));
    const b = await dhash64(await sharp({ create: { width: 800, height: 600, channels: 3, background: '#fff' } })
      .composite([{ input: { create: { width: 400, height: 600, channels: 3, background: '#000' } }, left: 400, top: 0 }])
      .jpeg().toBuffer());
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(hamming(a, b)).toBeGreaterThan(NEAR_DUPLICATE_MAX_HAMMING);
  });

  it('hamming counts differing bits', () => {
    expect(hamming('0000000000000000', '000000000000000f')).toBe(4);
  });
});

describe('prepareImage', () => {
  it('shrinks a 4000x3000 photo to a 1600px JPEG for the AI', async () => {
    const big = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: '#888' } }).jpeg().toBuffer();
    const { aiJpegBase64, dhash } = await prepareImage(big);
    const meta = await sharp(Buffer.from(aiJpegBase64, 'base64')).metadata();
    expect([meta.format, Math.max(meta.width!, meta.height!)]).toEqual(['jpeg', 1600]);
    expect(dhash).toHaveLength(16);
  });
});
