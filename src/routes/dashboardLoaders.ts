// Code-split loaders for every dashboard page. App.tsx builds its lazy()
// routes from these, and the dashboard prefetches them while the browser is
// idle — so by the time a user clicks a sidebar link, the page's code is
// already downloaded and the page opens instantly.

export const dashboardLoaders = {
  home: () => import('@/features/dashboard/DashboardHome'),
  schemes: () => import('@/features/dashboard/SchemesPage'),
  scholarships: () => import('@/features/dashboard/ScholarshipsPage'),
  stocks: () => import('@/features/dashboard/StocksPage'),
  crossover: () => import('@/features/dashboard/CrossoverPage'),
  alerts: () => import('@/features/dashboard/AlertsPage'),
  simulator: () => import('@/features/simulator/SimulatorPage'),
  chat: () => import('@/features/chat/ChatPage'),
  settings: () => import('@/features/settings/SettingsPage'),
  stockDetail: () => import('@/features/stocks/StockDetailPage'),
  taxCalculator: () => import('@/features/tools/TaxCalculator'),
  budgetAnalyzer: () => import('@/features/tools/BudgetAnalyzer'),
  monthlyReports: () => import('@/features/tools/MonthlyReports'),
  gstCalculator: () => import('@/features/tools/GstCalculator'),
  salaryCalculator: () => import('@/features/tools/SalaryCalculator'),
  applications: () => import('@/features/dashboard/ApplicationTracker'),
};

let prefetched = false;

/** Download every dashboard page in the background, once, when the browser is idle. */
export function prefetchDashboardPages(): void {
  if (prefetched || typeof window === 'undefined') return;
  prefetched = true;
  // Respect data-saver / very slow connections.
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (connection?.saveData || connection?.effectiveType === '2g' || connection?.effectiveType === 'slow-2g') return;

  const loaders = Object.values(dashboardLoaders);
  const run = () => {
    // One at a time, so prefetching never competes with what the user is doing.
    loaders.reduce<Promise<unknown>>((chain, load) => chain.then(() => load().catch(() => undefined)), Promise.resolve());
  };
  if ('requestIdleCallback' in window) {
    (window as Window & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback(run, { timeout: 3000 });
  } else {
    setTimeout(run, 1500);
  }
}
