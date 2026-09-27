import { AuthForm } from '../components/AuthForm';
import { useLocation, useNavigate } from 'react-router-dom';
import { loadSession } from '../session/session';

// Chủ sân và quản trị viên vào thẳng trang chủ Tài chính của vai; người chơi vào hồ sơ.
const homes = { player: '/profile', provider: '/manage', admin: '/admin' } as const;

export function AuthPage() {
  const { pathname, state } = useLocation();
  const navigate = useNavigate();
  const initialEmail = typeof state?.email === 'string' ? state.email : '';
  return (
    <main className="bg-canvas"><div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-20">
      <AuthForm initialMode={pathname === '/verify-email' ? 'verify' : 'login'} initialEmail={initialEmail} onAuthenticated={() => navigate(homes[loadSession()?.activeRole ?? 'player'])} />
    </div></main>
  );
}
