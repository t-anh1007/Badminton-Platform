import type { MatchFormat } from '@prisma/client';
import type { OcrReading } from '@khoaluantn/ai';
import type { Level } from './deadlines.js';
import { inferMatchOutcome, InvalidScoreError, type MatchOutcome, type SetScore } from './matchRules.js';

// Xếp mức Xanh/Vàng/Đỏ cho ảnh và bản khai, gộp set từ nhiều ảnh (BR-RA-11..17). Hàm thuần.

export type ReasonCode =
  | 'LOW_CELL_CONFIDENCE' | 'EDITED_CELL' | 'MANUAL_SET' | 'NO_CAPTURE_TIME' | 'CAPTURED_LATE' | 'NEAR_DUPLICATE'
  | 'MULTIPLE_BOARDS' | 'USER_COLUMN_MAPPING' | 'AI_UNAVAILABLE' | 'REPORTER_LOW_REPUTATION' | 'EXACT_DUPLICATE'
  | 'CAPTURED_BEFORE_START' | 'SET_IMAGES_CONFLICT';

/** Chỉ nội bộ/Admin: không bao giờ trả cho roster (BR-RA-16, 53). */
export const INTERNAL_REASONS: ReadonlySet<string> = new Set(['REPORTER_LOW_REPUTATION']);
const RED_REASONS: ReadonlySet<string> = new Set(['EXACT_DUPLICATE', 'CAPTURED_BEFORE_START']);

export function publicReasons(reasons: readonly string[]): string[] {
  return reasons.filter((reason) => !INTERNAL_REASONS.has(reason));
}

export function levelOf(reasons: readonly string[]): Level {
  if (reasons.some((reason) => RED_REASONS.has(reason))) return 'red';
  return reasons.length > 0 ? 'yellow' : 'green';
}

const MINUTE_MS = 60_000;
const CAPTURE_TOLERANCE_MS = 30 * MINUTE_MS;
const CAPTURE_LATE_MS = 2 * 60 * MINUTE_MS;

export interface ImageSignals {
  capturedAt: Date | null;
  exactDuplicate: boolean;
  nearDuplicate: boolean;
  isScreenshot: boolean;
  multipleBoards: boolean;
}

export interface ImageReadingInput { uploadId: string; signals: ImageSignals; reading: OcrReading | null }

export interface DraftSet { teamA: number | null; teamB: number | null; sourceUploadId: string | null; lowConfidence: boolean }
export interface Draft {
  format: MatchFormat;
  sets: DraftSet[];
  columnMappedBy: 'ai' | null;
  level: Level;
  reasons: string[];
  manualEntry: boolean;
}

function unique(reasons: string[]): string[] {
  return [...new Set(reasons)];
}

/** Mức của một ảnh theo tín hiệu (BR-RA-13, 15..17); ảnh chụp màn hình chỉ là cờ, không tự hạ mức. */
export function classifyImage(img: ImageReadingInput, match: { startAt: Date; endAt: Date }): { level: Level; reasons: string[] } {
  const reasons: string[] = [];
  const { signals } = img;
  if (signals.exactDuplicate) reasons.push('EXACT_DUPLICATE');
  if (signals.capturedAt === null) reasons.push('NO_CAPTURE_TIME');
  else if (signals.capturedAt.getTime() < match.startAt.getTime() - CAPTURE_TOLERANCE_MS) reasons.push('CAPTURED_BEFORE_START');
  else if (signals.capturedAt.getTime() > match.endAt.getTime() + CAPTURE_LATE_MS) reasons.push('CAPTURED_LATE');
  if (signals.nearDuplicate) reasons.push('NEAR_DUPLICATE');
  if (signals.multipleBoards || (img.reading?.boards ?? 0) > 1) reasons.push('MULTIPLE_BOARDS');
  if (!img.reading || img.reading.unreadable) reasons.push('AI_UNAVAILABLE');
  return { level: levelOf(reasons), reasons };
}

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();
}

function tokens(text: string): string[] {
  return normalize(text).split(/[^a-z0-9]+/).filter((token) => token.length >= 2);
}

/** Số thành viên của đội có tên khớp gần đúng với nhãn cột (bỏ dấu, chữ thường, chứa nhau hoặc trùng tên gọi). */
function memberMatches(label: string | null, members: string[]): number {
  if (!label) return 0;
  const normalizedLabel = normalize(label);
  const labelTokens = new Set(tokens(label));
  if (normalizedLabel.length < 2) return 0;
  return members.filter((member) => {
    const name = normalize(member);
    if (name.length < 2) return false;
    const given = tokens(member).at(-1);
    return normalizedLabel.includes(name) || name.includes(normalizedLabel) || (given !== undefined && labelTokens.has(given));
  }).length;
}

export function mapColumns(
  labels: { left: string | null; right: string | null }, teams: { A: string[]; B: string[] },
): 'left_is_A' | 'left_is_B' | null {
  const la = memberMatches(labels.left, teams.A);
  const lb = memberMatches(labels.left, teams.B);
  const ra = memberMatches(labels.right, teams.A);
  const rb = memberMatches(labels.right, teams.B);
  const leftA = la > lb || rb > ra;
  const leftB = lb > la || ra > rb;
  if (leftA && !leftB) return 'left_is_A';
  if (leftB && !leftA) return 'left_is_B';
  return null;
}

interface SetEntry { uploadId: string; capturedAt: Date | null; order: number; teamA: number; teamB: number; conf: number }

function pick(entries: SetEntry[]): SetEntry {
  const timed = entries.filter((entry) => entry.capturedAt !== null);
  if (timed.length > 0) return timed.reduce((best, entry) => (entry.capturedAt! > best.capturedAt! ? entry : best));
  return entries.reduce((best, entry) => (entry.conf > best.conf ? entry : best));
}

const sign = (entry: SetEntry) => Math.sign(entry.teamA - entry.teamB);

/**
 * Gộp các ảnh thành bản nháp: set có `index` vào đúng vị trí, set không rõ thứ tự lấp vào chỗ trống theo giờ chụp
 * tăng dần; một set nhiều ảnh lấy ảnh chụp muộn nhất (không có giờ chụp thì ảnh chắc nhất) (BR-RA-12).
 */
export function buildDraft(
  images: ImageReadingInput[],
  ctx: { format: MatchFormat; teams: { A: string[]; B: string[] }; match: { startAt: Date; endAt: Date }; cellThreshold: number },
): Draft {
  const reasons: string[] = [];
  for (const image of images) reasons.push(...classifyImage(image, ctx.match).reasons);
  const read = images
    .map((image, order) => ({ image, order }))
    .filter(({ image }) => image.reading && !image.reading.unreadable && image.reading.sets.length > 0);
  if (read.length === 0) {
    const all = unique([...reasons, 'AI_UNAVAILABLE']);
    return { format: ctx.format, sets: [], columnMappedBy: null, level: levelOf(all), reasons: all, manualEntry: true };
  }

  const mappings = read.map(({ image }) => mapColumns(image.reading!.columns, ctx.teams));
  const agreed = mappings.every((mapping) => mapping !== null && mapping === mappings[0]) ? mappings[0]! : null;
  if (agreed === null) reasons.push('USER_COLUMN_MAPPING');

  const slots = new Map<number, SetEntry[]>();
  const unindexed: SetEntry[] = [];
  const timeKey = (entry: SetEntry) => entry.capturedAt?.getTime() ?? Number.POSITIVE_INFINITY;
  read.forEach(({ image, order }, readIndex) => {
    // Không khớp được cột thì tạm coi cột trái là đội A; người khai chọn lại (tối đa Vàng).
    const swap = (agreed ?? mappings[readIndex] ?? 'left_is_A') === 'left_is_B';
    image.reading!.sets.forEach((set, setOrder) => {
      const entry: SetEntry = {
        uploadId: image.uploadId, capturedAt: image.signals.capturedAt, order: order * 10 + setOrder,
        teamA: swap ? set.right : set.left, teamB: swap ? set.left : set.right,
        conf: Math.min(set.confLeft, set.confRight),
      };
      if (set.index === null) unindexed.push(entry);
      else slots.set(set.index, [...(slots.get(set.index) ?? []), entry]);
    });
  });
  // T7: ảnh chưa đọc kịp/lỗi giữ một chỗ set trống (gõ tay) theo giờ chụp, không quá số set tối đa của thể thức.
  images.forEach((image, order) => {
    if (read.some((item) => item.order === order)) return;
    unindexed.push({ uploadId: image.uploadId, capturedAt: image.signals.capturedAt, order: order * 10, teamA: NaN, teamB: NaN, conf: 0 });
  });
  unindexed.sort((a, b) => timeKey(a) - timeKey(b) || a.order - b.order);
  const maxSets = ctx.format === 'bo5' ? 5 : 3;
  let next = 1;
  for (const entry of unindexed) {
    while (slots.has(next)) next += 1;
    if (Number.isNaN(entry.teamA) && next > maxSets) continue;
    slots.set(next, [entry]);
  }

  const maxSet = Math.max(...slots.keys());
  const sets: DraftSet[] = [];
  for (let position = 1; position <= maxSet; position += 1) {
    const entries = slots.get(position)?.filter((entry) => !Number.isNaN(entry.teamA));
    if (!entries || entries.length === 0) {
      reasons.push('MANUAL_SET');
      sets.push({ teamA: null, teamB: null, sourceUploadId: null, lowConfidence: true });
      continue;
    }
    if (new Set(entries.map(sign)).size > 1) reasons.push('SET_IMAGES_CONFLICT');
    const chosen = pick(entries);
    const low = chosen.conf < ctx.cellThreshold;
    if (low) reasons.push('LOW_CELL_CONFIDENCE');
    sets.push({ teamA: chosen.teamA, teamB: chosen.teamB, sourceUploadId: chosen.uploadId, lowConfidence: low });
  }

  // BR-RA-13a: chính kết quả AI đọc sai luật thì mọi ô coi như độ chắc < ngưỡng.
  const complete = sets.every((set) => set.teamA !== null && set.teamB !== null);
  if (complete) {
    try {
      inferMatchOutcome({ format: ctx.format, sets: sets as SetScore[] });
    } catch (error) {
      if (!(error instanceof InvalidScoreError)) throw error;
      for (const set of sets) set.lowConfidence = true;
      reasons.push('LOW_CELL_CONFIDENCE');
    }
  }
  const all = unique(reasons);
  return { format: ctx.format, sets, columnMappedBy: agreed === null ? null : 'ai', level: levelOf(all), reasons: all, manualEntry: false };
}

/**
 * Mức của bản khai do server tính lại từ bản nháp (không tin FE). So từng ô với số AI đọc: lệch → EDITED_CELL;
 * set không có số AI → MANUAL_SET. Ném InvalidScoreError khi tỉ số sai luật.
 */
export function classifyClaim(
  draft: Draft,
  submitted: { sets: SetScore[]; columnMappedBy: 'ai' | 'user'; editedCells: Array<{ set: number; side: 'A' | 'B' }> },
  reporter: { reputation: 'good' | 'watch' | 'low' },
): { level: Level; reasons: string[]; outcome: MatchOutcome } {
  const { outcome } = inferMatchOutcome({ format: draft.format, sets: submitted.sets });
  const reasons = draft.reasons.filter((reason) => reason !== 'USER_COLUMN_MAPPING');
  if (submitted.columnMappedBy === 'user' || draft.columnMappedBy === null) reasons.push('USER_COLUMN_MAPPING');
  if (submitted.editedCells.length > 0) reasons.push('EDITED_CELL');
  submitted.sets.forEach((set, index) => {
    const ai = draft.sets[index];
    if (!ai || ai.teamA === null || ai.teamB === null) reasons.push('MANUAL_SET');
    else if ((ai.teamA !== set.teamA || ai.teamB !== set.teamB)
      // Người khai đảo cột (bản nháp tạm coi cột trái là A) không phải sửa ô.
      && !(submitted.columnMappedBy === 'user' && ai.teamA === set.teamB && ai.teamB === set.teamA)) reasons.push('EDITED_CELL');
  });
  if (reporter.reputation === 'low') reasons.push('REPORTER_LOW_REPUTATION');
  const all = unique(reasons);
  return { level: levelOf(all), reasons: all, outcome };
}
