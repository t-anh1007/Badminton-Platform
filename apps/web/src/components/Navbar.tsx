import { Link, NavLink } from 'react-router-dom'
import { useSession } from '../session/SessionProvider.js'
import { Button } from './ui'
import { UserMenu } from './UserMenu.js'

const playerLinks = [['/', 'Trang chủ'], ['/venues', 'Đặt sân'], ['/matches', 'Tìm kèo'], ['/community', 'Cộng đồng']] as const
const providerLinks = [['/manage', 'Tổng quan'], ['/manage/venues', 'Sân'], ['/manage/calendar', 'Lịch'], ['/manage/finance', 'Doanh thu']] as const
const adminLinks = [['/admin', 'Tổng quan'], ['/admin/bookings', 'Booking'], ['/admin/finance', 'Tài chính'], ['/admin/disputes', 'Tranh chấp']] as const
export function Navbar({ onOpenAuth }: { onOpenAuth: () => void }) {
  const { session } = useSession()
  const links = session?.activeRole === 'provider' ? providerLinks : session?.activeRole === 'admin' ? adminLinks : playerLinks
  return <header className="sticky top-0 z-50 bg-brand-navy text-surface"><div className="page-container flex h-16 items-center justify-between gap-3 sm:h-20"><Link to="/" className="flex items-center gap-2"><img src="/logo.png" alt="" aria-hidden="true" className="h-10 w-auto sm:h-12" /><span className="font-display text-xl font-extrabold">COURTIN</span></Link><nav className="hidden gap-2 md:flex">{links.map(([to, label]) => <NavLink key={`${to}-${label}`} to={to} className="rounded-full px-3 py-2 text-xs font-bold uppercase text-surface/75 hover:text-brand-yellow">{label}</NavLink>)}</nav><div className="flex items-center gap-2">{session ? <UserMenu /> : <Button size="sm" onClick={onOpenAuth}>Đăng nhập / Đăng ký</Button>}</div></div></header>
}
