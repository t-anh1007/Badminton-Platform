import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom';
import { RoleGuard } from './routing/RoleGuard';
import { AppLayout } from './layout/AppLayout';
import { HomePage } from './pages/HomePage';
import { AuthPage } from './pages/AuthPage';
import { BookingPage } from './pages/BookingPage';
import { ProfilePage } from './pages/ProfilePage';
import { AdminPage } from './pages/AdminPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { VenueDetailPage } from './pages/VenueDetailPage';
import { VenueListPage } from './pages/VenueListPage';
import { MatchListPage } from './pages/MatchListPage';
import { MatchDetailPage } from './pages/MatchDetailPage';
import { PassportPage } from './pages/PassportPage';
import { CommunityPage } from './pages/CommunityPage';
import { CommunityDetailPage } from './pages/CommunityDetailPage';
import { SupportPage } from './pages/SupportPage';
import { AssistantPage } from './pages/AssistantPage';
import { ProviderOnboardingPage } from './pages/ProviderOnboardingPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/verify-email" element={<AuthPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/venues" element={<VenueListPage />} />
          <Route path="/venues/:id" element={<VenueDetailPage />} />
          <Route path="/booking" element={<BookingPage />} />
          <Route path="/matches" element={<MatchListPage />} />
          <Route path="/matches/:id" element={<MatchDetailPage />} />
          <Route path="/passport" element={<PassportPage />} />
          <Route path="/passport/:userId" element={<PassportPage />} />
          <Route path="/community" element={<CommunityPage />} />
          <Route path="/community/:postId" element={<CommunityDetailPage />} />
          <Route path="/support" element={<SupportPage />} />
          <Route path="/assistant" element={<AssistantPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/provider-onboarding" element={<ProviderOnboardingPage />} />
          <Route element={<RoleGuard allow={['provider']} />}><Route path="/manage/*" element={<HomePage />} /></Route>
          <Route element={<RoleGuard allow={['admin']} />}><Route path="/admin/*" element={<AdminPage />} /></Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
