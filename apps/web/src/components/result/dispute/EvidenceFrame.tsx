import { useState } from 'react';
import { useServerCountdown } from '../../MatchResultFlow';
import { markEvidenceDone, submitDisputeEvidence, type ResultClaimView, type ResultImageView } from '../../../lib/resultApi';
import { Badge, Button } from '../../ui';
import type { FrameProps } from '../MatchResultPanel';
import { IncidentDialog } from '../IncidentDialog';
import { ResultPhotos } from '../ResultPhotos';
import { ReporterFlow } from '../reporter/ReporterFlow';
import { NightTag, Note, errorText, nameOf, nightShiftFrom, shortTime } from '../shared';

const imagesOf = (claims: ResultClaimView[], side: 'A' | 'B'): ResultImageView[] => claims.filter((claim) => claim.side === side).flatMap((claim) => claim.images);

/**
 * T1: 2 giờ nộp bằng chứng. Ảnh của đội kia do API giữ kín (không trả về) tới khi hết giờ hoặc hai đội cùng bấm
 * "Đã nộp đủ" (BR-RA-30); FE chỉ hiện ô khóa, không ẩn bằng CSS.
 */
export function EvidenceFrame({ matchId, resultCase, reload }: FrameProps) {
  const [adding, setAdding] = useState(false);
  const [incident, setIncident] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const actions = resultCase.viewerActions;
  const deadline = resultCase.evidenceClosedAt ?? resultCase.evidenceDeadlineAt;
  const countdown = useServerCountdown(resultCase.serverNow, resultCase.evidenceClosedAt ? null : resultCase.evidenceDeadlineAt, () => undefined);
  const mySide = resultCase.viewerSide ?? 'A';
  const otherSide = mySide === 'A' ? 'B' : 'A';
  const objection = resultCase.responses.find((row) => row.kind === 'object');
  const all = [...resultCase.claims, ...resultCase.disputeEvidence];
  // Cùng điều kiện với evidenceSealed ở server; dữ liệu ảnh đội kia vốn không có trong response khi còn kín.
  const sealed = !resultCase.evidenceClosedAt && resultCase.evidenceDeadlineAt !== null
    && new Date(resultCase.serverNow) < new Date(resultCase.evidenceDeadlineAt);
  const left = Math.max(0, resultCase.viewerQuota.photosLimit - resultCase.viewerQuota.photosUsed);

  const done = async () => {
    setBusy(true); setError('');
    try { await markEvidenceDone(matchId); await reload(); } catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  };
  if (adding) {
    return (
      <div className="grid gap-4">
        <div className="flex items-center justify-between gap-3"><h2 className="text-h2 text-[26px]">Thêm ảnh bằng chứng</h2><Button tone="secondary" size="sm" onClick={() => setAdding(false)}>Quay lại</Button></div>
        <Note tone="info">Mỗi ảnh được đọc và xếp mức riêng. Ảnh lạ chỉ bị loại riêng ảnh đó.</Note>
        <ReporterFlow matchId={matchId} resultCase={resultCase} submitLabel="Nộp bằng chứng"
          onSubmit={async (submission) => { await submitDisputeEvidence(matchId, submission); setAdding(false); await reload(); }} />
      </div>
    );
  }
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-h2 text-[26px]">Đang tranh chấp tỉ số</h2>
          {objection && <p className="mt-1 text-sm text-ink-500">{objection.displayName ?? nameOf(resultCase, objection.userId)} phản đối lúc {shortTime(objection.createdAt)}.</p>}
        </div>
        <div className="text-right">
          <p className="text-sm text-ink-500">{countdown ? 'Nộp bằng chứng còn' : 'Đã đóng nộp bằng chứng'}</p>
          {countdown && <p className="text-figures text-3xl font-semibold text-brand-navy">{countdown}</p>}
          {deadline && <p className="text-sm">Đến <b>{shortTime(deadline)}</b></p>}
          <NightTag from={nightShiftFrom(resultCase.evidenceDeadlineAt)} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {([mySide, otherSide] as const).map((side) => (
          <div key={side} className="rounded-2xl border border-line p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="font-bold text-ink-900">Ảnh của Đội {side}{side === mySide ? ' (bạn)' : ''}</p>
              {resultCase.evidenceDoneSides.includes(side) && <Badge tone="success">Đã nộp đủ</Badge>}
            </div>
            {side === otherSide && sealed && (
              <div className="grid h-48 place-items-center rounded-xl bg-[repeating-linear-gradient(45deg,#efefeb_0_8px,#e5e5e0_8px_16px)] p-4 text-center text-ink-700">
                <div><p className="font-bold">Giữ kín tới {deadline ? shortTime(deadline) : 'khi hết giờ'}</p><p className="mt-1 text-sm">Hiện ra khi hết giờ hoặc khi cả hai đội bấm “Đã nộp đủ”.</p></div>
              </div>
            )}
            {(side === mySide || !sealed) && <ResultPhotos matchId={matchId} images={imagesOf(all, side)} />}
            {side === mySide && imagesOf(all, side).length === 0 && <p className="text-sm text-ink-500">Đội bạn chưa nộp ảnh nào.</p>}
          </div>
        ))}
      </div>

      {error && <Note tone="danger">{error}</Note>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-500">Bạn còn nộp được <b className="text-figures text-ink-900">{left}/{resultCase.viewerQuota.photosLimit}</b> ảnh.</p>
        <div className="flex gap-2">
          {actions.canMarkEvidenceDone && <Button tone="secondary" disabled={busy} onClick={() => void done()}>Đội tôi đã nộp đủ</Button>}
          {actions.canSubmitEvidence && left > 0 && <Button onClick={() => setAdding(true)}>Thêm ảnh bằng chứng</Button>}
        </div>
      </div>
      <Note tone="info">Hết giờ: nếu mọi ảnh hợp lệ ủng hộ một đội, có kết quả tạm ngay. Nếu cả hai đội đều có ảnh hợp lệ, AI soạn phán quyết tạm. Ảnh lạ chỉ bị loại riêng ảnh đó.</Note>
      {actions.canReportIncident && (
        <p className="text-sm text-ink-500">Trận không diễn ra hoặc bỏ dở? <button type="button" className="font-bold text-brand-navy hover:underline" onClick={() => setIncident(true)}>Báo sự cố</button></p>
      )}
      <IncidentDialog matchId={matchId} open={incident} onClose={() => setIncident(false)} onDone={reload} />
    </div>
  );
}
