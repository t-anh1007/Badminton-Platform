import { BusinessCode } from './BusinessCode.js';
import { useEffect, useState } from 'react';
import { getAdminAccountIdentities } from '../lib/accountApi';
import { getOpenCommunityReports, moderateCommunityReport, restoreCommunityContent, type CommunityReport } from '../lib/communityAdminApi';
import { Badge, Button, EmptyState, Modal, TextArea } from './ui';
import { formatDateTimeVi } from '../lib/formatters.js';

type Pending = {
  report: CommunityReport;
  action: 'hide' | 'remove' | 'dismiss';
};
const reportStatusLabel: Record<string, string> = { open: 'Đang chờ xử lý', actioned: 'Đã xử lý', dismissed: 'Không vi phạm' };
const actionLabel: Record<Pending['action'], string> = { dismiss: 'Bác báo cáo', hide: 'Ẩn tạm', remove: 'Gỡ nội dung' };

export function CommunityAdminPanel({ focusId }: { focusId?: string | null }) {
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [selectedId, setSelectedId] = useState(focusId ?? '');
  const [authors, setAuthors] = useState<Map<string, string>>(() => new Map());
  const [lastModerated, setLastModerated] = useState<{ targetType: 'post' | 'comment'; targetId: string; reason: string } | null>(null);
  const load = () =>
    getOpenCommunityReports()
      .then(async (result) => {
        setReports(result.reports);
        const ids = [...new Set(result.reports.flatMap((report) => report.target?.authorUserId ?? []))];
        // Tên tác giả chỉ để admin biết đang xử lý ai; lỗi tra cứu không chặn hàng chờ.
        const identities = ids.length ? await getAdminAccountIdentities(ids).catch(() => []) : [];
        setAuthors(new Map(identities.map((identity) => [identity.id, identity.displayName || identity.email])));
      })
      .catch((error: Error) => setMessage(error.message));
  useEffect(() => {
    void load();
  }, []);
  const requestAction = (report: CommunityReport, action: Pending['action']) => {
    setReason('');
    setPending({ report, action });
  };
  const ordered = focusId ? [...reports].sort((a, b) => Number(b.id === focusId) - Number(a.id === focusId)) : reports;
  const selected = ordered.find((report) => report.id === selectedId) ?? ordered[0];
  const confirm = async () => {
    if (!pending) return;
    if (!reason.trim()) {
      setMessage('Nhập lý do kiểm duyệt trước khi xác nhận.');
      return;
    }
    try {
      await moderateCommunityReport(pending.report.id, pending.action, reason);
      if (pending.action !== 'dismiss') {
        setLastModerated({ targetType: pending.report.targetType, targetId: pending.report.targetId, reason });
      }
      setPending(null);
      setReason('');
      setMessage('Đã xử lý báo cáo và ghi audit kiểm duyệt.');
      await load();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Không thể xử lý báo cáo.');
    }
  };
  const restoreLast = async () => {
    if (!lastModerated) return;
    try {
      await restoreCommunityContent(lastModerated.targetType, lastModerated.targetId, lastModerated.reason);
      setLastModerated(null);
      setMessage('Đã khôi phục nội dung và ghi audit kiểm duyệt.');
      await load();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Không thể khôi phục nội dung.');
    }
  };
  return (
    <section>
      {lastModerated && (
        <Button className="mb-3" tone="secondary" size="sm" onClick={() => void restoreLast()}>
          Khôi phục nội dung vừa xử lý
        </Button>
      )}
      {reports.length === 0 ? (
        <EmptyState title="Không có báo cáo đang mở" description="Báo cáo mới sẽ xuất hiện tại hàng chờ này." />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
          <nav aria-label="Hàng chờ báo cáo" className="surface-card h-fit space-y-1 p-2">
            {ordered.map((report) => (
              <button key={report.id} type="button" onClick={() => setSelectedId(report.id)} aria-current={report.id === selected?.id || undefined}
                className={`w-full rounded-xl p-3 text-left transition ${report.id === selected?.id ? 'bg-green-50 ring-1 ring-brand-navy/30' : 'hover:bg-canvas'}`}>
                <span className="block text-sm font-bold text-ink-900">{report.targetType === 'post' ? 'Bài viết' : 'Bình luận'} · {report.reason}</span>
                {report.target && <span className="mt-0.5 block truncate text-xs text-ink-500">“{report.target.excerpt}”</span>}
                <span className="mt-0.5 block text-xs text-ink-500">{formatDateTimeVi(report.createdAt)}</span>
              </button>
            ))}
          </nav>
          {selected && <article className="surface-card grid content-start gap-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-h3 !text-2xl">{selected.targetType === 'post' ? 'Bài viết bị báo cáo' : 'Bình luận bị báo cáo'}</h2>
              <Badge tone="warning">{reportStatusLabel[selected.status] ?? selected.status}</Badge>
            </div>
            {selected.target ? <blockquote className="whitespace-pre-line rounded-2xl bg-canvas p-4 text-sm text-ink-800">
              {selected.target.excerpt}
              <footer className="mt-2 text-xs text-ink-500">{authors.get(selected.target.authorUserId) ?? 'Chưa rõ tác giả'} · {formatDateTimeVi(selected.target.createdAt)}{selected.target.status !== 'published' ? ' · không còn công khai' : ''}</footer>
            </blockquote> : <p className="rounded-2xl bg-canvas p-4 text-sm text-ink-500">Không tìm thấy nội dung (có thể đã bị xóa).</p>}
            <dl className="text-sm">
              <div className="flex justify-between gap-6 border-t border-line py-2.5"><dt className="text-ink-500">Lý do báo cáo</dt><dd className="text-right font-semibold text-ink-900">{selected.reason}</dd></div>
              <div className="flex justify-between gap-6 border-t border-line py-2.5"><dt className="text-ink-500">Mã</dt><dd className="text-right"><BusinessCode code={selected.businessCode} label="Mã báo cáo" /><BusinessCode code={selected.targetCode} label={selected.targetType === 'post' ? 'Mã bài viết' : 'Mã bình luận'} /></dd></div>
            </dl>
            <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
              <Button size="sm" tone="secondary" onClick={() => requestAction(selected, 'dismiss')}>Bác báo cáo</Button>
              <Button size="sm" tone="secondary" onClick={() => requestAction(selected, 'hide')}>Ẩn tạm</Button>
              <Button size="sm" tone="danger" onClick={() => requestAction(selected, 'remove')}>Gỡ nội dung</Button>
            </div>
          </article>}
        </div>
      )}
      {message && (
        <p role="status" className="mt-4 text-sm text-ink-500">
          {message}
        </p>
      )}
      <Modal open={Boolean(pending)} title="Xác nhận quyết định kiểm duyệt" onClose={() => setPending(null)}>
        <p className="text-sm text-ink-500">
          <strong className="text-ink-900">{pending ? actionLabel[pending.action] : ''}</strong> ·{' '}
          {pending?.report.targetType === 'post' ? 'bài viết được báo cáo' : 'bình luận được báo cáo'}
        </p>
        <label className="mt-4 grid gap-1.5 text-sm font-medium">Lý do quyết định
          <TextArea aria-label="Lý do quyết định kiểm duyệt" rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Bắt buộc, lưu vào lịch sử kiểm duyệt" />
        </label>
        {message && pending && <p role="alert" className="mt-2 text-sm text-danger">{message}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button tone="secondary" onClick={() => setPending(null)}>Hủy</Button>
          <Button tone={pending?.action === 'dismiss' ? 'primary' : 'danger'} onClick={() => void confirm()}>{pending ? actionLabel[pending.action] : 'Xác nhận'}</Button>
        </div>
      </Modal>
    </section>
  );
}
