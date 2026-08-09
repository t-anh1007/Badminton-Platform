import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Avatar, Button } from './ui';

function rolesFromSession(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const token = window.localStorage.getItem('accessToken');
    return token ? JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).roles as string[] : [];
  } catch { return []; }
}

function ShuttlecockMark() {
  return <svg aria-hidden viewBox="0 0 32 32" className="h-7 w-7 fill-none text-green-600" stroke="currentColor" strokeWidth="2"><path d="M16 4c-3 4-5 8-5 12 0 3 2 5 5 5s5-2 5-5c0-4-2-8-5-12Z" /><path d="m10 10 6 11 6-11M11 22h10M9 26h14" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

type NavigationItem = { label: string; to?: string };
const navItems: readonly NavigationItem[] = [{ to: '/venues', label: 'Đặt sân' }, { label: 'Kèo' }, { label: 'Cộng đồng' }];

export function Navbar({ onOpenAuth, sessionVersion }: { onOpenAuth: () => void; sessionVersion?: number }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const navigate = useNavigate();
  const roles = rolesFromSession();
  const isSignedIn = roles.length > 0;
  const linkClass = ({ isActive }: { isActive: boolean }) => `rounded-full px-3 py-2 text-sm font-semibold transition ${isActive ? 'bg-green-50 text-green-700' : 'text-ink-500 hover:bg-canvas hover:text-ink-900'}`;
  const logout = () => { window.localStorage.removeItem('accessToken'); window.localStorage.removeItem('refreshToken'); window.localStorage.removeItem('roles'); navigate('/'); setAccountOpen(false); };

  return <header className="sticky top-0 z-50 border-b border-line bg-surface/95 shadow-[0_1px_3px_rgb(20_30_40_/_6%)] backdrop-blur">
    <div className="page-container flex h-16 items-center justify-between gap-3">
      <Link to="/" aria-label="Cầu Lông - trang chủ" className="flex items-center gap-2 text-ink-900"><ShuttlecockMark /><span className="text-base font-bold tracking-tight">Cầu Lông</span></Link>
      <nav className="hidden items-center gap-1 md:flex" aria-label="Điều hướng chính">{navItems.map((item) => item.to ? <NavLink key={item.label} to={item.to} className={linkClass}>{item.label}</NavLink> : <span key={item.label} aria-disabled="true" title={`Trang ${item.label} sẽ có ở milestone kế tiếp`} className="cursor-not-allowed rounded-full px-3 py-2 text-sm font-semibold text-ink-300">{item.label}</span>)}</nav>
      <div className="flex items-center gap-2" data-session-version={sessionVersion}>
        {isSignedIn ? <div className="relative"><button type="button" aria-label="Mở menu tài khoản" aria-expanded={accountOpen} onClick={() => setAccountOpen((open) => !open)} className="rounded-full"><Avatar /></button>{accountOpen && <div className="absolute right-0 mt-3 w-52 rounded-2xl border border-line bg-surface p-2 shadow-lg"><Link className="block rounded-xl px-3 py-2 text-sm text-ink-700 hover:bg-green-50 hover:text-green-700" to="/profile" onClick={() => setAccountOpen(false)}>Hồ sơ</Link>{roles.includes('admin') && <Link className="block rounded-xl px-3 py-2 text-sm text-ink-700 hover:bg-green-50 hover:text-green-700" to="/admin" onClick={() => setAccountOpen(false)}>Quản trị</Link>}<button type="button" onClick={logout} className="w-full rounded-xl px-3 py-2 text-left text-sm text-danger hover:bg-danger-bg">Đăng xuất</button></div>}</div> : <Button size="sm" onClick={onOpenAuth}>Đăng nhập / Đăng ký</Button>}
        <button type="button" aria-label="Mở menu điều hướng" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)} className="grid h-10 w-10 place-items-center rounded-full border border-line text-ink-700 hover:bg-canvas md:hidden"><span className="text-lg" aria-hidden>☰</span></button>
      </div>
    </div>
    {menuOpen && <nav className="border-t border-line bg-surface px-4 py-3 md:hidden" aria-label="Điều hướng di động">{navItems.map((item) => item.to ? <NavLink key={item.label} to={item.to} onClick={() => setMenuOpen(false)} className={({ isActive }) => `block rounded-xl px-3 py-2.5 text-sm font-semibold ${isActive ? 'bg-green-50 text-green-700' : 'text-ink-700 hover:bg-canvas'}`}>{item.label}</NavLink> : <span key={item.label} aria-disabled="true" className="block cursor-not-allowed rounded-xl px-3 py-2.5 text-sm font-semibold text-ink-300">{item.label}</span>)}</nav>}
  </header>;
}
