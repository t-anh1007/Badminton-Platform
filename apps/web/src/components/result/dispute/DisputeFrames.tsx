import { useState } from 'react';
import { useServerCountdown } from '../../MatchResultFlow';
import { acceptRuling, type AdminReason, type ResultClaimView } from '../../../lib/resultApi';
import type { MatchOutcome } from '../../../lib/matchApi';
import { Badge, Button } from '../../ui';
import type { FrameProps } from '../MatchResultPanel';
import { ResultPhotos } from '../ResultPhotos';
import { NightTag, Note, ScoreChips, errorText, nightShiftFrom, outcomeText, shortTime } from '../shared';
import { AppealDialog } from './AppealDialog';

const SIDE_OF: Record<MatchOutcome, string> = { TEAM_A_WIN: 'Ủng hộ Đội A thắng', TEAM_B_WIN: 'Ủng hộ Đội B thắng', NO_RESULT: 'Ủng hộ không có kết quả' };

function Citations({ ids, citations }: { ids: string[]; citations: Array<{ id: string; title: string; excerpt: string | null }> }) {
  const [open, setOpen] = useState<string | null>(null);
  const shown = ids.map((id) => citations.find((item) => item.id === id)).filter((item): item is NonNullable<typeof item> => Boolean(item));
  if (shown.length === 0) return null;
  const current = shown.find((item) => item.id === open);
  return (
    <div className="mt-2 grid gap-2">
      <div className="flex flex-wrap gap-2">
        {shown.map((item) => (
          <button key={item.id} type="button" aria-expanded={open === item.id} onClick={() => setOpen(open === item.id ? null : item.id)}
            className="inline-flex h-7 items-center rounded-full border border-[#c5d6e3] bg-surface px-3 text-xs font-bold text-brand-navy">{item.title}</button>
        ))}
      </div>
      {current && (
        <div role="region" aria-label={current.title} className="max-w-xl rounded-xl border border-line bg-surface p-3 text-sm shadow-[var(--shadow-raised)]">
          <p className="font-bold text-brand-navy">{current.title}</p>
          <p className="mt-1 text-ink-700">{current.excerpt ?? 'Chưa có đoạn trích cho mục này.'}</p>
        </div>
      )}
    </div>
  );
}

/** T2/T3: kết quả tạm theo luật hoặc phán quyết tạm của AI, 6 giờ kháng nghị cho đội bị xử thua. */
export function RulingFrame({ matchId, resultCase, reload }: FrameProps) {
  const [appealing, setAppealing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const countdown = useServerCountdown(resultCase.serverNow, resultCase.appealDeadlineAt, () => undefined);
  const ruling = resultCase.ruling;
  const actions = resultCase.viewerActions;
  if (!ruling) {
    return (
      <div className="grid gap-2">
        <h2 className="text-h2 text-[26px]">Đang xử tranh chấp</h2>
        <p className="text-sm text-ink-500">{resultCase.status === 'ai_ruling' ? 'Hai đội đều có ảnh hợp lệ nên hệ thống nhờ AI đối chiếu ảnh và luật. Thường xong trong vài phút.' : 'Hệ thống đang xét ảnh bằng chứng theo luật.'}</p>
      </div>
    );
  }
  const groups = new Map<MatchOutcome, ResultClaimView[]>();
  for (const claim of [...resultCase.claims, ...resultCase.disputeEvidence]) groups.set(claim.outcome, [...(groups.get(claim.outcome) ?? []), claim]);
  const accept = async () => {
    setBusy(true); setError('');
    try { await acceptRuling(matchId, ruling.id); await reload(); } catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  };
  const loserSide = ruling.outcome === 'TEAM_A_WIN' ? 'B' : ruling.outcome === 'TEAM_B_WIN' ? 'A' : null;
  const loser = actions.canAppeal || actions.canAcceptRuling;
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2"><p className="text-sm text-ink-500">{ruling.tier === 2 ? 'Phán quyết tạm' : 'Kết quả tạm theo luật bằng chứng'}</p>{ruling.tier === 2 && <Badge>Do AI soạn</Badge>}</div>
          <h2 className="text-h2 mt-1 text-[28px]">{outcomeText(ruling.outcome)}</h2>
        </div>
        {resultCase.status === 'appeal_window' && (
          <div className="text-right">
            <p className="text-sm text-ink-500">Còn để kháng nghị</p>
            {countdown && <p className="text-figures text-3xl font-semibold text-brand-navy">{countdown}</p>}
            {resultCase.appealDeadlineAt && <p className="text-sm">Đến <b>{shortTime(resultCase.appealDeadlineAt)}</b></p>}
            <NightTag from={nightShiftFrom(resultCase.appealDeadlineAt)} />
          </div>
        )}
      </div>
      {ruling.tier === 2 && <p className="text-sm text-ink-500">Hai đội đều có ảnh hợp lệ nên hệ thống nhờ AI đối chiếu ảnh và luật.</p>}

      <div>
        <p className="font-bold text-ink-900">Lý do</p>
        <ol className="mt-2 grid gap-2">
          {ruling.reasons.map((reason, index) => (
            <li key={index} className="rounded-2xl border border-line p-4">
              <div className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-green-100 text-xs font-bold text-brand-navy">{index + 1}</span><p className="text-sm">{reason.text}</p></div>
              <div className="pl-9"><Citations ids={reason.citations} citations={ruling.citations} /></div>
            </li>
          ))}
        </ol>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {[...groups.entries()].map(([outcome, claims]) => (
          <div key={outcome} className="rounded-2xl border border-line p-4">
            <p className="mb-2 font-bold text-ink-900">{SIDE_OF[outcome]}</p>
            <ResultPhotos matchId={matchId} images={claims.flatMap((claim) => claim.images)} />
          </div>
        ))}
      </div>

      {resultCase.viewerAppeal && !resultCase.viewerAppeal.accepted && <Note tone="warning">Kháng nghị trước của bạn bị từ chối vì thiếu căn cứ. Bạn vẫn kháng nghị lại được trong thời hạn.</Note>}
      {error && <Note tone="danger">{error}</Note>}
      <div className="flex flex-wrap items-start justify-between gap-3 border-t border-line pt-4">
        <p className="max-w-lg text-sm text-ink-500">
          {loser
            ? resultCase.match.discipline === 'doubles' ? 'Kèo đôi: chốt sớm khi cả hai người đội bạn cùng chấp nhận. Không ai kháng nghị thì chốt khi hết hạn.' : 'Không kháng nghị thì kết quả chốt khi hết hạn.'
            : loserSide ? `Chỉ Đội ${loserSide} được kháng nghị hoặc chấp nhận. Kết quả chưa tính tiền và điểm cho tới khi chốt.` : 'Kết quả chưa tính tiền và điểm cho tới khi chốt.'}
        </p>
        <div className="flex gap-2">
          {actions.canAppeal && <Button tone="secondary" onClick={() => setAppealing(true)}>Kháng nghị</Button>}
          {actions.canAcceptRuling && <Button disabled={busy} onClick={() => void accept()}>{ruling.tier === 2 ? 'Chấp nhận phán quyết' : 'Chấp nhận kết quả'}</Button>}
        </div>
      </div>
      <AppealDialog matchId={matchId} ruling={ruling} open={appealing} onClose={() => setAppealing(false)} onDone={reload} />
    </div>
  );
}

const ADMIN_TITLE: Record<AdminReason, string> = {
  appeal: 'Có kháng nghị nên quản trị viên xem xét lại.',
  unknown_photo: 'Kết quả có ảnh lạ nên quản trị viên xem xét trước khi chốt.',
  ai_unavailable: 'Hai đội đều có ảnh hợp lệ, chưa đủ cơ sở tự xử nên chuyển quản trị viên.',
  evidence_unreadable: 'Chưa đọc được ảnh bằng chứng nên chuyển quản trị viên.',
  incident: 'Có báo sự cố. Quản trị viên sẽ ra kết quả cuối.',
  legacy: 'Quản trị viên đang xem xét hồ sơ.',
};
const ADMIN_SLA_MS = 48 * 3_600_000;

/** T5: hồ sơ ở quản trị viên (SLA 48 giờ, không dời qua đêm); tiền và điểm vẫn khóa. */
export function AdminFrame({ resultCase }: FrameProps) {
  if (resultCase.status === 'incident_window') {
    return (
      <div className="grid gap-2 text-center">
        <p className="text-h3">Chưa ai gửi kết quả</p>
        <p className="text-sm text-ink-500">Hồ sơ tạm ghi “không có kết quả”. Còn thời gian báo sự cố trước khi chốt.</p>
      </div>
    );
  }
  const due = resultCase.adminReviewStartedAt ? new Date(new Date(resultCase.adminReviewStartedAt).getTime() + ADMIN_SLA_MS).toISOString() : null;
  return (
    <div className="grid gap-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-h2 text-[26px]">Quản trị viên đang xem xét</h2>
          <p className="mt-1 text-sm text-ink-500">{ADMIN_TITLE[resultCase.adminReason ?? 'legacy']}</p>
        </div>
        <Badge tone="warning">Chờ quyết định</Badge>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-line p-4"><p className="text-sm text-ink-500">Có quyết định trước</p><p className="text-h3 mt-1 text-xl">{due ? shortTime(due) : '48 giờ'}</p><p className="mt-1 text-xs text-ink-500">Hạn của quản trị viên không dời qua đêm.</p></div>
        <div className="rounded-2xl border border-line p-4"><p className="text-sm text-ink-500">Trong lúc chờ</p><p className="mt-1 text-sm">Tiền giữ chỗ và điểm xếp hạng vẫn khóa. Kết quả tạm chưa có hiệu lực.</p></div>
      </div>
      {resultCase.viewerAppeal?.accepted && <Note tone="info">Bạn đã kháng nghị lúc {shortTime(resultCase.viewerAppeal.createdAt)}.</Note>}
    </div>
  );
}

/** P4/T5: kết quả cuối. */
export function FinalFrame({ matchId, resultCase }: FrameProps) {
  const proposal = resultCase.claims.find((claim) => claim.id === resultCase.proposalClaimId) ?? resultCase.claims[0];
  const sameAsClaim = proposal && proposal.outcome === resultCase.finalOutcome;
  return (
    <div className="grid gap-5">
      <div className="flex items-start justify-between gap-4">
        <div><p className="text-sm text-ink-500">Kết quả cuối</p><h2 className="text-h2 mt-1 text-[28px]">{outcomeText(resultCase.finalOutcome, sameAsClaim ? proposal.sets : undefined)}</h2></div>
        <Badge tone="success">Đã chốt</Badge>
      </div>
      {sameAsClaim && <ScoreChips sets={proposal.sets} />}
      {resultCase.adminDecision && (
        <div className="rounded-2xl border border-line p-4">
          <p className="font-bold text-ink-900">Quyết định của quản trị viên</p>
          <p className="mt-1 whitespace-pre-line text-sm text-ink-700">{resultCase.adminDecision.reason}</p>
          <p className="mt-2 text-xs text-ink-500">Quyết định lúc {shortTime(resultCase.adminDecision.decidedAt)}. Đây là quyết định cuối, không kháng nghị tiếp.</p>
        </div>
      )}
      {!resultCase.adminDecision && resultCase.adminReviewStartedAt && <Note>Quyết định của quản trị viên là quyết định cuối, không kháng nghị tiếp.</Note>}
      {resultCase.finalOutcome === 'NO_RESULT' && <Note>Không có kết quả: chi phí chia đều hai đội, không tính điểm xếp hạng.</Note>}
      {proposal && <details><summary className="cursor-pointer text-sm font-bold text-brand-navy">Ảnh và bản khai</summary><div className="mt-3"><ResultPhotos matchId={matchId} images={proposal.images} /></div></details>}
      <p className="text-xs text-ink-500">Ảnh gửi sau khi chốt chỉ được lưu, không đổi kết quả.</p>
    </div>
  );
}
