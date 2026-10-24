import { useEffect, useState, type ReactNode } from 'react';
import { Avatar, Badge, Button } from './ui';
import { BusinessCode } from './BusinessCode.js';
import { Icon, type IconName } from './Icon';
import { formatDateTimeVi, formatMoneyVnd, formatTimeVi } from '../lib/formatters.js';
import type { MatchDetail, MatchParticipant, SetScore, SkillTier, TeamSide } from '../lib/matchApi';
import type { FinalScore } from './result/MatchResultSection.js';

const tierLabels: Record<SkillTier, string> = {
  newcomer: 'Mới chơi', beginner: 'Yếu', intermediate: 'Trung bình', intermediate_plus: 'Trung bình khá', advanced: 'Bán chuyên',
};
export const modeLabel = (detail: MatchDetail) => (detail.mode === 'ranked' ? 'Kèo xếp hạng' : 'Kèo giao hữu');
export const disciplineLabel = (detail: MatchDetail) => (detail.discipline === 'doubles' ? 'Đánh đôi' : 'Đánh đơn');

/** Trạng thái nghiệp vụ theo thứ tự; chỉ là cách hiển thị trạng thái backend trả về. */
function progress(detail: MatchDetail) {
  const participants = detail.participants ?? [];
  const published = detail.status !== 'awaiting_deposit';
  const full = published && detail.openSlots <= 0;
  const funded = full && participants.every((participant) => participant.paymentState === 'paid');
  const locked = detail.status === 'confirmed' || detail.status === 'completed';
  return [
    { label: 'Đã công bố', done: published },
    { label: `Đủ ${detail.capacity} người`, done: full },
    { label: 'Đủ tiền kèo', done: funded || locked },
    { label: 'Chốt kèo', done: locked },
    { label: 'Thi đấu', done: detail.status === 'completed' },
  ];
}

/** Thanh tiến trình gọn trong thẻ đầu trang; chỉ hiện khi kèo chưa chốt. */
function MatchProgress({ detail }: { detail: MatchDetail }) {
  const steps = progress(detail);
  const current = steps.findIndex((step) => !step.done);
  return (
    <ol aria-label="Tiến trình kèo" className="mt-4 grid grid-cols-5 gap-1.5">
      {steps.map((step, index) => (
        <li key={step.label} aria-current={index === current ? 'step' : undefined}>
          <span className={`block h-1.5 rounded-full ${step.done ? 'bg-success' : index === current ? 'bg-brand-yellow' : 'bg-line'}`} />
          <span className={`mt-1.5 block truncate text-xs ${step.done ? 'font-semibold text-success' : index === current ? 'font-bold text-brand-navy' : 'text-ink-500'}`}>{step.label}</span>
        </li>
      ))}
    </ol>
  );
}

/** Thẻ đầu trang: tên sân, một dòng thông tin có icon và nhãn trạng thái. */
export function MatchHeader({ detail, badge }: { detail: MatchDetail; badge: ReactNode }) {
  const locked = ['confirmed', 'completed', 'cancelled'].includes(detail.status);
  return (
    <section className="surface-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="courtin-kicker">{modeLabel(detail)} - {disciplineLabel(detail)}</p>
          <h1 className="mt-1 text-[28px] font-extrabold leading-tight text-brand-navy">{detail.venue.name} - {detail.court.name}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-ink-700">
            <span className="inline-flex items-center gap-1.5"><Icon name="calendar" className="h-4 w-4 text-brand-navy" />{formatDateTimeVi(detail.startAt)} – {formatTimeVi(detail.endAt)}</span>
            {detail.venue.address && <span className="inline-flex items-center gap-1.5"><Icon name="pin" className="h-4 w-4 text-brand-navy" />{detail.venue.address}</span>}
            <span className="inline-flex items-center gap-1.5"><Icon name="users" className="h-4 w-4 text-brand-navy" />{detail.capacity - detail.openSlots}/{detail.capacity} người</span>
            <BusinessCode code={detail.businessCode} label="Mã kèo" />
          </div>
        </div>
        {badge}
      </div>
      {!locked && <MatchProgress detail={detail} />}
    </section>
  );
}

function CardTitle({ icon, title, right }: { icon: IconName; title: string; right?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-green-50 text-brand-navy"><Icon name={icon} className="h-[18px] w-[18px]" /></span>
        <h2 className="text-h3">{title}</h2>
      </div>
      {right}
    </div>
  );
}

function Hint({ text }: { text: string }) {
  return <span title={text} aria-label={text} className="ml-1 inline-flex cursor-help align-[-3px] text-ink-500"><Icon name="info" className="h-[15px] w-[15px]" /></span>;
}

function useCountdown(deadline: string) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  const left = Math.max(0, new Date(deadline).getTime() - now);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(Math.floor(left / 3_600_000))}:${pad(Math.floor((left % 3_600_000) / 60_000))}:${pad(Math.floor((left % 60_000) / 1_000))}`;
}

export function LockBanner({ detail }: { detail: MatchDetail }) {
  const countdown = useCountdown(detail.cutoffAt);
  const allPaid = (detail.participants ?? []).every((participant) => participant.paymentState === 'paid') && detail.openSlots <= 0;
  return (
    <section className="flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-card)] bg-brand-navy p-5 text-surface">
      <div className="max-w-xl">
        <h2 className="text-lg font-bold">{allPaid ? 'Các bên đã hoàn tất' : 'Kèo đang tìm người chơi'}</h2>
        <p className="mt-1 text-sm opacity-90">
          {allPaid
            ? 'Không cần thao tác thêm. Trước hạn chốt, người tham gia vẫn có thể rút và nhận lại toàn bộ phần tiền đã đóng.'
            : 'Người tham gia chọn đội và đóng phần tiền trước hạn chốt kèo. Chưa đủ người khi tới hạn thì kèo tự hủy và hoàn tiền.'}
        </p>
      </div>
      <div className="text-right">
        <p className="text-xs opacity-90">Hạn chốt kèo - {formatDateTimeVi(detail.cutoffAt)}</p>
        <p className="text-figures text-3xl font-bold text-brand-yellow" aria-label={`Còn ${countdown}`}>{countdown}</p>
      </div>
    </section>
  );
}

function PlayerRow({ participant, payment, alignEnd }: { participant: MatchParticipant; payment: { text: string; paid: boolean } | null; alignEnd: boolean }) {
  return (
    <div className={`flex items-center gap-3 py-2 ${alignEnd ? 'flex-row-reverse text-right' : ''}`}>
      <Avatar label={participant.displayName} src={participant.avatarUrl} alt={`Ảnh đại diện ${participant.displayName}`} className="h-10 w-10 shrink-0" />
      <div className="min-w-0">
        <p className="truncate font-semibold text-ink-900">{participant.displayName}{participant.role === 'organizer' && <Badge tone="warning" className="ml-2">Chủ kèo</Badge>}</p>
        {payment && <p className={`text-sm ${payment.paid ? 'text-success' : 'text-warning'}`}>{payment.text}</p>}
      </div>
    </div>
  );
}

function SetLine({ set, index }: { set: SetScore; index: number }) {
  const point = (value: number, won: boolean) => <span className={`text-figures text-xl ${won ? 'font-extrabold text-brand-navy' : 'text-ink-500'}`}>{value}</span>;
  const dot = (won: boolean) => <span className={`h-2 w-2 rounded-full ${won ? 'bg-success' : ''}`} />;
  return (
    <div className={`grid grid-cols-[16px_32px_48px_32px_16px] items-center justify-items-center py-1.5 ${index ? 'border-t border-dashed border-line' : ''}`}>
      {dot(set.teamA > set.teamB)}{point(set.teamA, set.teamA > set.teamB)}
      <span className="text-[11px] font-bold tracking-wider text-ink-500">SET {index + 1}</span>
      {point(set.teamB, set.teamB > set.teamA)}{dot(set.teamB > set.teamA)}
    </div>
  );
}

/** Giữa hai đội: tỉ số set khi kết quả đã chốt, ngược lại là VS. Tỉ số chưa chốt không hiện ở đây. */
function ScoreCenter({ detail, final }: { detail: MatchDetail; final: FinalScore | null }) {
  if (!final) {
    return (
      <div className="text-center">
        <p className="text-2xl font-black text-ink-500/50">VS</p>
        <p className="mt-1 text-xs text-ink-500">{detail.status === 'completed' ? 'Kết quả ở mục bên dưới' : 'Chưa thi đấu'}</p>
      </div>
    );
  }
  if (final.outcome === 'NO_RESULT') return <div className="text-center"><p className="text-lg font-extrabold text-ink-700">Không có kết quả</p><p className="mt-1 text-xs text-ink-500">Không tính điểm xếp hạng</p></div>;
  const aWon = final.outcome === 'TEAM_A_WIN';
  const sets = final.sets ?? [];
  const tally = { a: sets.filter((set) => set.teamA > set.teamB).length, b: sets.filter((set) => set.teamB > set.teamA).length };
  return (
    <div className="text-center md:border-x md:border-line md:px-5">
      {sets.length > 0 && (
        <p className="flex items-baseline justify-center gap-2.5" aria-label={`Tỉ số set ${tally.a}–${tally.b}`}>
          <span className={`text-[44px] font-black leading-none ${aWon ? 'text-brand-navy' : 'text-ink-500/60'}`}>{tally.a}</span>
          <span className="text-2xl text-ink-500/50">–</span>
          <span className={`text-[44px] font-black leading-none ${aWon ? 'text-ink-500/60' : 'text-brand-navy'}`}>{tally.b}</span>
        </p>
      )}
      <p className="mb-2 mt-1 text-xs font-bold text-success">Đội {aWon ? 'A' : 'B'} thắng</p>
      {sets.length > 0 && <div aria-label="Tỉ số từng set" className="mx-auto w-fit">{sets.map((set, index) => <SetLine key={index} set={set} index={index} />)}</div>}
    </div>
  );
}

/** Đội A | tỉ số / VS | Đội B. Dòng tiền từng người chỉ hiện khi kèo chưa chốt. */
export function ScoreBoard({ detail, final, onJoin }: { detail: MatchDetail; final: FinalScore | null; onJoin: (side: TeamSide) => void }) {
  const participants = detail.participants ?? [];
  const funding = detail.funding;
  const paidBooking = detail.sourceType === 'paid_booking';
  // Sau hạn chốt kèo không còn rút được (BR-CM-07).
  const locked = !['awaiting_deposit', 'open', 'filled'].includes(detail.status) || new Date(detail.cutoffAt).getTime() <= Date.now();
  const paymentOf = (participant: MatchParticipant) => {
    if (detail.status === 'confirmed' || detail.status === 'completed') return null;
    if (participant.role === 'organizer' && paidBooking) return { text: 'Dùng từ lượt đặt sân đã thanh toán', paid: true };
    const amount = participant.role === 'organizer' ? funding?.organizerContribution : funding?.regularSlotAmount;
    if (participant.paymentState === 'paid') return { text: locked ? 'Đã đóng' : 'Đã đóng - có thể rút trước hạn chốt', paid: true };
    return { text: `Chờ thanh toán${amount ? ` ${formatMoneyVnd(amount)}` : ''}`, paid: false };
  };
  const winner = final?.outcome === 'TEAM_A_WIN' ? 'A' : final?.outcome === 'TEAM_B_WIN' ? 'B' : null;
  const team = (side: TeamSide) => {
    const members = participants.filter((participant) => participant.teamSide === side);
    const open = detail.teamSlots?.find((slot) => slot.side === side)?.open ?? 0;
    const canJoin = side === 'A' ? detail.actions.canJoinTeamA : detail.actions.canJoinTeamB;
    const alignEnd = side === 'B';
    return (
      <section aria-label={`Đội ${side}`}>
        <div className={`flex items-center gap-2 ${alignEnd ? 'md:justify-end' : ''}`}>
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-ink-500">Đội {side}</h3>
          {winner === side && <Badge tone="success">Thắng</Badge>}
        </div>
        {members.map((participant) => <PlayerRow key={participant.userId} participant={participant} payment={paymentOf(participant)} alignEnd={alignEnd} />)}
        {Array.from({ length: open }, (_, index) => (
          <div key={index} className="mt-2 flex items-center justify-between gap-3 rounded-2xl border-2 border-dashed border-line p-3">
            <span className="text-sm text-ink-500">Còn trống</span>
            {canJoin && <Button size="sm" onClick={() => onJoin(side)}>{`Vào đội ${side}`}</Button>}
          </div>
        ))}
      </section>
    );
  };
  return (
    <section className="surface-card p-5 sm:p-6">
      <CardTitle icon={final ? 'trophy' : 'users'} title={final ? 'Đội hình & tỉ số' : 'Đội hình'}
        right={final ? <Badge tone="success">Đã chốt</Badge> : <span className="text-sm text-ink-500">{detail.capacity - detail.openSlots}/{detail.capacity} người</span>} />
      <div className="grid items-center gap-5 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        {team('A')}
        <ScoreCenter detail={detail} final={final} />
        {team('B')}
      </div>
    </section>
  );
}

function InfoRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="text-ink-500">{label}{hint && <Hint text={hint} />}</span>
      <span className="text-right font-semibold text-ink-900">{children}</span>
    </div>
  );
}
const Money = ({ value }: { value: string }) => <span className="text-figures text-brand-navy">{formatMoneyVnd(value)}</span>;

/** Cột phải: cấu hình đã khóa + tiền kèo + vị trí sân. Mọi số tiền do backend tính trong `funding`. */
export function MatchInfoCard({ detail, resultFinal = false }: { detail: MatchDetail; resultFinal?: boolean }) {
  const funding = detail.status === 'cancelled' ? null : detail.funding;
  const paidBooking = detail.sourceType === 'paid_booking';
  return (
    <section className="surface-card p-5 sm:p-6">
      <CardTitle icon="sliders" title="Thông tin kèo" />
      <InfoRow label="Chế độ">{detail.mode === 'ranked' ? 'Xếp hạng' : 'Giao hữu'}</InfoRow>
      <InfoRow label="Hình thức">{disciplineLabel(detail)}</InfoRow>
      <InfoRow label="Thể thức">{detail.format === 'bo5' ? 'BO5 (thắng 3 trong 5 ván)' : 'BO3 (thắng 2 trong 3 ván)'} · 21 điểm · tối đa 30</InfoRow>
      <InfoRow label="Trình độ">{`${detail.skillMin ? tierLabels[detail.skillMin] : 'Mọi bậc'} - ${detail.skillMax ? tierLabels[detail.skillMax] : 'Mọi bậc'}`}</InfoRow>
      <InfoRow label="Tỷ lệ thua : thắng" hint="Tỉ lệ chia phần tiền giữ chờ kết quả giữa đội thua và đội thắng.">{(detail.ratio ?? '5:5').replace(':', ' : ')}</InfoRow>
      {funding && (
        <div aria-label="Tiền kèo" className="mt-2 border-t border-line pt-2">
          <InfoRow label={paidBooking ? 'Tiền sân của lượt đặt sân' : 'Giá sân'} hint={paidBooking ? 'Đã ghi nhận trước khi tạo kèo.' : undefined}><Money value={funding.bookingPrice} /></InfoRow>
          <InfoRow label="Phần mỗi người"><Money value={funding.regularSlotAmount} /></InfoRow>
          {funding.viewerAdditionalAmountDue !== null && detail.status !== 'confirmed' && detail.status !== 'completed' && <InfoRow label="Bạn cần trả thêm"><Money value={funding.viewerAdditionalAmountDue} /></InfoRow>}
          {funding.organizerRefundAtLock !== null && paidBooking && (
            <InfoRow label="Hoàn cho chủ kèo" hint="Phần lượt đặt sân đã trả cao hơn mức cần góp, hoàn khi kèo được chốt hợp lệ.">
              <Money value={funding.organizerRefundAtLock} />{funding.organizerRefundWithdrawable && <Badge tone="success" className="ml-2">Có thể rút</Badge>}
            </InfoRow>
          )}
          <InfoRow label="Giữ chờ kết quả" hint={resultFinal ? 'Kết quả đã có hiệu lực.' : 'Chỉ xử lý sau khi kết quả có hiệu lực.'}>
            <Money value={funding.resultHeldAmount} />{resultFinal ? <Badge tone="success" className="ml-2">Đã xử lý</Badge> : <Badge tone="warning" className="ml-2">Đang giữ</Badge>}
          </InfoRow>
        </div>
      )}
      <div className="mt-2 flex gap-2.5 border-t border-line pt-3 text-sm">
        <Icon name="pin" className="mt-0.5 h-[18px] w-[18px] shrink-0 text-brand-navy" />
        <div>
          <p className="font-semibold text-ink-900">{detail.venue.name} - {detail.court.name}</p>
          <a className="mt-1 inline-flex items-center gap-1.5 font-semibold text-brand-navy" target="_blank" rel="noreferrer"
            href={`https://www.google.com/maps/search/?api=1&query=${detail.venue.lat},${detail.venue.lng}`}>
            <Icon name="navigation" className="h-3.5 w-3.5" />Chỉ đường
          </a>
        </div>
      </div>
    </section>
  );
}
