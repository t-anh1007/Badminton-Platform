import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { readScoreImage, type OcrReading } from '@khoaluantn/ai';
import { ObjectStorageError, type PrivateObjectStorageClient } from '@khoaluantn/object-storage';
import type { AccountClient } from '../clients/account.js';
import { aiCallLogger, aiSettings, type AiChains } from '../lib/aiClients.js';
import { AppError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { buildDraft, classifyImage, publicReasons, type Draft, type ImageReadingInput } from './confidence.js';
import { NEAR_DUPLICATE_MAX_HAMMING, hamming, prepareImage, readCapturedAt } from './evidenceSignals.js';
import { resultTeams } from './matchResults.js';
import { RESULT_EVIDENCE_MAX_BYTES, type ResultEvidenceItem } from './resultEvidence.js';

// Tải ảnh và đọc đồng bộ thành bản nháp (T1, T7; BR-RA-10..14). Ảnh nháp chưa tính hạn mức 7 ảnh.

export const RESULT_UPLOAD_MAX_ITEMS = 5;
export const RESULT_DRAFT_MAX_PER_USER = 15;
const READ_CONCURRENCY = 3;
const NAMESPACE = 'match/results';
/** Hồ sơ ra_v1 còn nhận ảnh cần đọc (khai, phản hồi, nộp bằng chứng tranh chấp). */
export const UPLOAD_OPEN_STATUSES = ['declaration_open', 'proposed', 'acceptance_grace', 'evidence_window'] as const;

export interface UploadDeps {
  storage: PrivateObjectStorageClient;
  ai: AiChains;
  accountClient?: AccountClient;
  now?: () => Date;
  settings?: Partial<ReturnType<typeof aiSettings>>;
}

interface PreparedImage {
  id: string;
  item: ResultEvidenceItem & { checksumSha256: string };
  size: number;
  capturedAt: Date | null;
  capturedAtSource: 'exif' | 'none';
  dhash: string;
  exactDuplicateOfId: string | null;
  nearDuplicateOfId: string | null;
  reading: OcrReading | null;
  readLog: { provider?: string; model?: string; chainIndex?: number; latencyMs: number };
}

/** Hàng đợi đơn giản: tối đa `limit` việc chạy cùng lúc, giữ thứ tự kết quả. */
async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]!, index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function loadBytes(storage: PrivateObjectStorageClient, objectKey: string): Promise<Buffer> {
  const url = await storage.getReadUrl(objectKey, { visibility: 'private' });
  const response = await fetch(url);
  if (!response.ok) throw new AppError(502, 'OBJECT_STORAGE_UNAVAILABLE', 'Không tải được ảnh từ kho lưu trữ.');
  return Buffer.from(await response.arrayBuffer());
}

/** BR-RA-13c: trùng chính xác / gần trùng chỉ so với ảnh đã gửi của hồ sơ khác. */
async function duplicates(caseId: string, checksumSha256: string, dhash: string) {
  const exact = await prisma.resultEvidence.findFirst({
    where: { checksumSha256, caseId: { not: caseId } }, select: { id: true }, orderBy: { createdAt: 'asc' },
  });
  const recent = await prisma.resultEvidence.findMany({
    where: { caseId: { not: caseId }, dhash: { not: null } }, select: { id: true, dhash: true }, orderBy: { createdAt: 'desc' }, take: 1000,
  });
  const near = recent.find((row) => row.dhash && hamming(row.dhash, dhash) <= NEAR_DUPLICATE_MAX_HAMMING);
  return { exactDuplicateOfId: exact?.id ?? null, nearDuplicateOfId: exact ? null : near?.id ?? null };
}

export function imageInput(upload: {
  id: string; capturedAt: Date | null; exactDuplicateOfId: string | null; nearDuplicateOfId: string | null; isScreenshot: boolean;
}, reading: OcrReading | null): ImageReadingInput {
  return {
    uploadId: upload.id,
    reading,
    signals: {
      capturedAt: upload.capturedAt, exactDuplicate: upload.exactDuplicateOfId !== null, nearDuplicate: upload.nearDuplicateOfId !== null,
      isScreenshot: upload.isScreenshot || Boolean(reading?.isScreenshot), multipleBoards: (reading?.boards ?? 0) > 1,
    },
  };
}

/** Tên thành viên theo đội để ánh xạ cột (BR-RA-11); account lỗi thì so bằng chuỗi rỗng → người khai tự chọn cột. */
export async function teamNames(accountClient: AccountClient | undefined, teams: { A: string[]; B: string[] }) {
  const name = async (userId: string) => {
    if (!accountClient) return '';
    try {
      // Chỉ dùng nội bộ để so tên, không trả ra ngoài nên dùng tên thật kể cả khi hồ sơ ẩn danh.
      return (await accountClient.getPublicMatchProfile(userId))?.displayName ?? '';
    } catch {
      return '';
    }
  };
  return { A: await Promise.all(teams.A.map(name)), B: await Promise.all(teams.B.map(name)) };
}

export async function readUploads(
  input: { matchId: string; userId: string; items: ResultEvidenceItem[] },
  deps: UploadDeps,
): Promise<{ draftId: string; draft: Draft; images: Array<{ uploadId: string; read: boolean; flags: string[] }> }> {
  const now = deps.now ?? (() => new Date());
  const settings = { ...aiSettings(), ...deps.settings };
  if (input.items.length < 1 || input.items.length > RESULT_UPLOAD_MAX_ITEMS) {
    throw new AppError(400, 'RESULT_EVIDENCE_COUNT', 'Mỗi lần gửi cần 1–5 ảnh.');
  }
  if (new Set(input.items.map((item) => item.objectKey)).size !== input.items.length) {
    throw new AppError(400, 'RESULT_EVIDENCE_DUPLICATE', 'Ảnh bằng chứng bị trùng.');
  }
  const match = await prisma.match.findUnique({ where: { id: input.matchId }, include: { resultCase: true } });
  if (!match) throw new AppError(404, 'MATCH_NOT_FOUND', 'Không tìm thấy kèo.');
  const teams = await resultTeams(prisma, match);
  if (![...teams.A, ...teams.B].includes(input.userId)) {
    throw new AppError(403, 'RESULT_ROSTER_ONLY', 'Chỉ người trong kèo được gửi ảnh kết quả.');
  }
  const resultCase = match.resultCase;
  if (!resultCase || resultCase.rulesVersion !== 'ra_v1' || !(UPLOAD_OPEN_STATUSES as readonly string[]).includes(resultCase.status)) {
    throw new AppError(409, 'RESULT_CASE_NOT_OPEN', 'Hồ sơ kết quả không còn nhận ảnh.');
  }
  const used = await prisma.resultUpload.count({ where: { caseId: resultCase.id, userId: input.userId } });
  if (used + input.items.length > RESULT_DRAFT_MAX_PER_USER) {
    throw new AppError(409, 'RESULT_DRAFT_LIMIT', 'Bạn đã tải quá nhiều ảnh nháp cho kèo này.');
  }
  if (await prisma.resultUpload.count({ where: { objectKey: { in: input.items.map((item) => item.objectKey) } } }) > 0) {
    throw new AppError(409, 'RESULT_EVIDENCE_DUPLICATE', 'Ảnh đã được tải lên trước đó.');
  }

  const verified = await Promise.all(input.items.map(async (item) => {
    try {
      const meta = await deps.storage.inspectOwnedObject({
        objectKey: item.objectKey, namespace: NAMESPACE, ownerUserId: input.userId, mimeType: item.mimeType,
        maxBytes: RESULT_EVIDENCE_MAX_BYTES, expectedChecksumSha256: item.checksumSha256,
      });
      if (!meta.checksumSha256) throw new AppError(400, 'OBJECT_CHECKSUM_REQUIRED', 'Ảnh chưa có mã kiểm tra.');
      return { item: { ...item, checksumSha256: meta.checksumSha256 }, size: meta.size };
    } catch (error) {
      if (error instanceof ObjectStorageError) {
        if (error.code === 'OBJECT_TOO_LARGE') throw new AppError(400, 'RESULT_EVIDENCE_TOO_LARGE', 'Mỗi ảnh tối đa 15 MB.');
        throw new AppError(400, error.code, error.message);
      }
      throw error;
    }
  }));

  const started = now().getTime();
  const deadlineAt = started + settings.ocrBudgetMs;
  const logger = aiCallLogger('ocr', resultCase.id);
  const prepared = await mapLimited(verified, READ_CONCURRENCY, async ({ item, size }): Promise<PreparedImage> => {
    const bytes = await loadBytes(deps.storage, item.objectKey);
    const [{ capturedAt, source }, { dhash, aiJpegBase64 }] = await Promise.all([readCapturedAt(bytes), prepareImage(bytes)]);
    const dup = await duplicates(resultCase.id, item.checksumSha256, dhash);
    const callStarted = Date.now();
    const result = deps.ai.ocr.length === 0 ? null : await readScoreImage(deps.ai.ocr, {
      jpegBase64: aiJpegBase64, discipline: match.discipline, format: match.format,
    }, { timeoutMs: settings.callTimeoutMs, deadlineAt, fetchImpl: deps.ai.fetchImpl, onCall: logger.onCall, now: () => now().getTime() });
    return {
      id: randomUUID(), item, size, capturedAt, capturedAtSource: source, dhash, ...dup,
      reading: result?.reading ?? null,
      readLog: {
        provider: result?.link.provider, model: result?.link.model,
        chainIndex: result ? deps.ai.ocr.indexOf(result.link) : undefined, latencyMs: Date.now() - callStarted,
      },
    };
  });

  const draftId = prepared[0]!.id;
  await prisma.$transaction([
    prisma.resultUpload.createMany({
      data: prepared.map((image) => ({
        id: image.id, caseId: resultCase.id, userId: input.userId, draftId, objectKey: image.item.objectKey,
        checksumSha256: image.item.checksumSha256, mimeType: image.item.mimeType, size: image.size,
        capturedAt: image.capturedAt, capturedAtSource: image.capturedAtSource, dhash: image.dhash,
        exactDuplicateOfId: image.exactDuplicateOfId, nearDuplicateOfId: image.nearDuplicateOfId,
        isScreenshot: Boolean(image.reading?.isScreenshot), createdAt: now(),
      })),
    }),
    prisma.evidenceReading.createMany({
      data: prepared.map((image) => ({
        uploadId: image.id, ok: image.reading !== null, reading: (image.reading ?? undefined) as Prisma.InputJsonValue | undefined,
        provider: image.readLog.provider, model: image.readLog.model, chainIndex: image.readLog.chainIndex,
        latencyMs: image.readLog.latencyMs, createdAt: now(),
      })),
    }),
  ]);
  await logger.flush();

  const images = prepared.map((image) => imageInput({ ...image, isScreenshot: false }, image.reading));
  const window = { startAt: match.startAt ?? match.endAt ?? now(), endAt: match.endAt ?? now() };
  const draft = buildDraft(images, {
    format: match.format, teams: await teamNames(deps.accountClient, teams), match: window, cellThreshold: settings.cellConfidence,
  });
  return {
    draftId,
    draft: { ...draft, reasons: publicReasons(draft.reasons) },
    images: images.map((image) => ({
      uploadId: image.uploadId,
      read: image.reading !== null && !image.reading.unreadable,
      flags: [...classifyImage(image, window).reasons, ...(image.signals.isScreenshot ? ['SCREENSHOT'] : [])],
    })),
  };
}

/** BR-RA-14/30: đọc lại một ảnh chưa đọc được; ghi một EvidenceReading mới (chỉ ghi thêm). */
export async function rereadUpload(
  uploadId: string, deps: { storage: PrivateObjectStorageClient; ai: AiChains; now?: () => Date },
): Promise<OcrReading | null> {
  if (deps.ai.ocr.length === 0) return null;
  const upload = await prisma.resultUpload.findUniqueOrThrow({ where: { id: uploadId }, include: { case: { include: { match: true } } } });
  const settings = aiSettings();
  const logger = aiCallLogger('ocr', upload.caseId);
  const started = Date.now();
  let result: Awaited<ReturnType<typeof readScoreImage>> = null;
  try {
    const { aiJpegBase64 } = await prepareImage(await loadBytes(deps.storage, upload.objectKey));
    result = await readScoreImage(deps.ai.ocr, {
      jpegBase64: aiJpegBase64, discipline: upload.case.match.discipline, format: upload.case.match.format,
    }, { timeoutMs: settings.callTimeoutMs, fetchImpl: deps.ai.fetchImpl, onCall: logger.onCall });
  } catch {
    result = null;
  }
  await prisma.evidenceReading.create({
    data: {
      uploadId, ok: result !== null, reading: (result?.reading ?? undefined) as Prisma.InputJsonValue | undefined,
      provider: result?.link.provider, model: result?.link.model, chainIndex: result ? deps.ai.ocr.indexOf(result.link) : undefined,
      latencyMs: Date.now() - started, createdAt: deps.now?.() ?? new Date(),
    },
  });
  await logger.flush();
  return result?.reading ?? null;
}
