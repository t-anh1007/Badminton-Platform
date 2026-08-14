import { Navigate, Outlet } from 'react-router-dom'
import { useSession } from '../session/SessionProvider.js'
import type { UserRole } from '../session/session.js'
import { RouteState } from '../components/RouteState.js'

export function RoleGuard({ allow }: { allow: UserRole[] }) {
  const { session } = useSession()
  if (!session) return <Navigate to="/auth" replace />
  if (!allow.includes(session.activeRole)) return <div className="page-container py-16"><RouteState variant="forbidden" action={<a className="inline-flex min-h-11 items-center rounded-full bg-brand-navy px-5 py-3 font-bold text-surface" href="/">Về trang chủ</a>} /></div>
  return <Outlet />
}
