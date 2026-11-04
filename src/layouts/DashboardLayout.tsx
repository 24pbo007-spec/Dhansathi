import { useState } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useLanguageStore } from '@/stores/languageStore';
import { useAuthStore } from '@/stores/authStore';
import { T } from '@/lib/translations';

interface NavItem {
  labelKey: 'dashboard' | 'schemes' | 'scholarships' | 'stocks' | 'crossover' | 'alerts' | 'dhanMitra' | 'askDhanSathi' | 'taxCalculator' | 'salaryCalculator' | 'gstCalculator' | 'budgetAnalyzer' | 'monthlyReports' | 'applicationTracker';
  icon: string;
  path: string;
  badge?: string;
  sectionKey: 'main' | 'aiTools' | 'proTools' | 'more';
}

const NAV_ITEMS: NavItem[] = [
  { labelKey: 'dashboard', icon: 'dashboard', path: '/dashboard', sectionKey: 'main' },
  { labelKey: 'schemes', icon: 'account_balance', path: '/dashboard/schemes', badge: '8', sectionKey: 'main' },
  { labelKey: 'scholarships', icon: 'school', path: '/dashboard/scholarships', sectionKey: 'main' },
  { labelKey: 'stocks', icon: 'trending_up', path: '/dashboard/stocks', sectionKey: 'main' },
  { labelKey: 'crossover', icon: 'swap_horiz', path: '/dashboard/crossover', sectionKey: 'main' },
  { labelKey: 'alerts', icon: 'notifications', path: '/dashboard/alerts', badge: '3', sectionKey: 'main' },
  { labelKey: 'dhanMitra', icon: 'psychology', path: '/dashboard/simulator', sectionKey: 'aiTools' },
  { labelKey: 'askDhanSathi', icon: 'chat_bubble', path: '/dashboard/chat', sectionKey: 'aiTools' },
  { labelKey: 'taxCalculator', icon: 'calculate', path: '/dashboard/tax-calculator', sectionKey: 'proTools' },
  { labelKey: 'salaryCalculator', icon: 'payments', path: '/dashboard/salary-calculator', sectionKey: 'proTools' },
  { labelKey: 'gstCalculator', icon: 'receipt_long', path: '/dashboard/gst-calculator', sectionKey: 'proTools' },
  { labelKey: 'budgetAnalyzer', icon: 'account_balance_wallet', path: '/dashboard/budget-analyzer', sectionKey: 'proTools' },
  { labelKey: 'monthlyReports', icon: 'assessment', path: '/dashboard/monthly-reports', sectionKey: 'proTools' },
  { labelKey: 'applicationTracker', icon: 'check_circle', path: '/dashboard/applications', sectionKey: 'proTools' },
];

export default function DashboardLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const { lang, toggleLang } = useLanguageStore();
  const user = useAuthStore((s) => s.user);

  const isActive = (path: string) => {
    if (path === '/dashboard') return location.pathname === '/dashboard';
    return location.pathname.startsWith(path);
  };

  // Group nav items by section
  const sections = NAV_ITEMS.reduce<Record<string, NavItem[]>>((acc, item) => {
    const s = T('nav', item.sectionKey, lang);
    if (!acc[s]) acc[s] = [];
    acc[s].push(item);
    return acc;
  }, {});

  return (
    <div className="bg-background min-h-screen">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex fixed left-0 top-0 h-screen w-[250px] z-40 bg-gradient-to-b from-sky-800 to-sky-950 flex-col shadow-2xl shadow-black/20 overflow-hidden">
        {/* Tricolor bar */}
        <div className="tricolor-bar" />

        <div className="p-4 space-y-4 flex flex-col h-full">
          {/* Brand */}
          <div className="pt-1 flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-saffron via-white to-india-green rounded-xl flex items-center justify-center shadow-lg">
              <span className="text-sky-900 font-black text-xl">D</span>
            </div>
            <div>
              <h1 className="text-white font-headline font-bold text-xl leading-none">DhanSathi</h1>
              <span className="text-white/60 text-xs font-medium tracking-widest block mt-1">धनसाथी</span>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-grow space-y-3 relative overflow-y-auto overflow-x-hidden scrollbar-thin pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.2) transparent' }}>
            {Object.entries(sections).map(([section, items]) => (
              <div key={section}>
                <p className="relative z-10 text-white/40 text-[10px] font-bold tracking-widest uppercase mb-1.5 px-3">
                  {section}
                </p>
                <div className="space-y-0.5">
                  {items.map((item) => {
                    return (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        end={item.path === '/dashboard'}
                        data-nav-path={item.path}
                        className={cn(
                          'relative z-10 flex items-center justify-between px-3 py-2 rounded-xl transition-all',
                          isActive(item.path)
                            ? 'bg-white/15 text-white font-semibold'
                            : 'text-sky-100/70 hover:bg-white/5',
                        )}
                      >
                        <div className="flex items-center space-x-3">
                          <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                          <span className="text-sm">{T('nav', item.labelKey, lang)}</span>
                        </div>
                        {item.badge ? (
                          <span
                            className={cn(
                              'text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md',
                              item.icon === 'account_balance' ? 'bg-india-green' : 'bg-saffron',
                            )}
                          >
                            {item.badge}
                          </span>
                        ) : null}
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          {/* Footer */}
          <div className="pt-3 border-t border-white/10 flex-shrink-0">
            {/* Language toggle */}
            <button
              onClick={toggleLang}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl mb-1 text-sky-100/70 hover:bg-white/5 transition-all"
            >
              <div className="flex items-center space-x-3">
                <span className="material-symbols-outlined text-[20px]">translate</span>
                <span className="text-sm">{T('settings', 'language', lang)}</span>
              </div>
              <span className="text-[10px] font-bold bg-white/15 text-white px-2 py-0.5 rounded-md">
                {lang === 'en' ? 'EN' : 'हिं'}
              </span>
            </button>

            <NavLink
              to="/dashboard/settings"
              className={cn(
                'flex items-center px-3 py-2 rounded-xl mb-3 transition-all',
                isActive('/dashboard/settings')
                  ? 'bg-white/10 text-white font-semibold'
                  : 'text-sky-100/70 hover:bg-white/5',
              )}
            >
              <div className="flex items-center space-x-3">
                <span className="material-symbols-outlined text-[20px]">settings</span>
                <span className="text-sm">{T('nav', 'settings', lang)}</span>
              </div>
            </NavLink>

            <div className="bg-white/5 rounded-xl p-3 flex items-center space-x-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-primary-container flex items-center justify-center text-white font-bold text-sm">
                {(user?.full_name || user?.email || 'U').charAt(0).toUpperCase()}
              </div>
              <div className="overflow-hidden">
                <p className="text-white font-bold text-sm truncate">{user?.full_name || user?.email?.split('@')[0] || 'User'}</p>
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-white/50">
                  Full Access
                </p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="md:hidden fixed top-0 w-full z-50 bg-white/90 backdrop-blur-xl shadow-sm px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-gradient-to-br from-saffron via-white to-india-green rounded-lg flex items-center justify-center">
            <span className="text-primary font-black text-sm">D</span>
          </div>
          <span className="font-bold text-primary text-lg">DhanSathi</span>
        </div>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 rounded-xl hover:bg-surface-container-low transition-colors"
        >
          <span className="material-symbols-outlined">{mobileMenuOpen ? 'close' : 'menu'}</span>
        </button>
      </header>

      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)}>
          <div
            className="absolute top-14 right-4 w-64 bg-white rounded-2xl shadow-2xl p-4 space-y-1"
            onClick={(e) => e.stopPropagation()}
          >
            {NAV_ITEMS.map((item) => {
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/dashboard'}
                  onClick={() => {
                    setMobileMenuOpen(false);
                  }}
                  className={cn(
                    'flex items-center justify-between px-4 py-3 rounded-xl transition-all',
                    isActive(item.path)
                      ? 'bg-primary-fixed text-primary font-semibold'
                      : 'text-on-surface-variant hover:bg-surface-container-low',
                  )}
                >
                  <div className="flex items-center space-x-3">
                    <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                    <span className="text-sm">{T('nav', item.labelKey, lang)}</span>
                  </div>
                </NavLink>
              );
            })}
            {/* Mobile language toggle */}
            <button
              onClick={toggleLang}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-on-surface-variant hover:bg-surface-container-low transition-all"
            >
              <div className="flex items-center space-x-3">
                <span className="material-symbols-outlined text-[20px]">translate</span>
                <span className="text-sm">{T('settings', 'language', lang)}</span>
              </div>
              <span className="text-[10px] font-bold bg-primary-fixed text-primary px-2 py-0.5 rounded-md">
                {lang === 'en' ? 'EN' : 'हिं'}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="md:ml-[250px] min-h-screen pt-16 md:pt-0">
        <div className="p-4 md:p-12 pb-24 md:pb-12">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 w-full flex justify-around items-center px-2 pb-safe pt-2 bg-white/90 backdrop-blur-2xl z-50 rounded-t-2xl border-t border-outline-variant/20 shadow-[0_-10px_40px_rgba(0,97,148,0.08)]">
        {([
          { icon: 'home', labelKey: 'home' as const, path: '/dashboard' },
          { icon: 'account_balance', labelKey: 'schemes' as const, path: '/dashboard/schemes' },
          { icon: 'school', labelKey: 'scholarships' as const, path: '/dashboard/scholarships' },
          { icon: 'trending_up', labelKey: 'stocks' as const, path: '/dashboard/stocks' },
          { icon: 'person', labelKey: 'profile' as const, path: '/dashboard/settings' },
        ]).map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/dashboard'}
            className={cn(
              'flex flex-col items-center justify-center px-3 py-2 rounded-2xl transition-colors',
              isActive(item.path)
                ? 'bg-primary-fixed text-primary'
                : 'text-outline hover:bg-surface-container-low',
            )}
          >
            <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
            <span className="text-[10px] font-bold mt-0.5">{T('nav', item.labelKey, lang)}</span>
          </NavLink>
        ))}
      </nav>

      {/* Floating AI button - desktop only */}
      <div className="hidden md:block fixed bottom-8 right-8 z-50">
        <NavLink
          to="/dashboard/chat"
          className="flex items-center space-x-3 bg-primary hover:bg-primary-container text-white px-6 py-4 rounded-2xl shadow-[0_20px_50px_rgba(0,97,148,0.3)] transition-all group active:scale-95"
        >
          <span className="material-symbols-outlined group-hover:rotate-12 transition-transform">psychology</span>
          <span className="font-bold text-sm">{T('nav', 'askDhanSathi', lang)}</span>
        </NavLink>
      </div>
    </div>
  );
}
