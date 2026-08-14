import { FinanceAdminPanel } from '../../components/FinanceAdminPanel'

export function AdminFinancePage() {
  return (
    <>
      <h2 className="text-h1">Tài chính vận hành</h2>
      <p className="mt-2 text-ink-500">Duyệt yêu cầu rút và xử lý giao dịch chưa có đối ứng.</p>
      <section className="surface-card mt-6 p-4">
        <h3 className="text-h2">Yêu cầu rút tiền</h3>
        <div className="mt-4"><FinanceAdminPanel mode="withdrawals" /></div>
      </section>
      <section className="surface-card mt-6 p-4">
        <h3 className="text-h2">Đối soát</h3>
        <div className="mt-4"><FinanceAdminPanel mode="reconciliation" /></div>
      </section>
    </>
  )
}
