import { useState } from 'react';
import { login, register, verifyEmail } from '../lib/accountApi';

type Mode = 'login' | 'register' | 'verify';

const TITLES: Record<Mode, string> = {
  login: 'Đăng nhập',
  register: 'Tạo tài khoản',
  verify: 'Xác minh email',
};

/** ACC-01..03: đăng ký, xác minh và đăng nhập qua account-service thật. */
export function AuthForm({ onAuthenticated }: { onAuthenticated?: () => void }) {
  const [mode, setMode] = useState<Mode>('login');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [code, setCode] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (mode === 'register') {
        const result = await register({ email, password, displayName });
        setMessage(result.message); setMode('verify');
      } else if (mode === 'verify') {
        const result = await verifyEmail({ email, code });
        setMessage(result.message); setMode('login');
      } else {
        const session = await login({ email, password });
        window.localStorage.setItem('accessToken', session.accessToken);
        window.localStorage.setItem('refreshToken', session.refreshToken);
        window.localStorage.setItem('roles', JSON.stringify(session.roles));
        setMessage('Đăng nhập thành công.');
        onAuthenticated?.();
      }
    } catch (error) { setMessage((error as Error).message); }
  };

  return (
    <div className="mx-auto w-full max-w-md rounded-2xl bg-surface p-8 shadow-sm">
      <div className="mb-6 flex gap-2">
        {(Object.keys(TITLES) as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setMessage('');
            }}
            className={`rounded-full px-3 py-1 text-caption transition-colors ${
              mode === m ? 'bg-green-600 text-surface' : 'bg-canvas text-ink-900/60'
            }`}
          >
            {TITLES[m]}
          </button>
        ))}
      </div>

      <h2 className="text-h2 mb-4">{TITLES[mode]}</h2>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="text-body flex flex-col gap-1">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="ban@vidu.com"
            className="rounded-lg border border-ink-700/20 px-3 py-2 outline-none focus:border-green-700"
          />
        </label>

        {mode !== 'verify' && (
          <label className="text-body flex flex-col gap-1">
            Mật khẩu
            <input
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              className="rounded-lg border border-ink-700/20 px-3 py-2 outline-none focus:border-green-700"
            />
          </label>
        )}

        {mode === 'register' && (
          <label className="text-body flex flex-col gap-1">
            Tên hiển thị
            <input type="text" required value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Nguyễn Văn A" className="rounded-lg border border-ink-700/20 px-3 py-2 outline-none focus:border-green-700" />
          </label>
        )}

        {mode === 'verify' && (
          <label className="text-body flex flex-col gap-1">
            Mã xác minh
            <input
              type="text"
              required
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="6 chữ số"
              className="text-figures rounded-lg border border-ink-700/20 px-3 py-2 outline-none focus:border-green-700"
            />
          </label>
        )}

        <button
          type="submit"
          className="rounded-full bg-green-600 px-4 py-2 text-caption text-surface transition-transform hover:-translate-y-0.5"
        >
          {TITLES[mode]}
        </button>

        {message && <p role="status" className="text-body rounded-lg bg-green-700/10 px-3 py-2 text-green-700">{message}</p>}
      </form>
    </div>
  );
}
