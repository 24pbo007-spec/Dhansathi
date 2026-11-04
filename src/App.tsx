import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Suspense, lazy, useState, useEffect, useRef } from 'react';
import Loader from '@/components/shared/Loader';
import DashboardLayout from '@/layouts/DashboardLayout';
import AuthLayout from '@/layouts/AuthLayout';
import { useAuthStore } from '@/stores/authStore';

const LandingPage = lazy(() => import('@/features/auth/LandingPage'));
const LoginPage = lazy(() => import('@/features/auth/LoginPage'));
const SignupPage = lazy(() => import('@/features/auth/SignupPage'));
const DashboardHome = lazy(() => import('@/features/dashboard/DashboardHome'));
const SchemesPage = lazy(() => import('@/features/dashboard/SchemesPage'));
const ScholarshipsPage = lazy(() => import('@/features/dashboard/ScholarshipsPage'));
const StocksPage = lazy(() => import('@/features/dashboard/StocksPage'));
const CrossoverPage = lazy(() => import('@/features/dashboard/CrossoverPage'));
const AlertsPage = lazy(() => import('@/features/dashboard/AlertsPage'));
const OnboardingPage = lazy(() => import('@/features/onboarding/OnboardingPage'));
const SimulatorPage = lazy(() => import('@/features/simulator/SimulatorPage'));
const ChatPage = lazy(() => import('@/features/chat/ChatPage'));
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage'));
const StockDetailPage = lazy(() => import('@/features/stocks/StockDetailPage'));
const TaxCalculator = lazy(() => import('@/features/tools/TaxCalculator'));
const BudgetAnalyzer = lazy(() => import('@/features/tools/BudgetAnalyzer'));
const MonthlyReports = lazy(() => import('@/features/tools/MonthlyReports'));
const GstCalculator = lazy(() => import('@/features/tools/GstCalculator'));
const SalaryCalculator = lazy(() => import('@/features/tools/SalaryCalculator'));
const ApplicationTracker = lazy(() => import('@/features/dashboard/ApplicationTracker'));
const AuthCallback = lazy(() => import('@/features/auth/AuthCallback'));
// Legal Pages
const PrivacyPolicy = lazy(() => import('@/features/legal/PrivacyPolicy'));
const TermsConditions = lazy(() => import('@/features/legal/TermsConditions'));

// Docs Page
const DocsPage = lazy(() => import('@/features/docs/DocsPage'));

// Admin panel (lazy loaded)
const AdminLayout = lazy(() => import('@/layouts/AdminLayout'));
const AdminDashboard = lazy(() => import('@/features/admin/AdminDashboard'));
const AdminUsers = lazy(() => import('@/features/admin/AdminUsers'));
const AdminSchemes = lazy(() => import('@/features/admin/AdminSchemes'));
const AdminRevenue = lazy(() => import('@/features/admin/AdminRevenue'));
const AdminSimulations = lazy(() => import('@/features/admin/AdminSimulations'));
const AdminSettings = lazy(() => import('@/features/admin/AdminSettings'));
const AdminQueries = lazy(() => import('@/features/admin/AdminQueries'));
const AdminLogin = lazy(() => import('@/features/admin/AdminLogin'));

function PageTransitionLoader({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => {
      setLoading(false);
    }, 800);
    return () => clearTimeout(timer);
  }, [location.pathname]);

  return (
    <>
      {loading && <Loader />}
      {children}
    </>
  );
}

function App() {
  const initialize = useAuthStore((s) => s.initialize);
  const initialized = useAuthStore((s) => s.initialized);
  const initCalled = useRef(false);

  useEffect(() => {
    if (!initCalled.current && !initialized) {
      initCalled.current = true;
      initialize();
    }
  }, [initialize, initialized]);

  return (
    <Suspense fallback={<Loader />}>
      <PageTransitionLoader>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
          </Route>
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/dashboard" element={<DashboardLayout />}>
            <Route index element={<DashboardHome />} />
            <Route path="schemes" element={<SchemesPage />} />
            <Route path="schemes/:stateParam" element={<SchemesPage />} />
            <Route path="scholarships" element={<ScholarshipsPage />} />
            <Route path="scholarships/:stateParam" element={<ScholarshipsPage />} />
            <Route path="stocks" element={<StocksPage />} />
            <Route path="crossover" element={<CrossoverPage />} />
            <Route path="alerts" element={<AlertsPage />} />
            <Route path="simulator" element={<SimulatorPage />} />
            <Route path="chat" element={<ChatPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="pricing" element={<Navigate to="/dashboard/settings" replace />} />
            <Route path="stock-detail" element={<StockDetailPage />} />
            <Route path="tax-calculator" element={<TaxCalculator />} />
            <Route path="budget-analyzer" element={<BudgetAnalyzer />} />
            <Route path="monthly-reports" element={<MonthlyReports />} />
            <Route path="gst-calculator" element={<GstCalculator />} />
            <Route path="salary-calculator" element={<SalaryCalculator />} />
            <Route path="applications" element={<ApplicationTracker />} />
          </Route>
          {/* Admin Login */}
          <Route path="/admin/login" element={<AdminLogin />} />
          {/* Admin Panel */}
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboard />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="schemes" element={<AdminSchemes />} />
            <Route path="revenue" element={<AdminRevenue />} />
            <Route path="simulations" element={<AdminSimulations />} />
            <Route path="settings" element={<AdminSettings />} />
            <Route path="queries" element={<AdminQueries />} />
          </Route>
          {/* Legal & Docs Pages */}
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<TermsConditions />} />
          <Route path="/docs" element={<DocsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </PageTransitionLoader>
    </Suspense>
  );
}

export default App;
