import { useState } from 'react';
import { useServerCountdown } from '../../MatchResultFlow';
import { confirmResultV2, submitResultClaimV2, type ResultClaimView } from '../../../lib/resultApi';
import { Button } from '../../ui';
import type { FrameProps } from '../MatchResultPanel';
import { ResultPhotos } from '../ResultPhotos';
import { ReporterFlow } from '../reporter/ReporterFlow';
import { LevelBadge, NightTag, Note, ReasonList, errorCode, errorText, nameOf, nightShiftFrom, outcomeText, shortTime } from '../shared';
import { ObjectDialog } from './ObjectDialog';

const HOURS = { green: 2, yellow: 6, red: 12 } as const;

/** Bảng tỉ số chỉ đọc; ô người khai đã sửa có viền đậm (số AI đọc xem ở chú thích ảnh). */
export function ScoreSheet({ claim, viewerSide }: { claim: ResultClaimView; viewerSide?: 'A' | 'B' | null }) {
  const edited = (set: number, side: 'A' | 'B') => claim.editedCells.some((cell) => cell.set === set && cell.side === side);
  return (
    <table className="w-full max-w-md border-separate border-spacing-0" aria-label="Tỉ số đã khai">
      <thead><tr className="text-[13px] font-semibold text-ink-500">
        <th className="pb-2 text-left">Set</th><th className="pb-2">Đội A{viewerSide === 'A' ? ' (bạn)' : ''}</th><th className="pb-2">Đội B{viewerSide === 'B' ? ' (bạn)' : ''}</th>
      </tr></thead>
      <tbody>
        {claim.sets.map((set, index) => (
          <tr key={index}>
            <td className="border-t border-line py-2 text-sm font-bold text-ink-700">Set {index + 1}</td>
            {(['A', 'B'] as const).map((side) => {
              const value = side === 'A' ? set.teamA : set.teamB;
              const win = value > (side === 'A' ? set.teamB : set.teamA);
              return (
                <td key={side} className="border-t border-line p-2 text-center">
                  <span className={`text-figures relative inline-grid h-14 w-20 place-items-center rounded-2xl text-2xl font-semibold ${win ? 'bg-brand-navy text-surface' : 'border border-line bg-surface'} ${edited(index, side) ? 'ring-2 ring-brand-navy ring-offset-2' : ''}`}>
                    {value}
                    {edited(index, side) && <span className="absolute -right-3 -top-2.5 rounded-full border border-line bg-surface px-1.5 text-[11px] font-bold text-ink-500">đã sửa</span>}
                  </span>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** P1/P3/P4: đội bị xử thua xem kết quả đề xuất và trả lời trước hạn. */
export function RespondFrame({ matchId, resultCase, reload }: FrameProps) {
  const [objecting, setObjecting] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const proposal = resultCase.claims.find((claim) => claim.id === resultCase.proposalClaimId)!;
  const actions = resultCase.viewerActions;
  const grace = resultCase.status === 'acceptance_grace';
  const deadline = grace ? resultCase.graceDeadlineAt : resultCase.responseDeadlineAt;
  const countdown = useServerCountdown(resultCase.serverNow, deadline, () => undefined);
  const agreed = resultCase.responses.filter((row) => row.kind === 'confirm');
  const proposerSide = proposal.side ?? 'A';
  const outcome = `khai: ${proposal.outcome === 'NO_RESULT' ? 'không có kết quả' : outcomeText(proposal.outcome, proposal.sets)}`;

  const confirm = async () => {
    setBusy(true); setError(''); setNotice('');
    try { await confirmResultV2(matchId, resultCase.version); await reload(); } catch (cause) {
      // Review focus 2: bản khai vừa bị thay → tải lại, báo, giữ nguyên mọi thứ khác.
      if (errorCode(cause) === 'RESULT_VERSION_STALE') { setNotice(errorText(cause)); await reload(); } else setError(errorText(cause, 'Không thể gửi đồng ý.'));
    } finally { setBusy(false); }
  };

  if (claiming) {
    return (
      <div className="grid gap-4">
        <div className="flex items-center justify-between gap-3"><h2 className="text-h2 text-[26px]">Gửi ảnh của Đội {resultCase.viewerSide}</h2><Button tone="secondary" size="sm" onClick={() => setClaiming(false)}>Quay lại</Button></div>
        <Note tone="info">Ảnh của bạn cho cùng kết quả được tính là đồng ý; cho kết quả khác thì hồ sơ chuyển sang tranh chấp.</Note>
        <ReporterFlow matchId={matchId} resultCase={resultCase} submitLabel="Gửi kết quả"
          onSubmit={async (submission) => { await submitResultClaimV2(matchId, submission); setClaiming(false); await reload(); }} />
      </div>
    );
  }
  return (
    <div className="grid gap-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-h2 text-[26px]">Đội {proposerSide} {outcome}</h2>
          <p className="mt-1 text-sm text-ink-500">{nameOf(resultCase, proposal.claimantUserId)} gửi lúc {shortTime(proposal.createdAt)}. Kiểm tra tỉ số và ảnh trước khi trả lời.</p>
        </div>
        {proposal.level && <LevelBadge level={proposal.level} />}
      </div>
      {notice && <Note tone="info">{notice}</Note>}
      {proposal.level === 'red' && <Note tone="danger">Kết quả có ảnh lạ không tự chốt. Quản trị viên sẽ xem xét khi bạn đồng ý hoặc khi hết hạn; trả lời của bạn là bằng chứng cho quản trị viên.</Note>}
      {proposal.outcome === 'NO_RESULT' && <Note>Nếu chốt: chi phí chia đều hai đội, không tính điểm xếp hạng.</Note>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <ScoreSheet claim={proposal} viewerSide={resultCase.viewerSide} />
        <div className="grid content-start gap-3">
          <div className="rounded-2xl border border-line p-4">
            <p className="text-sm text-ink-500">{grace ? 'Còn để phản đối' : 'Còn để phản hồi'}</p>
            {countdown && <p className="text-figures text-3xl font-semibold text-brand-navy">{countdown}</p>}
            {deadline && <p className="text-sm">{grace ? 'Chốt lúc' : 'Không trả lời: tự chốt lúc'} <b>{shortTime(deadline)}</b></p>}
            <NightTag from={!grace ? nightShiftFrom(resultCase.responseDeadlineAt, resultCase.responseDeadlineBaseAt) : null} />
          </div>
          <div className="rounded-2xl border border-line p-4">
            <p className="mb-2 text-sm text-ink-500">Vì sao mức {proposal.level === 'green' ? 'Xanh' : proposal.level === 'red' ? 'Đỏ' : 'Vàng'}</p>
            <ReasonList level={proposal.level} reasons={resultCase.reasons} responseHours={proposal.level ? HOURS[proposal.level] : undefined} />
            {proposal.level === 'green' && <p className="text-sm text-ink-700">Ảnh rõ, đủ set, người khai không sửa số.</p>}
          </div>
        </div>
      </div>

      <ResultPhotos matchId={matchId} images={proposal.images} title={`Ảnh Đội ${proposerSide} gửi`} />

      {grace && agreed.length > 0 && (
        <Note tone="info">{agreed.map((row) => row.displayName ?? nameOf(resultCase, row.userId)).join(', ')} đã đồng ý lúc {shortTime(agreed[0]!.createdAt)}. Không phản đối thì kết quả chốt lúc {resultCase.graceDeadlineAt ? shortTime(resultCase.graceDeadlineAt) : 'hết thời gian chờ'}.</Note>
      )}
      {resultCase.pendingPayerUserId && (actions.canConfirm
        ? <Note tone="info">{agreed.map((row) => row.displayName ?? nameOf(resultCase, row.userId)).join(', ')}, người bạn trả phần, đã đồng ý. Kết quả chỉ chốt sớm khi bạn cũng đồng ý; nếu không, tự chốt lúc {deadline ? shortTime(deadline) : 'hết hạn'}.</Note>
        : <Note>Đang chờ {nameOf(resultCase, resultCase.pendingPayerUserId)} (người trả phần) đồng ý.</Note>)}
      {!actions.canConfirm && agreed.length > 0 && !resultCase.pendingPayerUserId && <Note tone="success">Bạn hoặc đồng đội đã đồng ý kết quả này.</Note>}
      {error && <Note tone="danger">{error}</Note>}

      <div className="flex flex-wrap items-start justify-between gap-3 border-t border-line pt-4">
        <div className="grid max-w-lg gap-1 text-sm">
          {!grace && resultCase.match.discipline === 'doubles' && actions.canConfirm && <p>Kèo đôi: khi bạn đồng ý, đồng đội còn 1 giờ để phản đối rồi kết quả chốt.</p>}
          {actions.canClaim && <p className="text-ink-500">Có ảnh khác? <button type="button" className="font-bold text-brand-navy hover:underline" onClick={() => setClaiming(true)}>Gửi ảnh của Đội {resultCase.viewerSide}</button></p>}
        </div>
        <div className="flex gap-2">
          {actions.canObject && <Button tone="secondary" onClick={() => setObjecting(true)}>Phản đối</Button>}
          {actions.canConfirm && <Button disabled={busy} onClick={() => void confirm()}>{grace ? 'Đồng ý luôn' : 'Đồng ý kết quả'}</Button>}
        </div>
      </div>
      <ObjectDialog matchId={matchId} resultCase={resultCase} open={objecting} onClose={() => setObjecting(false)} onDone={reload} />
    </div>
  );
}
