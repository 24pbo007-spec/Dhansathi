import { useState } from 'react';
import { Navigate, Outlet, NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface AdminNavItem {
  label: string;
  icon: string;
  path: string;
  badge?: number;
}

const ADMIN_NAV: AdminNavItem[] = [
  { label: 'Overview', icon: 'space_dashboard', path: '/admin' },
  { label: 'Users', icon: 'group', path: '/admin/users' },
  { label: 'Schemes', icon: 'account_balance', path: '/admin/schemes' },
  { label: 'Stocks', icon: 'trending_up', path: '/admin/stocks' },
  { label: 'Revenue', icon: 'payments', path: '/admin/revenue' },
  { label: 'Simulations', icon: 'psychology', path: '/admin/simulations' },
  { label: 'Query Center', icon: 'support_agent', path: '/admin/queries' },
  { label: 'Content', icon: 'edit_note', path: '/admin/content' },
  { label: 'Settings', icon: 'manufacturing', path: '/admin/settings' },
];

function getBreadcrumbs(pathname: string): { label: string; path: string }[] {
  const crumbs: { label: string; path: string }[] = [
    { label: 'Admin', path: '/admin' },
  ];
  const segments = pathname.replace('/admin', '').split('/').filter(Boolean);
  if (segments.length > 0) {
    const item = ADMIN_NAV.find((n) => n.path === pathname);
    crumbs.push({
      label: item?.label ?? segments[0].charAt(0).toUpperCase() + segments[0].slice(1),
      path: pathname,
    });
  }
  return crumbs;
}

export default function AdminLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const location = useLocation();
  const breadcrumbs = getBreadcrumbs(location.pathname);

  // Client-side gate: without an admin session, bounce to the login page.
  // This is defence-in-depth only — the real protection is Supabase
  // row-level security (the admin_users table + is_admin()), which returns no
  // data to a non-admin even if they reach these screens.
  const isAdminSession =
    typeof window !== 'undefined' && sessionStorage.getItem('dhansathi_admin') === 'true';
  if (!isAdminSession) {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  }

  const isActive = (path: string) => {
    if (path === '/admin') return location.pathname === '/admin';
    return location.pathname.startsWith(path);
  };

  const sidebarWidth = collapsed ? 'w-[72px]' : 'w-[260px]';

  const mockNotifications = [
    { id: 1, text: '5 new users signed up today', time: '2m ago', icon: 'person_add' },
    { id: 2, text: 'Revenue milestone: 10L MRR', time: '1h ago', icon: 'celebration' },
    { id: 3, text: 'Failed payment for user #4521', time: '3h ago', icon: 'warning' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          'hidden md:flex fixed left-0 top-0 h-screen z-40 bg-gray-900 flex-col transition-all duration-300 ease-in-out',
          sidebarWidth,
        )}
      >
        {/* Tricolor accent bar */}
        <div className="tricolor-bar" />

        <div className="flex flex-col h-full">
          {/* Brand */}
          <div className={cn('flex items-center px-4 py-5', collapsed ? 'justify-center' : 'space-x-3')}>
            <div className="w-9 h-9 bg-gradient-to-br from-saffron via-white to-india-green rounded-xl flex items-center justify-center shadow-lg shrink-0">
              <span className="text-gray-900 font-black text-lg">D</span>
            </div>
            {!collapsed && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <h1 className="text-white font-headline font-bold text-lg leading-none">DhanSathi</h1>
                <span className="text-gray-400 text-[10px] font-semibold tracking-widest uppercase">Admin Panel</span>
              </motion.div>
            )}
          </div>

          {/* Collapse toggle */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="mx-3 mb-4 flex items-center justify-center py-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">
              {collapsed ? 'chevron_right' : 'chevron_left'}
            </span>
          </button>

          {/* Navigation */}
          <nav className="flex-grow px-3 space-y-1 overflow-y-auto">
            {ADMIN_NAV.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/admin'}
                className={cn(
                  'flex items-center rounded-xl transition-all group relative',
                  collapsed ? 'justify-center px-2 py-3' : 'px-3 py-2.5 space-x-3',
                  isActive(item.path)
                    ? 'bg-primary text-white font-semibold shadow-lg shadow-primary/30'
                    : 'text-gray-400 hover:bg-white/5 hover:text-white',
                )}
              >
                <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                {!collapsed && <span className="text-sm">{item.label}</span>}
                {item.badge && !collapsed && (
                  <span className="ml-auto text-[10px] font-bold bg-error text-white px-1.5 py-0.5 rounded-md">
                    {item.badge}
                  </span>
                )}
                {/* Tooltip for collapsed state */}
                {collapsed && (
                  <div className="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
                    {item.label}
                  </div>
                )}
              </NavLink>
            ))}
          </nav>

          {/* Footer */}
          <div className="p-3 mt-auto border-t border-white/10">
            <NavLink
              to="/"
              className={cn(
                'flex items-center rounded-xl py-2.5 text-gray-400 hover:bg-white/5 hover:text-white transition-colors',
                collapsed ? 'justify-center px-2' : 'px-3 space-x-3',
              )}
            >
              <span className="material-symbols-outlined text-[20px]">arrow_back</span>
              {!collapsed && <span className="text-sm">Back to App</span>}
            </NavLink>

            {!collapsed && (
              <div className="mt-3 bg-white/5 rounded-2xl p-3 flex items-center space-x-3">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-primary-container flex items-center justify-center text-white font-bold text-sm shrink-0">
                  A
                </div>
                <div className="overflow-hidden">
                  <p className="text-white font-bold text-sm truncate">Admin</p>
                  <p className="text-saffron text-[10px] font-extrabold uppercase tracking-wider">Super Admin</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile header */}
      <header className="md:hidden fixed top-0 w-full z-50 bg-gray-900 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-gradient-to-br from-saffron via-white to-india-green rounded-lg flex items-center justify-center">
            <span className="text-gray-900 font-black text-sm">D</span>
          </div>
          <span className="font-bold text-white text-lg font-headline">Admin</span>
        </div>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="p-2 rounded-xl text-gray-300 hover:bg-white/10 transition-colors"
        >
          <span className="material-symbols-outlined">{mobileOpen ? 'close' : 'menu'}</span>
        </button>
      </header>

      {/* Mobile overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          >
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', damping: 25 }}
              className="absolute left-0 top-0 h-full w-[260px] bg-gray-900 p-4 space-y-2"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center space-x-3 mb-6 px-2 pt-2">
                <div className="w-9 h-9 bg-gradient-to-br from-saffron via-white to-india-green rounded-xl flex items-center justify-center">
                  <span className="text-gray-900 font-black text-lg">D</span>
                </div>
                <div>
                  <h1 className="text-white font-headline font-bold text-lg">DhanSathi</h1>
                  <span className="text-gray-400 text-[10px] font-semibold tracking-widest uppercase">Admin</span>
                </div>
              </div>
              {ADMIN_NAV.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/admin'}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'flex items-center space-x-3 px-3 py-3 rounded-xl transition-all',
                    isActive(item.path)
                      ? 'bg-primary text-white font-semibold'
                      : 'text-gray-400 hover:bg-white/5 hover:text-white',
                  )}
                >
                  <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                  <span className="text-sm">{item.label}</span>
                </NavLink>
              ))}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top bar */}
      <header
        className={cn(
          'hidden md:flex fixed top-0 right-0 z-30 h-16 items-center justify-between px-8 bg-white/80 backdrop-blur-xl border-b border-gray-100 transition-all duration-300',
          collapsed ? 'left-[72px]' : 'left-[260px]',
        )}
      >
        {/* Breadcrumbs */}
        <nav className="flex items-center space-x-2 text-sm">
          {breadcrumbs.map((crumb, i) => (
            <div key={crumb.path} className="flex items-center space-x-2">
              {i > 0 && <span className="text-gray-300">/</span>}
              <NavLink
                to={crumb.path}
                className={cn(
                  'transition-colors',
                  i === breadcrumbs.length - 1
                    ? 'text-on-surface font-semibold'
                    : 'text-gray-400 hover:text-primary',
                )}
              >
                {crumb.label}
              </NavLink>
            </div>
          ))}
        </nav>

        {/* Right actions */}
        <div className="flex items-center space-x-3">
          {/* Quick Actions */}
          <NavLink
            to="/admin/users"
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-primary/5 text-primary text-sm font-medium hover:bg-primary/10 transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">person_add</span>
            <span>Add User</span>
          </NavLink>

          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => setNotificationsOpen(!notificationsOpen)}
              className="relative p-2 rounded-xl hover:bg-gray-100 transition-colors"
            >
              <span className="material-symbols-outlined text-gray-600">notifications</span>
              <span className="absolute top-1 right-1 w-2 h-2 bg-error rounded-full" />
            </button>

            <AnimatePresence>
              {notificationsOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="absolute right-0 top-12 w-80 bg-white rounded-2xl shadow-2xl shadow-black/10 p-4 z-50"
                >
                  <h3 className="font-headline font-bold text-sm text-on-surface mb-3">Notifications</h3>
                  <div className="space-y-3">
                    {mockNotifications.map((n) => (
                      <div key={n.id} className="flex items-start space-x-3 p-2 rounded-xl hover:bg-gray-50 transition-colors">
                        <span className="material-symbols-outlined text-primary text-[20px] mt-0.5">{n.icon}</span>
                        <div>
                          <p className="text-sm text-on-surface">{n.text}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{n.time}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Admin avatar */}
          <div className="flex items-center space-x-2 pl-3 border-l border-gray-200">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary-container flex items-center justify-center text-white font-bold text-xs">
              A
            </div>
            <div className="hidden lg:block">
              <p className="text-sm font-semibold text-on-surface leading-none">Admin</p>
              <p className="text-[10px] text-gray-400 mt-0.5">Super Admin</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main
        className={cn(
          'min-h-screen transition-all duration-300 pt-16 md:pt-16',
          collapsed ? 'md:ml-[72px]' : 'md:ml-[260px]',
        )}
      >
        <div className="p-4 md:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
