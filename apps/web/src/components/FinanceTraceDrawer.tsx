import { Badge, Button } from './ui.js';
import { formatDateTimeVi, formatMoneyVnd } from '../lib/formatters.js';
import type { ProviderTransparencyRow } from '../lib/financeApi.js';

const statusLabel = { pending: 'Chờ đủ 24 giờ', available: 'Có thể rút', disputed: 'Đang xem xét', cancelled: 'Đã hủy' } as const;

export function FinanceTraceDrawer({ row, admin = false, onClose }: { row: ProviderTransparencyRow | null; admin?: boolean; onClose: () => void }) {
  if (!row) return null;
  const paymentLabel = row.payment?.provider ?? 'Thông tin thanh toán chưa có';
  return <div className="fixed inset-0 z-[120] flex justify-end bg-brand-navy/40" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <aside role="dialog" aria-modal="true" aria-label="Hành trình dòng tiền" className="h-full w-full max-w-2xl overflow-y-auto bg-surface shadow-[var(--shadow-raised)]">
      <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line bg-surface px-5 py-5 sm:px-7">
        <div><p className="courtin-kicker">Hành trình dòng tiền</p><h3 className="mt-1 text-h2">Booking {row.bookingCode ?? 'Chưa có mã'}</h3><Badge tone={row.status === 'available' ? 'success' : row.status === 'disputed' ? 'danger' : 'warning'}>{statusLabel[row.status]}</Badge></div>
        <Button tone="ghost" size="sm" onClick={onClose}>Đóng</Button>
      </header>
      <div className="space-y-6 p-5 sm:p-7">
        <section className="grid gap-3 sm:grid-cols-3">
          <Money label="Khách thanh toán" value={row.gross} color="text-brand-navy" />
          <Money label="Phí nền tảng" value={row.commission} color="text-warning" />
          <Money label="Chủ sân nhận" value={row.net} color="text-success" />
        </section>
        <section className="space-y-0" aria-label="Các bước của dòng tiền">
          <Step title={`Khách thanh toán ${formatMoneyVnd(row.gross)}`} detail={row.payment ? `${paymentLabel}${row.payment.providerReference ? ` · Mã ${row.payment.providerReference}` : ''}${row.payment.confirmedAt ? ` · xác nhận ${formatDateTimeVi(row.payment.confirmedAt)}` : ''}` : 'Hệ thống chưa có thông tin kênh thanh toán cho giao dịch cũ.'} tone="bg-info-bg text-info" />
          <Step title="Phân bổ doanh thu" detail={`${formatMoneyVnd(row.gross)} = ${formatMoneyVnd(row.commission)} phí nền tảng + ${formatMoneyVnd(row.net)} tiền chủ sân.`} tone="bg-brand-yellow/30 text-warning" />
          <Step title="Chờ hết thời hạn xem xét" detail={`Booking kết thúc ${formatDateTimeVi(row.endAt)}. Tiền dự kiến có thể rút từ ${formatDateTimeVi(row.releaseAt)} nếu không có tranh chấp.`} tone="bg-warning-bg text-warning" />
          {row.releasedAt ? <Step title="Tiền đã có thể rút" detail={`${formatMoneyVnd(row.net)} đã chuyển sang số dư có thể rút lúc ${formatDateTimeVi(row.releasedAt)}.`} tone="bg-success-bg text-success" last /> : <Step title="Tiền chưa thể rút" detail={row.status === 'disputed' ? 'Khoản này đang được xem xét riêng; các booking khác không bị giữ.' : 'Hệ thống sẽ tự cập nhật khi đủ thời hạn.'} tone="bg-canvas text-ink-500" last />}
        </section>
        <p className="rounded-xl border border-line bg-canvas p-4 text-sm leading-6 text-ink-500">Một lần rút tiền có thể gồm doanh thu từ nhiều booking. Vì vậy lịch sử rút tiền được hiển thị riêng, tránh gán sai một lần chuyển ngân hàng cho booking này.</p>
        {admin ? <details className="rounded-xl border border-line p-4 text-sm"><summary className="cursor-pointer font-bold text-brand-navy">Thông tin hỗ trợ kiểm tra</summary><dl className="mt-3 grid gap-2 text-ink-500"><div><dt className="font-semibold text-ink-900">Mã booking</dt><dd className="break-all">{row.bookingCode ?? 'Chưa có mã'}</dd></div><div><dt className="font-semibold text-ink-900">Trạng thái đối soát</dt><dd>{row.payment?.reconciliationStatus ?? 'Chưa có dữ liệu'}</dd></div></dl></details> : null}
      </div>
    </aside>
  </div>;
}

function Money({ label, value, color }: { label: string; value: string; color: string }) {
  return <div className="rounded-2xl bg-canvas p-4"><p className="text-caption text-ink-500">{label}</p><strong className={`text-figures mt-1 block text-lg ${color}`}>{formatMoneyVnd(value)}</strong></div>;
}

function Step({ title, detail, tone, last = false }: { title: string; detail: string; tone: string; last?: boolean }) {
  return <article className="relative grid grid-cols-[2.5rem_1fr] gap-3 pb-5"><div className="relative flex justify-center"><span className={`relative z-10 grid h-8 w-8 place-items-center rounded-full font-bold ${tone}`}>✓</span>{!last ? <span className="absolute bottom-[-1.25rem] top-8 w-px bg-line" /> : null}</div><div><h4 className="font-bold text-brand-navy">{title}</h4><p className="mt-1 text-sm leading-6 text-ink-500">{detail}</p></div></article>;
}
