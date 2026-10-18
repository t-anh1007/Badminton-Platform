import { BusinessCode } from './BusinessCode.js';
import { useEffect, useState } from 'react';
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
  const [lastModerated, setLastModerated] = useState<{ targetType: 'post' | 'comment'; targetId: string; reason: string } | null>(null);
  const load = () =>
    getOpenCommunityReports()
      .then((result) => setReports(result.reports))
      .catch((error: Error) => setMessage(error.message));
  useEffect(() => {
    void load();
  }, []);
  const requestAction = (report: CommunityReport, action: Pending['action']) => {
    setReason('');
    setPending({ report, action });
  };
  const ordered = focusId ? [...reports].sort((a, b) => Number(b.id === focusId) - Number(a.id === focusId)) : reports;
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
        <Button className="mt-3" tone="secondary" size="sm" onClick={() => void restoreLast()}>
          Khôi phục nội dung vừa xử lý
        </Button>
      )}
      {reports.length === 0 ? (
        <div className="mt-5">
          <EmptyState title="Không có báo cáo đang mở" description="Báo cáo mới sẽ xuất hiện tại hàng chờ này." />
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {ordered.map((report) => (
            <article key={report.id} className={`rounded-2xl border bg-surface p-4 ${report.id === focusId ? 'border-brand-navy ring-4 ring-green-100' : 'border-line'}`}>
              <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                <div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone="warning">{reportStatusLabel[report.status] ?? report.status}</Badge>
                    <Badge>{report.targetType === 'post' ? 'Bài viết' : 'Bình luận'}</Badge>
                  </div>
                  <p className="mt-2 font-medium">{report.reason}</p><BusinessCode code={report.businessCode} label="Mã báo cáo" /><BusinessCode code={report.targetCode} label={report.targetType === 'post' ? 'Mã bài viết' : 'Mã bình luận'} />
                  <p className="text-caption">{formatDateTimeVi(report.createdAt)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" tone="secondary" onClick={() => requestAction(report, 'dismiss')}>
                    Bác báo cáo
                  </Button>
                  <Button size="sm" tone="secondary" onClick={() => requestAction(report, 'hide')}>
                    Ẩn tạm
                  </Button>
                  <Button size="sm" tone="danger" onClick={() => requestAction(report, 'remove')}>
                    Gỡ nội dung
                  </Button>
                </div>
              </div>
            </article>
          ))}
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
