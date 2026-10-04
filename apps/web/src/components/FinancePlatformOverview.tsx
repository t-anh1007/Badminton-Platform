import { formatMoneyVnd } from '../lib/formatters.js';
import type { AdminTransparencyResult } from '../lib/financeApi.js';
import { MoneyBreakdown } from './MoneyBreakdown.js';
import { RevenueColumns, RevenueRanking } from './RevenueCharts.js';

export function FinancePlatformOverview({ data, ownerNames, onPickOwner }: { data: AdminTransparencyResult; ownerNames?: Map<string, string>; onPickOwner?: (ownerId: string) => void }) {
  const s = data.summary;
  const balanced = s.difference === '0';
  return <div className="grid gap-5">
    <section className="rounded-2xl bg-brand-navy p-5 text-surface shadow-[var(--shadow-raised)] sm:p-6"><div className="grid gap-4 md:grid-cols-[1fr_1fr_1fr_1.2fr] md:items-center"><Metric label="Tiền vào ngân hàng" value={s.bankIn ?? '0'} /><Metric label="Tiền ra ngân hàng" value={s.bankOut ?? '0'} /><Metric label="Đã có đối ứng trong hệ thống" value={s.allocatedMovement} /><div className={`rounded-xl border p-4 ${balanced ? 'border-success/40 bg-success/15' : 'border-danger/40 bg-danger/15'}`}><p className="text-xs text-surface/70">Chênh lệch cần xử lý</p><p className={`text-figures mt-1 text-2xl font-bold ${balanced ? 'text-brand-yellow' : 'text-surface'}`}>{formatMoneyVnd(s.difference)} {balanced ? '✓' : ''}</p><p className="mt-1 text-xs text-surface/70">Giao dịch ngân hàng chưa gán vào nghiệp vụ nào</p></div></div></section>
    <div className="grid gap-5 xl:grid-cols-2">
      <MoneyBreakdown title="Doanh thu đặt sân" totalLabel="Tổng khách đã trả" note="Mỗi đồng khách trả được chia thành: phần chủ sân, phí nền tảng hoặc tiền đã hoàn lại khách." parts={[
        { label: 'Phần chủ sân', value: s.bookingNet ?? '0', color: 'bg-success' },
        { label: 'Phí nền tảng', value: s.bookingCommission ?? '0', color: 'bg-brand-navy' },
        { label: 'Đã hoàn lại khách', value: s.bookingRefunded ?? '0', color: 'bg-danger', detail: 'Vào số dư ví người chơi' },
      ]} />
      <MoneyBreakdown title="Tiền chi ra ngân hàng" totalLabel="Tổng đã chi và chờ chi" note="Rút tiền của chủ sân/người chơi và tiền thưởng giải đấu." parts={[
        { label: 'Rút tiền đã chi', value: s.paidPayout, color: 'bg-success' },
        { label: 'Rút tiền đang chờ chi', value: s.reservedPayout, color: 'bg-warning' },
        { label: 'Thưởng giải đã trả', value: s.rewardPaid ?? '0', color: 'bg-brand-navy' },
        { label: 'Thưởng giải chờ trả', value: s.rewardPending ?? '0', color: 'bg-brand-yellow' },
      ]} />
    </div>
    <MoneyBreakdown title="Tiền đang giữ trong hệ thống" totalLabel="Tổng số dư các ví" note="Số dư hiện tại của mọi ví — đây là tiền nền tảng đang giữ hộ chủ sân, người chơi và phần của nền tảng." parts={[
      { label: 'Chủ sân · chờ đủ 24 giờ', value: s.ownerPending, color: 'bg-warning' },
      { label: 'Chủ sân · có thể rút', value: s.ownerAvailable, color: 'bg-success' },
      { label: 'Chủ sân · đang giữ cho yêu cầu rút', value: s.ownerReserved ?? '0', color: 'bg-success/40' },
      { label: 'Người chơi · số dư ví', value: s.playerAvailable ?? '0', color: 'bg-brand-yellow', detail: 'Tiền nạp, tiền hoàn, tiền thắng kèo' },
      { label: 'Người chơi · đang giữ', value: s.playerReserved ?? '0', color: 'bg-brand-yellow/50' },
      { label: 'Nền tảng · doanh thu', value: s.platformRevenue, color: 'bg-brand-navy' },
      { label: 'Nền tảng · ký quỹ kèo đang giữ', value: s.platformReserved ?? '0', color: 'bg-brand-navy/40' },
    ]} />
    {data.byMonth ? <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr] xl:items-start">
      <RevenueColumns title="Doanh thu đặt sân theo tháng" keyHeader="Tháng" points={data.byMonth} labelOf={(key) => `${key.slice(5, 7)}/${key.slice(0, 4)}`} />
      <RevenueRanking title="Chủ sân có doanh thu cao nhất" keyHeader="Chủ sân" points={data.byOwner ?? []} labelOf={(key) => ownerNames?.get(key) ?? 'Chưa rõ chủ sân'} onPick={onPickOwner} />
    </div> : null}
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-surface/70">{label}</p><p className="text-figures mt-1 text-2xl font-bold">{formatMoneyVnd(value)}</p></div>; }
