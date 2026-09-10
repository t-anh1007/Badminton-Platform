import { Button } from '../../components/ui';
import { formatMoneyVnd } from '../../lib/formatters.js';
import type { FinanceRealtimeStatus } from './useFinanceRealtime.js';

export function FinanceOverview({
  available, pending, todayNet, todayCount, activeWithdrawal, status, onWithdraw,
}: {
  available: string; pending: string; todayNet: string; todayCount: number;
  activeWithdrawal: { transferCode: string; amount: string } | null;
  status: FinanceRealtimeStatus; onWithdraw: () => void;
}) {
  const statusLabel = status === 'live' ? 'Đang cập nhật trực tiếp' : status === 'connecting' ? 'Đang kết nối trực tiếp' : 'Đang kết nối lại';
  return <section className="overflow-hidden rounded-2xl bg-brand-navy p-6 text-white shadow-[var(--shadow-raised)] sm:p-8" aria-label="Tổng quan tài chính">
    <div className="grid gap-7 lg:grid-cols-[1.08fr_1fr] lg:items-end">
      <div>
        <p className="text-sm text-white/70">Số dư có thể rút</p>
        <p className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl text-figures">{formatMoneyVnd(available)}</p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button onClick={onWithdraw} className="bg-brand-yellow text-brand-navy hover:bg-brand-yellow/90">Rút tiền</Button>
          <span className="text-xs text-white/70">Tối thiểu {formatMoneyVnd(10_000n)}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 border-t border-white/20 pt-6 lg:border-l lg:border-t-0 lg:pl-7 lg:pt-0">
        <Metric label="Doanh thu hôm nay" value={`+${formatMoneyVnd(todayNet)}`} detail={`${todayCount} lượt đặt sân`} />
        <Metric label="Đang chờ 24 giờ" value={formatMoneyVnd(pending)} detail="Sẽ tự chuyển khi đủ hạn" />
        <Metric label="Yêu cầu đang xử lý" value={activeWithdrawal ? formatMoneyVnd(activeWithdrawal.amount) : 'Không có'} detail={activeWithdrawal ? activeWithdrawal.transferCode : 'Bạn có thể rút khi cần'} />
        <p className="self-end text-xs text-white/70" role="status"><span aria-hidden="true">{status === 'live' ? '●' : '○'} </span>{statusLabel}</p>
      </div>
    </div>
  </section>;
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div><p className="text-xs text-white/65">{label}</p><p className="mt-1 text-lg font-semibold text-figures">{value}</p><p className="mt-1 text-xs text-white/60">{detail}</p></div>;
}
