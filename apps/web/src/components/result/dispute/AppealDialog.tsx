import { useState } from 'react';
import { checkResultPhotos, submitAppeal, type ResultRuling } from '../../../lib/resultApi';
import { Button, Modal, TextArea } from '../../ui';
import { Note, errorText } from '../shared';

const APPEAL_MAX_PHOTOS = 2;

/** T4: chỉ bên bị xử thua; cần chỉ ra lý do sai hoặc ảnh mới (≤ 2, ngoài giới hạn 7 ảnh) (BR-RA-38). */
export function AppealDialog({ matchId, ruling, open, onClose, onDone }: {
  matchId: string; ruling: ResultRuling; open: boolean; onClose: () => void; onDone: () => Promise<void>;
}) {
  const [pointed, setPointed] = useState<number[]>([]);
  const [why, setWhy] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toggle = (index: number) => setPointed((current) => (current.includes(index) ? current.filter((item) => item !== index) : [...current, index]));
  const addFiles = (picked: File[]) => {
    setError('');
    const next = [...files, ...picked].slice(0, APPEAL_MAX_PHOTOS);
    try { checkResultPhotos(next); setFiles(next); } catch (cause) { setError(errorText(cause)); }
  };
  const send = async () => {
    setBusy(true); setError('');
    try {
      const pointedReason = pointed.map((index) => `${index + 1}. ${ruling.reasons[index]!.text}`).join('\n') || undefined;
      await submitAppeal(matchId, { rulingId: ruling.id, reason: why.trim(), pointedReason, files });
      onClose();
      await onDone();
    } catch (cause) {
      setError(errorText(cause, 'Không thể gửi kháng nghị.'));
      // Kháng nghị thiếu căn cứ vẫn được server ghi lại: tải lại để hiện trạng thái mới nhất.
      await onDone();
    } finally { setBusy(false); }
  };
  return (
    <Modal open={open} title={ruling.tier === 2 ? 'Kháng nghị phán quyết tạm' : 'Kháng nghị kết quả tạm'} onClose={onClose}>
      <div className="grid gap-4">
        <p className="text-sm text-ink-500">Cần ít nhất một căn cứ: chỉ ra lý do sai, hoặc ảnh mới.</p>
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-semibold text-ink-700">Lý do nào sai?</legend>
          {ruling.reasons.map((reason, index) => (
            <label key={index} className={`flex cursor-pointer gap-3 rounded-xl border p-3 text-sm ${pointed.includes(index) ? 'border-brand-navy ring-2 ring-green-100' : 'border-line'}`}>
              <input type="checkbox" checked={pointed.includes(index)} onChange={() => toggle(index)} className="mt-0.5" />
              <span>{index + 1}. {reason.text}</span>
            </label>
          ))}
        </fieldset>
        <label className="grid gap-1.5 text-sm font-semibold text-ink-700">Vì sao sai?
          <TextArea rows={3} maxLength={1000} value={why} onChange={(event) => setWhy(event.target.value)} />
        </label>
        <div className="grid gap-2 text-sm">
          <span className="font-semibold text-ink-700">Ảnh mới (tối đa {APPEAL_MAX_PHOTOS}, không tính vào giới hạn ảnh)</span>
          <ul className="grid gap-1">{files.map((file) => <li key={file.name} className="flex items-center justify-between rounded-lg bg-canvas px-3 py-2">{file.name}<button type="button" className="font-bold text-brand-navy" onClick={() => setFiles(files.filter((item) => item !== file))}>Gỡ</button></li>)}</ul>
          {files.length < APPEAL_MAX_PHOTOS && (
            <label className="inline-flex w-fit cursor-pointer items-center rounded-full border border-line px-4 py-2 font-bold text-brand-navy">Chọn ảnh
              <input aria-label="Chọn ảnh kháng nghị" className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" multiple
                onChange={(event) => { if (event.target.files) addFiles(Array.from(event.target.files)); event.target.value = ''; }} />
            </label>
          )}
        </div>
        <Note tone="warning">Kháng nghị chuyển quản trị viên, xử trong 48 giờ. Nếu quản trị viên đánh giá kháng nghị không có căn cứ, bạn có thể bị ghi một vi phạm.</Note>
        {error && <Note tone="danger">{error}</Note>}
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose}>Hủy</Button>
          <Button disabled={busy || !why.trim()} onClick={() => void send()}>{busy ? 'Đang gửi…' : 'Gửi kháng nghị'}</Button>
        </div>
      </div>
    </Modal>
  );
}
