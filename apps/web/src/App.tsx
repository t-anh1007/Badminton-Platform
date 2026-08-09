import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom';
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

function App() {
  const roles = (() => {
    try {
      const token = localStorage.getItem('accessToken');
      return token
        ? (JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).roles as string[])
        : [];
    } catch {
      return [];
    }
  })();
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
          <Route path="/admin" element={roles.includes('admin') ? <AdminPage /> : <Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
