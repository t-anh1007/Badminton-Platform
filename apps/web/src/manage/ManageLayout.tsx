import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Icon, type IconName } from '../components/Icon';
import { listProviderResultCases } from '../lib/matchApi';

const links: ReadonlyArray<{ to: string; label: string; icon: IconName; end: boolean }> = [
  { to: '/manage', label: 'Tài chính', icon: 'wallet', end: true },
  { to: '/manage/venues', label: 'Cơ sở', icon: 'building', end: false },
  { to: '/manage/bookings', label: 'Đặt sân', icon: 'calendar', end: false },
  { to: '/manage/match-results', label: 'Hồ sơ kèo', icon: 'trophy', end: false },
];

export function ManageLayout() {
  const { pathname } = useLocation();
  const [pendingCases, setPendingCases] = useState(0);
  // Số hồ sơ kèo đang chờ chủ sân đề xuất; tải lại khi đổi trang để badge khớp sau khi gửi đề xuất.
  useEffect(() => {
    listProviderResultCases(1, 'provider_review').then((queue) => setPendingCases(queue.total), () => setPendingCases(0));
  }, [pathname]);

  return (
    <main className="min-h-screen bg-canvas pb-12 pt-8">
      <div className="page-container grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <nav aria-label="Điều hướng quản trị" className="surface-card flex gap-1 overflow-x-auto p-2 lg:flex-col lg:overflow-visible">
            {links.map(({ to, label, icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                    isActive ? 'bg-brand-navy text-surface shadow-sm' : 'text-ink-700 hover:bg-canvas hover:text-brand-navy'
                  }`
                }
              >
                <Icon name={icon} />
                <span>{label}</span>
                {to === '/manage/match-results' && pendingCases > 0 && <span className="ml-auto rounded-full bg-danger px-2 text-xs font-bold text-white" aria-label={`${pendingCases} hồ sơ chờ đề xuất`}>{pendingCases}</span>}
              </NavLink>
            ))}
          </nav>
        </aside>
        <section className="min-w-0">
          <Outlet />
        </section>
      </div>
    </main>
  );
}
