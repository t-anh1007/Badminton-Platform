import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { AsyncButton, Badge, Button, Modal, Pagination, SelectInput, SurfaceCard, TextInput } from '../../components/ui';
import { RouteState } from '../../components/RouteState.js';
import { ImageUploadPicker, type UploadImageState } from '../../components/CommunityComposer.js';
import { useServerCountdown } from '../../components/MatchResultFlow';
import { uploadAuthorizedFile } from '../../lib/communityApi';
import { BANKS } from '../RewardPages';
import { formatDateTimeVi, formatMoneyVnd } from '../../lib/formatters.js';
import {
  authorizePayoutProof, getAdminRewardPayout, listAdminRewardPayouts, markRewardPayoutPaid,
  PAYOUT_STATUS_LABELS, type AdminRewardPayout, type AdminRewardPayoutListItem, type RewardPayoutStatus,
} from '../../lib/rewardApi';

const PROOF_MAX_BYTES = 5 * 1024 * 1024;
const tone = (status: RewardPayoutStatus) => (status === 'paid' ? 'success' as const : status === 'cancelled' ? 'danger' as const : 'warning' as const);

/** Màn 14: danh sách nhận giải và ghi nhận đã chuyển thưởng thủ công; UI không tạo giao dịch ví hay sổ cái. */
export function AdminRewardPayoutsPage() {
  const { payoutId } = useParams();
  return payoutId ? <PayoutDetail payoutId={payoutId} /> : <PayoutList />;
}

function PayoutList() {
  const [params, setParams] = useSearchParams();
  const programId = params.get('programId') ?? undefined;
  const status = (params.get('status') || undefined) as RewardPayoutStatus | undefined;
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [data, setData] = useState<{ items: AdminRewardPayoutListItem[]; total: number; pageSize: number } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setData(null);
    listAdminRewardPayouts({ page, status, programId }).then(setData, (cause) => setError(cause instanceof Error ? cause.message : 'Không thể tải danh sách.'));
  }, [page, status, programId]);
  const update = (key: string, value: string) => setParams((prev) => {
    const next = new URLSearchParams(prev);
    if (value) next.set(key, value); else next.delete(key);
    if (key !== 'page') next.delete('page');
    return next;
  });
  return (
    <>
      <h2 className="text-h1">Danh sách nhận giải</h2>
      <p className="mt-2 text-ink-500">Chuyển thưởng trong 7 ngày kể từ khi người nhận gửi đủ thông tin.</p>
      <div className="mt-5 max-w-xs">
        <SelectInput aria-label="Trạng thái khoản thưởng" value={status ?? ''} onChange={(event) => update('status', event.target.value)}>
          <option value="">Tất cả trạng thái</option>
          {Object.entries(PAYOUT_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </SelectInput>
      </div>
      <SurfaceCard className="mt-4">
        {error ? <p className="text-sm text-danger">{error}</p> : !data ? <p className="text-sm text-ink-500">Đang tải…</p> : data.items.length === 0 ? (
          <p className="text-sm text-ink-500">Không có khoản thưởng nào.</p>
        ) : (
          <ul className="divide-y divide-line">
            {data.items.map((item) => (
              <li key={item.id} className="flex flex-col gap-2 py-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold text-brand-navy">{item.programName}</p>
                  <p className="text-xs text-ink-500">{item.achievementLabel}{item.payoutDeadlineAt ? ` - hạn chuyển ${formatDateTimeVi(item.payoutDeadlineAt)}` : ''}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-figures font-bold">{formatMoneyVnd(item.amount)}</span>
                  <Badge tone={tone(item.status)}>{PAYOUT_STATUS_LABELS[item.status]}</Badge>
                  {item.overdue && <Badge tone="danger">Quá hạn chuyển</Badge>}
                  <Link to={`/admin/reward-payouts/${item.id}`} className="inline-flex min-h-9 items-center rounded-full border border-line px-3 text-sm font-bold text-brand-navy hover:bg-canvas">Xem</Link>
                </div>
              </li>
            ))}
          </ul>
        )}
        {data && data.total > data.pageSize && <div className="mt-3"><Pagination page={page} pageCount={Math.ceil(data.total / data.pageSize)} onChange={(next) => update('page', String(next))} /></div>}
      </SurfaceCard>
    </>
  );
}

function PayoutDetail({ payoutId }: { payoutId: string }) {
  const [payout, setPayout] = useState<AdminRewardPayout & { proofUrl?: string | null } | null>(null);
  const [error, setError] = useState('');
  const [reference, setReference] = useState('');
  const [proof, setProof] = useState<UploadImageState[]>([]);
  const [checked, setChecked] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const load = useCallback(() => {
    getAdminRewardPayout(payoutId).then((result) => setPayout(result.payout), (cause) => setError(cause instanceof Error ? cause.message : 'Không thể tải khoản thưởng.'));
  }, [payoutId]);
  useEffect(load, [load]);
  const countdown = useServerCountdown(payout?.serverNow, payout?.status === 'ready_to_pay' ? payout.payoutDeadlineAt : null, load);

  if (error) return <RouteState variant="error" title="Chưa thể mở khoản thưởng" description={error} />;
  if (!payout) return <RouteState variant="loading" title="Đang tải khoản thưởng" />;
  const uploaded = proof.find((item) => item.status === 'uploaded');
  const receiver = payout.receiver;
  const markPaid = async () => {
    setPending(true);
    setMessage('');
    try {
      await markRewardPayoutPaid(payout.id, { transactionReference: reference.trim(), proofObjectKey: uploaded!.objectKey! });
      setConfirming(false);
      setMessage('Đã ghi nhận trả thưởng.');
      load();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Không thể ghi nhận.'); setConfirming(false); } finally { setPending(false); }
  };
  const fields: Array<[string, string | null]> = [
    ['Ngân hàng', BANKS.find(([code]) => code === receiver.bankCode)?.[1] ?? receiver.bankCode], ['Số tài khoản', receiver.bankAccountNumber],
    ['Tên chủ tài khoản', receiver.bankAccountName], ['Địa chỉ liên hệ', receiver.address],
  ];

  return (
    <>
      <nav className="text-sm text-ink-500" aria-label="Đường dẫn"><Link to={`/admin/reward-payouts?programId=${payout.programId}`} className="font-semibold text-brand-navy">Danh sách nhận giải</Link> / Chi tiết</nav>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-h1">Ghi nhận đã trả thưởng</h2>
        <div className="flex gap-2"><Badge tone={tone(payout.status)}>{PAYOUT_STATUS_LABELS[payout.status]}</Badge>{payout.overdue && <Badge tone="danger">Quá hạn chuyển</Badge>}</div>
      </div>
      <section className="mt-4 grid gap-4 rounded-2xl bg-brand-navy p-5 text-surface sm:grid-cols-4">
        <div><p className="text-xs text-surface/75">Chương trình</p><p className="font-semibold">{payout.programName}</p></div>
        <div><p className="text-xs text-surface/75">Thành tích</p><p className="font-semibold">{payout.achievementLabel}</p></div>
        <div><p className="text-xs text-surface/75">Số tiền</p><p className="text-figures text-xl font-bold text-brand-yellow">{formatMoneyVnd(payout.amount)}</p></div>
        <div><p className="text-xs text-surface/75">Hạn chuyển thưởng</p><p className="font-semibold">{payout.payoutDeadlineAt ? formatDateTimeVi(payout.payoutDeadlineAt) : 'Chờ người nhận bổ sung'}</p></div>
      </section>
      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <SurfaceCard className="h-fit">
          <h3 className="text-h3">Thông tin người nhận</h3>
          {payout.informationComplete ? (
            <>
              <p className="mt-2 font-semibold text-brand-navy">{receiver.recipientName}</p>
              <p className="text-sm text-ink-500">{receiver.email} - {receiver.phone}</p>
              <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                {fields.map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-line p-3"><dt className="text-xs text-ink-500">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>
                ))}
              </dl>
              {countdown && (
                <div className="mt-3 flex items-center justify-between rounded-xl bg-danger-bg p-3">
                  <span className="text-sm text-danger">Thời gian còn lại để chuyển thưởng</span>
                  <span className="text-figures text-xl font-bold text-danger">{countdown}</span>
                </div>
              )}
            </>
          ) : <p className="mt-2 text-sm text-ink-500">Người nhận chưa gửi đủ thông tin nhận thưởng.</p>}
        </SurfaceCard>
        <SurfaceCard className="h-fit">
          <h3 className="text-h3">Thông tin giao dịch</h3>
          {payout.status === 'paid' ? (
            <dl className="mt-3 divide-y divide-line text-sm">
              <div className="flex justify-between py-2"><dt>Thời điểm chuyển</dt><dd className="font-semibold">{payout.paidAt ? formatDateTimeVi(payout.paidAt) : '—'}</dd></div>
              <div className="flex justify-between py-2"><dt>Mã giao dịch</dt><dd className="font-semibold">{payout.transactionReference}</dd></div>
              {payout.proofUrl && <div className="py-2"><a href={payout.proofUrl} target="_blank" rel="noreferrer" className="font-bold text-brand-navy underline">Xem chứng từ chuyển khoản</a></div>}
            </dl>
          ) : payout.status !== 'ready_to_pay' ? (
            <p className="mt-2 text-sm text-ink-500">Chỉ ghi nhận trả thưởng khi người nhận đã gửi đủ thông tin.</p>
          ) : (
            <>
              <p className="mt-1 text-sm text-ink-500">Mã giao dịch và ảnh chứng từ là bắt buộc.</p>
              <label className="mt-3 block text-sm font-bold">Mã giao dịch ngân hàng<TextInput className="mt-1" value={reference} onChange={(event) => setReference(event.target.value)} /></label>
              <p className="mt-3 text-sm font-bold">Ảnh chứng từ chuyển khoản (tối đa 5 MB)</p>
              <div className="mt-1"><ImageUploadPicker label="Tải ảnh chứng từ" maxFiles={1} maxBytes={PROOF_MAX_BYTES} authorize={authorizePayoutProof} upload={uploadAuthorizedFile} onUploadedChange={setProof} /></div>
              <p className="mt-3 rounded-xl border-l-4 border-brand-yellow bg-warning-bg p-3 text-xs text-ink-700">Khi đánh dấu đã trả, hệ thống lưu người thao tác, thời gian, mã giao dịch và chứng từ, đồng thời thông báo cho người nhận.</p>
              <label className="mt-3 flex gap-2 rounded-xl border border-line p-3 text-sm">
                <input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} />
                <span>Tôi đã đối chiếu đúng người nhận và số tiền</span>
              </label>
              <Button className="mt-3 w-full" disabled={!checked || !reference.trim() || !uploaded} onClick={() => setConfirming(true)}>Đánh dấu đã trả thưởng</Button>
            </>
          )}
          {message && <p role="status" className={`mt-3 text-sm ${message.startsWith('Đã') ? 'text-success' : 'text-danger'}`}>{message}</p>}
        </SurfaceCard>
      </div>
      <Modal open={confirming} title="Xác nhận đã trả thưởng" onClose={() => setConfirming(false)}>
        <p className="text-sm">Đã chuyển <strong>{formatMoneyVnd(payout.amount)}</strong> cho <strong>{receiver.recipientName}</strong> ({BANKS.find(([code]) => code === receiver.bankCode)?.[1] ?? receiver.bankCode} - {receiver.bankAccountNumber}), mã giao dịch <strong>{reference.trim()}</strong>. Thao tác này không hoàn tác được.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button tone="secondary" onClick={() => setConfirming(false)}>Quay lại</Button>
          <AsyncButton pending={pending} onClick={() => void markPaid()}>Xác nhận đã trả</AsyncButton>
        </div>
      </Modal>
    </>
  );
}
