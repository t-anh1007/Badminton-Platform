import { AuthForm } from '../components/AuthForm';
import { useLocation, useNavigate } from 'react-router-dom';

export function AuthPage() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
      <AuthForm initialMode={pathname === '/verify-email' ? 'verify' : 'login'} onAuthenticated={() => navigate('/profile')} />
    </div>
  );
}
