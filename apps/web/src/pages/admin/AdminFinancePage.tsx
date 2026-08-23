import { FinanceAdminPanel } from '../../components/FinanceAdminPanel'

export function AdminFinancePage() {
  return (
    <>
      <h2 className="text-h1">Tài chính vận hành</h2>
      <p className="mt-2 max-w-3xl text-ink-500">Theo dõi toàn bộ yêu cầu rút, kiểm tra thông tin nhận tiền và xử lý giao dịch chưa có đối ứng.</p>
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
