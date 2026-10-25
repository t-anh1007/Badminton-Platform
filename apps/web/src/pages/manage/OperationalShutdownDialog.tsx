import { useState } from 'react';
import { Button, Modal, TextInput } from '../../components/ui.js';
import { formatDateTimeVi, formatMoneyVnd } from '../../lib/formatters.js';
import { Icon } from '../../components/Icon';
import {
  confirmOperationalShutdown, previewOperationalShutdown,
  type OperationalShutdownInput, type OperationalShutdownMode,
  type OperationalShutdownPreview, type OperationalShutdownScope,
  type OperationalShutdownStatus,
} from '../../lib/venueBookingApi.js';

const modes: Array<{ mode: OperationalShutdownMode; title: string; description: string; action: string }> = [
  { mode: 'winding_down', title: 'Ngừng nhận lịch đặt mới', description: 'Vẫn phục vụ hết các lịch đã nhận.', action: 'Ngừng nhận lịch' },
  { mode: 'scheduled_close', title: 'Đóng cửa từ ngày đã chọn', description: 'Lịch bị ảnh hưởng được hủy và hoàn 100% vào ví khách.', action: 'Đóng cửa sân' },
  { mode: 'emergency', title: 'Ngừng hoạt động ngay do sự cố', description: 'Hủy mọi lịch chưa kết thúc, hoàn 100%.', action: 'Ngừng hoạt động ngay' },
];

type Target = { scope: OperationalShutdownScope; id: string; label: string };
type Stage = 'choice' | 'confirm';

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
  const needsAck = mode !== 'winding_down';
  const chosen = modes.find((item) => item.mode === mode)!;
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
      setStage('confirm'); setAcknowledged(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể xem ảnh hưởng.');
    } finally { setBusy(false); }
  }

  async function confirm() {
    if (!preview || (needsAck && !acknowledged)) return;
    setBusy(true); setError('');
    try {
      await confirmOperationalShutdown(target.scope, target.id, input, preview.previewToken);
      await onDone();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể xác nhận. Vui lòng thử lại.');
      setAcknowledged(false);
    } finally { setBusy(false); }
  }

  return <Modal open title={current ? `Thay đổi cách ngừng hoạt động · ${target.label}` : `Ngừng hoạt động · ${target.label}`} onClose={() => !busy && onClose()}>
    <div className="grid gap-4">
      <p className="flex items-center gap-2 text-xs font-bold"><span className={`rounded-full px-2.5 py-1 ${stage === 'choice' ? 'bg-green-100 text-brand-navy' : 'text-ink-500'}`}>1 Cách ngừng</span><Icon name="chevronRight" className="h-3.5 w-3.5 text-ink-300" /><span className={`rounded-full px-2.5 py-1 ${stage === 'confirm' ? 'bg-green-100 text-brand-navy' : 'text-ink-500'}`}>2 Xác nhận</span></p>
      {stage === 'choice' && <>
        <div className="grid gap-2" role="radiogroup" aria-label="Cách ngừng hoạt động">
          {modes.filter((option) => current?.mode !== 'emergency' || option.mode === 'emergency').map((option) => <button
            key={option.mode} type="button" role="radio" aria-checked={mode === option.mode}
            onClick={() => { setMode(option.mode); setPreview(null); setError(''); }}
            className={`flex items-start gap-3 rounded-2xl border bg-surface px-4 py-3 text-left transition ${mode === option.mode ? 'border-brand-navy ring-4 ring-green-100' : 'border-line hover:border-ink-300'}`}
          >
            <span aria-hidden="true" className={`mt-0.5 h-5 w-5 shrink-0 rounded-full ${mode === option.mode ? 'border-[6px] border-brand-navy' : 'border-2 border-ink-300'}`} />
            <span><span className="block font-bold text-ink-900">{option.title}</span><span className="block text-sm text-ink-500">{option.description}</span></span>
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
      {stage === 'confirm' && preview && <>
        <button type="button" aria-label={`Đổi cách ngừng (đang chọn: ${chosen.title})`} onClick={() => setStage('choice')} className="flex items-start gap-3 rounded-2xl border border-brand-navy bg-surface px-4 py-3 text-left ring-4 ring-green-100">
          <span aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 rounded-full border-[6px] border-brand-navy" />
          <span><span className="block font-bold text-ink-900">{mode === 'scheduled_close' && preview.closeAt ? `Đóng cửa từ ${formatDateTimeVi(preview.closeAt)}` : chosen.title}</span><span className="block text-sm text-ink-500">Đổi cách ngừng</span></span>
        </button>
        <div className="grid grid-cols-2 gap-2">
          <div className={`rounded-2xl p-4 ${affectedCount ? 'bg-danger-bg' : 'bg-canvas'}`}><strong className={`text-figures block text-2xl ${affectedCount ? 'text-danger' : 'text-brand-navy'}`}>{affectedCount}</strong><span className="text-xs text-ink-500">Lịch bị hủy</span></div>
          <div className="rounded-2xl bg-canvas p-4"><strong className="text-figures block text-2xl text-brand-navy">{formatMoneyVnd(preview.estimatedRefund)}</strong><span className="text-xs text-ink-500">Dự kiến hoàn cho khách</span></div>
        </div>
        {(affectedCount > 0 || preview.continuingBookings > 0 || preview.activeCheckoutHolds > 0 || preview.activeMatchHolds > 0) && <p className="text-sm text-ink-600">
          {affectedCount > 0 && <>Qua COURTIN: {preview.affectedMarketplace} · Gắn với kèo: {preview.affectedMatch} · Tại quầy: {preview.affectedInternal}. </>}
          {preview.continuingBookings > 0 && <>{preview.continuingBookings} lịch tiếp tục phục vụ{mode === 'winding_down' && preview.expectedInactiveAt ? ` đến ${formatDateTimeVi(preview.expectedInactiveAt)}` : ''}. </>}
          {(preview.activeCheckoutHolds > 0 || preview.activeMatchHolds > 0) && <>Đang giữ chỗ: {preview.activeCheckoutHolds} lượt thanh toán, {preview.activeMatchHolds} kèo.</>}
        </p>}
        {needsAck ? <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-1 accent-brand-navy" />
          <span>Tôi hiểu {affectedCount ? `${affectedCount} lịch này` : 'các lịch bị ảnh hưởng'} sẽ bị hủy và không tự khôi phục.</span>
        </label> : <p className="text-sm text-ink-500">{warning}</p>}
        <div className="flex justify-end gap-2"><Button tone="secondary" disabled={busy} onClick={() => setStage('choice')}>Quay lại</Button><Button tone={needsAck ? 'danger' : 'primary'} disabled={busy || (needsAck && !acknowledged)} onClick={() => void confirm()}>{busy ? 'Đang xử lý…' : chosen.action}</Button></div>
      </>}
      {error && <p role="alert" className="rounded-xl bg-danger-bg p-3 text-sm text-danger">{error}</p>}
    </div>
  </Modal>;
}
