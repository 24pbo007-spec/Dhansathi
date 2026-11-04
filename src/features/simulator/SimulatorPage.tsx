import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  runSimulation,
  isAIModeAvailable,
  type SimulationResult,
  type SimulationProgress,
} from '@/lib/simulationService';
import { fetchAnyStock, fetchLiveStocks } from '@/lib/stockApi';
import { loadStockUniverse, searchStockUniverse, type UniverseStock } from '@/lib/stockUniverse';
import type { StockData } from '@/types';
import { useAuthStore } from '@/stores/authStore';
import { usePlanStore } from '@/stores/planStore';
import { useLanguageStore } from '@/stores/languageStore';
import { T } from '@/lib/translations';
import { SimulationDetails } from './SimulationDetails';

/* ── Animation helpers ─────────────────────────── */

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

const stagger = {
  visible: { transition: { staggerChildren: 0.06 } },
};

/* ── Types & data ──────────────────────────────── */

interface ScenarioPreset {
  id: string;
  icon: string;
  title: string;
  description: string;
}

interface PastSimulation {
  id: string;
  stock: string;
  scenario: string;
  direction: 'Bullish' | 'Bearish' | 'Neutral';
  confidence: number;
  date: string;
  targetPrice: number;
}

const SCENARIO_PRESETS: ScenarioPreset[] = [
  {
    id: 'rbi_rate',
    icon: 'account_balance',
    title: 'RBI Rate Cut',
    description: 'Simulate impact of 25-50 bps repo rate reduction on the stock',
  },
  {
    id: 'earnings_beat',
    icon: 'trending_up',
    title: 'Earnings Beat',
    description: 'What happens if the company beats quarterly earnings by 10-20%',
  },
  {
    id: 'policy_change',
    icon: 'gavel',
    title: 'Policy Change',
    description: 'Impact of major government policy reform on the sector',
  },
  {
    id: 'global_crash',
    icon: 'public_off',
    title: 'Global Crash',
    description: 'Simulate a global market downturn like 2008 or COVID-19',
  },
  {
    id: 'fii_dii',
    icon: 'swap_horiz',
    title: 'FII/DII Flow',
    description: 'Effect of large foreign or domestic institutional buying/selling',
  },
  {
    id: 'commodity',
    icon: 'oil_barrel',
    title: 'Commodity Shock',
    description: 'Impact of crude oil, gold, or commodity price spike',
  },
];

const HORIZONS = ['1 Day', '1 Week', '2 Weeks', '1 Month', '1 Year'] as const;

interface PickerItem {
  symbol: string;
  name: string;
  exchange: 'NSE' | 'BSE';
  tag?: string;
  price?: number;
  change_pct?: number;
}

const inr = (value?: number | null) =>
  value == null ? 'N/A' : `₹${value.toLocaleString('en-IN', { maximumFractionDigits: value < 100 ? 2 : 0 })}`;

/* ── Component ─────────────────────────────────── */

export default function SimulatorPage() {
  const [selectedStock, setSelectedStock] = useState('RELIANCE');
  const [stockSearch, setStockSearch] = useState('');
  const [isStockDropdownOpen, setIsStockDropdownOpen] = useState(false);
  const stockSearchRef = useRef<HTMLDivElement>(null);
  const [liveStocks, setLiveStocks] = useState<StockData[]>([]);
  const [universeResults, setUniverseResults] = useState<UniverseStock[]>([]);
  const [universeCount, setUniverseCount] = useState<number | null>(null);
  const [selectedExchange, setSelectedExchange] = useState<'NSE' | 'BSE'>('NSE');
  const [selectedName, setSelectedName] = useState('Reliance Industries Limited');
  const [selectedQuote, setSelectedQuote] = useState<StockData | null>(null);
  const [loadingStocks, setLoadingStocks] = useState(true);
  const [searching, setSearching] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);
  const [customScenario, setCustomScenario] = useState('');
  const [horizon, setHorizon] = useState<typeof HORIZONS[number]>('1 Month');
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [progress, setProgress] = useState<SimulationProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'simulator' | 'history'>('simulator');
  const [pastSimulations, setPastSimulations] = useState<PastSimulation[]>([]);
  const lang = useLanguageStore((s) => s.lang);
  const planUseCredit = usePlanStore((s) => s.useCredit);
  const planRemaining = usePlanStore((s) => s.getRemainingCredits);
  const planGetMax = usePlanStore((s) => s.getMaxCredits);
  const maxCredits = planGetMax('dhanmitra');

  // Fetch live stocks on mount
  useEffect(() => {
    let cancelled = false;
    setLoadingStocks(true);
    fetchLiveStocks().then((data) => {
      if (!cancelled) {
        setLiveStocks(data);
        setLoadingStocks(false);
      }
    }).catch(() => { if (!cancelled) setLoadingStocks(false); });
    return () => { cancelled = true; };
  }, []);

  // Every NSE/BSE stock on Angel One is searched locally — instant, no network per keystroke.
  useEffect(() => {
    loadStockUniverse()
      .then((all) => setUniverseCount(all.length))
      .catch(() => setUniverseCount(null));
  }, []);

  useEffect(() => {
    const q = stockSearch.trim();
    if (!q) {
      setUniverseResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    searchStockUniverse(q, 30)
      .then((results) => !cancelled && setUniverseResults(results))
      .catch(() => !cancelled && setUniverseResults([]))
      .finally(() => !cancelled && setSearching(false));
    return () => {
      cancelled = true;
    };
  }, [stockSearch]);

  const liveBySymbol = useMemo(() => new Map(liveStocks.map((s) => [s.symbol, s])), [liveStocks]);

  const pickerItems = useMemo<PickerItem[]>(() => {
    if (!stockSearch.trim()) {
      return liveStocks.map((s) => ({ symbol: s.symbol, name: s.name, exchange: 'NSE', tag: 'Nifty 50', price: s.price, change_pct: s.change_pct }));
    }
    return universeResults.map((u) => {
      const live = u.exchange === 'NSE' ? liveBySymbol.get(u.symbol) : undefined;
      return {
        symbol: u.symbol,
        name: u.name,
        exchange: u.exchange,
        tag: u.type === 'ETF' ? 'ETF' : ['SM', 'ST', 'SZ'].includes(u.series) ? 'SME' : undefined,
        price: live?.price,
        change_pct: live?.change_pct,
      };
    });
  }, [stockSearch, liveStocks, universeResults, liveBySymbol]);

  // Live quote for the selected stock when it is outside the preloaded Nifty 50.
  useEffect(() => {
    if (liveBySymbol.has(selectedStock) && selectedExchange === 'NSE') {
      setSelectedQuote(null);
      return;
    }
    let cancelled = false;
    fetchAnyStock(`${selectedStock}.${selectedExchange === 'BSE' ? 'BO' : 'NS'}`)
      .then((quote) => !cancelled && setSelectedQuote(quote))
      .catch(() => !cancelled && setSelectedQuote(null));
    return () => {
      cancelled = true;
    };
  }, [selectedStock, selectedExchange, liveBySymbol]);

  // Close stock dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (stockSearchRef.current && !stockSearchRef.current.contains(e.target as Node)) {
        setIsStockDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectedStockObj = (selectedExchange === 'NSE' ? liveBySymbol.get(selectedStock) : undefined) || selectedQuote;

  const creditsRemaining = planRemaining('dhanmitra');
  const aiMode = isAIModeAvailable();
  const user = useAuthStore((s) => s.user);

  const handleRunSimulation = useCallback(async () => {
    if (creditsRemaining <= 0) return;
    if (!selectedScenario && !customScenario.trim()) return;
    if (!planUseCredit('dhanmitra')) return;

    setIsRunning(true);
    setResult(null);
    setError(null);
    setProgress({ stage: 'Starting...', percent: 0, message: 'Initializing DhanMitra AI' });

    try {
      const simResult = await runSimulation(
        {
          symbol: selectedStock,
          exchange: selectedExchange,
          scenarioId: selectedScenario,
          customScenario,
          horizon,
        },
        (p) => setProgress(p),
        user ? { state: user.state, occupation: user.occupation, annual_income: user.annual_income, category: user.category } : null,
      );

      setResult(simResult);

      // Add to history (in-memory only, no storage)
      const scenarioTitle = selectedScenario
        ? SCENARIO_PRESETS.find((s) => s.id === selectedScenario)?.title ?? 'Custom'
        : 'Custom';

      setPastSimulations((prev) => [
        {
          id: `sim_${Date.now()}`,
          stock: selectedStock,
          scenario: scenarioTitle,
          direction: simResult.direction,
          confidence: simResult.confidence,
          date: new Date().toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }),
          targetPrice: simResult.targetPrice,
        },
        ...prev,
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Simulation failed. Please try again.');
    } finally {
      setIsRunning(false);
      setProgress(null);
    }
  }, [selectedStock, selectedExchange, selectedScenario, customScenario, horizon, creditsRemaining, planUseCredit, user]);

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={stagger}
      className="space-y-8 pb-16"
    >
      {/* ── Header ── */}
      <motion.div variants={fadeUp} custom={0} className="flex flex-col md:flex-row md:items-end md:justify-between space-y-4 md:space-y-0">
        <div>
          <div className="flex items-center space-x-3 mb-1">
            <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary-container rounded-xl flex items-center justify-center">
              <span className="material-symbols-outlined text-white text-[22px]">psychology</span>
            </div>
            <h1 className="font-headline text-2xl md:text-3xl font-extrabold text-on-surface">
              {T('simulator', 'title', lang)}
            </h1>
          </div>
          <p className="text-on-surface-variant mt-1">
            {T('simulator', 'subtitle', lang)}
          </p>
        </div>
        <div className="flex items-center space-x-3">
          {/* AI mode badge */}
          <div className={cn(
            'flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold',
            aiMode
              ? 'bg-india-green/15 text-india-green'
              : 'bg-saffron/15 text-saffron',
          )}>
            <span className="material-symbols-outlined text-[14px]">{aiMode ? 'auto_awesome' : 'memory'}</span>
            <span>Real market data + Gemma AI</span>
          </div>

          <div className="flex items-center space-x-2 bg-surface-container rounded-xl px-4 py-2.5">
            <span className="material-symbols-outlined text-saffron text-[18px]">token</span>
            <span className="text-sm font-semibold text-on-surface">
              {maxCredits === Infinity ? (
                <span className="font-mono">Unlimited</span>
              ) : (
                <><span className="font-mono">{creditsRemaining}</span>/{maxCredits}</>
              )} {T('simulator', 'credits', lang)}
            </span>
            <span className="text-[10px] font-bold text-primary bg-primary-fixed/40 px-1.5 py-0.5 rounded">FULL ACCESS</span>
          </div>
        </div>
      </motion.div>

      {/* ── View Toggle ── */}
      <motion.div variants={fadeUp} custom={1} className="flex space-x-2">
        {[
          { key: 'simulator' as const, label: 'Simulator', icon: 'science' },
          { key: 'history' as const, label: `History (${pastSimulations.length})`, icon: 'history' },
        ].map((view) => (
          <button
            key={view.key}
            onClick={() => setActiveView(view.key)}
            className={cn(
              'flex items-center space-x-2 px-5 py-3 rounded-xl font-semibold text-sm transition-all',
              activeView === view.key
                ? 'bg-primary text-white shadow-md shadow-primary/20'
                : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high',
            )}
          >
            <span className="material-symbols-outlined text-[18px]">{view.icon}</span>
            <span>{view.label}</span>
          </button>
        ))}
      </motion.div>

      <AnimatePresence mode="wait">
        {activeView === 'simulator' ? (
          <motion.div
            key="simulator"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3 }}
            className="space-y-6"
          >
            {/* ── Stock Selector ── */}
            <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 p-6">
              <h3 className="font-headline font-bold text-on-surface mb-4">{T('simulator', 'selectStock', lang)}</h3>
              <div ref={stockSearchRef} className="relative w-full md:w-96">
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">search</span>
                  <input
                    type="text"
                    placeholder={T('simulator', 'searchStock', lang)}
                    value={isStockDropdownOpen ? stockSearch : `${selectedStock} — ${selectedStockObj?.name || selectedName}${selectedStockObj ? ` — ${inr(selectedStockObj.price)}` : ''}`}
                    onFocus={() => {
                      setIsStockDropdownOpen(true);
                      setStockSearch('');
                    }}
                    onChange={(e) => {
                      setStockSearch(e.target.value);
                      setIsStockDropdownOpen(true);
                    }}
                    className="w-full bg-white border border-outline-variant/30 rounded-xl pl-10 pr-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                  {isStockDropdownOpen && (
                    <button
                      onClick={() => {
                        setIsStockDropdownOpen(false);
                        setStockSearch('');
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface"
                    >
                      <span className="material-symbols-outlined text-[18px]">close</span>
                    </button>
                  )}
                </div>
                {isStockDropdownOpen && (
                  <div className="absolute z-50 mt-1 w-full max-h-72 overflow-y-auto bg-white border border-outline-variant/20 rounded-xl shadow-xl">
                    {loadingStocks && !stockSearch.trim() ? (
                      <div className="px-4 py-6 text-sm text-on-surface-variant text-center flex items-center justify-center space-x-2">
                        <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                        <span>Loading live stock prices...</span>
                      </div>
                    ) : pickerItems.length > 0 ? (
                      <>
                        {!stockSearch.trim() && (
                          <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                            Nifty 50 · type to search all {universeCount ? universeCount.toLocaleString('en-IN') : ''} NSE &amp; BSE stocks
                          </p>
                        )}
                        {pickerItems.map((s) => (
                          <button
                            key={`${s.exchange}-${s.symbol}`}
                            onClick={() => {
                              setSelectedStock(s.symbol);
                              setSelectedExchange(s.exchange);
                              setSelectedName(s.name);
                              setStockSearch('');
                              setIsStockDropdownOpen(false);
                              setResult(null);
                            }}
                            className={cn(
                              'w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-primary-fixed/30 flex items-center justify-between gap-2',
                              selectedStock === s.symbol && selectedExchange === s.exchange ? 'bg-primary-fixed/20 font-bold text-primary' : 'text-on-surface',
                            )}
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono font-semibold">{s.symbol}</span>
                                <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded', s.exchange === 'NSE' ? 'bg-primary-fixed text-primary' : 'bg-tertiary-fixed text-tertiary')}>
                                  {s.exchange}
                                </span>
                                {s.tag && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface-variant">{s.tag}</span>}
                              </div>
                              <p className="text-xs text-on-surface-variant font-normal truncate">{s.name}</p>
                            </div>
                            {s.price != null && (
                              <div className="text-right shrink-0">
                                <span className="font-mono font-semibold">{inr(s.price)}</span>
                                <span className={cn('ml-1.5 text-xs font-bold', (s.change_pct ?? 0) >= 0 ? 'text-india-green' : 'text-error')}>
                                  {(s.change_pct ?? 0) >= 0 ? '+' : ''}{s.change_pct?.toFixed(2)}%
                                </span>
                              </div>
                            )}
                          </button>
                        ))}
                      </>
                    ) : searching ? (
                      <div className="px-4 py-4 text-sm text-on-surface-variant text-center flex items-center justify-center space-x-2">
                        <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                        <span>Searching...</span>
                      </div>
                    ) : (
                      <div className="px-4 py-3 text-sm text-on-surface-variant text-center">
                        No matching stocks found
                      </div>
                    )}
                  </div>
                )}
              </div>
              {selectedStockObj && (
                <div className="mt-3 flex items-center space-x-4 bg-surface-container-low rounded-xl px-4 py-2.5">
                  <div>
                    <span className="font-mono font-bold text-on-surface">{selectedStockObj.symbol}</span>
                    <span className="text-on-surface-variant text-sm ml-2">{selectedStockObj.name}</span>
                  </div>
                  <div className="ml-auto flex items-center space-x-3">
                    <span className="font-mono font-bold text-lg text-on-surface">₹{selectedStockObj.price?.toLocaleString('en-IN')}</span>
                    <span className={cn('text-sm font-bold', selectedStockObj.change_pct >= 0 ? 'text-india-green' : 'text-error')}>
                      {selectedStockObj.change_pct >= 0 ? '▲' : '▼'} {selectedStockObj.change_pct >= 0 ? '+' : ''}{selectedStockObj.change_pct?.toFixed(2)}%
                    </span>
                    {selectedStockObj.signal && (
                      <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full uppercase',
                        selectedStockObj.signal === 'strong_buy' || selectedStockObj.signal === 'buy' ? 'bg-india-green/15 text-india-green' :
                          selectedStockObj.signal === 'strong_sell' || selectedStockObj.signal === 'sell' ? 'bg-error/15 text-error' :
                            'bg-surface-container-high text-on-surface-variant'
                      )}>
                        {selectedStockObj.signal.replace('_', ' ')}
                      </span>
                    )}
                  </div>
                </div>
              )}
              <p className="text-xs text-on-surface-variant mt-2">
                Search any of {universeCount ? universeCount.toLocaleString('en-IN') : 'all'} NSE &amp; BSE stocks and ETFs listed on Angel One • Live prices from Yahoo Finance
              </p>
            </div>

            {/* ── Scenario Presets ── */}
            <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 p-6">
              <h3 className="font-headline font-bold text-on-surface mb-1">{T('simulator', 'scenario', lang)}</h3>
              <p className="text-sm text-on-surface-variant mb-5">
                Select a preset or write a custom scenario below
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {SCENARIO_PRESETS.map((scenario) => (
                  <button
                    key={scenario.id}
                    onClick={() => {
                      setSelectedScenario(
                        selectedScenario === scenario.id ? null : scenario.id,
                      );
                      setResult(null);
                    }}
                    className={cn(
                      'text-left p-5 rounded-xl border-2 transition-all group',
                      selectedScenario === scenario.id
                        ? 'border-primary bg-primary-fixed/40 shadow-md'
                        : 'border-outline-variant/20 bg-surface-container-low hover:border-primary/30 hover:bg-surface-container',
                    )}
                  >
                    <div className={cn(
                      'w-10 h-10 rounded-xl flex items-center justify-center mb-3 transition-colors',
                      selectedScenario === scenario.id
                        ? 'bg-primary text-white'
                        : 'bg-surface-container-high text-on-surface-variant group-hover:bg-primary-fixed group-hover:text-primary',
                    )}>
                      <span className="material-symbols-outlined text-[20px]">{scenario.icon}</span>
                    </div>
                    <p className="font-semibold text-on-surface text-sm">{scenario.title}</p>
                    <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
                      {scenario.description}
                    </p>
                  </button>
                ))}
              </div>

              {/* Custom Scenario */}
              <div className="mt-6">
                <label className="text-xs font-semibold text-on-surface-variant block mb-2">
                  Or describe a custom scenario
                </label>
                <textarea
                  placeholder="e.g. What if RELIANCE announces a major acquisition in the renewable energy space worth $5 billion..."
                  value={customScenario}
                  onChange={(e) => {
                    setCustomScenario(e.target.value);
                    if (e.target.value) setSelectedScenario(null);
                    setResult(null);
                  }}
                  rows={3}
                  className="w-full bg-white border border-outline-variant/30 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
              </div>
            </div>

            {/* ── Prediction Horizon ── */}
            <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 p-6">
              <h3 className="font-headline font-bold text-on-surface mb-4">{T('simulator', 'horizon', lang)}</h3>
              <div className="flex flex-wrap gap-3">
                {HORIZONS.map((h) => (
                  <label
                    key={h}
                    className={cn(
                      'flex items-center space-x-2 px-5 py-3 rounded-xl cursor-pointer font-semibold text-sm transition-all border-2',
                      horizon === h
                        ? 'border-primary bg-primary-fixed/40 text-primary'
                        : 'border-outline-variant/20 text-on-surface-variant hover:border-primary/30',
                    )}
                  >
                    <input
                      type="radio"
                      name="horizon"
                      value={h}
                      checked={horizon === h}
                      onChange={() => {
                        setHorizon(h);
                        setResult(null);
                      }}
                      className="sr-only"
                    />
                    <span className="material-symbols-outlined text-[18px]">
                      {h === '1 Day' ? 'today' : h === '1 Week' ? 'date_range' : h === '2 Weeks' ? 'calendar_month' : h === '1 Year' ? 'calendar_today' : 'event'}
                    </span>
                    <span>{h}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* ── Run Simulation Button ── */}
            <div className="flex flex-col sm:flex-row items-center space-y-3 sm:space-y-0 sm:space-x-4">
              <button
                onClick={handleRunSimulation}
                disabled={isRunning || creditsRemaining <= 0 || (!selectedScenario && !customScenario.trim())}
                className={cn(
                  'flex items-center space-x-3 px-8 py-4 rounded-2xl font-bold text-lg transition-all',
                  isRunning || creditsRemaining <= 0 || (!selectedScenario && !customScenario.trim())
                    ? 'bg-surface-container-high text-on-surface-variant cursor-not-allowed'
                    : 'bg-gradient-to-r from-primary to-primary-container text-white shadow-xl shadow-primary/25 hover:shadow-2xl hover:scale-[1.02]',
                )}
              >
                {isRunning ? (
                  <>
                    <span className="material-symbols-outlined animate-spin text-[22px]">progress_activity</span>
                    <span>{T('simulator', 'running', lang)}</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[22px]">play_arrow</span>
                    <span>{T('simulator', 'runSimulation', lang)}</span>
                  </>
                )}
              </button>
              {creditsRemaining <= 0 && (
                <div className="flex flex-col sm:flex-row items-center space-y-2 sm:space-y-0 sm:space-x-3">
                  <p className="text-sm text-error font-semibold">
                    {T('simulator', 'noCredits', lang)}
                  </p>
                </div>
              )}
            </div>

            {/* ── Error State ── */}
            {error && (
              <div className="bg-error-container rounded-2xl p-5 border border-error/20">
                <div className="flex items-start space-x-3">
                  <span className="material-symbols-outlined text-error text-xl">error</span>
                  <div>
                    <p className="font-semibold text-error">Simulation Failed</p>
                    <p className="text-sm text-on-error-container mt-1">{error}</p>
                  </div>
                </div>
              </div>
            )}

            {/* ── Loading Animation ── */}
            <AnimatePresence>
              {isRunning && progress && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 p-12 text-center"
                >
                  <div className="w-16 h-16 mx-auto bg-primary-fixed rounded-full flex items-center justify-center mb-4 animate-pulse">
                    <span className="material-symbols-outlined text-primary text-[32px]">psychology</span>
                  </div>
                  <p className="font-headline font-bold text-on-surface">{progress.stage}</p>
                  <p className="text-sm text-on-surface-variant mt-2">{progress.message}</p>
                  <div className="mt-6 h-2 bg-surface-container-high rounded-full overflow-hidden max-w-xs mx-auto">
                    <motion.div
                      className="h-full bg-gradient-to-r from-primary to-primary-container rounded-full"
                      initial={{ width: '0%' }}
                      animate={{ width: `${progress.percent}%` }}
                      transition={{ duration: 0.5, ease: 'easeOut' }}
                    />
                  </div>
                  <p className="text-xs text-on-surface-variant mt-3 font-mono">{progress.percent}%</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Results ── */}
            <AnimatePresence>
              {result && !isRunning && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.5 }}
                  className="space-y-6"
                >
                  {/* Source badge */}
                  <div className="flex items-center justify-between">
                    <div className={cn(
                      'flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold',
                      result.source === 'ai' ? 'bg-india-green/15 text-india-green' : 'bg-primary-fixed text-primary',
                    )}>
                      <span className="material-symbols-outlined text-[14px]">{result.source === 'ai' ? 'auto_awesome' : 'calculate'}</span>
                      <span>{result.source === 'ai' ? 'Real data + AI explanation' : 'Real data (AI explanation unavailable)'}</span>
                    </div>
                    {result.stock && (
                      <p className="text-xs text-on-surface-variant">
                        {result.stock.name} · {result.stock.exchange} · prices as of {result.stock.as_of}
                      </p>
                    )}
                  </div>

                  {/* Direction + Confidence + Price Range */}
                  <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 p-6">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
                      <div className="flex items-center space-x-4">
                        <div className={cn(
                          'px-5 py-2.5 rounded-xl font-bold text-lg',
                          result.direction === 'Bullish'
                            ? 'bg-tertiary-fixed/30 text-tertiary'
                            : result.direction === 'Bearish'
                              ? 'bg-error-container text-error'
                              : 'bg-surface-container-high text-on-surface-variant',
                        )}>
                          <div className="flex items-center space-x-2">
                            <span className="material-symbols-outlined">
                              {result.direction === 'Bullish' ? 'trending_up' : result.direction === 'Bearish' ? 'trending_down' : 'trending_flat'}
                            </span>
                            <span>{result.direction}</span>
                          </div>
                        </div>
                        <div>
                          <p className="text-sm text-on-surface-variant">
                            {result.probabilities ? `Chance price ends ${result.direction === 'Bearish' ? 'lower' : 'higher'}` : T('simulator', 'confidence', lang)}
                          </p>
                          <p className="font-mono text-2xl font-extrabold text-on-surface">
                            {result.confidence}%
                          </p>
                        </div>
                      </div>
                      <div className="text-right space-y-1">
                        <p className="text-sm text-on-surface-variant">{T('simulator', 'targetPrice', lang)} <span className="text-[10px]">(median)</span></p>
                        <p className="font-mono text-xl font-extrabold text-on-surface">
                          ₹{result.targetPrice.toLocaleString('en-IN')}
                        </p>
                        <p className="text-xs text-on-surface-variant">
                          80% range: ₹{result.priceRange.low.toLocaleString('en-IN')} — ₹{result.priceRange.high.toLocaleString('en-IN')}
                        </p>
                        <p className="text-xs text-on-surface-variant">
                          Current: <span className="font-mono font-semibold">₹{result.currentPrice.toLocaleString('en-IN')}</span>
                          {' '}| Stop (2×ATR): <span className="font-mono font-semibold text-error">₹{result.stopLoss.toLocaleString('en-IN')}</span>
                        </p>
                      </div>
                    </div>

                    {/* Stats row */}
                    <div className="grid grid-cols-3 gap-4 mt-5 pt-5 border-t border-outline-variant/20">
                      <div className="text-center">
                        <p className="text-[10px] text-on-surface-variant uppercase tracking-wider font-semibold">Expected Return</p>
                        <p className={cn('font-mono font-bold text-lg', result.expectedReturn >= 0 ? 'text-india-green' : 'text-error')}>
                          {result.expectedReturn >= 0 ? '+' : ''}{result.expectedReturn.toFixed(1)}%
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] text-on-surface-variant uppercase tracking-wider font-semibold">Risk:Reward</p>
                        <p className="font-mono font-bold text-lg text-on-surface">{result.riskReward.toFixed(1)}:1</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] text-on-surface-variant uppercase tracking-wider font-semibold">Horizon</p>
                        <p className="font-mono font-bold text-lg text-on-surface">{horizon}</p>
                      </div>
                    </div>

                    {/* Confidence Bar */}
                    <div className="mt-4 h-3 bg-surface-container-high rounded-full overflow-hidden">
                      <motion.div
                        className={cn(
                          'h-full rounded-full',
                          result.direction === 'Bullish'
                            ? 'bg-gradient-to-r from-tertiary to-tertiary-container'
                            : result.direction === 'Bearish'
                              ? 'bg-gradient-to-r from-error to-error-container'
                              : 'bg-gradient-to-r from-outline to-outline-variant',
                        )}
                        initial={{ width: '0%' }}
                        animate={{ width: `${result.confidence}%` }}
                        transition={{ duration: 1, delay: 0.3 }}
                      />
                    </div>
                  </div>

                  {result.percentiles && result.probabilities && <SimulationDetails result={result} />}

                  {/* Thinking Process (Reasoning) */}
                  {result.reasoning && (
                    <div className="bg-primary/5 rounded-2xl border border-primary/20 p-5">
                      <div className="flex items-start space-x-3">
                        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                          <span className="material-symbols-outlined text-primary text-[16px]">psychology</span>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-primary mb-1 opacity-70">Why these numbers</p>
                          <p className="text-sm text-on-surface-variant leading-relaxed">{result.reasoning}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Hindi Summary */}
                  {result.hindiSummary && (
                    <div className="bg-saffron/5 rounded-2xl border border-saffron/20 p-5">
                      <div className="flex items-start space-x-3">
                        <span className="material-symbols-outlined text-saffron text-xl mt-0.5">translate</span>
                        <p className="text-sm text-on-surface leading-relaxed">{result.hindiSummary}</p>
                      </div>
                    </div>
                  )}

                  {/* Agent Insights */}
                  {result.agentInsights && (
                    <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 p-6">
                      <div className="flex items-center space-x-2 mb-4">
                        <span className="material-symbols-outlined text-primary text-[20px]">groups</span>
                        <h4 className="font-headline font-bold text-on-surface">{T('simulator', 'analysis', lang)}</h4>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {[
                          { key: 'technical', icon: 'candlestick_chart', title: 'Technical', color: 'text-primary' },
                          { key: 'fundamental', icon: 'analytics', title: 'Fundamental', color: 'text-tertiary' },
                          { key: 'institutional', icon: 'account_balance', title: 'Institutional', color: 'text-secondary' },
                          { key: 'macro', icon: 'public', title: 'Macro', color: 'text-saffron' },
                          { key: 'risk', icon: 'shield', title: 'Risk', color: 'text-error' },
                        ].map((agent) => {
                          const insight = result.agentInsights[agent.key as keyof typeof result.agentInsights];
                          if (!insight) return null;
                          return (
                            <div key={agent.key} className="bg-surface-container-low rounded-xl p-4">
                              <div className="flex items-center space-x-2 mb-2">
                                <span className={cn('material-symbols-outlined text-[16px]', agent.color)}>{agent.icon}</span>
                                <p className="font-semibold text-xs text-on-surface">{agent.title} Agent</p>
                              </div>
                              <p className="text-xs text-on-surface-variant leading-relaxed">{insight}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Key Drivers + Risk Factors */}
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 p-6">
                      <div className="flex items-center space-x-2 mb-4">
                        <span className="material-symbols-outlined text-tertiary text-[20px]">insights</span>
                        <h4 className="font-headline font-bold text-on-surface">Key Drivers</h4>
                      </div>
                      <ul className="space-y-3">
                        {result.keyDrivers.map((driver, idx) => (
                          <li key={idx} className="flex items-start space-x-3">
                            <span className="material-symbols-outlined text-tertiary text-[16px] mt-0.5">
                              check_circle
                            </span>
                            <span className="text-sm text-on-surface-variant">{driver}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 p-6">
                      <div className="flex items-center space-x-2 mb-4">
                        <span className="material-symbols-outlined text-error text-[20px]">warning</span>
                        <h4 className="font-headline font-bold text-on-surface">Risk Factors</h4>
                      </div>
                      <ul className="space-y-3">
                        {result.riskFactors.map((risk, idx) => (
                          <li key={idx} className="flex items-start space-x-3">
                            <span className="material-symbols-outlined text-error text-[16px] mt-0.5">
                              error
                            </span>
                            <span className="text-sm text-on-surface-variant">{risk}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Timeline */}
                  <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 p-6">
                    <div className="flex items-center space-x-2 mb-5">
                      <span className="material-symbols-outlined text-primary text-[20px]">timeline</span>
                      <h4 className="font-headline font-bold text-on-surface">Simulated Price Path</h4>
                    </div>
                    <div className="space-y-0">
                      {result.timeline.map((item, idx) => (
                        <div key={idx} className="flex space-x-4">
                          <div className="flex flex-col items-center">
                            <div className="w-3 h-3 rounded-full bg-primary border-2 border-primary-fixed" />
                            {idx < result.timeline.length - 1 && (
                              <div className="w-0.5 flex-1 bg-outline-variant/30 my-1" />
                            )}
                          </div>
                          <div className="pb-6">
                            <p className="font-mono text-xs font-bold text-primary">{item.date}</p>
                            <p className="text-sm text-on-surface-variant mt-0.5">{item.event}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── SEBI Disclaimer ── */}
            <div className="bg-surface-container-low rounded-xl p-4 border border-outline-variant/10">
              <div className="flex items-start space-x-3">
                <span className="material-symbols-outlined text-on-surface-variant text-[18px] mt-0.5">info</span>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  {T('simulator', 'disclaimer', lang)}
                </p>
              </div>
            </div>
          </motion.div>
        ) : (
          /* ── History Tab ── */
          <motion.div
            key="history"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3 }}
            className="space-y-6"
          >
            <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 overflow-hidden">
              <div className="p-6 pb-4">
                <h3 className="font-headline font-bold text-on-surface">{T('simulator', 'pastSimulations', lang)}</h3>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  Your simulation results (in-memory, not stored)
                </p>
              </div>

              {pastSimulations.length > 0 ? (
                <div className="divide-y divide-outline-variant/10">
                  {pastSimulations.map((sim) => (
                    <div
                      key={sim.id}
                      className="px-6 py-4 flex items-center justify-between hover:bg-surface-container-low/50 transition-colors"
                    >
                      <div className="flex items-center space-x-4">
                        <div className={cn(
                          'w-10 h-10 rounded-xl flex items-center justify-center',
                          sim.direction === 'Bullish'
                            ? 'bg-tertiary-fixed/30'
                            : sim.direction === 'Bearish'
                              ? 'bg-error-container'
                              : 'bg-surface-container-high',
                        )}>
                          <span className={cn(
                            'material-symbols-outlined text-[20px]',
                            sim.direction === 'Bullish' ? 'text-tertiary' : sim.direction === 'Bearish' ? 'text-error' : 'text-on-surface-variant',
                          )}>
                            {sim.direction === 'Bullish' ? 'trending_up' : sim.direction === 'Bearish' ? 'trending_down' : 'trending_flat'}
                          </span>
                        </div>
                        <div>
                          <p className="font-semibold text-on-surface">
                            <span className="font-mono">{sim.stock}</span>
                            <span className="text-on-surface-variant font-normal"> — {sim.scenario}</span>
                          </p>
                          <p className="text-xs text-on-surface-variant mt-0.5">
                            {sim.date} • Target: <span className="font-mono">₹{sim.targetPrice.toLocaleString('en-IN')}</span>
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={cn(
                          'text-xs font-bold px-2.5 py-1 rounded-lg',
                          sim.direction === 'Bullish'
                            ? 'bg-tertiary-fixed/30 text-tertiary'
                            : sim.direction === 'Bearish'
                              ? 'bg-error-container text-error'
                              : 'bg-surface-container-high text-on-surface-variant',
                        )}>
                          {sim.direction} ({sim.confidence}%)
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-6 py-16 text-center">
                  <div className="w-20 h-20 mx-auto bg-surface-container-high rounded-full flex items-center justify-center mb-4">
                    <span className="material-symbols-outlined text-on-surface-variant text-[32px]">
                      science
                    </span>
                  </div>
                  <p className="font-semibold text-on-surface">{T('simulator', 'noPast', lang)}</p>
                  <p className="text-sm text-on-surface-variant mt-1">
                    {T('simulator', 'noPast', lang)}
                  </p>
                </div>
              )}
            </div>

            {/* Credits counter */}
            <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 p-6 text-center">
              <span className="material-symbols-outlined text-saffron text-[32px]">token</span>
              <p className="font-headline font-bold text-on-surface mt-3">
                {maxCredits === Infinity ? (
                  <span className="font-mono text-2xl">Unlimited</span>
                ) : (
                  <><span className="font-mono text-2xl">{creditsRemaining}</span> / {maxCredits}</>
                )}
              </p>
              <p className="text-sm text-on-surface-variant mt-1">
                AI credits remaining today
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
