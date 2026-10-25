import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AsyncButton, Badge, Button, Pagination, SegmentedControl, SurfaceCard, TextArea } from '../../components/ui';
import { RouteState } from '../../components/RouteState.js';
import { RESULT_STATUS_LABELS } from '../../components/MatchResultFlow';
import { CaseStatements, CaseSummary, OutcomeChoice, outcomeText, queueContext, queueTitle } from '../../components/ResultCaseReview';
import { formatDateTimeVi, formatMoneyVnd } from '../../lib/formatters.js';
import { ADMIN_VIOLATION_KINDS, decideAdminResultV2, type AdminReason, type AdminViolationKind, type Level } from '../../lib/resultApi';
import { ADMIN_REASON_LABEL, PhotoCaseReview, VIOLATION_LABEL, isPhotoReview } from '../../components/result/admin/PhotoCaseReview';
import { LEVEL_TEXT } from '../../components/result/shared';
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

  // Luồng ảnh: lọc theo lý do vào hàng chờ và mức của bản đề xuất (plan web B7).
  const [reason, setReason] = useState<AdminReason | ''>('');
  const [level, setLevel] = useState<Level | ''>('');
  useEffect(() => {
    const filtered = reason || level;
    (filtered ? listAdminResultCases(page, status, { reason, level }) : listAdminResultCases(page, status))
      .then(setQueue, (cause) => setQueueError(cause instanceof Error ? cause.message : 'Không thể tải hồ sơ.'));
  }, [page, version, status, reason, level]);

  return (
    <>
      <h1 className="text-h2">Tranh chấp kèo</h1>
      <div className="mt-4"><SegmentedControl options={[{ value: 'admin_review', label: `Cần quyết định${status === 'admin_review' && queue?.total ? ` · ${queue.total}` : ''}` }, { value: 'final', label: 'Đã chốt' }]} value={status} onChange={(next) => { setStatus(next); setPage(1); setSelectedId(null); }} /></div>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Lọc theo lý do">
        {(['', ...Object.keys(ADMIN_REASON_LABEL)] as Array<AdminReason | ''>).map((value) => (
          <button key={value || 'all'} type="button" aria-pressed={reason === value} onClick={() => { setReason(value); setPage(1); setSelectedId(null); }}
            className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${reason === value ? 'border-brand-navy bg-brand-navy text-surface' : 'border-line bg-surface text-ink-700'}`}>
            {value ? ADMIN_REASON_LABEL[value] : 'Mọi lý do'}
          </button>
        ))}
        <span className="mx-1 w-px self-stretch bg-line" aria-hidden="true" />
        {(['', 'red', 'yellow', 'green'] as Array<Level | ''>).map((value) => (
          <button key={value || 'any'} type="button" aria-pressed={level === value} onClick={() => { setLevel(value); setPage(1); setSelectedId(null); }}
            className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${level === value ? 'border-brand-navy bg-brand-navy text-surface' : 'border-line bg-surface text-ink-700'}`}>
            {value ? LEVEL_TEXT[value] : 'Mọi mức'}
          </button>
        ))}
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <SurfaceCard className="h-fit !p-2">
          {queueError ? <p className="mt-3 text-sm text-danger">{queueError}</p>
            : !queue ? <p className="mt-3 text-sm text-ink-500">Đang tải…</p>
            : queue.items.length === 0 ? <p className="mt-3 text-sm text-ink-500">{status === 'admin_review' ? 'Không có hồ sơ chờ quản trị viên quyết định.' : 'Chưa có hồ sơ nào đã có kết quả.'}</p>
            : (
              <ul className="space-y-1">
                {queue.items.map((item) => (
                  <li key={item.caseId}>
                    <button type="button" onClick={() => setSelectedId(item.caseId)} aria-current={selectedId === item.caseId || undefined}
                      className={`w-full rounded-xl p-3 text-left transition ${selectedId === item.caseId ? 'bg-green-50 ring-1 ring-brand-navy/30' : 'hover:bg-canvas'}`}>
                      <span className="block font-bold text-ink-900">{queueTitle(item)}</span>
                      {queueContext(item) && <span className="block text-sm text-ink-700">{queueContext(item)}</span>}
                      {item.startAt && <span className="block text-xs text-ink-500">{formatDateTimeVi(item.startAt)}</span>}
                      {(item.adminReason || item.level) && (
                        <span className="mt-1 flex flex-wrap gap-1">
                          {item.adminReason && <Badge>{ADMIN_REASON_LABEL[item.adminReason]}</Badge>}
                          {item.level && <Badge tone={item.level === 'red' ? 'danger' : item.level === 'yellow' ? 'warning' : 'success'}>{LEVEL_TEXT[item.level]}</Badge>}
                        </span>
                      )}
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
  // Luồng ảnh (BR-RA-39, 51): đánh giá kháng nghị và vi phạm Admin xác nhận.
  const [appealGrounded, setAppealGrounded] = useState<boolean | undefined>(undefined);
  const [violations, setViolations] = useState<Record<string, AdminViolationKind | ''>>({});
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
  const photo = isPhotoReview(detail) ? detail : null;
  const openAppeal = photo?.appeals.some((appeal) => appeal.accepted) ?? false;
  const chosenViolations = Object.entries(violations).flatMap(([userId, kind]) => (kind ? [{ userId, kind }] : []));
  const confirm = () => run(async () => {
    const body = { outcome: preview!.outcome, reason: preview!.reason, caseVersion: preview!.caseVersion, previewToken: preview!.previewToken };
    if (photo) await decideAdminResultV2(detail.matchId, { ...body, ...(openAppeal && appealGrounded !== undefined ? { appealGrounded } : {}), ...(chosenViolations.length ? { violations: chosenViolations } : {}) });
    else await decideAdminResult(detail.matchId, body);
    setMessage('Đã xác nhận quyết định cuối.');
    onDecided();
  });

  return (
    <div className="space-y-4">
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
          {photo ? <PhotoCaseReview detail={photo} /> : <CaseStatements detail={detail} />}
        </div>
        <SurfaceCard className="h-fit">
          <h3 className="text-h3">Kết quả bạn sắp xác nhận</h3>
          {!detail.actions.canPreviewDecision ? (
            <p className="mt-3 text-sm text-ink-500">Hồ sơ không còn ở bước quản trị viên quyết định.</p>
          ) : (
            <>
              <p className="mt-1 text-sm text-ink-500">Đây là quyết định cuối và chỉ áp dụng sau bước xác nhận.</p>
              <div className="mt-3"><OutcomeChoice detail={detail} value={outcome} onChange={choose} name="admin-outcome" /></div>
              <label className="mt-3 block text-sm font-bold">Lý do quyết định cuối
                <TextArea className="mt-1" rows={3} value={reason}
                  onChange={(event) => { setReason(event.target.value); setPreview(null); setChecked(false); }} />
              </label>
              {isPhotoReview(detail) && <p className="mt-1 text-xs text-ink-500">Cả kèo đọc được lý do này. Không ghi uy tín hay ghi chú nội bộ.</p>}
              <Button tone="secondary" className="mt-3 w-full" disabled={pending || !outcome || !reason.trim() || previewMatches} onClick={() => void loadPreview()}>Xem trước tác động</Button>
              {previewMatches && preview && (
                <dl className="mt-3 divide-y divide-line text-sm">
                  {preview.rows.map((row) => (
                    <div key={row.userId} className="flex justify-between gap-3 py-2">
                      <dt>{row.displayName} nhận lại</dt>
                      <dd className="text-right"><span className="text-figures font-bold">{formatMoneyVnd(row.amount)}</span>{BigInt(row.amount) > 0n && <> <Badge tone="success">Có thể rút</Badge></>}</dd>
                    </div>
                  ))}
                  <div className="flex justify-between py-2"><dt>Điểm kinh nghiệm</dt><dd className="font-semibold">{preview.ratingEffect === 'apply_ranked_result' ? 'Cập nhật theo kết quả' : 'Không thay đổi'}</dd></div>
                  <div className="flex justify-between py-2"><dt>Doanh thu booking</dt><dd className="font-semibold">Không thay đổi</dd></div>
                </dl>
              )}
              {photo && openAppeal && (
                <fieldset className="mt-3">
                  <legend className="text-sm font-bold">Kháng nghị</legend>
                  <div className="mt-1"><SegmentedControl options={[{ value: 'yes', label: 'Có căn cứ' }, { value: 'no', label: 'Không có căn cứ' }]}
                    value={appealGrounded === undefined ? '' as 'yes' : appealGrounded ? 'yes' : 'no'} onChange={(next) => setAppealGrounded(next === 'yes')} /></div>
                  <p className="mt-1 text-xs text-ink-500">Giữ nguyên kết quả và chọn “Không có căn cứ”: hệ thống tự ghi 1 vi phạm cho người kháng nghị.</p>
                </fieldset>
              )}
              {photo && (
                <fieldset className="mt-3 grid gap-2">
                  <legend className="text-sm font-bold">Ghi vi phạm</legend>
                  {detail.match.teams.flatMap((team) => team.players).map((player) => (
                    <label key={player.userId} className="grid grid-cols-[minmax(0,1fr)_170px] items-center gap-2 text-sm">
                      <span className="truncate">{player.displayName}</span>
                      <select aria-label={`Vi phạm của ${player.displayName}`} value={violations[player.userId] ?? ''} className="rounded-lg border border-line bg-surface px-2 py-1.5"
                        onChange={(event) => setViolations((current) => ({ ...current, [player.userId]: event.target.value as AdminViolationKind | '' }))}>
                        <option value="">Không ghi</option>
                        {ADMIN_VIOLATION_KINDS.map((kind) => <option key={kind} value={kind}>{VIOLATION_LABEL[kind]}</option>)}
                      </select>
                    </label>
                  ))}
                </fieldset>
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
