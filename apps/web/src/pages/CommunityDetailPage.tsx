import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Avatar, Badge, Button, Modal, SurfaceCard, TextArea, Toast } from '../components/ui';
import { RouteState } from '../components/RouteState.js';
import { CommunityMediaGrid } from '../components/CommunityMediaGrid';
import {
  createCommunityComment,
  createCommunityReport,
  editCommunityPost,
  getCommunityPost,
  getCommunitySession,
  removeCommunityComment,
  removeCommunityPost,
  type CommunityPostDetail,
  type ReportTarget,
} from '../lib/communityApi';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function userLabel(userId: string) {
  return userId ? 'Thành viên cộng đồng' : 'Người chơi';
}

export function CommunityDetailPage() {
  const { postId } = useParams();
  const navigate = useNavigate();
  const session = getCommunitySession();
  const [post, setPost] = useState<CommunityPostDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<{
    message: string;
    tone: 'success' | 'error';
  } | null>(null);
  const [commentBody, setCommentBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<{
    type: ReportTarget;
    id: string;
  } | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [editBody, setEditBody] = useState('');
  const [removePostOpen, setRemovePostOpen] = useState(false);
  const [removeCommentId, setRemoveCommentId] = useState<string | null>(null);

  const load = async () => {
    if (!postId) {
      setError('Thiếu mã bài viết.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      setPost(await getCommunityPost(postId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải bài viết.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [postId]);

  const requireSession = (action: () => void) => {
    if (!session) {
      setAuthOpen(true);
      return;
    }
    action();
  };

  const addComment = async () => {
    if (!post || !commentBody.trim()) return;
    setSubmitting(true);
    try {
      const comment = await createCommunityComment(post.id, commentBody.trim());
      setPost((current) => (current ? { ...current, comments: [...current.comments, comment] } : current));
      setCommentBody('');
      setNotice({ message: 'Đã đăng bình luận.', tone: 'success' });
    } catch (cause) {
      setNotice({
        message: cause instanceof Error ? cause.message : 'Không thể đăng bình luận.',
        tone: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const submitReport = async () => {
    if (!reportTarget || !reportReason.trim()) return;
    setSubmitting(true);
    try {
      await createCommunityReport(reportTarget.type, reportTarget.id, reportReason.trim());
      setReportTarget(null);
      setReportReason('');
      setNotice({
        message: 'Đã gửi báo cáo. Nội dung sẽ được Admin xem xét.',
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

  const savePost = async () => {
    if (!post || !editBody.trim()) return;
    setSubmitting(true);
    try {
      const updated = await editCommunityPost(post.id, editBody.trim());
      setPost((current) => (current ? { ...current, ...updated } : current));
      setEditOpen(false);
      setNotice({ message: 'Đã cập nhật bài viết.', tone: 'success' });
    } catch (cause) {
      setNotice({
        message: cause instanceof Error ? cause.message : 'Không thể cập nhật bài viết.',
        tone: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const deletePost = async () => {
    if (!post) return;
    setSubmitting(true);
    try {
      await removeCommunityPost(post.id);
      navigate('/community', { replace: true });
    } catch (cause) {
      setNotice({
        message: cause instanceof Error ? cause.message : 'Không thể gỡ bài viết.',
        tone: 'error',
      });
      setSubmitting(false);
    }
  };

  const deleteComment = async () => {
    if (!removeCommentId) return;
    setSubmitting(true);
    try {
      await removeCommunityComment(removeCommentId);
      setPost((current) =>
        current
          ? {
              ...current,
              comments: current.comments.filter((comment) => comment.id !== removeCommentId),
            }
          : current,
      );
      setRemoveCommentId(null);
      setNotice({ message: 'Đã gỡ bình luận.', tone: 'success' });
    } catch (cause) {
      setNotice({
        message: cause instanceof Error ? cause.message : 'Không thể gỡ bình luận.',
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

  if (loading)
    return (
      <div className="page-container py-8 sm:py-10">
        <RouteState variant="loading" title="Đang tải bài viết và bình luận" />
      </div>
    );

  if (error || !post)
    return (
      <div className="page-container py-8 sm:py-10">
        <RouteState
          variant="error"
          title="Không thể mở bài viết"
          description={error || 'Bài viết không còn công khai hoặc không tồn tại.'}
          onRetry={() => void load()}
          action={<Button onClick={() => navigate('/community')}>Về bảng tin</Button>}
        />
      </div>
    );

  const isOwner = session?.userId === post.authorUserId;

  return (
    <div className="page-container py-8 sm:py-10">
      {notice && <Toast key={notice.message} message={notice.message} tone={notice.tone} />}
      <Link
        to="/community"
        className="inline-flex items-center gap-2 text-sm font-semibold text-green-700 hover:underline"
      >
        ← Về bảng tin
      </Link>
      <div className="mx-auto mt-5 max-w-3xl space-y-5">
        <article className="surface-card overflow-hidden">
          <div className="p-5 sm:p-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar label={post.authorUserId.slice(0, 1)} className="h-11 w-11" />
                <div className="min-w-0">
                  <p className="truncate font-semibold">{isOwner ? 'Bạn' : userLabel(post.authorUserId)}</p>
                  <p className="text-caption">
                    {formatDate(post.createdAt)}
                    {post.editedAt ? ' · đã chỉnh sửa' : ''}
                  </p>
                </div>
              </div>
              {isOwner && <Badge tone="success">Bài của bạn</Badge>}
            </div>
            <p className="mt-6 whitespace-pre-wrap text-body text-ink-700">{post.body}</p>
            <div className="mt-4"><CommunityMediaGrid images={post.images} /></div>
          </div>
          <div className="flex flex-wrap items-center border-t border-line px-3 py-2 text-sm">
            <span className="px-3 py-2 font-semibold text-ink-700">{post.comments.length} bình luận</span>
            <button
              type="button"
              onClick={() => openReport('post', post.id)}
              className="rounded-full px-3 py-2 font-medium text-ink-500 hover:bg-canvas hover:text-ink-900"
            >
              Báo cáo bài viết
            </button>
            {isOwner && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setEditBody(post.body);
                    setEditOpen(true);
                  }}
                  className="rounded-full px-3 py-2 font-medium text-green-700 hover:bg-green-50"
                >
                  Chỉnh sửa
                </button>
                <button
                  type="button"
                  onClick={() => setRemovePostOpen(true)}
                  className="rounded-full px-3 py-2 font-medium text-danger hover:bg-danger-bg"
                >
                  Gỡ bài
                </button>
              </>
            )}
          </div>
        </article>

        <SurfaceCard>
          <h2 className="text-h2">Bình luận</h2>
          {!session ? (
            <button
              type="button"
              onClick={() => setAuthOpen(true)}
              className="mt-4 flex w-full items-center gap-3 rounded-xl border border-line p-3 text-left hover:border-green-100 hover:bg-green-50"
            >
              <Avatar label="K" />
              <span className="text-sm text-ink-500">Đăng nhập để tham gia trao đổi...</span>
            </button>
          ) : (
            <div className="mt-4 flex items-start gap-3">
              <Avatar label={session.userId.slice(0, 1)} className="mt-1 shrink-0" />
              <div className="min-w-0 flex-1">
                <TextArea
                  rows={3}
                  maxLength={1000}
                  placeholder="Viết bình luận công khai..."
                  value={commentBody}
                  onChange={(event) => setCommentBody(event.target.value)}
                />
                <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-caption">{commentBody.length} / 1.000</p>
                  <Button size="sm" disabled={submitting || !commentBody.trim()} onClick={() => void addComment()}>
                    Bình luận
                  </Button>
                </div>
              </div>
            </div>
          )}

          {post.comments.length === 0 ? (
            <div className="mt-6 rounded-xl bg-canvas p-5 text-center">
              <p className="font-medium">Chưa có bình luận</p>
              <p className="mt-1 text-sm text-ink-500">Hãy bắt đầu cuộc trao đổi đầu tiên.</p>
            </div>
          ) : (
            <div className="mt-6 divide-y divide-line">
              {post.comments.map((comment) => {
                const commentOwner = session?.userId === comment.authorUserId;
                return (
                  <article key={comment.id} className="flex gap-3 py-5 first:pt-0 last:pb-0">
                    <Avatar label={comment.authorUserId.slice(0, 1)} className="shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <p className="text-sm font-semibold">{commentOwner ? 'Bạn' : userLabel(comment.authorUserId)}</p>
                        <p className="text-caption">{formatDate(comment.createdAt)}</p>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink-700">{comment.body}</p>
                      <div className="mt-2 flex gap-3 text-xs font-semibold">
                        <button
                          type="button"
                          onClick={() => openReport('comment', comment.id)}
                          className="text-ink-500 hover:text-ink-900"
                        >
                          Báo cáo
                        </button>
                        {commentOwner && (
                          <button
                            type="button"
                            onClick={() => setRemoveCommentId(comment.id)}
                            className="text-danger hover:underline"
                          >
                            Gỡ bình luận
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </SurfaceCard>
      </div>

      <Modal open={authOpen} title="Cần đăng nhập" onClose={() => setAuthOpen(false)}>
        <p className="text-sm text-ink-500">
          Bài viết và bình luận là công khai. Đăng nhập để bình luận hoặc gửi báo cáo tới Admin.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button tone="secondary" onClick={() => setAuthOpen(false)}>
            Đóng
          </Button>
          <Button onClick={() => navigate('/auth')}>Đăng nhập</Button>
        </div>
      </Modal>
      <Modal open={Boolean(reportTarget)} title="Báo cáo nội dung" onClose={() => setReportTarget(null)}>
        <p className="text-sm text-ink-500">Báo cáo không tự động gỡ nội dung. Admin sẽ xem xét lý do bạn cung cấp.</p>
        <label className="mt-4 block text-sm font-medium">
          Lý do
          <TextArea
            rows={4}
            maxLength={1000}
            className="mt-1"
            value={reportReason}
            onChange={(event) => setReportReason(event.target.value)}
            placeholder="Mô tả nội dung cần xem xét"
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
      <Modal open={editOpen} title="Chỉnh sửa bài viết" onClose={() => setEditOpen(false)}>
        <TextArea rows={7} maxLength={5000} value={editBody} onChange={(event) => setEditBody(event.target.value)} />
        <div className="mt-2 flex justify-between text-caption">
          <span>Bài sẽ được gắn nhãn “đã chỉnh sửa”.</span>
          <span>{editBody.length} / 5.000</span>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button tone="secondary" onClick={() => setEditOpen(false)}>
            Hủy
          </Button>
          <Button disabled={submitting || !editBody.trim()} onClick={() => void savePost()}>
            Lưu thay đổi
          </Button>
        </div>
      </Modal>
      <Modal open={removePostOpen} title="Gỡ bài viết?" onClose={() => setRemovePostOpen(false)}>
        <p className="text-sm text-ink-500">
          Bài sẽ không còn xuất hiện công khai. Bản ghi vẫn được giữ cho lịch sử kiểm duyệt.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button tone="secondary" onClick={() => setRemovePostOpen(false)}>
            Giữ bài
          </Button>
          <Button tone="danger" disabled={submitting} onClick={() => void deletePost()}>
            Gỡ bài
          </Button>
        </div>
      </Modal>
      <Modal open={Boolean(removeCommentId)} title="Gỡ bình luận?" onClose={() => setRemoveCommentId(null)}>
        <p className="text-sm text-ink-500">Bình luận sẽ biến khỏi luồng công khai nhưng không bị xóa cứng.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button tone="secondary" onClick={() => setRemoveCommentId(null)}>
            Giữ bình luận
          </Button>
          <Button tone="danger" disabled={submitting} onClick={() => void deleteComment()}>
            Gỡ bình luận
          </Button>
        </div>
      </Modal>
    </div>
  );
}
