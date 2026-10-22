import type { ResultCaseV2 } from '../../lib/resultApi';
import { NightTag, nameOf, nightShiftFrom, shortTime } from './shared';

// Thanh tiến trình bên phải khối "Kết quả trận" (Q1): bước đã qua, bước hiện tại + hạn, bước kế tiếp.

type StepState = 'done' | 'now' | 'next';
export interface RailStep { key: string; title: string; detail?: string; state: StepState; night?: string | null }

const ADMIN_SLA_MS = 48 * 3_600_000;
const DISPUTE = new Set(['evidence_window', 'rule_ruling', 'ai_ruling', 'appeal_window']);

/** Hạn kế tiếp của hồ sơ (đếm ngược hết thì tải lại để backend quét lười). */
export function nextDeadline(resultCase: ResultCaseV2): string | null {
  switch (resultCase.status) {
    case 'declaration_open': return resultCase.declarationDeadlineAt;
    case 'proposed': return resultCase.responseDeadlineAt;
    case 'acceptance_grace': return resultCase.graceDeadlineAt;
    case 'evidence_window': return resultCase.evidenceClosedAt ? null : resultCase.evidenceDeadlineAt;
    case 'appeal_window': return resultCase.appealDeadlineAt;
    default: return null;
  }
}

export function railSteps(resultCase: ResultCaseV2): RailStep[] {
  const { status } = resultCase;
  const proposal = resultCase.claims.find((claim) => claim.id === resultCase.proposalClaimId) ?? resultCase.claims[0];
  const objection = resultCase.responses.find((row) => row.kind === 'object');
  const disputed = DISPUTE.has(status) || resultCase.evidenceDeadlineAt !== null;
  const atAdmin = resultCase.adminReviewStartedAt !== null;
  const final = status === 'final';
  const steps: RailStep[] = [];
  const at = (iso: string | null | undefined) => (iso ? shortTime(iso) : '');

  steps.push({ key: 'end', title: 'Trận kết thúc', detail: at(resultCase.match.endAt), state: 'done' });
  steps.push(proposal
    ? { key: 'claim', title: 'Khai kết quả', detail: `${nameOf(resultCase, proposal.claimantUserId)} gửi lúc ${at(proposal.createdAt)}`, state: 'done' }
    : { key: 'claim', title: 'Khai kết quả', detail: resultCase.declarationDeadlineAt ? `Hạn ${at(resultCase.declarationDeadlineAt)}` : undefined,
      state: status === 'declaration_open' ? 'now' : 'done', night: status === 'declaration_open' ? nightShiftFrom(resultCase.declarationDeadlineAt) : null });

  if (!disputed) {
    const responding = status === 'proposed' || status === 'acceptance_grace';
    steps.push({
      key: 'respond', title: 'Đội kia phản hồi',
      detail: resultCase.responseDeadlineAt ? `Hạn ${at(resultCase.responseDeadlineAt)}` : '2 giờ nếu Xanh, 6 giờ nếu Vàng',
      state: responding ? 'now' : proposal ? 'done' : 'next',
      night: status === 'proposed' ? nightShiftFrom(resultCase.responseDeadlineAt, resultCase.responseDeadlineBaseAt) : null,
    });
    if (status === 'acceptance_grace' || resultCase.pendingPayerUserId) {
      steps.push({
        key: 'grace', title: resultCase.pendingPayerUserId ? `Chờ ${nameOf(resultCase, resultCase.pendingPayerUserId)}` : 'Chờ người còn lại',
        detail: resultCase.graceDeadlineAt ? `Đến ${at(resultCase.graceDeadlineAt)}` : undefined, state: 'now',
      });
    }
  } else {
    steps.push({ key: 'object', title: 'Đội kia phản đối', detail: objection ? at(objection.createdAt) : undefined, state: 'done' });
    steps.push({
      key: 'evidence', title: 'Nộp bằng chứng',
      detail: status === 'evidence_window' ? `Đến ${at(resultCase.evidenceClosedAt ?? resultCase.evidenceDeadlineAt)}` : `Đóng ${at(resultCase.evidenceClosedAt ?? resultCase.evidenceDeadlineAt)}`,
      state: status === 'evidence_window' ? 'now' : 'done',
      night: status === 'evidence_window' ? nightShiftFrom(resultCase.evidenceDeadlineAt) : null,
    });
    const ruling = resultCase.ruling;
    steps.push({
      key: 'ruling', title: ruling?.tier === 2 ? 'Phán quyết tạm của AI' : ruling ? 'Kết quả tạm theo luật' : 'Kết quả tạm',
      detail: ruling ? at(ruling.publishedAt) : status === 'ai_ruling' ? 'AI đang đối chiếu' : 'Theo luật hoặc do AI soạn',
      state: ruling ? 'done' : status === 'ai_ruling' || status === 'rule_ruling' ? 'now' : 'next',
    });
    steps.push({
      key: 'appeal', title: 'Kháng nghị', detail: resultCase.appealDeadlineAt ? `Đến ${at(resultCase.appealDeadlineAt)}` : '6 giờ, chỉ đội bị xử thua',
      state: status === 'appeal_window' ? 'now' : ruling && (atAdmin || final) ? 'done' : 'next',
      night: status === 'appeal_window' ? nightShiftFrom(resultCase.appealDeadlineAt) : null,
    });
  }
  if (atAdmin) {
    steps.push({
      key: 'admin', title: 'Quản trị viên xử',
      detail: status === 'admin_review' ? `Trước ${at(new Date(new Date(resultCase.adminReviewStartedAt!).getTime() + ADMIN_SLA_MS).toISOString())}` : undefined,
      state: status === 'admin_review' ? 'now' : 'done',
    });
  }
  steps.push({ key: 'final', title: 'Chốt kết quả', detail: final ? undefined : 'Tiền giữ chỗ và điểm xếp hạng tính khi chốt', state: final ? 'done' : 'next' });
  return steps;
}

export function ResultProgressRail({ resultCase }: { resultCase: ResultCaseV2 }) {
  const steps = railSteps(resultCase);
  return (
    <aside aria-label="Tiến trình kết quả" className="border-t border-line bg-canvas p-6 lg:border-l lg:border-t-0">
      <p className="font-bold text-ink-900">Tiến trình</p>
      <ol className="mt-4">
        {steps.map((step, index) => (
          <li key={step.key} aria-current={step.state === 'now' ? 'step' : undefined} className="relative grid grid-cols-[22px_minmax(0,1fr)] gap-3 pb-4 last:pb-0">
            {index < steps.length - 1 && <span aria-hidden="true" className={`absolute bottom-0 left-[10px] top-[22px] w-0.5 ${step.state === 'done' ? 'bg-brand-navy' : 'bg-line'}`} />}
            <span aria-hidden="true" className={`grid h-[22px] w-[22px] place-items-center rounded-full border-2 ${
              step.state === 'done' ? 'border-brand-navy bg-brand-navy text-surface'
                : step.state === 'now' ? 'border-brand-navy bg-surface shadow-[0_0_0_4px_var(--color-brand-yellow)]' : 'border-ink-300 bg-surface'}`}>
              {step.state === 'done' && <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3"><path d="m5 12 4 4 10-10" /></svg>}
              {step.state === 'now' && <span className="h-2 w-2 rounded-full bg-brand-navy" />}
            </span>
            <div className={step.state === 'next' ? 'opacity-70' : undefined}>
              <p className="text-sm font-bold leading-[22px] text-ink-900">{step.title}</p>
              {step.detail && <p className="text-figures text-[13px] text-ink-500">{step.detail}</p>}
              {step.night !== undefined && <NightTag from={step.night ?? null} />}
            </div>
          </li>
        ))}
      </ol>
    </aside>
  );
}
