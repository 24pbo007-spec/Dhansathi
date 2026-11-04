import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { getPlanConfigs, savePlanConfigs, DEFAULT_PLAN_CONFIGS, type PlanConfig } from '@/stores/subscriptionStore';

// ── Types ───────────────────────────────────────────────────────────────────

interface FeatureFlag {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
  icon: string;
}

interface ApiKeyConfig {
  id: string;
  label: string;
  envKey: string;
  icon: string;
}

interface NotificationSetting {
  label: string;
  description: string;
  enabled: boolean;
}

// ── Config ──────────────────────────────────────────────────────────────────

const API_KEY_DEFS: ApiKeyConfig[] = [
  { id: 'supabase_url', label: 'Supabase URL', envKey: 'VITE_SUPABASE_URL', icon: 'database' },
  { id: 'supabase_key', label: 'Supabase Anon Key', envKey: 'VITE_SUPABASE_ANON_KEY', icon: 'vpn_key' },
  { id: 'twelve_data', label: 'Twelve Data API Key', envKey: 'VITE_TWELVE_DATA_KEY', icon: 'trending_up' },
  { id: 'gemma', label: 'AI Model', envKey: 'GEMMA_AI_URL', icon: 'bolt' },
  { id: 'razorpay', label: 'Razorpay Key', envKey: 'VITE_RAZORPAY_KEY', icon: 'credit_card' },
];

const DEFAULT_FEATURE_FLAGS: FeatureFlag[] = [
  { id: 'dhanmitra', label: 'DhanMitra AI', description: 'AI-powered financial simulation engine', enabled: true, icon: 'psychology' },
  { id: 'screener', label: 'Stock Screener', description: 'Advanced stock screening and filtering', enabled: true, icon: 'trending_up' },
  { id: 'schemes', label: 'Scheme Matching', description: 'Government scheme eligibility matching', enabled: true, icon: 'account_balance' },
  { id: 'chat', label: 'Chat Assistant', description: 'AI chat for financial queries', enabled: true, icon: 'chat' },
  { id: 'alerts', label: 'Stock Alerts', description: 'Price alerts and notifications', enabled: true, icon: 'notifications' },
  { id: 'crossover', label: 'Crossover Alerts', description: 'EMA/SMA crossover detection', enabled: true, icon: 'compare_arrows' },
  { id: 'tax_calc', label: 'Tax Calculator', description: 'Income tax calculation tool', enabled: true, icon: 'calculate' },
  { id: 'budget', label: 'Budget Analyzer', description: 'Monthly budget analysis tool', enabled: true, icon: 'pie_chart' },
];

const DEFAULT_NOTIFICATIONS: NotificationSetting[] = [
  { label: 'New User Signup', description: 'Notify when a new user registers', enabled: true },
  { label: 'Payment Failed', description: 'Alert when a payment attempt fails', enabled: true },
  { label: 'Plan Upgrade', description: 'Notify when a user upgrades their plan', enabled: true },
  { label: 'System Errors', description: 'Alert on critical system errors', enabled: true },
  { label: 'Daily Digest', description: 'Daily summary of key metrics', enabled: false },
  { label: 'Weekly Report', description: 'Weekly analytics report email', enabled: true },
];

const refreshSchedule = [
  { id: 'stocks', label: 'Stock Data', interval: 'Every 5 minutes', icon: 'trending_up' },
  { id: 'schemes', label: 'Scheme Data', interval: 'Every 24 hours', icon: 'account_balance' },
  { id: 'news', label: 'Financial News', interval: 'Every 30 minutes', icon: 'newspaper' },
  { id: 'analytics', label: 'User Analytics', interval: 'Every 1 hour', icon: 'analytics' },
];

const emailTemplates = [
  { id: 'welcome', label: 'Welcome Email', lastEdited: '2026-03-10', status: 'active' },
  { id: 'upgrade', label: 'Plan Upgrade', lastEdited: '2026-03-08', status: 'active' },
  { id: 'payment_failed', label: 'Payment Failed', lastEdited: '2026-02-28', status: 'active' },
  { id: 'weekly_digest', label: 'Weekly Digest', lastEdited: '2026-03-15', status: 'active' },
  { id: 'scheme_alert', label: 'New Scheme Alert', lastEdited: '2026-03-01', status: 'draft' },
  { id: 'suspension', label: 'Account Suspension', lastEdited: '2026-02-20', status: 'active' },
];

const STORAGE_KEYS = {
  featureFlags: 'dhansathi_admin_feature_flags',
  notifications: 'dhansathi_admin_notifications',
  maintenance: 'dhansathi_admin_maintenance',
};

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
}

function saveToStorage<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getEnvValue(envKey: string): string {
  if (envKey === 'GEMMA_AI_URL') {
    return 'Self-hosted Gemma 4 E4B (server-side, no key needed)';
  }

  const val = {
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
    VITE_TWELVE_DATA_KEY: import.meta.env.VITE_TWELVE_DATA_KEY,
    VITE_RAZORPAY_KEY: import.meta.env.VITE_RAZORPAY_KEY,
  }[envKey] || '';
  return val || '(not configured)';
}

function maskValue(val: string): string {
  if (val === '(not configured)') return val;
  if (val.length <= 10) return '•'.repeat(val.length);
  return val.slice(0, 6) + '•'.repeat(Math.min(val.length - 10, 20)) + val.slice(-4);
}

// ── Component ───────────────────────────────────────────────────────────────

export default function AdminSettings() {
  const [featureFlags, setFeatureFlags] = useState<FeatureFlag[]>(() =>
    loadFromStorage(STORAGE_KEYS.featureFlags, DEFAULT_FEATURE_FLAGS)
  );
  const [notifications, setNotifications] = useState<NotificationSetting[]>(() =>
    loadFromStorage(STORAGE_KEYS.notifications, DEFAULT_NOTIFICATIONS)
  );
  const [maintenanceMode, setMaintenanceMode] = useState<boolean>(() =>
    loadFromStorage(STORAGE_KEYS.maintenance, false)
  );
  const [showKeys, setShowKeys] = useState<Set<string>>(new Set());
  const [activeSection, setActiveSection] = useState('plans');
  const [lastRefresh, setLastRefresh] = useState<Record<string, string>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Plan management state
  const [planConfigs, setPlanConfigs] = useState<PlanConfig[]>(() => getPlanConfigs());
  const [editingPlan, setEditingPlan] = useState<string | null>(null);
  const [planSaveStatus, setPlanSaveStatus] = useState<string | null>(null);
  const [newFeatureText, setNewFeatureText] = useState('');

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Persist feature flags
  useEffect(() => {
    saveToStorage(STORAGE_KEYS.featureFlags, featureFlags);
  }, [featureFlags]);

  // Persist notifications
  useEffect(() => {
    saveToStorage(STORAGE_KEYS.notifications, notifications);
  }, [notifications]);

  // Persist maintenance mode
  useEffect(() => {
    saveToStorage(STORAGE_KEYS.maintenance, maintenanceMode);
  }, [maintenanceMode]);

  const toggleFeature = useCallback((id: string) => {
    setFeatureFlags((prev) => prev.map((f) => (f.id === id ? { ...f, enabled: !f.enabled } : f)));
  }, []);

  const toggleShowKey = useCallback((id: string) => {
    setShowKeys((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleNotification = useCallback((index: number) => {
    setNotifications((prev) => prev.map((n, i) => (i === index ? { ...n, enabled: !n.enabled } : n)));
  }, []);

  const handleCopyKey = useCallback((id: string, envKey: string) => {
    const val = getEnvValue(envKey);
    if (val !== '(not configured)' && val !== 'Configured on Vercel server') {
      navigator.clipboard.writeText(val).then(() => {
        setCopiedKey(id);
        setTimeout(() => setCopiedKey(null), 1500);
      });
    }
  }, []);

  const handleRefreshNow = useCallback((jobId: string) => {
    setLastRefresh((prev) => ({ ...prev, [jobId]: 'Just now' }));
  }, []);

  // ── Plan management handlers ──────────────────────────────────────────────

  const updatePlanField = (
    planId: string,
    field: 'name' | 'tagline' | 'monthlyPrice' | 'yearlyPrice',
    value: string | number,
  ) => {
    setPlanConfigs((prev) =>
      prev.map((p) => (p.id === planId ? { ...p, [field]: value } : p))
    );
  };

  const addDisplayFeature = (planId: string) => {
    if (!newFeatureText.trim()) return;
    setPlanConfigs((prev) =>
      prev.map((p) =>
        p.id === planId
          ? { ...p, displayFeatures: [...p.displayFeatures, { text: newFeatureText.trim(), enabled: true }] }
          : p
      )
    );
    setNewFeatureText('');
  };

  const removeDisplayFeature = (planId: string, index: number) => {
    setPlanConfigs((prev) =>
      prev.map((p) =>
        p.id === planId
          ? { ...p, displayFeatures: p.displayFeatures.filter((_, i) => i !== index) }
          : p
      )
    );
  };

  const toggleDisplayFeature = (planId: string, index: number) => {
    setPlanConfigs((prev) =>
      prev.map((p) =>
        p.id === planId
          ? {
            ...p,
            displayFeatures: p.displayFeatures.map((f, i) =>
              i === index ? { ...f, enabled: !f.enabled } : f
            ),
          }
          : p
      )
    );
  };

  const savePlans = () => {
    savePlanConfigs(planConfigs);
    setPlanSaveStatus('saved');
    setEditingPlan(null);
    setTimeout(() => setPlanSaveStatus(null), 2000);
  };

  const resetPlans = () => {
    setPlanConfigs([...DEFAULT_PLAN_CONFIGS]);
    savePlanConfigs(DEFAULT_PLAN_CONFIGS);
    setPlanSaveStatus('reset');
    setEditingPlan(null);
    setTimeout(() => setPlanSaveStatus(null), 2000);
  };

  // ── Password change handler ───────────────────────────────────────────────

  const handlePasswordChange = async () => {
    setPasswordMessage(null);

    if (!newPassword || !confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'Please fill in all fields.' });
      return;
    }
    if (newPassword.length < 6) {
      setPasswordMessage({ type: 'error', text: 'Password must be at least 6 characters.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'New passwords do not match.' });
      return;
    }

    setPasswordLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        setPasswordMessage({ type: 'error', text: error.message });
      } else {
        setPasswordMessage({ type: 'success', text: 'Password updated successfully!' });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update password.';
      setPasswordMessage({ type: 'error', text: message });
    } finally {
      setPasswordLoading(false);
    }
  };

  const sections = [
    { id: 'plans', label: 'Plans', icon: 'payments' },
    { id: 'security', label: 'Security', icon: 'lock' },
    { id: 'api-keys', label: 'API Keys', icon: 'vpn_key' },
    { id: 'features', label: 'Feature Flags', icon: 'toggle_on' },
    { id: 'maintenance', label: 'Maintenance', icon: 'engineering' },
    { id: 'emails', label: 'Email Templates', icon: 'mail' },
    { id: 'notifications', label: 'Notifications', icon: 'notifications' },
    { id: 'data', label: 'Data Refresh', icon: 'sync' },
    { id: 'system', label: 'System Info', icon: 'info' },
  ];

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      {/* Header */}
      <motion.div variants={fadeUp}>
        <h1 className="text-2xl md:text-3xl font-headline font-bold text-on-surface">System Settings</h1>
        <p className="text-on-surface-variant mt-1">Configure system behavior, integrations, and features</p>
      </motion.div>

      <motion.div variants={fadeUp} className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar nav */}
        <div className="bg-white rounded-2xl p-4 shadow-ambient h-fit">
          <nav className="space-y-1">
            {sections.map((s) => (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                className={cn(
                  'w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-left transition-colors text-sm',
                  activeSection === s.id
                    ? 'bg-primary/10 text-primary font-semibold'
                    : 'text-on-surface-variant hover:bg-gray-50',
                )}
              >
                <span className="material-symbols-outlined text-[20px]">{s.icon}</span>
                <span>{s.label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Content area */}
        <div className="lg:col-span-3 space-y-6">

          {/* ── Plans Management ── */}
          {activeSection === 'plans' && (
            <motion.div key="plans" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
              <div className="bg-white rounded-2xl p-6 shadow-ambient">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center space-x-2">
                    <span className="material-symbols-outlined text-primary text-[22px]">payments</span>
                    <h2 className="font-headline font-bold text-on-surface">Plan Management</h2>
                  </div>
                  <div className="flex items-center space-x-2">
                    {planSaveStatus && (
                      <span className={cn(
                        'text-xs font-semibold px-3 py-1 rounded-lg',
                        planSaveStatus === 'saved' ? 'bg-tertiary/10 text-tertiary' : 'bg-saffron/10 text-saffron',
                      )}>
                        {planSaveStatus === 'saved' ? '✓ Saved' : '↺ Reset to defaults'}
                      </span>
                    )}
                    <button
                      onClick={resetPlans}
                      className="px-3 py-2 rounded-xl text-sm font-medium text-on-surface-variant hover:bg-gray-100 transition-colors"
                    >
                      Reset Defaults
                    </button>
                    <button
                      onClick={savePlans}
                      className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-container transition-colors"
                    >
                      Save All Plans
                    </button>
                  </div>
                </div>

                <div className="space-y-4">
                  {planConfigs.map((plan) => {
                    const isEditing = editingPlan === plan.id;
                    return (
                      <div key={plan.id} className={cn(
                        'rounded-2xl border-2 transition-all',
                        isEditing ? 'border-primary/30 bg-primary/5' : 'border-outline-variant/20 bg-gray-50',
                      )}>
                        {/* Plan header */}
                        <div
                          className="flex items-center justify-between p-4 cursor-pointer"
                          onClick={() => setEditingPlan(isEditing ? null : plan.id)}
                        >
                          <div className="flex items-center space-x-3">
                            <div className={cn(
                              'w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm',
                              plan.id === 'free' ? 'bg-gray-200 text-gray-600' :
                                plan.id === 'pro' ? 'bg-primary/10 text-primary' :
                                  'bg-secondary/10 text-secondary',
                            )}>
                              {plan.name.charAt(0)}
                            </div>
                            <div>
                              <p className="font-semibold text-on-surface">{plan.name}</p>
                              <p className="text-xs text-on-surface-variant">
                                ₹{plan.monthlyPrice}/mo · ₹{plan.yearlyPrice}/yr · {plan.displayFeatures.length} features
                              </p>
                            </div>
                          </div>
                          <span className="material-symbols-outlined text-on-surface-variant">
                            {isEditing ? 'expand_less' : 'expand_more'}
                          </span>
                        </div>

                        {/* Expanded edit form */}
                        {isEditing && (
                          <div className="px-4 pb-4 space-y-4">
                            <div className="h-px bg-outline-variant/20" />

                            {/* Name & Tagline */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <label className="text-xs font-semibold text-on-surface-variant mb-1 block">Plan Name</label>
                                <input
                                  type="text"
                                  value={plan.name}
                                  onChange={(e) => updatePlanField(plan.id, 'name', e.target.value)}
                                  className="w-full px-3 py-2 rounded-xl bg-white border border-outline-variant/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                                />
                              </div>
                              <div>
                                <label className="text-xs font-semibold text-on-surface-variant mb-1 block">Tagline</label>
                                <input
                                  type="text"
                                  value={plan.tagline}
                                  onChange={(e) => updatePlanField(plan.id, 'tagline', e.target.value)}
                                  className="w-full px-3 py-2 rounded-xl bg-white border border-outline-variant/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                                />
                              </div>
                            </div>

                            {/* Pricing */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <label className="text-xs font-semibold text-on-surface-variant mb-1 block">Monthly Price (₹)</label>
                                <input
                                  type="number"
                                  min="0"
                                  value={plan.monthlyPrice}
                                  onChange={(e) => updatePlanField(plan.id, 'monthlyPrice', Number(e.target.value))}
                                  className="w-full px-3 py-2 rounded-xl bg-white border border-outline-variant/30 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
                                />
                              </div>
                              <div>
                                <label className="text-xs font-semibold text-on-surface-variant mb-1 block">Yearly Price (₹)</label>
                                <input
                                  type="number"
                                  min="0"
                                  value={plan.yearlyPrice}
                                  onChange={(e) => updatePlanField(plan.id, 'yearlyPrice', Number(e.target.value))}
                                  className="w-full px-3 py-2 rounded-xl bg-white border border-outline-variant/30 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
                                />
                              </div>
                            </div>

                            {/* Display Features */}
                            <div>
                              <label className="text-xs font-semibold text-on-surface-variant mb-2 block">
                                Display Features ({plan.displayFeatures.length})
                              </label>
                              <div className="space-y-2">
                                {plan.displayFeatures.map((feat, idx) => (
                                  <div key={idx} className="flex items-center space-x-2 bg-white rounded-xl px-3 py-2">
                                    <button
                                      onClick={() => toggleDisplayFeature(plan.id, idx)}
                                      className={cn(
                                        'w-5 h-5 rounded-md flex items-center justify-center text-xs transition-colors',
                                        feat.enabled ? 'bg-tertiary text-white' : 'bg-gray-200 text-gray-400',
                                      )}
                                    >
                                      ✓
                                    </button>
                                    <span className={cn(
                                      'flex-1 text-sm',
                                      feat.enabled ? 'text-on-surface' : 'text-on-surface-variant line-through',
                                    )}>
                                      {feat.text}
                                    </span>
                                    <button
                                      onClick={() => removeDisplayFeature(plan.id, idx)}
                                      className="p-1 rounded-lg hover:bg-error/10 text-error/60 hover:text-error transition-colors"
                                    >
                                      <span className="material-symbols-outlined text-[16px]">close</span>
                                    </button>
                                  </div>
                                ))}
                              </div>
                              <div className="flex items-center space-x-2 mt-2">
                                <input
                                  type="text"
                                  value={newFeatureText}
                                  onChange={(e) => setNewFeatureText(e.target.value)}
                                  onKeyDown={(e) => e.key === 'Enter' && addDisplayFeature(plan.id)}
                                  placeholder="Add new feature..."
                                  className="flex-1 px-3 py-2 rounded-xl bg-white border border-outline-variant/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                                />
                                <button
                                  onClick={() => addDisplayFeature(plan.id)}
                                  className="px-3 py-2 rounded-xl bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors"
                                >
                                  Add
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Security / Password Change ── */}
          {activeSection === 'security' && (
            <motion.div key="security" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
              <div className="bg-white rounded-2xl p-6 shadow-ambient">
                <div className="flex items-center space-x-2 mb-6">
                  <span className="material-symbols-outlined text-primary text-[22px]">lock</span>
                  <h2 className="font-headline font-bold text-on-surface">Change Admin Password</h2>
                </div>

                {passwordMessage && (
                  <div className={cn(
                    'mb-4 p-4 rounded-xl flex items-center space-x-3',
                    passwordMessage.type === 'success' ? 'bg-tertiary/10' : 'bg-error/10',
                  )}>
                    <span className={cn(
                      'material-symbols-outlined text-[20px]',
                      passwordMessage.type === 'success' ? 'text-tertiary' : 'text-error',
                    )}>
                      {passwordMessage.type === 'success' ? 'check_circle' : 'error'}
                    </span>
                    <p className={cn(
                      'text-sm font-semibold',
                      passwordMessage.type === 'success' ? 'text-tertiary' : 'text-error',
                    )}>
                      {passwordMessage.text}
                    </p>
                  </div>
                )}

                <div className="space-y-4 max-w-md">
                  <div>
                    <label className="text-xs font-semibold text-on-surface-variant mb-1 block">Current Password</label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter current password"
                      className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-outline-variant/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-on-surface-variant mb-1 block">New Password</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password (min 6 characters)"
                      className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-outline-variant/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-on-surface-variant mb-1 block">Confirm New Password</label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm new password"
                      onKeyDown={(e) => e.key === 'Enter' && handlePasswordChange()}
                      className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-outline-variant/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <button
                    onClick={handlePasswordChange}
                    disabled={passwordLoading}
                    className={cn(
                      'w-full py-3 rounded-xl font-bold text-sm transition-all',
                      passwordLoading
                        ? 'bg-gray-200 text-gray-400 cursor-wait'
                        : 'bg-primary text-white hover:bg-primary-container',
                    )}
                  >
                    {passwordLoading ? (
                      <span className="flex items-center justify-center space-x-2">
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Updating...</span>
                      </span>
                    ) : (
                      'Update Password'
                    )}
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-2xl p-6 shadow-ambient">
                <div className="flex items-center space-x-2 mb-4">
                  <span className="material-symbols-outlined text-on-surface-variant text-[22px]">shield</span>
                  <h2 className="font-headline font-bold text-on-surface">Security Info</h2>
                </div>
                <div className="space-y-3">
                  {[
                    { label: 'Auth Provider', value: 'Supabase Auth' },
                    { label: 'Password Hashing', value: 'bcrypt (server-side)' },
                    { label: 'Session Management', value: 'JWT tokens with auto-refresh' },
                    { label: 'Admin Verification', value: 'admin_users table + is_admin() function' },
                  ].map((info) => (
                    <div key={info.label} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <span className="text-sm text-on-surface-variant">{info.label}</span>
                      <span className="text-sm font-mono font-semibold text-on-surface">{info.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* ── API Keys ── */}
          {activeSection === 'api-keys' && (
            <motion.div key="api-keys" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="bg-white rounded-2xl p-6 shadow-ambient">
              <div className="flex items-center space-x-2 mb-2">
                <span className="material-symbols-outlined text-primary text-[22px]">vpn_key</span>
                <h2 className="font-headline font-bold text-on-surface">API Keys & Secrets</h2>
              </div>
              <p className="text-xs text-on-surface-variant mb-6">
                These values are read from your <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">.env.local</code> file. To change them, edit the file and restart the dev server.
              </p>
              <div className="space-y-4">
                {API_KEY_DEFS.map((key) => {
                  const val = getEnvValue(key.envKey);
                  const isConfigured = val !== '(not configured)';
                  return (
                    <div key={key.id} className="p-4 rounded-2xl bg-gray-50 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <span className="material-symbols-outlined text-on-surface-variant text-[18px]">{key.icon}</span>
                          <label className="text-sm font-semibold text-on-surface">{key.label}</label>
                        </div>
                        <span className={cn(
                          'px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase',
                          isConfigured ? 'bg-tertiary/10 text-tertiary' : 'bg-saffron/10 text-saffron',
                        )}>
                          {isConfigured ? 'Configured' : 'Missing'}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="flex-1 px-4 py-2.5 rounded-xl bg-white text-sm font-mono text-on-surface select-none overflow-hidden text-ellipsis whitespace-nowrap">
                          {showKeys.has(key.id) ? val : maskValue(val)}
                        </div>
                        <button
                          onClick={() => toggleShowKey(key.id)}
                          className="p-2 rounded-xl hover:bg-gray-200 text-on-surface-variant transition-colors"
                          title={showKeys.has(key.id) ? 'Hide' : 'Show'}
                        >
                          <span className="material-symbols-outlined text-[20px]">
                            {showKeys.has(key.id) ? 'visibility_off' : 'visibility'}
                          </span>
                        </button>
                        <button
                          onClick={() => handleCopyKey(key.id, key.envKey)}
                          className="p-2 rounded-xl hover:bg-gray-200 text-on-surface-variant transition-colors"
                          title="Copy"
                        >
                          <span className="material-symbols-outlined text-[20px]">
                            {copiedKey === key.id ? 'check' : 'content_copy'}
                          </span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* ── Feature Flags ── */}
          {activeSection === 'features' && (
            <motion.div key="features" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="bg-white rounded-2xl p-6 shadow-ambient">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-2">
                  <span className="material-symbols-outlined text-primary text-[22px]">toggle_on</span>
                  <h2 className="font-headline font-bold text-on-surface">Feature Flags</h2>
                </div>
                <span className="text-xs text-on-surface-variant">Changes auto-save</span>
              </div>
              <div className="space-y-3">
                {featureFlags.map((flag) => (
                  <div key={flag.id} className="flex items-center justify-between p-4 rounded-2xl bg-gray-50">
                    <div className="flex items-center space-x-3">
                      <span className="material-symbols-outlined text-on-surface-variant text-[22px]">{flag.icon}</span>
                      <div>
                        <p className="text-sm font-semibold text-on-surface">{flag.label}</p>
                        <p className="text-xs text-on-surface-variant">{flag.description}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => toggleFeature(flag.id)}
                      className={cn(
                        'relative w-12 h-6 rounded-full transition-colors',
                        flag.enabled ? 'bg-tertiary' : 'bg-gray-300',
                      )}
                    >
                      <span className={cn(
                        'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform',
                        flag.enabled ? 'translate-x-6' : 'translate-x-0.5',
                      )} />
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* ── Maintenance ── */}
          {activeSection === 'maintenance' && (
            <motion.div key="maintenance" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
              <div className={cn('rounded-2xl p-6 shadow-ambient', maintenanceMode ? 'bg-error/5' : 'bg-white')}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <span className={cn('material-symbols-outlined text-[28px]', maintenanceMode ? 'text-error' : 'text-on-surface-variant')}>
                      engineering
                    </span>
                    <div>
                      <h2 className="font-headline font-bold text-on-surface">Maintenance Mode</h2>
                      <p className="text-sm text-on-surface-variant mt-1">
                        {maintenanceMode
                          ? 'Application is currently in maintenance mode. Users cannot access the app.'
                          : 'Enable to put the application into maintenance mode.'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setMaintenanceMode(!maintenanceMode)}
                    className={cn('relative w-14 h-7 rounded-full transition-colors', maintenanceMode ? 'bg-error' : 'bg-gray-300')}
                  >
                    <span className={cn('absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform', maintenanceMode ? 'translate-x-7' : 'translate-x-0.5')} />
                  </button>
                </div>
                {maintenanceMode && (
                  <div className="mt-4 p-4 rounded-xl bg-error/10 flex items-center space-x-3">
                    <span className="material-symbols-outlined text-error text-[20px]">warning</span>
                    <p className="text-sm font-semibold text-error">WARNING: The application is currently inaccessible to all non-admin users.</p>
                  </div>
                )}
              </div>
              <div className="bg-white rounded-2xl p-6 shadow-ambient">
                <h3 className="font-headline font-bold text-error mb-4">Danger Zone</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-4 rounded-2xl bg-error/5">
                    <div>
                      <p className="text-sm font-semibold text-on-surface">Clear Cache</p>
                      <p className="text-xs text-on-surface-variant">Purge all cached data and rebuild indexes</p>
                    </div>
                    <button
                      onClick={() => { localStorage.clear(); window.location.reload(); }}
                      className="px-4 py-2 rounded-xl bg-error/10 text-error text-sm font-medium hover:bg-error/20 transition-colors"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Email Templates ── */}
          {activeSection === 'emails' && (
            <motion.div key="emails" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="bg-white rounded-2xl p-6 shadow-ambient">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-2">
                  <span className="material-symbols-outlined text-primary text-[22px]">mail</span>
                  <h2 className="font-headline font-bold text-on-surface">Email Templates</h2>
                </div>
                <button className="inline-flex items-center space-x-1 px-3 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-container transition-colors">
                  <span className="material-symbols-outlined text-[18px]">add</span>
                  <span>New Template</span>
                </button>
              </div>
              <div className="space-y-3">
                {emailTemplates.map((tmpl) => (
                  <div key={tmpl.id} className="flex items-center justify-between p-4 rounded-2xl bg-gray-50">
                    <div className="flex items-center space-x-3">
                      <span className="material-symbols-outlined text-on-surface-variant text-[20px]">description</span>
                      <div>
                        <p className="text-sm font-semibold text-on-surface">{tmpl.label}</p>
                        <p className="text-xs text-on-surface-variant">Last edited: {tmpl.lastEdited}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className={cn(
                        'px-2 py-0.5 rounded-lg text-xs font-semibold',
                        tmpl.status === 'active' ? 'bg-tertiary/10 text-tertiary' : 'bg-saffron/10 text-saffron',
                      )}>
                        {tmpl.status === 'active' ? 'Active' : 'Draft'}
                      </span>
                      <button className="p-1.5 rounded-lg hover:bg-gray-200 text-on-surface-variant transition-colors">
                        <span className="material-symbols-outlined text-[18px]">edit</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* ── Notifications ── */}
          {activeSection === 'notifications' && (
            <motion.div key="notifications" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="bg-white rounded-2xl p-6 shadow-ambient">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-2">
                  <span className="material-symbols-outlined text-primary text-[22px]">notifications</span>
                  <h2 className="font-headline font-bold text-on-surface">Notification Settings</h2>
                </div>
                <span className="text-xs text-on-surface-variant">Changes auto-save</span>
              </div>
              <div className="space-y-4">
                {notifications.map((notif, index) => (
                  <div key={notif.label} className="flex items-center justify-between p-4 rounded-2xl bg-gray-50">
                    <div>
                      <p className="text-sm font-semibold text-on-surface">{notif.label}</p>
                      <p className="text-xs text-on-surface-variant">{notif.description}</p>
                    </div>
                    <button
                      onClick={() => toggleNotification(index)}
                      className={cn(
                        'relative w-11 h-6 rounded-full transition-colors cursor-pointer',
                        notif.enabled ? 'bg-tertiary' : 'bg-gray-300',
                      )}
                    >
                      <span className={cn(
                        'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform',
                        notif.enabled ? 'translate-x-5' : 'translate-x-0.5',
                      )} />
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* ── Data Refresh ── */}
          {activeSection === 'data' && (
            <motion.div key="data" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="bg-white rounded-2xl p-6 shadow-ambient">
              <div className="flex items-center space-x-2 mb-6">
                <span className="material-symbols-outlined text-primary text-[22px]">sync</span>
                <h2 className="font-headline font-bold text-on-surface">Data Refresh Schedule</h2>
              </div>
              <div className="space-y-3">
                {refreshSchedule.map((job) => (
                  <div key={job.id} className="flex items-center justify-between p-4 rounded-2xl bg-gray-50">
                    <div className="flex items-center space-x-3">
                      <span className="material-symbols-outlined text-on-surface-variant text-[20px]">{job.icon}</span>
                      <div>
                        <p className="text-sm font-semibold text-on-surface">{job.label}</p>
                        <p className="text-xs text-on-surface-variant">{job.interval}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className="text-xs font-mono text-on-surface-variant">
                        Last: {lastRefresh[job.id] || 'N/A'}
                      </span>
                      <button
                        onClick={() => handleRefreshNow(job.id)}
                        className="p-2 rounded-xl hover:bg-gray-200 text-primary transition-colors"
                        title="Run now"
                      >
                        <span className="material-symbols-outlined text-[20px]">play_arrow</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* ── System Info ── */}
          {activeSection === 'system' && (
            <motion.div key="system" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="bg-white rounded-2xl p-6 shadow-ambient">
              <div className="flex items-center space-x-2 mb-6">
                <span className="material-symbols-outlined text-primary text-[22px]">info</span>
                <h2 className="font-headline font-bold text-on-surface">System Information</h2>
              </div>
              <div className="space-y-4">
                {[
                  { label: 'App Version', value: 'v2.1.0' },
                  { label: 'Environment', value: import.meta.env.MODE || 'development' },
                  { label: 'Supabase Project', value: (import.meta.env.VITE_SUPABASE_URL || '').replace('https://', '').replace('.supabase.co', '') || 'N/A' },
                  { label: 'Build Tool', value: 'Vite 8.x' },
                  { label: 'Framework', value: 'React 19 + TypeScript' },
                  { label: 'Database', value: 'Supabase PostgreSQL' },
                  { label: 'AI Provider', value: import.meta.env.VITE_POLLINATION_API_KEY ? 'Pollination AI ✓' : 'Not configured' },
                  { label: 'Stock Data', value: import.meta.env.VITE_TWELVE_DATA_KEY ? 'Twelve Data ✓' : 'Not configured' },
                  { label: 'Payments', value: import.meta.env.VITE_RAZORPAY_KEY ? 'Razorpay ✓' : 'Not configured' },
                  { label: 'Feature Flags Active', value: `${featureFlags.filter(f => f.enabled).length}/${featureFlags.length}` },
                  { label: 'Maintenance Mode', value: maintenanceMode ? '🔴 ON' : '🟢 OFF' },
                ].map((info) => (
                  <div key={info.label} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <span className="text-sm text-on-surface-variant">{info.label}</span>
                    <span className="text-sm font-mono font-semibold text-on-surface">{info.value}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
