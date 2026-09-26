import { formatMoneyVnd } from '../lib/formatters.js';
import type { RevenueSeriesPoint } from '../lib/financeApi.js';

// Thứ tự cố định, màu đã chạy validator dataviz (CVD ΔE ≥ 16): chủ sân · phí · đã hoàn.
const SEGMENTS = [
  { field: 'net', label: 'Chủ sân nhận', color: 'bg-success' },
  { field: 'commission', label: 'Phí nền tảng', color: 'bg-brand-navy' },
  { field: 'refunded', label: 'Đã hoàn khách', color: 'bg-danger' },
] as const;

const big = (value: string) => { const n = BigInt(value); return n > 0n ? n : 0n; };
const share = (value: bigint, max: bigint) => max > 0n ? Number((value * 1000n) / max) / 10 : 0;
const describe = (label: string, point: RevenueSeriesPoint) =>
  `${label}: khách trả ${formatMoneyVnd(point.gross)} = chủ sân ${formatMoneyVnd(point.net)} + phí ${formatMoneyVnd(point.commission)} + đã hoàn ${formatMoneyVnd(point.refunded)} · ${point.count} booking`;

/** Hộp số tiền hiện khi rê chuột/focus vào khối, tự ẩn khi rời ra (CSS group-hover). */
function Tip({ label, point, className }: { label: string; point: RevenueSeriesPoint; className: string }) {
  return <span role="tooltip" className={`pointer-events-none absolute z-20 hidden w-56 rounded-xl bg-ink-900 p-3 text-left text-xs text-surface shadow-[var(--shadow-raised)] group-hover:block group-focus-visible:block ${className}`}>
    <span className="block font-bold">{label} · {point.count} booking</span>
    <span className="mt-1 flex justify-between"><span>Khách trả</span><span className="text-figures font-semibold">{formatMoneyVnd(point.gross)}</span></span>
    {SEGMENTS.map((segment) => <span key={segment.field} className="mt-0.5 flex items-center justify-between gap-2"><span className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-sm ${segment.color}`} />{segment.label}</span><span className="text-figures">{formatMoneyVnd(point[segment.field])}</span></span>)}
  </span>;
}

function Legend() {
  return <ul className="flex flex-wrap gap-4 text-xs text-ink-500">{SEGMENTS.map((segment) => <li key={segment.field} className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-sm ${segment.color}`} aria-hidden="true" />{segment.label}</li>)}</ul>;
}

function SeriesTable({ points, labelOf, keyHeader }: { points: RevenueSeriesPoint[]; labelOf: (key: string) => string; keyHeader: string }) {
  return <details className="mt-3 text-sm"><summary className="cursor-pointer text-xs font-semibold text-ink-500">Xem dạng bảng</summary>
    <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[560px] text-left text-xs"><thead className="text-ink-500"><tr><th className="py-1.5 pr-3">{keyHeader}</th><th className="py-1.5 pr-3 text-right">Booking</th><th className="py-1.5 pr-3 text-right">Khách trả</th><th className="py-1.5 pr-3 text-right">Chủ sân nhận</th><th className="py-1.5 pr-3 text-right">Phí</th><th className="py-1.5 text-right">Đã hoàn</th></tr></thead>
      <tbody>{points.map((point) => <tr key={point.key} className="border-t border-line text-ink-700"><td className="py-1.5 pr-3">{labelOf(point.key)}</td><td className="text-figures py-1.5 pr-3 text-right">{point.count}</td><td className="text-figures py-1.5 pr-3 text-right">{formatMoneyVnd(point.gross)}</td><td className="text-figures py-1.5 pr-3 text-right">{formatMoneyVnd(point.net)}</td><td className="text-figures py-1.5 pr-3 text-right">{formatMoneyVnd(point.commission)}</td><td className="text-figures py-1.5 text-right">{formatMoneyVnd(point.refunded)}</td></tr>)}</tbody></table></div>
  </details>;
}

/** Cột xếp chồng theo thời gian: chiều cao = khách trả, chia thành chủ sân / phí / đã hoàn. */
export function RevenueColumns({ title, points, labelOf, keyHeader }: { title: string; points: RevenueSeriesPoint[]; labelOf: (key: string) => string; keyHeader: string }) {
  const max = points.reduce((result, point) => big(point.gross) > result ? big(point.gross) : result, 0n);
  return <section className="rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow-card)]" aria-label={title}>
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-h3">{title}</h3><Legend /></div>
    {points.length === 0 ? <p className="mt-4 text-sm text-ink-500">Chưa có doanh thu trong khoảng đang xem.</p> : <>
      <div className="mt-4 flex h-44 items-end gap-1.5 border-b border-line pb-px">
        {points.map((point, index) => <button type="button" key={point.key} aria-label={describe(labelOf(point.key), point)} className="group relative flex h-full min-w-2 flex-1 flex-col justify-end focus:outline-none">
          <Tip label={labelOf(point.key)} point={point} className={`top-0 ${index < points.length / 2 ? 'left-0' : 'right-0'}`} />
          <span className="flex flex-col-reverse gap-[2px] overflow-hidden rounded-t group-hover:opacity-80 group-focus-visible:ring-2 group-focus-visible:ring-brand-navy" style={{ height: `${share(big(point.gross), max)}%` }}>
            {SEGMENTS.map((segment) => big(point[segment.field]) > 0n ? <span key={segment.field} className={segment.color} style={{ flexGrow: Number(big(point[segment.field])) }} /> : null)}
          </span>
        </button>)}
      </div>
      <div className="mt-1 flex gap-1.5 overflow-hidden text-[10px] text-ink-500">{points.map((point, index) => <span key={point.key} className="min-w-2 flex-1 truncate text-center">{index === 0 || index === points.length - 1 || points.length <= 12 ? labelOf(point.key) : ''}</span>)}</div>
      <SeriesTable points={points} labelOf={labelOf} keyHeader={keyHeader} />
    </>}
  </section>;
}

/** Xếp hạng ngang theo đối tượng (cơ sở, chủ sân): độ dài = khách trả, chia thành chủ sân / phí / đã hoàn. */
export function RevenueRanking({ title, points, labelOf, keyHeader, onPick }: { title: string; points: RevenueSeriesPoint[]; labelOf: (key: string) => string; keyHeader: string; onPick?: (key: string) => void }) {
  const max = points.reduce((result, point) => big(point.gross) > result ? big(point.gross) : result, 0n);
  return <section className="rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow-card)]" aria-label={title}>
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-h3">{title}</h3><Legend /></div>
    {points.length === 0 ? <p className="mt-4 text-sm text-ink-500">Chưa có doanh thu trong khoảng đang xem.</p> : <>
      <ul className="mt-4 grid gap-3">{points.map((point) => <li key={point.key} tabIndex={0} aria-label={describe(labelOf(point.key), point)} className="group relative rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy">
        <Tip label={labelOf(point.key)} point={point} className="bottom-full right-0 mb-1" />
        <div className="flex items-baseline justify-between gap-3 text-sm">{onPick ? <button type="button" className="truncate text-left font-semibold text-brand-navy underline-offset-2 hover:underline" onClick={() => onPick(point.key)}>{labelOf(point.key)}</button> : <span className="truncate text-ink-700">{labelOf(point.key)}</span>}<span className="text-figures shrink-0 font-semibold text-ink-900">{formatMoneyVnd(point.gross)}</span></div>
        <div className="mt-1 flex h-2.5 gap-[2px] overflow-hidden rounded-full" style={{ width: `${Math.max(share(big(point.gross), max), 1)}%` }}>
          {SEGMENTS.map((segment) => big(point[segment.field]) > 0n ? <span key={segment.field} className={segment.color} style={{ flexGrow: Number(big(point[segment.field])) }} /> : null)}
        </div>
      </li>)}</ul>
      <SeriesTable points={points} labelOf={labelOf} keyHeader={keyHeader} />
    </>}
  </section>;
}
