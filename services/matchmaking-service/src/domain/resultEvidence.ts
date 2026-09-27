import { Prisma } from '@prisma/client';
import {
  ObjectStorageError,
  type ImageMimeType,
  type PrivateObjectStorageClient,
} from '@khoaluantn/object-storage';
import { AppError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';

/** BR-CM-25..27: 1–3 ảnh mỗi lần nộp, tối đa 5 ảnh/người/hồ sơ, 5 MB/ảnh, giữ 90 ngày sau đóng. */
export const RESULT_EVIDENCE_MAX_BYTES = 5 * 1024 * 1024;
export const RESULT_EVIDENCE_MAX_PER_SUBMISSION = 3;
export const RESULT_EVIDENCE_MAX_PER_USER = 5;
export const RESULT_EVIDENCE_RETENTION_MS = 90 * 24 * 60 * 60 * 1_000;
const NAMESPACE = 'match/results';

type Db = Prisma.TransactionClient | typeof prisma;

export interface ResultEvidenceItem {
  objectKey: string;
  mimeType: string;
  /** Nếu client gửi lại, phải khớp checksum storage đã xác minh lúc upload. */
  checksumSha256?: string;
}

export interface VerifiedResultEvidence {
  objectKey: string;
  mimeType: string;
  size: number;
  checksumSha256: string;
}

export interface ResultViewer {
  userId: string;
  roles: string[];
}

function storageError(error: unknown): never {
  if (error instanceof ObjectStorageError) throw new AppError(400, error.code, error.message);
  throw error;
}

/** Roster đã khóa: chủ kèo + JOIN đã trả tiền. */
export async function resultRosterUserIds(db: Db, matchId: string): Promise<string[]> {
  const match = await db.match.findUnique({
    where: { id: matchId },
    select: { organizerUserId: true, joins: { where: { status: 'confirmed' }, select: { participantUserId: true } } },
  });
  if (!match) throw new AppError(404, 'MATCH_NOT_FOUND', 'Không tìm thấy kèo.');
  return [match.organizerUserId, ...match.joins.map((join) => join.participantUserId)];
}

async function openCase(db: Db, matchId: string) {
  const resultCase = await db.matchResultCase.findUnique({ where: { matchId } });
  if (!resultCase || resultCase.status === 'final' || resultCase.closedAt) {
    throw new AppError(409, 'RESULT_CASE_NOT_OPEN', 'Hồ sơ kết quả không còn nhận bằng chứng.');
  }
  return resultCase;
}

export async function authorizeResultEvidenceUpload(
  storage: PrivateObjectStorageClient,
  input: { matchId: string; userId: string; mimeType: ImageMimeType; size: number; checksumSha256: string },
) {
  if (!Number.isInteger(input.size) || input.size < 1 || input.size > RESULT_EVIDENCE_MAX_BYTES) {
    throw new AppError(400, 'RESULT_EVIDENCE_TOO_LARGE', 'Mỗi ảnh bằng chứng tối đa 5 MB.');
  }
  if (!(await resultRosterUserIds(prisma, input.matchId)).includes(input.userId)) {
    throw new AppError(403, 'RESULT_ROSTER_ONLY', 'Chỉ người trong kèo được gửi bằng chứng.');
  }
  const resultCase = await prisma.matchResultCase.findUnique({ where: { matchId: input.matchId } });
  if (resultCase) {
    await openCase(prisma, input.matchId);
  } else {
    // Sự cố trước/trong trận: hồ sơ chỉ được tạo khi báo sự cố, nên cho roster của kèo đã khóa xin upload trước.
    const match = await prisma.match.findUniqueOrThrow({ where: { id: input.matchId }, select: { status: true, endAt: true } });
    if (!match.endAt || !['confirmed', 'completed'].includes(match.status)) {
      throw new AppError(409, 'RESULT_CASE_NOT_OPEN', 'Hồ sơ kết quả không còn nhận bằng chứng.');
    }
  }
  const used = resultCase
    ? await prisma.resultEvidence.count({ where: { caseId: resultCase.id, ownerUserId: input.userId } })
    : 0;
  if (used >= RESULT_EVIDENCE_MAX_PER_USER) {
    throw new AppError(409, 'RESULT_EVIDENCE_LIMIT', 'Mỗi người tối đa 5 ảnh cho một hồ sơ.');
  }
  return storage
    .authorizeUpload({ namespace: NAMESPACE, ownerUserId: input.userId, mimeType: input.mimeType, checksumSha256: input.checksumSha256 })
    .catch(storageError);
}

/** HEAD storage ngoài transaction: xác minh chủ sở hữu, loại, dung lượng và checksum. */
export async function inspectResultEvidence(
  storage: PrivateObjectStorageClient,
  ownerUserId: string,
  items: ResultEvidenceItem[],
): Promise<VerifiedResultEvidence[]> {
  if (items.length < 1 || items.length > RESULT_EVIDENCE_MAX_PER_SUBMISSION) {
    throw new AppError(400, 'RESULT_EVIDENCE_COUNT', 'Mỗi lần gửi cần 1–3 ảnh bằng chứng.');
  }
  if (new Set(items.map((item) => item.objectKey)).size !== items.length) {
    throw new AppError(400, 'RESULT_EVIDENCE_DUPLICATE', 'Ảnh bằng chứng bị trùng.');
  }
  return Promise.all(items.map(async (item) => {
    const metadata = await storage.inspectOwnedObject({
      objectKey: item.objectKey,
      namespace: NAMESPACE,
      ownerUserId,
      mimeType: item.mimeType,
      maxBytes: RESULT_EVIDENCE_MAX_BYTES,
      expectedChecksumSha256: item.checksumSha256,
    }).catch(storageError);
    if (!metadata.checksumSha256) {
      throw new AppError(400, 'OBJECT_CHECKSUM_REQUIRED', 'Ảnh bằng chứng chưa có mã kiểm tra.');
    }
    return { objectKey: item.objectKey, mimeType: item.mimeType, size: metadata.size, checksumSha256: metadata.checksumSha256 };
  }));
}

/** Gọi trong transaction đang giữ khóa kèo; ảnh đã commit là bất biến (trigger DB). */
export async function insertResultEvidence(
  tx: Prisma.TransactionClient,
  input: {
    matchId: string;
    ownerUserId: string;
    evidence: VerifiedResultEvidence[];
    claimId?: string;
    responseId?: string;
  },
) {
  const resultCase = await openCase(tx, input.matchId);
  const used = await tx.resultEvidence.count({ where: { caseId: resultCase.id, ownerUserId: input.ownerUserId } });
  if (used + input.evidence.length > RESULT_EVIDENCE_MAX_PER_USER) {
    throw new AppError(409, 'RESULT_EVIDENCE_LIMIT', 'Mỗi người tối đa 5 ảnh cho một hồ sơ.');
  }
  // Một object chỉ thuộc một hồ sơ để retention của hồ sơ này không xóa ảnh của hồ sơ khác (BR-CM-27).
  const existing = await tx.resultEvidence.count({
    where: { objectKey: { in: input.evidence.map((item) => item.objectKey) } },
  });
  if (existing > 0) throw new AppError(409, 'RESULT_EVIDENCE_DUPLICATE', 'Ảnh bằng chứng đã được gửi trước đó.');
  await tx.resultEvidence.createMany({
    data: input.evidence.map((item, index) => ({
      ...item,
      caseId: resultCase.id,
      ownerUserId: input.ownerUserId,
      claimId: input.claimId,
      responseId: input.responseId,
      position: used + index,
    })),
  });
}

/** Signed read chỉ sau khi xác thực roster / provider đang xét / Admin. */
export async function readResultEvidence(
  storage: PrivateObjectStorageClient,
  input: { matchId: string; evidenceId: string; viewer: ResultViewer },
): Promise<{ url: string }> {
  const evidence = await prisma.resultEvidence.findFirst({
    where: { id: input.evidenceId, case: { matchId: input.matchId } },
    select: { objectKey: true, deletedAt: true, case: { select: { status: true, match: { select: { providerUserId: true } } } } },
  });
  if (!evidence) throw new AppError(404, 'RESULT_EVIDENCE_NOT_FOUND', 'Không tìm thấy ảnh bằng chứng.');
  const allowed = input.viewer.roles.includes('admin')
    || (evidence.case.status === 'provider_review' && evidence.case.match.providerUserId === input.viewer.userId)
    || (await resultRosterUserIds(prisma, input.matchId)).includes(input.viewer.userId);
  if (!allowed) throw new AppError(403, 'RESULT_EVIDENCE_FORBIDDEN', 'Bạn không có quyền xem bằng chứng này.');
  if (evidence.deletedAt) throw new AppError(410, 'RESULT_EVIDENCE_EXPIRED', 'Ảnh bằng chứng đã hết hạn lưu trữ.');
  return { url: await storage.getReadUrl(evidence.objectKey, { visibility: 'private' }) };
}

/** BR-CM-27: chỉ xóa binary của hồ sơ đã đóng ≥ 90 ngày; giữ metadata/checksum. */
export async function sweepResultEvidenceRetention(
  storage: PrivateObjectStorageClient,
  now = new Date(),
  batchSize = 100,
  matchIds?: string[],
): Promise<number> {
  const expired = await prisma.resultEvidence.findMany({
    where: {
      deletedAt: null,
      case: { closedAt: { lte: new Date(now.getTime() - RESULT_EVIDENCE_RETENTION_MS) }, ...(matchIds && { matchId: { in: matchIds } }) },
    },
    select: { id: true, objectKey: true },
    take: batchSize,
  });
  for (const evidence of expired) {
    await storage.deleteObject(evidence.objectKey);
    await prisma.resultEvidence.updateMany({ where: { id: evidence.id, deletedAt: null }, data: { deletedAt: now } });
  }
  return expired.length;
}
