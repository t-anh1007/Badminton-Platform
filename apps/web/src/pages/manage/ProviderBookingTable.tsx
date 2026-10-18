import { Badge, Button } from '../../components/ui.js';
import { Icon } from '../../components/Icon';
import { formatDateTimeVi, formatMoneyVnd } from '../../lib/formatters.js';
import type { ProviderBookingRow } from '../../lib/venueBookingApi.js';
import { providerBookingBadgeTone, providerBookingStatusLabel } from './providerBookingView.js';

type Props = {
  rows: ProviderBookingRow[];
  onSelect: (id: string) => void;
};

const sourceLabel = (source: ProviderBookingRow['source']) => source === 'internal' ? 'Tại quầy' : 'Trực tuyến';

function StatusBadge({ row }: { row: ProviderBookingRow }) {
  return (
    <Badge tone={providerBookingBadgeTone(row.status)}>
      {providerBookingStatusLabel(row.status, row.matchDepositPaid)}
    </Badge>
  );
}

export function ProviderBookingTable({ rows, onSelect }: Props) {
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[880px] border-separate border-spacing-0 text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-ink-500">
              <th className="border-b border-line px-4 py-3 font-semibold">Booking</th>
              <th className="border-b border-line px-4 py-3 font-semibold">Khách hàng</th>
              <th className="border-b border-line px-4 py-3 font-semibold">Thời gian</th>
              <th className="border-b border-line px-4 py-3 font-semibold">Giá trị</th>
              <th className="border-b border-line px-4 py-3 font-semibold">Trạng thái</th>
              <th className="border-b border-line px-4 py-3"><span className="sr-only">Chi tiết</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="group cursor-pointer hover:bg-canvas/70" onClick={() => onSelect(row.id)}>
                <td className="border-b border-line px-4 py-4 align-top">
                  <p className="font-bold text-ink-900">{row.court.venue.name} · {row.court.name}</p>
                  <p className="text-figures mt-1 text-xs text-ink-500">{row.businessCode}</p>
                  {row.manualCustomerNotificationRequired && <p className="mt-2 rounded-xl bg-brand-yellow/20 p-3 text-sm font-semibold">Bạn cần tự thông báo cho khách</p>}
                </td>
                <td className="border-b border-line px-4 py-4 align-top">
                  <p className="font-semibold text-ink-900">{row.customer.label}</p>
                  <p className="mt-1 text-xs text-ink-500">{sourceLabel(row.source)}</p>
                </td>
                <td className="border-b border-line px-4 py-4 align-top">
                  <p>{formatDateTimeVi(row.startAt)}</p>
                  <p className="mt-1 text-xs text-ink-500">đến {formatDateTimeVi(row.endAt)}</p>
                </td>
                <td className="text-figures border-b border-line px-4 py-4 align-top font-bold text-ink-900">
                  {formatMoneyVnd(row.priceSnapshot)}
                </td>
                <td className="border-b border-line px-4 py-4 align-top"><StatusBadge row={row} /></td>
                <td className="border-b border-line px-4 py-4 text-right align-top">
                  <button
                    type="button"
                    aria-label={`Xem chi tiết lượt đặt sân ${row.businessCode}`}
                    onClick={(event) => { event.stopPropagation(); onSelect(row.id); }}
                    className="grid h-9 w-9 place-items-center rounded-full text-ink-500 group-hover:text-brand-navy"
                  >
                    <Icon name="chevronRight" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 md:hidden">
        {rows.map((row) => (
          <article key={row.id} className="rounded-2xl border border-line bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold text-brand-navy">{row.court.venue.name}</p>
                <p className="mt-1 text-sm text-ink-500">{row.court.name} · {row.businessCode}</p>
                {row.manualCustomerNotificationRequired && <p className="mt-2 rounded-xl bg-brand-yellow/20 p-3 text-sm font-semibold">Bạn cần tự thông báo cho khách</p>}
              </div>
              <StatusBadge row={row} />
            </div>
            <dl className="mt-4 grid gap-3 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-ink-500">Khách hàng</dt><dd className="text-right font-semibold">{row.customer.label}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-ink-500">Thời gian</dt><dd className="text-right">{formatDateTimeVi(row.startAt)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-ink-500">Giá trị</dt><dd className="text-figures font-bold">{formatMoneyVnd(row.priceSnapshot)}</dd></div>
            </dl>
            <Button
              tone="secondary"
              size="sm"
              className="mt-4 w-full"
              aria-label={`Xem chi tiết lượt đặt sân ${row.businessCode}`}
              onClick={() => onSelect(row.id)}
            >
              Xem chi tiết
            </Button>
          </article>
        ))}
      </div>
    </>
  );
}
