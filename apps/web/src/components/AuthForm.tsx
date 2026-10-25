import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AccountApiError, demoLogin, login, loginWithGoogle, register, resendVerificationEmail, verifyEmail } from '../lib/accountApi'
import { useSession } from '../session/SessionProvider'
import { Button, TextInput } from './ui'
import { GoogleSignInButton } from './GoogleSignInButton'
import { OtpCodeInput } from './OtpCodeInput'
import { Icon, type IconName } from './Icon'

const benefits: [IconName, string, string][] = [
  ['calendar', 'Giữ sân 10 phút', 'Chốt giờ, trả bằng VietQR hoặc số dư ví.'],
  ['users', 'Ghép kèo đúng trình', '5 bậc từ Mới chơi tới Bán chuyên.'],
  ['trophy', 'Leo bảng xếp hạng', 'Ghi kết quả, nhận thưởng theo mùa.'],
]

type Mode = 'login' | 'register' | 'verify'

interface AuthFormProps {
  onAuthenticated?: () => void
  onNavigateAway?: () => void
  initialMode?: Mode
  initialEmail?: string
  /** modal: chỉ form; page: kèm panel thương hiệu. */
  variant?: 'page' | 'modal'
  /** Tiêu đề theo ngữ cảnh khi khách bấm hành động cần tài khoản. */
  contextTitle?: string
}

export function AuthForm({ onAuthenticated, onNavigateAway, initialMode = 'login', initialEmail = '', variant = 'page', contextTitle }: AuthFormProps) {
  const { establish } = useSession()
  const [mode, setMode] = useState<Mode>(initialMode)
  const [email, setEmail] = useState(initialEmail)
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [code, setCode] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    setMode(initialMode)
    setEmail(initialEmail)
    setError('')
    setMessage('')
  }, [initialEmail, initialMode])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)
    try {
      if (mode === 'register') {
        const result = await register({ email, password, displayName })
        setMessage(result.message)
        setMode('verify')
      } else if (mode === 'verify') {
        const result = await verifyEmail({ email, code })
        setMessage(result.message)
        setMode('login')
      } else {
        establish(await login({ email, password }))
        onAuthenticated?.()
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể xác thực tài khoản.')
      // AC-ACC-03-2: chưa xác minh → chuyển sang ACC-02, giữ email để nhập mã hoặc gửi lại mã.
      if (mode === 'login' && caught instanceof AccountApiError && caught.code === 'EMAIL_NOT_VERIFIED') setMode('verify')
    } finally {
      setLoading(false)
    }
  }

  const resend = async () => {
    setError('')
    setMessage('')
    setResending(true)
    try {
      const result = await resendVerificationEmail(email)
      setMessage(result.message)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể gửi lại mã xác minh.')
    } finally {
      setResending(false)
    }
  }

  const handleGoogle = async (idToken: string) => {
    setError('')
    setMessage('')
    setLoading(true)
    try {
      establish(await loginWithGoogle(idToken))
      onAuthenticated?.()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể đăng nhập bằng Google.')
    } finally {
      setLoading(false)
    }
  }

  const handleDemo = async () => {
    setError('')
    setMessage('')
    setLoading(true)
    try {
      establish(await demoLogin())
      onAuthenticated?.()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể vào chế độ demo.')
    } finally {
      setLoading(false)
    }
  }

  const showMode = (next: 'login' | 'register') => {
    setMode(next)
    setError('')
    setMessage('')
  }

  const title = mode === 'login' ? (contextTitle ?? 'Chào mừng trở lại') : mode === 'register' ? 'Tạo tài khoản' : 'Xác minh email'
  const lead = mode === 'verify' ? 'Nhập mã 6 chữ số đã gửi tới email của bạn.' : mode === 'register' ? 'Miễn phí, chỉ cần email.' : 'Đăng nhập bằng email tài khoản CourtIn.'

  const form = (
    <div>
      <div className="flex rounded-full bg-canvas p-1" role="tablist">
        <button type="button" role="tab" aria-selected={mode === 'login'} onClick={() => showMode('login')} className={`flex-1 rounded-full px-3 py-2 text-sm font-bold transition ${mode === 'login' ? 'bg-surface text-brand-navy shadow-[var(--shadow-card)]' : 'text-ink-500'}`}>Đăng nhập</button>
        <button type="button" role="tab" aria-selected={mode === 'register'} onClick={() => showMode('register')} className={`flex-1 rounded-full px-3 py-2 text-sm font-bold transition ${mode === 'register' ? 'bg-surface text-brand-navy shadow-[var(--shadow-card)]' : 'text-ink-500'}`}>Đăng ký</button>
      </div>
      <h2 className="mt-6 text-h2">{title}</h2>
      <p className="mt-1 text-sm text-ink-500">{lead}</p>
      {error && <p role="alert" className="mt-4 rounded-xl bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}
      {message && <p role="status" className="mt-4 rounded-xl bg-success-bg px-3 py-2 text-sm text-success">{message}</p>}
      <form onSubmit={submit} className="mt-5 grid gap-3">
        {mode === 'register' && <label className="grid gap-1.5 text-sm font-semibold text-ink-700">Tên hiển thị<TextInput required value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Nguyễn Văn A" /></label>}
        <label className="grid gap-1.5 text-sm font-semibold text-ink-700">Email<TextInput type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="ban@vidu.com" /></label>
        {mode !== 'verify' ? (
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="auth-password" className="text-sm font-semibold text-ink-700">Mật khẩu</label>
              {mode === 'login' && <Link to="/reset-password" onClick={onNavigateAway} className="text-sm font-bold text-brand-navy hover:underline">Quên mật khẩu?</Link>}
            </div>
            <div className="relative">
              <TextInput id="auth-password" type={showPassword ? 'text' : 'password'} required minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Tối thiểu 8 ký tự" className="pr-12" />
              <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} className="absolute right-1 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full text-ink-500 hover:text-brand-navy"><Icon name={showPassword ? 'eyeOff' : 'eye'} /></button>
            </div>
          </div>
        ) : (
          <>
            <OtpCodeInput value={code} onChange={setCode} disabled={loading} />
            <Button tone="ghost" className="w-fit" disabled={!email || resending} onClick={() => void resend()}>{resending ? 'Đang gửi lại…' : 'Gửi lại email xác minh'}</Button>
          </>
        )}
        <Button type="submit" size="lg" className="mt-2 w-full" disabled={loading}>{loading ? 'Đang xử lý…' : mode === 'login' ? 'Đăng nhập' : mode === 'register' ? 'Tạo tài khoản' : 'Xác minh email'}</Button>
      </form>
      {mode !== 'verify' && (
        <div className="mt-5 grid gap-3">
          <div className="flex items-center gap-3 text-caption text-ink-500"><span className="h-px flex-1 bg-line" />HOẶC<span className="h-px flex-1 bg-line" /></div>
          <div className="flex justify-center empty:hidden"><GoogleSignInButton onCredential={(t) => void handleGoogle(t)} disabled={loading} /></div>
          <button type="button" disabled={loading} onClick={() => void handleDemo()} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-green-50 px-4 py-2 text-sm font-bold text-brand-navy transition hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-50"><Icon name="bolt" className="h-4 w-4" />Dùng thử bằng tài khoản demo</button>
        </div>
      )}
    </div>
  )

  if (variant === 'modal') return form

  return (
    <div className="grid overflow-hidden rounded-3xl border border-line bg-surface shadow-[var(--shadow-raised)] md:grid-cols-2">
      <aside className="relative hidden overflow-hidden bg-brand-navy p-10 text-surface md:flex md:flex-col md:gap-8">
        <p className="text-caption text-brand-yellow">Tài khoản CourtIn</p>
        <p className="font-display text-[2.75rem] font-extrabold leading-none tracking-[-0.04em]">MỘT NƠI,<br />TRỌN VẸN<br />NHỊP CHƠI.</p>
        <ul className="grid gap-5">
          {benefits.map(([icon, head, body]) => (
            <li key={head} className="flex gap-3.5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-yellow/15 text-brand-yellow"><Icon name={icon} /></span>
              <span><span className="block font-bold">{head}</span><span className="text-sm text-surface/70">{body}</span></span>
            </li>
          ))}
        </ul>
      </aside>
      <div className="p-6 sm:p-10">{form}</div>
    </div>
  )
}
