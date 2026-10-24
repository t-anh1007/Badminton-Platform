import { useEffect, useRef, useState, type ReactNode } from 'react';
import { checkResultPhotos, readResultPhotos, type ResultCaseV2, type ResultDraftResponse, type Submission } from '../../../lib/resultApi';
import { Button } from '../../ui';
import { Note, errorText, teamLabel } from '../shared';
import { DraftEditor } from './DraftEditor';

type Phase = { kind: 'pick' } | { kind: 'reading'; files: File[] } | { kind: 'draft'; draft: ResultDraftResponse; files: File[] };

const READ_BUDGET_S = 30;

/**
 * K1 → K2 → K3/K4 trong cùng một khối: chọn ảnh, chờ AI đọc (≤ 30 giây), sửa bản nháp rồi gửi.
 * Dùng chung cho khai kết quả, ảnh tranh chấp và ảnh kèm phản đối (chỉ khác nút gửi).
 */
export function ReporterFlow({ matchId, resultCase, submitLabel, onSubmit, intro, footer }: {
  matchId: string; resultCase: ResultCaseV2; submitLabel: string;
  onSubmit: (submission: Submission & { outcome?: 'NO_RESULT' }) => Promise<void>; intro?: ReactNode; footer?: ReactNode;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: 'pick' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const abort = useRef<AbortController | null>(null);
  const quota = resultCase.viewerQuota;
  const photosLeft = Math.max(0, quota.photosLimit - quota.photosUsed);
  const maxPick = Math.min(5, photosLeft, quota.draftsLeft);

  useEffect(() => {
    if (phase.kind !== 'reading') return;
    setElapsed(0);
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1_000);
    return () => window.clearInterval(timer);
  }, [phase.kind]);

  const read = async (files: File[]) => {
    setError('');
    try {
      checkResultPhotos(files);
      if (files.length > maxPick) {
        setError(maxPick === 0 ? 'Bạn đã dùng hết số ảnh cho trận này.' : `Bạn còn chọn được tối đa ${maxPick} ảnh.`);
        return;
      }
    } catch (cause) { setError(errorText(cause)); return; }
    abort.current = new AbortController();
    setPhase({ kind: 'reading', files });
    try {
      setPhase({ kind: 'draft', draft: await readResultPhotos(matchId, files, abort.current.signal), files });
    } catch (cause) {
      if ((cause as { name?: string }).name === 'AbortError') setPhase({ kind: 'pick' });
      else { setError(errorText(cause, 'Không đọc được ảnh.')); setPhase({ kind: 'pick' }); }
    }
  };
  const submit = async (submission: Submission & { outcome?: 'NO_RESULT' }) => {
    setBusy(true); setError('');
    try { await onSubmit(submission); } catch (cause) { setError(errorText(cause, 'Không thể gửi.')); } finally { setBusy(false); }
  };

  return (
    <div className="grid gap-5">
      {phase.kind === 'pick' && (
        <>
          {intro}
          {!resultCase.photoReadingEnabled && <Note tone="warning">Đọc ảnh tự động đang tạm tắt, bạn nhập tỉ số tay. Ảnh vẫn được gửi kèm; kết quả ở mức Vàng.</Note>}
          <label
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => { event.preventDefault(); void read(Array.from(event.dataTransfer.files)); }}
            className="flex cursor-pointer flex-wrap items-center gap-6 rounded-2xl border-2 border-dashed border-[#b9c9d6] bg-green-50 p-7">
            <span aria-hidden="true" className="grid h-16 w-16 shrink-0 place-items-center rounded-[20px] bg-brand-navy text-brand-yellow">
              <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
            </span>
            <span className="min-w-0 flex-1">
              <span className="text-h3 block text-xl">Gửi ảnh bảng tỉ số</span>
              <span className="mt-1 block text-ink-500">{resultCase.photoReadingEnabled ? 'AI đọc ảnh và điền sẵn tỉ số từng set. ' : ''}Chọn 1–{Math.max(1, maxPick)} ảnh, mỗi ảnh đến 15 MB. Dùng ảnh gốc trong máy để giữ giờ chụp.</span>
            </span>
            <span className="inline-flex min-h-11 items-center rounded-full bg-brand-yellow px-6 text-sm font-bold uppercase tracking-[0.035em] text-brand-navy">Chọn ảnh</span>
            <input aria-label="Chọn ảnh bảng tỉ số" className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={maxPick === 0}
              onChange={(event) => { if (event.target.files) void read(Array.from(event.target.files)); event.target.value = ''; }} />
          </label>
          <p className="-mt-2 text-xs text-ink-500">Nhận JPG, PNG, WEBP. Còn {photosLeft}/{quota.photosLimit} ảnh cho trận này. Ảnh gửi qua Zalo, Messenger mất giờ chụp nên ở mức Vàng.</p>
        </>
      )}
      {phase.kind === 'reading' && (
        <div aria-busy="true" className="grid gap-4">
          <div className="flex items-start justify-between gap-4">
            <div><p className="text-h3 text-xl">Đang đọc ảnh</p><p className="text-sm text-ink-500">Thường xong trong 5–15 giây. Quá {READ_BUDGET_S} giây, bạn tự nhập phần còn thiếu.</p></div>
            <p className="text-figures text-3xl font-semibold text-brand-navy">0:{String(Math.min(elapsed, 99)).padStart(2, '0')}<span className="text-sm text-ink-500"> / 0:30</span></p>
          </div>
          <div role="progressbar" aria-label="Tiến độ đọc ảnh" aria-valuemin={0} aria-valuemax={READ_BUDGET_S} aria-valuenow={Math.min(elapsed, READ_BUDGET_S)} className="h-1.5 overflow-hidden rounded-full bg-line">
            <span className="block h-full rounded-full bg-brand-navy transition-[width]" style={{ width: `${Math.min(100, (elapsed / READ_BUDGET_S) * 100)}%` }} />
          </div>
          <ul className="grid gap-1 text-sm text-ink-700">{phase.files.map((file) => <li key={file.name}>{file.name}</li>)}</ul>
          <div><Button tone="secondary" onClick={() => abort.current?.abort()}>Hủy, chọn lại ảnh</Button></div>
        </div>
      )}
      {phase.kind === 'draft' && (
        <DraftEditor draft={phase.draft} files={phase.files} format={resultCase.match.format} teamNames={{ A: teamLabel(resultCase, 'A'), B: teamLabel(resultCase, 'B') }}
          submitLabel={submitLabel} busy={busy} onSubmit={(submission) => void submit(submission)} onRestart={() => setPhase({ kind: 'pick' })} />
      )}
      {error && <Note tone="danger">{error}</Note>}
      {phase.kind === 'pick' && footer}
    </div>
  );
}
