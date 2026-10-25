import { useCallback, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { AuthForm } from '../components/AuthForm';
import { Footer } from '../components/Footer';
import { Navbar } from '../components/Navbar';
import { Preloader } from '../components/Preloader';
import { Modal } from '../components/ui';
import { AssistantBubble } from '../components/AssistantBubble';
import { AuthPromptProvider, type AuthPromptOptions } from './AuthPrompt';

export function AppLayout() {
  const [auth, setAuth] = useState<AuthPromptOptions | null>(null);
  const openAuth = useCallback((options: AuthPromptOptions = {}) => setAuth(options), []);
  const close = () => setAuth(null);

  return (
    <AuthPromptProvider value={openAuth}>
      <div className="flex min-h-screen flex-col bg-canvas">
        <Preloader />
        <a href="#main-content" className="sr-only fixed left-4 top-4 z-[110] rounded-full bg-brand-yellow px-4 py-2 text-sm font-bold text-brand-navy focus:not-sr-only">Bỏ qua điều hướng</a>
        <Navbar onOpenAuth={openAuth} />
        <main id="main-content" className="flex-1"><Outlet /></main>
        <Footer />
        <AssistantBubble />
        <Modal bare open={auth !== null} title={auth?.title ?? 'Đăng nhập'} onClose={close}>
          <AuthForm variant="modal" contextTitle={auth?.title} initialMode={auth?.mode ?? 'login'} onNavigateAway={close} onAuthenticated={close} />
        </Modal>
      </div>
    </AuthPromptProvider>
  );
}
