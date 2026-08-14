import { useNavigate } from 'react-router-dom'
import { useSession } from '../session/SessionProvider.js'
import { roleLabel } from './RoleBadge.js'
const homes = { player: '/', provider: '/manage', admin: '/admin' } as const
export function RoleSwitcher() { const { session, setActiveRole } = useSession(); const navigate = useNavigate(); if (!session || session.roles.length < 2) return null; return <label className="sr-only">Ngữ cảnh tài khoản<select aria-label="Ngữ cảnh tài khoản" value={session.activeRole} onChange={(event) => { const role = event.target.value as typeof session.activeRole; setActiveRole(role); navigate(homes[role]) }}>{session.roles.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}</select></label> }
