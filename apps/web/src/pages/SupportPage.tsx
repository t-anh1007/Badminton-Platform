import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  Modal,
  Skeleton,
  SurfaceCard,
  TextArea,
  TextInput,
  Toast,
} from '../components/ui';
import {
  addSupportTicketMessage,
  createSupportTicket,
  getCommunitySession,
  getSupportTicket,
  listSupportTickets,
  setSupportTicketStatus,
  type SupportTicket,
  type SupportTicketDetail,
  type TicketStatus,
} from '../lib/communityApi';

const statusMap: Record<
  TicketStatus,
  {
    label: string;
    tone: 'success' | 'warning' | 'neutral';
    description: string;
  }
> = {
  open: {
    label: 'Mới gửi',
    tone: 'warning',
    description: 'Ticket đang chờ đội ngũ hỗ trợ tiếp nhận.',
  },
  in_progress: {
    label: 'Đang xử lý',
    tone: 'warning',
    description: 'Đội ngũ hỗ trợ đã phản hồi và đang xử lý.',
  },
  resolved: {
    label: 'Đã giải quyết',
    tone: 'success',
    description: 'Ticket đã có phương án giải quyết và không nhận thêm tin nhắn.',
  },
  closed: {
    label: 'Đã đóng',
    tone: 'neutral',
    description: 'Cuộc trao đổi đã kết thúc.',
  },
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function SupportPage() {
  const session = getCommunitySession();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedId, setSelectedId] = useState(searchParams.get('ticket') ?? '');
  const [detail, setDetail] = useState<SupportTicketDetail | null>(null);
  const [loading, setLoading] = useState(Boolean(session));
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [detailError, setDetailError] = useState('');
  const [notice, setNotice] = useState<{
    message: string;
    tone: 'success' | 'error';
  } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [ticketBody, setTicketBody] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [statusAction, setStatusAction] = useState<'resolved' | 'closed' | null>(null);

  const loadTickets = async (preferredId?: string) => {
    if (!session) return;
    setLoading(true);
    setError('');
    try {
      const result = await listSupportTickets();
      setTickets(result.tickets);
      const nextId = preferredId || selectedId || searchParams.get('ticket') || result.tickets[0]?.id || '';
      if (nextId) {
        setSelectedId(nextId);
        setSearchParams({ ticket: nextId }, { replace: true });
      } else {
        setSelectedId('');
        setDetail(null);
        setSearchParams({}, { replace: true });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải ticket hỗ trợ.');
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (ticketId: string) => {
    setDetailLoading(true);
    setDetailError('');
    try {
      setDetail(await getSupportTicket(ticketId));
    } catch (cause) {
      setDetail(null);
      setDetailError(cause instanceof Error ? cause.message : 'Không thể tải cuộc trao đổi.');
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    void loadTickets();
  }, []);
  useEffect(() => {
    if (selectedId && session) void loadDetail(selectedId);
  }, [selectedId]);

  const selectTicket = (ticketId: string) => {
    setSelectedId(ticketId);
    setSearchParams({ ticket: ticketId });
  };

  const createTicket = async () => {
    if (!subject.trim() || !ticketBody.trim()) return;
    setSubmitting(true);
    try {
      const ticket = await createSupportTicket(subject.trim(), ticketBody.trim());
      setSubject('');
      setTicketBody('');
      setCreateOpen(false);
      setNotice({ message: 'Đã gửi ticket hỗ trợ.', tone: 'success' });
      await loadTickets(ticket.id);
    } catch (cause) {
      setNotice({
        message: cause instanceof Error ? cause.message : 'Không thể tạo ticket.',
        tone: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const sendReply = async () => {
    if (!detail || !replyBody.trim()) return;
    setSubmitting(true);
    try {
      await addSupportTicketMessage(detail.id, replyBody.trim());
      setReplyBody('');
      setNotice({ message: 'Đã gửi phản hồi.', tone: 'success' });
      await Promise.all([loadDetail(detail.id), loadTickets(detail.id)]);
    } catch (cause) {
      setNotice({
        message: cause instanceof Error ? cause.message : 'Không thể gửi phản hồi.',
        tone: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };
  const updateTicketStatus = async () => {
    if (!detail || !statusAction) return;
    setSubmitting(true);
    try {
      await setSupportTicketStatus(detail.id, statusAction);
      setNotice({
        message: statusAction === 'resolved' ? 'Đã giải quyết ticket.' : 'Đã đóng ticket.',
        tone: 'success',
      });
      setStatusAction(null);
      await Promise.all([loadDetail(detail.id), loadTickets(detail.id)]);
    } catch (cause) {
      setNotice({
        message: cause instanceof Error ? cause.message : 'Không thể cập nhật trạng thái ticket.',
        tone: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!session)
    return (
      <div className="page-container py-8 sm:py-10">
        <Link to="/community" className="text-sm font-semibold text-green-700 hover:underline">
          ← Về cộng đồng
        </Link>
        <header className="mt-5">
          <p className="courtin-kicker">Kênh riêng tư</p>
          <h1 className="mt-1 text-h1">Trung tâm hỗ trợ</h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-500">
            Tạo ticket và theo dõi trao đổi riêng tư với đội ngũ vận hành.
          </p>
        </header>
        <div className="mx-auto mt-6 max-w-2xl">
          <EmptyState
            title="Đăng nhập để tạo ticket"
            description="Ticket là kênh riêng tư giữa bạn và Admin, vì vậy chỉ tài khoản đã đăng nhập mới có thể truy cập."
            action={<Button onClick={() => navigate('/auth')}>Đăng nhập</Button>}
          />
        </div>
      </div>
    );

  const canCreate = session.roles.includes('player');
  const isAdmin = session.roles.includes('admin');
  const canReply = detail?.status === 'open' || detail?.status === 'in_progress';

  return (
    <div className="page-container py-8 sm:py-10">
      {notice && <Toast key={notice.message} message={notice.message} tone={notice.tone} />}
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <Link to="/community" className="text-sm font-semibold text-green-700 hover:underline">
            ← Về cộng đồng
          </Link>
          <p className="mt-5 courtin-kicker">Kênh riêng tư</p>
          <h1 className="mt-1 text-h1">Trung tâm hỗ trợ</h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-500">
            Trao đổi bất đồng bộ với đội ngũ vận hành. Ticket và tin nhắn chỉ hiển thị cho bạn và Admin.
          </p>
        </div>
        {canCreate && <Button onClick={() => setCreateOpen(true)}>Tạo ticket mới</Button>}
      </header>

      {error && (
        <div className="mt-6 rounded-xl border border-danger bg-danger-bg p-4 text-sm text-danger">
          {error}{' '}
          <button className="font-semibold underline" onClick={() => void loadTickets()}>
            Thử lại
          </button>
        </div>
      )}

      <div className="mt-6 grid min-h-[560px] items-start gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <SurfaceCard className="overflow-hidden p-0 sm:p-0">
          <div className="flex items-center justify-between border-b border-line px-4 py-4">
            <h2 className="text-h3">Ticket {session.roles.includes('admin') ? 'đang quản lý' : 'của tôi'}</h2>
            <Badge>{tickets.length}</Badge>
          </div>
          {loading ? (
            <div className="space-y-3 p-4">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
          ) : tickets.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title="Chưa có ticket"
                description={
                  canCreate ? 'Tạo ticket khi bạn cần đội ngũ vận hành hỗ trợ.' : 'Chưa có yêu cầu hỗ trợ nào.'
                }
                action={
                  canCreate ? (
                    <Button size="sm" onClick={() => setCreateOpen(true)}>
                      Tạo ticket
                    </Button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <div className="max-h-[640px] overflow-y-auto">
              {tickets.map((ticket) => {
                const status = statusMap[ticket.status];
                return (
                  <button
                    key={ticket.id}
                    type="button"
                    onClick={() => selectTicket(ticket.id)}
                    className={`block w-full border-b border-line p-4 text-left transition last:border-0 ${selectedId === ticket.id ? 'bg-green-50' : 'hover:bg-canvas'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="line-clamp-2 text-sm font-semibold text-ink-900">{ticket.subject}</p>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </div>
                    <p className="mt-2 text-caption">
                      {formatDate(ticket.createdAt)} · #{ticket.id.slice(0, 8)}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </SurfaceCard>

        <section aria-label="Cuộc trao đổi hỗ trợ">
          {detailLoading ? (
            <SurfaceCard>
              <Skeleton className="h-16" />
              <Skeleton className="mt-6 h-72" />
              <Skeleton className="mt-5 h-24" />
            </SurfaceCard>
          ) : detailError ? (
            <EmptyState
              title="Không thể mở ticket"
              description={detailError}
              action={<Button onClick={() => selectedId && void loadDetail(selectedId)}>Thử lại</Button>}
            />
          ) : !detail ? (
            <EmptyState
              title="Chọn một ticket"
              description="Chọn ticket ở danh sách để xem trạng thái và toàn bộ cuộc trao đổi."
              action={canCreate ? <Button onClick={() => setCreateOpen(true)}>Tạo ticket mới</Button> : undefined}
            />
          ) : (
            <SurfaceCard className="overflow-hidden p-0 sm:p-0">
              <div className="border-b border-line p-5 sm:p-6">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div>
                    <p className="text-caption">TICKET #{detail.id.slice(0, 8)}</p>
                    <h2 className="mt-1 text-h2">{detail.subject}</h2>
                    <p className="mt-2 text-sm text-ink-500">Tạo lúc {formatDate(detail.createdAt)}</p>
                  </div>
                  <Badge tone={statusMap[detail.status].tone}>{statusMap[detail.status].label}</Badge>
                </div>
                <p className="mt-4 rounded-xl bg-canvas p-3 text-sm text-ink-500">
                  {statusMap[detail.status].description}
                </p>
                {isAdmin && (detail.status === 'in_progress' || detail.status === 'resolved') && (
                  <div className="mt-4 flex justify-end">
                    <Button
                      size="sm"
                      tone={detail.status === 'resolved' ? 'danger' : 'primary'}
                      onClick={() => setStatusAction(detail.status === 'in_progress' ? 'resolved' : 'closed')}
                    >
                      {detail.status === 'in_progress' ? 'Đã giải quyết' : 'Đóng ticket'}
                    </Button>
                  </div>
                )}
              </div>
              <div className="max-h-[440px] space-y-4 overflow-y-auto bg-canvas/60 p-4 sm:p-6">
                {detail.messages.map((message) => {
                  const isMine = message.senderUserId === session.userId;
                  return (
                    <div
                      key={message.id}
                      className={`flex items-end gap-2 ${isMine ? 'justify-end' : 'justify-start'}`}
                    >
                      {!isMine && <Avatar label={message.senderRole === 'admin' ? 'A' : 'N'} className="shrink-0" />}
                      <div
                        className={`max-w-[82%] rounded-2xl px-4 py-3 shadow-sm ${isMine ? 'rounded-br-md bg-brand-navy text-surface' : 'rounded-bl-md border border-line bg-surface text-ink-700'}`}
                      >
                        <p
                          className={`text-xs font-semibold ${isMine ? 'text-green-50' : message.senderRole === 'admin' ? 'text-green-700' : 'text-ink-500'}`}
                        >
                          {isMine ? 'Bạn' : message.senderRole === 'admin' ? 'Đội ngũ hỗ trợ' : 'Người gửi'}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{message.body}</p>
                        <p className={`mt-1 text-[11px] ${isMine ? 'text-green-100' : 'text-ink-300'}`}>
                          {formatDate(message.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="border-t border-line p-4 sm:p-5">
                {canReply ? (
                  <>
                    <label className="sr-only" htmlFor="support-reply">
                      Phản hồi ticket
                    </label>
                    <TextArea
                      id="support-reply"
                      rows={3}
                      maxLength={1000}
                      placeholder="Viết phản hồi bất đồng bộ..."
                      value={replyBody}
                      onChange={(event) => setReplyBody(event.target.value)}
                    />
                    <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-caption">{replyBody.length} / 1.000 · không phải chat realtime</p>
                      <Button disabled={submitting || !replyBody.trim()} onClick={() => void sendReply()}>
                        {submitting ? 'Đang gửi…' : 'Gửi phản hồi'}
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="rounded-xl bg-canvas p-4 text-center">
                    <p className="font-medium">Ticket không nhận thêm phản hồi</p>
                    <p className="mt-1 text-sm text-ink-500">
                      Trạng thái hiện tại: {statusMap[detail.status].label.toLowerCase()}.
                    </p>
                  </div>
                )}
              </div>
            </SurfaceCard>
          )}
        </section>
      </div>

      <Modal
        open={statusAction !== null}
        title={statusAction === 'resolved' ? 'Xác nhận đã giải quyết' : 'Xác nhận đóng ticket'}
        onClose={() => setStatusAction(null)}
      >
        <p className="text-sm text-ink-500">
          Thao tác sẽ chuyển trạng thái ticket theo đúng thứ tự xử lý và dừng nhận phản hồi khi đã giải quyết.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button tone="secondary" onClick={() => setStatusAction(null)}>
            Quay lại
          </Button>
          <Button
            tone={statusAction === 'closed' ? 'danger' : 'primary'}
            disabled={submitting}
            onClick={() => void updateTicketStatus()}
          >
            {statusAction === 'resolved' ? 'Đã giải quyết' : 'Đóng ticket'}
          </Button>
        </div>
      </Modal>
      <Modal open={createOpen} title="Tạo ticket hỗ trợ" onClose={() => setCreateOpen(false)}>
        <p className="text-sm text-ink-500">Mô tả một vấn đề mỗi ticket để đội ngũ hỗ trợ theo dõi rõ trạng thái.</p>
        <label className="mt-4 block text-sm font-medium">
          Chủ đề
          <TextInput
            autoFocus
            maxLength={120}
            className="mt-1"
            placeholder="Ví dụ: Không thấy booking trong tài khoản"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
          />
        </label>
        <p className="mt-1 text-right text-caption">{subject.length} / 120</p>
        <label className="mt-4 block text-sm font-medium">
          Nội dung
          <TextArea
            rows={6}
            maxLength={1000}
            className="mt-1"
            placeholder="Mô tả điều đã xảy ra và thông tin liên quan"
            value={ticketBody}
            onChange={(event) => setTicketBody(event.target.value)}
          />
        </label>
        <p className="mt-1 text-right text-caption">{ticketBody.length} / 1.000</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button tone="secondary" onClick={() => setCreateOpen(false)}>
            Hủy
          </Button>
          <Button disabled={submitting || !subject.trim() || !ticketBody.trim()} onClick={() => void createTicket()}>
            {submitting ? 'Đang gửi…' : 'Gửi ticket'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
