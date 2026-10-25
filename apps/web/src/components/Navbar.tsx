import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useSession } from '../session/SessionProvider.js'
import { Button } from './ui'
import { Icon } from './Icon'
import { UserMenu } from './UserMenu.js'
import { NotificationBell } from './NotificationBell.js'
import type { AuthPromptOptions } from '../layout/AuthPrompt'

const playerLinks = [['/', 'Trang chủ'], ['/venues', 'Đặt sân'], ['/matches', 'Tìm kèo'], ['/leaderboard', 'Bảng xếp hạng'], ['/community', 'Cộng đồng']] as const
const providerLinks = [['/manage', 'Tài chính'], ['/manage/venues', 'Cơ sở'], ['/manage/bookings', 'Đặt sân']] as const
const adminLinks = [['/admin', 'Tài chính'], ['/admin/bookings', 'Đặt sân'], ['/admin/disputes', 'Tranh chấp']] as const
// Mục gốc ("/", "/manage", "/admin") chỉ sáng khi đúng trang đó.
const rootPaths = new Set(['/', '/manage', '/admin'])

export function Navbar({ onOpenAuth }: { onOpenAuth: (options?: AuthPromptOptions) => void }) {
  const { session } = useSession()
  const [menuOpen, setMenuOpen] = useState(false)
  const links = session?.activeRole === 'provider' ? providerLinks : session?.activeRole === 'admin' ? adminLinks : playerLinks
  const navItems = (mobile: boolean) => links.map(([to, label]) => (
    <NavLink key={`${to}-${label}`} to={to} end={rootPaths.has(to)} onClick={() => setMenuOpen(false)} className={({ isActive }) => mobile
      ? `rounded-xl px-4 py-3 text-base font-bold ${isActive ? 'bg-brand-yellow/15 text-brand-yellow' : 'text-surface/85'}`
      : `relative rounded-full px-3.5 py-2.5 text-[13px] font-bold uppercase tracking-[0.04em] transition hover:text-brand-yellow ${isActive ? 'text-surface after:absolute after:inset-x-3.5 after:bottom-0.5 after:h-[3px] after:rounded-full after:bg-brand-yellow' : 'text-surface/75'}`}>{label}</NavLink>
  ))
  return (
    <header className="sticky top-0 z-50 bg-brand-navy text-surface">
      <div className="page-container flex h-16 items-center justify-between gap-3 sm:h-[76px]">
        <Link to="/" aria-label="COURTIN — về trang chủ" className="flex items-center gap-2.5"><img src="/logo.png" alt="" aria-hidden="true" className="h-10 w-auto sm:h-11" /><span className="font-display text-xl font-extrabold">COURTIN</span></Link>
        <nav aria-label="Điều hướng chính" className="hidden gap-1 md:flex">{navItems(false)}</nav>
        <div className="flex items-center gap-2">
          {session ? <><NotificationBell /><UserMenu /></> : <>
            <button type="button" onClick={() => onOpenAuth({ mode: 'register' })} className="hidden min-h-9 rounded-full border border-surface/35 px-4 text-xs font-bold uppercase tracking-[0.035em] text-surface transition hover:bg-surface/10 sm:inline-flex sm:items-center">Đăng ký</button>
            <Button size="sm" onClick={() => onOpenAuth()}>Đăng nhập</Button>
          </>}
          <button type="button" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen} aria-label={menuOpen ? 'Đóng menu' : 'Mở menu'} className="grid h-11 w-11 place-items-center rounded-full hover:bg-surface/10 md:hidden"><Icon name={menuOpen ? 'close' : 'menu'} className="h-6 w-6" /></button>
        </div>
      </div>
      {menuOpen && <nav aria-label="Điều hướng chính (di động)" className="page-container grid gap-1 pb-4 md:hidden">{navItems(true)}</nav>}
    </header>
  )
}
