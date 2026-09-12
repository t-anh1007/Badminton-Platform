import { useRef } from 'react'

interface OtpCodeInputProps { value: string; onChange: (value: string) => void; disabled?: boolean }
const OTP_LENGTH = 6

export function OtpCodeInput({ value, onChange, disabled }: OtpCodeInputProps) {
  const inputs = useRef<Array<HTMLInputElement | null>>([])
  const digits = Array.from({ length: OTP_LENGTH }, (_, index) => value[index] ?? '')
  const setDigits = (index: number, next: string) => {
    const sanitized = next.replace(/\D/g, '').slice(0, OTP_LENGTH)
    if (!sanitized) { const updated = [...digits]; updated[index] = ''; onChange(updated.join('')); return }
    const updated = [...digits]
    sanitized.split('').forEach((digit, offset) => { if (index + offset < OTP_LENGTH) updated[index + offset] = digit })
    onChange(updated.join(''))
    inputs.current[Math.min(index + sanitized.length, OTP_LENGTH - 1)]?.focus()
  }
  return <div className="flex gap-2" onPaste={(event) => { const pasted = event.clipboardData.getData('text'); if (pasted) { event.preventDefault(); setDigits(0, pasted) } }}>{digits.map((digit, index) => <input key={index} ref={(element) => { inputs.current[index] = element }} aria-label={index === 0 ? 'Mã xác minh' : `Chữ số ${index + 1}`} inputMode="numeric" autoComplete={index === 0 ? 'one-time-code' : 'off'} maxLength={1} pattern="[0-9]*" value={digit} disabled={disabled} onChange={(event) => setDigits(index, event.target.value)} onKeyDown={(event) => { if (event.key === 'Backspace' && !digits[index] && index > 0) inputs.current[index - 1]?.focus() }} className="h-12 w-10 rounded-xl border border-line bg-surface text-center font-mono text-lg font-bold text-ink-900 outline-none transition focus:border-brand-navy focus:ring-4 focus:ring-green-100 disabled:cursor-not-allowed disabled:opacity-50" />)}</div>
}
