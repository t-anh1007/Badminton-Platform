import { BusinessCode } from '../components/BusinessCode.js';
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, EmptyState, SurfaceCard } from '../components/ui'
import { getMyProvider, registerProvider, type ProviderSelf } from '../lib/venueBookingApi.js'
import { useSession } from '../session/SessionProvider.js'
import { RouteState } from '../components/RouteState.js'
import { Icon, type IconName } from '../components/Icon'
import { useAuthPrompt } from '../layout/AuthPrompt'

const benefits: [IconName, string, string][] = [
  ['calendar', 'Đặt sân trực tuyến', 'Người chơi xem giờ trống, giữ chỗ 10 phút và thanh toán VietQR.'],
  ['sliders', 'Lịch & giá linh hoạt', 'Đặt giá theo khung giờ, khóa lịch khi bảo trì.'],
  ['trend', 'Đối soát minh bạch', 'Doanh thu, khấu trừ và rút tiền trong một sổ cái.'],
  ['users', 'Khách từ ghép kèo', 'Kèo cộng đồng đưa thêm người chơi tới sân.'],
]
const steps = ['Tạo tài khoản', 'Gửi hồ sơ hợp tác', 'Chờ quản trị viên duyệt', 'Thêm cơ sở, sân và giá']

/** Khách chưa đăng nhập: giới thiệu + mời đăng nhập (trước đây kẹt mãi ở "Đang tải"). */
function ProviderPitch() {
  const promptAuth = useAuthPrompt()
  const signIn = () => promptAuth({ title: 'Đăng nhập để đăng ký hợp tác' })
  return (
    <main>
      <section className="bg-brand-navy text-surface">
        <div className="page-container py-16 lg:py-20">
          <p className="text-caption !text-brand-yellow">Hợp tác chủ sân</p>
          <h1 className="mt-3 max-w-2xl font-display text-[clamp(2.25rem,4.5vw,3.5rem)] font-extrabold leading-[1.02] tracking-[-0.04em]">Đưa sân của bạn lên CourtIn.</h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-surface/80">Nhận đặt sân trực tuyến, quản lý lịch và giá, đối soát doanh thu — ở một nơi.</p>
          <div className="mt-8 flex flex-wrap gap-3"><Button size="lg" onClick={signIn}>Đăng nhập để đăng ký</Button><Link to="/contact" className="inline-flex min-h-11 items-center rounded-full border border-surface/35 px-6 text-sm font-bold uppercase tracking-[0.035em] hover:bg-surface/10">Liên hệ tư vấn</Link></div>
        </div>
      </section>
      <section className="page-container py-14">
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {benefits.map(([icon, title, body]) => <div key={title} className="surface-card p-6"><span className="grid h-11 w-11 place-items-center rounded-full bg-green-50 text-brand-navy"><Icon name={icon} /></span><p className="mt-4 font-bold text-ink-900">{title}</p><p className="mt-1 text-sm leading-6 text-ink-500">{body}</p></div>)}
        </div>
        <h2 className="mt-14 text-h2">Bốn bước để bắt đầu</h2>
        <ol className="mt-6 grid gap-6 md:grid-cols-4">
          {steps.map((step, index) => <li key={step} className="flex items-center gap-3"><span className="text-figures grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-yellow font-semibold text-brand-navy">{index + 1}</span><span className="font-bold text-ink-900">{step}</span></li>)}
        </ol>
        <div className="surface-card mt-10 flex flex-wrap items-center justify-between gap-4 p-6"><p><b>Sẵn sàng hợp tác?</b> <span className="text-ink-500">Đăng nhập để mở biểu mẫu hồ sơ.</span></p><Button onClick={signIn}>Đăng nhập để đăng ký</Button></div>
      </section>
    </main>
  )
}

export function ProviderOnboardingPage() {
  const { session } = useSession()
  return session ? <ProviderApplication /> : <ProviderPitch />
}

function ProviderApplication() {
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
  if (provider === undefined && notice && !loading) return <main className="page-container py-10"><RouteState variant="error" title="Chưa tải được hồ sơ hợp tác" description="Máy chủ đang bận hoặc kết nối bị gián đoạn. Hãy thử lại." onRetry={() => { setNotice(''); void load() }} /></main>
  if (provider === undefined) return <main className="page-container py-10"><RouteState variant="loading" title="Đang tải hồ sơ hợp tác" /></main>
  const application = <SurfaceCard className="mt-6 max-w-xl"><label className="grid gap-1.5 text-sm font-medium">Tên tổ chức<input aria-label="Tên tổ chức" value={orgName} onChange={(event) => setOrgName(event.target.value)} className="rounded-xl border border-line px-3 py-2" /></label><label className="mt-4 grid gap-1.5 text-sm font-medium">Liên hệ<input aria-label="Liên hệ" value={contact} onChange={(event) => setContact(event.target.value)} className="rounded-xl border border-line px-3 py-2" /></label><Button className="mt-5" disabled={loading} onClick={() => void submit()}>Gửi hồ sơ</Button></SurfaceCard>
  return <main className="page-container py-8 sm:py-10"><h1 className="text-h1">Hợp tác chủ sân</h1>{provider && <BusinessCode code={provider.businessCode} label="Mã chủ sân" />}<p className="mt-2 text-ink-500">Đăng ký hồ sơ để quản lý cơ sở và sân của bạn.</p>{notice && <p role="status" className="mt-4 rounded-xl bg-green-50 p-3 text-sm text-green-700">{notice}</p>}{!provider ? application : provider.status === 'pending' ? <SurfaceCard className="mt-6"><h2 className="text-h2">Hồ sơ đang chờ duyệt</h2><p className="mt-2 text-ink-500">Chúng tôi sẽ tự cập nhật trạng thái khi trang này đang mở.</p><Button className="mt-4" tone="secondary" onClick={() => void load()}>Tải lại trạng thái</Button></SurfaceCard> : provider.status === 'rejected' ? <SurfaceCard className="mt-6"><h2 className="text-h2">Hồ sơ cần bổ sung</h2><p className="mt-2 text-ink-500">{provider.decisionReason ?? 'Vui lòng kiểm tra lại thông tin hồ sơ.'}</p><Button className="mt-4" onClick={() => setProvider(null)}>Nộp lại hồ sơ</Button></SurfaceCard> : provider.status === 'approved' ? <SurfaceCard className="mt-6"><h2 className="text-h2">Hồ sơ đã được duyệt</h2><p className="mt-2 text-ink-500">Làm mới phiên để nhận vai trò chủ sân và chuyển ngữ cảnh quản lý.</p><Button className="mt-4" onClick={() => void refreshRoles()}>Làm mới phiên để chuyển vai trò</Button><Link className="ml-3 text-sm font-semibold text-green-700" to="/manage">Mở khu vực quản lý</Link></SurfaceCard> : <EmptyState title="Hồ sơ đang tạm ngưng" description="Vui lòng liên hệ hỗ trợ để được hướng dẫn." />}</main>
}
