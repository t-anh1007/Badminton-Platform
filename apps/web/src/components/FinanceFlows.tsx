import { useEffect, useState, type ReactNode } from 'react';
import { Badge, Pagination, SelectInput, TextInput } from './ui.js';
import { newPeriod, PeriodFilter, periodQuery, type Period } from './PeriodFilter.js';
import { formatMoneyVnd } from '../lib/formatters.js';
import type { FlowLedgerEntry, FlowResult, FlowTone } from '../lib/financeApi.js';

export const FLOW_PAGE_SIZE = 5;
export type FlowTabConfig<T extends string> = { key: T; label: string; forCards: string; cols: [string, string, string, string, string]; chips: Array<[string, string]>; searchHint: string; note?: string };
export type FlowQueryBase<T extends string> = { tab: T; filter: string; q: string; from?: string; to?: string; venueId?: string; courtId?: string; page: number; pageSize: number };
export type FlowPlace = { id: string; name: string; courts: Array<{ id: string; name: string }> };
/** Trang cha đẩy kỳ xem / cơ sở vào (vd. bấm một ngày trên biểu đồ); nonce đổi thì áp dụng. */
export type FlowSync = { nonce: number; period?: Period; venueId?: string };
export type FlowNavState<T extends string> = { tab: T; filter?: string; nonce: number };

const badgeTone: Record<FlowTone, 'success' | 'warning' | 'danger' | 'neutral'> = { ok: 'success', wait: 'warning', bad: 'danger', info: 'neutral', mute: 'neutral' };
const textTone: Record<FlowTone, string> = { ok: 'text-success', wait: 'text-warning', bad: 'text-danger', info: 'text-brand-navy', mute: 'text-ink-500' };
const dotTone: Record<FlowTone, string> = { ok: 'bg-success-bg text-success', wait: 'bg-warning-bg text-warning', bad: 'bg-danger-bg text-danger', info: 'bg-canvas text-brand-navy', mute: 'bg-canvas text-ink-500' };
const entryLabel: Record<string, string> = { topup: 'nạp tiền', payment: 'thanh toán', refund: 'hoàn tiền', payout: 'chuyển về ngân hàng', commission: 'phí nền tảng', release: 'doanh thu / tiền thưởng', reserve: 'giữ tiền', settlement: 'trả tiền sân từ kèo' };

/** Khung "Chi tiết dòng tiền" dùng chung cho admin và chủ sân: tab, nút lọc, kỳ xem, tìm kiếm,
 * 4 số tổng, bảng 5 dòng/trang và ngăn hành trình dòng tiền. */
export function FinanceFlows<T extends string>({ tabs, nav, load, loadLedger, reloadKey = '', toolbar, text = (value) => value, walletName, places = [], placeTabs = [], sync, initialPeriod }: {
  tabs: Array<FlowTabConfig<T>>; nav: FlowNavState<T>;
  load: (query: FlowQueryBase<T>) => Promise<FlowResult>; loadLedger: (refIds: string[]) => Promise<FlowLedgerEntry[]>;
  reloadKey?: string; places?: FlowPlace[]; placeTabs?: T[]; sync?: FlowSync; initialPeriod?: Period;
  toolbar?: (tab: T) => ReactNode; text?: (value: string) => string; walletName: (entry: FlowLedgerEntry) => string;
}) {
  const chipOf = (key: T, filter?: string) => filter ?? tabs.find((item) => item.key === key)!.chips[0]![0];
  const [period, setPeriod] = useState<Period>(() => initialPeriod ?? newPeriod('all'));
  const [venueId, setVenueId] = useState('');
  const [courtId, setCourtId] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<T>(nav.tab);
  const [filter, setFilter] = useState(chipOf(nav.tab, nav.filter));
  const [page, setPage] = useState(1);
  const [data, setData] = useState<FlowResult | null>(null);
  const [selected, setSelected] = useState(0);
  const [ledger, setLedger] = useState<FlowLedgerEntry[]>([]);
  const [error, setError] = useState('');
  const config = tabs.find((item) => item.key === tab)!;
  const { from, to } = periodQuery(period);
  const usesPlace = placeTabs.includes(tab);
  const place = places.find((item) => item.id === venueId);

  useEffect(() => { const timer = window.setTimeout(() => { setQ(searchInput.trim()); setPage(1); }, 400); return () => window.clearTimeout(timer); }, [searchInput]);
  // Điều hướng từ thẻ/biểu đồ phía trên chọn sẵn tab và nút lọc.
  useEffect(() => { if (!nav.nonce) return; setTab(nav.tab); setFilter(chipOf(nav.tab, nav.filter)); setPage(1); }, [nav.nonce]);
  useEffect(() => { if (!sync?.nonce) return; if (sync.period) setPeriod(sync.period); if (sync.venueId !== undefined) { setVenueId(sync.venueId); setCourtId(''); } }, [sync?.nonce]);
  useEffect(() => { setPage(1); }, [reloadKey, from, to, venueId, courtId]);
  useEffect(() => {
    let active = true;
    load({ tab, filter, q, from, to, venueId: usesPlace ? venueId || undefined : undefined, courtId: usesPlace ? courtId || undefined : undefined, page, pageSize: FLOW_PAGE_SIZE })
      .then((next) => { if (active) { setData(next); setSelected(0); setError(''); } })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Không thể tải chi tiết dòng tiền.'); });
    return () => { active = false; };
  }, [tab, filter, q, from, to, page, reloadKey, venueId, courtId]);
  const row = data?.items[selected];
  useEffect(() => {
    if (!row?.refIds.length) { setLedger([]); return; }
    let active = true;
    loadLedger(row.refIds).then((entries) => { if (active) setLedger(entries); }).catch(() => { if (active) setLedger([]); });
    return () => { active = false; };
  }, [row?.id]);

  const pickTab = (key: T) => { setTab(key); setFilter(chipOf(key)); setPage(1); };
  const pageCount = data ? Math.max(1, Math.ceil(data.total / FLOW_PAGE_SIZE)) : 1;

  return <div className="grid gap-4">
    <nav aria-label="Loại dòng tiền" className="flex flex-wrap gap-1 rounded-3xl bg-canvas p-1 ring-1 ring-line">
      {tabs.map((item) => <button key={item.key} type="button" aria-pressed={item.key === tab} onClick={() => pickTab(item.key)} className={`min-h-11 rounded-full px-4 text-sm font-bold transition ${item.key === tab ? 'bg-brand-navy text-surface' : 'text-ink-500 hover:bg-surface hover:text-brand-navy'}`}>{item.label}</button>)}
    </nav>
    <p className="text-sm text-ink-500">Chi tiết cho: <strong className="text-brand-navy">{config.forCards}</strong></p>
    <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-canvas p-3">
      <PeriodFilter value={period} onChange={(next) => { setPeriod(next); setPage(1); }} />
      {usesPlace && places.length ? <>
        <label className="grid gap-1 text-xs font-bold uppercase tracking-wide text-ink-500">Cơ sở<SelectInput aria-label="Lọc cơ sở trong chi tiết dòng tiền" value={venueId} onChange={(event) => { setVenueId(event.target.value); setCourtId(''); }}><option value="">Tất cả cơ sở</option>{places.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</SelectInput></label>
        <label className="grid gap-1 text-xs font-bold uppercase tracking-wide text-ink-500">Sân con<SelectInput aria-label="Lọc sân con" value={courtId} disabled={!place} onChange={(event) => setCourtId(event.target.value)}><option value="">{place ? 'Tất cả sân con' : 'Chọn cơ sở trước'}</option>{place?.courts.map((court) => <option key={court.id} value={court.id}>{court.name}</option>)}</SelectInput></label>
      </> : null}
      <label className="grid min-w-64 flex-1 gap-1 text-xs font-bold uppercase tracking-wide text-ink-500">Tìm kiếm<TextInput type="search" aria-label="Tìm trong chi tiết dòng tiền" placeholder={config.searchHint} value={searchInput} onChange={(event) => setSearchInput(event.target.value)} /></label>
      {config.note ? <p className="basis-full text-xs text-ink-500">{config.note}</p> : null}
    </div>
    {error ? <p role="alert" className="rounded-xl bg-danger-bg p-3 text-sm text-danger">{error}</p> : null}
    {data ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{data.kpis.map((kpi) => <article key={kpi.label} className="rounded-2xl border border-line bg-surface p-4"><p className="text-caption text-ink-500">{kpi.label}</p><p className={`text-figures mt-1 text-xl font-bold ${textTone[kpi.tone]}`}>{/^-?\d+$/.test(kpi.value) ? formatMoneyVnd(kpi.value) : kpi.value}</p><p className="mt-1 text-xs text-ink-500">{kpi.note}</p></article>)}</div> : null}
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section aria-label="Danh sách giao dịch" className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="flex flex-wrap items-center gap-2 p-4">
          {config.chips.map(([key, label]) => <button key={key || 'all'} type="button" aria-pressed={key === filter} onClick={() => { setFilter(key); setPage(1); }} className={`min-h-9 rounded-full border px-4 text-xs font-bold ${key === filter ? 'border-brand-navy bg-brand-navy text-surface' : 'border-line bg-canvas text-ink-700 hover:border-brand-navy hover:text-brand-navy'}`}>{label}</button>)}
          {toolbar?.(tab)}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="bg-canvas text-xs uppercase tracking-wide text-ink-500"><tr>{config.cols.map((col, index) => <th key={col} className={`px-4 py-3 ${index === 4 ? 'text-right' : ''}`}>{col}</th>)}</tr></thead>
            <tbody>{data?.items.map((item, index) => <tr key={item.id} onClick={() => setSelected(index)} className={`cursor-pointer border-t border-line align-top ${index === selected ? 'bg-info-bg/60' : 'hover:bg-canvas'}`}>
              <td className="px-4 py-3"><button type="button" className="text-left font-bold text-brand-navy" onClick={() => setSelected(index)}>{text(item.title)}</button><p className="mt-0.5 text-xs text-ink-500">{text(item.titleNote)}</p></td>
              <td className="px-4 py-3">{text(item.party)}<p className="mt-0.5 text-xs text-ink-500">{text(item.partyNote)}</p></td>
              <td className="px-4 py-3">{text(item.counterpart)}<p className="mt-0.5 text-xs text-ink-500">{text(item.counterpartNote)}</p></td>
              <td className="px-4 py-3"><Badge tone={badgeTone[item.tone]}>{item.status}</Badge></td>
              <td className={`text-figures px-4 py-3 text-right font-bold ${item.sign === '+' ? 'text-success' : item.sign === '-' ? 'text-ink-900' : 'text-brand-navy'}`}>{item.sign === '-' ? '−' : item.sign}{formatMoneyVnd(item.amount)}<p className="mt-0.5 font-sans text-xs font-normal text-ink-500">{text(item.amountNote)}</p></td>
            </tr>)}</tbody>
          </table>
        </div>
        {data && data.items.length === 0 ? <p className="border-t border-line p-6 text-center text-sm text-ink-500">Không có giao dịch phù hợp. Thử đổi bộ lọc hoặc kỳ xem.</p> : null}
        {!data && !error ? <p className="border-t border-line p-4 text-sm text-ink-500">Đang tải…</p> : null}
        {data ? <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3"><p className="text-sm text-ink-500">Hiển thị {data.total ? (page - 1) * FLOW_PAGE_SIZE + 1 : 0}–{Math.min(page * FLOW_PAGE_SIZE, data.total)} / {data.total.toLocaleString('vi-VN')} dòng</p><Pagination page={page} pageCount={pageCount} onChange={setPage} /></div> : null}
      </section>

      <aside aria-label="Hành trình dòng tiền" className="grid gap-4 rounded-2xl border border-line bg-surface p-5">
        {row ? <>
          <div><p className="courtin-kicker">Hành trình dòng tiền</p><h3 className="mt-1 text-h3">{text(row.title)}</h3><p className="text-sm text-ink-500">{text(row.titleNote)}</p></div>
          <div className="grid grid-cols-[minmax(0,1fr)_24px_minmax(0,1fr)] items-center gap-2">
            <div className="rounded-xl bg-canvas p-3"><p className="text-xs text-ink-500">TỪ</p><p className="font-bold">{text(row.from)}</p><p className="text-xs text-ink-500">{text(row.fromNote)}</p></div>
            <span aria-hidden="true" className="text-center font-bold text-brand-navy">→</span>
            <div className="rounded-xl bg-canvas p-3"><p className="text-xs text-ink-500">ĐẾN</p><p className="font-bold">{text(row.to)}</p><p className="text-xs text-ink-500">{text(row.toNote)}</p></div>
          </div>
          <ol className="grid gap-3">{row.steps.map((step, index) => <li key={index} className="grid grid-cols-[28px_1fr] gap-2"><span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-bold ${dotTone[step.tone]}`}>{index + 1}</span><div><p className="font-bold text-brand-navy">{text(step.title)}</p><p className="text-sm text-ink-500">{text(step.detail)}</p></div></li>)}</ol>
          <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-2 border-t border-line pt-3 text-sm">{row.facts.map((fact) => <div key={fact.k} className="contents"><dt className="text-ink-500">{fact.k}</dt><dd className="break-words font-semibold">{text(fact.v)}</dd></div>)}</dl>
          <div className="border-t border-line pt-3"><p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-500">Tiền đã ghi vào ví</p>
            {ledger.length ? <ul className="grid gap-1 text-sm">{ledger.map((entry) => <li key={entry.id} className="flex justify-between gap-3 border-b border-dashed border-line py-1.5"><span>{walletName(entry)} <span className="text-ink-500">· {entry.type === 'release' ? (entry.walletType === 'personal' ? 'tiền thắng kèo' : entry.walletType === 'business' ? 'doanh thu' : 'trả tiền kèo') : entryLabel[entry.type] ?? 'khoản khác'}</span></span><span className={`text-figures font-bold ${entry.amount.startsWith('-') ? 'text-danger' : 'text-success'}`}>{entry.amount.startsWith('-') ? '−' : '+'}{formatMoneyVnd(entry.amount.replace('-', ''))}</span></li>)}</ul> : <p className="text-sm text-ink-500">Không có khoản ghi ví riêng cho dòng này (số tổng hợp, chi ngoài ví hoặc đã gộp trong thanh toán đặt sân).</p>}
          </div>
        </> : <p className="text-sm text-ink-500">Chọn một dòng để xem hành trình dòng tiền.</p>}
      </aside>
    </div>
  </div>;
}
