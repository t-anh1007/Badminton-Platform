import { useEffect, useState } from 'react';
import { getOpenCommunityReports, moderateCommunityReport, type CommunityReport } from '../lib/communityAdminApi';
import { Badge, Button, EmptyState, Modal, TextArea } from './ui';

type Pending = {
  report: CommunityReport;
  action: 'hide' | 'remove' | 'dismiss';
};
export function CommunityAdminPanel() {
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const load = () =>
    getOpenCommunityReports()
      .then((result) => setReports(result.reports))
      .catch((error: Error) => setMessage(error.message));
  useEffect(() => {
    void load();
  }, []);
  const requestAction = (report: CommunityReport, action: Pending['action']) => {
    if (!reason.trim()) {
      setMessage('Nhập lý do kiểm duyệt trước khi xác nhận.');
      return;
    }
    setPending({ report, action });
  };
  const confirm = async () => {
    if (!pending) return;
    try {
      await moderateCommunityReport(pending.report.id, pending.action, reason);
      setPending(null);
      setReason('');
      setMessage('Đã xử lý báo cáo và ghi audit kiểm duyệt.');
      await load();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Không thể xử lý báo cáo.');
    }
  };
  return (
    <section>
      <div className="mb-4">
        <h2 className="text-h2">Báo cáo nội dung</h2>
        <p className="mt-1 text-sm text-ink-500">Ẩn, gỡ hoặc bác báo cáo đều cần lý do và xác nhận.</p>
      </div>
      <label className="grid max-w-2xl gap-1.5 text-sm font-medium">
        Lý do quyết định
        <TextArea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Lý do bắt buộc" />
      </label>
      {reports.length === 0 ? (
        <div className="mt-5">
          <EmptyState title="Không có báo cáo đang mở" description="Báo cáo mới sẽ xuất hiện tại hàng chờ này." />
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {reports.map((report) => (
            <article key={report.id} className="rounded-xl border border-line bg-surface p-4">
              <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                <div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone="warning">{report.status}</Badge>
                    <Badge>{report.targetType}</Badge>
                  </div>
                  <p className="mt-2 font-medium">{report.reason}</p>
                  <p className="text-caption">
                    Target {report.targetId} · {new Date(report.createdAt).toLocaleString('vi-VN')}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" tone="secondary" onClick={() => requestAction(report, 'dismiss')}>
                    Bác báo cáo
                  </Button>
                  <Button size="sm" onClick={() => requestAction(report, 'hide')}>
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
          Hành động <strong className="text-ink-900">{pending?.action}</strong> sẽ áp dụng cho{' '}
          {pending?.report.targetType} {pending?.report.targetId}. Lý do:{' '}
          <strong className="text-ink-900">{reason}</strong>
        </p>
        <Button tone="danger" className="mt-5" onClick={() => void confirm()}>
          Xác nhận
        </Button>
      </Modal>
    </section>
  );
}
