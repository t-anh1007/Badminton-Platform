import { useEffect, useMemo, useState } from 'react';
import { previewOutcome, type MatchFormat, type SetScore } from '../../../lib/matchApi';
import { estimateLevel, type ColumnMapping, type EditedCell, type ResultClaimView, type ResultDraftResponse, type Submission } from '../../../lib/resultApi';
import { Button } from '../../ui';
import { LevelBadge, Note, ReasonList, outcomeText } from '../shared';

const HOURS = { green: 2, yellow: 6, red: 12 } as const;
type Cell = string;

/**
 * K3/K4: bản nháp tỉ số theo set. Q3: "AI chưa chắc" đánh dấu cả hàng set. Q4: không gán lại ảnh, mỗi set hiện ảnh nguồn.
 * Q8: mức dự kiến tính ở FE, server tính lại khi gửi.
 */
export function DraftEditor({ draft: response, files, compareWith, format, teamNames, submitLabel, busy, onSubmit, onRestart }: {
  draft: ResultDraftResponse; files: File[]; compareWith?: ResultClaimView; format: MatchFormat; teamNames: { A: string; B: string }; submitLabel: string; busy: boolean;
  onSubmit: (submission: Submission & { outcome?: 'NO_RESULT' }) => void; onRestart: () => void;
}) {
  const { draft } = response;
  // Ảnh thu nhỏ từ file cục bộ để đối chiếu khi duyệt; thứ tự trùng "Ảnh N" vì server giữ thứ tự file.
  const [previews, setPreviews] = useState<string[]>([]);
  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setPreviews(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);
  const maxSets = format === 'bo5' ? 5 : 3;
  const needsColumns = draft.columnMappedBy === null;
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>(null);
  const [picked, setPicked] = useState(!needsColumns || draft.sets.length === 0);
  const ai = (index: number, swap: boolean): { A: number | null; B: number | null } => {
    const set = draft.sets[index];
    if (!set || set.teamA === null || set.teamB === null) return { A: null, B: null };
    return swap ? { A: set.teamB, B: set.teamA } : { A: set.teamA, B: set.teamB };
  };
  const [rows, setRows] = useState<Array<{ A: Cell; B: Cell }>>(() => Array.from({ length: maxSets }, (_, index) => {
    const value = ai(index, false);
    return { A: value.A === null ? '' : String(value.A), B: value.B === null ? '' : String(value.B) };
  }));
  const swap = columnMapping === 'left_is_B';
  const chooseColumns = (next: 'left_is_A' | 'left_is_B') => {
    if ((next === 'left_is_B') !== swap) setRows((current) => current.map((row) => ({ A: row.B, B: row.A })));
    setColumnMapping(next);
    setPicked(true);
  };
  const setCell = (index: number, side: 'A' | 'B', value: string) =>
    setRows((current) => current.map((row, position) => (position === index ? { ...row, [side]: value.replace(/\D/g, '').slice(0, 2) } : row)));

  const filled = rows.map((row, index) => ({ row, index })).filter(({ row }) => row.A !== '' && row.B !== '');
  const sets: SetScore[] = filled.map(({ row }) => ({ teamA: Number(row.A), teamB: Number(row.B) }));
  const editedCells: EditedCell[] = filled.flatMap(({ row, index }) => {
    const base = ai(index, swap);
    return (['A', 'B'] as const).filter((side) => base[side] !== null && Number(row[side]) !== base[side]).map((side) => ({ set: index, side }));
  });
  const preview = sets.length > 0 ? previewOutcome(format, sets) : null;
  const halfFilled = rows.some((row) => (row.A === '') !== (row.B === ''));
  const estimate = useMemo(() => estimateLevel(
    { ...draft, sets: Array.from({ length: Math.max(draft.sets.length, sets.length) }, (_, index) => draft.sets[index] ?? { teamA: null, teamB: null, sourceUploadId: null, lowConfidence: true }) },
    { columnMapping: needsColumns ? columnMapping ?? 'left_is_A' : null, editedCells },
  ), [draft, sets.length, needsColumns, columnMapping, editedCells]);
  const imageNumber = (uploadId: string | null) => (uploadId ? response.images.findIndex((image) => image.uploadId === uploadId) + 1 : 0);
  const canSend = picked && preview !== null && !halfFilled && !busy;
  // BR-RA-25 (D63): cùng bên thắng với kết quả đề xuất nhưng lệch điểm set → cảnh báo, cho dùng tỉ số đề xuất.
  const proposed = compareWith?.sets ?? [];
  const mismatched = compareWith && preview?.outcome === compareWith.outcome
    ? Array.from({ length: Math.max(sets.length, proposed.length) }, (_, index) => index)
      .filter((index) => sets[index]?.teamA !== proposed[index]?.teamA || sets[index]?.teamB !== proposed[index]?.teamB)
    : [];
  const score = (set?: SetScore) => (set ? `${set.teamA}–${set.teamB}` : 'không có');
  const useProposed = () => setRows(Array.from({ length: maxSets }, (_, index) => ({
    A: proposed[index] ? String(proposed[index].teamA) : '', B: proposed[index] ? String(proposed[index].teamB) : '',
  })));
  const labels = response.columns;

  return (
    <div className="grid gap-5">
      {draft.manualEntry && <Note tone="warning">Chưa đọc được ảnh. Nhập tỉ số theo ảnh, ảnh vẫn được gửi kèm và sẽ được đọc lại sau để đối chiếu.</Note>}
      {needsColumns && draft.sets.length > 0 && (
        <fieldset>
          <legend className="font-bold text-ink-900">Cột trái trên ảnh là đội nào?</legend>
          <p className="mb-2 text-sm text-ink-500">{labels.left || labels.right ? `Ảnh ghi “${labels.left ?? '…'}” ở cột trái, “${labels.right ?? '…'}” ở cột phải.` : 'Ảnh không ghi tên đội nên AI chưa khớp được cột.'}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {(['left_is_A', 'left_is_B'] as const).map((option) => (
              <label key={option} className={`flex cursor-pointer flex-col rounded-xl border p-3 ${columnMapping === option ? 'border-brand-navy ring-2 ring-green-100' : 'border-line'}`}>
                <span className="flex items-center gap-2 font-bold text-brand-navy"><input type="radio" name="column-mapping" checked={columnMapping === option} onChange={() => chooseColumns(option)} />Đội {option === 'left_is_A' ? 'A' : 'B'}</span>
                <span className="text-sm text-ink-500">{option === 'left_is_A' ? teamNames.A : teamNames.B}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_200px]">
      <table className="w-full border-separate border-spacing-0" aria-label="Tỉ số theo set">
        <thead><tr className="text-left text-[13px] font-semibold text-ink-500">
          <th className="pb-2 align-bottom">Set</th>
          {(['A', 'B'] as const).map((side) => (
            <th key={side} className="pb-2 text-center align-bottom">Đội {side}{teamNames[side] !== `Đội ${side}` && <span className="block text-xs font-medium text-ink-700">{teamNames[side]}</span>}</th>
          ))}
          <th className="pb-2 text-right align-bottom">Ảnh</th>
        </tr></thead>
        <tbody>
          {rows.map((row, index) => {
            const source = draft.sets[index];
            const low = Boolean(source?.lowConfidence && source.teamA !== null);
            const base = ai(index, swap);
            return (
              <tr key={index} className={low ? 'bg-warning-bg' : undefined}>
                <td className="border-t border-line py-2 pr-2 text-sm font-bold text-ink-700">
                  Set {index + 1}
                  {low && <span className="block text-xs font-semibold text-warning">AI chưa chắc</span>}
                  {index >= Math.max(2, draft.sets.length) && <span className="block text-xs font-medium text-ink-500">Bỏ trống nếu không đánh</span>}
                </td>
                {(['A', 'B'] as const).map((side) => {
                  const edited = base[side] !== null && row[side] !== '' && Number(row[side]) !== base[side];
                  return (
                    <td key={side} className="border-t border-line p-2 text-center">
                      <span className="relative inline-block">
                        <input aria-label={`Set ${index + 1} Đội ${side}`} inputMode="numeric" value={row[side]} onChange={(event) => setCell(index, side, event.target.value)}
                          className={`text-figures h-16 w-24 rounded-2xl border bg-surface text-center text-3xl font-semibold ${low ? 'border-2 border-dashed border-warning' : edited ? 'border-2 border-brand-navy' : 'border-line'}`} />
                        {edited && <span className="absolute -right-2 -top-2.5 rounded-full border border-line bg-surface px-1.5 text-[11px] font-bold text-ink-500 line-through">AI {base[side]}</span>}
                      </span>
                    </td>
                  );
                })}
                <td className="border-t border-line py-2 text-right text-sm text-ink-500">{source?.sourceUploadId ? `Ảnh ${imageNumber(source.sourceUploadId)}` : 'Nhập tay'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {previews.length > 0 && (
        <aside aria-label="Ảnh đã chọn" className="grid content-start gap-3 sm:grid-cols-3 lg:grid-cols-1">
          {previews.map((url, index) => (
            <a key={index} href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-line" title="Mở ảnh lớn để đối chiếu">
              <img src={url} alt={`Ảnh ${index + 1}`} className="aspect-[4/3] w-full object-cover" />
              <span className="block px-2 py-1 text-xs font-semibold text-ink-500">Ảnh {index + 1}</span>
            </a>
          ))}
        </aside>
      )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-green-50 p-4">
        <div><p className="text-sm text-ink-500">Kết quả</p><p className="text-h3 text-2xl">{preview ? outcomeText(preview.outcome, sets) : 'Chưa đủ để xác định'}</p></div>
        {preview?.outcome === 'NO_RESULT' && <p className="text-sm text-ink-700">Hết giờ khi hai đội đang hòa: gửi “Không có kết quả”.</p>}
      </div>
      {mismatched.length > 0 && compareWith && (
        <Note tone="warning">
          <p className="font-bold">Cùng đội thắng nhưng tỉ số set khác bản Đội {compareWith.side ?? 'A'} đã khai</p>
          <ul className="mt-1 list-disc pl-5">
            {mismatched.map((index) => <li key={index}>Set {index + 1}: bạn {score(sets[index])}, Đội {compareWith.side ?? 'A'} {score(proposed[index])}</li>)}
          </ul>
          <p className="mt-1">Kiểm tra lại ảnh. Nếu vẫn gửi tỉ số của bạn, kết quả vẫn chốt theo đội thắng và tỉ số chính thức theo bản Đội {compareWith.side ?? 'A'}.</p>
          <Button tone="secondary" size="sm" className="mt-2" onClick={useProposed}>Dùng tỉ số của Đội {compareWith.side ?? 'A'}</Button>
        </Note>
      )}
      {sets.length > 0 && !preview && !halfFilled && <Note tone="danger">Tỉ số chưa hợp lệ theo luật: set thắng cần 21 điểm, từ 20–20 phải hơn 2 điểm (tối đa 30).</Note>}

      <div className="rounded-2xl border border-line p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><LevelBadge level={estimate.level} prefix="Dự kiến: " /><span className="text-sm text-ink-500">Mức chính thức do hệ thống tính khi gửi</span></div>
        <div className="mt-3"><ReasonList level={estimate.level} reasons={estimate.reasons} /></div>
        <p className="mt-3 text-sm text-ink-700">{estimate.level === 'red' ? 'Kết quả có ảnh lạ sẽ không tự chốt; quản trị viên sẽ xem xét.' : `Đội kia có ${HOURS[estimate.level]} giờ để phản hồi. Hạn rơi vào 23:00–07:00 được dời sang 08:00.`}</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-md text-xs text-ink-500">Gửi xong không sửa từng số. Nếu sai, bạn có thể gửi bản khai mới thay thế khi đội kia chưa phản hồi.</p>
        <div className="flex gap-2">
          <Button tone="secondary" onClick={onRestart}>Chọn lại ảnh</Button>
          <Button disabled={!canSend} onClick={() => onSubmit({
            draftId: response.draftId, sets, editedCells,
            columnMapping: needsColumns && draft.sets.length > 0 ? columnMapping : null,
            ...(preview?.outcome === 'NO_RESULT' ? { outcome: 'NO_RESULT' as const } : {}),
          })}>{busy ? 'Đang gửi…' : submitLabel}</Button>
        </div>
      </div>
    </div>
  );
}
