import { Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy, useEffect, useRef } from 'react';
import Loader from '@/components/shared/Loader';
import DashboardLayout from '@/layouts/DashboardLayout';
import AuthLayout from '@/layouts/AuthLayout';
import { useAuthStore } from '@/stores/authStore';
import { dashboardLoaders } from '@/routes/dashboardLoaders';

const LandingPage = lazy(() => import('@/features/auth/LandingPage'));
const LoginPage = lazy(() => import('@/features/auth/LoginPage'));
const SignupPage = lazy(() => import('@/features/auth/SignupPage'));
const DashboardHome = lazy(dashboardLoaders.home);
const SchemesPage = lazy(dashboardLoaders.schemes);
const ScholarshipsPage = lazy(dashboardLoaders.scholarships);
const StocksPage = lazy(dashboardLoaders.stocks);
const CrossoverPage = lazy(dashboardLoaders.crossover);
const AlertsPage = lazy(dashboardLoaders.alerts);
const OnboardingPage = lazy(() => import('@/features/onboarding/OnboardingPage'));
const SimulatorPage = lazy(dashboardLoaders.simulator);
const ChatPage = lazy(dashboardLoaders.chat);
const SettingsPage = lazy(dashboardLoaders.settings);
const StockDetailPage = lazy(dashboardLoaders.stockDetail);
const TaxCalculator = lazy(dashboardLoaders.taxCalculator);
const BudgetAnalyzer = lazy(dashboardLoaders.budgetAnalyzer);
const MonthlyReports = lazy(dashboardLoaders.monthlyReports);
const GstCalculator = lazy(dashboardLoaders.gstCalculator);
const SalaryCalculator = lazy(dashboardLoaders.salaryCalculator);
const ApplicationTracker = lazy(dashboardLoaders.applications);
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
    </Suspense>
  );
}

export default App;
