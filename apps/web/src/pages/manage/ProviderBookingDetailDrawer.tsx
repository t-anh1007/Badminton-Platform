import { useEffect, useId, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Skeleton } from '../../components/ui.js';
import { formatDateTimeVi, formatMoneyVnd } from '../../lib/formatters.js';
import type { ProviderBookingDetail } from '../../lib/venueBookingApi.js';
import { providerBookingBadgeTone, providerBookingStatusLabel } from './providerBookingView.js';
import { BookingIncidentActions } from './BookingIncidentActions.js';
import { Icon } from '../../components/Icon';

type Props = {
  bookingId: string | null;
  detail: ProviderBookingDetail | null;
  loading: boolean;
  error: string;
  onClose: () => void;
  onRetry: () => void;
  onChanged?: () => Promise<void> | void;
};

const cancellationLabels = {
  self: 'Khách hàng hủy',
  provider_fault: 'Cơ sở hủy',
  platform_admin: 'Nền tảng hủy',
} as const;

export function ProviderBookingDetailDrawer({ bookingId, detail, loading, error, onClose, onRetry, onChanged }: Props) {
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
        aria-label="Chi tiết lượt đặt sân"
        className="absolute inset-y-0 right-0 w-[min(100%,30rem)] overflow-y-auto border-l border-line bg-surface p-5 shadow-[var(--shadow-raised)] sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-figures text-xs text-ink-500">{detail?.businessCode ?? 'Lượt đặt sân'}</p>
            <h2 id={titleId} className="mt-1 text-h3 !text-2xl">{detail ? `${detail.court.venue.name} · ${detail.court.name}` : 'Chi tiết lượt đặt sân'}</h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label="Đóng chi tiết lượt đặt sân"
            onClick={onClose}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-500 hover:bg-canvas hover:text-brand-navy"
          >
            <Icon name="close" />
          </button>
        </div>

        {loading ? <Skeleton className="mt-5 h-72" /> : error ? (
          <div className="mt-5 rounded-2xl bg-danger-bg p-4 text-sm text-danger" role="alert">
            <p>{error}</p>
            <Button className="mt-3" tone="secondary" size="sm" onClick={onRetry}>Thử lại chi tiết</Button>
          </div>
        ) : detail ? (
          <div className="mt-4 grid gap-4">
            <Badge className="w-fit" tone={providerBookingBadgeTone(detail.status)}>{providerBookingStatusLabel(detail.status, detail.matchDepositPaid)}</Badge>
            {detail.manualCustomerNotificationRequired && <p className="rounded-xl bg-brand-yellow/20 p-3 text-sm font-semibold">Bạn cần tự thông báo cho khách</p>}
            <dl className="text-sm">
              {([
                ['Thời gian', `${formatDateTimeVi(detail.startAt)} – ${formatDateTimeVi(detail.endAt)}`],
                ['Khách', detail.customer.label],
                ['Nguồn', detail.source === 'internal' ? 'Tại quầy' : 'Đặt qua COURTIN'],
                ['Thanh toán', `${formatMoneyVnd(detail.priceSnapshot)}${detail.matchDepositPaid ? ' · đã nhận cọc kèo' : ''}`],
                ...(detail.courtChangedAt ? [['Đổi sân lúc', formatDateTimeVi(detail.courtChangedAt)]] : []),
                ...(detail.cancellationReason ? [['Hủy bởi', cancellationLabels[detail.cancellationReason]]] : []),
                ...(detail.cancellationRefundPercent !== null && detail.cancellationReason ? [['Mức hoàn', `${detail.cancellationRefundPercent}%`]] : []),
              ] as Array<[string, string]>).map(([label, value]) => <div key={label} className="flex justify-between gap-6 border-t border-line py-2.5"><dt className="text-ink-500">{label}</dt><dd className="text-right font-semibold text-ink-900">{value}</dd></div>)}
              {detail.source === 'internal' && detail.customer.guestContact ? <div className="flex justify-between gap-6 border-t border-line py-2.5"><dt className="text-ink-500">Liên hệ</dt><dd><a className="font-semibold text-brand-navy underline" href={`tel:${detail.customer.guestContact}`}>{detail.customer.guestContact}</a></dd></div> : null}
            </dl>
            <Link className="w-fit text-sm font-semibold text-brand-navy hover:underline" to="/manage?tab=transactions">Xem dòng tiền →</Link>
            {detail.status === 'confirmed' && new Date(detail.endAt).getTime() > Date.now() && <BookingIncidentActions key={detail.id} bookingId={detail.id} onDone={async () => { await onChanged?.(); }} />}
          </div>
        ) : null}
      </aside>
    </div>
  );
}
