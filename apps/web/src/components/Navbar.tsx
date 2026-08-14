import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useSession } from '../session/SessionProvider.js'
import { Avatar, Button } from './ui'
import { RoleBadge } from './RoleBadge.js'
import { RoleSwitcher } from './RoleSwitcher.js'

const playerLinks = [['/', 'Trang chủ'], ['/venues', 'Đặt sân'], ['/matches', 'Tìm kèo'], ['/community', 'Cộng đồng']] as const
const providerLinks = [['/manage', 'Tổng quan'], ['/manage/venues', 'Sân'], ['/manage/calendar', 'Lịch'], ['/manage/revenue', 'Doanh thu']] as const
const adminLinks = [['/admin', 'Tổng quan'], ['/admin', 'Công việc']] as const
export function Navbar({ onOpenAuth }: { onOpenAuth: () => void }) {
  const { session, logout } = useSession(); const navigate = useNavigate()
  const links = session?.activeRole === 'provider' ? providerLinks : session?.activeRole === 'admin' ? adminLinks : playerLinks
  return <header className="sticky top-0 z-50 bg-brand-navy text-surface"><div className="page-container flex h-16 items-center justify-between gap-3 sm:h-20"><Link to="/" className="font-display text-xl font-extrabold">COURTIN</Link><nav className="hidden gap-2 md:flex">{links.map(([to, label]) => <NavLink key={`${to}-${label}`} to={to} className="rounded-full px-3 py-2 text-xs font-bold uppercase text-surface/75 hover:text-brand-yellow">{label}</NavLink>)}</nav><div className="flex items-center gap-2">{session ? <><RoleSwitcher />{session.activeRole === 'player' && <Link to="/provider-onboarding" className="hidden text-sm font-bold text-brand-yellow sm:block">Hợp tác chủ sân</Link>}<RoleBadge role={session.activeRole} /><Avatar /><button type="button" className="text-sm font-bold" onClick={() => void logout().then(() => navigate('/'))}>Đăng xuất</button></> : <Button size="sm" onClick={onOpenAuth}>Đăng nhập / Đăng ký</Button>}</div></div></header>
}
