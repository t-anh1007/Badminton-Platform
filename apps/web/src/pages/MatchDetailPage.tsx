import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, EmptyState, Modal, SelectInput, Skeleton, SurfaceCard, Toast } from '../components/ui';
import {
  approveMatchJoin,
  cancelMatch,
  getMatchDetail,
  listPendingMatchJoins,
  rejectMatchJoin,
  requestMatchJoin,
  withdrawMatchJoin,
  type MatchDetail,
  type PendingJoin,
  type SkillTier,
} from '../lib/matchApi';
import {
  createMatchOrganizerContributionSepayIntent,
  createMatchJoinSepayIntent,
  payMatchOrganizerContributionBalance,
  payMatchJoinBalance,
} from '../lib/financeApi';

const tierLabels: Record<SkillTier, string> = {
  newcomer: 'Mới chơi',
  beginner: 'Yếu',
  intermediate: 'Trung bình',
  intermediate_plus: 'Trung bình khá',
  advanced: 'Bán chuyên',
};
const money = (value: string) => (Number(value) === 0 ? 'Miễn phí' : `${Number(value).toLocaleString('vi-VN')}₫`);

export function MatchDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<MatchDetail | null>(null);
  const [pending, setPending] = useState<PendingJoin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmAction, setConfirmAction] = useState<'withdraw' | 'cancel' | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'balance' | 'sepay'>('balance');
  const [sepay, setSepay] = useState<{
    matchCode: string;
    amount: string;
    purpose: 'participant' | 'organizer';
  } | null>(null);
  const [now, setNow] = useState(Date.now());
  const expiredApprovalReloaded = useRef<string | null>(null);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const next = await getMatchDetail(id);
      setDetail(next);
      if (next.actions.isOrganizer) {
        const result = await listPendingMatchJoins(id);
        setPending(result.joins);
      } else setPending([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải chi tiết kèo.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, [id]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  const remaining = useMemo(
    () =>
      detail?.actions.ownJoin?.status === 'approved' && detail.actions.ownJoin.approvedAt
        ? Math.max(0, new Date(detail.actions.ownJoin.approvedAt).getTime() + 10 * 60_000 - now)
        : 0,
    [detail, now],
  );
  useEffect(() => {
    const approvedJoin = detail?.actions.ownJoin;
    if (approvedJoin?.status !== 'approved') {
      expiredApprovalReloaded.current = null;
      return;
    }
    if (remaining === 0 && expiredApprovalReloaded.current !== approvedJoin.id) {
      expiredApprovalReloaded.current = approvedJoin.id;
      void load();
    }
  }, [remaining, detail?.actions.ownJoin?.id, detail?.actions.ownJoin?.status]);

  const mutate = async (operation: () => Promise<unknown>, success: string) => {
    try {
      await operation();
      setNotice(success);
      setConfirmAction(null);
      await load();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Không thể hoàn tất thao tác.');
    }
  };
  const payParticipant = async () => {
    const join = detail?.actions.ownJoin;
    if (!detail || !join) return;
    try {
      if (paymentMethod === 'balance') {
        await payMatchJoinBalance(detail.id, join.id);
        setNotice('Đã thanh toán phí tham gia bằng số dư.');
        await load();
      } else {
        const intent = await createMatchJoinSepayIntent(detail.id, join.id);
        setSepay({ ...intent, purpose: 'participant' });
      }
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Thanh toán chưa thành công.');
    }
  };
  const payOrganizer = async () => {
    if (!detail?.actions.canPayOrganizerContribution) return;
    try {
      if (paymentMethod === 'balance') {
        await payMatchOrganizerContributionBalance(detail.id);
        setNotice('Đã thanh toán phần organizer bằng số dư.');
        await load();
      } else {
        const intent = await createMatchOrganizerContributionSepayIntent(detail.id);
        setSepay({ ...intent, purpose: 'organizer' });
      }
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Thanh toán phần organizer chưa thành công.');
    }
  };

  if (loading || !detail)
    return (
      <div className="page-container py-8">
        <h1 className="text-h1">Chi tiết kèo</h1>
        <p className="mt-2 text-sm text-ink-500">Đang tải trạng thái tham gia</p>
        {error ? (
          <div className="mt-6">
            <EmptyState
              title="Không thể mở kèo"
              description={error}
              action={<Button onClick={() => void load()}>Thử lại</Button>}
            />
          </div>
        ) : (
          <div className="mt-6 grid gap-5 lg:grid-cols-[1.5fr_1fr]">
            <Skeleton className="h-96" />
            <Skeleton className="h-72" />
          </div>
        )}
      </div>
    );
  const join = detail.actions.ownJoin;
  const isFull = detail.openSlots <= 0;
  const requestJoin = () => {
    if (!window.localStorage.getItem('accessToken')) {
      navigate('/auth');
      return;
    }
    void mutate(() => requestMatchJoin(detail.id), 'Đã gửi yêu cầu; organizer sẽ duyệt trước khi mở giữ chỗ 10 phút.');
  };

  return (
    <div className="page-container pb-28 pt-8 sm:pt-10">
      {notice && <Toast message={notice} tone={notice.startsWith('Đã') ? 'success' : 'error'} />}
      <button className="text-sm font-semibold text-brand-navy" onClick={() => navigate('/matches')}>
        ← Danh sách kèo
      </button>
      <div className="mt-4 grid gap-5 lg:grid-cols-[1.55fr_1fr]">
        <div className="space-y-5">
          <SurfaceCard>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="courtin-kicker">Chi tiết kèo</p>
                <h1 className="mt-1 text-h1">
                  {detail.venue.name} · {detail.court.name}
                </h1>
              </div>
              <Badge tone={isFull ? 'warning' : 'success'}>{isFull ? 'Đã đầy' : `Còn ${detail.openSlots} chỗ`}</Badge>
            </div>
            <div className="mt-6 grid gap-4 border-y border-line py-5 sm:grid-cols-2">
              <div>
                <p className="text-caption">Thời gian</p>
                <p className="mt-1 font-medium">{new Date(detail.startAt).toLocaleString('vi-VN')}</p>
              </div>
              <div>
                <p className="text-caption">Phí tham gia</p>
                <p className="text-figures mt-1 font-semibold text-brand-navy">{money(detail.feePerSlot)}</p>
              </div>
              <div>
                <p className="text-caption">Organizer</p>
                <p className="mt-1 font-medium">
                  {detail.organizer.displayName}{' '}
                  {detail.organizer.tier && <Badge>{tierLabels[detail.organizer.tier]}</Badge>}
                </p>
              </div>
              <div>
                <p className="text-caption">Trình độ phù hợp</p>
                <p className="mt-1 font-medium">
                  {detail.skillMin ? tierLabels[detail.skillMin] : 'Mọi bậc'} –{' '}
                  {detail.skillMax ? tierLabels[detail.skillMax] : 'Mọi bậc'}
                </p>
              </div>
            </div>
            <p className="mt-5 text-sm text-ink-500">{detail.venue.address}</p>
            <a
              className="mt-2 inline-block text-sm font-semibold text-brand-navy"
              target="_blank"
              rel="noreferrer"
              href={`https://www.google.com/maps/search/?api=1&query=${detail.venue.lat},${detail.venue.lng}`}
            >
              Xem bản đồ ↗
            </a>
          </SurfaceCard>
          {detail.actions.isOrganizer && (
            <SurfaceCard>
              <div className="flex items-center justify-between">
                <h2 className="text-h2">Duyệt yêu cầu</h2>
                <Badge>{pending.length} pending</Badge>
              </div>
              {pending.length === 0 ? (
                <p className="mt-4 text-sm text-ink-500">Chưa có yêu cầu đang chờ.</p>
              ) : (
                <div className="mt-4 space-y-3">
                  {pending.map((item) => (
                    <div key={item.id} className="rounded-xl border border-line p-4">
                      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                        <div>
                          <p className="font-medium">Người chơi · {item.participantUserId.slice(0, 8)}</p>
                          <p className="text-caption">
                            {item.participantTier ? tierLabels[item.participantTier] : 'Chưa có hồ sơ trình độ'} · Hợp{' '}
                            {Math.round(item.compatibilityScore)}%
                          </p>
                          <p className="mt-1 text-sm text-ink-500">{item.compatibilityExplanation}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            tone="secondary"
                            size="sm"
                            onClick={() =>
                              void mutate(() => rejectMatchJoin(detail.id, item.id), 'Đã từ chối yêu cầu.')
                            }
                          >
                            Từ chối
                          </Button>
                          <Button
                            size="sm"
                            onClick={() =>
                              void mutate(
                                () => approveMatchJoin(detail.id, item.id),
                                'Đã duyệt; hold thanh toán 10 phút đã mở nếu kèo có phí.',
                              )
                            }
                          >
                            Duyệt
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SurfaceCard>
          )}
        </div>
        <aside className="space-y-5">
          <SurfaceCard>
            <h2 className="text-h2">Người chơi</h2>
            <p className="text-figures mt-4 text-3xl font-bold text-brand-navy">
              {detail.confirmedParticipants + 1}/{detail.capacity}
            </p>
            <p className="mt-1 text-sm text-ink-500">
              Organizer và người chơi đã xác nhận. Danh tính người tham gia được giữ riêng tư.
            </p>
            <div className="mt-4 flex -space-x-2">
              <span className="grid h-10 w-10 place-items-center rounded-full border-2 border-surface bg-brand-navy font-bold text-white">
                {detail.organizer.displayName.slice(0, 1)}
              </span>
              {Array.from({ length: detail.confirmedParticipants }, (_, index) => (
                <span
                  key={index}
                  className="grid h-10 w-10 place-items-center rounded-full border-2 border-surface bg-brand-yellow text-xs font-bold text-brand-navy"
                >
                  ✓
                </span>
              ))}
            </div>
          </SurfaceCard>
          <SurfaceCard>
            <h2 className="text-h3">Sân thi đấu</h2>
            <p className="mt-2 font-medium">{detail.venue.name}</p>
            <p className="text-sm text-ink-500">
              {detail.court.name} · {detail.venue.address}
            </p>
          </SurfaceCard>
        </aside>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 p-3 shadow-[0_-6px_24px_rgb(20_30_40_/_8%)] backdrop-blur">
        <div className="page-container flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            {detail.actions.isOrganizer ? (
              <>
                <p className="font-semibold">Bạn là organizer</p>
                <p className="text-sm text-ink-500">
                  {detail.actions.canPayOrganizerContribution
                    ? 'Người chơi đã đóng đủ; thanh toán phần organizer để xác nhận sân.'
                    : detail.status === 'filled'
                      ? 'Đang đối soát phần organizer trước khi xác nhận sân.'
                      : 'Duyệt yêu cầu hoặc hủy kèo theo quy tắc hiện hành.'}
                </p>
              </>
            ) : join?.status === 'pending' ? (
              <>
                <p className="font-semibold">Chờ tổ chức duyệt</p>
                <p className="text-sm text-ink-500">Chưa trừ tiền và chưa giữ chỗ thanh toán.</p>
              </>
            ) : join?.status === 'approved' ? (
              <>
                <p className="font-semibold">
                  Hold thanh toán còn{' '}
                  <span className="text-figures text-green-700">
                    {String(Math.floor(remaining / 60_000)).padStart(2, '0')}:
                    {String(Math.floor((remaining % 60_000) / 1000)).padStart(2, '0')}
                  </span>
                </p>
                <p className="text-sm text-ink-500">Chọn số dư hoặc SePay; hết hạn sẽ trở lại pending.</p>
              </>
            ) : join?.status === 'confirmed' ? (
              <>
                <p className="font-semibold">Đã tham gia</p>
                <p className="text-sm text-ink-500">Rút kèo tuân theo cutoff và trạng thái booking.</p>
              </>
            ) : (
              <>
                <p className="font-semibold">{isFull ? 'Kèo đã đủ người' : 'Gửi yêu cầu tham gia'}</p>
                <p className="text-sm text-ink-500">Organizer duyệt trước, sau đó mới mở hold 10 phút.</p>
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {detail.actions.isOrganizer ? (
              <>
                {detail.actions.canPayOrganizerContribution && (
                  <>
                    <SelectInput
                      aria-label="Cách thanh toán phần organizer"
                      className="w-auto"
                      value={paymentMethod}
                      onChange={(event) => setPaymentMethod(event.target.value as 'balance' | 'sepay')}
                    >
                      <option value="balance">Số dư</option>
                      <option value="sepay">SePay</option>
                    </SelectInput>
                    <Button onClick={() => void payOrganizer()}>Trả phần organizer</Button>
                  </>
                )}
                <Button tone="danger" onClick={() => setConfirmAction('cancel')}>
                  Hủy kèo
                </Button>
              </>
            ) : join?.status === 'approved' ? (
              <>
                <SelectInput
                  aria-label="Cách thanh toán"
                  className="w-auto"
                  value={paymentMethod}
                  onChange={(event) => setPaymentMethod(event.target.value as 'balance' | 'sepay')}
                >
                  <option value="balance">Số dư</option>
                  <option value="sepay">SePay</option>
                </SelectInput>
                <Button disabled={remaining <= 0} onClick={() => void payParticipant()}>
                  Trả phí tham gia
                </Button>
              </>
            ) : join ? (
              <Button tone="secondary" onClick={() => setConfirmAction('withdraw')}>
                {join.status === 'pending' ? 'Rút yêu cầu' : 'Rút khỏi kèo'}
              </Button>
            ) : (
              <Button
                disabled={isFull || (!detail.actions.canJoin && Boolean(window.localStorage.getItem('accessToken')))}
                onClick={requestJoin}
              >
                {window.localStorage.getItem('accessToken') ? 'Gửi yêu cầu tham gia' : 'Đăng nhập để tham gia'}
              </Button>
            )}
          </div>
        </div>
      </div>
      <Modal
        open={confirmAction !== null}
        title={confirmAction === 'cancel' ? 'Xác nhận hủy kèo' : 'Xác nhận rút khỏi kèo'}
        onClose={() => setConfirmAction(null)}
      >
        <p className="text-sm text-ink-500">
          Hệ thống sẽ áp dụng cutoff, trạng thái booking và quy tắc hoàn phí hiện hành.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button tone="secondary" onClick={() => setConfirmAction(null)}>
            Quay lại
          </Button>
          <Button
            tone="danger"
            onClick={() =>
              void mutate(
                () => (confirmAction === 'cancel' ? cancelMatch(detail.id) : withdrawMatchJoin(detail.id, join!.id)),
                confirmAction === 'cancel' ? 'Đã hủy kèo.' : 'Đã rút khỏi kèo.',
              )
            }
          >
            Xác nhận
          </Button>
        </div>
      </Modal>
      <Modal
        open={Boolean(sepay)}
        title={
          sepay?.purpose === 'organizer' ? 'Thanh toán phần organizer qua SePay' : 'Thanh toán phí tham gia qua SePay'
        }
        onClose={() => setSepay(null)}
      >
        {sepay && (
          <div className="space-y-3">
            <p>Chuyển đúng số tiền và nội dung dưới đây:</p>
            <p className="text-figures text-2xl font-bold text-green-700">
              {Number(sepay.amount).toLocaleString('vi-VN')}₫
            </p>
            <p className="rounded-xl bg-canvas p-3 text-figures font-semibold">{sepay.matchCode}</p>
            <p className="text-sm text-ink-500">Trạng thái sẽ được cập nhật sau khi webhook ngân hàng được đối soát.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
