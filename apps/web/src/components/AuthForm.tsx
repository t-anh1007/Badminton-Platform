import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { demoLogin, login, loginWithGoogle, register, resendVerificationEmail, verifyEmail } from '../lib/accountApi'
import { useSession } from '../session/SessionProvider'
import { Button, TextInput } from './ui'
import { GoogleSignInButton } from './GoogleSignInButton'

type Mode = 'login' | 'register' | 'verify'

interface AuthFormProps {
  onAuthenticated?: () => void
  onNavigateAway?: () => void
  initialMode?: Mode
}

export function AuthForm({ onAuthenticated, onNavigateAway, initialMode = 'login' }: AuthFormProps) {
  const { establish } = useSession()
  const [mode, setMode] = useState<Mode>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [code, setCode] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)

  useEffect(() => {
    setMode(initialMode)
    setError('')
    setMessage('')
  }, [initialMode])

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

  const title = mode === 'login' ? 'Chào mừng trở lại' : mode === 'register' ? 'Tạo tài khoản' : 'Xác minh email'

  return (
    <div className="grid overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-raised)] md:grid-cols-[.8fr_1.2fr]">
      <aside className="hidden min-h-[460px] bg-brand-navy p-8 text-surface md:flex md:flex-col md:justify-between">
        <div>
          <p className="text-caption text-brand-yellow">COURTIN / TÀI KHOẢN</p>
          <h2 className="mt-5 font-display text-4xl font-extrabold leading-none">MỘT NƠI,<br />TRỌN VẸN<br />NHỊP CHƠI.</h2>
        </div>
        <div className="rounded-2xl border border-surface/20 bg-brand-navy-raised p-5">
          <p className="text-sm font-bold text-brand-yellow">Email là định danh của bạn</p>
          <p className="mt-2 text-sm leading-6 text-surface/75">Đăng nhập, xác minh và đặt lại mật khẩu vẫn dùng luồng account hiện có.</p>
        </div>
      </aside>
      <div className="p-5 sm:px-6 sm:py-5">
        <div className="mb-4 flex rounded-full bg-canvas p-1" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'login'} onClick={() => showMode('login')} className={`flex-1 rounded-full px-3 py-2 text-sm font-bold ${mode === 'login' ? 'bg-brand-navy text-surface' : 'text-ink-500'}`}>Đăng nhập</button>
          <button type="button" role="tab" aria-selected={mode === 'register'} onClick={() => showMode('register')} className={`flex-1 rounded-full px-3 py-2 text-sm font-bold ${mode === 'register' ? 'bg-brand-navy text-surface' : 'text-ink-500'}`}>Đăng ký</button>
        </div>
        <h2 className="text-h3">{title}</h2>
        <p className="mt-1 text-sm text-ink-500">{mode === 'verify' ? 'Nhập mã 6 chữ số đã gửi tới email của bạn.' : 'Dùng email và mật khẩu của tài khoản COURTIN.'}</p>
        {error && <p role="alert" className="mt-4 rounded-xl bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}
        {message && <p role="status" className="mt-4 rounded-xl bg-success-bg px-3 py-2 text-sm text-success">{message}</p>}
        <form onSubmit={submit} className="mt-4 grid gap-3">
          {mode === 'register' && <label className="grid gap-1.5 text-sm font-semibold text-ink-700">Tên hiển thị<TextInput required value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Nguyễn Văn A" /></label>}
          <label className="grid gap-1.5 text-sm font-semibold text-ink-700">Email<TextInput type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="ban@vidu.com" /></label>
          {mode !== 'verify' ? (
            <label className="grid gap-1.5 text-sm font-semibold text-ink-700">Mật khẩu<TextInput type="password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Tối thiểu 8 ký tự" /></label>
          ) : (
            <>
              <label className="grid gap-1.5 text-sm font-semibold text-ink-700">Mã xác minh<TextInput required inputMode="numeric" maxLength={6} className="text-figures" value={code} onChange={(event) => setCode(event.target.value)} placeholder="6 chữ số" /></label>
              <Button tone="ghost" className="w-fit" disabled={!email || resending} onClick={() => void resend()}>{resending ? 'Đang gửi lại…' : 'Gửi lại email xác minh'}</Button>
            </>
          )}
          {mode === 'login' && <Link to="/reset-password" onClick={onNavigateAway} className="w-fit text-sm font-bold text-brand-navy hover:underline">Quên mật khẩu?</Link>}
          <Button type="submit" size="lg" className="mt-2 w-full" disabled={loading}>{loading ? 'Đang xử lý…' : mode === 'login' ? 'Đăng nhập' : mode === 'register' ? 'Tạo tài khoản' : 'Xác minh email'}</Button>
        </form>
        {mode !== 'verify' && (
          <div className="mt-4">
            <div className="mb-3 flex items-center gap-3 text-caption text-ink-500">
              <span className="h-px flex-1 bg-line" />
              HOẶC
              <span className="h-px flex-1 bg-line" />
            </div>
            <div className="flex justify-center">
              <GoogleSignInButton onCredential={(t) => void handleGoogle(t)} disabled={loading} />
            </div>
            <div className="mt-3 rounded-xl border border-dashed border-line bg-canvas p-3 text-center">
              <button type="button" disabled={loading} onClick={() => void handleDemo()} className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-green-600 px-4 py-2 text-sm font-bold uppercase tracking-[0.035em] text-surface transition duration-150 hover:-translate-y-px hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50">Dùng thử demo (Test demo)</button>
              <p className="mt-1.5 text-xs leading-snug text-ink-500">Không cần tài khoản — vào ngay với vai người chơi.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
