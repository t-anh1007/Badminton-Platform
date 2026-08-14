import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom';
import { RoleGuard } from './routing/RoleGuard';
import { AppLayout } from './layout/AppLayout';
import { HomePage } from './pages/HomePage';
import { AuthPage } from './pages/AuthPage';
import { BookingPage } from './pages/BookingPage';
import { BookingConfirmationPage } from './pages/BookingConfirmationPage';
import { ProfilePage } from './pages/ProfilePage';
import { AdminLayout } from './admin/AdminLayout';
import { AdminOverviewPage } from './pages/admin/AdminOverviewPage';
import { AdminAccountsPage } from './pages/admin/AdminAccountsPage';
import { AdminProvidersPage } from './pages/admin/AdminProvidersPage';
import { AdminBookingsPage } from './pages/admin/AdminBookingsPage';
import { AdminFinancePage } from './pages/admin/AdminFinancePage';
import { AdminDisputesPage } from './pages/admin/AdminDisputesPage';
import { AdminModerationPage } from './pages/admin/AdminModerationPage';
import { AdminEvaluationsPage } from './pages/admin/AdminEvaluationsPage';
import { AdminTicketsPage } from './pages/admin/AdminTicketsPage';
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
import { ManageLayout } from './manage/ManageLayout'; import { ManageOverviewPage } from './pages/manage/ManageOverviewPage'; import { ManageVenuesPage } from './pages/manage/ManageVenuesPage'; import { ManageVenueDetailPage } from './pages/manage/ManageVenueDetailPage'; import { ManageSchedulePage } from './pages/manage/ManageSchedulePage'; import { ManagePricingPage } from './pages/manage/ManagePricingPage';
import { ManageCalendarPage } from './pages/manage/ManageCalendarPage'; import { ManageIncidentsPage } from './pages/manage/ManageIncidentsPage';
import { ManageFinancePage } from './pages/manage/ManageFinancePage';

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
          <Route path="/booking/confirmation" element={<BookingConfirmationPage />} />
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
          <Route element={<RoleGuard allow={['provider']} />}><Route path="/manage" element={<ManageLayout />}><Route index element={<ManageOverviewPage/>}/><Route path="venues" element={<ManageVenuesPage/>}/><Route path="venues/:venueId" element={<ManageVenueDetailPage/>}/><Route path="venues/:venueId/schedule" element={<ManageSchedulePage/>}/><Route path="venues/:venueId/pricing" element={<ManagePricingPage/>}/><Route path="calendar" element={<ManageCalendarPage/>}/><Route path="incidents" element={<ManageIncidentsPage/>}/><Route path="finance" element={<ManageFinancePage/>}/><Route path="pricing" element={<ManagePricingPage/>}/></Route></Route>
          <Route element={<RoleGuard allow={['admin']} />}><Route path="/admin" element={<AdminLayout />}><Route index element={<AdminOverviewPage />} /><Route path="accounts" element={<AdminAccountsPage />} /><Route path="providers" element={<AdminProvidersPage />} /><Route path="bookings" element={<AdminBookingsPage />} /><Route path="finance" element={<AdminFinancePage />} /><Route path="disputes" element={<AdminDisputesPage />} /><Route path="moderation" element={<AdminModerationPage />} /><Route path="evaluations" element={<AdminEvaluationsPage />} /><Route path="tickets" element={<AdminTicketsPage />} /></Route></Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
