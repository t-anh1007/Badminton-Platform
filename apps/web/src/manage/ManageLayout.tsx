import { NavLink, Outlet } from 'react-router-dom';

const links = [
  { to: '/manage', label: 'Tổng quan', icon: '📊', end: true },
  { to: '/manage/venues', label: 'Sân', icon: '🏸', end: false },
  { to: '/manage/calendar', label: 'Lịch', icon: '📅', end: false },
  { to: '/manage/incidents', label: 'Sự cố', icon: '⚠️', end: false },
  { to: '/manage/finance', label: 'Tài chính', icon: '💰', end: false },
] as const;

export function ManageLayout() {
  return (
    <main className="min-h-screen bg-canvas pb-12 pt-8 sm:pt-10">
      <div className="page-container">
        <header className="mb-6">
          <p className="courtin-kicker">Bảng quản trị</p>
          <h1 className="mt-1 text-h1">Quản lý sân</h1>
          <p className="mt-1 text-sm text-ink-500">
            Điều hành cơ sở, lịch đặt, sự cố và dòng tiền của bạn tại một nơi.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <nav
              aria-label="Điều hướng quản trị"
              className="surface-card flex gap-1 overflow-x-auto p-2 lg:flex-col lg:overflow-visible lg:p-3"
            >
              {links.map(({ to, label, icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition ${
                      isActive
                        ? 'bg-brand-navy text-surface shadow-sm'
                        : 'text-ink-700 hover:bg-ink-50 hover:text-brand-navy'
                    }`
                  }
                >
                  <span aria-hidden="true">{icon}</span>
                  <span>{label}</span>
                </NavLink>
              ))}
            </nav>
          </aside>

          <section className="min-w-0">
            <Outlet />
          </section>
        </div>
      </div>
    </main>
  );
}
