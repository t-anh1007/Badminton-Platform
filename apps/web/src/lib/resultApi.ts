import {
  MatchApiError, authorizeResultEvidence, matchRequest,
  type MatchFormat, type MatchOutcome, type PlayerResultCase, type SetScore, type TeamSide,
} from './matchApi';
import { uploadAuthorizedFile } from './communityApi';

// Luồng kết quả bằng ảnh (rulesVersion 'ra_v1'): tải ảnh → bản nháp → gửi; phản hồi; tranh chấp; Admin.
// Mọi rẽ nhánh lỗi theo `MatchApiError.code`, không theo câu chữ.

export type Level = 'green' | 'yellow' | 'red';
export type ResultStatusV2 =
  | 'declaration_open' | 'proposed' | 'acceptance_grace' | 'evidence_window' | 'rule_ruling' | 'ai_ruling'
  | 'appeal_window' | 'incident_window' | 'admin_review' | 'final' | 'provisional' | 'provider_review';
export type AdminReason = 'unknown_photo' | 'appeal' | 'ai_unavailable' | 'evidence_unreadable' | 'incident' | 'legacy';
export type ColumnMapping = 'left_is_A' | 'left_is_B' | null;
export interface EditedCell { set: number; side: TeamSide }

export interface OcrSet { index: number | null; left: number; right: number; confLeft: number; confRight: number }
export interface OcrReading { boards: number; isScreenshot: boolean; columns: { left: string | null; right: string | null }; sets: OcrSet[]; unreadable: boolean }

export interface ResultImageView { id: string; mimeType: string; level: Level | null; flags: string[]; capturedAt: string | null; aiReading: OcrReading | null }
export interface ResultClaimView {
  id: string; claimantUserId: string; side: TeamSide | null; outcome: MatchOutcome; level: Level | null; reasons: string[];
  sets: SetScore[]; editedCells: EditedCell[]; manualEntry: boolean; columnMappedBy: 'ai' | 'user' | null; createdAt: string;
  images: ResultImageView[];
}
export interface ResultCitation { id: string; title: string; excerpt: string | null }
export interface ResultRuling {
  id: string; tier: 1 | 2; outcome: MatchOutcome; publishedAt: string;
  reasons: Array<{ text: string; citations: string[] }>; citations: ResultCitation[];
}
export interface ViewerQuota { photosUsed: number; photosLimit: number; draftsLeft: number }
export interface ResultCaseV2 extends Omit<PlayerResultCase, 'status' | 'viewerActions'> {
  rulesVersion: 'ra_v1';
  status: ResultStatusV2;
  version: number;
  level: Level | null;
  reasons: string[];
  responseDeadlineBaseAt: string | null;
  responseDeadlineAt: string | null;
  graceDeadlineAt: string | null;
  evidenceDeadlineAt: string | null;
  evidenceClosedAt: string | null;
  appealDeadlineAt: string | null;
  proposalClaimId: string | null;
  claims: ResultClaimView[];
  ruling: ResultRuling | null;
  disputeEvidence: ResultClaimView[];
  viewerActions: {
    canUpload: boolean; canClaim: boolean; canReplace: boolean; canConfirm: boolean; canObject: boolean; canReportIncident: boolean;
    canSubmitEvidence: boolean; canAppeal: boolean; canAcceptRuling: boolean; canMarkEvidenceDone: boolean;
  };
  viewerSide: TeamSide | null;
  responses: Array<{ userId: string; displayName: string | null; kind: 'confirm' | 'object'; createdAt: string }>;
  pendingPayerUserId: string | null;
  viewerQuota: ViewerQuota;
  viewerAppeal: { accepted: boolean; createdAt: string } | null;
  adminReason: AdminReason | null;
  adminReviewStartedAt: string | null;
  evidenceDoneSides: TeamSide[];
}
export type AnyResultCase = (PlayerResultCase & { rulesVersion?: 'legacy' }) | ResultCaseV2;
export const isPhotoCase = (resultCase: AnyResultCase): resultCase is ResultCaseV2 => resultCase.rulesVersion === 'ra_v1';

export interface ResultDraftSet { teamA: number | null; teamB: number | null; sourceUploadId: string | null; lowConfidence: boolean }
export interface ResultDraft { format: MatchFormat; sets: ResultDraftSet[]; columnMappedBy: 'ai' | null; level: Level; reasons: string[]; manualEntry: boolean }
export interface ResultDraftResponse {
  draftId: string; draft: ResultDraft; images: Array<{ uploadId: string; read: boolean; flags: string[] }>;
  columns: { left: string | null; right: string | null }; viewerQuota: ViewerQuota;
}
export interface Submission { draftId: string; sets: SetScore[]; columnMapping: ColumnMapping; editedCells: EditedCell[] }

export const RESULT_PHOTO_MAX_BYTES = 15 * 1024 * 1024;
export const RESULT_PHOTO_MAX_PER_SEND = 5;
export const RESULT_PHOTO_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;
/** Đọc ảnh đồng bộ tối đa ~30 giây ở server; FE chờ thêm chút trước khi coi là lỗi mạng. */
export const READ_TIMEOUT_MS = 35_000;

const RED_REASONS = new Set(['EXACT_DUPLICATE', 'CAPTURED_BEFORE_START']);

/**
 * Q8: mức dự kiến sau khi người khai sửa — cùng quy tắc với `classifyClaim` ở server (sửa ô, tự chọn cột, set gõ tay → Vàng).
 * Chỉ để hiển thị; server tính lại mức chính thức khi nhận bản khai.
 */
export function estimateLevel(draft: ResultDraft, edits: { columnMapping: ColumnMapping; editedCells: EditedCell[] }): { level: Level; reasons: string[] } {
  const reasons = draft.reasons.filter((reason) => reason !== 'USER_COLUMN_MAPPING');
  if (edits.columnMapping !== null || draft.columnMappedBy === null) reasons.push('USER_COLUMN_MAPPING');
  if (edits.editedCells.length > 0) reasons.push('EDITED_CELL');
  if (draft.sets.some((set) => set.teamA === null || set.teamB === null)) reasons.push('MANUAL_SET');
  const unique = [...new Set(reasons)];
  const level: Level = draft.level === 'red' || unique.some((reason) => RED_REASONS.has(reason)) ? 'red' : unique.length > 0 ? 'yellow' : 'green';
  return { level, reasons: unique };
}

async function sha256Base64(file: File): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()));
  return btoa(String.fromCharCode(...digest));
}

/** Kiểm ở FE trước khi tải (BR-RA-02): định dạng, 15 MB, 1–5 ảnh. Lỗi dùng mã giống server để UI rẽ nhánh một chỗ. */
export function checkResultPhotos(files: File[]) {
  if (files.length < 1 || files.length > RESULT_PHOTO_MAX_PER_SEND) throw new MatchApiError('Mỗi lần gửi 1–5 ảnh.', 400, 'RESULT_EVIDENCE_COUNT');
  if (files.some((file) => !(RESULT_PHOTO_MIME as readonly string[]).includes(file.type))) {
    throw new MatchApiError('Chỉ nhận ảnh JPG, PNG, WEBP.', 400, 'RESULT_EVIDENCE_MIME');
  }
  if (files.some((file) => file.size > RESULT_PHOTO_MAX_BYTES)) throw new MatchApiError('Mỗi ảnh tối đa 15 MB.', 400, 'RESULT_EVIDENCE_TOO_LARGE');
}

/** Tải file gốc (không nén, giữ giờ chụp) lên kho riêng và trả danh sách để gửi cho server. */
export async function uploadResultPhotos(matchId: string, files: File[]) {
  checkResultPhotos(files);
  return Promise.all(files.map(async (file) => {
    const mimeType = file.type as (typeof RESULT_PHOTO_MIME)[number];
    const checksumSha256 = await sha256Base64(file);
    const authorization = await authorizeResultEvidence(matchId, mimeType, { size: file.size, checksumSha256 });
    await uploadAuthorizedFile(authorization, file);
    return { objectKey: authorization.objectKey, mimeType, checksumSha256 };
  }));
}

/** K1→K2: tải ảnh rồi để server đọc đồng bộ thành bản nháp. */
export async function readResultPhotos(matchId: string, files: File[], signal?: AbortSignal): Promise<ResultDraftResponse> {
  const items = await uploadResultPhotos(matchId, files);
  const timeout = AbortSignal.timeout(READ_TIMEOUT_MS);
  return matchRequest<ResultDraftResponse>(`/matches/${matchId}/result-uploads`, {
    method: 'POST', body: JSON.stringify({ items }), signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
}

const post = <T>(path: string, body?: unknown) => matchRequest<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

export const getResultCaseAny = async (matchId: string) => (await matchRequest<{ resultCase: AnyResultCase }>(`/matches/${matchId}/result-case`)).resultCase;
/** Gửi / thay bản khai (server tự nhận ra thay bản khi người khai đã có bản). */
export const submitResultClaimV2 = (matchId: string, body: Submission & { outcome?: 'NO_RESULT' }) =>
  post<{ claim: unknown }>(`/matches/${matchId}/result-claims`, body);
export const confirmResultV2 = (matchId: string, claimVersion: number) =>
  post<{ result: { status: string } }>(`/matches/${matchId}/result-responses/confirm`, { claimVersion });
export const objectResultV2 = (matchId: string, body: { reason: 'score_wrong' | 'no_match'; note?: string; claimVersion: number; submission?: Submission }) =>
  post(`/matches/${matchId}/result-responses/object`, body);
export const reportIncidentV2 = (matchId: string, body: { type: 'no_show' | 'not_played' | 'interrupted' | 'other'; description: string }) =>
  post(`/matches/${matchId}/incidents`, body);
export const submitDisputeEvidence = (matchId: string, body: Submission) => post(`/matches/${matchId}/result-evidence/dispute`, body);
export const markEvidenceDone = (matchId: string) => post<{ bothTeamsDone: boolean }>(`/matches/${matchId}/result-evidence/done`);
export async function submitAppeal(matchId: string, body: { rulingId: string; reason: string; pointedReason?: string; files: File[] }) {
  const evidence = body.files.length > 0 ? await uploadResultPhotos(matchId, body.files) : undefined;
  return post(`/matches/${matchId}/result-appeals`, { rulingId: body.rulingId, reason: body.reason, pointedReason: body.pointedReason, evidence });
}
export const acceptRuling = (matchId: string, rulingId: string) => post(`/matches/${matchId}/result-rulings/${rulingId}/accept`);
export const readResultPhoto = (matchId: string, evidenceId: string) =>
  matchRequest<{ url: string }>(`/matches/${matchId}/result-evidence/${evidenceId}/read`);

// ---- Uy tín của tôi (BR-RA-50..53, chỉ chính chủ) ----
export type Reputation = 'good' | 'watch' | 'low';
export interface MyReputation {
  reputation: Reputation;
  violations: Array<{ matchCode: string | null; kind: string; createdAt: string; expiresAt: string }>;
  recoversAt: string | null;
}
export const getMyReputation = () => matchRequest<MyReputation>('/passports/me/reputation');

// ---- Admin ----
export interface AdminQueueItemV2 {
  caseId: string; matchId: string; status: string; version: number; matchCode: string | null; venueName: string | null; courtName: string | null;
  startAt: string | null; adminReviewStartedAt: string | null; adminOverdue: boolean; adminReason: AdminReason | null; level: Level | null;
}
export interface AdminPhotoView {
  id: string; mimeType: string; level: Level | null; reasons: string[]; supports: MatchOutcome | null; capturedAt: string | null; isScreenshot: boolean;
  exactDuplicateOf: { matchCode: string | null } | null; nearDuplicateOf: { matchCode: string | null } | null;
  ai: { provider: string | null; model: string | null; confidence: number | null; reading: OcrReading | null } | null;
}
export interface AdminClaimView extends Omit<ResultClaimView, 'images'> {
  purpose: 'claim' | 'evidence'; superseded: boolean; images: AdminPhotoView[];
}
export interface AdminRuling {
  id: string; tier: 1 | 2; outcome: MatchOutcome; confidence: number | null; reasons: Array<{ text: string; citations: string[] }>;
  adminNotes: string | null; citations: string[]; provider: string | null; model: string | null; publishedAt: string | null; appealedAt: string | null;
}
export interface AdminAppeal { id: string; userId: string; reason: string; pointedReason: string | null; evidenceIds: string[]; accepted: boolean; createdAt: string }
export const ADMIN_VIOLATION_KINDS = ['false_claim', 'near_duplicate_fraud', 'false_incident'] as const;
export type AdminViolationKind = (typeof ADMIN_VIOLATION_KINDS)[number];

type AdminQueuePage = { items: AdminQueueItemV2[]; total: number; page: number; pageSize: number };
export function listAdminQueueV2(input: { page?: number; status?: 'admin_review' | 'final'; reason?: AdminReason; level?: Level }) {
  const query = new URLSearchParams({ page: String(input.page ?? 1), pageSize: '20' });
  for (const key of ['status', 'reason', 'level'] as const) if (input[key]) query.set(key, input[key]!);
  return matchRequest<AdminQueuePage>(`/matches/admin/result-cases?${query}`);
}
export const decideAdminResultV2 = (matchId: string, body: {
  outcome: MatchOutcome; reason: string; caseVersion: number; previewToken: string;
  appealGrounded?: boolean; violations?: Array<{ userId: string; kind: AdminViolationKind }>;
}) => post(`/matches/${matchId}/admin-decision`, { ...body, confirm: true });
