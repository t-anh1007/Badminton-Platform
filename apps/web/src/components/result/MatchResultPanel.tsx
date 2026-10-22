import type { ResultCaseV2 } from '../../lib/resultApi';
import { ResultProgressRail } from './ResultProgressRail';
import { LevelBadge, ReasonList, ScoreChips, outcomeText } from './shared';

export interface FrameProps { matchId: string; resultCase: ResultCaseV2; reload: () => Promise<void> }

/** Khung nào hiện cho người xem này, theo trạng thái hồ sơ và vai trò (server quyết quyền qua viewerActions). */
export type FrameKey = 'report' | 'sent' | 'respond' | 'evidence' | 'ruling' | 'admin' | 'final' | 'waiting';
export function frameOf(resultCase: ResultCaseV2): FrameKey {
  const { status, viewerActions: actions } = resultCase;
  if (status === 'final') return 'final';
  if (status === 'admin_review' || status === 'incident_window') return 'admin';
  if (status === 'evidence_window') return 'evidence';
  if (status === 'appeal_window' || status === 'rule_ruling' || status === 'ai_ruling') return 'ruling';
  if (status === 'declaration_open') return actions.canClaim ? 'report' : 'waiting';
  const proposal = resultCase.claims.find((claim) => claim.id === resultCase.proposalClaimId);
  if (proposal && proposal.side === resultCase.viewerSide) return 'sent';
  return 'respond';
}

function Summary({ resultCase }: FrameProps) {
  const proposal = resultCase.claims.find((claim) => claim.id === resultCase.proposalClaimId);
  if (!proposal) return <p className="text-sm text-ink-500">Chưa có ai gửi kết quả.</p>;
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4"><p className="text-h3">{outcomeText(proposal.outcome, proposal.sets)}</p>{proposal.level && <LevelBadge level={proposal.level} />}</div>
      <ScoreChips sets={proposal.sets} />
      <ReasonList level={proposal.level} reasons={resultCase.reasons} />
    </div>
  );
}

const FRAMES: Record<FrameKey, (props: FrameProps) => React.ReactNode> = {
  report: Summary, sent: Summary, respond: Summary, evidence: Summary, ruling: Summary, admin: Summary, final: Summary, waiting: Summary,
};

export function MatchResultPanel(props: FrameProps) {
  const Frame = FRAMES[frameOf(props.resultCase)];
  return (
    <section id="ket-qua-tran" aria-label="Kết quả trận" className="surface-card grid overflow-hidden lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 p-6 sm:p-7"><Frame {...props} /></div>
      <ResultProgressRail resultCase={props.resultCase} />
    </section>
  );
}
