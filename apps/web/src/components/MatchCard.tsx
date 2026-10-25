import type { Ref } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from './ui';
import { Icon } from './Icon';
import { formatMoneyVnd } from '../lib/formatters.js';
import type { MatchRow, SkillTier } from '../lib/matchApi';

export const tierLabels: Record<SkillTier, string> = {
  newcomer: 'Mới chơi',
  beginner: 'Yếu',
  intermediate: 'Trung bình',
  intermediate_plus: 'Trung bình khá',
  advanced: 'Bán chuyên',
};

const weekday = new Intl.DateTimeFormat('vi-VN', { weekday: 'short' });
const time = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
const money = (value: string) => (Number(value) === 0 ? 'Miễn phí' : formatMoneyVnd(value));
export const skillRange = (row: Pick<MatchRow, 'skillMin' | 'skillMax'>) =>
  row.skillMin || row.skillMax
    ? `${row.skillMin ? tierLabels[row.skillMin] : 'Mọi bậc'} – ${row.skillMax ? tierLabels[row.skillMax] : 'Mọi bậc'}`
    : 'Mọi bậc';

/** Thẻ kèo: khối ngày nổi bật, chấm thể hiện số chỗ đã có, phí/người. */
export function MatchCard({ match, highlighted = false, ref }: { match: MatchRow; highlighted?: boolean; ref?: Ref<HTMLAnchorElement> }) {
  const start = new Date(match.startAt);
  const end = new Date(match.endAt);
  const ranked = match.mode === 'ranked';
  const singles = (match.discipline ?? (match.capacity === 2 ? 'singles' : 'doubles')) === 'singles';
  const taken = match.capacity - match.openSlots;
  const full = match.openSlots <= 0;
  const status = match.status === 'confirmed' ? 'Đã xác nhận' : match.paymentPending ? 'Đang giữ chỗ' : full ? 'Đã đủ người' : `Còn ${match.openSlots} chỗ`;
  const statusTone = match.status === 'confirmed' || full ? 'text-ink-500' : match.openSlots <= 1 || match.paymentPending ? 'text-warning' : 'text-success';
  return (
    <Link ref={ref} to={`/matches/${match.id}`} data-testid={`match-card-${match.id}`} className={`surface-card group flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-raised)] ${full ? 'opacity-75' : ''} ${highlighted ? 'ring-2 ring-brand-yellow' : ''}`}>
      <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-4 p-5">
        <div className={`self-start rounded-xl px-1 py-2.5 text-center text-brand-navy ${ranked ? 'bg-brand-yellow' : 'bg-green-50'}`}>
          <p className="text-xs font-bold capitalize">{weekday.format(start)}</p>
          <p className="text-figures text-2xl font-semibold leading-tight">{start.getDate()}</p>
          <p className="text-xs">Th{start.getMonth() + 1}</p>
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap gap-1.5">
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${ranked ? 'bg-brand-yellow text-brand-navy' : 'bg-green-100 text-brand-navy'}`}>{ranked && <Icon name="trophy" className="h-3.5 w-3.5" />}{ranked ? 'Xếp hạng' : 'Giao hữu'}</span>
            <span className="rounded-full bg-canvas px-2.5 py-0.5 text-xs font-bold text-ink-700">{singles ? 'Đơn' : 'Đôi'}</span>
          </div>
          <h2 className="mt-2 truncate font-bold text-ink-900 group-hover:text-brand-navy">{match.venue.name} · {match.court.name}</h2>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-500"><Icon name="clock" className="h-4 w-4" /><span className="text-figures">{time.format(start)} – {time.format(end)}</span></p>
          <div className="mt-3 flex items-center gap-2 text-sm">
            <Avatar className="!h-7 !w-7 !text-xs" label={match.organizer?.displayName ?? 'C'} src={match.organizer?.avatarUrl} alt="" />
            <span className="truncate">{match.organizer?.displayName ?? 'Chủ kèo'}{match.organizer?.tier && <span className="text-ink-500"> · {tierLabels[match.organizer.tier]}</span>}</span>
          </div>
        </div>
      </div>
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-line bg-canvas/60 px-5 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex gap-1" role="img" aria-label={`${taken} trên ${match.capacity} người`}>
            {Array.from({ length: match.capacity }, (_, index) => <span key={index} className={`h-3 w-3 rounded-full ${index < taken ? 'bg-brand-navy' : 'border-2 border-ink-300'}`} />)}
          </span>
          <span className={`text-sm font-bold ${statusTone}`}>{status}</span>
        </div>
        <div className="text-right">
          <p className="text-xs text-ink-500">{skillRange(match)}</p>
          <p className="text-sm"><b className="text-figures font-semibold text-brand-navy">{money(match.feePerSlot)}</b>{Number(match.feePerSlot) > 0 && '/người'}</p>
        </div>
      </div>
    </Link>
  );
}
