import { useEffect, useState } from 'react'
import { FinanceAdminPanel } from '../../components/FinanceAdminPanel'
import { FinancePlatformOverview } from '../../components/FinancePlatformOverview'
import { getAdminFinancialTransparency, type AdminTransparencyResult } from '../../lib/financeApi'
import { getAdminAccountIdentities } from '../../lib/accountApi'
import { newPeriod, PeriodFilter, periodQuery, type Period } from '../../components/PeriodFilter'
import { AdminFinanceFlows, type FlowNav } from '../../components/AdminFinanceFlows'

const financeSections = [
  { id: 'finance-bank-reconciliation', label: 'Tổng quan dòng tiền' },
  { id: 'finance-flows', label: 'Chi tiết dòng tiền' },
  { id: 'finance-withdrawals', label: 'Yêu cầu rút tiền' },
  { id: 'finance-reconciliation', label: 'Đối soát' },
] as const

type FinanceSectionId = (typeof financeSections)[number]['id']

export function AdminFinancePage() {
  const [overview, setOverview] = useState<AdminTransparencyResult | null>(null)
  const [error, setError] = useState('')
  const [activeSection, setActiveSection] = useState<FinanceSectionId>('finance-bank-reconciliation')
  const [period, setPeriod] = useState<Period>(() => newPeriod('all'))
  const [ownerNames, setOwnerNames] = useState<Map<string, string>>(() => new Map())
  const [flowNav, setFlowNav] = useState<FlowNav>({ tab: 'revenue', nonce: 0 })
  const openOwner = (ownerId: string) => {
    setFlowNav((current) => ({ tab: 'revenue', ownerId, nonce: current.nonce + 1 }))
    setActiveSection('finance-flows')
    document.getElementById('finance-flows')?.scrollIntoView({ behavior: 'smooth' })
  }
  const load = async (page = 1, nextPeriod = period) => {
    try {
      const next = await getAdminFinancialTransparency(page, 5, periodQuery(nextPeriod))
      setOverview(next); setError('')
      const identities = await getAdminAccountIdentities((next.byOwner ?? []).map((row) => row.key)).catch(() => [])
      setOwnerNames(new Map(identities.map((identity) => [identity.id, identity.displayName || identity.email || identity.businessCode || identity.id])))
    }
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
        <div className="mt-6 rounded-2xl border border-line bg-canvas p-3">
          <PeriodFilter value={period} onChange={(next) => { setPeriod(next); void load(1, next) }} />
          <p className="mt-2 text-xs text-ink-500">Kỳ xem áp cho doanh thu đặt sân và biểu đồ; số dư ví và giao dịch ngân hàng luôn là số hiện tại.</p>
        </div>
        {error ? <p role="alert" className="mt-4 rounded-xl bg-danger-bg p-3 text-sm text-danger">{error}</p> : null}
        {overview ? <div className="mt-6"><FinancePlatformOverview data={overview} ownerNames={ownerNames} onPickOwner={openOwner} /></div> : <p className="mt-6 text-sm text-ink-500">Đang tải tổng quan tài chính…</p>}
      </section>
      <section id="finance-flows" className="surface-card mt-6 scroll-mt-36 p-4">
        <h3 className="text-h2">Chi tiết dòng tiền</h3>
        <p className="mt-1 text-sm text-ink-500">Mỗi con số ở trên mở ra danh sách giao dịch cấu thành nó: tiền của ai, cho ai, vì nội dung gì, khớp giao dịch ngân hàng nào. Có bộ lọc kỳ xem và tìm kiếm riêng.</p>
        <div className="mt-4"><AdminFinanceFlows nav={flowNav} owners={(overview?.byOwner ?? []).map((row) => ({ id: row.key, name: ownerNames.get(row.key) ?? `Chủ sân #${row.key.slice(0, 8)}` }))} /></div>
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
