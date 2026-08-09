import { useEffect, useState } from 'react';
import { DisputeAdminPanel } from '../components/DisputeAdminPanel';
import { FinanceAdminPanel } from '../components/FinanceAdminPanel';
import { CommunityAdminPanel } from '../components/CommunityAdminPanel';
import { Badge, Button, EmptyState, Modal, Tabs, TextArea } from '../components/ui';
import { approveProvider, getAdminProviders, rejectProvider, type ProviderRow } from '../lib/venueBookingApi';

type Tab = 'providers' | 'withdrawals' | 'reconciliation' | 'disputes' | 'moderation';

function providerBadgeTone(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  return status === 'approved'
    ? 'success'
    : status === 'pending'
      ? 'warning'
      : status === 'rejected'
        ? 'danger'
        : 'neutral';
}

export function AdminPage() {
  const [tab, setTab] = useState<Tab>('providers');
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [message, setMessage] = useState('');
  const [rejecting, setRejecting] = useState<ProviderRow | null>(null);
  const [reason, setReason] = useState('');

  const load = async () => {
    try {
      setProviders(await getAdminProviders());
    } catch (caught) {
      setMessage((caught as Error).message);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const approve = async (id: string) => {
    try {
      await approveProvider(id);
      setMessage('Đã duyệt nhà cung cấp.');
      await load();
    } catch (caught) {
      setMessage((caught as Error).message);
    }
  };

  const reject = async () => {
    if (!rejecting) return;
    if (!reason.trim()) {
      setMessage('Nhập lý do trước khi từ chối.');
      return;
    }
    try {
      await rejectProvider(rejecting.id, reason);
      setMessage('Đã từ chối nhà cung cấp.');
      setRejecting(null);
      setReason('');
      await load();
    } catch (caught) {
      setMessage((caught as Error).message);
    }
  };

  return (
    <main className="page-container py-8 sm:py-12">
      <p className="text-caption text-green-700">Khu vực vận hành</p>
      <h1 className="mt-1 text-h1">Quản trị</h1>
      <p className="mt-2 text-sm text-ink-500">Các hàng chờ tác nghiệp được lấy từ service nghiệp vụ hiện có.</p>
      <div className="mt-6">
        <Tabs
          tabs={[
            { value: 'providers', label: 'Duyệt NCC' },
            { value: 'withdrawals', label: 'Rút tiền' },
            { value: 'reconciliation', label: 'Đối soát' },
            { value: 'disputes', label: 'Tranh chấp' },
            { value: 'moderation', label: 'Kiểm duyệt' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>
      {message && (
        <p role="status" className="mt-4 rounded-xl bg-green-50 p-3 text-sm text-green-700">
          {message}
        </p>
      )}

      {tab === 'providers' ? (
        <section className="mt-6">
          {providers.length ? (
            <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="sticky top-0 bg-canvas text-caption">
                  <tr>
                    <th className="px-4 py-3">ID</th>
                    <th className="px-4 py-3">Nhà cung cấp</th>
                    <th className="px-4 py-3">Trạng thái</th>
                    <th className="px-4 py-3 text-right">Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {providers.map((provider) => (
                    <tr key={provider.id} className="border-t border-line hover:bg-green-50">
                      <td className="px-4 py-3 text-figures text-xs">{provider.id}</td>
                      <td className="px-4 py-3 font-medium">{provider.orgName}</td>
                      <td className="px-4 py-3">
                        <Badge tone={providerBadgeTone(provider.status)}>{provider.status}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" onClick={() => void approve(provider.id)}>
                            Duyệt
                          </Button>
                          <Button tone="danger" size="sm" onClick={() => setRejecting(provider)}>
                            Từ chối
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="Không có mục chờ xử lý" description="Nhà cung cấp gửi yêu cầu sẽ xuất hiện tại đây." />
          )}
        </section>
      ) : tab === 'withdrawals' ? (
        <section className="mt-6">
          <FinanceAdminPanel mode="withdrawals" />
        </section>
      ) : tab === 'reconciliation' ? (
        <section className="mt-6">
          <FinanceAdminPanel mode="reconciliation" />
        </section>
      ) : tab === 'disputes' ? (
        <section className="mt-6">
          <DisputeAdminPanel />
        </section>
      ) : (
        <section className="mt-6">
          <CommunityAdminPanel />
        </section>
      )}

      <Modal open={Boolean(rejecting)} title="Từ chối nhà cung cấp" onClose={() => setRejecting(null)}>
        <p className="text-sm text-ink-500">Nêu lý do để lưu cùng quyết định cho {rejecting?.orgName}.</p>
        <label className="mt-4 grid gap-1.5 text-sm font-medium">
          Lý do
          <TextArea required value={reason} onChange={(event) => setReason(event.target.value)} />
        </label>
        <Button tone="danger" className="mt-5" onClick={() => void reject()}>
          Xác nhận từ chối
        </Button>
      </Modal>
    </main>
  );
}
