import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AsyncButton, Badge, Pagination, SelectInput, SurfaceCard, TextArea } from '../../components/ui';
import { RouteState } from '../../components/RouteState.js';
import { RESULT_STATUS_LABELS, useServerCountdown } from '../../components/MatchResultFlow';
import { CaseStatements, CaseSummary, OutcomeChoice, queueContext, queueTitle } from '../../components/ResultCaseReview';
import { formatDateTimeVi } from '../../lib/formatters.js';
import {
  getProviderResultCase, listProviderResultCases, submitProviderRecommendation,
  type MatchOutcome, type ReviewCaseDetail, type ReviewQueueItem,
} from '../../lib/matchApi';

/** Màn 09: chủ sân gửi đề xuất không ràng buộc; kết quả cuối luôn do Admin quyết định. */
export function ManageMatchResultsPage() {
  const [page, setPage] = useState(1);
  // Mặc định hồ sơ đang chờ chủ sân; các lựa chọn khác chỉ để xem lại hồ sơ đã gửi đề xuất.
  const [status, setStatus] = useState<'provider_review' | 'admin_review' | 'final'>('provider_review');
  const [queue, setQueue] = useState<{ items: ReviewQueueItem[]; total: number; pageSize: number } | null>(null);
  const [queueError, setQueueError] = useState('');
  // Hồ sơ đang xem nằm trên URL (?caseId=) để link thông báo mở đúng hồ sơ, kể cả khi nằm ngoài trang hàng chờ hiện tại.
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('caseId') ?? queue?.items[0]?.caseId ?? null;
  const setSelectedId = (caseId: string) => setParams((prev) => {
    const next = new URLSearchParams(prev);
    next.set('caseId', caseId);
    return next;
  });

  useEffect(() => {
    listProviderResultCases(page, status).then(setQueue, (cause) => setQueueError(cause instanceof Error ? cause.message : 'Không thể tải hồ sơ.'));
  }, [page, status]);

  return (
    <div>
      <h2 className="text-h1">Xem xét kết quả kèo</h2>
      <p className="mt-2 text-ink-500">Kiểm tra khai báo và bằng chứng trước khi gửi đề xuất cho Admin.</p>
      <div className="mt-5 grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
        <SurfaceCard className="h-fit">
          <div className="flex items-center justify-between">
            <h3 className="text-h3">Hàng chờ</h3>
            {queue && <Badge tone={queue.total && status === 'provider_review' ? 'warning' : 'neutral'}>{queue.total} hồ sơ</Badge>}
          </div>
          <SelectInput aria-label="Trạng thái hồ sơ" className="mt-3" value={status} onChange={(event) => { setStatus(event.target.value as typeof status); setPage(1); }}>
            <option value="provider_review">Chờ chủ sân đề xuất</option>
            <option value="admin_review">Đã đề xuất - chờ Admin quyết định</option>
            <option value="final">Đã có kết quả</option>
          </SelectInput>
          {queueError ? <p className="mt-3 text-sm text-danger">{queueError}</p>
            : !queue ? <p className="mt-3 text-sm text-ink-500">Đang tải hàng chờ…</p>
            : queue.items.length === 0 ? <p className="mt-3 text-sm text-ink-500">{status === 'provider_review' ? 'Không có hồ sơ nào cần chủ sân xem xét.' : 'Không có hồ sơ nào ở trạng thái này.'}</p>
            : (
              <ul className="mt-3 space-y-2">
                {queue.items.map((item) => (
                  <li key={item.caseId}>
                    <button type="button" onClick={() => setSelectedId(item.caseId)} aria-current={selectedId === item.caseId || undefined}
                      className={`w-full rounded-xl border-2 p-3 text-left ${selectedId === item.caseId ? 'border-brand-navy bg-canvas' : 'border-line'}`}>
                      <span className="block font-semibold text-brand-navy">{queueTitle(item)}</span>
                      {queueContext(item) && <span className="block text-sm text-ink-700">{queueContext(item)}</span>}
                      {item.startAt && <span className="block text-xs text-ink-500">{formatDateTimeVi(item.startAt)}</span>}
                      {item.providerDeadlineAt && <span className="block text-xs text-danger">Hạn đề xuất {formatDateTimeVi(item.providerDeadlineAt)}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          {queue && queue.total > queue.pageSize && <div className="mt-3"><Pagination page={page} pageCount={Math.ceil(queue.total / queue.pageSize)} onChange={setPage} /></div>}
        </SurfaceCard>
        {selectedId && <ProviderCase key={selectedId} caseId={selectedId} />}
      </div>
    </div>
  );
}

function ProviderCase({ caseId }: { caseId: string }) {
  const [detail, setDetail] = useState<ReviewCaseDetail | null>(null);
  const [error, setError] = useState('');
  const [outcome, setOutcome] = useState<MatchOutcome | ''>('');
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const load = useCallback(() => {
    getProviderResultCase(caseId).then(setDetail, (cause) => setError(cause instanceof Error ? cause.message : 'Không thể tải hồ sơ.'));
  }, [caseId]);
  useEffect(load, [load]);
  const countdown = useServerCountdown(detail?.serverNow, detail?.status === 'provider_review' ? detail.providerDeadlineAt : null, load);

  if (error) return <RouteState variant="error" title="Chưa thể mở hồ sơ" description={error} />;
  if (!detail) return <RouteState variant="loading" title="Đang tải hồ sơ" />;
  const submit = async () => {
    if (!outcome) return;
    setPending(true);
    setSubmitError('');
    try {
      await submitProviderRecommendation(detail.matchId, { outcome, reason: reason.trim() });
      load();
    } catch (cause) {
      setSubmitError(cause instanceof Error ? cause.message : 'Không thể gửi đề xuất.');
    } finally {
      setPending(false);
    }
  };
  return (
    <SurfaceCard>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-h2">{queueTitle(detail)}</h3>
          <Badge tone="warning">{RESULT_STATUS_LABELS[detail.status]}</Badge>
        </div>
        {countdown && <div className="text-right"><p className="text-xs text-ink-500">Thời hạn gửi đề xuất</p><p className="text-figures text-xl font-bold text-danger">{countdown}</p></div>}
      </div>
      <div className="mt-4"><CaseSummary detail={detail} /></div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <CaseStatements detail={detail} />
        <SurfaceCard className="h-fit">
          <h3 className="text-h3">Đề xuất của chủ sân</h3>
          {detail.actions.canRecommend ? (
            <>
              <div className="mt-3"><OutcomeChoice detail={detail} value={outcome} onChange={setOutcome} name="provider-outcome" /></div>
              <label className="mt-3 block text-sm font-bold">Lý do đề xuất<TextArea className="mt-1" rows={3} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
              <p className="mt-3 rounded-xl border-l-4 border-brand-yellow bg-warning-bg p-3 text-xs text-ink-700">
                Đề xuất chưa có hiệu lực. Việc gửi đề xuất không chia tiền, không đổi điểm và không tự trở thành kết quả cuối, kể cả khi Admin xử lý trễ.
              </p>
              {submitError && <p role="alert" className="mt-3 text-sm text-danger">{submitError}</p>}
              <AsyncButton className="mt-3 w-full" pending={pending} disabled={!outcome || !reason.trim()} onClick={() => void submit()}>Gửi đề xuất cho Admin</AsyncButton>
            </>
          ) : (
            <div className="mt-3 space-y-2 text-sm">
              <Badge tone="warning">Chờ Admin quyết định</Badge>
              {detail.providerRecommendation && <p>Đề xuất đã gửi - chưa có hiệu lực. Admin sẽ ra quyết định cuối.</p>}
            </div>
          )}
        </SurfaceCard>
      </div>
    </SurfaceCard>
  );
}
