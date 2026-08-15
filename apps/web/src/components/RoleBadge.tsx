import type { UserRole } from '../session/session.js'
const labels: Record<UserRole, string> = { player: 'Người chơi', provider: 'Chủ sân', admin: 'Quản trị viên' }
export const roleLabel = (role: UserRole) => labels[role]
export function RoleBadge({ role }: { role: UserRole }) { return <span className="rounded-full bg-brand-yellow px-2 py-1 text-[11px] font-extrabold text-brand-navy">{labels[role]}</span> }
