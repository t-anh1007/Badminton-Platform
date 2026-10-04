import { useEffect, useState, type ReactNode } from 'react';
import { Avatar, Badge, Button, SurfaceCard } from './ui';
import { formatDateTimeVi, formatMoneyVnd } from '../lib/formatters.js';
import type { MatchDetail, MatchParticipant, SkillTier, TeamSide } from '../lib/matchApi';

const tierLabels: Record<SkillTier, string> = {
  newcomer: 'Mới chơi', beginner: 'Yếu', intermediate: 'Trung bình', intermediate_plus: 'Trung bình khá', advanced: 'Bán chuyên',
};
export const modeLabel = (detail: MatchDetail) => (detail.mode === 'ranked' ? 'Kèo xếp hạng' : 'Kèo giao lưu');
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
    { label: 'Chờ chốt kèo', done: locked },
    { label: 'Chờ thi đấu', done: detail.status === 'completed' },
  ];
}

export function MatchProgress({ detail }: { detail: MatchDetail }) {
  const steps = progress(detail);
  const current = steps.findIndex((step) => !step.done);
  return (
    <ol aria-label="Tiến trình kèo" className="surface-card grid gap-3 p-4 sm:grid-cols-5">
      {steps.map((step, index) => (
        <li key={step.label} aria-current={index === current ? 'step' : undefined} className="flex items-center gap-2">
          <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
            step.done ? 'bg-success text-surface' : index === current ? 'bg-brand-yellow text-brand-navy' : 'bg-canvas text-ink-500'
          }`}>{step.done ? '✓' : index + 1}</span>
          <span className={`whitespace-nowrap text-sm ${step.done ? 'text-ink-500' : 'font-semibold text-ink-900'}`}>{step.label}</span>
        </li>
      ))}
    </ol>
  );
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

function Field({ label, value }: { label: string; value: ReactNode }) {
  return <div className="rounded-xl bg-canvas p-3"><p className="text-xs text-ink-500">{label}</p><p className="mt-1 font-semibold text-ink-900">{value}</p></div>;
}

export function LockedConfig({ detail }: { detail: MatchDetail }) {
  return (
    <SurfaceCard>
      <h2 className="text-h3">Thông tin đã khóa</h2>
      <p className="text-sm text-ink-500">Cấu hình không thể thay đổi sau khi công bố.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Field label="Chế độ" value={detail.mode === 'ranked' ? 'Xếp hạng' : 'Giao lưu'} />
        <Field label="Hình thức" value={disciplineLabel(detail)} />
        <Field label="Tỷ lệ thua : thắng" value={(detail.ratio ?? '5:5').replace(':', ' : ')} />
        <Field label="Trình độ" value={`${detail.skillMin ? tierLabels[detail.skillMin] : 'Mọi bậc'} - ${detail.skillMax ? tierLabels[detail.skillMax] : 'Mọi bậc'}`} />
        <Field label="Thể thức chính thức" value={`${detail.format === 'bo5' ? 'BO5 (thắng 3 trong 5 ván)' : 'BO3 (thắng 2 trong 3 ván)'} - 21 điểm - giới hạn 30`} />
      </div>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-3 border-t border-line pt-4">
        <div>
          <p className="font-semibold text-ink-900">Lượt đặt sân gốc - {detail.venue.name} - {detail.court.name}</p>
          <p className="text-sm text-ink-600">{detail.venue.address}</p>
          <p className="text-sm text-ink-600">{formatDateTimeVi(detail.startAt)} - {formatDateTimeVi(detail.endAt)}</p>
          <p className="mt-1 text-xs text-ink-500">Tên sân, địa chỉ và khung giờ lấy trực tiếp từ lượt đặt sân.</p>
        </div>
        {detail.bookingPrice && (
          <div className="text-right"><p className="text-xs text-ink-500">Tiền sân</p><p className="text-figures font-bold text-brand-navy">{formatMoneyVnd(detail.bookingPrice)}</p></div>
        )}
      </div>
    </SurfaceCard>
  );
}

function PlayerCard({ participant, amount, paidBooking, locked }: { participant: MatchParticipant; amount: string | null; paidBooking: boolean; locked: boolean }) {
  return (
    <div className="rounded-2xl border border-line p-3">
      <div className="flex items-center gap-3">
        <Avatar label={participant.displayName} src={participant.avatarUrl} alt={`Ảnh đại diện ${participant.displayName}`} className="h-10 w-10" />
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink-900">{participant.displayName}{participant.role === 'organizer' && <Badge tone="warning" className="ml-2">Chủ kèo</Badge>}</p>
          <p className="text-xs text-ink-500">Đội {participant.teamSide}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-2 text-sm">
        <span className={participant.paymentState === 'paid' ? 'text-success' : 'text-warning'}>
          {participant.role === 'organizer' && paidBooking
            ? 'Dùng từ lượt đặt sân đã thanh toán - không trả thêm'
            : participant.paymentState === 'paid' ? (locked ? 'Đã đóng - kèo đã chốt' : 'Đã đóng - có thể rút trước hạn chốt') : 'Đang giữ chỗ - chờ thanh toán'}
        </span>
        {amount && <span className="text-figures font-semibold">{formatMoneyVnd(amount)}</span>}
      </div>
    </div>
  );
}

export function TeamRoster({ detail, onJoin }: { detail: MatchDetail; onJoin: (side: TeamSide) => void }) {
  const participants = detail.participants ?? [];
  const funding = detail.funding;
  const amountOf = (participant: MatchParticipant) =>
    participant.role === 'organizer' ? funding?.organizerContribution ?? null : funding?.regularSlotAmount ?? null;
  const filled = detail.capacity - detail.openSlots;
  // Sau hạn chốt kèo không còn rút được (BR-CM-07).
  const locked = !['awaiting_deposit', 'open', 'filled'].includes(detail.status) || new Date(detail.cutoffAt).getTime() <= Date.now();
  return (
    <SurfaceCard>
      <div className="flex items-center justify-between gap-3">
        <div><h2 className="text-h3">Người chơi và phần tiền kèo</h2><p className="text-sm text-ink-500">Mỗi người chọn đội trước khi đóng phần của mình.</p></div>
        <Badge tone={detail.openSlots <= 0 ? 'success' : 'neutral'}>{`${filled}/${detail.capacity} người`}</Badge>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {(['A', 'B'] as const).map((side) => {
          const members = participants.filter((participant) => participant.teamSide === side);
          const open = detail.teamSlots?.find((slot) => slot.side === side)?.open ?? 0;
          const canJoin = side === 'A' ? detail.actions.canJoinTeamA : detail.actions.canJoinTeamB;
          return (
            <section key={side} aria-label={`Đội ${side}`} className="space-y-3">
              <h3 className="text-sm font-bold text-ink-700">Đội {side}</h3>
              {members.map((participant) => <PlayerCard locked={locked} key={participant.userId} participant={participant} amount={amountOf(participant)} paidBooking={detail.sourceType === 'paid_booking'} />)}
              {Array.from({ length: open }, (_, index) => (
                <div key={index} className="flex items-center justify-between gap-3 rounded-2xl border-2 border-dashed border-line p-3">
                  <span className="text-sm text-ink-500">Còn trống</span>
                  {canJoin && <Button size="sm" onClick={() => onJoin(side)}>{`Vào đội ${side}`}</Button>}
                </div>
              ))}
            </section>
          );
        })}
      </div>
    </SurfaceCard>
  );
}

function StatusRow({ label, hint, value, badge }: { label: string; hint?: string; value: string; badge?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div><p className="text-sm text-ink-900">{label}</p>{hint && <p className="text-xs text-ink-500">{hint}</p>}</div>
      <div className="text-right"><p className="text-figures font-bold text-brand-navy">{formatMoneyVnd(value)}</p>{badge}</div>
    </div>
  );
}

/** Tình trạng tiền kèo; mọi số do backend tính trong `funding`. */
export function MoneyStatus({ detail, resultFinal = false }: { detail: MatchDetail; resultFinal?: boolean }) {
  const funding = detail.funding;
  if (!funding) return null;
  const paidBooking = detail.sourceType === 'paid_booking';
  return (
    <section className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
      <div className="bg-brand-navy p-4 text-surface">
        <h2 className="text-lg font-bold">Tình trạng tiền kèo</h2>
        <p className="mt-1 text-sm opacity-90">Khoản đã trả, đang giữ và sẽ được hoàn khi kèo được chốt.</p>
      </div>
      <div className="divide-y divide-line p-4">
        <div className="pb-2">
          <p className="text-xs font-semibold text-ink-500">Hiện tại</p>
          <StatusRow label={paidBooking ? 'Tiền sân của lượt đặt sân' : 'Giá sân'} hint={paidBooking ? 'Đã ghi nhận trước khi tạo kèo' : undefined} value={funding.bookingPrice} />
          <StatusRow label="Phần mỗi người tham gia" value={funding.regularSlotAmount} />
          {funding.viewerAdditionalAmountDue !== null && <StatusRow label="Bạn cần trả thêm" value={funding.viewerAdditionalAmountDue} />}
        </div>
        <div className="pt-2">
          <p className="text-xs font-semibold text-ink-500">Khi kèo được chốt hợp lệ</p>
          {funding.organizerRefundAtLock !== null && paidBooking && (
            <StatusRow label="Hoàn cho chủ kèo" hint="Phần lượt đặt sân đã trả cao hơn mức cần góp" value={funding.organizerRefundAtLock}
              badge={funding.organizerRefundWithdrawable ? <Badge tone="success">Có thể rút</Badge> : undefined} />
          )}
          <StatusRow label="Giữ chờ kết quả" hint={resultFinal ? 'Kết quả đã có hiệu lực' : 'Chỉ xử lý sau khi kết quả có hiệu lực'} value={funding.resultHeldAmount}
            badge={resultFinal ? <Badge tone="success">Đã xử lý</Badge> : <Badge tone="warning">Đang giữ</Badge>} />
          {paidBooking && <StatusRow label="Tiền sân ghi nhận thêm" value="0" />}
        </div>
      </div>
    </section>
  );
}
