import { AuthForm } from '../components/AuthForm';
import { useLocation, useNavigate } from 'react-router-dom';

export function AuthPage() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  return (
    <main className="bg-canvas"><div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-20">
      <AuthForm initialMode={pathname === '/verify-email' ? 'verify' : 'login'} onAuthenticated={() => navigate('/profile')} />
    </div></main>
  );
}
