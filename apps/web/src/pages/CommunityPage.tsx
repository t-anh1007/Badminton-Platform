import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  Modal,
  Pagination,
  Skeleton,
  SurfaceCard,
  TextArea,
  Toast,
} from '../components/ui';
import {
  createCommunityPost,
  createCommunityReport,
  editCommunityPost,
  getCommunitySession,
  listCommunityPosts,
  listOwnPosts,
  listOwnReports,
  listSupportTickets,
  removeCommunityPost,
  type CommunityPost,
  type CommunityReport,
  type ContentStatus,
  type ReportTarget,
  type SupportTicket,
  type TicketStatus,
} from '../lib/communityApi';

const PAGE_SIZE = 10;
const postStatus: Record<ContentStatus, { label: string; tone: 'success' | 'warning' | 'danger' }> = {
  published: { label: 'Công khai', tone: 'success' },
  hidden: { label: 'Đang ẩn', tone: 'warning' },
  removed: { label: 'Đã gỡ', tone: 'danger' },
};
const reportStatus = {
  open: { label: 'Đang chờ xử lý', tone: 'warning' },
  actioned: { label: 'Đã xử lý', tone: 'success' },
  dismissed: { label: 'Không vi phạm', tone: 'neutral' },
} as const;
const ticketStatus: Record<TicketStatus, { label: string; tone: 'success' | 'warning' | 'neutral' }> = {
  open: { label: 'Mới gửi', tone: 'warning' },
  in_progress: { label: 'Đang xử lý', tone: 'warning' },
  resolved: { label: 'Đã giải quyết', tone: 'success' },
  closed: { label: 'Đã đóng', tone: 'neutral' },
};

function shortUser(userId: string) {
  return `Người chơi ${userId.slice(0, 8)}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function PostCard({
  post,
  currentUserId,
  onReport,
  onEdit,
  onRemove,
}: {
  post: CommunityPost;
  currentUserId?: string;
  onReport: (targetType: ReportTarget, targetId: string) => void;
  onEdit: (post: CommunityPost) => void;
  onRemove: (post: CommunityPost) => void;
}) {
  const isOwner = currentUserId === post.authorUserId;
  return (
    <article className="surface-card overflow-hidden transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgb(20_30_40_/_8%)]">
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar label={post.authorUserId.slice(0, 1)} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink-900">{shortUser(post.authorUserId)}</p>
              <p className="text-caption">
                {formatDate(post.createdAt)}
                {post.editedAt ? ' · đã chỉnh sửa' : ''}
              </p>
            </div>
          </div>
          {isOwner && (
            <span className="shrink-0">
              <Badge tone="success">Bài của bạn</Badge>
            </span>
          )}
        </div>
        <Link
          to={`/community/${post.id}`}
          className="mt-4 block whitespace-pre-wrap text-body text-ink-700 hover:text-ink-900"
        >
          {post.body}
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-x-1 border-t border-line px-3 py-2 text-sm">
        <Link
          to={`/community/${post.id}`}
          className="rounded-full px-3 py-2 font-medium text-green-700 hover:bg-green-50"
        >
          {post.commentCount ?? 0} bình luận
        </Link>
        <button
          type="button"
          onClick={() => onReport('post', post.id)}
          className="rounded-full px-3 py-2 font-medium text-ink-500 hover:bg-canvas hover:text-ink-900"
        >
          Báo cáo
        </button>
        {isOwner && (
          <>
            <button
              type="button"
              onClick={() => onEdit(post)}
              className="rounded-full px-3 py-2 font-medium text-ink-500 hover:bg-canvas hover:text-ink-900"
            >
              Chỉnh sửa
            </button>
            <button
              type="button"
              onClick={() => onRemove(post)}
              className="rounded-full px-3 py-2 font-medium text-danger hover:bg-danger-bg"
            >
              Gỡ bài
            </button>
          </>
        )}
      </div>
    </article>
  );
}

export function CommunityPage() {
  const navigate = useNavigate();
  const session = getCommunitySession();
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [ownPosts, setOwnPosts] = useState<CommunityPost[]>([]);
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(Boolean(session));
  const [error, setError] = useState('');
  const [activityError, setActivityError] = useState('');
  const [notice, setNotice] = useState<{
    message: string;
    tone: 'success' | 'error';
  } | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [postBody, setPostBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<{
    type: ReportTarget;
    id: string;
  } | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [editingPost, setEditingPost] = useState<CommunityPost | null>(null);
  const [editBody, setEditBody] = useState('');
  const [removingPost, setRemovingPost] = useState<CommunityPost | null>(null);

  const loadFeed = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await listCommunityPosts(page, PAGE_SIZE);
      setPosts(result.posts);
      setHasMore(result.posts.length === PAGE_SIZE);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải bảng tin cộng đồng.');
    } finally {
      setLoading(false);
    }
  };

  const loadOwnActivity = async () => {
    if (!session) return;
    setActivityLoading(true);
    setActivityError('');
    const [postResult, reportResult, ticketResult] = await Promise.allSettled([
      listOwnPosts(),
      listOwnReports(),
      listSupportTickets(),
    ]);
    if (postResult.status === 'fulfilled') setOwnPosts(postResult.value.posts);
    if (reportResult.status === 'fulfilled') setReports(reportResult.value.reports);
    if (ticketResult.status === 'fulfilled') setTickets(ticketResult.value.tickets);
    if ([postResult, reportResult, ticketResult].some((result) => result.status === 'rejected')) {
      setActivityError('Một phần hoạt động cá nhân chưa tải được. Hãy thử lại.');
    }
    setActivityLoading(false);
  };

  useEffect(() => {
    void loadFeed();
  }, [page]);
  useEffect(() => {
    void loadOwnActivity();
  }, []);

  const requireSession = (action: () => void) => {
    if (!session) {
      setAuthOpen(true);
      return;
    }
    action();
  };

  const publish = async () => {
    const body = postBody.trim();
    if (!body) {
      setNotice({
        message: 'Hãy nhập nội dung trước khi đăng.',
        tone: 'error',
      });
      return;
    }
    setSubmitting(true);
    try {
      await createCommunityPost(body);
      setPostBody('');
      setComposerOpen(false);
      setNotice({ message: 'Đã đăng bài công khai.', tone: 'success' });
      if (page !== 1) setPage(1);
      else await loadFeed();
      await loadOwnActivity();
    } catch (cause) {
      setNotice({
        message: cause instanceof Error ? cause.message : 'Không thể đăng bài.',
        tone: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const openReport = (type: ReportTarget, id: string) =>
    requireSession(() => {
      setReportReason('');
      setReportTarget({ type, id });
    });

  const submitReport = async () => {
    if (!reportTarget || !reportReason.trim()) return;
    setSubmitting(true);
    try {
      const report = await createCommunityReport(reportTarget.type, reportTarget.id, reportReason.trim());
      setReports((current) => [report, ...current]);
      setReportTarget(null);
      setReportReason('');
      setNotice({
        message: 'Đã gửi báo cáo. Nội dung vẫn công khai cho đến khi Admin xử lý.',
        tone: 'success',
      });
    } catch (cause) {
      setNotice({
        message: cause instanceof Error ? cause.message : 'Không thể gửi báo cáo.',
        tone: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const openEdit = (post: CommunityPost) => {
    setEditingPost(post);
    setEditBody(post.body);
  };

  const saveEdit = async () => {
    if (!editingPost || !editBody.trim()) return;
    setSubmitting(true);
    try {
      await editCommunityPost(editingPost.id, editBody.trim());
      setEditingPost(null);
      setNotice({ message: 'Đã cập nhật bài viết.', tone: 'success' });
      await Promise.all([loadFeed(), loadOwnActivity()]);
    } catch (cause) {
      setNotice({
        message: cause instanceof Error ? cause.message : 'Không thể cập nhật bài viết.',
        tone: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const confirmRemove = async () => {
    if (!removingPost) return;
    setSubmitting(true);
    try {
      await removeCommunityPost(removingPost.id);
      setRemovingPost(null);
      setNotice({
        message: 'Đã gỡ bài khỏi bảng tin công khai.',
        tone: 'success',
      });
      await Promise.all([loadFeed(), loadOwnActivity()]);
    } catch (cause) {
      setNotice({
        message: cause instanceof Error ? cause.message : 'Không thể gỡ bài viết.',
        tone: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page-container py-8 sm:py-10">
      {notice && <Toast key={notice.message} message={notice.message} tone={notice.tone} />}
      <header className="max-w-2xl">
        <p className="text-caption uppercase tracking-[0.14em] text-green-700">Sân chơi chung</p>
        <h1 className="mt-1 text-h1">Cộng đồng cầu lông</h1>
        <p className="mt-2 text-sm text-ink-500">
          Chia sẻ công khai, trao đổi văn minh và cùng nhau ra sân. Bảng tin luôn xếp theo bài mới nhất.
        </p>
      </header>

      <div className="mt-6 grid items-start gap-5 lg:grid-cols-[240px_minmax(0,1fr)_260px]">
        <aside className="order-2 space-y-4 lg:order-1 lg:sticky lg:top-24" aria-label="Hoạt động của tôi">
          <SurfaceCard className="p-4 sm:p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-h3">Hoạt động của tôi</h2>
              {session && <Badge>{ownPosts.length} bài</Badge>}
            </div>
            {!session ? (
              <div className="mt-4">
                <p className="text-sm text-ink-500">Đăng nhập để xem bài và trạng thái báo cáo của bạn.</p>
                <Button className="mt-4 w-full" tone="secondary" size="sm" onClick={() => setAuthOpen(true)}>
                  Đăng nhập
                </Button>
              </div>
            ) : activityLoading ? (
              <div className="mt-4 space-y-3">
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
              </div>
            ) : (
              <>
                {activityError && (
                  <p className="mt-3 rounded-xl bg-warning-bg p-3 text-xs text-ink-700">{activityError}</p>
                )}
                <div className="mt-4 space-y-3">
                  {ownPosts.length === 0 ? (
                    <p className="text-sm text-ink-500">Bạn chưa đăng bài nào.</p>
                  ) : (
                    ownPosts.slice(0, 4).map((post) => {
                      const status = postStatus[post.status];
                      return (
                        <div key={post.id} className="border-b border-line pb-3 last:border-0 last:pb-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="line-clamp-2 text-sm font-medium">{post.body}</p>
                            <span className="shrink-0">
                              <Badge tone={status.tone}>{status.label}</Badge>
                            </span>
                          </div>
                          {post.status === 'published' && (
                            <div className="mt-2 flex gap-3 text-xs font-semibold">
                              <button onClick={() => openEdit(post)} className="text-green-700 hover:underline">
                                Sửa
                              </button>
                              <button onClick={() => setRemovingPost(post)} className="text-danger hover:underline">
                                Gỡ
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
                <div className="mt-5 border-t border-line pt-4">
                  <p className="text-caption uppercase">Báo cáo đã gửi</p>
                  {reports.length === 0 ? (
                    <p className="mt-2 text-sm text-ink-500">Chưa có báo cáo.</p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {reports.slice(0, 3).map((report) => {
                        const status = reportStatus[report.status];
                        return (
                          <div key={report.id} className="flex items-center justify-between gap-2 text-xs">
                            <span className="truncate">
                              {report.targetType === 'post' ? 'Bài viết' : 'Bình luận'} {report.targetId.slice(0, 6)}
                            </span>
                            <Badge tone={status.tone}>{status.label}</Badge>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </SurfaceCard>
        </aside>

        <main className="order-1 min-w-0 space-y-4 lg:order-2">
          <SurfaceCard className="p-4 sm:p-4">
            {!composerOpen ? (
              <button
                type="button"
                className="flex w-full items-center gap-3 text-left"
                onClick={() => requireSession(() => setComposerOpen(true))}
              >
                <Avatar label={session?.userId.slice(0, 1) ?? 'K'} />
                <span className="flex-1 rounded-full bg-canvas px-4 py-3 text-sm text-ink-500 transition hover:bg-green-50 hover:text-green-700">
                  Chia sẻ với cộng đồng...
                </span>
              </button>
            ) : (
              <div>
                <div className="flex items-center gap-3">
                  <Avatar label={session?.userId.slice(0, 1)} />
                  <div>
                    <p className="text-sm font-semibold">Bài viết công khai</p>
                    <p className="text-caption">Mọi người đều có thể xem bài này</p>
                  </div>
                </div>
                <TextArea
                  autoFocus
                  rows={5}
                  maxLength={5000}
                  className="mt-4 resize-y"
                  placeholder="Bạn muốn chia sẻ điều gì về cầu lông?"
                  value={postBody}
                  onChange={(event) => setPostBody(event.target.value)}
                />
                <div className="mt-3 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-caption">{postBody.length.toLocaleString('vi-VN')} / 5.000 ký tự · chỉ văn bản</p>
                  <div className="flex justify-end gap-2">
                    <Button
                      tone="ghost"
                      onClick={() => {
                        setComposerOpen(false);
                        setPostBody('');
                      }}
                    >
                      Hủy
                    </Button>
                    <Button disabled={submitting || !postBody.trim()} onClick={() => void publish()}>
                      {submitting ? 'Đang đăng…' : 'Đăng bài'}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </SurfaceCard>

          {error && (
            <div className="rounded-xl border border-danger bg-danger-bg p-4 text-sm text-danger">
              {error}{' '}
              <button className="font-semibold underline" onClick={() => void loadFeed()}>
                Thử lại
              </button>
            </div>
          )}
          {loading ? (
            <div className="space-y-4">
              {[0, 1, 2].map((item) => (
                <Skeleton key={item} className="h-52" />
              ))}
            </div>
          ) : posts.length === 0 ? (
            <EmptyState
              title="Chưa có bài viết, hãy là người đầu tiên"
              description="Chia sẻ một câu chuyện, kinh nghiệm hoặc lời mời giao lưu với cộng đồng."
              action={
                session ? (
                  <Button onClick={() => setComposerOpen(true)}>Viết bài đầu tiên</Button>
                ) : (
                  <Button onClick={() => setAuthOpen(true)}>Đăng nhập để viết bài</Button>
                )
              }
            />
          ) : (
            <>
              {posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  currentUserId={session?.userId}
                  onReport={openReport}
                  onEdit={openEdit}
                  onRemove={setRemovingPost}
                />
              ))}
              {(page > 1 || hasMore) && (
                <div className="pt-2">
                  <Pagination page={page} pageCount={hasMore ? page + 1 : page} onChange={setPage} />
                </div>
              )}
            </>
          )}
        </main>

        <aside className="order-3 hidden lg:sticky lg:top-24 lg:block" aria-label="Hỗ trợ">
          <SurfaceCard className="overflow-hidden p-0 sm:p-0">
            <div className="bg-green-700 p-5 text-surface">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-green-100">Kênh riêng tư</p>
              <h2 className="mt-1 text-h3">Cần hỗ trợ?</h2>
              <p className="mt-2 text-sm text-green-50">
                Gửi ticket riêng cho đội ngũ vận hành. Ticket không xuất hiện trên bảng tin.
              </p>
            </div>
            <div className="p-4">
              <Button className="w-full" onClick={() => (session ? navigate('/support') : setAuthOpen(true))}>
                Tạo ticket hỗ trợ
              </Button>
              {session && (
                <div className="mt-5 border-t border-line pt-4">
                  <div className="flex items-center justify-between">
                    <p className="text-caption uppercase">Ticket của tôi</p>
                    <Link to="/support" className="text-xs font-semibold text-green-700 hover:underline">
                      Xem tất cả
                    </Link>
                  </div>
                  {activityLoading ? (
                    <Skeleton className="mt-3 h-20" />
                  ) : tickets.length === 0 ? (
                    <p className="mt-3 text-sm text-ink-500">Chưa có ticket.</p>
                  ) : (
                    <div className="mt-3 space-y-3">
                      {tickets.slice(0, 3).map((ticket) => {
                        const status = ticketStatus[ticket.status];
                        return (
                          <Link
                            key={ticket.id}
                            to={`/support?ticket=${ticket.id}`}
                            className="block rounded-xl border border-line p-3 hover:border-green-100 hover:bg-green-50"
                          >
                            <p className="line-clamp-1 text-sm font-medium">{ticket.subject}</p>
                            <div className="mt-2">
                              <Badge tone={status.tone}>{status.label}</Badge>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </SurfaceCard>
        </aside>
      </div>

      <Button className="fixed bottom-5 right-4 z-40 shadow-lg lg:hidden" onClick={() => setSupportOpen(true)}>
        Hỗ trợ
      </Button>

      <Modal open={authOpen} title="Cần đăng nhập" onClose={() => setAuthOpen(false)}>
        <p className="text-sm text-ink-500">
          Bạn vẫn có thể xem bảng tin công khai. Hãy đăng nhập để đăng bài, bình luận, báo cáo hoặc gửi ticket hỗ trợ.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button tone="secondary" onClick={() => setAuthOpen(false)}>
            Ở lại bảng tin
          </Button>
          <Button onClick={() => navigate('/auth')}>Đăng nhập</Button>
        </div>
      </Modal>
      <Modal open={supportOpen} title="Hỗ trợ riêng tư" onClose={() => setSupportOpen(false)}>
        <div className="rounded-xl bg-green-50 p-4">
          <p className="font-semibold text-green-700">Ticket không xuất hiện trên bảng tin</p>
          <p className="mt-1 text-sm text-ink-500">Trao đổi bất đồng bộ chỉ giữa bạn và đội ngũ vận hành.</p>
        </div>
        <Button className="mt-4 w-full" onClick={() => (session ? navigate('/support') : setAuthOpen(true))}>
          Tạo ticket hỗ trợ
        </Button>
        {session && (
          <div className="mt-5 border-t border-line pt-4">
            <p className="text-caption uppercase">Ticket gần đây</p>
            {tickets.length === 0 ? (
              <p className="mt-2 text-sm text-ink-500">Chưa có ticket.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {tickets.slice(0, 3).map((ticket) => {
                  const status = ticketStatus[ticket.status];
                  return (
                    <Link
                      key={ticket.id}
                      to={`/support?ticket=${ticket.id}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-line p-3"
                    >
                      <span className="truncate text-sm font-medium">{ticket.subject}</span>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </Modal>
      <Modal open={Boolean(reportTarget)} title="Báo cáo nội dung" onClose={() => setReportTarget(null)}>
        <p className="text-sm text-ink-500">Báo cáo sẽ chuyển tới Admin xem xét và không tự động gỡ nội dung.</p>
        <label className="mt-4 block text-sm font-medium">
          Lý do
          <TextArea
            rows={4}
            maxLength={1000}
            className="mt-1"
            placeholder="Mô tả rõ nội dung cần xem xét"
            value={reportReason}
            onChange={(event) => setReportReason(event.target.value)}
          />
        </label>
        <p className="mt-2 text-right text-caption">{reportReason.length} / 1.000</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button tone="secondary" onClick={() => setReportTarget(null)}>
            Hủy
          </Button>
          <Button disabled={submitting || !reportReason.trim()} onClick={() => void submitReport()}>
            Gửi báo cáo
          </Button>
        </div>
      </Modal>
      <Modal open={Boolean(editingPost)} title="Chỉnh sửa bài viết" onClose={() => setEditingPost(null)}>
        <TextArea rows={6} maxLength={5000} value={editBody} onChange={(event) => setEditBody(event.target.value)} />
        <div className="mt-2 flex justify-between text-caption">
          <span>Nhãn “đã chỉnh sửa” sẽ xuất hiện trên bài.</span>
          <span>{editBody.length} / 5.000</span>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button tone="secondary" onClick={() => setEditingPost(null)}>
            Hủy
          </Button>
          <Button disabled={submitting || !editBody.trim()} onClick={() => void saveEdit()}>
            Lưu thay đổi
          </Button>
        </div>
      </Modal>
      <Modal open={Boolean(removingPost)} title="Gỡ bài viết?" onClose={() => setRemovingPost(null)}>
        <p className="text-sm text-ink-500">
          Bài sẽ biến khỏi bảng tin công khai nhưng vẫn được giữ lại phục vụ kiểm duyệt và lịch sử.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button tone="secondary" onClick={() => setRemovingPost(null)}>
            Giữ bài
          </Button>
          <Button tone="danger" disabled={submitting} onClick={() => void confirmRemove()}>
            Gỡ bài
          </Button>
        </div>
      </Modal>
    </div>
  );
}
