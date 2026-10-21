import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import sharp from 'sharp';
import type { PrivateObjectStorageClient } from '@khoaluantn/object-storage';
import type { OcrReading } from '@khoaluantn/ai';
import { prisma } from '../src/lib/prisma.js';
import type { AiChains } from '../src/lib/aiClients.js';
import type { AccountClient } from '../src/clients/account.js';
import type { VenueBookingClient } from '../src/clients/venueBooking.js';
import { purgeResultCases } from './resultTestUtils.js';

// Tiện ích dùng chung cho test luồng ảnh kết quả ra_v1: kèo + hồ sơ, kho ảnh giả, AI giả (không gọi mạng).

export const HOUR = 3_600_000;
export const MIN = 60_000;
export const matchIds: string[] = [];

export const token = (userId: string, roles = ['player']) => jwt.sign(
  { sub: userId, roles, type: 'access' }, process.env.JWT_SECRET ?? 'change-me-in-real-env', { expiresIn: 300 },
);

export const names = new Map<string, string>();
export const accountClient: AccountClient = {
  getPublicMatchProfile: async (userId: string) => {
    const displayName = names.get(userId);
    return displayName ? { userId, displayName, avatarUrl: null, identityVisibility: 'public' as const } : null;
  },
  getPublicDisplayNames: async () => [],
};
export const venueBookingClient = {
  getMatchContext: async () => ({
    bookingId: 'b', bookingCode: 'BK', startAt: new Date().toISOString(), endAt: new Date().toISOString(),
    venue: { name: 'Sân', address: 'HCM' }, court: { name: 'Sân 1' },
  }),
} as unknown as VenueBookingClient;

/** Kho ảnh giả: bytes giữ trong bộ nhớ, đọc qua data: URL (fetch của Node hỗ trợ). */
export class MemoryStorage implements PrivateObjectStorageClient {
  readonly objects = new Map<string, { bytes: Buffer; mimeType: string; checksum: string }>();

  put(ownerUserId: string, bytes: Buffer, checksum = randomChecksum(), mimeType = 'image/jpeg') {
    const objectKey = `match/results/${ownerUserId}/${randomUUID()}.${mimeType === 'image/png' ? 'png' : 'jpg'}`;
    this.objects.set(objectKey, { bytes, mimeType, checksum });
    return { objectKey, mimeType: mimeType as 'image/jpeg', checksumSha256: checksum };
  }

  async authorizeUpload(): Promise<never> { throw new Error('not used'); }
  async assertOwnedObject() {}
  async deleteObject(objectKey: string) { this.objects.delete(objectKey); }
  async getReadUrl(objectKey: string) {
    const object = this.objects.get(objectKey)!;
    return `data:${object.mimeType};base64,${object.bytes.toString('base64')}`;
  }
  async inspectOwnedObject(input: { objectKey: string; maxBytes: number }) {
    const object = this.objects.get(input.objectKey);
    if (!object) throw new Error('missing');
    return { size: object.bytes.length, checksumSha256: object.checksum };
  }
}

export function randomChecksum() {
  return Buffer.from(randomUUID().replace(/-/g, '').padEnd(64, '0'), 'hex').toString('base64');
}

/** Ảnh JPEG nhận diện được bằng chiều rộng (AI giả tra chiều rộng → kết quả đọc). */
export async function photo(width: number, capturedAt?: Date) {
  // Khối ngẫu nhiên để mỗi ảnh có dHash riêng (tránh "gần trùng" với ảnh của test khác).
  const blocks = Array.from({ length: 8 }, () => ({
    input: { create: { width: 60, height: 60, channels: 3 as const, background: { r: Math.floor(Math.random() * 120), g: 0, b: 0 } } },
    left: Math.floor(Math.random() * (width - 60)), top: Math.floor(Math.random() * 240),
  }));
  let image = sharp({ create: { width, height: 300, channels: 3, background: { r: 200, g: 200, b: 200 } } })
    .composite(blocks)
    .jpeg();
  if (capturedAt) {
    const local = new Date(capturedAt.getTime() + 7 * HOUR).toISOString();
    const exif = `${local.slice(0, 4)}:${local.slice(5, 7)}:${local.slice(8, 10)} ${local.slice(11, 19)}`;
    image = image.withExifMerge({ IFD2: { DateTimeOriginal: exif } } as never);
  }
  return image.toBuffer();
}

export function reading(sets: Array<[number, number] | [number, number, number]>, extra: Partial<OcrReading> = {}): OcrReading {
  return {
    boards: 1, isScreenshot: false, columns: { left: 'Minh', right: 'Lan' }, unreadable: false,
    sets: sets.map(([left, right, index]) => ({ index: index ?? null, left, right, confLeft: 0.97, confRight: 0.97 })),
    ...extra,
  };
}

type Reply = OcrReading | Record<string, unknown> | 'fail' | 'hang';

/**
 * AI giả kiểu OpenAI: đọc ảnh thì tra theo chiều rộng ảnh; phán quyết thì trả `ruling`.
 * Ghi lại body từng request để kiểm tra nội dung gửi đi.
 */
export function fakeAi(options: { byWidth?: Map<number, Reply>; ocr?: Reply; ruling?: Reply | (() => Reply); delayMs?: number } = {}) {
  const bodies: string[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const body = String(init.body);
    bodies.push(body);
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    try {
      if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs));
      let reply: Reply | undefined;
      const parsed = JSON.parse(body);
      const image = JSON.stringify(parsed.messages).match(/data:image\/jpeg;base64,([A-Za-z0-9+/=]+)/);
      if (String(url).endsWith('/embeddings')) return new Response('{}', { status: 500 });
      if (image) {
        const { width } = await sharp(Buffer.from(image[1]!, 'base64')).metadata();
        reply = options.byWidth?.get(width!) ?? options.ocr;
      } else {
        reply = typeof options.ruling === 'function' ? options.ruling() : options.ruling;
      }
      if (reply === 'hang') {
        return await new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        });
      }
      if (!reply || reply === 'fail') return new Response('{}', { status: 503 });
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(reply) } }], usage: { prompt_tokens: 5, completion_tokens: 3 } }));
    } finally {
      inFlight -= 1;
    }
  }) as unknown as typeof fetch;
  const link = (provider: 'gemini' | 'groq', model: string) => ({ provider, model, baseUrl: `https://${provider}.test`, apiKey: 'k' });
  const ai: AiChains = {
    ocr: [link('gemini', `ocr-${randomUUID()}`)], ruling: [link('gemini', `rule-${randomUUID()}`)],
    embedding: null, embeddingDims: 4, fetchImpl,
  };
  return { ai, bodies, maxInFlight: () => maxInFlight };
}

/** Kèo đã đánh xong + hồ sơ ra_v1. `endAt` mặc định 1 giờ trước. */
export async function v2Fixture(options: {
  doubles?: boolean; endAt?: Date; status?: string; payerForPartner?: boolean; rulesVersion?: 'legacy' | 'ra_v1';
  caseData?: Record<string, unknown>;
} = {}) {
  const organizer = randomUUID();
  const partner = randomUUID();
  const b1 = randomUUID();
  const b2 = randomUUID();
  const endAt = options.endAt ?? new Date(Date.now() - HOUR);
  const startAt = new Date(endAt.getTime() - HOUR);
  names.set(organizer, 'Nguyễn Minh');
  names.set(partner, 'Trần Hùng');
  names.set(b1, 'Lê Lan');
  names.set(b2, 'Phạm Phúc');
  const joins = options.doubles
    ? [
        { participantUserId: partner, teamSide: 'A' as const, payerUserId: options.payerForPartner ? organizer : null },
        { participantUserId: b1, teamSide: 'B' as const, payerUserId: null },
        { participantUserId: b2, teamSide: 'B' as const, payerUserId: null },
      ]
    : [{ participantUserId: b1, teamSide: 'B' as const, payerUserId: null }];
  const match = await prisma.match.create({
    data: {
      bookingId: randomUUID(), organizerUserId: organizer, capacity: options.doubles ? 4 : 2,
      discipline: options.doubles ? 'doubles' : 'singles', feePerSlot: 100_000n, status: 'completed',
      cutoffAt: new Date(startAt.getTime() - HOUR), startAt, endAt, bookingPrice: 200_000n, providerUserId: randomUUID(),
      joins: { create: joins.map((join) => ({ ...join, status: 'confirmed' as const })) },
    },
  });
  matchIds.push(match.id);
  const resultCase = await prisma.matchResultCase.create({
    data: {
      matchId: match.id, status: (options.status ?? 'declaration_open') as never, rulesVersion: options.rulesVersion ?? 'ra_v1',
      declarationDeadlineAt: new Date(endAt.getTime() + 12 * HOUR), ...options.caseData,
    },
  });
  return { match, resultCase, organizer, partner, b1, b2, startAt, endAt };
}

export async function cleanupV2() {
  const caseIds = await purgeResultCases(matchIds);
  await prisma.outbox.deleteMany({ where: { OR: [{ aggregateId: { in: matchIds } }, ...caseIds.map((id) => ({ aggregateId: { contains: id } }))] } });
  await prisma.join.deleteMany({ where: { matchId: { in: matchIds } } });
  await prisma.match.deleteMany({ where: { id: { in: matchIds } } });
  await prisma.$disconnect();
}
