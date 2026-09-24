import { useState } from 'react';
import { Button, Modal, TextInput } from '../../components/ui.js';
import { formatDateTimeVi, formatMoneyVnd } from '../../lib/formatters.js';
import {
  confirmOperationalShutdown, previewOperationalShutdown,
  type OperationalShutdownInput, type OperationalShutdownMode,
  type OperationalShutdownPreview, type OperationalShutdownScope,
  type OperationalShutdownStatus,
} from '../../lib/venueBookingApi.js';

const modes: Array<{ mode: OperationalShutdownMode; title: string; description: string; note: string }> = [
  { mode: 'winding_down', title: 'Ngừng nhận lịch đặt mới', description: 'Không nhận thêm lịch mới nhưng vẫn phục vụ hết những lịch đã nhận.', note: 'Không hủy lịch hiện tại' },
  { mode: 'scheduled_close', title: 'Đóng cửa từ ngày đã chọn', description: 'Các lịch bị ảnh hưởng sẽ được hủy ngay và khách được hoàn 100%.', note: 'Khách được thông báo ngay' },
  { mode: 'emergency', title: 'Ngừng hoạt động ngay do sự cố', description: 'Mọi lịch chưa kết thúc, kể cả lịch đang diễn ra, sẽ bị hủy và hoàn 100%.', note: 'Chỉ dùng khi không thể tiếp tục phục vụ' },
];

type Target = { scope: OperationalShutdownScope; id: string; label: string };
type Stage = 'choice' | 'impact' | 'confirm';

export function OperationalShutdownDialog({ target, current, onClose, onDone }: {
  target: Target;
  current: OperationalShutdownStatus | null;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [stage, setStage] = useState<Stage>('choice');
  const [mode, setMode] = useState<OperationalShutdownMode>(current?.mode === 'emergency' ? 'emergency' : current?.mode ?? 'winding_down');
  const [closeDate, setCloseDate] = useState('');
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState<OperationalShutdownPreview | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const input: OperationalShutdownInput = {
    mode,
    ...(mode === 'scheduled_close' ? { closeDate } : {}),
    ...(mode === 'emergency' ? { reason: reason.trim() } : {}),
  };
  const affectedCount = preview ? preview.affectedMarketplace + preview.affectedMatch + preview.affectedInternal : 0;
  const warning = mode === 'winding_down'
    ? 'Các lịch hiện tại vẫn được phục vụ đến hết. Không lịch nào bị hủy.'
    : mode === 'scheduled_close'
      ? 'Các lịch bị ảnh hưởng sẽ bị hủy ngay. Khách được hoàn 100% số tiền đã thanh toán. Lịch đã hủy sẽ không tự khôi phục nếu bạn đổi ngày sau này.'
      : 'Mọi lịch chưa kết thúc sẽ bị hủy ngay, kể cả lịch đang diễn ra. Khách được hoàn 100% số tiền đã thanh toán.';

  async function showImpact() {
    if (mode === 'scheduled_close' && !closeDate) return setError('Vui lòng chọn ngày đóng cửa.');
    if (mode === 'emergency' && !reason.trim()) return setError('Vui lòng cho biết lý do sự cố.');
    setBusy(true); setError('');
    try {
      setPreview(await previewOperationalShutdown(target.scope, target.id, input));
      setStage('impact');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể xem ảnh hưởng.');
    } finally { setBusy(false); }
  }

  async function confirm() {
    if (!preview || !acknowledged) return;
    setBusy(true); setError('');
    try {
      await confirmOperationalShutdown(target.scope, target.id, input, preview.previewToken);
      await onDone();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể xác nhận. Vui lòng thử lại.');
      setStage('impact');
      setAcknowledged(false);
    } finally { setBusy(false); }
  }

  return <Modal open title={current ? `Thay đổi cách ngừng hoạt động · ${target.label}` : `Ngừng hoạt động · ${target.label}`} onClose={() => !busy && onClose()}>
    <div className="grid gap-4">
      <p className="text-xs font-semibold text-ink-500">1. Chọn cách đóng &nbsp;→&nbsp; 2. Xem ảnh hưởng &nbsp;→&nbsp; 3. Xác nhận</p>
      {stage === 'choice' && <>
        <div className="grid gap-2" role="radiogroup" aria-label="Cách ngừng hoạt động">
          {modes.filter((option) => current?.mode !== 'emergency' || option.mode === 'emergency').map((option) => <button
            key={option.mode} type="button" role="radio" aria-checked={mode === option.mode}
            onClick={() => { setMode(option.mode); setPreview(null); setError(''); }}
            className={`rounded-2xl border p-4 text-left transition-colors ${mode === option.mode ? 'border-brand-navy bg-brand-navy/5' : 'border-line bg-surface hover:border-brand-navy/40'}`}
          >
            <span className="font-bold text-brand-navy">{mode === option.mode ? '●' : '○'} {option.title}</span>
            <span className="mt-1 block text-sm text-ink-600">{option.description}</span>
            <span className="mt-2 block text-xs font-semibold text-ink-500">{option.note}</span>
          </button>)}
        </div>
        {mode === 'scheduled_close' && <label className="grid gap-1 text-sm font-semibold">Ngày bắt đầu đóng cửa
          <TextInput type="date" value={closeDate} onChange={(event) => setCloseDate(event.target.value)} />
        </label>}
        {mode === 'emergency' && <label className="grid gap-1 text-sm font-semibold">Lý do sự cố
          <textarea className="min-h-24 rounded-xl border border-line bg-surface p-3 text-sm" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Ví dụ: Cơ sở không thể tiếp tục phục vụ do sự cố điện." />
        </label>}
        <div className="flex justify-end gap-2"><Button tone="secondary" disabled={busy} onClick={onClose}>Hủy</Button><Button disabled={busy} onClick={() => void showImpact()}>{busy ? 'Đang kiểm tra…' : 'Xem ảnh hưởng'}</Button></div>
      </>}
      {stage !== 'choice' && preview && <>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric value={affectedCount.toString()} label="Lịch bị hủy" />
          <Metric value={formatMoneyVnd(preview.estimatedRefund)} label="Dự kiến hoàn cho khách" />
          <Metric value={preview.continuingBookings.toString()} label="Lịch tiếp tục phục vụ" />
          <Metric value={(mode === 'scheduled_close' ? preview.closeAt : preview.expectedInactiveAt) ? formatDateTimeVi((mode === 'scheduled_close' ? preview.closeAt : preview.expectedInactiveAt)!) : '—'} label={mode === 'scheduled_close' ? 'Bắt đầu đóng cửa' : 'Thời điểm phục vụ cuối'} />
        </div>
        <div className="rounded-xl bg-canvas p-3 text-sm text-ink-700">
          <p>Qua COURTIN: {preview.affectedMarketplace} · Gắn với kèo: {preview.affectedMatch} · Tại quầy: {preview.affectedInternal}</p>
          <p className="mt-1">Lượt đang thanh toán: {preview.activeCheckoutHolds} · Kèo đang giữ sân: {preview.activeMatchHolds}</p>
        </div>
        {stage === 'impact' ? <>
          <p className="text-sm text-ink-600">{warning}</p>
          <div className="flex justify-end gap-2"><Button tone="secondary" disabled={busy} onClick={() => setStage('choice')}>Quay lại</Button><Button onClick={() => setStage('confirm')}>Tiếp tục</Button></div>
        </> : <>
          <div className="rounded-xl bg-brand-yellow/20 p-3 text-sm"><strong>Xác nhận {modes.find((item) => item.mode === mode)?.title.toLowerCase()}</strong><p className="mt-1">{warning}</p></div>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-1" />
            <span>{mode === 'winding_down' ? 'Tôi đã kiểm tra thời điểm phục vụ cuối và hiểu rằng sân sẽ không nhận thêm lịch mới.' : 'Tôi hiểu các lịch bị ảnh hưởng sẽ bị hủy và không tự khôi phục khi thay đổi kế hoạch.'}</span>
          </label>
          <div className="flex justify-end gap-2"><Button tone="secondary" disabled={busy} onClick={() => setStage('impact')}>Quay lại</Button><Button tone="danger" disabled={busy || !acknowledged} onClick={() => void confirm()}>{busy ? 'Đang xử lý…' : 'Xác nhận ngừng hoạt động'}</Button></div>
        </>}
      </>}
      {error && <p role="alert" className="rounded-xl bg-danger-bg p-3 text-sm text-danger">{error}</p>}
    </div>
  </Modal>;
}

function Metric({ value, label }: { value: string; label: string }) {
  return <div className="rounded-xl border border-line bg-surface p-3"><strong className="block text-lg text-brand-navy">{value}</strong><span className="text-xs text-ink-500">{label}</span></div>;
}
