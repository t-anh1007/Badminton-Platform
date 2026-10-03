import { AuthForm } from '../components/AuthForm';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { loadSession } from '../session/session';

// Chủ sân và quản trị viên vào thẳng trang chủ Tài chính của vai; người chơi vào hồ sơ.
const homes = { player: '/profile', provider: '/manage', admin: '/admin' } as const;

export function AuthPage() {
  const { pathname, state, search } = useLocation();
  const navigate = useNavigate();
  const initialEmail = typeof state?.email === 'string' ? state.email : '';
  // Chỉ nhận đường dẫn nội bộ (vd link trong email lời mời) để không chuyển hướng ra ngoài.
  const rawNext = new URLSearchParams(search).get('next');
  const next = rawNext?.startsWith('/') && !rawNext.startsWith('//') ? rawNext : null;
  if (next && loadSession()) return <Navigate to={next} replace />;
  return (
    <main className="bg-canvas"><div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-20">
      {next?.startsWith('/matches/') && (
        <p className="mx-auto mb-4 max-w-md rounded-xl bg-surface px-4 py-3 text-sm text-ink-700 ring-1 ring-line">Đăng nhập để xem kèo bạn được mời.</p>
      )}
      <AuthForm initialMode={pathname === '/verify-email' ? 'verify' : 'login'} initialEmail={initialEmail} onAuthenticated={() => navigate(next ?? homes[loadSession()?.activeRole ?? 'player'])} />
    </div></main>
  );
}
