import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { AuthForm } from '../components/AuthForm';
import { Footer } from '../components/Footer';
import { Navbar } from '../components/Navbar';
import { Preloader } from '../components/Preloader';
import { Modal } from '../components/ui';

export function AppLayout() {
  const [authOpen, setAuthOpen] = useState(false);
  const [sessionVersion, setSessionVersion] = useState(0);

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <Preloader />
      <a href="#main-content" className="sr-only fixed left-4 top-4 z-[110] rounded-full bg-brand-yellow px-4 py-2 text-sm font-bold text-brand-navy focus:not-sr-only">Bỏ qua điều hướng</a>
      <Navbar onOpenAuth={() => setAuthOpen(true)} sessionVersion={sessionVersion} />
      <main id="main-content" className="flex-1"><Outlet /></main>
      <Footer />
      <Modal open={authOpen} title="Chào mừng bạn" onClose={() => setAuthOpen(false)}>
        <AuthForm onNavigateAway={() => setAuthOpen(false)} onAuthenticated={() => { setSessionVersion((version) => version + 1); setAuthOpen(false); }} />
      </Modal>
    </div>
  );
}
