import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { OtpCodeInput } from '../components/OtpCodeInput'
import { requestPasswordReset, resetPassword, verifyPasswordResetCode } from '../lib/accountApi'
import { Button, SurfaceCard, TextInput } from '../components/ui'

type ResetStep = 'request' | 'verify' | 'reset'
const RESET_CODE_TTL_SECONDS = 5 * 60

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<ResetStep>('request')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(0)

  useEffect(() => {
    if (step !== 'verify' || secondsLeft <= 0) return
    const timer = window.setInterval(() => setSecondsLeft((seconds) => Math.max(0, seconds - 1)), 1_000)
    return () => window.clearInterval(timer)
  }, [step, secondsLeft])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setMessage('')
    if (step === 'reset' && password !== confirm) { setError('Mật khẩu xác nhận chưa khớp.'); return }
    setLoading(true)
    try {
      if (step === 'request') { const result = await requestPasswordReset(email); setMessage(result.message); setSecondsLeft(RESET_CODE_TTL_SECONDS); setStep('verify') }
      else if (step === 'verify') { const result = await verifyPasswordResetCode({ email, code }); setResetToken(result.resetToken); setStep('reset') }
      else { await resetPassword({ token: resetToken, newPassword: password }); navigate('/auth', { replace: true, state: { email } }) }
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể đặt lại mật khẩu.') }
    finally { setLoading(false) }
  }

  const title = step === 'request' ? 'Quên mật khẩu?' : step === 'verify' ? 'Xác minh mã' : 'Đặt mật khẩu mới'
  const description = step === 'request' ? 'Nhập email để nhận mã xác nhận đặt lại mật khẩu.' : step === 'verify' ? 'Nhập mã 6 chữ số đã được gửi tới email của bạn.' : 'Chọn mật khẩu mới có ít nhất 8 ký tự.'
  const countdown = `${String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:${String(secondsLeft % 60).padStart(2, '0')}`
  return <main className="min-h-[60vh] bg-canvas"><div className="page-container grid place-items-center py-12 sm:py-20"><SurfaceCard className="w-full max-w-md p-6 sm:p-8"><p className="courtin-kicker">COURTIN / TÀI KHOẢN</p><h1 className="mt-2 text-h1">{title}</h1><p className="mt-3 text-sm leading-6 text-ink-500">{description}</p>{step === 'verify' && <p className="mt-2 text-sm font-semibold text-ink-700">{secondsLeft > 0 ? <>Mã còn hiệu lực: <span className="font-mono text-figures">{countdown}</span></> : 'Mã đã hết hạn. Vui lòng yêu cầu mã mới.'}</p>}{error && <p role="alert" className="mt-4 rounded-xl bg-danger-bg p-3 text-sm text-danger">{error}</p>}{message && <p role="status" className="mt-4 rounded-xl bg-success-bg p-3 text-sm text-success">{message}</p>}<form onSubmit={submit} className="mt-6 grid gap-4">{step === 'request' && <label className="grid gap-1.5 text-sm font-semibold">Email<TextInput type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="ban@vidu.com" /></label>}{step === 'verify' && <OtpCodeInput value={code} onChange={setCode} disabled={loading || secondsLeft === 0} />}{step === 'reset' && <><label className="grid gap-1.5 text-sm font-semibold">Mật khẩu mới<TextInput type="password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} /></label><label className="grid gap-1.5 text-sm font-semibold">Xác nhận mật khẩu<TextInput type="password" required minLength={8} value={confirm} onChange={(event) => setConfirm(event.target.value)} /></label></>}<Button type="submit" className="w-full" disabled={loading || (step === 'verify' && secondsLeft === 0)}>{loading ? 'Đang xử lý…' : step === 'request' ? 'Gửi mã xác nhận' : step === 'verify' ? 'Xác minh mã' : 'Lưu mật khẩu mới'}</Button></form><Link to="/auth" className="mt-5 inline-block text-sm font-bold text-brand-navy hover:underline">Quay lại đăng nhập</Link></SurfaceCard></div></main>
}
