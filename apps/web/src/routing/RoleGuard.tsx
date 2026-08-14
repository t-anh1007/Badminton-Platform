import { Navigate, Outlet } from 'react-router-dom'
import { useSession } from '../session/SessionProvider.js'
import type { UserRole } from '../session/session.js'

export function RoleGuard({ allow }: { allow: UserRole[] }) {
  const { session } = useSession()
  if (!session) return <Navigate to="/auth" replace />
  if (!allow.includes(session.activeRole)) return <section className="page-container py-16"><p className="courtin-kicker">QUYỀN TRUY CẬP</p><h1 className="text-h1">Bạn chưa có quyền vào khu vực này</h1><p className="mt-3 text-ink-500">Hãy chọn đúng ngữ cảnh tài khoản hoặc quay về trang chủ.</p><a className="mt-6 inline-flex rounded-full bg-brand-navy px-5 py-3 font-bold text-surface" href="/">Về trang chủ</a></section>
  return <Outlet />
}
