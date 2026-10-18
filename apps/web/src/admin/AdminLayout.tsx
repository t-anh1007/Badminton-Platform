import { NavLink, Outlet } from 'react-router-dom'
import { Icon, type IconName } from '../components/Icon'

const groups: ReadonlyArray<{ title: string; items: ReadonlyArray<readonly [string, string, IconName]> }> = [
  { title: '', items: [['/admin', 'Tài chính', 'wallet'], ['/admin/bookings', 'Đặt sân', 'calendar'], ['/admin/accounts', 'Tài khoản', 'users'], ['/admin/providers', 'Duyệt chủ sân', 'shield']] },
  { title: 'Xử lý', items: [['/admin/disputes', 'Tranh chấp đặt sân', 'scale'], ['/admin/match-results', 'Tranh chấp kèo', 'trophy'], ['/admin/moderation', 'Kiểm duyệt', 'flag'], ['/admin/evaluations', 'Đánh giá', 'star'], ['/admin/tickets', 'Hỗ trợ', 'chat']] },
  { title: 'Thi đấu', items: [['/admin/seasons', 'Mùa giải', 'calendar'], ['/admin/reward-programs', 'Chương trình thưởng', 'gift']] },
]

export function AdminLayout() {
  return (
    <main className="min-h-screen bg-canvas pb-12 pt-8">
      <div className="page-container grid gap-6 lg:grid-cols-[236px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <nav aria-label="Phân hệ quản trị" className="surface-card flex gap-1 overflow-x-auto p-2 lg:flex-col lg:overflow-visible">
            {groups.map((group) => <div key={group.title} className="contents lg:block">
              {group.title && <p className="hidden px-3 pb-1 pt-3 text-xs font-bold uppercase tracking-[0.08em] text-ink-500 lg:block">{group.title}</p>}
              {group.items.map(([to, label, icon]) => (
                <NavLink key={to} end={to === '/admin'} to={to} className={({ isActive }) => `flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${isActive ? 'bg-brand-navy text-surface shadow-sm' : 'text-ink-700 hover:bg-canvas hover:text-brand-navy'}`}>
                  <Icon name={icon} />{label}
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
