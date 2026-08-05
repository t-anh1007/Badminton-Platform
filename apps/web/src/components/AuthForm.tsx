import { useState } from 'react';

type Mode = 'login' | 'register' | 'verify';

const TITLES: Record<Mode, string> = {
  login: 'Đăng nhập',
  register: 'Tạo tài khoản',
  verify: 'Xác minh email',
};

/**
 * Form auth — baseline cho ACC-01 (đăng ký), ACC-02 (xác minh), ACC-03
 * (đăng nhập). Chỉ UI khung + trạng thái lỗi/thành công giả lập — chưa gọi
 * API thật (thuộc G1).
 */
export function AuthForm() {
  const [mode, setMode] = useState<Mode>('login');
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Gdesign: chỉ mô phỏng trạng thái, logic thật thuộc G1.
    setStatus('success');
  };

  return (
    <div className="mx-auto w-full max-w-md rounded-2xl bg-bg-white p-8 shadow-sm">
      <div className="mb-6 flex gap-2">
        {(Object.keys(TITLES) as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setStatus('idle');
            }}
            className={`rounded-full px-3 py-1 text-caption transition-colors ${
              mode === m ? 'bg-primary-navy text-on-dark' : 'bg-bg-light text-text-primary/60'
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
            placeholder="ban@vidu.com"
            className="rounded-lg border border-slate/20 px-3 py-2 outline-none focus:border-primary-blue"
          />
        </label>

        {mode !== 'verify' && (
          <label className="text-body flex flex-col gap-1">
            Mật khẩu
            <input
              type="password"
              required
              placeholder="••••••••"
              className="rounded-lg border border-slate/20 px-3 py-2 outline-none focus:border-primary-blue"
            />
          </label>
        )}

        {mode === 'verify' && (
          <label className="text-body flex flex-col gap-1">
            Mã xác minh
            <input
              type="text"
              required
              placeholder="6 chữ số"
              className="text-figures rounded-lg border border-slate/20 px-3 py-2 outline-none focus:border-primary-blue"
            />
          </label>
        )}

        <button
          type="submit"
          className="rounded-full bg-accent-shuttle px-4 py-2 text-caption text-court-green transition-transform hover:-translate-y-0.5"
        >
          {TITLES[mode]}
        </button>

        {status === 'success' && (
          <p className="text-body rounded-lg bg-court-green/10 px-3 py-2 text-court-green">
            Thành công (mock) — logic thật thuộc G1.
          </p>
        )}
      </form>
    </div>
  );
}
