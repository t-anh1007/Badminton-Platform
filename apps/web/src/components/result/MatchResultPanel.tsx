import type { ResultCaseV2 } from '../../lib/resultApi';
import { ResultProgressRail, nextDeadline } from './ResultProgressRail';
import { Note, shortTime } from './shared';
import { ReportFrame, SentFrame, WaitingFrame } from './reporter/ReportFrames';
import { RespondFrame } from './respond/RespondFrame';
import { EvidenceFrame } from './dispute/EvidenceFrame';
import { AdminFrame, FinalFrame, RulingFrame } from './dispute/DisputeFrames';

export interface FrameProps {
  matchId: string; resultCase: ResultCaseV2; reload: () => Promise<void>;
  /** Tỉ số đã chốt hiện ở thẻ Đội hình phía trên → khung kết quả cuối không lặp lại. */
  scoreShownAbove?: boolean;
}

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

const FRAMES: Record<FrameKey, (props: FrameProps) => React.ReactNode> = {
  report: ReportFrame, sent: SentFrame, respond: RespondFrame, evidence: EvidenceFrame, ruling: RulingFrame, admin: AdminFrame, final: FinalFrame,
  waiting: WaitingFrame,
};

export function MatchResultPanel(props: FrameProps) {
  const Frame = FRAMES[frameOf(props.resultCase)];
  // Hạn vừa qua nhưng server chưa quét: chỉ báo và chờ tải lại, không tự đổi trạng thái ở FE.
  const deadline = nextDeadline(props.resultCase);
  const expired = deadline !== null && new Date(props.resultCase.serverNow) >= new Date(deadline);
  return (
    <section aria-label="Kết quả trận" className="surface-card grid overflow-hidden lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 p-6 sm:p-7">
        {expired && <div className="mb-4"><Note tone="info">Đã hết hạn lúc {shortTime(deadline!)}. Hệ thống đang cập nhật, trang tự tải lại.</Note></div>}
        <Frame {...props} />
      </div>
      <ResultProgressRail resultCase={props.resultCase} />
    </section>
  );
}
