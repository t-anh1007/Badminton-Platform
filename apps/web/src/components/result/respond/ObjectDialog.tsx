import { useState } from 'react';
import { objectResultV2, type ResultCaseV2, type Submission } from '../../../lib/resultApi';
import { Button, Modal, TextArea } from '../../ui';
import { ReporterFlow } from '../reporter/ReporterFlow';
import { Note, errorCode, errorText } from '../shared';

type Reason = 'score_wrong' | 'no_match';

/** P2: phản đối kết quả đề xuất. "Tỉ số sai" mở 2 giờ nộp bằng chứng; "Không có trận" chuyển quản trị viên (BR-RA-24). */
export function ObjectDialog({ matchId, resultCase, open, onClose, onDone }: {
  matchId: string; resultCase: ResultCaseV2; open: boolean; onClose: () => void; onDone: () => Promise<void>;
}) {
  const [reason, setReason] = useState<Reason>('score_wrong');
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState(false);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const send = async () => {
    setBusy(true); setError('');
    try {
      await objectResultV2(matchId, { reason, note: note.trim() || undefined, claimVersion: resultCase.version, ...(submission ? { submission } : {}) });
      onClose();
      await onDone();
    } catch (cause) {
      // Người cần kèm ảnh (server quyết, BR-RA-52): mở phần ảnh ngay, không nhắc tới lý do.
      if (errorCode(cause) === 'RESULT_OBJECTION_EVIDENCE_REQUIRED') setPhotos(true);
      setError(errorText(cause, 'Không thể gửi phản đối.'));
    } finally { setBusy(false); }
  };
  const options: Array<{ value: Reason; title: string; detail: string }> = [
    { value: 'score_wrong', title: 'Tỉ số sai', detail: 'Hai đội có 2 giờ nộp ảnh bằng chứng. Ảnh của đội kia giữ kín cho tới khi hết giờ.' },
    { value: 'no_match', title: 'Trận không diễn ra, có người vắng hoặc bỏ dở', detail: 'Chuyển thẳng quản trị viên xem xét.' },
  ];
  return (
    <Modal open={open} title="Phản đối kết quả" onClose={onClose}>
      <div className="grid gap-4">
        <fieldset className="grid gap-2">
          <legend className="sr-only">Lý do phản đối</legend>
          {options.map((option) => (
            <label key={option.value} className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${reason === option.value ? 'border-brand-navy ring-2 ring-green-100' : 'border-line'}`}>
              <input type="radio" name="object-reason" checked={reason === option.value} onChange={() => setReason(option.value)} className="mt-1" />
              <span><span className="block font-bold text-ink-900">{option.title}</span><span className="text-sm text-ink-500">{option.detail}</span></span>
            </label>
          ))}
        </fieldset>
        <label className="grid gap-1.5 text-sm font-semibold text-ink-700">Ghi chú cho đội kia (không bắt buộc)
          <TextArea rows={2} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
        {submission
          ? <Note tone="success">Đã đọc ảnh kèm: {submission.sets.map((set) => `${set.teamA}–${set.teamB}`).join(', ')}. <button type="button" className="font-bold underline" onClick={() => { setSubmission(null); setPhotos(true); }}>Đổi ảnh</button></Note>
          : photos
            ? <div className="rounded-2xl border border-line p-4"><ReporterFlow matchId={matchId} resultCase={resultCase} submitLabel="Dùng bản này" onSubmit={async (value) => { setSubmission(value); setPhotos(false); }} /></div>
            : <Button tone="secondary" onClick={() => setPhotos(true)}>Kèm ảnh (không bắt buộc)</Button>}
        {error && <Note tone="danger">{error}</Note>}
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose}>Hủy</Button>
          <Button disabled={busy} onClick={() => void send()}>{busy ? 'Đang gửi…' : 'Gửi phản đối'}</Button>
        </div>
      </div>
    </Modal>
  );
}
