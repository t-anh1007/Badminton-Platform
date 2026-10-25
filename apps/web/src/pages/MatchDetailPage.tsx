import { BusinessCode } from '../components/BusinessCode.js';
import { HoldTimer, PaymentMethodPicker } from '../components/PaymentMethodPicker';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { cancelReasonLabel, cancelRefundNote } from '../components/MatchHistoryPanel.js';
import { Avatar, Badge, Button, Modal, SurfaceCard, Toast } from '../components/ui';
import { RouteState } from '../components/RouteState.js';
import { LocationMap } from '../components/map/LocationMap';
import { cancelMatch, getMatchDetail, MatchApiError, getMyScheduleConflicts, requestMatchJoin, withdrawMatchJoin, type MatchDetail, type ScheduleConflict, type SkillTier, type TeamSide } from '../lib/matchApi';
import { MatchResultSection } from '../components/result/MatchResultSection.js';
import { getOwnPassport, type OwnPassport } from '../lib/passportApi';
import { LockBanner, MatchHeader, MatchInfoCard, ScoreBoard } from '../components/MatchCompetitiveSections.js';
import type { FinalScore } from '../components/result/MatchResultSection.js';
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
import { ScheduleConflictWarning } from '../components/ScheduleConflictWarning.js';
import { PartnerInvitePanel } from '../components/PartnerInvitePanel.js';

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
  const fromHistory = (useLocation().state as { from?: string } | null)?.from === 'history';
  const [detail, setDetail] = useState<MatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [notice, setNotice] = useState('');
  const [resultFinal, setResultFinal] = useState(false);
  const [finalScore, setFinalScore] = useState<FinalScore | null>(null);
  const [confirmAction, setConfirmAction] = useState<'withdraw' | 'cancel' | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'balance' | 'sepay'>('balance');
  const [paymentOptionsOpen, setPaymentOptionsOpen] = useState(false);
  const [organizerPayOpen, setOrganizerPayOpen] = useState(false);
  const [scheduleWarning, setScheduleWarning] = useState<{ conflicts: ScheduleConflict[]; action: 'join' | 'payment'; side: TeamSide } | null>(null);
  const [sepay, setSepay] = useState<{
    matchCode: string;
    amount: string;
    payment: SepayPayInstruction;
    purpose: 'participant' | 'organizer';
  } | null>(null);
  const [now, setNow] = useState(Date.now());
  const expiredApprovalReloaded = useRef<string | null>(null);
  const [passport, setPassport] = useState<OwnPassport | null>(null);
  // Chỉ người có thể vào kèo xếp hạng mới cần biết đã khai trình độ chưa; lỗi tải thì để backend chặn.
  const mayJoinRanked = detail?.mode === 'ranked' && detail.actions.canJoin && !detail.actions.isOrganizer && !detail.actions.ownJoin;
  useEffect(() => {
    if (!mayJoinRanked || !window.localStorage.getItem('accessToken')) return;
    void getOwnPassport().then(setPassport).catch(() => undefined);
  }, [mayJoinRanked]);

  const load = async (showPageLoader = false) => {
    if (!id) return;
    if (showPageLoader) setLoading(true);
    setError('');
    try {
      const next = await getMatchDetail(id);
      setDetail(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải chi tiết kèo.');
      setNotFound(cause instanceof MatchApiError && cause.status === 404);
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
  const depositRemaining = detail?.status === 'awaiting_deposit' && detail.holdExpiresAt
    ? Math.max(0, new Date(detail.holdExpiresAt).getTime() - now)
    : null;
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
          // Chủ kèo trả xong thì kèo rời awaiting_deposit sang open (chưa confirmed cho tới khi đủ người).
          : ['open', 'filled', 'confirmed'].includes(next.status);
        if (completed) {
          setDetail(next);
          setSepay(null);
          setNotice('Đã xác nhận thanh toán SePay.');
          window.clearInterval(timer);
          return;
        }
      } catch {
        // Giữ modal mở để người dùng vẫn thấy nội dung chuyển khoản.
      }
      // Người dùng cần thời gian mở app ngân hàng và chuyển khoản: chờ trọn 10 phút giữ chỗ.
      if (attempts >= 400) {
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
        setNotice('Đã thanh toán phần của chủ kèo bằng số dư.');
        await load();
      } else {
        const intent = await createMatchOrganizerContributionSepayIntent(detail.id);
        setSepay({ ...intent, purpose: 'organizer' });
      }
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Thanh toán phần của chủ kèo chưa thành công.');
    }
  };

  if (loading || !detail)
    return (
      <div className="page-container py-8">
        <h1 className="text-h1">Chi tiết kèo</h1>
        <div className="mt-6">{notFound
          ? <RouteState variant="notFound" title="Kèo không còn công khai" description="Kèo có thể đã đủ người, bị hủy hoặc đường dẫn không đúng." action={<Link to="/matches" className="inline-flex min-h-11 items-center rounded-full bg-brand-yellow px-5 text-sm font-bold uppercase tracking-[0.035em] text-brand-navy">Xem kèo đang mở</Link>} />
          : error
          ? <RouteState variant="error" title="Chưa tải được kèo" description="Máy chủ đang bận hoặc kết nối bị gián đoạn. Hãy thử lại." onRetry={() => void load()} />
          : <RouteState variant="loading" title="Đang tải trạng thái tham gia" />}
        </div>
      </div>
    );
  const join = detail.actions.ownJoin;
  const isFull = detail.openSlots <= 0;
  const cancelled = detail.status === 'cancelled';
  // Đội được truyền thẳng qua cả bước kiểm tra lịch, không đọc lại từ state (tránh closure cũ).
  const executeScheduleAction = (action: 'join' | 'payment', side: TeamSide) => {
    if (action === 'payment') {
      setPaymentOptionsOpen(true);
      return;
    }
    void mutate(() => requestMatchJoin(detail.id, side), `Đã giữ chỗ ở đội ${side} trong 10 phút. Hãy thanh toán để xác nhận chỗ trước hạn chốt kèo.`, async () => { await load(); setPaymentOptionsOpen(true); });
  };
  const rankedDisciplineName = detail.discipline === 'doubles' ? 'đánh đôi' : 'đánh đơn';
  const needsDeclaration = Boolean(mayJoinRanked && passport && detail.discipline && passport[detail.discipline] === null);
  const checkScheduleBefore = async (action: 'join' | 'payment', side: TeamSide = 'B') => {
    if (!window.localStorage.getItem('accessToken')) {
      navigate(`/auth?next=${encodeURIComponent(`/matches/${detail.id}`)}`);
      return;
    }
    if (action === 'join' && needsDeclaration) {
      setNotice(`Hãy khai trình độ ${rankedDisciplineName} trước khi tham gia kèo xếp hạng ${rankedDisciplineName}.`);
      return;
    }
    try {
      const result = await getMyScheduleConflicts({
        startAt: detail.startAt,
        endAt: detail.endAt,
        excludeMatchId: detail.id,
      });
      if (result.conflicts.length > 0) {
        setScheduleWarning({ conflicts: result.conflicts, action, side });
        return;
      }
      executeScheduleAction(action, side);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Không thể kiểm tra lịch hiện tại.');
    }
  };

  const competitive = Boolean(detail.funding);
  const defaultSide: TeamSide = detail.actions.canJoinTeamB === false && detail.actions.canJoinTeamA ? 'A' : 'B';
  const lockPending = (detail.status === 'open' || detail.status === 'filled') && new Date(detail.cutoffAt).getTime() > now;
  return (
    <div className="page-container pb-28 pt-8 sm:pt-10">
      {notice && <Toast message={notice} tone={notice.startsWith('Đã') ? 'success' : 'error'} />}
      <button className="text-sm font-semibold text-brand-navy" onClick={() => navigate(fromHistory ? '/profile?tab=history' : '/matches')}>
        {fromHistory ? '← Lịch sử đấu' : '← Danh sách kèo'}
      </button>
      {competitive ? (
        <div className="mt-4 space-y-5">
          <MatchHeader detail={detail} badge={(
            <Badge tone={detail.status === 'cancelled' ? 'danger' : detail.status === 'confirmed' || detail.status === 'completed' ? 'success' : 'warning'}>
              {detail.status === 'cancelled' ? 'Đã hủy' : detail.status === 'completed' ? 'Đã thi đấu' : detail.status === 'confirmed' ? 'Chờ thi đấu' : detail.status === 'awaiting_deposit' ? 'Chờ chủ kèo đóng phần' : 'Chờ hạn chốt kèo'}
            </Badge>
          )} />
          {lockPending && <LockBanner detail={detail} />}
          {needsDeclaration && (
            <p className="rounded-xl border-l-4 border-brand-yellow bg-warning-bg p-3 text-sm text-ink-700">
              Kèo xếp hạng chỉ tính điểm cho người đã khai trình độ. Bạn chưa khai trình độ {rankedDisciplineName}.{' '}
              <Link to="/passport" className="font-semibold text-brand-navy underline">Khai trình độ ngay</Link>
            </p>
          )}
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <div className="min-w-0 space-y-5">
              {cancelled ? <CancelledMatchCard detail={detail} /> : (
                <>
                  <ScoreBoard detail={detail} final={finalScore} onJoin={(side) => void checkScheduleBefore('join', side)} />
                  {/* Kèo đã chốt thì không còn mời đồng đội. */}
                  {!['confirmed', 'completed'].includes(detail.status) && <PartnerInvitePanel detail={detail} run={(operation, success) => mutate(operation, success)} />}
                </>
              )}
            </div>
            <aside className="lg:sticky lg:top-24 lg:self-start">
              <MatchInfoCard detail={detail} resultFinal={resultFinal} />
            </aside>
          </div>
          {/* Khối kết quả cần đủ chiều ngang cho khung gửi ảnh và tiến trình. */}
          {(detail.status === 'confirmed' || detail.status === 'completed') && (
            <MatchResultSection matchId={detail.id} allowIncident={Boolean(detail.actions.canReportIncident)} onFinalChange={setResultFinal} onFinalScore={setFinalScore} />
          )}
        </div>
      ) : (
      <div className="mt-4 grid gap-5 lg:grid-cols-[1.55fr_1fr]">
        <div className="space-y-5">
          <SurfaceCard>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="courtin-kicker">Chi tiết kèo</p>
                <h1 className="mt-1 text-h1">
                  {detail.venue.name} · {detail.court.name}
                </h1><BusinessCode code={detail.businessCode} label="Mã kèo" />
              </div>
              <Badge tone={detail.status === 'cancelled' ? 'danger' : detail.status === 'confirmed' || detail.status === 'completed' ? 'success' : detail.status === 'awaiting_deposit' || isFull ? 'warning' : 'success'}>
                {detail.status === 'cancelled' ? 'Đã hủy' : detail.status === 'completed' ? 'Đã hoàn thành' : detail.status === 'confirmed' ? 'Đã xác nhận' : detail.status === 'awaiting_deposit' ? 'Chờ đặt cọc' : detail.paymentPending ? 'Đang chờ thanh toán' : isFull ? 'Đã đầy' : `Còn ${detail.openSlots} chỗ`}
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
          {cancelled && <CancelledMatchCard detail={detail} />}
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
                  : 'Chủ kèo và người chơi đã xác nhận. Ảnh đại diện hiển thị theo thiết lập hồ sơ của từng người.'}
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
      )}
      {/* Thanh hành động chỉ hiện khi còn việc để làm; đã thi đấu xong thì mọi việc nằm trong khối kết quả. */}
      {!cancelled && detail.status !== 'completed' && <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 p-3 pr-24 shadow-[0_-6px_24px_rgb(20_30_40_/_8%)] backdrop-blur sm:pr-28">
        <div className="page-container flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            {detail.actions.isOrganizer ? (
              <>
                <p className="font-semibold">Bạn là chủ kèo</p>
                <p className="text-sm text-ink-500">
                  {detail.actions.canPayOrganizerContribution
                    ? competitive
                      ? 'Đóng phần góp của bạn để mở kèo tìm người chơi. Nếu kèo không đủ người tới hạn chốt kèo, phần góp được hoàn vào ví.'
                      : 'Đặt cọc (1/2 giá sân) để chốt sân và mở kèo tìm đối. Cọc hoàn vào ví nếu không tìm được đối.'
                    : detail.status === 'awaiting_deposit'
                      ? 'Đang chờ xác nhận cọc; kèo sẽ mở tìm đối ngay sau khi cọc về.'
                      : detail.status === 'filled'
                        ? 'Đối đã đóng đủ; hệ thống đang xác nhận sân.'
                        : detail.status === 'confirmed'
                          ? competitive
                            ? 'Kèo đã chốt nên không thể hủy. Nếu có vấn đề, hãy báo sự cố trong phần kết quả trận.'
                            : 'Kèo và lượt đặt sân đã được xác nhận.'
                          : competitive ? 'Kèo đang mở tìm người chơi tới hạn chốt kèo; bạn có thể hủy trước hạn chốt.' : 'Kèo đang mở; người thanh toán trước sẽ có chỗ.'}
                </p>
                {depositRemaining !== null && (
                  <p role="timer" className={`mt-2 inline-block rounded-full px-3 py-1 text-sm font-semibold text-figures ${depositRemaining < 120_000 ? 'bg-danger-bg text-danger' : 'bg-brand-yellow text-brand-navy'}`}>
                    {depositRemaining > 0
                      ? `Giữ chỗ còn ${String(Math.floor(depositRemaining / 60_000)).padStart(2, '0')}:${String(Math.floor((depositRemaining % 60_000) / 1000)).padStart(2, '0')} — hết giờ chưa đóng thì khung giờ nhả và kèo bị hủy`
                      : 'Đã hết thời gian giữ chỗ; khung giờ đã nhả và kèo sẽ bị hủy.'}
                  </p>
                )}
              </>
            ) : join?.status === 'approved' ? (
              <>
                <p className="font-semibold">Bạn đang giữ một chỗ</p>
                <p className="text-sm text-ink-500">Hoàn tất thanh toán để xác nhận chỗ. Kèo và lượt đặt sân được chốt tại hạn tìm đối.</p>
              </>
            ) : join?.status === 'confirmed' ? (
              <>
                <p className="font-semibold">{lockPending ? 'Đã thanh toán · Chờ chốt kèo' : 'Đã tham gia · Kèo đã chốt'}</p>
                <p className="text-sm text-ink-500">{lockPending ? 'Bạn có thể rút và nhận hoàn 100% trước hạn chốt kèo; chỗ sẽ mở lại cho người khác.' : 'Sau hạn chốt kèo không thể rút khỏi kèo. Nếu có vấn đề, hãy báo sự cố trong phần kết quả trận.'}</p>
              </>
            ) : (
              <>
                <p className="font-semibold">{detail.paymentPending ? 'Đang có người thanh toán' : isFull ? 'Kèo đã đủ người' : 'Tham gia và thanh toán'}</p>
                <p className="text-sm text-ink-500">Người bấm trước được giữ chỗ 10 phút; thanh toán xác nhận chỗ, còn kèo và lượt đặt sân được chốt tại hạn tìm đối.</p>
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {detail.actions.isOrganizer ? (
              <>
                {detail.actions.canPayOrganizerContribution && (
                  <Button onClick={() => setOrganizerPayOpen(true)}>{competitive ? 'Đóng phần góp' : 'Đặt cọc chốt sân'}</Button>
                )}
                {(detail.status === 'awaiting_deposit' || lockPending || !competitive) && (
                  <Button tone="danger" onClick={() => setConfirmAction('cancel')}>
                    Hủy kèo
                  </Button>
                )}
              </>
            ) : join?.status === 'approved' ? (
              <Button disabled={remaining <= 0} onClick={() => void checkScheduleBefore('payment')}>
                Thanh toán phần còn lại
              </Button>
            ) : join ? (
              // Sau hạn chốt kèo roster bị khóa (BR-CM-07): không còn nút rút, vấn đề đi qua báo sự cố.
              (join.status === 'pending' || lockPending || !competitive) && (
                <Button tone="secondary" onClick={() => setConfirmAction('withdraw')}>
                  {join.status === 'pending' ? 'Rút yêu cầu' : 'Rút khỏi kèo'}
                </Button>
              )
            ) : (
              <Button
                disabled={isFull || (!detail.actions.canJoin && Boolean(window.localStorage.getItem('accessToken')))}
                onClick={() => void checkScheduleBefore('join', defaultSide)}
              >
                {window.localStorage.getItem('accessToken') ? 'Tham gia kèo' : 'Đăng nhập để tham gia'}
              </Button>
            )}
          </div>
        </div>
      </div>}
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
      <ScheduleConflictWarning
        conflicts={scheduleWarning?.conflicts ?? []}
        onClose={() => setScheduleWarning(null)}
        onContinue={() => {
          const warning = scheduleWarning;
          setScheduleWarning(null);
          if (warning) executeScheduleAction(warning.action, warning.side);
        }}
      />
      <Modal
        open={paymentOptionsOpen}
        title="Chọn phương thức thanh toán"
        onClose={leaveParticipantCheckout}
      >
        <div className="space-y-5">
          <HoldTimer remainingMs={remaining} />
          <PaymentMethodPicker label="Cách thanh toán" value={paymentMethod} onChange={setPaymentMethod} />
          {detail.funding?.viewerAdditionalAmountDue && <p className="flex items-center justify-between border-t border-line pt-4 font-semibold">Phần của bạn<span className="text-figures text-xl text-brand-navy">{formatMoneyVnd(detail.funding.viewerAdditionalAmountDue)}</span></p>}
          <Button size="lg" className="w-full" disabled={remaining <= 0} onClick={() => void payParticipant()}>
            {paymentMethod === 'balance' ? 'Thanh toán số dư' : 'Tạo mã SePay'}
          </Button>
          <Button tone="ghost" size="sm" className="w-full" onClick={leaveParticipantCheckout}>Thoát và nhả chỗ</Button>
        </div>
      </Modal>
      <Modal open={organizerPayOpen} title={competitive ? 'Đóng phần góp' : 'Đặt cọc chốt sân'} onClose={() => setOrganizerPayOpen(false)}>
        <div className="space-y-5">
          {depositRemaining !== null && <HoldTimer remainingMs={depositRemaining} />}
          <PaymentMethodPicker label="Cách thanh toán phần của chủ kèo" value={paymentMethod} onChange={setPaymentMethod} />
          {detail.funding?.organizerContribution && <p className="flex items-center justify-between border-t border-line pt-4 font-semibold">Phần góp của bạn<span className="text-figures text-xl text-brand-navy">{formatMoneyVnd(detail.funding.organizerContribution)}</span></p>}
          <Button size="lg" className="w-full" onClick={() => { setOrganizerPayOpen(false); void payOrganizer(); }}>{paymentMethod === 'balance' ? 'Thanh toán số dư' : 'Tạo mã SePay'}</Button>
          <p className="text-center text-xs text-ink-500">Kèo không đủ người trước hạn chốt → hoàn vào ví.</p>
        </div>
      </Modal>
      <Modal
        open={Boolean(sepay)}
        title={
          'Quét mã để thanh toán'
        }
        onClose={leaveSepayCheckout}
      >
        {sepay && (
          <div className="space-y-3">
            <SepayPayBox payment={sepay.payment} />
          </div>
        )}
      </Modal>
    </div>
  );
}

/** Kèo đã hủy (xem lại từ Lịch sử đấu): lý do và hoàn tiền; không khai kết quả. */
function CancelledMatchCard({ detail }: { detail: MatchDetail }) {
  const cancellation = detail.cancellation ?? null;
  return (
    <SurfaceCard>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-ink-500">Kèo đã hủy</p>
          <h2 className="text-h2 mt-1 text-[28px]">{cancelReasonLabel(cancellation)}</h2>
          {cancellation?.cancelledAt && <p className="mt-1 text-sm text-ink-500">Hủy lúc {formatDateTimeVi(cancellation.cancelledAt)}</p>}
        </div>
        <Badge tone="danger">Đã hủy</Badge>
      </div>
      <div className="mt-5 rounded-xl border border-line p-4 text-sm">
        <p className="font-semibold text-brand-navy">Tiền của bạn</p>
        <p className="mt-1">{cancelRefundNote(cancellation)}</p>
      </div>
      <p className="mt-4 text-xs text-ink-500">Kèo đã hủy không khai kết quả và không tính điểm xếp hạng.</p>
    </SurfaceCard>
  );
}
