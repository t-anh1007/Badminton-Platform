import { useState } from 'react';
import { AdminTable } from '../components/AdminTable';
import { MOCK_ADMIN_PROVIDERS, MOCK_ADMIN_WITHDRAWALS } from '../data/mock';

type Tab = 'providers' | 'withdrawals';

/**
 * Quản trị — DESIGN.md: giao diện TỔNG HỢP các chức năng Admin nằm trong
 * service nghiệp vụ (ACC-08, VEN-02, FIN-11, FIN-13...), không phải service
 * riêng. Gdesign chỉ dựng khung table + mock; logic thật ở G1..G7.
 */
export function AdminPage() {
  const [tab, setTab] = useState<Tab>('providers');

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
        <button
          type="button"
          onClick={() => setTab('withdrawals')}
          className={`text-caption rounded-full px-4 py-2 ${
            tab === 'withdrawals' ? 'bg-primary-navy text-on-dark' : 'bg-bg-white text-text-primary/60'
          }`}
        >
          Yêu cầu rút tiền
        </button>
      </div>

      {tab === 'providers' ? (
        <AdminTable
          columns={[
            { key: 'id', label: 'ID', numeric: true },
            { key: 'orgName', label: 'Tên nhà cung cấp' },
            { key: 'status', label: 'Trạng thái' },
            { key: 'submittedAt', label: 'Ngày nộp' },
          ]}
          rows={MOCK_ADMIN_PROVIDERS}
        />
      ) : (
        <AdminTable
          columns={[
            { key: 'id', label: 'Mã yêu cầu', numeric: true },
            { key: 'sellerUserId', label: 'Chủ sân', numeric: true },
            { key: 'amount', label: 'Số tiền', numeric: true },
            { key: 'status', label: 'Trạng thái' },
          ]}
          rows={MOCK_ADMIN_WITHDRAWALS}
        />
      )}
    </div>
  );
}
