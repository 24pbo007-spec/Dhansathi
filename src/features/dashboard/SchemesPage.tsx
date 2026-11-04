import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { calculateSchemeMatches, calculateUnclaimedBenefits } from '@/lib/schemeService';
import { getPrimarySchemeCategory, loadLiveSchemeFeed, mergeSchemeFeeds, type LiveSchemeFeed } from '@/lib/liveSchemeFeed';
import { INDIA_STATES_AND_UTS, canonicalState, stateFromSlug, stateKey, stateToSlug } from '@/lib/indiaStates';
import { useAuthStore } from '@/stores/authStore';
import type { SchemeType, GovernmentScheme } from '@/types';
import { cn } from '@/lib/utils';
import { useLanguageStore } from '@/stores/languageStore';
import { T } from '@/lib/translations';
import { useApplicationStore } from '@/stores/useApplicationStore';
import { CustomSelect } from '@/components/shared/CustomSelect';
import { SchemeDetailModal } from '@/components/shared/SchemeDetailModal';

/* ─── Category styling ───────────────────────────────────────────────────── */

const CATEGORY_STYLE: Record<string, { icon: string; cls: string }> = {
  'Social welfare & Empowerment': { icon: 'diversity_3', cls: 'bg-secondary-fixed text-secondary' },
  'Education & Learning': { icon: 'school', cls: 'bg-primary-fixed text-primary' },
  'Agriculture,Rural & Environment': { icon: 'agriculture', cls: 'bg-india-green/10 text-india-green' },
  'Business & Entrepreneurship': { icon: 'storefront', cls: 'bg-tertiary-fixed text-tertiary' },
  'Women and Child': { icon: 'family_restroom', cls: 'bg-error-container text-error' },
  'Skills & Employment': { icon: 'engineering', cls: 'bg-saffron/15 text-saffron' },
  'Banking,Financial Services and Insurance': { icon: 'account_balance', cls: 'bg-primary-fixed text-primary' },
  'Health & Wellness': { icon: 'health_and_safety', cls: 'bg-secondary-fixed text-secondary' },
  'Sports & Culture': { icon: 'sports_cricket', cls: 'bg-tertiary-fixed text-tertiary' },
  'Housing & Shelter': { icon: 'home', cls: 'bg-saffron/15 text-saffron' },
  'Science, IT & Communications': { icon: 'memory', cls: 'bg-primary-fixed text-primary' },
  'Transport & Infrastructure': { icon: 'directions_bus', cls: 'bg-surface-variant text-on-surface-variant' },
  'Travel & Tourism': { icon: 'travel_explore', cls: 'bg-tertiary-fixed text-tertiary' },
  'Utility & Sanitation': { icon: 'water_drop', cls: 'bg-primary-fixed text-primary' },
  'Public Safety,Law & Justice': { icon: 'gavel', cls: 'bg-surface-variant text-on-surface-variant' },
};

function categoryStyle(category: string) {
  return CATEGORY_STYLE[category] ?? { icon: 'category', cls: 'bg-surface-container-high text-on-surface-variant' };
}

type FilterType = 'all' | SchemeType;

const FILTERS: { key: FilterType; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'central', label: 'Central' },
  { key: 'state', label: 'State' },
];

const PAGE_SIZE = 24;
const CLOSING_SOON_DAYS = 30;

function todayIso() {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

function daysUntil(isoDate: string) {
  return Math.ceil((new Date(`${isoDate}T23:59:59+05:30`).getTime() - Date.now()) / 86400000);
}

function formatDate(isoDate: string) {
  return new Date(`${isoDate}T00:00:00+05:30`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** True when a scheme is available to residents of the given state. */
function servesState(scheme: GovernmentScheme, state: string) {
  const key = stateKey(state);
  const states = scheme.eligibility_criteria?.states;
  if (!states || states.length === 0) return scheme.type === 'central' && !scheme.state;
  return states.some((s) => s === 'All' || stateKey(s) === key);
}

function matchesSearch(scheme: GovernmentScheme, words: string[]) {
  const haystack = [
    scheme.name,
    scheme.name_hi ?? '',
    scheme.short_title ?? '',
    scheme.description,
    scheme.ministry,
    scheme.benefits,
    scheme.state ?? '',
    ...(scheme.tags ?? []),
    ...(scheme.scheme_categories ?? []),
  ]
    .join(' ')
    .toLowerCase();
  return words.every((word) => haystack.includes(word));
}

/* ─── Component ──────────────────────────────────────────────────────────── */

export default function SchemesPage() {
  const lang = useLanguageStore((s) => s.lang);
  const profile = useAuthStore((s) => s.user);
  const trackApplication = useApplicationStore((s) => s.trackApplication);
  const applications = useApplicationStore((s) => s.applications);
  const navigate = useNavigate();
  const { stateParam } = useParams<{ stateParam?: string }>();

  const urlState = useMemo(() => stateFromSlug(stateParam), [stateParam]);

  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [activeState, setActiveState] = useState<string>(urlState ?? 'all');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [showClosed, setShowClosed] = useState(false);
  const [closingSoonOnly, setClosingSoonOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [liveFeed, setLiveFeed] = useState<LiveSchemeFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<GovernmentScheme | null>(null);

  useEffect(() => {
    setActiveState(urlState ?? 'all');
  }, [urlState]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [activeFilter, activeState, activeCategory, showClosed, closingSoonOnly, search]);

  useEffect(() => {
    let mounted = true;
    loadLiveSchemeFeed()
      .then((feed) => mounted && setLiveFeed(feed))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, []);

  const changeState = (value: string) => {
    setActiveState(value);
    navigate(value === 'all' ? '/dashboard/schemes' : `/dashboard/schemes/${stateToSlug(value)}`, { replace: true });
  };

  const hasProfile = !!(profile && (profile.state || profile.annual_income || profile.date_of_birth));
  const allSchemes = useMemo(() => mergeSchemeFeeds(liveFeed?.schemes || []), [liveFeed]);

  const schemeMatches = useMemo(
    () => (hasProfile && profile ? calculateSchemeMatches(profile, allSchemes) : null),
    [hasProfile, profile, allSchemes],
  );
  const scoreById = useMemo(() => new Map(schemeMatches?.map((m) => [m.scheme.id, m]) ?? []), [schemeMatches]);

  const unclaimedBenefits = useMemo(
    () => (hasProfile && profile ? calculateUnclaimedBenefits(profile) : null),
    [hasProfile, profile],
  );

  const today = todayIso();
  const isOpen = (s: GovernmentScheme) => s.status !== 'closed' && !(s.deadline && s.deadline < today);
  const isClosingSoon = (s: GovernmentScheme) =>
    !!s.deadline && s.deadline >= today && daysUntil(s.deadline) <= CLOSING_SOON_DAYS;

  // Everything except the category filter, so category counts stay honest.
  const baseSchemes = useMemo(() => {
    let schemes = schemeMatches ? schemeMatches.map((m) => m.scheme) : allSchemes;
    if (!showClosed) schemes = schemes.filter(isOpen);
    if (activeFilter !== 'all') schemes = schemes.filter((s) => s.type === activeFilter);
    if (activeState !== 'all') schemes = schemes.filter((s) => servesState(s, activeState));
    if (closingSoonOnly) schemes = schemes.filter(isClosingSoon);
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length) schemes = schemes.filter((s) => matchesSearch(s, words));
    return schemes;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schemeMatches, allSchemes, showClosed, activeFilter, activeState, closingSoonOnly, search, today]);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const scheme of baseSchemes) {
      const category = getPrimarySchemeCategory(scheme);
      counts.set(category, (counts.get(category) || 0) + 1);
    }
    return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [baseSchemes]);

  const displaySchemes = useMemo(() => {
    const schemes =
      activeCategory === 'all' ? baseSchemes : baseSchemes.filter((s) => getPrimarySchemeCategory(s) === activeCategory);
    if (schemeMatches) return schemes; // already sorted by match score
    // Upcoming deadlines first, so time-sensitive schemes are never buried.
    return [...schemes].sort((a, b) => {
      const da = a.deadline && a.deadline >= today ? a.deadline : '9999';
      const db = b.deadline && b.deadline >= today ? b.deadline : '9999';
      return da.localeCompare(db);
    });
  }, [baseSchemes, activeCategory, schemeMatches, today]);

  const paginatedSchemes = displaySchemes.slice(0, visibleCount);

  const openCount = useMemo(() => allSchemes.filter(isOpen).length, [allSchemes, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const centralCount = useMemo(() => allSchemes.filter((s) => s.type === 'central' && isOpen(s)).length, [allSchemes, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const closingSoonCount = useMemo(() => allSchemes.filter(isClosingSoon).length, [allSchemes, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const statesCovered = useMemo(() => {
    const keys = new Set<string>();
    for (const scheme of allSchemes) {
      for (const s of scheme.eligibility_criteria?.states ?? []) {
        const canonical = canonicalState(s);
        if (canonical) keys.add(canonical);
      }
    }
    return keys.size;
  }, [allSchemes]);

  const eligibleCount = schemeMatches ? schemeMatches.filter((m) => m.score >= 60).length : 0;
  const totalBenefits = unclaimedBenefits ? `₹${unclaimedBenefits.totalAmount.toLocaleString('en-IN')}` : '—';
  const eligibilityScore = schemeMatches
    ? Math.round(schemeMatches.reduce((sum, m) => sum + m.score, 0) / Math.max(1, schemeMatches.length))
    : 0;

  const syncedAt = liveFeed?.meta?.updated_at
    ? new Date(liveFeed.meta.updated_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
    : null;

  const stats = [
    { label: 'Open schemes', value: openCount, icon: 'task_alt', cls: 'text-primary' },
    { label: 'Central schemes', value: centralCount, icon: 'account_balance', cls: 'text-tertiary' },
    { label: 'States & UTs', value: statesCovered, icon: 'map', cls: 'text-secondary' },
    { label: `Closing in ${CLOSING_SOON_DAYS} days`, value: closingSoonCount, icon: 'alarm', cls: 'text-error' },
  ];

  return (
    <div className="space-y-6 md:space-y-8">
      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <div className="rounded-3xl bg-gradient-to-br from-primary-fixed via-surface-container-lowest to-tertiary-fixed/60 border border-outline-variant/20 p-5 md:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 text-xs font-bold text-india-green bg-india-green/10 px-3 py-1 rounded-full">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-india-green opacity-60" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-india-green" />
              </span>
              Live from myScheme · refreshed daily
            </p>
            <h1 className="mt-3 text-3xl md:text-4xl font-headline font-bold text-on-surface">
              {activeState !== 'all' ? `${activeState} Schemes` : T('schemes', 'title', lang)}
            </h1>
            <p className="mt-2 text-sm text-on-surface-variant leading-relaxed">
              {hasProfile ? T('schemes', 'personalized', lang) : 'Every central and state government scheme in India, in one place.'}{' '}
              Last synced: <span className="font-semibold text-on-surface">{syncedAt ?? (loading ? 'loading…' : 'offline snapshot')}</span>
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 xl:w-[540px] xl:shrink-0">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-2xl bg-surface-container-lowest/90 border border-outline-variant/20 p-3 md:p-4">
                <span className={cn('material-symbols-outlined text-xl', stat.cls)}>{stat.icon}</span>
                <p className={cn('font-mono font-bold text-xl md:text-2xl', stat.cls)}>
                  {loading ? '—' : stat.value.toLocaleString('en-IN')}
                </p>
                <p className="text-[10px] text-on-surface-variant uppercase tracking-wider font-semibold leading-tight">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Profile prompt / eligibility summary ──────────────────────────── */}
      {!hasProfile ? (
        <div className="rounded-2xl bg-gradient-to-r from-saffron/10 via-surface-container-lowest to-india-green/10 border border-saffron/20 p-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <span className="material-symbols-outlined text-3xl text-saffron">person_add</span>
          <div className="flex-1">
            <h3 className="font-headline font-bold text-on-surface">{T('schemes', 'completeYourProfile', lang)}</h3>
            <p className="text-sm text-on-surface-variant">{T('schemes', 'addDetails', lang)}</p>
          </div>
          <a
            href="/dashboard/settings"
            className="inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary-container text-on-primary font-bold text-sm px-4 py-2.5 rounded-xl"
          >
            <span className="material-symbols-outlined text-lg">settings</span>
            {T('schemes', 'goToSettings', lang)}
          </a>
        </div>
      ) : (
        <div className="bg-surface-container-lowest rounded-2xl p-5 md:p-6 shadow-ambient flex flex-col sm:flex-row items-center gap-6">
          <div className="relative shrink-0 w-24 h-24">
            <svg className="w-24 h-24 -rotate-90" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="52" fill="none" stroke="currentColor" strokeWidth="10" className="text-surface-container-high" />
              <circle
                cx="60" cy="60" r="52" fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round"
                strokeDasharray={`${(eligibilityScore / 100) * 2 * Math.PI * 52} ${2 * Math.PI * 52}`}
                className="text-primary"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="font-mono font-bold text-xl text-primary">{eligibilityScore}%</span>
            </div>
          </div>
          <div className="space-y-1 text-center sm:text-left">
            <h2 className="font-headline font-bold text-lg text-on-surface">{T('schemes', 'eligibilitySummary', lang)}</h2>
            <p className="text-sm text-on-surface-variant">
              {T('schemes', 'eligibleFor', lang)} <span className="font-bold text-on-surface">{eligibleCount} {T('schemes', 'schemesWith', lang)}</span>{' '}
              <span className="font-mono font-bold text-tertiary">{totalBenefits}</span> {T('schemes', 'perYear', lang)}
            </p>
            <p className="text-xs text-on-surface-variant">{T('schemes', 'updateDetails', lang)}</p>
          </div>
        </div>
      )}

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 -mx-1 px-1 py-3 bg-surface/90 backdrop-blur-md space-y-3">
        <div className="flex flex-col gap-3">
          <div className="relative w-full">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-xl">search</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search: kisan, pension, scholarship, loan, housing…"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface-container-lowest border border-outline-variant/40 text-on-surface text-sm placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <CustomSelect
              value={activeState}
              onChange={changeState}
              options={[
                { value: 'all', label: 'All India (every state)' },
                ...INDIA_STATES_AND_UTS.map((state) => ({ value: state, label: state })),
              ]}
            />
            <div className="flex gap-1 bg-surface-container-low rounded-xl p-1">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setActiveFilter(f.key)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-bold transition-colors',
                    activeFilter === f.key ? 'bg-primary text-on-primary shadow' : 'text-on-surface-variant hover:bg-surface-container',
                  )}
                >
                  {f.key === 'all' ? T('schemes', 'all', lang) : f.key === 'central' ? T('schemes', 'central', lang) : T('schemes', 'state', lang)}
                </button>
              ))}
            </div>
            <button
              onClick={() => setClosingSoonOnly((v) => !v)}
              className={cn(
                'inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors',
                closingSoonOnly ? 'bg-error text-white border-error' : 'border-outline-variant/40 text-on-surface-variant hover:bg-surface-container',
              )}
            >
              <span className="material-symbols-outlined text-base">alarm</span>
              Closing soon
            </button>
            <button
              onClick={() => setShowClosed((v) => !v)}
              className={cn(
                'inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors',
                showClosed ? 'bg-on-surface-variant text-white border-on-surface-variant' : 'border-outline-variant/40 text-on-surface-variant hover:bg-surface-container',
              )}
            >
              <span className="material-symbols-outlined text-base">{showClosed ? 'visibility' : 'visibility_off'}</span>
              Closed
            </button>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setActiveCategory('all')}
            className={cn(
              'shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-colors',
              activeCategory === 'all' ? 'bg-tertiary text-white' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container',
            )}
          >
            All categories <span className="font-mono opacity-75">({baseSchemes.length})</span>
          </button>
          {categories.map((category) => (
            <button
              key={category.name}
              onClick={() => setActiveCategory(category.name)}
              className={cn(
                'shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold transition-colors',
                activeCategory === category.name ? 'bg-tertiary text-white' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container',
              )}
            >
              <span className="material-symbols-outlined text-sm">{categoryStyle(category.name).icon}</span>
              {category.name} <span className="font-mono opacity-75">({category.count})</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Results ────────────────────────────────────────────────────────── */}
      <p className="text-xs text-on-surface-variant -mt-2">
        {T('schemes', 'showing', lang)} <span className="font-bold text-on-surface">{Math.min(visibleCount, displaySchemes.length).toLocaleString('en-IN')}</span> {T('schemes', 'of', lang)}{' '}
        <span className="font-bold text-on-surface">{displaySchemes.length.toLocaleString('en-IN')}</span> matching schemes
        {activeState !== 'all' && <> available in <span className="font-bold text-on-surface">{activeState}</span> (state + all-India schemes)</>}
      </p>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-64 rounded-2xl bg-surface-container-high animate-pulse" />
          ))}
        </div>
      ) : displaySchemes.length === 0 ? (
        <div className="text-center py-16">
          <span className="material-symbols-outlined text-5xl text-outline-variant mb-4 block">search_off</span>
          <p className="text-on-surface-variant font-medium">{T('schemes', 'noMatch', lang)}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {paginatedSchemes.map((scheme) => {
            const category = getPrimarySchemeCategory(scheme);
            const style = categoryStyle(category);
            const match = scoreById.get(scheme.id);
            const isTracked = !!applications[scheme.id];
            const open = isOpen(scheme);
            const upcoming = scheme.deadline && scheme.deadline >= today ? daysUntil(scheme.deadline) : null;
            const stateLabel = scheme.type === 'state' ? scheme.state : null;

            return (
              <article
                key={scheme.id}
                className={cn(
                  'group bg-surface-container-lowest rounded-2xl p-5 shadow-ambient border border-transparent hover:border-primary/30 flex flex-col transition-all hover:-translate-y-0.5',
                  !open && 'opacity-70',
                )}
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className={cn('shrink-0 w-11 h-11 rounded-xl flex items-center justify-center', style.cls)}>
                    <span className="material-symbols-outlined">{style.icon}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-headline font-bold text-on-surface text-[15px] leading-snug line-clamp-2">{scheme.name}</h3>
                    <p className="text-[11px] text-on-surface-variant mt-0.5 truncate">{scheme.ministry}</p>
                  </div>
                  {match && (
                    <div
                      className={cn(
                        'shrink-0 px-2 py-1 rounded-lg font-mono font-bold text-xs',
                        match.score >= 80 ? 'bg-india-green/15 text-india-green' : match.score >= 60 ? 'bg-primary-fixed text-primary' : 'bg-surface-container-high text-on-surface-variant',
                      )}
                      title="Profile match"
                    >
                      {match.score}%
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5 mb-3">
                  <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-md', scheme.type === 'central' ? 'bg-primary-fixed text-primary' : 'bg-tertiary-fixed text-tertiary')}>
                    {scheme.type === 'central' ? 'Central · All India' : 'State'}
                  </span>
                  {stateLabel && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-surface-container-high text-on-surface-variant inline-flex items-center gap-0.5 max-w-[180px]">
                      <span className="material-symbols-outlined text-[12px]">location_on</span>
                      <span className="truncate">{stateLabel}</span>
                    </span>
                  )}
                  {!open ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-error-container text-error">Closed</span>
                  ) : upcoming !== null ? (
                    <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-md', upcoming <= CLOSING_SOON_DAYS ? 'bg-error text-white' : 'bg-saffron/15 text-saffron')}>
                      {upcoming <= 0 ? 'Last day today' : `Closes ${formatDate(scheme.deadline!)}`}
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-india-green/10 text-india-green">Open</span>
                  )}
                  {scheme.is_new && <span className="text-[10px] font-bold text-white bg-tertiary px-2 py-0.5 rounded-md">New</span>}
                </div>

                {scheme.benefits && (
                  <p className="text-sm font-bold text-on-surface mb-2 line-clamp-2">{scheme.benefits}</p>
                )}
                <p className="text-xs text-on-surface-variant leading-relaxed mb-3 line-clamp-3 flex-1">{scheme.description}</p>

                {!!scheme.tags?.length && (
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {scheme.tags.slice(0, 4).map((tag) => (
                      <span key={tag} className="text-[10px] text-on-surface-variant bg-surface-container-low px-2 py-0.5 rounded-full">
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-auto grid grid-cols-[auto_1fr_1fr] gap-2">
                  <button
                    onClick={() =>
                      !isTracked &&
                      trackApplication({ id: scheme.id, title: scheme.name, type: 'scheme', status: 'Interested', portal_url: scheme.application_url })
                    }
                    disabled={isTracked}
                    title={isTracked ? 'Tracked' : 'Track this scheme'}
                    className="inline-flex items-center justify-center w-11 bg-surface-container-high hover:bg-surface-container-highest text-on-surface rounded-xl transition-colors disabled:text-india-green"
                  >
                    <span className="material-symbols-outlined text-[20px]">{isTracked ? 'bookmark_added' : 'bookmark_add'}</span>
                  </button>
                  <button
                    onClick={() => setSelected(scheme)}
                    className="inline-flex items-center justify-center gap-1.5 border border-primary/40 text-primary hover:bg-primary-fixed font-bold text-sm px-3 py-2.5 rounded-xl transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">menu_book</span>
                    Details
                  </button>
                  {scheme.application_url ? (
                    <a
                      href={scheme.application_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-1.5 bg-primary hover:bg-primary-container text-on-primary font-bold text-sm px-3 py-2.5 rounded-xl transition-colors"
                    >
                      <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                      Apply
                    </a>
                  ) : (
                    <span className="inline-flex items-center justify-center text-xs font-bold text-on-surface-variant bg-surface-container-high rounded-xl">
                      Visit office
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {visibleCount < displaySchemes.length && (
        <div className="flex justify-center pt-2">
          <button
            onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
            className="inline-flex items-center gap-2 bg-primary hover:bg-primary-container text-on-primary font-bold px-6 py-3 rounded-xl transition-colors"
          >
            <span className="material-symbols-outlined">expand_more</span>
            {T('schemes', 'loadMore', lang)} ({(displaySchemes.length - visibleCount).toLocaleString('en-IN')} more)
          </button>
        </div>
      )}

      <p className="text-center text-xs text-on-surface-variant py-2">
        Source: <a href="https://www.myscheme.gov.in/" target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline">myScheme, Government of India</a>.
        Verify final rules on the official portal before applying.
      </p>

      {selected && (
        <SchemeDetailModal
          title={selected.name}
          slug={selected.source === 'myScheme' ? selected.slug : undefined}
          applyUrl={selected.application_url}
          fallback={{
            description: selected.description,
            benefits: selected.benefits,
            documents: selected.documents_required,
            deadline: selected.deadline,
            department: selected.ministry,
          }}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
