import { BusinessCode } from '../components/BusinessCode.js';
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
import { RouteState } from '../components/RouteState.js';
import {
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
import { CommunityComposer } from '../components/CommunityComposer';
import { Icon } from '../components/Icon';
import { useAuthPrompt } from '../layout/AuthPrompt';
import { CommunityMediaGrid } from '../components/CommunityMediaGrid';
import { useLiveDataRefresh } from '../realtime/dataInvalidation.js';
import { getMyProfile, type ProfileResult } from '../lib/accountApi.js';

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

import { formatDateTimeVi } from '../lib/formatters.js';

function authorLabel(name?: string | null) {
  return name?.trim() || 'Thành viên cộng đồng';
}
function avatarLabel(name?: string | null) {
  const trimmed = name?.trim();
  return trimmed ? trimmed.slice(0, 1).toUpperCase() : 'C';
}
const formatDate = formatDateTimeVi;

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
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <article className="surface-card overflow-hidden transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgb(20_30_40_/_8%)]">
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar label={avatarLabel(post.authorDisplayName)} src={post.authorAvatarUrl} alt={`Ảnh đại diện ${authorLabel(post.authorDisplayName)}`} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink-900">{authorLabel(post.authorDisplayName)}</p>
              <p className="text-caption">{formatDate(post.createdAt)}{post.editedAt ? ' · đã chỉnh sửa' : ''}</p>
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
        <div className="mt-4"><CommunityMediaGrid images={post.images} /></div>
      </div>
      <div className="flex items-center justify-between border-t border-line px-3 py-2 text-sm">
        <Link to={`/community/${post.id}`} className="inline-flex items-center gap-2 rounded-full px-3 py-2 font-semibold text-ink-500 hover:bg-canvas hover:text-brand-navy"><Icon name="chat" className="h-4 w-4" />{post.commentCount ?? 0} bình luận</Link>
        <div className="relative">
          <button type="button" aria-label="Tùy chọn bài viết" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)} className="grid h-10 w-10 place-items-center rounded-full text-ink-500 hover:bg-canvas hover:text-brand-navy"><Icon name="more" /></button>
          {menuOpen && (
            <div role="menu" className="absolute bottom-full right-0 z-10 mb-1 w-48 rounded-xl border border-line bg-surface p-1.5 shadow-[var(--shadow-raised)]" onClick={() => setMenuOpen(false)}>
              {isOwner && <button type="button" role="menuitem" onClick={() => onEdit(post)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left hover:bg-canvas"><Icon name="edit" className="h-4 w-4" />Chỉnh sửa</button>}
              {isOwner && <button type="button" role="menuitem" onClick={() => onRemove(post)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-danger hover:bg-danger-bg"><Icon name="close" className="h-4 w-4" />Gỡ bài</button>}
              <button type="button" role="menuitem" onClick={() => onReport('post', post.id)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-danger hover:bg-danger-bg"><Icon name="flag" className="h-4 w-4" />Báo cáo</button>
            </div>
          )}
        </div>
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
  const [submitting, setSubmitting] = useState(false);
  const promptAuth = useAuthPrompt();
  const openAuth = () => promptAuth({ title: 'Đăng nhập để tham gia cộng đồng' });
  const [supportOpen, setSupportOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<{
    type: ReportTarget;
    id: string;
  } | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [editingPost, setEditingPost] = useState<CommunityPost | null>(null);
  const [editBody, setEditBody] = useState('');
  const [removingPost, setRemovingPost] = useState<CommunityPost | null>(null);
  const [composerProfile, setComposerProfile] = useState<ProfileResult | null>(null);

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
  useLiveDataRefresh(async () => { await Promise.all([loadFeed(), loadOwnActivity()]); });

  useEffect(() => {
    void loadFeed();
  }, [page]);
  useEffect(() => {
    void loadOwnActivity();
  }, []);
  useEffect(() => {
    if (!session) { setComposerProfile(null); return; }
    const loadProfile = () => { void getMyProfile().then(setComposerProfile).catch(() => setComposerProfile(null)); };
    loadProfile();
    window.addEventListener('courtin:profile-change', loadProfile);
    return () => window.removeEventListener('courtin:profile-change', loadProfile);
  }, [session?.userId]);

  const requireSession = (action: () => void) => {
    if (!session) {
      openAuth();
      return;
    }
    action();
  };

  const published = async () => {
    setComposerOpen(false);
    setNotice({ message: 'Đã đăng bài công khai.', tone: 'success' });
    if (page !== 1) setPage(1);
    else await loadFeed();
    await loadOwnActivity();
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
        message: 'Đã gửi báo cáo. Nội dung vẫn công khai cho đến khi quản trị viên xử lý.',
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
        <p className="courtin-kicker">Sân chơi chung</p>
        <h1 className="mt-1 text-h1">Cộng đồng cầu lông</h1>
        <p className="mt-2 text-sm text-ink-500">
          Chia sẻ công khai, trao đổi văn minh và cùng nhau ra sân. Bảng tin luôn xếp theo bài mới nhất.
        </p>
      </header>

      <div className="mt-6 grid items-start gap-5 lg:grid-cols-[260px_minmax(0,1fr)_300px]">
        <aside className="order-2 space-y-4 lg:order-1 lg:sticky lg:top-24" aria-label="Hoạt động của tôi">
          <SurfaceCard className="p-4 sm:p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-h3">{session ? 'Hoạt động của tôi' : 'Quy tắc cộng đồng'}</h2>
              {session && <Badge>{ownPosts.length} bài</Badge>}
            </div>
            {!session ? (
              <ul className="mt-4 grid gap-3 text-sm text-ink-700">
                {['Tôn trọng người chơi khác, không công kích cá nhân.', 'Không quảng cáo, không chia sẻ thông tin cá nhân của người khác.', 'Vấn đề tiền, đặt sân: gửi ticket hỗ trợ thay vì đăng công khai.'].map((rule) => <li key={rule} className="flex gap-2.5"><Icon name="check" className="mt-0.5 h-4 w-4 text-success" />{rule}</li>)}
              </ul>
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
                            <div className="min-w-0">
                              <p className="truncate">{report.targetType === 'post' ? 'Bài viết đã báo cáo' : 'Bình luận đã báo cáo'}</p>
                              <BusinessCode code={report.businessCode} label="Mã báo cáo" />
                            </div>
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
            {!session ? (
              <div className="flex items-center gap-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-green-50 text-brand-navy"><Icon name="edit" /></span>
                <p className="flex-1 text-sm"><b>Muốn chia sẻ trận đấu của bạn?</b><br /><span className="text-ink-500">Đăng nhập để đăng bài và bình luận.</span></p>
                <Button size="sm" onClick={openAuth}>Đăng nhập</Button>
              </div>
            ) : !composerOpen ? (
              <button
                type="button"
                className="flex w-full items-center gap-3 text-left"
                onClick={() => requireSession(() => setComposerOpen(true))}
              >
                <Avatar label={avatarLabel(composerProfile?.playerProfile?.displayName ?? session?.userId)} src={composerProfile?.playerProfile?.avatarUrl} alt="Ảnh đại diện của bạn" />
                <span className="flex-1 rounded-full bg-canvas px-4 py-3 text-sm text-ink-500 transition hover:bg-green-50 hover:text-green-700">
                  Chia sẻ với cộng đồng...
                </span>
              </button>
            ) : (
              <div>
                <div className="flex items-center gap-3">
                  <Avatar label={avatarLabel(composerProfile?.playerProfile?.displayName ?? session?.userId)} src={composerProfile?.playerProfile?.avatarUrl} alt="Ảnh đại diện của bạn" />
                  <div>
                    <p className="text-sm font-semibold">Bài viết công khai</p>
                    <p className="text-caption">Mọi người đều có thể xem bài này</p>
                  </div>
                </div>
                <div className="mt-4"><CommunityComposer onPublished={published} /></div>
              </div>
            )}
          </SurfaceCard>

          {error && <RouteState variant="error" title="Chưa tải được bảng tin" description="Máy chủ đang bận hoặc kết nối bị gián đoạn. Hãy thử lại." onRetry={() => void loadFeed()} />}
          {loading ? (
            <RouteState variant="loading" title="Đang tải bảng tin cộng đồng" />
          ) : posts.length === 0 ? (
            <EmptyState
              title="Chưa có bài viết, hãy là người đầu tiên"
              description="Chia sẻ một câu chuyện, kinh nghiệm hoặc lời mời giao lưu với cộng đồng."
              action={
                session ? (
                  <Button onClick={() => setComposerOpen(true)}>Viết bài đầu tiên</Button>
                ) : (
                  <Button onClick={() => openAuth()}>Đăng nhập để viết bài</Button>
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
          <SurfaceCard className="overflow-hidden !p-0">
            <div className="bg-brand-navy p-5 text-surface">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-green-100">Kênh riêng tư</p>
              <h2 className="mt-1 text-h3 !text-surface">Cần hỗ trợ?</h2>
              <p className="mt-2 text-sm text-green-50">
                Gửi ticket riêng cho đội ngũ vận hành. Ticket không xuất hiện trên bảng tin.
              </p>
            </div>
            <div className="p-4">
              <Button className="w-full" onClick={() => (session ? navigate('/support') : openAuth())}>
                Tạo ticket hỗ trợ
              </Button>
              {session && (
                <div className="mt-5 border-t border-line pt-4">
                  <div className="flex items-center justify-between">
                    <p className="text-caption uppercase">Yêu cầu của tôi</p>
                    <Link to="/support" className="text-xs font-semibold text-green-700 hover:underline">
                      Xem tất cả
                    </Link>
                  </div>
                  {activityLoading ? (
                    <Skeleton className="mt-3 h-20" />
                  ) : tickets.length === 0 ? (
                    <p className="mt-3 text-sm text-ink-500">Chưa có yêu cầu.</p>
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

      <Button className="fixed bottom-24 right-4 z-40 shadow-lg lg:hidden" onClick={() => setSupportOpen(true)}>
        Hỗ trợ
      </Button>

      <Modal open={supportOpen} title="Hỗ trợ riêng tư" onClose={() => setSupportOpen(false)}>
        <div className="rounded-xl bg-green-50 p-4">
          <p className="font-semibold text-green-700">Yêu cầu không xuất hiện trên bảng tin</p>
          <p className="mt-1 text-sm text-ink-500">Trao đổi bất đồng bộ chỉ giữa bạn và đội ngũ vận hành.</p>
        </div>
        <Button className="mt-4 w-full" onClick={() => (session ? navigate('/support') : openAuth())}>
          Tạo ticket hỗ trợ
        </Button>
        {session && (
          <div className="mt-5 border-t border-line pt-4">
            <p className="text-caption uppercase">Yêu cầu gần đây</p>
            {tickets.length === 0 ? (
              <p className="mt-2 text-sm text-ink-500">Chưa có yêu cầu.</p>
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
                      <div className="min-w-0"><p className="truncate text-sm font-medium">{ticket.subject}</p></div>
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
        <p className="text-sm text-ink-500">Báo cáo sẽ chuyển tới quản trị viên xem xét và không tự động gỡ nội dung.</p>
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
