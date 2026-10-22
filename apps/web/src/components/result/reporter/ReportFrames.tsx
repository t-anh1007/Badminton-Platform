import { useState } from 'react';
import { useServerCountdown } from '../../MatchResultFlow';
import { submitResultClaimV2 } from '../../../lib/resultApi';
import { Button } from '../../ui';
import type { FrameProps } from '../MatchResultPanel';
import { IncidentDialog } from '../IncidentDialog';
import { ResultPhotos } from '../ResultPhotos';
import { LevelBadge, NightTag, Note, ReasonList, ScoreChips, nameOf, nightShiftFrom, outcomeText, shortTime } from '../shared';
import { ReporterFlow } from './ReporterFlow';

const HOURS = { green: 2, yellow: 6, red: 12 } as const;

function IncidentLink({ matchId, reload, show }: { matchId: string; reload: () => Promise<void>; show: boolean }) {
  const [open, setOpen] = useState(false);
  if (!show) return null;
  return (
    <p className="text-sm text-ink-500">
      Trận không diễn ra, có người vắng hoặc bỏ dở?{' '}
      <button type="button" className="font-bold text-brand-navy underline-offset-2 hover:underline" onClick={() => setOpen(true)}>Báo sự cố</button>
      <IncidentDialog matchId={matchId} open={open} onClose={() => setOpen(false)} onDone={reload} />
    </p>
  );
}

/** K1–K4: chưa có bản khai nào; ai trong kèo cũng gửi được. */
export function ReportFrame({ matchId, resultCase, reload }: FrameProps) {
  return (
    <div className="grid gap-5">
      <div>
        <h2 className="text-h2 text-[26px]">Kết quả trận</h2>
        <p className="mt-1 text-sm text-ink-500">Ai trong kèo cũng gửi được. Bản gửi đầu tiên của mỗi đội là kết quả của đội đó.</p>
      </div>
      <ReporterFlow matchId={matchId} resultCase={resultCase} submitLabel="Gửi kết quả"
        onSubmit={async (submission) => { await submitResultClaimV2(matchId, submission); await reload(); }}
        footer={<IncidentLink matchId={matchId} reload={reload} show={resultCase.viewerActions.canReportIncident} />} />
    </div>
  );
}

/** Hết hạn khai nhưng server chưa cập nhật trạng thái (đang chờ quét hạn). */
export function WaitingFrame({ matchId, resultCase, reload }: FrameProps) {
  return (
    <div className="grid gap-3 text-center">
      <p className="text-h3">Đang cập nhật kết quả</p>
      <p className="text-sm text-ink-500">Hạn khai kết quả đã qua. Trang tự cập nhật khi hệ thống xử lý xong.</p>
      <IncidentLink matchId={matchId} reload={reload} show={resultCase.viewerActions.canReportIncident} />
    </div>
  );
}

/** K5: đội mình đã gửi; người khai thay được bản khai, đồng đội gửi thêm ảnh. */
export function SentFrame({ matchId, resultCase, reload }: FrameProps) {
  const [adding, setAdding] = useState<'replace' | 'more' | null>(null);
  const proposal = resultCase.claims.find((claim) => claim.id === resultCase.proposalClaimId)!;
  // Server chỉ bật canReplace cho chính người khai khi còn được thay (BR-RA-05).
  const mine = resultCase.viewerActions.canReplace;
  const deadline = resultCase.status === 'acceptance_grace' ? resultCase.graceDeadlineAt : resultCase.responseDeadlineAt;
  const countdown = useServerCountdown(resultCase.serverNow, deadline, () => undefined);
  const other = resultCase.viewerSide === 'A' ? 'B' : 'A';
  const claimant = nameOf(resultCase, proposal.claimantUserId);

  if (adding) {
    return (
      <div className="grid gap-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-h2 text-[26px]">{adding === 'replace' ? 'Thay bản khai' : 'Gửi thêm ảnh'}</h2>
          <Button tone="secondary" size="sm" onClick={() => setAdding(null)}>Quay lại</Button>
        </div>
        {adding === 'replace' && <Note tone="info">Bản mới thay bản cũ; hạn phản hồi tính lại từ lúc thay theo mức của bản mới. Ảnh của bản cũ vẫn tính vào giới hạn ảnh.</Note>}
        {adding === 'more' && <Note tone="info">Gửi ảnh cùng kết quả có thể rút ngắn thời gian chờ; gửi kết quả khác sẽ mở tranh chấp.</Note>}
        <ReporterFlow matchId={matchId} resultCase={resultCase} submitLabel={adding === 'replace' ? 'Gửi bản thay' : 'Gửi kết quả'}
          onSubmit={async (submission) => { await submitResultClaimV2(matchId, submission); setAdding(null); await reload(); }} />
      </div>
    );
  }
  return (
    <div className="grid gap-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-h2 text-[26px]">Đã gửi: {outcomeText(proposal.outcome, proposal.sets)}</h2>
          <p className="mt-1 text-sm text-ink-500">{claimant} gửi lúc {shortTime(proposal.createdAt)}. Đang chờ Đội {other} phản hồi.</p>
        </div>
        {proposal.level && <LevelBadge level={proposal.level} />}
      </div>
      <ScoreChips sets={proposal.sets} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-line p-4">
          <p className="text-sm text-ink-500">{resultCase.status === 'acceptance_grace' ? 'Chốt sau thời gian chờ người còn lại' : `Tự chốt nếu Đội ${other} không phản đối`}</p>
          {countdown && <p className="text-figures text-3xl font-semibold text-brand-navy">{countdown}</p>}
          {deadline && <p className="text-sm">Lúc <b>{shortTime(deadline)}</b></p>}
          <NightTag from={resultCase.status === 'proposed' ? nightShiftFrom(resultCase.responseDeadlineAt, resultCase.responseDeadlineBaseAt) : null} />
        </div>
        <div className="rounded-2xl border border-line p-4">
          <p className="mb-2 text-sm text-ink-500">Cả kèo thấy lý do mức tin cậy</p>
          <ReasonList level={proposal.level} reasons={resultCase.reasons} responseHours={proposal.level ? HOURS[proposal.level] : undefined} />
          {proposal.level === 'green' && <p className="text-sm text-ink-700">Ảnh rõ, đủ set, không sửa số.</p>}
        </div>
      </div>
      {proposal.level === 'red' && <Note tone="danger">Kết quả có ảnh lạ không tự chốt. Quản trị viên sẽ xem xét khi đội kia đồng ý hoặc khi hết hạn.</Note>}
      <ResultPhotos matchId={matchId} images={proposal.images} title="Ảnh đã gửi" />
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <IncidentLink matchId={matchId} reload={reload} show={resultCase.viewerActions.canReportIncident} />
        <div className="flex gap-2">
          {mine && <Button tone="secondary" onClick={() => setAdding('replace')}>Thay bản khai</Button>}
          {resultCase.viewerActions.canClaim && <Button tone="secondary" onClick={() => setAdding('more')}>Gửi thêm ảnh</Button>}
        </div>
      </div>
    </div>
  );
}
