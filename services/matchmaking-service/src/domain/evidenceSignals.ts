import exifr from 'exifr';
import sharp, { type Sharp } from 'sharp';

// Tín hiệu ảnh kết quả (BR-RA-13): thời gian chụp từ EXIF, dHash 64-bit để dò gần trùng, bản thu nhỏ cho AI.

export const NEAR_DUPLICATE_MAX_HAMMING = 6;
const AI_MAX_EDGE = 1600;

/** `DateTimeOriginal` không ghi múi giờ coi là giờ VN (UTC+7); có `OffsetTimeOriginal` thì dùng offset đó. */
export async function readCapturedAt(bytes: Buffer): Promise<{ capturedAt: Date | null; source: 'exif' | 'none' }> {
  let tags: { DateTimeOriginal?: unknown; OffsetTimeOriginal?: unknown } | undefined;
  try {
    tags = await exifr.parse(bytes, { pick: ['DateTimeOriginal', 'OffsetTimeOriginal'], reviveValues: false });
  } catch {
    return { capturedAt: null, source: 'none' };
  }
  const raw = typeof tags?.DateTimeOriginal === 'string' ? tags.DateTimeOriginal : null;
  const parts = raw && /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(raw);
  if (!parts) return { capturedAt: null, source: 'none' };
  const offset = typeof tags?.OffsetTimeOriginal === 'string' && /^[+-]\d{2}:\d{2}$/.test(tags.OffsetTimeOriginal)
    ? tags.OffsetTimeOriginal : '+07:00';
  const capturedAt = new Date(`${parts[1]}-${parts[2]}-${parts[3]}T${parts[4]}:${parts[5]}:${parts[6]}${offset}`);
  return Number.isNaN(capturedAt.getTime()) ? { capturedAt: null, source: 'none' } : { capturedAt, source: 'exif' };
}

async function dhashFrom(image: Sharp): Promise<string> {
  const pixels = await image.clone().grayscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer();
  let bits = 0n;
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      bits = (bits << 1n) | (pixels[y * 9 + x]! > pixels[y * 9 + x + 1]! ? 1n : 0n);
    }
  }
  return bits.toString(16).padStart(16, '0');
}

export async function dhash64(bytes: Buffer): Promise<string> {
  return dhashFrom(sharp(bytes).rotate());
}

export function hamming(a: string, b: string): number {
  let diff = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let count = 0;
  while (diff > 0n) {
    count += Number(diff & 1n);
    diff >>= 1n;
  }
  return count;
}

export async function toAiJpeg(bytes: Buffer): Promise<string> {
  return (await prepareImage(bytes)).aiJpegBase64;
}

/** Giải mã ảnh một lần, dùng chung cho dHash và bản JPEG cạnh dài ≤ 1600 px gửi AI (chỉ ở bộ nhớ). */
export async function prepareImage(bytes: Buffer): Promise<{ dhash: string; aiJpegBase64: string }> {
  const decoded = sharp(bytes).rotate();
  const [dhash, jpeg] = await Promise.all([
    dhashFrom(decoded),
    decoded.clone().resize(AI_MAX_EDGE, AI_MAX_EDGE, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer(),
  ]);
  return { dhash, aiJpegBase64: jpeg.toString('base64') };
}
