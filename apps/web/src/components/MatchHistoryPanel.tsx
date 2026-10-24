import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BusinessCode } from './BusinessCode.js';
import { Badge, EmptyState, SegmentedControl } from './ui';
import { formatDateTimeVi } from '../lib/formatters.js';
import type { MatchCancellation, MyConfirmedMatch } from '../lib/matchApi.js';

type Filter = 'all' | 'pending' | 'final' | 'cancelled';
type Tone = 'success' | 'warning' | 'danger' | 'neutral';

const CANCEL_REASON_LABEL: Record<NonNullable<MatchCancellation['reason']>, string> = {
  organizer: 'Chủ kèo hủy kèo',
  cutoff: 'Không đủ người trước giờ chốt kèo',
  confirmed_booking_policy: 'Lượt đặt sân bị hủy theo chính sách',
  shutdown: 'Sân tạm ngừng hoạt động',
};
export const cancelReasonLabel = (cancellation: MatchCancellation | null) =>
  (cancellation?.reason ? CANCEL_REASON_LABEL[cancellation.reason] : 'Kèo đã bị hủy');
export const cancelRefundNote = (cancellation: MatchCancellation | null) =>
  (cancellation?.refundPercent != null && cancellation.refundPercent < 100
    ? `Khoản bạn đã đóng được hoàn ${cancellation.refundPercent}% vào số dư ví theo chính sách hủy.`
    : 'Khoản bạn đã đóng được hoàn vào số dư ví.');

const REVIEW_LABEL: Record<string, string> = { admin_review: 'Quản trị viên đang xét', provider_review: 'Chủ sân đang xét' };

function describe(match: MyConfirmedMatch, now: Date): { label: string; tone: Tone; note: string; group: Filter } {
  if (match.status === 'cancelled') {
    return { label: 'Đã hủy', tone: 'danger', note: cancelReasonLabel(match.cancellation), group: 'cancelled' };
  }
  const result = match.result;
  if (!result) {
    return new Date(match.endAt) > now
      ? { label: 'Sắp diễn ra', tone: 'neutral', note: '', group: 'all' }
      : { label: 'Đã thi đấu', tone: 'neutral', note: '', group: 'all' };
  }
  if (result.status === 'final') {
    if (!result.outcome || result.outcome === 'NO_RESULT') return { label: 'Không có kết quả', tone: 'neutral', note: 'Không tính điểm', group: 'final' };
    const won = (result.outcome === 'TEAM_A_WIN') === (match.teamSide === 'A');
    return { label: won ? 'Thắng' : 'Thua', tone: won ? 'success' : 'neutral', note: '', group: 'final' };
  }
  if (result.status === 'declaration_open') {
    return { label: 'Chờ khai kết quả', tone: 'warning', note: `Hạn khai ${formatDateTimeVi(result.declarationDeadlineAt)}`, group: 'pending' };
  }
  return { label: REVIEW_LABEL[result.status] ?? 'Đang xử lý kết quả', tone: 'warning', note: '', group: 'pending' };
}

export function MatchHistoryPanel({ matches }: { matches: MyConfirmedMatch[] }) {
  const [filter, setFilter] = useState<Filter>('all');
  const now = new Date();
  const rows = matches.map((match) => ({ match, view: describe(match, now) }))
    .filter(({ view }) => filter === 'all' || view.group === filter)
    .sort((a, b) => new Date(b.match.startAt).getTime() - new Date(a.match.startAt).getTime());
  return (
    <div className="mt-6">
      <SegmentedControl options={[{ value: 'all', label: 'Tất cả' }, { value: 'pending', label: 'Chờ kết quả' }, { value: 'final', label: 'Đã chốt' }, { value: 'cancelled', label: 'Đã hủy' }]} value={filter} onChange={setFilter} />
      {rows.length === 0
        ? <div className="mt-4"><EmptyState title="Chưa có kèo nào" description="Các kèo bạn đã tham gia sẽ hiện ở đây." /></div>
        : (
          <>
            <p className="mt-4 text-xs text-ink-500">{rows.length} kèo · mới nhất trước</p>
            <div className="mt-2 space-y-3" aria-label="Lịch sử đấu">
              {rows.map(({ match, view }) => (
                <Link key={match.id} to={`/matches/${match.id}`} state={{ from: 'history' }} className="surface-card block p-4 transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-raised)]">
                  <div className="flex justify-between gap-3">
                    <div>
                      <p className="font-semibold">{match.venue.name} — {match.court.name}</p>
                      <BusinessCode code={match.businessCode} label="Mã kèo" />
                      <p className="mt-1 text-sm text-ink-500">{formatDateTimeVi(match.startAt)}</p>
                      <p className="mt-2 inline-flex rounded-full bg-canvas px-2.5 py-0.5 text-xs font-bold text-ink-500">{match.participationRole === 'organizer' ? 'Chủ kèo' : 'Người tham gia'}</p>
                    </div>
                    <div className="text-right">
                      <Badge tone={view.tone}>{view.label}</Badge>
                      {view.note && <p className="mt-2 max-w-[260px] text-xs text-ink-500">{view.note}</p>}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
    </div>
  );
}
