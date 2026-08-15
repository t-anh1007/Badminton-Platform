import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, EmptyState, SurfaceCard } from '../components/ui'
import { getMyProvider, registerProvider, type ProviderSelf } from '../lib/venueBookingApi.js'
import { useSession } from '../session/SessionProvider.js'
import { RouteState } from '../components/RouteState.js'

export function ProviderOnboardingPage() {
  const { refresh, setActiveRole } = useSession()
  const [provider, setProvider] = useState<ProviderSelf | null | undefined>(undefined)
  const [orgName, setOrgName] = useState('')
  const [contact, setContact] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)
  const attemptedApprovalRefresh = useRef(false)
  const load = async () => { setLoading(true); try { setProvider(await getMyProvider()) } catch (error) { setNotice(error instanceof Error ? error.message : 'Không thể tải trạng thái hồ sơ.') } finally { setLoading(false) } }
  useEffect(() => { void load() }, [])
  useEffect(() => {
    if (provider?.status !== 'pending') return
    const interval = window.setInterval(() => void load(), 30_000)
    return () => window.clearInterval(interval)
  }, [provider?.status])
  const refreshRoles = useCallback(async () => {
    const session = await refresh()
    if (session?.roles.includes('provider')) { setActiveRole('provider'); setNotice('Phiên đã được làm mới; bạn có thể vào khu vực quản lý sân.') }
    else setNotice('Vai trò mới chưa sẵn sàng trong phiên này. Hãy đăng nhập lại rồi thử lại.')
  }, [refresh, setActiveRole])
  useEffect(() => { if (provider?.status === 'approved' && !attemptedApprovalRefresh.current) { attemptedApprovalRefresh.current = true; void refreshRoles() } }, [provider?.status, refreshRoles])
  const submit = async () => {
    if (!orgName.trim() || !contact.trim()) { setNotice('Vui lòng nhập tên tổ chức và thông tin liên hệ.'); return }
    setLoading(true)
    try { setProvider(await registerProvider({ orgName: orgName.trim(), contact: { contact: contact.trim() } })); setNotice('Hồ sơ đã được gửi để xét duyệt.') } catch (error) { setNotice(error instanceof Error ? error.message : 'Không thể gửi hồ sơ.') } finally { setLoading(false) }
  }
  if (provider === undefined) return <main className="page-container py-10"><RouteState variant="loading" title="Đang tải hồ sơ hợp tác" /></main>
  const application = <SurfaceCard className="mt-6 max-w-xl"><label className="grid gap-1.5 text-sm font-medium">Tên tổ chức<input aria-label="Tên tổ chức" value={orgName} onChange={(event) => setOrgName(event.target.value)} className="rounded-xl border border-line px-3 py-2" /></label><label className="mt-4 grid gap-1.5 text-sm font-medium">Liên hệ<input aria-label="Liên hệ" value={contact} onChange={(event) => setContact(event.target.value)} className="rounded-xl border border-line px-3 py-2" /></label><Button className="mt-5" disabled={loading} onClick={() => void submit()}>Gửi hồ sơ</Button></SurfaceCard>
  return <main className="page-container py-8 sm:py-10"><h1 className="text-h1">Hợp tác chủ sân</h1><p className="mt-2 text-ink-500">Đăng ký hồ sơ để quản lý cơ sở và sân của bạn.</p>{notice && <p role="status" className="mt-4 rounded-xl bg-green-50 p-3 text-sm text-green-700">{notice}</p>}{!provider ? application : provider.status === 'pending' ? <SurfaceCard className="mt-6"><h2 className="text-h2">Hồ sơ đang chờ duyệt</h2><p className="mt-2 text-ink-500">Chúng tôi sẽ tự cập nhật trạng thái khi trang này đang mở.</p><Button className="mt-4" tone="secondary" onClick={() => void load()}>Tải lại trạng thái</Button></SurfaceCard> : provider.status === 'rejected' ? <SurfaceCard className="mt-6"><h2 className="text-h2">Hồ sơ cần bổ sung</h2><p className="mt-2 text-ink-500">{provider.decisionReason ?? 'Vui lòng kiểm tra lại thông tin hồ sơ.'}</p><Button className="mt-4" onClick={() => setProvider(null)}>Nộp lại hồ sơ</Button></SurfaceCard> : provider.status === 'approved' ? <SurfaceCard className="mt-6"><h2 className="text-h2">Hồ sơ đã được duyệt</h2><p className="mt-2 text-ink-500">Làm mới phiên để nhận vai trò chủ sân và chuyển ngữ cảnh quản lý.</p><Button className="mt-4" onClick={() => void refreshRoles()}>Làm mới phiên để chuyển vai trò</Button><Link className="ml-3 text-sm font-semibold text-green-700" to="/manage">Mở khu vực quản lý</Link></SurfaceCard> : <EmptyState title="Hồ sơ đang tạm ngưng" description="Vui lòng liên hệ hỗ trợ để được hướng dẫn." />}</main>
}
