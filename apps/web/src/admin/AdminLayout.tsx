import { NavLink, Outlet } from 'react-router-dom'

const modules = [
  ['/admin', 'Tổng quan'], ['/admin/accounts', 'Tài khoản'], ['/admin/providers', 'Chủ sân'], ['/admin/bookings', 'Đặt sân'],
  ['/admin/finance', 'Tài chính'], ['/admin/disputes', 'Tranh chấp'], ['/admin/moderation', 'Kiểm duyệt'],
  ['/admin/evaluations', 'Đánh giá'], ['/admin/tickets', 'Hỗ trợ'],
] as const

export function AdminLayout() {
  return <main className="page-container py-8"><div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]"><aside><p className="courtin-kicker">VẬN HÀNH HỆ THỐNG</p><h1 className="mt-1 text-h2">Quản trị</h1><nav aria-label="Phân hệ quản trị" className="mt-5 flex gap-2 overflow-x-auto pb-2 lg:flex-col">{modules.map(([to, label]) => <NavLink key={to} end={to === '/admin'} to={to} className={({ isActive }) => `shrink-0 rounded-xl px-3 py-2 text-sm font-semibold ${isActive ? 'bg-brand-navy text-surface' : 'border border-line bg-surface text-brand-navy'}`}>{label}</NavLink>)}</nav></aside><section className="min-w-0"><Outlet /></section></div></main>
}
