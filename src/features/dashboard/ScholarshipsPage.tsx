import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { SCHOLARSHIP_SOURCES } from '@/data/scholarshipSources';
import { cn } from '@/lib/utils';
import { CustomSelect } from '@/components/shared/CustomSelect';
import { useAuthStore } from '@/stores/authStore';
import { useApplicationStore } from '@/stores/useApplicationStore';
import { SchemeDetailModal } from '@/components/shared/SchemeDetailModal';
import { INDIA_STATES_AND_UTS, canonicalState, stateFromSlug, stateKey } from '@/lib/indiaStates';

type ScholarshipLevel =
  | 'school'
  | 'diploma'
  | 'graduation'
  | 'postgraduation'
  | 'phd'
  | 'technical'
  | 'abroad';

type ScholarshipProvider = 'central' | 'state' | 'public-sector';
type LevelFilter = 'all' | ScholarshipLevel;
type ProviderFilter = 'all' | ScholarshipProvider;

export interface LiveScholarship {
  id: string;
  name: string;
  provider: ScholarshipProvider;
  department: string;
  education_levels: ScholarshipLevel[];
  target_groups: string[];
  benefits: string;
  eligibility: string;
  documents_required: string[];
  application_url: string;
  portal: string;
  source: string;
  source_url: string;
  specifications_url?: string;
  faq_url?: string;
  schemeOpenDate?: string;
  studentApplicationCloseDate?: string;
  deadline_hint: string;
  status: 'open' | 'expired';
  state?: string;
  states?: string[];
  university?: string;
  programs?: string[];
  tags?: string[];
  myscheme_slug?: string;
}

interface ScholarshipFeed {
  meta?: {
    source: string;
    source_url?: string;
    fetched_at: string;
    total: number;
    include_expired?: boolean;
  };
  scholarships: LiveScholarship[];
  error?: string;
}

const LEVEL_LABELS: Record<ScholarshipLevel, string> = {
  school: 'School',
  diploma: 'Diploma',
  graduation: 'Graduation',
  postgraduation: 'Post Graduation',
  phd: 'PhD / Research',
  technical: 'Technical / Professional',
  abroad: 'Study Abroad',
};

const LEVEL_FILTERS: { key: LevelFilter; label: string; icon: string }[] = [
  { key: 'all', label: 'All', icon: 'apps' },
  { key: 'school', label: 'School', icon: 'school' },
  { key: 'diploma', label: 'Diploma', icon: 'workspace_premium' },
  { key: 'graduation', label: 'Graduation', icon: 'cast_for_education' },
  { key: 'postgraduation', label: 'Post Graduation', icon: 'local_library' },
  { key: 'phd', label: 'PhD', icon: 'science' },
  { key: 'technical', label: 'Technical', icon: 'engineering' },
  { key: 'abroad', label: 'Study Abroad', icon: 'flight_takeoff' },
];

const PROVIDER_FILTERS: { key: ProviderFilter; label: string }[] = [
  { key: 'all', label: 'All Sources' },
  { key: 'central', label: 'Central Govt' },
  { key: 'state', label: 'State Govt' },
  { key: 'public-sector', label: 'Public Sector' },
];

function providerTag(provider: ScholarshipProvider): { label: string; cls: string } {
  if (provider === 'central') return { label: 'Central', cls: 'bg-primary-fixed text-primary' };
  if (provider === 'state') return { label: 'State', cls: 'bg-tertiary-fixed text-tertiary' };
  return { label: 'Public Sector', cls: 'bg-secondary-fixed text-secondary' };
}

const PAGE_SIZE = 24;
const CLOSING_SOON_DAYS = 30;

function daysUntil(isoDate: string) {
  return Math.ceil((new Date(`${isoDate}T23:59:59+05:30`).getTime() - Date.now()) / 86400000);
}

/** State-specific scholarships for the state, plus every all-India one. */
function servesState(scholarship: LiveScholarship, state: string) {
  const key = stateKey(state);
  const states = scholarship.states?.length
    ? scholarship.states
    : (scholarship.state || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!states.length) return scholarship.provider !== 'state';
  return states.some((s) => stateKey(s) === key);
}

function scholarshipMatchesSearch(scholarship: LiveScholarship, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  return [
    scholarship.name,
    scholarship.department,
    scholarship.portal,
    scholarship.benefits,
    scholarship.eligibility,
    scholarship.state || '',
    scholarship.university || '',
    ...(scholarship.programs || []),
    ...scholarship.target_groups,
    ...scholarship.education_levels.map((level) => LEVEL_LABELS[level]),
  ]
    .join(' ')
    .toLowerCase()
    .includes(q);
}

function formatDate(value?: string) {
  if (!value) return null;
  return new Date(`${value}T00:00:00+05:30`).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function ScholarshipsPage() {
  const user = useAuthStore((s) => s.user);
  const trackApplication = useApplicationStore(s => s.trackApplication);
  const applications = useApplicationStore(s => s.applications);
  const { stateParam } = useParams<{ stateParam?: string }>();

  const [activeLevel, setActiveLevel] = useState<LevelFilter>('all');
  const [activeProvider, setActiveProvider] = useState<ProviderFilter>('all');
  
  const initialUrlState = useMemo(() => stateFromSlug(stateParam) ?? 'all', [stateParam]);

  const [activeState, setActiveState] = useState<string>(initialUrlState);
  const [activeUniversity, setActiveUniversity] = useState<string>('all');
  const [activeProgram, setActiveProgram] = useState<string>('all');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [feed, setFeed] = useState<ScholarshipFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [closingSoonOnly, setClosingSoonOnly] = useState(false);
  const [selected, setSelected] = useState<LiveScholarship | null>(null);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [activeLevel, activeProvider, activeState, activeUniversity, activeProgram, activeCategory, closingSoonOnly, search]);

  useEffect(() => {
    let mounted = true;
    const day = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
    const cacheKey = `dhansathi-live-scholarships-v6:${day}`;

    async function loadScholarships() {
      setLoading(true);
      setError(null);

      try {
        let cached: string | null = null;
        try {
          cached = localStorage.getItem(cacheKey);
        } catch {
          // storage blocked (private mode) — fetch instead
        }
        if (cached) {
          const parsed = JSON.parse(cached) as ScholarshipFeed;
          if (mounted) setFeed(parsed);
          return;
        }

        let response;
        try {
          response = await fetch(`/api/scholarships?day=${day}`, { cache: 'no-store' });
          if (!response.ok) throw new Error('Live scrape unavailable');
        } catch {
          // Fallback to the committed static snapshot if the live scrape fails
          response = await fetch(`/scholarships.json?day=${day}`, { cache: 'no-store' });
        }
        
        if (!response.ok) throw new Error(`Live scholarship fetch failed: ${response.status}`);

        const nextFeed = (await response.json()) as ScholarshipFeed;
        if (nextFeed.error) throw new Error(nextFeed.error);

        if (mounted) setFeed(nextFeed);

        // The feed is ~1.5 MB; caching is a bonus, never a reason to fail.
        try {
          Object.keys(localStorage)
            .filter((key) => key.startsWith('dhansathi-live-scholarships') && key !== cacheKey)
            .forEach((key) => localStorage.removeItem(key));
          localStorage.setItem(cacheKey, JSON.stringify(nextFeed));
        } catch {
          // QuotaExceededError or storage disabled — the page already has data.
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Unable to load live scholarship data.');
          setFeed(null);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadScholarships();

    return () => {
      mounted = false;
    };
  }, []);

  const scholarships = useMemo(() => feed?.scholarships || [], [feed]);

  const stateCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const scholarship of scholarships) {
      const names = scholarship.states?.length ? scholarship.states : (scholarship.state || '').split(',');
      const seen = new Set<string>();
      for (const name of names) {
        const canonical = canonicalState(name.trim());
        if (canonical && !seen.has(canonical)) {
          seen.add(canonical);
          counts.set(canonical, (counts.get(canonical) || 0) + 1);
        }
      }
    }
    return counts;
  }, [scholarships]);

  const uniqueUniversities = useMemo(() => {
    const universities = new Set<string>();
    scholarships.forEach(s => s.university && universities.add(s.university));
    return Array.from(universities).sort();
  }, [scholarships]);

  const uniquePrograms = useMemo(() => {
    const programs = new Set<string>();
    scholarships.forEach(s => s.programs?.forEach(p => programs.add(p)));
    return Array.from(programs).sort();
  }, [scholarships]);

  const uniqueCategories = useMemo(() => {
    const categories = new Set<string>();
    scholarships.forEach(s => s.target_groups?.forEach(g => categories.add(g)));
    return Array.from(categories).sort();
  }, [scholarships]);

  const filteredScholarships = useMemo(() => {
    return scholarships.filter((scholarship) => {
      const levelMatch = activeLevel === 'all' || scholarship.education_levels.includes(activeLevel);
      const providerMatch = activeProvider === 'all' || scholarship.provider === activeProvider;
      const stateMatch = activeState === 'all' || servesState(scholarship, activeState);
      const closingMatch =
        !closingSoonOnly ||
        (!!scholarship.studentApplicationCloseDate && daysUntil(scholarship.studentApplicationCloseDate) <= CLOSING_SOON_DAYS);
      const universityMatch = activeUniversity === 'all' || scholarship.university === activeUniversity;
      const programMatch = activeProgram === 'all' || (scholarship.programs && scholarship.programs.includes(activeProgram));
      const categoryMatch = activeCategory === 'all' || (scholarship.target_groups && scholarship.target_groups.includes(activeCategory));

      return levelMatch && providerMatch && stateMatch && closingMatch && universityMatch && programMatch && categoryMatch && scholarshipMatchesSearch(scholarship, search);
    }).sort((a, b) => {
      // Nearest deadline first so time-sensitive scholarships are never buried.
      const da = a.studentApplicationCloseDate || '9999';
      const db = b.studentApplicationCloseDate || '9999';
      return da.localeCompare(db);
    });
  }, [activeLevel, activeProvider, activeState, closingSoonOnly, activeUniversity, activeProgram, activeCategory, scholarships, search]);

  const closingSoonCount = useMemo(
    () => scholarships.filter((s) => s.studentApplicationCloseDate && daysUntil(s.studentApplicationCloseDate) <= CLOSING_SOON_DAYS).length,
    [scholarships],
  );

  const levelCounts = useMemo(() => {
    return LEVEL_FILTERS.reduce<Record<string, number>>((acc, filter) => {
      if (filter.key === 'all') {
        acc[filter.key] = scholarships.length;
      } else {
        const level = filter.key;
        acc[filter.key] = scholarships.filter((scholarship) => scholarship.education_levels.includes(level)).length;
      }
      return acc;
    }, {});
  }, [scholarships]);

  const centralCount = scholarships.filter((s) => s.provider === 'central').length;
  const stateCount = scholarships.filter((s) => s.provider === 'state').length;
  const publicSectorCount = scholarships.filter((s) => s.provider === 'public-sector').length;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-on-surface-variant font-body text-sm mb-1">
            Live scholarships for Indian students across education levels
          </p>
          <h1 className="text-3xl font-headline font-bold text-on-surface">Government Scholarships</h1>
          <p className="text-sm text-on-surface-variant mt-3 leading-relaxed">
            This page fetches current scholarship data from official/public sources instead of saving scholarship records
            in the website code. Expired student application windows are filtered out automatically.
          </p>
          <p className="text-xs text-on-surface-variant mt-2">
            Last live fetch:{' '}
            <span className="font-semibold text-on-surface">
              {feed?.meta?.fetched_at
                ? new Date(feed.meta.fetched_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
                : loading
                  ? 'loading'
                  : 'not available'}
            </span>
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 lg:min-w-[480px]">
          <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/20 p-4 text-center">
            <p className="font-mono font-bold text-2xl text-primary">{scholarships.length}</p>
            <p className="text-[10px] text-on-surface-variant uppercase tracking-wider font-semibold">Open Now</p>
          </div>
          <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/20 p-4 text-center">
            <p className="font-mono font-bold text-2xl text-tertiary">{centralCount}</p>
            <p className="text-[10px] text-on-surface-variant uppercase tracking-wider font-semibold">Central</p>
          </div>
          <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/20 p-4 text-center">
            <p className="font-mono font-bold text-2xl text-secondary">{stateCount + publicSectorCount}</p>
            <p className="text-[10px] text-on-surface-variant uppercase tracking-wider font-semibold">State / Other</p>
          </div>
          <button
            onClick={() => setClosingSoonOnly((v) => !v)}
            className={cn(
              'rounded-2xl border p-4 text-center transition-colors',
              closingSoonOnly ? 'bg-error text-white border-error' : 'bg-surface-container-lowest border-outline-variant/20 hover:border-error/40',
            )}
          >
            <p className={cn('font-mono font-bold text-2xl', closingSoonOnly ? 'text-white' : 'text-error')}>{closingSoonCount}</p>
            <p className={cn('text-[10px] uppercase tracking-wider font-semibold', closingSoonOnly ? 'text-white' : 'text-on-surface-variant')}>Closing in 30d</p>
          </button>
        </div>
      </div>

      <div className="rounded-2xl bg-gradient-to-r from-primary-fixed via-white to-tertiary-fixed/60 border border-outline-variant/20 p-5 md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-3xl text-primary mt-0.5">sync</span>
            <div>
              <h2 className="font-headline font-bold text-on-surface">Daily live source refresh</h2>
              <p className="text-sm text-on-surface-variant mt-1">
                The website requests today&apos;s live feed from NSP through the API layer. No scholarship database is stored in the app.
              </p>
            </div>
          </div>
          <a
            href="https://scholarships.gov.in/All-Scholarships"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary-container text-on-primary font-bold text-sm px-4 py-2.5 rounded-xl transition-colors"
          >
            <span className="material-symbols-outlined text-lg">open_in_new</span>
            Open NSP
          </a>
        </div>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="font-headline font-bold text-lg text-on-surface">Official Sources</h2>
          <p className="text-xs text-on-surface-variant">Primary feed comes from NSP. Other official portals are shown for verification and direct applications.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {SCHOLARSHIP_SOURCES.map((source) => (
            <a
              key={source.id}
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-2xl bg-surface-container-lowest border border-outline-variant/20 p-4 hover:border-primary/40 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-headline font-bold text-sm text-on-surface">{source.name}</h3>
                  <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">{source.description}</p>
                </div>
                <span className="material-symbols-outlined text-lg text-primary">open_in_new</span>
              </div>
            </a>
          ))}
        </div>
      </section>

      <div className="space-y-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant -mb-1">
          Class / Standard
        </p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {LEVEL_FILTERS.map((filter) => (
            <button
              key={filter.key}
              onClick={() => setActiveLevel(filter.key)}
              className={cn(
                'shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-colors',
                activeLevel === filter.key
                  ? 'bg-primary text-on-primary shadow-md'
                  : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container',
              )}
            >
              <span className="material-symbols-outlined text-base">{filter.icon}</span>
              {filter.label}
              <span className="font-mono opacity-75">({levelCounts[filter.key] || 0})</span>
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="flex gap-2 overflow-x-auto pb-1 md:pb-0">
            {PROVIDER_FILTERS.map((filter) => (
              <button
                key={filter.key}
                onClick={() => setActiveProvider(filter.key)}
                className={cn(
                  'shrink-0 px-4 py-2 rounded-xl text-xs font-bold transition-colors',
                  activeProvider === filter.key
                    ? 'bg-tertiary text-white'
                    : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container',
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <div className="relative flex-1 md:max-w-md">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-xl">
              search
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by course, caste, ministry, portal..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-on-surface text-sm placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/40 transition-shadow"
            />
          </div>
        </div>

        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-2">
            Filter by category, state, degree
          </p>
          <div className="flex flex-wrap gap-3">
            <CustomSelect
              value={activeCategory}
              onChange={setActiveCategory}
              options={[
                { value: 'all', label: 'All Categories' },
                ...uniqueCategories.map(cat => ({ value: cat, label: cat }))
              ]}
            />

            <CustomSelect
              value={activeState}
              onChange={setActiveState}
              options={[
                { value: 'all', label: 'All India (every state)' },
                ...INDIA_STATES_AND_UTS.map(state => ({
                  value: state,
                  label: `${state}${stateCounts.get(state) ? ` (${stateCounts.get(state)})` : ''}`,
                }))
              ]}
            />

            <CustomSelect
              value={activeProgram}
              onChange={setActiveProgram}
              options={[
                { value: 'all', label: 'All Degrees / Courses' },
                ...uniquePrograms.map(prog => ({ value: prog, label: prog }))
              ]}
            />

            <CustomSelect
              value={activeUniversity}
              onChange={setActiveUniversity}
              options={[
                { value: 'all', label: 'All Universities' },
                ...uniqueUniversities.map(uni => ({ value: uni, label: uni }))
              ]}
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16">
          <span className="material-symbols-outlined text-5xl text-primary mb-4 block animate-spin">progress_activity</span>
          <p className="text-on-surface-variant font-medium">Fetching live scholarship data...</p>
        </div>
      ) : error ? (
        <div className="rounded-2xl bg-error-container/70 border border-error/20 p-6 text-center">
          <span className="material-symbols-outlined text-4xl text-error mb-3 block">cloud_off</span>
          <h2 className="font-headline font-bold text-on-surface">Live source unavailable</h2>
          <p className="text-sm text-on-surface-variant mt-2">{error}</p>
          <a
            href="https://scholarships.gov.in/All-Scholarships"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center justify-center gap-2 bg-primary text-on-primary font-bold text-sm px-4 py-2.5 rounded-xl"
          >
            <span className="material-symbols-outlined text-lg">open_in_new</span>
            Check NSP directly
          </a>
        </div>
      ) : filteredScholarships.length === 0 ? (
        <div className="text-center py-16">
          <span className="material-symbols-outlined text-5xl text-outline-variant mb-4 block">search_off</span>
          <p className="text-on-surface-variant font-medium">No open scholarships match your filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredScholarships.slice(0, visibleCount).map((scholarship) => {
            const tag = providerTag(scholarship.provider);
            const closeDate = formatDate(scholarship.studentApplicationCloseDate);
            const daysLeft = scholarship.studentApplicationCloseDate ? daysUntil(scholarship.studentApplicationCloseDate) : null;
            const isTracked = !!applications[scholarship.id];
            const applyUrl = scholarship.specifications_url || scholarship.application_url;

            const requiredCount = scholarship.documents_required?.length || 0;
            let readyCount = requiredCount;
            if (user) {
              const reqDocs = (scholarship.documents_required || []).map((d) => d.toLowerCase());
              let missing = 0;
              if (reqDocs.some((d) => d.includes('income')) && !user.has_income_certificate) missing += 1;
              if (reqDocs.some((d) => d.includes('caste') || d.includes('category')) && !user.has_caste_certificate && user.category !== 'general') missing += 1;
              if (reqDocs.some((d) => d.includes('domicile') || d.includes('resident')) && !user.has_domicile_certificate) missing += 1;
              if (reqDocs.some((d) => d.includes('bank') && d.includes('aadhaar')) && !user.is_aadhaar_bank_linked) missing += 1;
              readyCount = Math.max(0, requiredCount - missing);
            }
            const docReadinessPct = requiredCount > 0 ? Math.round((readyCount / requiredCount) * 100) : 100;

            return (
              <article
                key={scholarship.id}
                className="bg-surface-container-lowest rounded-2xl p-5 shadow-ambient border border-transparent hover:border-primary/30 flex flex-col transition-all hover:-translate-y-0.5"
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className="shrink-0 w-11 h-11 rounded-xl bg-primary-fixed flex items-center justify-center">
                    <span className="material-symbols-outlined text-primary">school</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-headline font-bold text-on-surface text-[15px] leading-snug line-clamp-2">{scholarship.name}</h2>
                    <p className="text-on-surface-variant text-[11px] mt-0.5 truncate">{scholarship.department}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 mb-3">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${tag.cls}`}>{tag.label}</span>
                  <span className="text-[10px] font-medium text-on-surface-variant bg-surface-container-high px-2 py-0.5 rounded-md">{scholarship.portal}</span>
                  {scholarship.state && (
                    <span className="text-[10px] font-semibold text-primary bg-primary-fixed/50 px-2 py-0.5 rounded-md inline-flex items-center gap-0.5 max-w-[180px]">
                      <span className="material-symbols-outlined text-[12px]">location_on</span>
                      <span className="truncate">{scholarship.state}</span>
                    </span>
                  )}
                  {daysLeft !== null ? (
                    <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-md', daysLeft <= CLOSING_SOON_DAYS ? 'bg-error text-white' : 'bg-saffron/15 text-saffron')}>
                      {daysLeft <= 0 ? 'Last day today' : daysLeft <= CLOSING_SOON_DAYS ? `${daysLeft} days left` : `Till ${closeDate}`}
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-india-green bg-india-green/10 px-2 py-0.5 rounded-md">Open</span>
                  )}
                </div>

                {scholarship.benefits && (
                  <p className="text-sm font-bold text-on-surface mb-2 line-clamp-2">{scholarship.benefits}</p>
                )}
                <p className="text-xs text-on-surface-variant leading-relaxed mb-3 line-clamp-3">{scholarship.eligibility}</p>

                <div className="flex flex-wrap gap-1.5 mb-3">
                  {scholarship.education_levels.slice(0, 3).map((level) => (
                    <span key={level} className="text-[10px] text-primary font-semibold bg-primary-fixed px-2 py-0.5 rounded-md">
                      {LEVEL_LABELS[level]}
                    </span>
                  ))}
                  {scholarship.target_groups.slice(0, 2).map((group) => (
                    <span key={group} className="text-[10px] text-on-surface-variant bg-surface-container-low px-2 py-0.5 rounded-md">
                      {group}
                    </span>
                  ))}
                </div>

                {user && requiredCount > 0 && (
                  <div className="mb-3 flex items-center justify-between text-xs bg-surface-container-low px-2 py-1.5 rounded-lg border border-outline-variant/30">
                    <span className="text-on-surface-variant">Docs ready</span>
                    <span className={cn('font-bold', docReadinessPct === 100 ? 'text-india-green' : docReadinessPct >= 50 ? 'text-saffron' : 'text-error')}>
                      {docReadinessPct}% ({readyCount}/{requiredCount})
                    </span>
                  </div>
                )}

                <div className="mt-auto grid grid-cols-[auto_1fr_1fr] gap-2">
                  <button
                    onClick={() =>
                      !isTracked &&
                      trackApplication({
                        id: scholarship.id,
                        title: scholarship.name,
                        type: 'scholarship',
                        status: 'Interested',
                        portal_url: scholarship.application_url,
                        deadline: scholarship.studentApplicationCloseDate,
                      })
                    }
                    disabled={isTracked}
                    title={isTracked ? 'Tracked' : 'Track this scholarship'}
                    className="inline-flex items-center justify-center w-11 bg-surface-container-high hover:bg-surface-container-highest text-on-surface rounded-xl transition-colors disabled:text-india-green"
                  >
                    <span className="material-symbols-outlined text-[20px]">{isTracked ? 'bookmark_added' : 'bookmark_add'}</span>
                  </button>
                  <button
                    onClick={() => setSelected(scholarship)}
                    className="inline-flex items-center justify-center gap-1.5 border border-primary/40 text-primary hover:bg-primary-fixed font-bold text-sm px-3 py-2.5 rounded-xl transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">menu_book</span>
                    Details
                  </button>
                  <a
                    href={applyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-1.5 bg-primary hover:bg-primary-container text-on-primary font-bold text-sm px-3 py-2.5 rounded-xl transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                    Apply
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {!loading && !error && visibleCount < filteredScholarships.length && (
        <div className="flex justify-center">
          <button
            onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
            className="inline-flex items-center gap-2 bg-primary hover:bg-primary-container text-on-primary font-bold px-6 py-3 rounded-xl transition-colors"
          >
            <span className="material-symbols-outlined">expand_more</span>
            Load more scholarships ({filteredScholarships.length - visibleCount} more)
          </button>
        </div>
      )}

      {selected && (
        <SchemeDetailModal
          title={selected.name}
          slug={selected.myscheme_slug}
          applyUrl={selected.specifications_url || selected.application_url}
          fallback={{
            description: selected.eligibility,
            benefits: selected.benefits,
            documents: selected.documents_required,
            deadline: selected.studentApplicationCloseDate,
            department: selected.department,
          }}
          onClose={() => setSelected(null)}
        />
      )}

      <div className="text-center py-4">
        <p className="text-xs text-on-surface-variant">
          Showing <span className="font-bold">{filteredScholarships.length}</span> of{' '}
          <span className="font-bold">{scholarships.length}</span> live open scholarship entries. Verify final rules on the official portal before applying.
        </p>
      </div>
    </div>
  );
}
