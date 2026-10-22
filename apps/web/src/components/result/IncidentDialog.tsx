import { useState } from 'react';
import { INCIDENTS } from '../MatchResultFlow';
import { reportIncidentV2 } from '../../lib/resultApi';
import type { IncidentType } from '../../lib/matchApi';
import { Button, Modal, TextArea } from '../ui';
import { Note, errorText } from './shared';

/** BR-RA-42: sự cố đi thẳng quản trị viên, mỗi người một lần cho mỗi hồ sơ. */
export function IncidentDialog({ matchId, open, onClose, onDone }: { matchId: string; open: boolean; onClose: () => void; onDone: () => Promise<void> }) {
  const [type, setType] = useState<IncidentType>('interrupted');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    setBusy(true); setError('');
    try {
      await reportIncidentV2(matchId, { type, description: description.trim() });
      onClose();
      await onDone();
    } catch (cause) { setError(errorText(cause, 'Không thể gửi báo sự cố.')); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} title="Báo sự cố trận đấu" onClose={onClose}>
      <div className="grid gap-4">
        <fieldset className="grid gap-2">
          <legend className="sr-only">Loại sự cố</legend>
          {INCIDENTS.map((option) => (
            <label key={option.value} className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${type === option.value ? 'border-brand-navy ring-2 ring-green-100' : 'border-line'}`}>
              <input type="radio" name="incident-type" value={option.value} checked={type === option.value} onChange={() => setType(option.value)} className="mt-1" />
              <span><span className="block font-bold text-ink-900">{option.title}</span><span className="text-sm text-ink-500">{option.description}</span></span>
            </label>
          ))}
        </fieldset>
        <label className="grid gap-1.5 text-sm font-semibold text-ink-700">Mô tả ngắn
          <TextArea rows={3} maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>
        <Note tone="info">Sự cố chuyển thẳng quản trị viên, mọi hạn của hồ sơ dừng lại. Quản trị viên sẽ ra kết quả cuối.</Note>
        {error && <Note tone="danger">{error}</Note>}
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose}>Hủy</Button>
          <Button disabled={busy || !description.trim()} onClick={() => void submit()}>{busy ? 'Đang gửi…' : 'Gửi báo sự cố'}</Button>
        </div>
      </div>
    </Modal>
  );
}
