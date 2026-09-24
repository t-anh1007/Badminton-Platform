import { useEffect, useState } from 'react'
import { FinanceAdminPanel } from '../../components/FinanceAdminPanel'
import { FinancePlatformOverview } from '../../components/FinancePlatformOverview'
import { getAdminFinancialTransparency, type AdminTransparencyResult } from '../../lib/financeApi'

const financeSections = [
  { id: 'finance-bank-reconciliation', label: 'Giao dịch ngân hàng và đối soát' },
  { id: 'finance-withdrawals', label: 'Yêu cầu rút tiền' },
  { id: 'finance-reconciliation', label: 'Đối soát' },
] as const

type FinanceSectionId = (typeof financeSections)[number]['id']

export function AdminFinancePage() {
  const [overview, setOverview] = useState<AdminTransparencyResult | null>(null)
  const [error, setError] = useState('')
  const [activeSection, setActiveSection] = useState<FinanceSectionId>('finance-bank-reconciliation')
  const load = async (page = 1) => {
    try { setOverview(await getAdminFinancialTransparency(page, 20)); setError('') }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể tải tổng quan tài chính.') }
  }
  useEffect(() => { void load() }, [])
  return (
    <>
      <h2 className="text-h1">Đối soát tài chính toàn nền tảng</h2>
      <p className="mt-2 max-w-3xl text-ink-500">Theo dõi tiền khách thanh toán, phần của chủ sân, doanh thu nền tảng, tiền đang chuyển và các khoản chưa có đối ứng.</p>
      <nav className="sticky top-20 z-20 -mx-1 mt-6 overflow-x-auto bg-canvas/95 px-1 pb-1 pt-3 backdrop-blur-sm" aria-label="Điều hướng tài chính">
        <div className="inline-flex min-w-max gap-1 rounded-full border border-line bg-canvas p-1">
          {financeSections.map((section) => {
            const active = activeSection === section.id
            return <a
              key={section.id}
              href={`#${section.id}`}
              aria-current={active ? 'page' : undefined}
              onClick={() => setActiveSection(section.id)}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition ${active ? 'bg-brand-navy text-surface' : 'text-ink-500 hover:bg-surface hover:text-brand-navy'}`}
            >
              {section.label}
            </a>
          })}
        </div>
      </nav>
      <section id="finance-bank-reconciliation" className="scroll-mt-36">
        {error ? <p role="alert" className="mt-4 rounded-xl bg-danger-bg p-3 text-sm text-danger">{error}</p> : null}
        {overview ? <div className="mt-6"><FinancePlatformOverview data={overview} onPageChange={(page) => void load(page)} /></div> : <p className="mt-6 text-sm text-ink-500">Đang tải tổng quan tài chính…</p>}
      </section>
      <section id="finance-withdrawals" className="surface-card mt-6 scroll-mt-36 p-4">
        <h3 className="text-h2">Yêu cầu rút tiền</h3>
        <div className="mt-4"><FinanceAdminPanel mode="withdrawals" /></div>
      </section>
      <section id="finance-reconciliation" className="surface-card mt-6 scroll-mt-36 p-4">
        <h3 className="text-h2">Đối soát</h3>
        <div className="mt-4"><FinanceAdminPanel mode="reconciliation" /></div>
      </section>
    </>
  )
}
