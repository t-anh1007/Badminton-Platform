import { SurfaceCard } from './ui';
import { EvidenceThumbs, INCIDENTS } from './MatchResultFlow';
import { formatDateTimeVi } from '../lib/formatters.js';
import type { MatchOutcome, ReviewCaseDetail, ReviewQueueItem } from '../lib/matchApi';

/** Phần dùng chung cho màn 09 (chủ sân) và 10 (Admin): chỉ hiển thị, không tự chốt kết quả. */
export const OUTCOMES: MatchOutcome[] = ['TEAM_A_WIN', 'TEAM_B_WIN', 'NO_RESULT'];
const RESPONSE_LABELS: Record<string, string> = { confirm: 'Đồng ý kết quả', object: 'Khiếu nại', incident: 'Báo sự cố' };

export const teamNames = (detail: ReviewCaseDetail, side: 'A' | 'B') =>
  detail.match.teams.find((team) => team.side === side)?.players.map((player) => player.displayName).join(' & ') || `Đội ${side}`;
export const outcomeText = (detail: ReviewCaseDetail, outcome: MatchOutcome) =>
  // Kèm tên đội vì người chơi ẩn danh đều hiển thị "Người chơi".
  outcome === 'NO_RESULT' ? 'Không có kết quả' : `${teamNames(detail, outcome === 'TEAM_A_WIN' ? 'A' : 'B')} thắng (Đội ${outcome === 'TEAM_A_WIN' ? 'A' : 'B'})`;
export const queueTitle = (item: ReviewQueueItem) =>
  `Kèo ${item.mode === 'ranked' ? 'xếp hạng' : 'giao lưu'} - ${item.discipline === 'doubles' ? 'Đánh đôi' : 'Đánh đơn'}`;
/** Dòng phân biệt hồ sơ trong hàng chờ: sân + mã kèo/booking. */
export const queueContext = (item: ReviewQueueItem) =>
  [[item.venueName, item.courtName].filter(Boolean).join(' - '), item.matchCode, item.bookingCode].filter(Boolean).join(' · ');

export function CaseSummary({ detail }: { detail: ReviewCaseDetail }) {
  const rows = [
    ['Sân và thời gian', detail.booking ? `${detail.booking.venue.name} - ${detail.booking.court.name}` : 'Chưa đọc được lượt đặt sân', detail.booking ? formatDateTimeVi(detail.booking.startAt) : ''],
    ['Người chơi', `${teamNames(detail, 'A')} và ${teamNames(detail, 'B')}`, `${detail.match.format === 'bo5' ? 'BO5 (thắng 3 trong 5 ván)' : 'BO3 (thắng 2 trong 3 ván)'} - tỷ lệ thua : thắng ${detail.match.ratio.replace(':', ' : ')}`],
    ['Mã tham chiếu', [detail.matchCode && `Mã kèo ${detail.matchCode}`, detail.bookingCode && `Mã đặt sân ${detail.bookingCode}`].filter(Boolean).join(' · ') || 'Chưa có mã', ''],
  ];
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {rows.map(([label, value, hint]) => (
        <div key={label} className="rounded-xl border border-line p-3">
          <dt className="text-xs text-ink-500">{label}</dt>
          <dd className="mt-1 font-semibold text-brand-navy">{value}</dd>
          {hint && <dd className="text-sm text-ink-700">{hint}</dd>}
        </div>
      ))}
    </dl>
  );
}

/** `evidenceLockedNote`: chủ sân chỉ xem được ảnh khi hồ sơ đang chờ mình đề xuất — thay nút "Xem ảnh" bằng lời giải thích. */
export function CaseStatements({ detail, evidenceLockedNote }: { detail: ReviewCaseDetail; evidenceLockedNote?: string }) {
  const Evidence = ({ evidence }: { evidence: Array<{ id: string }> }) => evidenceLockedNote
    ? (evidence.length ? <p className="mt-2 text-xs text-ink-500">{evidenceLockedNote}</p> : null)
    : <EvidenceThumbs matchId={detail.matchId} evidence={evidence} />;
  const incidentTitle = (type: string | null) => INCIDENTS.find((item) => item.value === type)?.title;
  return (
    <SurfaceCard>
      <h3 className="text-h3">Khai báo và bằng chứng</h3>
      <ul className="mt-3 space-y-3">
        {detail.claims.map((claim) => (
          <li key={claim.id} className="rounded-xl bg-canvas p-3">
            <div className="flex flex-wrap justify-between gap-2">
              <p className="font-semibold">{claim.claimant.displayName} - {formatDateTimeVi(claim.createdAt)}</p>
              <p className="text-sm font-bold text-brand-navy">Khai: {outcomeText(detail, claim.outcome)}</p>
            </div>
            <p className="text-figures mt-1 text-sm">{claim.sets.map((set) => `${set.teamA}-${set.teamB}`).join(', ')}</p>
            <Evidence evidence={claim.evidenceIds.map((id) => ({ id }))} />
          </li>
        ))}
        {detail.responses.map((response) => (
          <li key={response.id} className="rounded-xl bg-canvas p-3">
            <div className="flex flex-wrap justify-between gap-2">
              <p className="font-semibold">{response.user.displayName} - {formatDateTimeVi(response.createdAt)}</p>
              <p className={`text-sm font-bold ${response.kind === 'confirm' ? 'text-success' : 'text-danger'}`}>
                {incidentTitle(response.incidentType) ?? RESPONSE_LABELS[response.kind] ?? 'Phản hồi'}
              </p>
            </div>
            {response.reason && <p className="mt-1 text-sm text-ink-700">{response.reason}</p>}
            {response.evidenceIds.length > 0 && <Evidence evidence={response.evidenceIds.map((id) => ({ id }))} />}
          </li>
        ))}
        {detail.supplementalEvidence.length > 0 && (
          <li className="rounded-xl bg-canvas p-3">
            <p className="font-semibold">Bằng chứng bổ sung</p>
            <Evidence evidence={detail.supplementalEvidence} />
          </li>
        )}
        {detail.claims.length + detail.responses.length === 0 && <li className="text-sm text-ink-500">Chưa có khai báo nào.</li>}
      </ul>
      <p className="mt-3 rounded-xl bg-success-bg p-3 text-xs text-ink-700">Doanh thu đặt sân của sân không bị giữ bởi tranh chấp kết quả kèo.</p>
    </SurfaceCard>
  );
}

export function OutcomeChoice({ detail, value, onChange, name }: { detail: ReviewCaseDetail; value: MatchOutcome | ''; onChange: (value: MatchOutcome) => void; name: string }) {
  const hint: Record<MatchOutcome, string> = {
    TEAM_A_WIN: `Ghi nhận Đội A (${teamNames(detail, 'A')}) là bên thắng.`,
    TEAM_B_WIN: `Ghi nhận Đội B (${teamNames(detail, 'B')}) là bên thắng.`,
    NO_RESULT: 'Không xác định bên thắng cho trận này.',
  };
  return (
    <fieldset className="space-y-2">
      <legend className="sr-only">Kết quả</legend>
      {OUTCOMES.map((outcome) => (
        <label key={outcome} className={`block cursor-pointer rounded-2xl border-2 p-3 ${value === outcome ? 'border-brand-navy bg-canvas' : 'border-line'}`}>
          <input type="radio" name={name} className="mr-2" checked={value === outcome} onChange={() => onChange(outcome)} />
          <span className="font-semibold text-brand-navy">{outcomeText(detail, outcome)}</span>
          <span className="mt-1 block text-xs text-ink-500">{hint[outcome]}</span>
        </label>
      ))}
    </fieldset>
  );
}
