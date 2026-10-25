import type { ReactNode } from 'react';
import { MatchApiError, type MatchOutcome, type SetScore, type TeamSide } from '../../lib/matchApi';
import type { Level, ResultCaseV2 } from '../../lib/resultApi';
import { formatDateTimeVi, formatTimeVi } from '../../lib/formatters.js';

// Phần dùng chung của khối "Kết quả trận" (luồng ảnh). Chữ nghiệp vụ tiếng Việt, không lộ mã nội bộ.

export const LEVEL_TEXT: Record<Level, string> = { green: 'Xanh', yellow: 'Vàng', red: 'Đỏ' };
const LEVEL_STYLE: Record<Level, string> = {
  green: 'bg-success-bg text-success', yellow: 'bg-warning-bg text-warning', red: 'bg-danger-bg text-danger',
};

export function LevelBadge({ level, prefix = '' }: { level: Level; prefix?: string }) {
  return (
    <span className={`inline-flex h-8 items-center gap-2 rounded-full px-3 text-sm font-bold ${LEVEL_STYLE[level]}`}>
      <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-current" />{prefix}{LEVEL_TEXT[level]}
    </span>
  );
}

/** Lý do mức tin cậy cho cả kèo (BR-RA-16). Mã nội bộ (uy tín) không có nhãn nên không bao giờ hiện. */
const REASON_TEXT: Record<string, string> = {
  EXACT_DUPLICATE: 'Ảnh trùng với ảnh của một trận khác',
  CAPTURED_BEFORE_START: 'Ảnh chụp trước giờ đánh hơn 30 phút',
  NO_CAPTURE_TIME: 'Ảnh không có giờ chụp',
  CAPTURED_LATE: 'Ảnh chụp sau khi trận kết thúc hơn 2 giờ',
  NEAR_DUPLICATE: 'Ảnh gần giống ảnh của một trận khác',
  MULTIPLE_BOARDS: 'Ảnh có nhiều bảng điểm',
  AI_UNAVAILABLE: 'Tỉ số nhập tay vì chưa đọc được ảnh',
  LOW_CELL_CONFIDENCE: 'AI chưa chắc tỉ số một số set',
  MANUAL_SET: 'Có set nhập tay',
  SET_IMAGES_CONFLICT: 'Các ảnh cùng set cho tỉ số khác nhau',
  USER_COLUMN_MAPPING: 'Người khai tự chọn cột cho đội',
  EDITED_CELL: 'Người khai đã sửa số AI đọc',
  SCREENSHOT: 'Ảnh chụp màn hình',
};
export const reasonText = (code: string) => REASON_TEXT[code] ?? null;

/** Q2: bản Vàng không có lý do công khai → câu chung, không suy ra được lý do riêng. */
export function ReasonList({ level, reasons, responseHours }: { level: Level | null; reasons: string[]; responseHours?: number }) {
  const shown = reasons.map(reasonText).filter((text): text is string => Boolean(text));
  if (shown.length === 0) {
    if (level !== 'yellow') return null;
    return <p className="text-sm text-ink-700">Đội kia có {responseHours ?? 6} giờ để kiểm tra.</p>;
  }
  return (
    <ul className="grid gap-1.5 text-sm text-ink-700">
      {shown.map((text) => <li key={text} className="flex gap-2"><span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-ink-300" />{text}</li>)}
    </ul>
  );
}

export const teamLabel = (resultCase: Pick<ResultCaseV2, 'match'>, side: TeamSide) =>
  resultCase.match.teams.find((team) => team.side === side)?.players.map((player) => player.displayName).join(', ') || `Đội ${side}`;
export const nameOf = (resultCase: Pick<ResultCaseV2, 'match'>, userId: string | null | undefined) =>
  resultCase.match.teams.flatMap((team) => team.players).find((player) => player.userId === userId)?.displayName ?? 'Người chơi';

export function outcomeText(outcome: MatchOutcome | null | undefined, sets?: SetScore[]) {
  if (!outcome) return 'Chưa có kết quả';
  if (outcome === 'NO_RESULT') return 'Không có kết quả';
  const wins = (sets ?? []).reduce((acc, set) => (set.teamA > set.teamB ? { ...acc, a: acc.a + 1 } : set.teamB > set.teamA ? { ...acc, b: acc.b + 1 } : acc), { a: 0, b: 0 });
  const tally = sets && sets.length > 0 ? ` ${outcome === 'TEAM_A_WIN' ? wins.a : wins.b}–${outcome === 'TEAM_A_WIN' ? wins.b : wins.a}` : '';
  return `Đội ${outcome === 'TEAM_A_WIN' ? 'A' : 'B'} thắng${tally}`;
}

export function ScoreChips({ sets }: { sets: SetScore[] }) {
  return (
    <div className="flex flex-wrap gap-2" aria-label="Tỉ số từng set">
      {sets.map((set, index) => <span key={index} className="text-figures rounded-lg border border-line bg-canvas px-3 py-1 text-lg font-semibold">{set.teamA}–{set.teamB}</span>)}
    </div>
  );
}

/** Giờ VN dạng "08:00 23/10". */
export const shortTime = (iso: string) => {
  const full = formatDateTimeVi(iso);
  return `${formatTimeVi(iso)} ${full.slice(0, 5)}`;
};

/**
 * BR-RA-20a: nhãn "dời qua đêm". Hạn phản hồi có hạn gốc từ API; các hạn khác chỉ có hạn cuối nên coi hạn đúng
 * 08:00:00 giờ VN là đã dời (hạn gốc gần như không bao giờ trùng tới mili giây).
 */
export function nightShiftFrom(deadline: string | null, base?: string | null): string | null {
  if (!deadline) return null;
  if (base !== undefined) return base && base !== deadline ? formatTimeVi(base) : null;
  const date = new Date(deadline);
  const vnMinutes = (date.getUTCHours() * 60 + date.getUTCMinutes() + 7 * 60) % (24 * 60);
  return vnMinutes === 8 * 60 && date.getUTCSeconds() === 0 && date.getUTCMilliseconds() === 0 ? '' : null;
}

export function NightTag({ from }: { from: string | null }) {
  if (from === null) return null;
  return (
    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-brand-navy">
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" /></svg>
      {from ? `Dời qua đêm từ ${from}` : 'Dời sang 08:00'}
    </span>
  );
}

const ERROR_TEXT: Record<string, string> = {
  RESULT_VERSION_STALE: 'Bản khai vừa được gửi lại. Xem bản mới trước khi trả lời.',
  RESULT_SCORE_INVALID: 'Tỉ số chưa hợp lệ theo luật. Kiểm tra lại từng set.',
  RESULT_APPEAL_GROUNDS_REQUIRED: 'Chọn điểm sai hoặc thêm ảnh mới để gửi kháng nghị.',
  RESULT_APPEAL_ALREADY_SENT: 'Đội bạn đã gửi kháng nghị.',
  RESULT_OBJECTION_EVIDENCE_REQUIRED: 'Bạn cần kèm ít nhất 1 ảnh khi phản đối.',
  RESULT_REPLACE_CLOSED: 'Không thay được bản khai nữa: đội kia đã phản hồi hoặc đồng đội đã gửi bản khác.',
  RESULT_EVIDENCE_LIMIT: 'Bạn đã nộp đủ số ảnh cho trận này.',
  RESULT_DRAFT_LIMIT: 'Bạn đã tải quá nhiều ảnh nháp cho trận này. Dùng các ảnh đã đọc để gửi.',
  RESULT_EVIDENCE_TOO_LARGE: 'Mỗi ảnh tối đa 15 MB.',
  RESULT_EVIDENCE_MIME: 'Chỉ nhận ảnh JPG, PNG, WEBP.',
  RESULT_EVIDENCE_COUNT: 'Mỗi lần gửi 1–5 ảnh.',
  RESULT_RESPONSE_CLOSED: 'Đã hết hạn phản hồi.',
  RESULT_APPEAL_CLOSED: 'Đã hết hạn kháng nghị.',
  RESULT_EVIDENCE_WINDOW_CLOSED: 'Đã hết thời gian nộp bằng chứng.',
  RESULT_DECLARATION_CLOSED: 'Đã hết hạn khai kết quả.',
  RESULT_INCIDENT_LIMIT: 'Bạn đã báo sự cố cho trận này.',
};

/** Câu báo lỗi theo mã lỗi (không so câu chữ của server). */
export function errorText(cause: unknown, fallback = 'Không thể xử lý yêu cầu.') {
  if (cause instanceof MatchApiError && cause.code && ERROR_TEXT[cause.code]) return ERROR_TEXT[cause.code]!;
  if (cause instanceof DOMException && cause.name === 'TimeoutError') return 'Đọc ảnh quá lâu. Bạn có thể nhập tỉ số bằng tay.';
  if (cause instanceof TypeError) return 'Kết nối bị gián đoạn. Thử lại.';
  return cause instanceof Error && cause.message ? cause.message : fallback;
}
export const errorCode = (cause: unknown) => (cause instanceof MatchApiError ? cause.code : undefined);

export function Note({ tone = 'neutral', children }: { tone?: 'neutral' | 'info' | 'warning' | 'danger' | 'success'; children: ReactNode }) {
  const styles = {
    neutral: 'bg-canvas text-ink-700', info: 'bg-green-50 text-brand-navy', warning: 'bg-warning-bg text-[#6b4500]',
    danger: 'bg-danger-bg text-[#8f1f29]', success: 'bg-success-bg text-[#1f5a47]',
  } as const;
  return <div role={tone === 'danger' ? 'alert' : undefined} className={`rounded-xl p-3 text-sm ${styles[tone]}`}>{children}</div>;
}
