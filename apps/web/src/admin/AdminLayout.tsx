import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Icon, type IconName } from '../components/Icon'
import { getAdminDisputes, getAdminWithdrawals } from '../lib/financeApi'
import { getAdminProviders } from '../lib/venueBookingApi'
import { getAdminEvaluations, listAdminResultCases } from '../lib/matchApi'
import { getOpenCommunityReports } from '../lib/communityAdminApi'
import { listSupportTickets } from '../lib/communityApi'

const groups: ReadonlyArray<{ title: string; items: ReadonlyArray<readonly [string, string, IconName]> }> = [
  { title: '', items: [['/admin', 'Tài chính', 'wallet'], ['/admin/bookings', 'Đặt sân', 'calendar'], ['/admin/accounts', 'Tài khoản', 'users'], ['/admin/providers', 'Duyệt chủ sân', 'shield']] },
  { title: 'Xử lý', items: [['/admin/disputes', 'Tranh chấp đặt sân', 'scale'], ['/admin/match-results', 'Tranh chấp kèo', 'trophy'], ['/admin/moderation', 'Kiểm duyệt', 'flag'], ['/admin/evaluations', 'Đánh giá', 'star'], ['/admin/tickets', 'Hỗ trợ', 'chat']] },
  { title: 'Thi đấu', items: [['/admin/seasons', 'Mùa giải', 'calendar'], ['/admin/reward-programs', 'Chương trình thưởng', 'gift']] },
]

// Số việc đang chờ admin theo từng mục; một nguồn lỗi chỉ làm mất badge của mục đó.
const countSources: ReadonlyArray<readonly [string, () => Promise<number>]> = [
  ['/admin', () => getAdminWithdrawals().then((rows) => rows.filter((row) => row.status === 'pending' || row.status === 'partially_paid').length)],
  ['/admin/providers', () => getAdminProviders().then((rows) => rows.length)],
  ['/admin/disputes', () => getAdminDisputes().then((rows) => rows.filter((row) => row.status === 'open').length)],
  ['/admin/match-results', () => listAdminResultCases(1, 'admin_review').then((page) => page.total)],
  ['/admin/moderation', () => getOpenCommunityReports().then((result) => result.reports.length)],
  ['/admin/evaluations', () => getAdminEvaluations('pending').then((rows) => rows.length)],
  ['/admin/tickets', () => listSupportTickets().then((result) => result.tickets.filter((ticket) => ticket.status === 'open' || ticket.status === 'in_progress').length)],
]

export function AdminLayout() {
  const { pathname } = useLocation()
  const [counts, setCounts] = useState<Record<string, number>>({})
  useEffect(() => {
    let active = true
    void Promise.allSettled(countSources.map(([, load]) => load())).then((results) => {
      if (!active) return
      setCounts(Object.fromEntries(results.flatMap((result, index) => result.status === 'fulfilled' ? [[countSources[index][0], result.value]] : [])))
    })
    return () => { active = false }
  }, [pathname])
  // Trang Người nhận giải thuộc mục Chương trình thưởng.
  const activeFor = (to: string, isActive: boolean) => isActive || (to === '/admin/reward-programs' && pathname.startsWith('/admin/reward-payouts'))

  return (
    <main className="min-h-screen bg-canvas pb-12 pt-8">
      <div className="page-container grid gap-6 lg:grid-cols-[236px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <nav aria-label="Phân hệ quản trị" className="surface-card flex gap-1 overflow-x-auto p-2 lg:flex-col lg:overflow-visible">
            {groups.map((group) => <div key={group.title} className="contents lg:block">
              {group.title && <p className="hidden px-3 pb-1 pt-3 text-xs font-bold uppercase tracking-[0.08em] text-ink-500 lg:block">{group.title}</p>}
              {group.items.map(([to, label, icon]) => (
                <NavLink key={to} end={to === '/admin'} to={to} className={({ isActive }) => `flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${activeFor(to, isActive) ? 'bg-brand-navy text-surface shadow-sm' : 'text-ink-700 hover:bg-canvas hover:text-brand-navy'}`}>
                  <Icon name={icon} />{label}
                  {counts[to] ? <span className="ml-auto rounded-full bg-danger px-2 text-xs font-bold text-white" aria-label={`${counts[to]} việc đang chờ`}>{counts[to]}</span> : null}
                </NavLink>
              ))}
            </div>)}
          </nav>
        </aside>
        <section className="min-w-0"><Outlet /></section>
      </div>
    </main>
  )
}
