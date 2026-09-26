import { useEffect, useState } from 'react';
import { Badge, Pagination, SelectInput, TextInput } from './ui.js';
import { newPeriod, PeriodFilter, periodQuery, type Period } from './PeriodFilter.js';
import { formatMoneyVnd } from '../lib/formatters.js';
import { getAdminFinancialFlows, getAdminFlowLedger, type FlowLedgerEntry, type FlowResult, type FlowTab, type FlowTone } from '../lib/financeApi.js';
import { getAdminAccountIdentities, getAdminAccounts } from '../lib/accountApi.js';

const PAGE_SIZE = 5;
const TABS: Array<{ key: FlowTab; label: string; forCards: string; cols: [string, string, string, string, string]; chips: Array<[string, string]> }> = [
  { key: 'revenue', label: 'Doanh thu đặt sân', forCards: 'Doanh thu đặt sân (tổng khách trả, phần chủ sân) · Biểu đồ theo tháng · Top chủ sân', cols: ['Booking', 'Chủ sân nhận', 'Người trả', 'Trạng thái', 'Khách trả'], chips: [['', 'Tất cả'], ['pending', 'Chờ 24 giờ'], ['available', 'Có thể rút'], ['cancelled', 'Đã hủy']] },
  { key: 'platform', label: 'Phí nền tảng', forCards: 'Doanh thu đặt sân › Phí nền tảng · Tiền đang giữ › Nền tảng · doanh thu', cols: ['Khoản', 'Ảnh hưởng', 'Số lần', 'Cộng / trừ', 'Số tiền'], chips: [['source', 'Theo nguồn'], ['owner', 'Theo chủ sân']] },
  { key: 'refund', label: 'Hoàn tiền', forCards: 'Doanh thu đặt sân › Đã hoàn lại khách', cols: ['Booking / kèo', 'Người nhận', 'Lý do', 'Loại', 'Số tiền'], chips: [['', 'Tất cả lý do'], ['booking', 'Hủy booking'], ['dispute', 'Tranh chấp'], ['match', 'Kèo']] },
  { key: 'topup', label: 'Nạp ví', forCards: 'Tiền đang giữ › Người chơi · số dư ví (nguồn nạp) · Thanh ngân hàng › Tiền vào', cols: ['Giao dịch', 'Người nhận', 'Loại', 'Trạng thái', 'Số tiền'], chips: [['', 'Tất cả'], ['topup', 'Nạp ví'], ['late', 'Về muộn'], ['over', 'Chuyển thừa'], ['partial', 'Chuyển thiếu'], ['manual', 'Admin gán tay']] },
  { key: 'match', label: 'Kèo', forCards: 'Tiền đang giữ › Nền tảng · ký quỹ kèo · Người chơi · đang giữ, thắng kèo', cols: ['Kèo', 'Người tham gia', 'Sân / booking', 'Trạng thái', 'Đang giữ'], chips: [['', 'Tất cả'], ['holding', 'Đang giữ ký quỹ'], ['settled', 'Đã tất toán'], ['result', 'Chờ kết quả'], ['cancelled', 'Đã hủy']] },
  { key: 'withdraw', label: 'Rút tiền', forCards: 'Tiền chi ra ngân hàng › Rút tiền đã chi, đang chờ chi · Chủ sân · đang giữ cho yêu cầu rút', cols: ['Mã chuyển khoản', 'Người rút', 'Tài khoản nhận', 'Trạng thái', 'Số tiền'], chips: [['paid', 'Đã chi'], ['pending', 'Chờ chi'], ['rejected', 'Bị từ chối']] },
  { key: 'reward', label: 'Thưởng giải', forCards: 'Tiền chi ra ngân hàng › Thưởng giải đã trả, chờ trả', cols: ['Chương trình', 'Người nhận', 'Tài khoản nhận', 'Trạng thái', 'Số tiền'], chips: [['', 'Tất cả'], ['pending', 'Chờ trả'], ['paid', 'Đã trả'], ['cancelled', 'Đã hủy']] },
  { key: 'wallets', label: 'Số dư ví', forCards: 'Tiền đang giữ trong hệ thống (chủ sân, người chơi, nền tảng)', cols: ['Chủ ví', 'Chi tiết', 'Đang giữ', 'Ghi chú', 'Khả dụng'], chips: [['owner', 'Chủ sân'], ['player', 'Người chơi'], ['platform', 'Nền tảng']] },
  { key: 'bank', label: 'Giao dịch ngân hàng', forCards: 'Thanh ngân hàng: Tiền vào, Tiền ra, Đã có đối ứng, Chênh lệch cần xử lý', cols: ['Giao dịch', 'Khớp với', 'Của ai', 'Đối soát', 'Số tiền'], chips: [['', 'Tất cả'], ['in', 'Tiền vào'], ['out', 'Tiền ra'], ['matched', 'Đã khớp'], ['unmatched', 'Cần xử lý']] },
];
const badgeTone: Record<FlowTone, 'success' | 'warning' | 'danger' | 'neutral'> = { ok: 'success', wait: 'warning', bad: 'danger', info: 'neutral', mute: 'neutral' };
const textTone: Record<FlowTone, string> = { ok: 'text-success', wait: 'text-warning', bad: 'text-danger', info: 'text-brand-navy', mute: 'text-ink-500' };
const dotTone: Record<FlowTone, string> = { ok: 'bg-success-bg text-success', wait: 'bg-warning-bg text-warning', bad: 'bg-danger-bg text-danger', info: 'bg-canvas text-brand-navy', mute: 'bg-canvas text-ink-500' };
const USER_TOKEN = /@user:([0-9a-f-]{36})/g;
const walletLabel = { personal: 'Ví người chơi', business: 'Ví chủ sân', platform: 'Ví nền tảng' } as const;
const entryLabel: Record<string, string> = { topup: 'nạp tiền', payment: 'thanh toán', refund: 'hoàn tiền', payout: 'chuyển về ngân hàng', commission: 'phí nền tảng', release: 'doanh thu / tiền thưởng', reserve: 'giữ tiền', settlement: 'trả tiền sân từ kèo' };
const SEARCH_HINT: Record<FlowTab, string> = { revenue: 'Mã booking BK-…, tên hoặc email chủ sân', platform: 'Tên hoặc email chủ sân (xem theo chủ sân)', refund: 'Mã booking BK-…, mã tranh chấp KN-…, tên người nhận', topup: 'Mã giao dịch GD-…, nội dung chuyển khoản, tên người nạp', match: 'Mã kèo, mã booking BK-…, tên người chơi', withdraw: 'Mã chuyển khoản, tên người rút, số tài khoản', reward: 'Tên chương trình, tên người nhận, mã tham chiếu', wallets: 'Tên hoặc email chủ ví', bank: 'Mã giao dịch GD-…, nội dung chuyển khoản, mã booking BK-…' };

export type FlowNav = { tab: FlowTab; ownerId?: string; nonce: number };

/** Chi tiết dòng tiền cho admin: 9 loại, 5 dòng/trang, chọn một dòng để xem hành trình và bút toán sổ cái. */
export function AdminFinanceFlows({ nav, owners }: { nav: FlowNav; owners: Array<{ id: string; name: string }> }) {
  const [period, setPeriod] = useState<Period>(() => newPeriod('all'));
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState<{ q: string; userIds: string[] }>({ q: '', userIds: [] });
  const range = periodQuery(period);
  const [tab, setTab] = useState<FlowTab>(nav.tab);
  const [filter, setFilter] = useState(TABS.find((item) => item.key === nav.tab)!.chips[0]![0]);
  const [ownerId, setOwnerId] = useState(nav.ownerId ?? '');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<FlowResult | null>(null);
  const [selected, setSelected] = useState(0);
  const [ledger, setLedger] = useState<FlowLedgerEntry[]>([]);
  const [names, setNames] = useState<Map<string, string>>(() => new Map());
  const [error, setError] = useState('');
  const config = TABS.find((item) => item.key === tab)!;

  // Gõ xong 400ms mới tìm; tên/email được tra ra tài khoản trước khi lọc.
  useEffect(() => {
    const text = searchInput.trim();
    const timer = window.setTimeout(async () => {
      const accounts = text.length >= 2 ? await getAdminAccounts({ query: text }).catch(() => []) : [];
      setSearch({ q: text, userIds: accounts.map((account) => account.id) }); setPage(1);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  // Điều hướng từ biểu đồ (vd. bấm chủ sân ở "Top chủ sân") chọn sẵn tab và bộ lọc.
  useEffect(() => { if (!nav.nonce) return; setTab(nav.tab); setFilter(TABS.find((item) => item.key === nav.tab)!.chips[0]![0]); setOwnerId(nav.ownerId ?? ''); setPage(1); }, [nav.nonce]);
  useEffect(() => {
    let active = true;
    getAdminFinancialFlows({ tab, filter, ownerId: tab === 'revenue' ? ownerId : undefined, ...range, q: search.q, userIds: search.userIds.join(','), page, pageSize: PAGE_SIZE })
      .then(async (next) => {
        if (!active) return;
        setData(next); setSelected(0); setError('');
        const ids = new Set<string>();
        JSON.stringify(next.items).replace(USER_TOKEN, (_, id: string) => { ids.add(id); return ''; });
        const missing = [...ids].filter((id) => !names.has(id));
        if (missing.length) {
          const identities = await getAdminAccountIdentities(missing).catch(() => []);
          if (active) setNames((current) => new Map([...current, ...identities.map((row) => [row.id, row.displayName || row.email || row.businessCode || row.id] as [string, string])]));
        }
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Không thể tải chi tiết dòng tiền.'); });
    return () => { active = false; };
  }, [tab, filter, ownerId, page, range.from, range.to, search]);
  const row = data?.items[selected];
  useEffect(() => {
    if (!row?.refIds.length) { setLedger([]); return; }
    let active = true;
    getAdminFlowLedger(row.refIds).then(async (entries) => {
      if (!active) return;
      setLedger(entries);
      const missing = [...new Set(entries.map((entry) => entry.userId).filter((id): id is string => Boolean(id) && !names.has(id!)))];
      if (!missing.length) return;
      const identities = await getAdminAccountIdentities(missing).catch(() => []);
      if (active) setNames((current) => new Map([...current, ...identities.map((item) => [item.id, item.displayName || item.email || item.businessCode || item.id] as [string, string])]));
    }).catch(() => { if (active) setLedger([]); });
    return () => { active = false; };
  }, [row?.id]);

  const text = (value: string) => value.replace(USER_TOKEN, (_, id: string) => names.get(id) ?? `Tài khoản #${id.slice(0, 8)}`);
  const pickTab = (key: FlowTab) => { setTab(key); setFilter(TABS.find((item) => item.key === key)!.chips[0]![0]); setPage(1); };
  const pageCount = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return <div className="grid gap-4">
    <nav aria-label="Loại dòng tiền" className="flex flex-wrap gap-1 rounded-3xl bg-canvas p-1 ring-1 ring-line">
      {TABS.map((item) => <button key={item.key} type="button" aria-pressed={item.key === tab} onClick={() => pickTab(item.key)} className={`min-h-11 rounded-full px-4 text-sm font-bold transition ${item.key === tab ? 'bg-brand-navy text-surface' : 'text-ink-500 hover:bg-surface hover:text-brand-navy'}`}>{item.label}</button>)}
    </nav>
    <p className="text-sm text-ink-500">Chi tiết cho: <strong className="text-brand-navy">{config.forCards}</strong></p>
    <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-canvas p-3">
      <PeriodFilter value={period} onChange={(next) => { setPeriod(next); setPage(1); }} />
      <label className="grid min-w-64 flex-1 gap-1 text-xs font-bold uppercase tracking-wide text-ink-500">Tìm kiếm<TextInput type="search" aria-label="Tìm trong chi tiết dòng tiền" placeholder={SEARCH_HINT[tab]} value={searchInput} onChange={(event) => setSearchInput(event.target.value)} /></label>
      {tab === 'wallets' ? <p className="basis-full text-xs text-ink-500">Số dư ví luôn là số hiện tại, không phụ thuộc kỳ xem.</p> : null}
    </div>
    {error ? <p role="alert" className="rounded-xl bg-danger-bg p-3 text-sm text-danger">{error}</p> : null}
    {data ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{data.kpis.map((kpi) => <article key={kpi.label} className="rounded-2xl border border-line bg-surface p-4"><p className="text-caption text-ink-500">{kpi.label}</p><p className={`text-figures mt-1 text-xl font-bold ${textTone[kpi.tone]}`}>{/^-?\d+$/.test(kpi.value) ? formatMoneyVnd(kpi.value) : kpi.value}</p><p className="mt-1 text-xs text-ink-500">{kpi.note}</p></article>)}</div> : null}
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section aria-label="Danh sách giao dịch" className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="flex flex-wrap items-center gap-2 p-4">
          {config.chips.map(([key, label]) => <button key={key || 'all'} type="button" aria-pressed={key === filter} onClick={() => { setFilter(key); setPage(1); }} className={`min-h-9 rounded-full border px-4 text-xs font-bold ${key === filter ? 'border-brand-navy bg-brand-navy text-surface' : 'border-line bg-canvas text-ink-700 hover:border-brand-navy hover:text-brand-navy'}`}>{label}</button>)}
          {tab === 'revenue' ? <label className="ml-auto flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-ink-500">Chủ sân<SelectInput aria-label="Lọc chủ sân" value={ownerId} onChange={(event) => { setOwnerId(event.target.value); setPage(1); }}><option value="">Tất cả chủ sân</option>{[...owners, ...(ownerId && !owners.some((owner) => owner.id === ownerId) ? [{ id: ownerId, name: names.get(ownerId) ?? `Chủ sân #${ownerId.slice(0, 8)}` }] : [])].map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}</SelectInput></label> : null}
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
        {data ? <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3"><p className="text-sm text-ink-500">Hiển thị {data.total ? (page - 1) * PAGE_SIZE + 1 : 0}–{Math.min(page * PAGE_SIZE, data.total)} / {data.total.toLocaleString('vi-VN')} dòng</p><Pagination page={page} pageCount={pageCount} onChange={setPage} /></div> : null}
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
          <div className="border-t border-line pt-3"><p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-500">Tiền đã ghi vào các ví</p>
            {ledger.length ? <ul className="grid gap-1 text-sm">{ledger.map((entry) => <li key={entry.id} className="flex justify-between gap-3 border-b border-dashed border-line py-1.5"><span>{walletLabel[entry.walletType]}{entry.userId && entry.walletType !== 'platform' ? ` · ${names.get(entry.userId) ?? `#${entry.userId.slice(0, 8)}`}` : ''} <span className="text-ink-500">· {entryLabel[entry.type] ?? 'khoản khác'}</span></span><span className={`text-figures font-bold ${entry.amount.startsWith('-') ? 'text-danger' : 'text-success'}`}>{entry.amount.startsWith('-') ? '−' : '+'}{formatMoneyVnd(entry.amount.replace('-', ''))}</span></li>)}</ul> : <p className="text-sm text-ink-500">Không có khoản ghi ví riêng cho dòng này (số tổng hợp, chi ngoài ví hoặc đã gộp trong thanh toán đặt sân).</p>}
          </div>
        </> : <p className="text-sm text-ink-500">Chọn một dòng để xem hành trình dòng tiền.</p>}
      </aside>
    </div>
  </div>;
}
