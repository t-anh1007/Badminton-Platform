import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { login, register, resendVerificationEmail, verifyEmail } from '../lib/accountApi';
import { Button, TextInput } from './ui';

type Mode = 'login' | 'register' | 'verify';

export function AuthForm({ onAuthenticated, onNavigateAway, initialMode = 'login' }: { onAuthenticated?: () => void; onNavigateAway?: () => void; initialMode?: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => { setMode(initialMode); setError(''); setMessage(''); }, [initialMode]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      if (mode === 'register') {
        const result = await register({ email, password, displayName });
        setMessage(result.message);
        setMode('verify');
      } else if (mode === 'verify') {
        const result = await verifyEmail({ email, code });
        setMessage(result.message);
        setMode('login');
      } else {
        const session = await login({ email, password });
        window.localStorage.setItem('accessToken', session.accessToken);
        window.localStorage.setItem('refreshToken', session.refreshToken);
        window.localStorage.setItem('roles', JSON.stringify(session.roles));
        onAuthenticated?.();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể xác thực tài khoản.');
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    setError('');
    setMessage('');
    setResending(true);
    try {
      const result = await resendVerificationEmail(email);
      setMessage(result.message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể gửi lại mã xác minh.');
    } finally {
      setResending(false);
    }
  };

  const showMode = (next: 'login' | 'register') => { setMode(next); setError(''); setMessage(''); };
  const title = mode === 'login' ? 'Chào mừng trở lại' : mode === 'register' ? 'Tạo tài khoản' : 'Xác minh email';

  return (
    <div className="grid overflow-hidden rounded-xl border border-line bg-surface md:grid-cols-2">
      <aside className="relative hidden min-h-[430px] overflow-hidden bg-green-500 p-8 text-surface md:block"><svg aria-hidden viewBox="0 0 280 240" className="absolute bottom-0 right-0 h-64 w-64 fill-none stroke-surface opacity-30" strokeWidth="2"><rect x="20" y="50" width="240" height="150" rx="12" /><path d="M140 50v150M20 125h240M60 50v150M220 50v150" /></svg><div className="relative flex h-full flex-col justify-between"><div><p className="text-sm font-semibold">Cầu Lông</p><h2 className="mt-5 text-3xl font-bold leading-tight">Hẹn sân. Tìm kèo.<br />Chơi vui hơn.</h2></div><div className="space-y-3"><p className="ml-5 w-fit rounded-2xl rounded-bl-sm bg-surface px-4 py-3 text-sm text-green-700 shadow-sm">Rảnh chiều nay không?</p><p className="w-fit rounded-2xl rounded-br-sm border border-surface/50 px-4 py-3 text-sm">Kiếm kèo nào!</p></div></div></aside>
      <div className="p-5 sm:p-7">
        <div className="mb-6 flex rounded-full bg-canvas p-1" role="tablist"><button type="button" role="tab" aria-selected={mode === 'login'} onClick={() => showMode('login')} className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold ${mode === 'login' ? 'bg-green-600 text-surface' : 'text-ink-500'}`}>Đăng nhập</button><button type="button" role="tab" aria-selected={mode === 'register'} onClick={() => showMode('register')} className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold ${mode === 'register' ? 'bg-green-600 text-surface' : 'text-ink-500'}`}>Đăng ký</button></div>
        <h2 className="text-h2">{title}</h2>
        <p className="mt-1 text-sm text-ink-500">{mode === 'verify' ? 'Nhập mã 6 chữ số đã gửi tới email của bạn.' : 'Dùng email và mật khẩu của tài khoản Cầu Lông.'}</p>
        {error && <p role="alert" className="mt-4 rounded-xl bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}
        {message && <p role="status" className="mt-4 rounded-xl bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p>}
        <form onSubmit={submit} className="mt-5 grid gap-4">
          {mode === 'register' && <label className="grid gap-1.5 text-sm font-medium text-ink-700">Tên hiển thị<TextInput required value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Nguyễn Văn A" /></label>}
          <label className="grid gap-1.5 text-sm font-medium text-ink-700">Email<TextInput type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="ban@vidu.com" /></label>
          {mode !== 'verify' ? <label className="grid gap-1.5 text-sm font-medium text-ink-700">Mật khẩu<TextInput type="password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Tối thiểu 8 ký tự" /></label> : <><label className="grid gap-1.5 text-sm font-medium text-ink-700">Mã xác minh<TextInput required inputMode="numeric" maxLength={6} className="text-figures" value={code} onChange={(event) => setCode(event.target.value)} placeholder="6 chữ số" /></label><Button tone="ghost" className="w-fit" disabled={!email || resending} onClick={() => void resend()}>{resending ? 'Đang gửi lại…' : 'Gửi lại email xác minh'}</Button></>}
          {mode === 'login' && <Link to="/reset-password" onClick={onNavigateAway} className="w-fit text-sm font-semibold text-green-700 hover:underline">Quên mật khẩu?</Link>}
          <Button type="submit" size="lg" disabled={loading}>{loading ? 'Đang xử lý…' : mode === 'login' ? 'Đăng nhập' : mode === 'register' ? 'Tạo tài khoản' : 'Xác minh email'}</Button>
        </form>
      </div>
    </div>
  );
}
