import { useEffect, useId, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Skeleton } from '../../components/ui.js';
import { formatDateTimeVi, formatMoneyVnd } from '../../lib/formatters.js';
import type { ProviderBookingDetail } from '../../lib/venueBookingApi.js';
import { providerBookingBadgeTone, providerBookingStatusLabel } from './providerBookingView.js';

type Props = {
  bookingId: string | null;
  detail: ProviderBookingDetail | null;
  loading: boolean;
  error: string;
  onClose: () => void;
  onRetry: () => void;
};

const cancellationLabels = {
  self: 'Khách hàng hủy',
  provider_fault: 'Cơ sở hủy',
  platform_admin: 'Nền tảng hủy',
} as const;

export function ProviderBookingDetailDrawer({ bookingId, detail, loading, error, onClose, onRetry }: Props) {
  const titleId = useId();
  const drawerRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!bookingId) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusables = () => Array.from(drawerRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) ?? []);
    const timer = window.setTimeout(() => closeRef.current?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    };
  }, [bookingId]);

  if (!bookingId) return null;

  return (
    <div className="fixed inset-0 z-[1000]" role="presentation">
      <div className="absolute inset-0 bg-brand-navy/50" aria-hidden="true" onMouseDown={onClose} />
      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute inset-y-0 right-0 w-[min(100%,30rem)] overflow-y-auto border-l border-line bg-surface p-5 shadow-[var(--shadow-raised)] sm:p-6"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-caption font-bold uppercase tracking-[0.12em] text-ink-500">Thông tin vận hành</p>
            <h2 id={titleId} className="mt-1 text-h2">Chi tiết lượt đặt sân</h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label="Đóng chi tiết lượt đặt sân"
            onClick={onClose}
            className="grid h-11 w-11 place-items-center rounded-full text-2xl text-ink-500 hover:bg-canvas hover:text-brand-navy"
          >
            ×
          </button>
        </div>

        {loading ? <Skeleton className="mt-5 h-72" /> : error ? (
          <div className="mt-5 rounded-2xl bg-danger-bg p-4 text-sm text-danger" role="alert">
            <p>{error}</p>
            <Button className="mt-3" tone="secondary" size="sm" onClick={onRetry}>Thử lại chi tiết</Button>
          </div>
        ) : detail ? (
          <div className="mt-5 space-y-5">
            <section className="rounded-2xl bg-canvas p-4">
              <p className="text-caption text-ink-500">Mã đặt sân</p>
              <p className="mt-1 text-sm font-bold text-brand-navy">{detail.businessCode}</p>
              <Badge className="mt-3" tone={providerBookingBadgeTone(detail.status)}>
                {providerBookingStatusLabel(detail.status, detail.matchDepositPaid)}
              </Badge>
            </section>

            <section className="border-t border-line pt-4">
              <h3 className="text-h3">Thông tin ca đặt</h3>
              <p className="mt-2 font-semibold">{detail.court.venue.name} · {detail.court.name}</p>
              <p className="text-sm text-ink-500">{detail.court.venue.address}</p>
              {detail.manualCustomerNotificationRequired && <p className="mt-3 rounded-xl bg-brand-yellow/20 p-3 text-sm font-semibold">Bạn cần tự thông báo cho khách</p>}
              <p className="mt-3 text-sm">{formatDateTimeVi(detail.startAt)} – {formatDateTimeVi(detail.endAt)}</p>
              <p className="mt-1 text-sm text-ink-500">{detail.source === 'internal' ? 'Lượt đặt sân tại quầy' : 'Đặt qua COURTIN'}</p>
              {detail.courtChangedAt ? <p className="mt-2 text-sm text-warning">Đã đổi sân lúc {formatDateTimeVi(detail.courtChangedAt)}</p> : null}
            </section>

            <section className="border-t border-line pt-4">
              <h3 className="text-h3">Khách hàng</h3>
              <p className="mt-2 font-semibold">{detail.customer.label}</p>
              {detail.source === 'internal' && detail.customer.guestContact ? (
                <a className="mt-2 inline-block text-sm font-semibold text-brand-navy underline decoration-brand-yellow decoration-2 underline-offset-4" href={`tel:${detail.customer.guestContact}`}>
                  {detail.customer.guestContact}
                </a>
              ) : null}
            </section>

            <section className="border-t border-line pt-4">
              <h3 className="text-h3">Thanh toán</h3>
              <p className="text-figures mt-2 text-xl font-bold text-brand-navy">{formatMoneyVnd(detail.priceSnapshot)}</p>
              {detail.matchDepositPaid ? <p className="mt-1 text-sm text-success">Đã nhận đặt cọc ghép trận</p> : null}
              <Link className="mt-3 inline-block text-sm font-semibold text-brand-navy" to="/manage">
                Xem đối soát tài chính →
              </Link>
            </section>

            {detail.cancellationReason ? (
              <section className="border-t border-line pt-4">
                <h3 className="text-h3">Thông tin hủy</h3>
                <p className="mt-2 text-sm">{cancellationLabels[detail.cancellationReason]}</p>
                {detail.cancellationRefundPercent !== null ? (
                  <p className="mt-1 text-sm text-ink-500">Mức hoàn: {detail.cancellationRefundPercent}%</p>
                ) : null}
              </section>
            ) : null}
          </div>
        ) : null}
      </aside>
    </div>
  );
}
