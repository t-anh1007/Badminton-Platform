import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SegmentedControl } from '../../components/ui'
import { FinanceAdminPanel } from '../../components/FinanceAdminPanel'
import { FinancePlatformOverview } from '../../components/FinancePlatformOverview'
import { getAdminFinancialTransparency, type AdminTransparencyResult } from '../../lib/financeApi'
import { getAdminAccountIdentities } from '../../lib/accountApi'
import { newPeriod, PeriodFilter, periodQuery, type Period } from '../../components/PeriodFilter'
import { AdminFinanceFlows, type FlowNav } from '../../components/AdminFinanceFlows'

const financeTabs = [
  { value: 'overview', label: 'Tổng quan' },
  { value: 'flows', label: 'Dòng tiền' },
  { value: 'withdrawals', label: 'Rút tiền' },
  { value: 'reconciliation', label: 'Đối soát' },
] as const

type FinanceTab = (typeof financeTabs)[number]['value']

export function AdminFinancePage() {
  const [overview, setOverview] = useState<AdminTransparencyResult | null>(null)
  const [error, setError] = useState('')
  // ?tab=… giữ tab trên URL; ?withdrawal=… (link thông báo) mở thẳng tab Rút tiền.
  const [params, setParams] = useSearchParams()
  const requested = params.has('withdrawal') ? 'withdrawals' : params.get('tab')
  const tab: FinanceTab = financeTabs.some((item) => item.value === requested) ? requested as FinanceTab : 'overview'
  const setTab = (next: FinanceTab) => setParams(next === 'overview' ? {} : { tab: next }, { replace: true })
  const [period, setPeriod] = useState<Period>(() => newPeriod('all'))
  const [ownerNames, setOwnerNames] = useState<Map<string, string>>(() => new Map())
  const [flowNav, setFlowNav] = useState<FlowNav>({ tab: 'revenue', nonce: 0 })
  const openOwner = (ownerId: string) => {
    setFlowNav((current) => ({ tab: 'revenue', ownerId, nonce: current.nonce + 1 }))
    setTab('flows')
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
      <h1 className="text-h2">Tài chính</h1>
      <div className="mt-4"><SegmentedControl options={financeTabs} value={tab} onChange={setTab} /></div>
      {tab === 'overview' && <section className="mt-5 grid gap-5">
        <div className="flex flex-wrap items-end gap-3">
          <PeriodFilter value={period} onChange={(next) => { setPeriod(next); void load(1, next) }} />
          <p className="pb-2.5 text-xs text-ink-500">Kỳ xem áp cho doanh thu và biểu đồ; số dư ví và giao dịch ngân hàng luôn là số hiện tại.</p>
        </div>
        {error ? <p role="alert" className="rounded-xl bg-danger-bg p-3 text-sm text-danger">{error}</p> : null}
        {overview ? <FinancePlatformOverview data={overview} ownerNames={ownerNames} onPickOwner={openOwner} /> : <p className="text-sm text-ink-500">Đang tải tổng quan tài chính…</p>}
      </section>}
      {tab === 'flows' && <div className="mt-5"><AdminFinanceFlows nav={flowNav} owners={(overview?.byOwner ?? []).map((row) => ({ id: row.key, name: ownerNames.get(row.key) ?? 'Chưa rõ chủ sân' }))} /></div>}
      {tab === 'withdrawals' && <div className="mt-5"><FinanceAdminPanel mode="withdrawals" focusId={params.get('withdrawal')} /></div>}
      {tab === 'reconciliation' && <div className="mt-5"><FinanceAdminPanel mode="reconciliation" /></div>}
    </>
  )
}
