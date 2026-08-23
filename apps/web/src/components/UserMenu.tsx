import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useSession } from '../session/SessionProvider.js'
import { roleLabel } from './RoleBadge.js'
import { Avatar } from './ui'
import type { UserRole } from '../session/session.js'
import { getMyProfile, type ProfileResult } from '../lib/accountApi.js'

const homes = { player: '/', provider: '/manage', admin: '/admin' } as const

const accountLinks: Record<UserRole, ReadonlyArray<readonly [string, string]>> = {
  player: [['/profile', 'Hồ sơ của tôi'], ['/passport', 'Hộ chiếu năng lực'], ['/support', 'Hỗ trợ'], ['/provider-onboarding', 'Hợp tác chủ sân']],
  provider: [['/profile', 'Hồ sơ của tôi'], ['/manage', 'Trang quản lý'], ['/support', 'Hỗ trợ']],
  admin: [['/profile', 'Hồ sơ của tôi'], ['/admin', 'Bảng điều khiển'], ['/support', 'Hỗ trợ']],
}

export function UserMenu() {
  const { session, setActiveRole, logout } = useSession()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [profile, setProfile] = useState<ProfileResult | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (event: MouseEvent) => { if (!containerRef.current?.contains(event.target as Node)) setOpen(false) }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClick); document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey) }
  }, [open])

  useEffect(() => {
    const load = () => { void getMyProfile().then(setProfile).catch(() => setProfile(null)) }
    load()
    window.addEventListener('courtin:profile-change', load)
    return () => window.removeEventListener('courtin:profile-change', load)
  }, [session?.userId])

  if (!session) return null
  const links = accountLinks[session.activeRole]

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Menu tài khoản"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-brand-yellow"
      >
        <Avatar label={profile?.playerProfile?.displayName ?? 'T'} src={profile?.playerProfile?.avatarUrl} alt="Ảnh đại diện tài khoản" />
        <svg aria-hidden="true" viewBox="0 0 20 20" className={`h-4 w-4 text-surface/75 transition-transform ${open ? 'rotate-180' : ''}`} fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" /></svg>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-2 w-60 overflow-hidden rounded-2xl border border-black/5 bg-surface text-brand-navy shadow-xl">
          <div className="border-b border-black/5 px-4 py-3">
            <p className="truncate text-sm font-extrabold">{profile?.playerProfile?.displayName ?? 'Tài khoản của tôi'}</p>
            <p className="text-xs font-bold uppercase tracking-wide text-brand-navy/50">Đang ở vai trò</p>
            <p className="text-sm font-extrabold">{roleLabel(session.activeRole)}</p>
          </div>
          {session.roles.length > 1 && (
            <div className="border-b border-black/5 px-2 py-2">
              <p className="px-2 pb-1 text-[11px] font-bold uppercase tracking-wide text-brand-navy/45">Chuyển ngữ cảnh</p>
              {session.roles.map((role) => (
                <button
                  key={role}
                  type="button"
                  role="menuitem"
                  onClick={() => { setActiveRole(role); setOpen(false); navigate(homes[role]) }}
                  className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-sm font-semibold hover:bg-brand-navy/5 ${role === session.activeRole ? 'text-brand-navy' : 'text-brand-navy/70'}`}
                >
                  {roleLabel(role)}
                  {role === session.activeRole && <span aria-hidden="true" className="text-brand-yellow">●</span>}
                </button>
              ))}
            </div>
          )}
          <div className="px-2 py-2">
            {links.map(([to, label]) => (
              <Link
                key={to}
                to={to}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="block rounded-lg px-2 py-1.5 text-sm font-semibold text-brand-navy/80 hover:bg-brand-navy/5 hover:text-brand-navy"
              >
                {label}
              </Link>
            ))}
          </div>
          <div className="border-t border-black/5 px-2 py-2">
            <button
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); void logout().then(() => navigate('/')) }}
              className="block w-full rounded-lg px-2 py-1.5 text-left text-sm font-bold text-red-600 hover:bg-red-50"
            >
              Đăng xuất
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
