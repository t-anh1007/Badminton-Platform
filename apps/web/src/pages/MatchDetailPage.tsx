import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Avatar, Badge, Button, Modal, SelectInput, SurfaceCard, Toast } from '../components/ui';
import { RouteState } from '../components/RouteState.js';
import { LocationMap } from '../components/map/LocationMap';
import { abandonMatch, abandonMatchJoin, cancelMatch, getMatchDetail, requestMatchJoin, withdrawMatchJoin, type MatchDetail, type SkillTier } from '../lib/matchApi';
import { useCheckoutAbandonment } from '../hooks/useCheckoutAbandonment.js';
import {
  createMatchOrganizerContributionSepayIntent,
  createMatchJoinSepayIntent,
  payMatchOrganizerContributionBalance,
  payMatchJoinBalance,
  type SepayPayInstruction,
} from '../lib/financeApi';
import { formatDateTimeVi, formatMoneyVnd } from '../lib/formatters.js';
import { SepayPayBox } from '../components/SepayPayBox.js';
import { useLiveDataRefresh } from '../realtime/dataInvalidation.js';

const tierLabels: Record<SkillTier, string> = {
  newcomer: 'Mới chơi',
  beginner: 'Yếu',
  intermediate: 'Trung bình',
  intermediate_plus: 'Trung bình khá',
  advanced: 'Bán chuyên',
};
const money = (value: string) => (Number(value) === 0 ? 'Miễn phí' : formatMoneyVnd(value));

export function MatchDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<MatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmAction, setConfirmAction] = useState<'withdraw' | 'cancel' | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'balance' | 'sepay'>('balance');
  const [paymentOptionsOpen, setPaymentOptionsOpen] = useState(false);
  const [sepay, setSepay] = useState<{
    matchCode: string;
    amount: string;
    payment: SepayPayInstruction;
    purpose: 'participant' | 'organizer';
  } | null>(null);
  const [now, setNow] = useState(Date.now());
  const expiredApprovalReloaded = useRef<string | null>(null);
  const paymentCompleted = useRef(false);

  const pendingOrganizerDeposit = Boolean(detail?.actions.isOrganizer && detail.actions.canPayOrganizerContribution);
  const pendingParticipantPayment = detail?.actions.ownJoin?.status === 'approved';
  useCheckoutAbandonment(
    pendingOrganizerDeposit
      ? () => paymentCompleted.current ? Promise.resolve() : abandonMatch(detail!.id)
      : pendingParticipantPayment
        ? () => paymentCompleted.current ? Promise.resolve() : abandonMatchJoin(detail!.id, detail!.actions.ownJoin!.id)
        : null,
  );

  const load = async (showPageLoader = false) => {
    if (!id) return;
    if (showPageLoader) setLoading(true);
    setError('');
    try {
      const next = await getMatchDetail(id);
      setDetail(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải chi tiết kèo.');
    } finally {
      if (showPageLoader) setLoading(false);
    }
  };
  useEffect(() => {
    void load(true);
  }, [id]);
  useLiveDataRefresh(load);
  useEffect(() => {
    // PaymentCompleted is processed asynchronously by finance → matchmaking →
    // booking. The organizer's tab did not initiate that request, so it has no
    // local mutation event to refresh its snapshot. Poll only while that saga
    // is advancing, then stop once the match reaches a stable state.
    if (!detail || (!detail.paymentPending && detail.status !== 'filled')) return;
    const timer = window.setInterval(() => { void load(); }, 2_000);
    return () => window.clearInterval(timer);
  }, [detail?.id, detail?.paymentPending, detail?.status]);
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
  useEffect(() => {
    if (!sepay || !id) return;
    let active = true;
    let attempts = 0;
    let timer: number;
    const poll = async () => {
      attempts += 1;
      try {
        const next = await getMatchDetail(id);
        if (!active) return;
        const completed = sepay.purpose === 'participant'
          ? next.actions.ownJoin?.status === 'confirmed'
          : next.status === 'confirmed' && !next.actions.canPayOrganizerContribution;
        if (completed) {
          paymentCompleted.current = true;
          setDetail(next);
          setSepay(null);
          setNotice('Đã xác nhận thanh toán SePay.');
          window.clearInterval(timer);
          return;
        }
      } catch {
        // Giữ modal mở để người dùng vẫn thấy nội dung chuyển khoản.
      }
      if (attempts >= 20) {
        setNotice('Chưa thấy giao dịch SePay. Hãy kiểm tra lại trạng thái kèo sau.');
        window.clearInterval(timer);
      }
    };
    timer = window.setInterval(() => { void poll(); }, 1_500);
    return () => { active = false; window.clearInterval(timer); };
  }, [id, sepay]);


  const mutate = async (operation: () => Promise<unknown>, success: string, afterSuccess?: () => void) => {
    try {
      await operation();
      setNotice(success);
      setConfirmAction(null);
      if (afterSuccess) {
        afterSuccess();
        return;
      }
      await load();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Không thể hoàn tất thao tác.');
    }
  };
  const leaveParticipantCheckout = () => {
    const join = detail?.actions.ownJoin;
    setPaymentOptionsOpen(false);
    setSepay(null);
    if (!detail || join?.status !== 'approved') return;
    void mutate(
      () => withdrawMatchJoin(detail.id, join.id),
      'Đã thoát thanh toán và nhả chỗ cho người khác.',
    );
  };
  const leaveSepayCheckout = () => {
    if (sepay?.purpose === 'participant') {
      leaveParticipantCheckout();
      return;
    }
    setSepay(null);
    if (sepay?.purpose === 'organizer' && detail?.actions.canPayOrganizerContribution) {
      paymentCompleted.current = true;
      void mutate(
        () => cancelMatch(detail.id),
        'Đã thoát thanh toán và hủy lượt giữ sân.',
        () => navigate('/matches', { replace: true }),
      );
    }
  };
  const payParticipant = async () => {
    const join = detail?.actions.ownJoin;
    if (!detail || !join) return;
    try {
      if (paymentMethod === 'balance') {
        await payMatchJoinBalance(detail.id, join.id);
        paymentCompleted.current = true;
        setPaymentOptionsOpen(false);
        setNotice('Đã thanh toán phí tham gia bằng số dư.');
        await load();
      } else {
        const intent = await createMatchJoinSepayIntent(detail.id, join.id);
        setPaymentOptionsOpen(false);
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
        paymentCompleted.current = true;
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
        <div className="mt-6">{error
          ? <RouteState variant="error" title="Không thể mở kèo" description={error} onRetry={() => void load()} />
          : <RouteState variant="loading" title="Đang tải trạng thái tham gia" />}
        </div>
      </div>
    );
  const join = detail.actions.ownJoin;
  const isFull = detail.openSlots <= 0;
  const requestJoin = () => {
    if (!window.localStorage.getItem('accessToken')) {
      navigate('/auth');
      return;
    }
    void mutate(() => requestMatchJoin(detail.id), 'Đã giữ slot 10 phút. Hãy thanh toán phần còn lại để xác nhận kèo và booking sân.');
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
              <Badge tone={detail.status === 'confirmed' || detail.status === 'completed' ? 'success' : detail.status === 'awaiting_deposit' || isFull ? 'warning' : 'success'}>
                {detail.status === 'completed' ? 'Đã hoàn thành' : detail.status === 'confirmed' ? 'Đã xác nhận' : detail.status === 'awaiting_deposit' ? 'Chờ đặt cọc' : detail.paymentPending ? 'Đang chờ thanh toán' : isFull ? 'Đã đầy' : `Còn ${detail.openSlots} chỗ`}
              </Badge>
            </div>
            <div className="mt-6 grid gap-4 border-y border-line py-5 sm:grid-cols-2">
              <div>
                <p className="text-caption">Thời gian</p>
                <p className="mt-1 font-medium">{formatDateTimeVi(detail.startAt)}</p>
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
            {join?.status !== 'approved' && Number.isFinite(detail.venue.lat) && Number.isFinite(detail.venue.lng) && (
              <LocationMap lat={detail.venue.lat} lng={detail.venue.lng} label={detail.venue.name} className="mt-3" />
            )}
            <a
              className="mt-2 inline-block text-sm font-semibold text-brand-navy"
              target="_blank"
              rel="noreferrer"
              href={`https://www.google.com/maps/search/?api=1&query=${detail.venue.lat},${detail.venue.lng}`}
            >
              Xem bản đồ ↗
            </a>
          </SurfaceCard>
        </div>
        <aside className="space-y-5">
          <SurfaceCard>
            <h2 className="text-h2">Người chơi</h2>
            <p className="text-figures mt-4 text-3xl font-bold text-brand-navy">
              {detail.confirmedParticipants + 1}/{detail.capacity}
            </p>
            <p className="mt-1 text-sm text-ink-500">
              {detail.status === 'awaiting_deposit'
                ? 'Chủ kèo đang chờ đặt cọc để mở kèo tìm đối.'
                : detail.confirmedParticipants === 0
                  ? 'Chủ kèo đang chờ người chơi phù hợp tham gia.'
                  : 'Organizer và người chơi đã xác nhận. Ảnh đại diện hiển thị theo thiết lập hồ sơ của từng người.'}
            </p>
            <div className="mt-4 flex -space-x-2">
              <Avatar label={detail.organizer.displayName} src={detail.organizer.avatarUrl} alt={`Ảnh đại diện ${detail.organizer.displayName}`} className="h-10 w-10 border-2 border-surface" />
              {detail.confirmedParticipantProfiles?.map((participant, index) => (
                <Avatar
                  key={index}
                  label={participant.displayName}
                  src={participant.avatarUrl}
                  alt={`Ảnh đại diện ${participant.displayName}`}
                  className="h-10 w-10 border-2 border-surface"
                />
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
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 p-3 pr-24 shadow-[0_-6px_24px_rgb(20_30_40_/_8%)] backdrop-blur sm:pr-28">
        <div className="page-container flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            {detail.actions.isOrganizer ? (
              <>
                <p className="font-semibold">Bạn là organizer</p>
                <p className="text-sm text-ink-500">
                  {detail.actions.canPayOrganizerContribution
                    ? 'Đặt cọc (1/2 giá sân) để chốt sân và mở kèo tìm đối. Cọc hoàn vào ví nếu không tìm được đối.'
                    : detail.status === 'awaiting_deposit'
                      ? 'Đang chờ xác nhận cọc; kèo sẽ mở tìm đối ngay sau khi cọc về.'
                      : detail.status === 'filled'
                        ? 'Đối đã đóng đủ; hệ thống đang xác nhận sân.'
                        : detail.status === 'confirmed'
                          ? 'Kèo và booking sân đã được xác nhận.'
                          : 'Kèo đang mở; người thanh toán trước sẽ có slot.'}
                </p>
              </>
            ) : join?.status === 'approved' ? (
              <>
                <p className="font-semibold">Bạn đang giữ một chỗ</p>
                <p className="text-sm text-ink-500">Hoàn tất thanh toán để xác nhận kèo. Hạn giữ chỗ sẽ hiển thị trong bước thanh toán.</p>
              </>
            ) : join?.status === 'confirmed' ? (
              <>
                <p className="font-semibold">Kèo đã tham gia · Đã xác nhận</p>
                <p className="text-sm text-ink-500">Booking sân đã xác nhận. Rút kèo tuân theo cutoff và trạng thái booking.</p>
              </>
            ) : (
              <>
                <p className="font-semibold">{detail.paymentPending ? 'Đang có người thanh toán' : isFull ? 'Kèo đã đủ người' : 'Tham gia và thanh toán'}</p>
                <p className="text-sm text-ink-500">Người bấm trước được giữ slot 10 phút; thanh toán đủ sẽ xác nhận ngay kèo và booking sân.</p>
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
                    <Button onClick={() => void payOrganizer()}>Đặt cọc chốt sân</Button>
                  </>
                )}
                <Button tone="danger" onClick={() => setConfirmAction('cancel')}>
                  Hủy kèo
                </Button>
              </>
            ) : join?.status === 'approved' ? (
              <Button disabled={remaining <= 0} onClick={() => setPaymentOptionsOpen(true)}>
                Thanh toán phần còn lại
              </Button>
            ) : join ? (
              <Button tone="secondary" onClick={() => setConfirmAction('withdraw')}>
                {join.status === 'pending' ? 'Rút yêu cầu' : 'Rút khỏi kèo'}
              </Button>
            ) : (
              <Button
                disabled={isFull || (!detail.actions.canJoin && Boolean(window.localStorage.getItem('accessToken')))}
                onClick={requestJoin}
              >
                {window.localStorage.getItem('accessToken') ? 'Tham gia kèo' : 'Đăng nhập để tham gia'}
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
          {confirmAction === 'cancel'
            ? 'Kèo sẽ dừng và chỗ sân sẽ được hủy. Tiền đã thanh toán sẽ được hoàn về ví của từng người theo chính sách hoàn tiền của sân; số tiền hoàn có thể khác nhau tùy thời điểm hủy.'
            : 'Bạn sẽ rời khỏi kèo. Nếu vẫn còn trước thời hạn, phần phí bạn đã thanh toán sẽ được hoàn về ví; sau thời hạn, phí có thể không được hoàn.'}
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
                confirmAction === 'cancel' ? () => navigate('/matches', { replace: true }) : undefined,
              )
            }
          >
            Xác nhận
          </Button>
        </div>
      </Modal>
      <Modal
        open={paymentOptionsOpen}
        title="Chọn phương thức thanh toán"
        onClose={leaveParticipantCheckout}
      >
        <div className="space-y-5">
          <div className="rounded-xl bg-canvas p-4">
            <p className="font-semibold">Giữ chỗ còn</p>
            <p className="text-figures mt-1 text-2xl font-bold text-brand-navy">
              {String(Math.floor(remaining / 60_000)).padStart(2, '0')}:
              {String(Math.floor((remaining % 60_000) / 1000)).padStart(2, '0')}
            </p>
            <p className="mt-1 text-sm text-ink-500">Hết thời gian, slot sẽ tự mở lại cho người khác.</p>
          </div>
          <label className="block text-sm font-medium">
            Phương thức thanh toán
            <SelectInput
              aria-label="Cách thanh toán"
              className="mt-1"
              value={paymentMethod}
              onChange={(event) => setPaymentMethod(event.target.value as 'balance' | 'sepay')}
            >
              <option value="balance">Số dư</option>
              <option value="sepay">SePay</option>
            </SelectInput>
          </label>
          <div className="flex justify-end gap-2">
            <Button tone="secondary" onClick={leaveParticipantCheckout}>Thoát và nhả chỗ</Button>
            <Button disabled={remaining <= 0} onClick={() => void payParticipant()}>
              {paymentMethod === 'balance' ? 'Thanh toán số dư' : 'Tạo mã SePay'}
            </Button>
          </div>
        </div>
      </Modal>
      <Modal
        open={Boolean(sepay)}
        title={
          sepay?.purpose === 'organizer' ? 'Thanh toán phần organizer qua SePay' : 'Thanh toán phí tham gia qua SePay'
        }
        onClose={leaveSepayCheckout}
      >
        {sepay && (
          <div className="space-y-3">
            <p>Quét mã hoặc chuyển đúng số tiền và nội dung dưới đây:</p>
            <SepayPayBox payment={sepay.payment} />
          </div>
        )}
      </Modal>
    </div>
  );
}
