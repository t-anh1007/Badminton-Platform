import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AsyncButton, Badge, Button, Pagination, SelectInput, SurfaceCard, TextArea } from '../../components/ui';
import { RouteState } from '../../components/RouteState.js';
import { RESULT_STATUS_LABELS } from '../../components/MatchResultFlow';
import { CaseStatements, CaseSummary, OutcomeChoice, outcomeText, queueContext, queueTitle } from '../../components/ResultCaseReview';
import { formatDateTimeVi, formatMoneyVnd } from '../../lib/formatters.js';
import {
  decideAdminResult, getAdminResultCase, listAdminResultCases, previewAdminDecision,
  type AdminDecisionPreview, type MatchOutcome, type ReviewCaseDetail, type ReviewQueueItem,
} from '../../lib/matchApi';

/** Màn 10: Admin quyết định cuối qua hai bước - xem trước tác động rồi xác nhận đúng bản xem trước. */
export function AdminMatchResultsPage() {
  const [page, setPage] = useState(1);
  // Mặc định hồ sơ cần quyết định; "Đã có kết quả" chỉ để xem lại.
  const [status, setStatus] = useState<'admin_review' | 'final'>('admin_review');
  const [queue, setQueue] = useState<{ items: ReviewQueueItem[]; total: number; pageSize: number } | null>(null);
  const [queueError, setQueueError] = useState('');
  // Hồ sơ đang xem nằm trên URL (?caseId=) để link thông báo mở đúng hồ sơ, kể cả khi nằm ngoài trang hàng chờ hiện tại.
  const [params, setParams] = useSearchParams();
  const linkedId = params.get('caseId');
  const [version, setVersion] = useState(0);
  const selectedId = linkedId ?? queue?.items[0]?.caseId ?? null;
  const setSelectedId = (caseId: string | null) => setParams((prev) => {
    const next = new URLSearchParams(prev);
    if (caseId) next.set('caseId', caseId); else next.delete('caseId');
    return next;
  });

  useEffect(() => {
    listAdminResultCases(page, status).then(setQueue, (cause) => setQueueError(cause instanceof Error ? cause.message : 'Không thể tải hồ sơ.'));
  }, [page, version, status]);

  return (
    <>
      <h2 className="text-h1">Tranh chấp kèo</h2>
      <p className="mt-2 text-ink-500">Kiểm tra hồ sơ và tác động trước khi xác nhận quyết định cuối.</p>
      <div className="mt-5 grid gap-5 2xl:grid-cols-[260px_minmax(0,1fr)]">
        <SurfaceCard className="h-fit">
          <div className="flex items-center justify-between">
            <h3 className="text-h3">{status === 'admin_review' ? 'Cần quyết định' : 'Đã có kết quả'}</h3>
            {queue && <Badge tone={queue.total && status === 'admin_review' ? 'warning' : 'neutral'}>{queue.total}</Badge>}
          </div>
          <SelectInput aria-label="Trạng thái hồ sơ" className="mt-3" value={status} onChange={(event) => { setStatus(event.target.value as typeof status); setPage(1); }}>
            <option value="admin_review">Cần quyết định</option>
            <option value="final">Đã có kết quả</option>
          </SelectInput>
          {queueError ? <p className="mt-3 text-sm text-danger">{queueError}</p>
            : !queue ? <p className="mt-3 text-sm text-ink-500">Đang tải…</p>
            : queue.items.length === 0 ? <p className="mt-3 text-sm text-ink-500">{status === 'admin_review' ? 'Không có hồ sơ chờ Admin quyết định.' : 'Chưa có hồ sơ nào đã có kết quả.'}</p>
            : (
              <ul className="mt-3 space-y-2">
                {queue.items.map((item) => (
                  <li key={item.caseId}>
                    <button type="button" onClick={() => setSelectedId(item.caseId)} aria-current={selectedId === item.caseId || undefined}
                      className={`w-full rounded-xl border-2 p-3 text-left ${selectedId === item.caseId ? 'border-brand-navy bg-canvas' : 'border-line'}`}>
                      <span className="block font-semibold text-brand-navy">{queueTitle(item)}</span>
                      {queueContext(item) && <span className="block text-sm text-ink-700">{queueContext(item)}</span>}
                      {item.startAt && <span className="block text-xs text-ink-500">{formatDateTimeVi(item.startAt)}</span>}
                      {item.adminOverdue && <Badge tone="danger" className="mt-1">Quá hạn 48 giờ</Badge>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          {queue && queue.total > queue.pageSize && <div className="mt-3"><Pagination page={page} pageCount={Math.ceil(queue.total / queue.pageSize)} onChange={setPage} /></div>}
        </SurfaceCard>
        {selectedId && <AdminCase key={selectedId} caseId={selectedId} onDecided={() => { setSelectedId(null); setVersion((value) => value + 1); }} />}
      </div>
    </>
  );
}

function AdminCase({ caseId, onDecided }: { caseId: string; onDecided: () => void }) {
  const [detail, setDetail] = useState<ReviewCaseDetail | null>(null);
  const [error, setError] = useState('');
  const [outcome, setOutcome] = useState<MatchOutcome | ''>('');
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState<AdminDecisionPreview | null>(null);
  const [checked, setChecked] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const load = useCallback(() => {
    getAdminResultCase(caseId).then(setDetail, (cause) => setError(cause instanceof Error ? cause.message : 'Không thể tải hồ sơ.'));
  }, [caseId]);
  useEffect(load, [load]);

  if (error) return <RouteState variant="error" title="Chưa thể mở hồ sơ" description={error} />;
  if (!detail) return <RouteState variant="loading" title="Đang tải hồ sơ" />;
  // Xác nhận chỉ mở khi bản xem trước khớp đúng lựa chọn, lý do và version hiện tại.
  const previewMatches = preview !== null && preview.outcome === outcome && preview.reason === reason.trim() && preview.caseVersion === detail.version;
  const choose = (next: MatchOutcome) => { setOutcome(next); setPreview(null); setChecked(false); };
  const run = async (operation: () => Promise<void>) => {
    setPending(true);
    setMessage('');
    try { await operation(); } catch (cause) {
      const text = cause instanceof Error ? cause.message : 'Không thể xử lý.';
      setMessage(text);
      // Hồ sơ đổi version: tải lại và bắt buộc xem trước lần nữa.
      setPreview(null);
      setChecked(false);
      load();
    } finally { setPending(false); }
  };
  const loadPreview = () => run(async () => { setPreview(await previewAdminDecision(detail.matchId, { outcome: outcome as MatchOutcome, reason: reason.trim() })); });
  const confirm = () => run(async () => {
    await decideAdminResult(detail.matchId, { outcome: preview!.outcome, reason: preview!.reason, caseVersion: preview!.caseVersion, previewToken: preview!.previewToken });
    setMessage('Đã xác nhận quyết định cuối.');
    onDecided();
  });
  const steps = ['Xem hồ sơ', 'Chọn kết quả', 'Kiểm tra và xác nhận'];
  const step = previewMatches ? 3 : outcome ? 2 : 1;

  return (
    <div className="space-y-4">
      <ol className="grid gap-2 sm:grid-cols-3" aria-label="Các bước quyết định">
        {steps.map((label, index) => (
          <li key={label} aria-current={step === index + 1 ? 'step' : undefined}
            className={`rounded-xl border p-3 text-sm ${step === index + 1 ? 'border-brand-navy bg-canvas font-bold text-brand-navy' : 'border-line text-ink-500'}`}>
            {index + 1}. {label}
          </li>
        ))}
      </ol>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <SurfaceCard>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-h2">{queueTitle(detail)}</h3>
              <div className="flex gap-2">
                <Badge tone="warning">{RESULT_STATUS_LABELS[detail.status]}</Badge>
                {detail.adminOverdue && <Badge tone="danger">Quá hạn 48 giờ</Badge>}
              </div>
            </div>
            <div className="mt-4"><CaseSummary detail={detail} /></div>
            {detail.providerRecommendation && (
              <div className="mt-4 rounded-xl bg-canvas p-4">
                <div className="flex flex-wrap justify-between gap-2">
                  <p className="text-xs text-ink-500">Đề xuất của chủ sân</p>
                  <p className="text-xs font-bold text-danger">Đề xuất - chưa có hiệu lực</p>
                </div>
                <p className="mt-1 font-semibold text-brand-navy">{outcomeText(detail, detail.providerRecommendation.outcome)}</p>
                <p className="text-sm text-ink-700">{detail.providerRecommendation.reason}</p>
              </div>
            )}
          </SurfaceCard>
          <CaseStatements detail={detail} />
          <SurfaceCard>
            <label className="block text-sm font-bold">Lý do quyết định cuối
              <TextArea className="mt-1" rows={3} value={reason} disabled={!detail.actions.canPreviewDecision}
                onChange={(event) => { setReason(event.target.value); setPreview(null); setChecked(false); }} />
            </label>
          </SurfaceCard>
        </div>
        <SurfaceCard className="h-fit">
          <h3 className="text-h3">Kết quả bạn sắp xác nhận</h3>
          {!detail.actions.canPreviewDecision ? (
            <p className="mt-3 text-sm text-ink-500">Hồ sơ không còn ở bước Admin quyết định.</p>
          ) : (
            <>
              <p className="mt-1 text-sm text-ink-500">Đây là quyết định cuối và chỉ áp dụng sau bước xác nhận.</p>
              <div className="mt-3"><OutcomeChoice detail={detail} value={outcome} onChange={choose} name="admin-outcome" /></div>
              <Button tone="secondary" className="mt-3 w-full" disabled={pending || !outcome || !reason.trim() || previewMatches} onClick={() => void loadPreview()}>Xem trước tác động</Button>
              {previewMatches && preview && (
                <dl className="mt-3 divide-y divide-line text-sm">
                  {preview.rows.map((row) => (
                    <div key={row.userId} className="flex justify-between gap-3 py-2">
                      <dt>{row.displayName} nhận lại</dt>
                      <dd className="text-right"><span className="text-figures font-bold">{formatMoneyVnd(row.amount)}</span>{BigInt(row.amount) > 0n && <> <Badge tone="success">Có thể rút</Badge></>}</dd>
                    </div>
                  ))}
                  <div className="flex justify-between py-2"><dt>Điểm xếp hạng</dt><dd className="font-semibold">{preview.ratingEffect === 'apply_ranked_result' ? 'Cập nhật theo kết quả' : 'Không thay đổi'}</dd></div>
                  <div className="flex justify-between py-2"><dt>Doanh thu booking</dt><dd className="font-semibold">Không thay đổi</dd></div>
                </dl>
              )}
              <p className="mt-3 rounded-xl border-l-4 border-brand-yellow bg-warning-bg p-3 text-xs text-ink-700">
                Sau khi xác nhận, hệ thống mới áp dụng kết quả, phân bổ tiền và gửi thông báo cho người chơi. Quá hạn xử lý chỉ tăng mức nhắc; tiền và kết quả vẫn khóa đến khi Admin xác nhận.
              </p>
              <label className="mt-3 flex gap-2 rounded-xl border border-line p-3 text-sm">
                <input type="checkbox" checked={checked} disabled={!previewMatches} onChange={(event) => setChecked(event.target.checked)} />
                <span>Tôi đã kiểm tra kết quả và tác động</span>
              </label>
              {message && <p role="status" className={`mt-3 text-sm ${message.startsWith('Đã') ? 'text-success' : 'text-danger'}`}>{message}</p>}
              <AsyncButton className="mt-3 w-full" pending={pending} disabled={!previewMatches || !checked} onClick={() => void confirm()}>Xác nhận quyết định cuối</AsyncButton>
            </>
          )}
        </SurfaceCard>
      </div>
    </div>
  );
}
