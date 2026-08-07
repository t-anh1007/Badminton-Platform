import { useState } from 'react';
import { AdminTable } from '../components/AdminTable';
import { useEffect } from 'react';
import { approveProvider, getAdminProviders, rejectProvider, type ProviderRow } from '../lib/venueBookingApi';
import { FinanceAdminPanel } from '../components/FinanceAdminPanel';
import { DisputeAdminPanel } from '../components/DisputeAdminPanel';

type Tab = 'providers' | 'withdrawals' | 'reconciliation' | 'disputes';

/**
 * Quản trị — DESIGN.md: giao diện TỔNG HỢP các chức năng Admin nằm trong
 * service nghiệp vụ (ACC-08, VEN-02, FIN-11, FIN-13...), không phải service
 * riêng. Gdesign chỉ dựng khung table + mock; logic thật ở G1..G7.
 */
export function AdminPage() {
  const [tab, setTab] = useState<Tab>('providers');
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [message, setMessage] = useState('');
  const loadProviders = async () => { try { setProviders(await getAdminProviders()); } catch (error) { setMessage((error as Error).message); } };
  useEffect(() => { void loadProviders(); }, []);
  const decide = async (id: string, approved: boolean) => { try { if (approved) await approveProvider(id); else await rejectProvider(id, 'Từ chối bởi quản trị viên.'); await loadProviders(); } catch (error) { setMessage((error as Error).message); } };

  return (
    <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
      <h1 className="text-h2 mb-8">Quản trị</h1>

      <div className="mb-6 flex gap-2">
        <button
          type="button"
          onClick={() => setTab('providers')}
          className={`text-caption rounded-full px-4 py-2 ${
            tab === 'providers' ? 'bg-primary-navy text-on-dark' : 'bg-bg-white text-text-primary/60'
          }`}
        >
          Duyệt nhà cung cấp
        </button>
        <button type="button" onClick={() => setTab('reconciliation')} className={`text-caption rounded-full px-4 py-2 ${tab === 'reconciliation' ? 'bg-primary-navy text-on-dark' : 'bg-bg-white text-text-primary/60'}`}>Đối soát</button>
        <button
          type="button"
          onClick={() => setTab('withdrawals')}
          className={`text-caption rounded-full px-4 py-2 ${
            tab === 'withdrawals' ? 'bg-primary-navy text-on-dark' : 'bg-bg-white text-text-primary/60'
          }`}
        >
          Yêu cầu rút tiền
        </button>
        <button type="button" onClick={() => setTab('disputes')} className={`text-caption rounded-full px-4 py-2 ${tab === 'disputes' ? 'bg-primary-navy text-on-dark' : 'bg-bg-white text-text-primary/60'}`}>Tranh chấp</button>
      </div>
      {message && <p role="status" className="mb-4 text-sm">{message}</p>}

      {tab === 'providers' ? (
        <>
        <AdminTable
          columns={[
            { key: 'id', label: 'ID', numeric: true },
            { key: 'orgName', label: 'Tên nhà cung cấp' },
            { key: 'status', label: 'Trạng thái' },
            { key: 'submittedAt', label: 'Ngày nộp' },
          ]}
          rows={providers.map((provider) => ({ id: provider.id, orgName: provider.orgName, status: provider.status, submittedAt: '—' }))}
        />
        <div className="mt-3 flex flex-wrap gap-2">{providers.map((provider) => <div key={provider.id} className="flex gap-2"><button type="button" onClick={() => void decide(provider.id, true)} className="rounded-full bg-primary-navy px-3 py-2 text-caption text-on-dark">Duyệt {provider.orgName}</button><button type="button" onClick={() => void decide(provider.id, false)} className="rounded-full bg-accent-red px-3 py-2 text-caption text-on-dark">Từ chối {provider.orgName}</button></div>)}</div>
        </>
      ) : tab === 'withdrawals' ? <FinanceAdminPanel mode="withdrawals" />
        : tab === 'reconciliation' ? <FinanceAdminPanel mode="reconciliation" /> : <DisputeAdminPanel />}
    </div>
  );
}
