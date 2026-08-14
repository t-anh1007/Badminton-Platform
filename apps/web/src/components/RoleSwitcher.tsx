import { useNavigate } from 'react-router-dom'
import { useSession } from '../session/SessionProvider.js'
import { roleLabel } from './RoleBadge.js'

const homes = { player: '/', provider: '/manage', admin: '/admin' } as const

export function RoleSwitcher() {
  const { session, setActiveRole } = useSession()
  const navigate = useNavigate()
  if (!session || session.roles.length < 2) return null

  return (
    <label className="flex items-center gap-2 rounded-full border border-surface/25 px-2 py-1 text-xs font-bold text-surface">
      <span className="hidden lg:inline">Ngữ cảnh</span>
      <select
        aria-label="Ngữ cảnh tài khoản"
        className="max-w-28 bg-brand-navy text-surface outline-none sm:max-w-none"
        value={session.activeRole}
        onChange={(event) => {
          const role = event.target.value as typeof session.activeRole
          setActiveRole(role)
          navigate(homes[role])
        }}
      >
        {session.roles.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}
      </select>
    </label>
  )
}
