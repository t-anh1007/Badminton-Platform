import { useEffect, useRef, useState } from 'react';
import { SelectInput } from './ui.js';
import { FinanceFlows, type FlowPlace, type FlowTabConfig } from './FinanceFlows.js';
import { getAdminVenueOptions } from '../lib/venueBookingApi.js';
import { getAdminFinancialFlows, getAdminFlowLedger, type FlowLedgerEntry, type FlowTab } from '../lib/financeApi.js';
import { getAdminAccountIdentities, getAdminAccounts } from '../lib/accountApi.js';

const TABS: Array<FlowTabConfig<FlowTab>> = [
  { key: 'revenue', label: 'Doanh thu đặt sân', forCards: 'Doanh thu đặt sân (tổng khách trả, phần chủ sân) · Biểu đồ theo tháng · Top chủ sân', cols: ['Booking', 'Chủ sân nhận', 'Người trả', 'Trạng thái', 'Khách trả'], chips: [['', 'Tất cả'], ['pending', 'Chờ 24 giờ'], ['available', 'Có thể rút'], ['cancelled', 'Đã hủy']], searchHint: 'Mã booking BK-…, tên hoặc email chủ sân' },
  { key: 'platform', label: 'Phí nền tảng', forCards: 'Doanh thu đặt sân › Phí nền tảng · Tiền đang giữ › Nền tảng · doanh thu', cols: ['Khoản', 'Ảnh hưởng', 'Số lần', 'Cộng / trừ', 'Số tiền'], chips: [['source', 'Theo nguồn'], ['owner', 'Theo chủ sân']], searchHint: 'Tên hoặc email chủ sân (xem theo chủ sân)' },
  { key: 'refund', label: 'Hoàn tiền', forCards: 'Doanh thu đặt sân › Đã hoàn lại khách', cols: ['Booking / kèo', 'Người nhận', 'Lý do', 'Loại', 'Số tiền'], chips: [['', 'Tất cả lý do'], ['booking', 'Hủy booking'], ['dispute', 'Tranh chấp'], ['match', 'Kèo']], searchHint: 'Mã booking BK-…, mã tranh chấp KN-…, tên người nhận' },
  { key: 'topup', label: 'Nạp ví', forCards: 'Tiền đang giữ › Người chơi · số dư ví (nguồn nạp) · Thanh ngân hàng › Tiền vào', cols: ['Giao dịch', 'Người nhận', 'Loại', 'Trạng thái', 'Số tiền'], chips: [['', 'Tất cả'], ['topup', 'Nạp ví'], ['late', 'Về muộn'], ['over', 'Chuyển thừa'], ['partial', 'Chuyển thiếu'], ['manual', 'Admin gán tay']], searchHint: 'Mã giao dịch GD-…, nội dung chuyển khoản, tên người nạp' },
  { key: 'match', label: 'Kèo', forCards: 'Tiền đang giữ › Nền tảng · ký quỹ kèo · Người chơi · đang giữ, thắng kèo', cols: ['Kèo', 'Người tham gia', 'Sân / booking', 'Trạng thái', 'Đang giữ'], chips: [['', 'Tất cả'], ['holding', 'Đang giữ ký quỹ'], ['settled', 'Đã tất toán'], ['result', 'Chờ kết quả'], ['cancelled', 'Đã hủy']], searchHint: 'Mã kèo, mã booking BK-…, tên người chơi' },
  { key: 'withdraw', label: 'Rút tiền', forCards: 'Tiền chi ra ngân hàng › Rút tiền đã chi, đang chờ chi · Chủ sân · đang giữ cho yêu cầu rút', cols: ['Mã chuyển khoản', 'Người rút', 'Tài khoản nhận', 'Trạng thái', 'Số tiền'], chips: [['paid', 'Đã chi'], ['pending', 'Chờ chi'], ['rejected', 'Bị từ chối']], searchHint: 'Mã chuyển khoản, tên người rút, số tài khoản' },
  { key: 'reward', label: 'Thưởng giải', forCards: 'Tiền chi ra ngân hàng › Thưởng giải đã trả, chờ trả', cols: ['Chương trình', 'Người nhận', 'Tài khoản nhận', 'Trạng thái', 'Số tiền'], chips: [['', 'Tất cả'], ['pending', 'Chờ trả'], ['paid', 'Đã trả'], ['cancelled', 'Đã hủy']], searchHint: 'Tên chương trình, tên người nhận, mã tham chiếu' },
  { key: 'wallets', label: 'Số dư ví', forCards: 'Tiền đang giữ trong hệ thống (chủ sân, người chơi, nền tảng)', cols: ['Chủ ví', 'Chi tiết', 'Đang giữ', 'Ghi chú', 'Khả dụng'], chips: [['owner', 'Chủ sân'], ['player', 'Người chơi'], ['platform', 'Nền tảng']], searchHint: 'Tên hoặc email chủ ví', note: 'Số dư ví luôn là số hiện tại, không phụ thuộc kỳ xem.' },
  { key: 'bank', label: 'Giao dịch ngân hàng', forCards: 'Thanh ngân hàng: Tiền vào, Tiền ra, Đã có đối ứng, Chênh lệch cần xử lý', cols: ['Giao dịch', 'Khớp với', 'Của ai', 'Đối soát', 'Số tiền'], chips: [['', 'Tất cả'], ['in', 'Tiền vào'], ['out', 'Tiền ra'], ['matched', 'Đã khớp'], ['unmatched', 'Cần xử lý']], searchHint: 'Mã giao dịch GD-…, nội dung chuyển khoản, mã booking BK-…' },
];
const USER_TOKEN = /@user:([0-9a-f-]{36})/g;
const walletLabel = { personal: 'Ví người chơi', business: 'Ví chủ sân', platform: 'Ví nền tảng' } as const;

export type FlowNav = { tab: FlowTab; ownerId?: string; nonce: number };

/** Chi tiết dòng tiền cho admin: 9 loại; tên/email được tra ra tài khoản để tìm và hiển thị. */
export function AdminFinanceFlows({ nav, owners }: { nav: FlowNav; owners: Array<{ id: string; name: string }> }) {
  const [ownerId, setOwnerId] = useState(nav.ownerId ?? '');
  const [names, setNames] = useState<Map<string, string>>(() => new Map());
  const [places, setPlaces] = useState<FlowPlace[]>([]);
  useEffect(() => { void getAdminVenueOptions().then(setPlaces).catch(() => setPlaces([])); }, []);
  const known = useRef(names); known.current = names;
  const lastNonce = useRef(nav.nonce);
  if (nav.nonce !== lastNonce.current) { lastNonce.current = nav.nonce; if ((nav.ownerId ?? '') !== ownerId) setOwnerId(nav.ownerId ?? ''); }

  const remember = async (ids: string[]) => {
    const missing = [...new Set(ids)].filter((id) => !known.current.has(id));
    if (!missing.length) return;
    const identities = await getAdminAccountIdentities(missing).catch(() => []);
    setNames((current) => new Map([...current, ...identities.map((row) => [row.id, row.displayName || row.email || row.businessCode || row.id] as [string, string])]));
  };
  const text = (value: string) => value.replace(USER_TOKEN, (_, id: string) => names.get(id) ?? `Tài khoản #${id.slice(0, 8)}`);

  return <FinanceFlows
    tabs={TABS} nav={nav} reloadKey={ownerId} text={text} places={places} placeTabs={['revenue', 'platform', 'refund', 'match', 'bank']}
    load={async (query) => {
      const accounts = query.q.length >= 2 ? await getAdminAccounts({ query: query.q }).catch(() => []) : [];
      const result = await getAdminFinancialFlows({ ...query, ownerId: query.tab === 'revenue' ? ownerId : undefined, userIds: accounts.map((account) => account.id).join(',') });
      await remember([...JSON.stringify(result.items).matchAll(USER_TOKEN)].map((match) => match[1]!));
      return result;
    }}
    loadLedger={async (refIds) => { const entries = await getAdminFlowLedger(refIds); await remember(entries.flatMap((entry) => entry.userId ? [entry.userId] : [])); return entries; }}
    walletName={(entry: FlowLedgerEntry) => `${walletLabel[entry.walletType]}${entry.userId && entry.walletType !== 'platform' ? ` · ${names.get(entry.userId) ?? `#${entry.userId.slice(0, 8)}`}` : ''}`}
    toolbar={(tab) => tab === 'revenue' ? <label className="ml-auto flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-ink-500">Chủ sân<SelectInput aria-label="Lọc chủ sân" value={ownerId} onChange={(event) => setOwnerId(event.target.value)}><option value="">Tất cả chủ sân</option>{[...owners, ...(ownerId && !owners.some((owner) => owner.id === ownerId) ? [{ id: ownerId, name: names.get(ownerId) ?? `Chủ sân #${ownerId.slice(0, 8)}` }] : [])].map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}</SelectInput></label> : null}
  />;
}
