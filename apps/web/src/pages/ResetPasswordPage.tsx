import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { requestPasswordReset, resetPassword } from '../lib/accountApi';
import { Button, SurfaceCard, TextInput } from '../components/ui';

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const submit = async (event: React.FormEvent) => { event.preventDefault(); setError(''); setMessage(''); if (token && password !== confirm) { setError('Mật khẩu xác nhận chưa khớp.'); return; } setLoading(true); try { const result = token ? await resetPassword({ token, newPassword: password }) : await requestPasswordReset(email); setMessage(result.message); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể đặt lại mật khẩu.'); } finally { setLoading(false); } };
  return <main className="page-container grid min-h-[60vh] place-items-center py-12"><SurfaceCard className="w-full max-w-md"><p className="text-caption text-green-700">Tài khoản</p><h1 className="mt-2 text-h1">{token ? 'Đặt mật khẩu mới' : 'Quên mật khẩu?'}</h1><p className="mt-2 text-sm text-ink-500">{token ? 'Chọn mật khẩu mới có ít nhất 8 ký tự.' : 'Nhập email để nhận liên kết đặt lại mật khẩu.'}</p>{error && <p role="alert" className="mt-4 rounded-xl bg-danger-bg p-3 text-sm text-danger">{error}</p>}{message && <p role="status" className="mt-4 rounded-xl bg-green-50 p-3 text-sm text-green-700">{message}</p>}<form onSubmit={submit} className="mt-5 grid gap-4">{token ? <><label className="grid gap-1.5 text-sm font-medium">Mật khẩu mới<TextInput type="password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} /></label><label className="grid gap-1.5 text-sm font-medium">Xác nhận mật khẩu<TextInput type="password" required minLength={8} value={confirm} onChange={(event) => setConfirm(event.target.value)} /></label></> : <label className="grid gap-1.5 text-sm font-medium">Email<TextInput type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="ban@vidu.com" /></label>}<Button type="submit" disabled={loading}>{loading ? 'Đang gửi…' : token ? 'Lưu mật khẩu mới' : 'Gửi liên kết'}</Button></form><Link to="/auth" className="mt-5 inline-block text-sm font-semibold text-green-700 hover:underline">Quay lại đăng nhập</Link></SurfaceCard></main>;
}
