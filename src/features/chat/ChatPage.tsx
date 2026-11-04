import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { loadSavedUserProfile, useAuthStore } from '@/stores/authStore';
import { usePlanStore } from '@/stores/planStore';
import { useLanguageStore } from '@/stores/languageStore';
import { calculateSchemeMatches, calculateUnclaimedBenefits } from '@/lib/schemeService';
import { fetchLiveStocks, fetchStockBySymbol, searchAndFetchStocks } from '@/lib/stockApi';
import type { StockData, UserProfile } from '@/types';
import { useProToolsStore, type ProToolsState } from '@/stores/proToolsStore';
import { SchemeDetailModal } from '@/components/shared/SchemeDetailModal';
import { buildTaxReport } from '@/lib/tax/engine';
import { quickToInput, useTaxCalcStore } from '@/stores/taxCalcStore';
import { Markdown } from '@/components/shared/Markdown';

// All chat goes to api/chat.js, which runs the self-hosted Gemma 4 model.
const CHAT_ENDPOINT = '/api/chat';


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

/* ── Types ─────────────────────────────────────── */

interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  content: string;
  reasoning?: string;
  timestamp: string;
  schemes?: SchemeCard[];
}

interface SchemeCard {
  kind: 'scheme' | 'scholarship';
  name: string;
  subtitle: string;
  description: string;
  url: string;
  slug?: string;
  closeDate?: string | null;
}

interface RecommendedItem {
  name: string;
  slug: string;
  url: string;
  level: string | null;
  state: string;
  ministry: string | null;
  categories: string[];
  tags: string[];
  description: string;
  close_date: string | null;
}

interface Recommendations {
  eligible_total: number;
  filters_applied: string[];
  search_terms: string[];
  schemes: RecommendedItem[];
  scholarships: RecommendedItem[];
}

type ChatRequestMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
      reasoning_content?: string | null;
    };
  }>;
}

type ScholarshipLevel = 'school' | 'diploma' | 'graduation' | 'postgraduation' | 'phd' | 'technical' | 'abroad';

interface LiveScholarship {
  id: string;
  name: string;
  provider: 'central' | 'state' | 'public-sector';
  department: string;
  education_levels: ScholarshipLevel[];
  target_groups: string[];
  benefits: string;
  eligibility: string;
  application_url: string;
  portal: string;
  specifications_url?: string;
  studentApplicationCloseDate?: string;
  deadline_hint: string;
  status: 'open' | 'expired';
}

interface ScholarshipFeed {
  meta?: {
    source: string;
    source_url?: string;
    fetched_at: string;
    total: number;
  };
  scholarships: LiveScholarship[];
  error?: string;
}

const STOCK_ALIASES: Record<string, string> = {
  reliance: 'RELIANCE',
  realiance: 'RELIANCE',
  rel: 'RELIANCE',
  tcs: 'TCS',
  infosys: 'INFY',
  infy: 'INFY',
  hdfc: 'HDFCBANK',
  hdfcbank: 'HDFCBANK',
  icici: 'ICICIBANK',
  icicibank: 'ICICIBANK',
  sbi: 'SBIN',
  tatamotors: 'TMPV',
  tata: 'TMPV',
  airtel: 'BHARTIARTL',
  bharti: 'BHARTIARTL',
  itc: 'ITC',
  adani: 'ADANIENT',
  axis: 'AXISBANK',
  kotak: 'KOTAKBANK',
  larsen: 'LT',
  lt: 'LT',
};

function formatINR(amount: number): string {
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

function getAge(dateOfBirth?: string): number | null {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;
  return Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
}

function humanize(value?: string): string {
  return value ? value.replace(/_/g, ' ') : '';
}

function formatEducationLevel(value?: string): string {
  const labels: Record<string, string> = {
    school: 'School',
    diploma: 'Diploma',
    graduation: 'Graduation',
    postgraduation: 'Post Graduation',
    phd: 'PhD / Research',
    technical: 'Technical / Professional',
    abroad: 'Study Abroad',
  };
  return value ? labels[value] || humanize(value) : '';
}

function formatStockPrice(stock: StockData): string {
  const currency = stock.currency || 'INR';
  const amount = stock.price.toLocaleString(currency === 'INR' ? 'en-IN' : 'en-US', {
    maximumFractionDigits: 2,
    minimumFractionDigits: stock.price < 100 ? 2 : 0,
  });
  return currency === 'INR' ? `₹${amount}` : `${currency} ${amount}`;
}

function formatVolume(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return 'N/A';
  if (value >= 10_000_000) return `${(value / 10_000_000).toFixed(2)} Cr`;
  if (value >= 100_000) return `${(value / 100_000).toFixed(2)} L`;
  return Math.round(value).toLocaleString('en-IN');
}

function formatSignal(signal: StockData['signal']): string {
  return signal.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function hasStockIntent(input: string): boolean {
  const lower = input.toLowerCase();
  return [
    'stock', 'share', 'cmp', 'rsi', 'signal', 'buy', 'sell', 'trade',
    'target', 'stoploss', 'stop-loss', 'volume', 'delivery', 'explain',
  ].some((word) => lower.includes(word)) || Object.keys(STOCK_ALIASES).some((alias) => lower.includes(alias));
}

function extractStockQuery(input: string): string | null {
  const lower = input.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const compact = lower.replace(/\s+/g, '');

  for (const [alias, symbol] of Object.entries(STOCK_ALIASES)) {
    if (compact.includes(alias)) return symbol;
  }

  const upperTokens = input
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 2 && token.length <= 12);

  const ignored = new Set(['STOCK', 'SHARE', 'EXPLAIN', 'ANALYSIS', 'BUY', 'SELL', 'RSI', 'CMP']);
  return upperTokens.find((token) => !ignored.has(token)) || null;
}

async function resolveAskedStock(input: string): Promise<StockData | null> {
  if (!hasStockIntent(input)) return null;

  const query = extractStockQuery(input);
  if (!query) return null;

  const direct = await fetchStockBySymbol(query);
  if (direct) return direct;

  const results = await searchAndFetchStocks(query);
  return results[0] || null;
}

function buildLiveStockContext(stock: StockData): string {
  const delivery = stock.delivery_source === 'exchange' && stock.delivery_pct > 0
    ? `${stock.delivery_pct.toFixed(1)}%`
    : 'N/A from current provider';
  const signalSource = stock.signal_source === 'live_history'
    ? 'live 1Y chart history'
    : stock.signal_source === 'partial_history'
      ? 'partial chart history'
      : 'estimated';

  return [
    'DhanSathi live stock context:',
    `Symbol: ${stock.symbol}`,
    `Company: ${stock.name}`,
    `Exchange: ${stock.exchange || 'NSE/Yahoo'}`,
    `CMP: ${formatStockPrice(stock)}`,
    `Change: ${stock.change >= 0 ? '+' : ''}${stock.change.toFixed(2)} (${stock.change_pct >= 0 ? '+' : ''}${stock.change_pct.toFixed(2)}%)`,
    `Volume: ${formatVolume(stock.volume)}; average volume: ${formatVolume(stock.avg_volume)}`,
    `Delivery percentage: ${delivery}`,
    `RSI 14: ${stock.rsi_14}`,
    `SMA 20/50/200: ${stock.sma_20.toFixed(2)} / ${stock.sma_50.toFixed(2)} / ${stock.sma_200.toFixed(2)}`,
    `52-week range: ${formatStockPrice({ ...stock, price: stock.week_52_low })} - ${formatStockPrice({ ...stock, price: stock.week_52_high })}`,
    `DhanSathi signal: ${formatSignal(stock.signal)} (${signalSource})`,
    `Data quality: ${stock.data_quality || 'partial'}; source: ${stock.data_source || 'market API'}`,
    stock.warning ? `Provider note: ${stock.warning}` : '',
  ].filter(Boolean).join('\n');
}

function buildStockMasterResponse(stock: StockData, user: UserProfile | null): string {
  const isAbove20 = stock.price >= stock.sma_20;
  const isAbove50 = stock.price >= stock.sma_50;
  const rsiView =
    stock.rsi_14 >= 70 ? 'RSI is overbought, so fresh entry needs patience.'
      : stock.rsi_14 <= 30 ? 'RSI is oversold, so watch for reversal confirmation.'
        : stock.rsi_14 >= 55 ? 'RSI shows positive momentum but is not extreme.'
          : stock.rsi_14 >= 45 ? 'RSI is neutral, so price confirmation matters.'
            : 'RSI is weak, so avoid aggressive buying until momentum improves.';
  const trendView = isAbove20 && isAbove50
    ? 'Price is above short and medium moving averages, which supports an uptrend bias.'
    : isAbove20
      ? 'Price is above SMA20 but not fully above SMA50, so trend is improving but not clean yet.'
      : 'Price is below SMA20, so wait for strength before considering entry.';
  const delivery = stock.delivery_source === 'exchange' && stock.delivery_pct > 0
    ? `${stock.delivery_pct.toFixed(1)}%`
    : 'N/A';

  return [
    `${stock.name} (${stock.symbol}) stock view`,
    '',
    `- CMP: ${formatStockPrice(stock)}`,
    `- Change: ${stock.change >= 0 ? '+' : ''}${stock.change.toFixed(2)} (${stock.change_pct >= 0 ? '+' : ''}${stock.change_pct.toFixed(2)}%)`,
    `- Volume: ${formatVolume(stock.volume)}; avg volume: ${formatVolume(stock.avg_volume)}`,
    `- Delivery %: ${delivery}`,
    `- RSI 14: ${stock.rsi_14}`,
    `- SMA 20/50/200: ${stock.sma_20.toFixed(2)} / ${stock.sma_50.toFixed(2)} / ${stock.sma_200.toFixed(2)}`,
    `- DhanSathi signal: ${formatSignal(stock.signal)}`,
    '',
    'Interpretation:',
    `- ${trendView}`,
    `- ${rsiView}`,
    `- Signal quality is ${stock.signal_source === 'live_history' ? 'stronger because it uses live chart history' : 'limited because some indicators are partial/estimated'}.`,
    '',
    'Trading discipline:',
    `- Bullish only if price sustains above ${formatStockPrice({ ...stock, price: Math.max(stock.sma_20, stock.sma_50) })}.`,
    `- Weak below ${formatStockPrice({ ...stock, price: stock.sma_20 })}; avoid averaging down blindly.`,
    `- For your profile${user?.annual_income ? ` with income ${formatINR(user.annual_income)}` : ''}, keep position size small and do not risk more than you can afford to lose.`,
    '',
    'This is educational analysis, not guaranteed profit or financial advice.',
  ].join('\n');
}

function getPersonalizedStockIdeas(user: UserProfile | null, liveStocks: StockData[]): StockData[] {
  const income = user?.annual_income ?? 0;
  const occupation = (user?.occupation || '').toLowerCase();
  const beginnerOrConservative =
    income > 0 && income < 600000 ||
    ['student', 'homemaker', 'retired', 'daily_wage_worker'].includes(occupation);

  const pool = beginnerOrConservative
    ? liveStocks.filter((stock) =>
      stock.pe_ratio > 0 &&
      stock.pe_ratio <= 30 &&
      stock.rsi_14 >= 35 &&
      stock.rsi_14 <= 65 &&
      ['buy', 'hold', 'strong_buy'].includes(stock.signal),
    )
    : liveStocks.filter((stock) => ['buy', 'strong_buy'].includes(stock.signal));

  return [...pool]
    .sort((a, b) => {
      const signalScore = (stock: StockData) => stock.signal === 'strong_buy' ? 2 : stock.signal === 'buy' ? 1 : 0;
      return signalScore(b) - signalScore(a) || b.change_pct - a.change_pct;
    })
    .slice(0, 5);
}

function matchesScholarshipProfile(scholarship: LiveScholarship, user: UserProfile | null): boolean {
  if (!user) return true;

  const text = `${scholarship.name} ${scholarship.department} ${scholarship.target_groups.join(' ')} ${scholarship.eligibility} ${scholarship.benefits}`.toLowerCase();
  
  // 1. Level Match (Strict)
  const levelMatch = user.education_level
    ? scholarship.education_levels.includes(user.education_level)
    : true;

  // 2. Category Match (Strictish)
  const category = user.category?.toLowerCase();
  let categoryMatch = true;
  if (category && category !== 'general') {
    // If scholarship specifically mentions a category, check if user matches it.
    // Otherwise assume it's open to all.
    const mentionsSC = text.includes(' sc ') || text.includes('scheduled caste');
    const mentionsST = text.includes(' st ') || text.includes('scheduled tribe');
    const mentionsOBC = text.includes(' obc ') || text.includes('other backward');
    const mentionsMinority = text.includes('minority');
    
    if (mentionsSC || mentionsST || mentionsOBC || mentionsMinority) {
      if (category === 'sc' && !mentionsSC) categoryMatch = false;
      if (category === 'st' && !mentionsST) categoryMatch = false;
      if (category === 'obc' && !mentionsOBC) categoryMatch = false;
      if (mentionsMinority && !user.is_minority) categoryMatch = false;
    }
  }

  // 3. Disability Match
  const disabilityMatch = user.has_disability ? true : !(text.includes('disabil') || text.includes('specially abled'));

  // 4. Gender Match (Strict)
  let genderMatch = true;
  if (text.includes('girl') || text.includes('women') || text.includes('female')) {
    genderMatch = user.gender === 'female';
  } else if (text.includes(' boy') || text.includes(' male')) {
    genderMatch = user.gender === 'male';
  }

  // 5. Income Match (Heuristic extraction)
  let incomeMatch = true;
  if (user.annual_income != null) {
    const lakhMatch = text.match(/income.*?(\d+(?:\.\d+)?)\s*lakh/);
    if (lakhMatch) {
      const maxIncome = parseFloat(lakhMatch[1]) * 100000;
      if (user.annual_income > maxIncome) {
        incomeMatch = false;
      }
    }
  }

  // 6. Marks Match (Heuristic extraction)
  let marksMatch = true;
  if (user.last_exam_percentage != null) {
    const pctMatch = text.match(/(\d{2})%\s*marks/);
    if (pctMatch) {
      const minMarks = parseFloat(pctMatch[1]);
      if (user.last_exam_percentage < minMarks) {
        marksMatch = false;
      }
    }
  }

  // 7. State-specific and special-group schemes only for the right people
  const stateText = `${scholarship.name} ${scholarship.department}`.toLowerCase();
  const stateMatch =
    !user.state ||
    !(scholarship as LiveScholarship & { state?: string }).state ||
    (scholarship as LiveScholarship & { state?: string }).state!.toLowerCase().includes(user.state.toLowerCase());
  const regionMatch =
    !/jammu|kashmir|ladakh/.test(stateText) || /jammu|kashmir|ladakh/i.test(user.state || '');
  const neMatch = !/north eastern|\bner\b/.test(stateText) ||
    /assam|arunachal|manipur|meghalaya|mizoram|nagaland|sikkim|tripura/i.test(user.state || '');
  const serviceMatch =
    !scholarship.target_groups.includes('Wards of service personnel') || !!user.is_ex_serviceman_family;

  return levelMatch && categoryMatch && disabilityMatch && genderMatch && incomeMatch && marksMatch && stateMatch && regionMatch && neMatch && serviceMatch;
}

function buildScholarshipContext(user: UserProfile | null, feed: ScholarshipFeed | null): string {
  if (!feed?.scholarships?.length) {
    return [
      'Live Scholarship Context:',
      'No live scholarship feed is available in this chat turn. Ask the user to open Scholarships or retry.',
    ].join('\n');
  }

  const relevant = feed.scholarships
    .filter((scholarship) => matchesScholarshipProfile(scholarship, user))
    .slice(0, 18);
  const allScholarships = feed.scholarships.slice(0, 40);
  const selected = relevant.length ? relevant : allScholarships;

  const lines = selected.map((scholarship, index) => {
    const deadline = scholarship.studentApplicationCloseDate || scholarship.deadline_hint || 'Check official portal';
    const levels = scholarship.education_levels.map(formatEducationLevel).join(', ');
    const details = scholarship.specifications_url || scholarship.application_url;
    return `${index + 1}. ${scholarship.name} | ${scholarship.department} | Levels: ${levels} | Groups: ${scholarship.target_groups.join(', ')} | Deadline: ${deadline} | Details: ${details}`;
  });

  return [
    'Live Scholarship Context from official source:',
    `Source: ${feed.meta?.source || 'National Scholarship Portal'} (${feed.meta?.source_url || 'official portal'})`,
    `Fetched at: ${feed.meta?.fetched_at || 'current request'}; open scholarships available: ${feed.scholarships.length}`,
    user?.education_level
      ? `User education level for matching: ${formatEducationLevel(user.education_level)}`
      : 'User education level is missing; ask them to update Settings for better matches.',
    'Relevant/open scholarships DhanSathi can discuss:',
    ...lines,
    'Important: scholarship dates and rules change. Always tell the user to verify final eligibility, documents, and deadlines on the official portal/specification link.',
  ].join('\n');
}

async function loadLiveScholarshipFeed(): Promise<ScholarshipFeed | null> {
  const day = new Date().toISOString().slice(0, 10);
  const cacheKey = `dhansathi-live-scholarships:${day}`;

  try {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) return JSON.parse(cached) as ScholarshipFeed;
    } catch {
      // storage blocked — fetch instead
    }

    const response = await fetch(`/api/scholarships?day=${day}`);
    if (!response.ok) throw new Error(`Scholarship feed failed: ${response.status}`);
    const feed = await response.json() as ScholarshipFeed;
    if (feed.error) throw new Error(feed.error);
    try {
      localStorage.setItem(cacheKey, JSON.stringify(feed));
    } catch {
      // ~1.5 MB may exceed the storage quota; the chat already has the data.
    }
    return feed;
  } catch (error) {
    console.warn('[ChatPage] Scholarship context lookup failed:', error);
    return null;
  }
}

function buildPersonalizationContext(user: UserProfile | null, liveStocks: StockData[]): string {
  if (!user) {
    return [
      'No saved user profile is available yet.',
      'Ask the user to complete Settings for more accurate scheme and stock guidance.',
    ].join('\n');
  }

  const age = getAge(user.date_of_birth);
  const yesNo = (value?: boolean) => (value == null ? 'Not provided' : value ? 'Yes' : 'No');
  // Everything from Settings that affects eligibility. PAN, Aadhaar, phone and
  // email are deliberately never sent to the AI.
  const profileLines = [
    `Name: ${user.full_name || 'Not provided'}`,
    `Age: ${age ?? 'Not provided'}`,
    `Gender: ${user.gender || 'Not provided'}`,
    `State: ${user.state || 'Not provided'}`,
    `District: ${user.district || 'Not provided'}`,
    `Category: ${user.category?.toUpperCase() || 'Not provided'}`,
    `Occupation: ${humanize(user.occupation) || 'Not provided'}`,
    `Parent occupation: ${humanize(user.parent_occupation) || 'Not provided'}`,
    `Annual family income: ${user.annual_income != null ? formatINR(user.annual_income) : 'Not provided'}`,
    `BPL card: ${yesNo(user.is_bpl)}`,
    `Disability: ${yesNo(user.has_disability)}`,
    `Minority community: ${yesNo(user.is_minority)}`,
    `Farmer family: ${yesNo(user.is_farmer_family)}`,
    `Orphan / single parent: ${yesNo(user.is_orphan_single_parent)}`,
    `Ex-serviceman family: ${yesNo(user.is_ex_serviceman_family)}`,
    `Education level: ${formatEducationLevel(user.education_level) || 'Not provided'}`,
    `Current course/class: ${user.current_course || 'Not provided'}`,
    `Stream: ${user.stream || 'Not provided'}`,
    `Institution: ${user.institution_name || 'Not provided'} (${user.institution_type || 'type not provided'})`,
    `Board/University: ${user.board_university || 'Not provided'}`,
    `Current year/semester: ${user.current_year || 'Not provided'}`,
    `Passing year: ${user.passing_year || 'Not provided'}`,
    `Last exam percentage: ${user.last_exam_percentage != null ? `${user.last_exam_percentage}%` : 'Not provided'}`,
    `Hosteller: ${yesNo(user.is_hosteller)}`,
    `Documents ready — income certificate: ${yesNo(user.has_income_certificate)}, caste certificate: ${yesNo(user.has_caste_certificate)}, domicile certificate: ${yesNo(user.has_domicile_certificate)}, Aadhaar-seeded bank account: ${yesNo(user.is_aadhaar_bank_linked)}`,
  ];

  const matches = calculateSchemeMatches(user).slice(0, 5);
  const benefits = calculateUnclaimedBenefits(user);
  const schemeLines = matches.map((match, index) => {
    const reasons = match.reasons.slice(0, 3).join('; ') || 'Partial profile match';
    const gaps = match.missingCriteria.slice(0, 2).join('; ');
    return `${index + 1}. ${match.scheme.name} (${match.score}% match): ${match.scheme.benefits || match.scheme.description}. Why: ${reasons}${gaps ? `. Gaps: ${gaps}` : ''}`;
  });

  const stockLines = getPersonalizedStockIdeas(user, liveStocks).map((stock, index) =>
    `${index + 1}. ${stock.symbol} (${stock.name}) - ${stock.signal.replace(/_/g, ' ')}, price ${formatINR(stock.price)}, RSI ${stock.rsi_14}, PE ${stock.pe_ratio}. Confirm live CMP and risk in Stocks/DhanMitra before trading.`,
  );

  return [
    'Saved User Profile:',
    ...profileLines,
    '',
    `Estimated eligible schemes: ${benefits.schemeCount}; estimated potential benefits: ${formatINR(benefits.totalAmount)}.`,
    'Popular central schemes from the DhanSathi curated list (with known benefit amounts):',
    ...(schemeLines.length ? schemeLines : ['No strong scheme matches yet. Ask for missing profile details.']),
    '',
    'Stock/trade context from DhanSathi screener:',
    ...(stockLines.length ? stockLines : ['No stock ideas matched the saved profile risk filters.']),
  ].join('\n');
}

/* ── Profile-matched schemes & scholarships ────── */

const BENEFIT_INTENT =
  /scheme|yojana|yojna|scholar|fellowship|stipend|eligib|patra|benefit|subsidy|pension|loan|insurance|bima|housing|awas|kisan|farmer|student|padhai|college|school|women|mahila|girl|beti|widow|disab|divyang|ration|health|treatment|job|rozgar|naukri|योजना|छात्रवृत्ति|पात्र|पेंशन|किसान|लोन|बीमा|आवास|महिला|बेटी|पढ़ाई|स्वास्थ्य|नौकरी|रोजगार/i;

function missingProfileFields(user: UserProfile | null): string[] {
  if (!user) return ['state', 'age', 'gender', 'category', 'annual income', 'occupation'];
  return [
    !user.state && 'state',
    !user.date_of_birth && 'date of birth',
    !user.gender && 'gender',
    !user.category && 'category',
    user.annual_income == null && 'annual income',
    !user.occupation && 'occupation',
    user.is_bpl == null && 'BPL status',
  ].filter(Boolean) as string[];
}

async function fetchRecommendations(user: UserProfile | null, question: string): Promise<Recommendations | null> {
  try {
    const response = await fetch('/api/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Only eligibility fields leave the browser.
      body: JSON.stringify({
        question,
        profile: user
          ? {
              state: user.state,
              gender: user.gender,
              category: user.category,
              occupation: user.occupation,
              education_level: user.education_level,
              age: getAge(user.date_of_birth) ?? undefined,
              has_disability: user.has_disability,
              is_minority: user.is_minority,
              is_bpl: user.is_bpl,
              is_farmer_family: user.is_farmer_family,
              is_orphan_single_parent: user.is_orphan_single_parent,
              is_ex_serviceman_family: user.is_ex_serviceman_family,
            }
          : {},
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return null;
    return (await response.json()) as Recommendations;
  } catch (error) {
    console.warn('[ChatPage] Recommendation lookup failed:', error);
    return null;
  }
}

function describeItem(item: RecommendedItem, index: number): string {
  const where = item.state === 'All India' ? 'All India (central)' : item.state;
  const closes = item.close_date ? ` | Last date: ${item.close_date}` : '';
  return `${index + 1}. ${item.name} | ${where} | ${item.ministry || 'Government'} | ${item.description}${closes} | Details & apply: ${item.url}`;
}

function buildRecommendationContext(rec: Recommendations | null, user: UserProfile | null): string {
  const missing = missingProfileFields(user);
  if (!rec) {
    return 'Website scheme search is unavailable this turn. Recommend only from the curated list above and suggest the Schemes page.';
  }
  return [
    'SCHEMES THIS USER IS ELIGIBLE FOR — from the DhanSathi website catalogue (myScheme, Government of India), already filtered by the official eligibility rules for this profile:',
    `Eligibility filters applied: ${rec.filters_applied.join('; ') || 'none (profile incomplete)'}.`,
    `Total eligible schemes on the website for this profile: ${rec.eligible_total}. Ranked for this question by: ${rec.search_terms.join(', ') || 'general relevance'}.`,
    ...(rec.schemes.length ? rec.schemes.map(describeItem) : ['(no matching schemes for this question)']),
    ...(rec.scholarships.length
      ? ['', 'SCHOLARSHIPS THIS USER IS ELIGIBLE FOR (same filters):', ...rec.scholarships.map(describeItem)]
      : []),
    '',
    missing.length
      ? `Profile fields still missing in Settings (ask the user to fill these for sharper matches): ${missing.join(', ')}.`
      : 'The profile is complete.',
  ].join('\n');
}

function recommendationCards(rec: Recommendations | null, question: string, user: UserProfile | null): SchemeCard[] | undefined {
  if (!rec) return undefined;
  // Scholarships join the cards for study questions, or for open "what am I eligible for" questions from students.
  const wantsStudy =
    /scholar|fellowship|stipend|student|padhai|college|school|छात्रवृत्ति|पढ़ाई/i.test(question) ||
    (!!user?.education_level && /eligib|patra|पात्र|kya mil|what can i get|for me|mere liye/i.test(question));
  const toCard = (item: RecommendedItem, kind: SchemeCard['kind']): SchemeCard => ({
    kind,
    name: item.name,
    subtitle: [item.state === 'All India' ? 'Central · All India' : item.state, item.ministry].filter(Boolean).join(' · '),
    description: item.description,
    url: item.url,
    slug: item.slug,
    closeDate: item.close_date,
  });
  const asksStudy = /scholar|fellowship|stipend|chhatravrit|छात्रवृत्ति|स्कॉलरशिप/i.test(question);
  const cards = asksStudy && rec.scholarships.length
    ? rec.scholarships.slice(0, 6).map((i) => toCard(i, 'scholarship'))
    : [
        ...(wantsStudy ? rec.scholarships.slice(0, 3).map((i) => toCard(i, 'scholarship')) : []),
        ...rec.schemes.slice(0, wantsStudy && rec.scholarships.length ? 3 : 5).map((i) => toCard(i, 'scheme')),
      ];
  return cards.length ? cards : undefined;
}

/* ── Sample data ───────────────────────────────── */

const WELCOME_EN =
  'Namaste! I\'m your DhanSathi AI assistant. I can help you discover unclaimed government benefits, analyze stocks, calculate SIP returns, and provide personalized financial guidance. How can I help you today?';

const WELCOME_HI =
  'नमस्ते! मैं आपका DhanSathi AI सहायक हूँ। मैं सरकारी योजनाओं, स्टॉक विश्लेषण, SIP रिटर्न, और वित्तीय सलाह में आपकी मदद कर सकता हूँ।';

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: '1',
    role: 'ai',
    content: WELCOME_EN,
    timestamp: '',
  },
];

const SUGGESTED_PROMPTS_EN = [
  { label: 'Check my eligibility', icon: 'person_search' },
  { label: 'Find scholarships for me', icon: 'school' },
  { label: 'Stock analysis', icon: 'monitoring' },
  { label: 'SIP calculator', icon: 'calculate' },
];

const SUGGESTED_PROMPTS_HI = [
  { label: 'मेरी पात्रता जांचें', icon: 'person_search' },
  { label: 'मेरे लिए छात्रवृत्ति खोजें', icon: 'school' },
  { label: 'स्टॉक विश्लेषण', icon: 'monitoring' },
  { label: 'SIP कैलकुलेटर', icon: 'calculate' },
];

/* ── Typing Indicator ──────────────────────────── */

function TypingIndicator() {
  return (
    <div className="flex items-center space-x-1.5 px-4 py-3">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="w-2 h-2 bg-on-surface-variant/40 rounded-full"
          animate={{ y: [0, -6, 0] }}
          transition={{
            duration: 0.6,
            repeat: Infinity,
            delay: i * 0.15,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}

/* ── Component ─────────────────────────────────── */

/** The user's latest Tax Calculator result, computed by the same engine the calculator page uses. */
function taxCalculatorContext(): string {
  const { mode, quick, input, regimeChoice } = useTaxCalcStore.getState();
  const effective = mode === 'quick' ? quickToInput(quick, input) : input;
  const report = buildTaxReport(effective, regimeChoice === 'auto' ? undefined : regimeChoice);
  if (report.new.totalIncome === 0 && report.old.totalIncome === 0) {
    return '- Tax Calculator: not filled yet (suggest opening Pro Tools → Tax Calculator).';
  }
  const c = report.chosen;
  return [
    `- Tax Calculator (${report.yearLabel}): taxable income ${formatINR(c.totalIncome)}; tax new regime ${formatINR(report.new.totalTax)}, old regime ${formatINR(report.old.totalTax)} — ${report.better} regime is better by ${formatINR(report.saving)}.`,
    `  Deductions used (${report.chosenRegime} regime): ${c.deductions.map((d) => `${d.label} ${formatINR(d.amount)}`).join('; ') || 'none'}.`,
    `  ${report.netPayable < 0 ? `Refund due ${formatINR(-report.netPayable)}` : `Balance payable ${formatINR(report.netPayable)}`}; ITR form ${report.itr.form}.`,
    `  Calculator suggestions: ${report.suggestions.map((s) => s.title).join('; ') || 'none'}.`,
  ].join('\n');
}

function buildSystemPrompt(
  user: UserProfile | null,
  isHindi: boolean = false,
  liveStockContext = '',
  liveStocks: StockData[] = [],
  proTools: ProToolsState | null = null,
  scholarshipContext = '',
  recommendationContext = '',
): string {
  let prompt = `You are DhanSathi, a helpful financial assistant for users in India. You help with government scheme eligibility, stock analysis, SIP calculations, tax calculations, budget analysis, and personalized financial guidance.

You can see the user's full saved profile from Settings below. Use it in every answer about schemes or scholarships — never ask for a detail that is already in the profile.

SCHEMES & SCHOLARSHIPS — STRICT RULES:
- Recommend ONLY schemes and scholarships that appear in the lists below (the website's eligibility-filtered list, the curated list, or the live scholarship feed). Never invent a scheme, amount, deadline or link.
- Prefer the "SCHEMES THIS USER IS ELIGIBLE FOR" list: it is already filtered by official eligibility rules for this user's state, gender and category. Pick the 3-5 most useful for the question.
- For each one give: **Name**, what it gives, **Why it matches you** (cite the profile facts — state, category, occupation, age, income), and the official link as a markdown link.
- Only state a benefit amount or income limit if it is written in the list. Otherwise write "see Details for the exact amount". The cards under your answer open the full official details.
- Tell the user how many schemes in total match their profile on the website and that they can see all of them on the Schemes and Scholarships pages.
- If profile fields are missing, say which ones and ask the user to add them in Settings.

If the user asks about scholarships, use the scholarship lists first, match by education level, category, disability, gender, income and state where possible, and mention missing profile details. ALWAYS provide the direct application or details URL for each suggested scholarship using markdown links (e.g. [Apply Here](URL)) so the user can easily click and apply. If the user asks about schemes, recommend the strongest matches first, explain why they match, mention missing profile details if any, and suggest the next action. If the user asks about stocks or trades, use the live stock context first when available. Include CMP, change %, volume, delivery %, RSI, trend, signal, entry discipline, stop-loss thinking, position sizing, and avoid guaranteed-profit language. Always include a short reminder that stock ideas are educational and not financial advice.

When recommending schemes or scholarships, ALWAYS use a clear structured format. Use bold headings for: **Scheme Name**, **Benefits**, **Why it matches you**, and **Next Steps**. Also explicitly remind the user: "You can track this application by clicking 'Track' on the scheme/scholarship card in your Dashboard to add it to your Application Tracker."

${buildPersonalizationContext(user, liveStocks)}

${recommendationContext}

${scholarshipContext}

${liveStockContext}`;

  if (proTools) {
    const totalIncome = proTools.budgetIncomes.reduce((a: number, b: any) => a + b.amount, 0);
    const totalExp = proTools.budgetNeeds.reduce((a: number, b: any) => a + b.amount, 0) + proTools.budgetWants.reduce((a: number, b: any) => a + b.amount, 0);
    const totalSav = proTools.budgetSavings.reduce((a: number, b: any) => a + b.amount, 0);
    
    prompt += `\n\nUser's Pro Tools Data (from the DhanSathi Tax Calculator and Budget Analyzer):
- Budget: Total Income ₹${totalIncome}, Total Expenses ₹${totalExp}, Total Savings ₹${totalSav}.
${taxCalculatorContext()}
If the user asks about their taxes, tax calculator, or budget, explicitly acknowledge that you have fetched their record and use these exact numbers to provide customized advice.`;
  }

  prompt += `\n\nYou are bilingual in Hindi and English. If the user writes in Hindi (Devanagari script or Hinglish), respond in Hindi. If they write in English, respond in English. Use simple, friendly language that a common Indian citizen can understand. Use ₹ for Indian currency.`;

  if (isHindi) {
    prompt = `Please respond in Hindi (Devanagari script).\n\n` + prompt;
  }

  return prompt;
}

async function requestDhanSathiAI(messages: ChatRequestMessage[]): Promise<{ content: string; reasoning: string }> {
  const response = await fetch(CHAT_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messages }),
    signal: AbortSignal.timeout(65000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Chat failed with HTTP ${response.status}: ${body.slice(0, 240)}`);
  }

  const data = await response.json() as ChatCompletionResponse;
  const message = data.choices?.[0]?.message;
  return {
    content: (message?.content || '').trim(),
    reasoning: (message?.reasoning_content || '').trim(),
  };
}

export default function ChatPage() {
  const user = useAuthStore((s) => s.user);
  const effectiveUser = user ?? loadSavedUserProfile();
  const planUseCredit = usePlanStore((s) => s.useCredit);
  const planRemaining = usePlanStore((s) => s.getRemainingCredits);
  const proTools = useProToolsStore();
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const { lang, toggleLang } = useLanguageStore();
  const isHindi = lang === 'hi';
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messageIdRef = useRef(0);
  const [openCard, setOpenCard] = useState<SchemeCard | null>(null);

  const nextMessageId = () => {
    messageIdRef.current += 1;
    return `chat-${messageIdRef.current}`;
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSend = async (text?: string) => {
    const messageText = text || inputValue.trim();
    if (!messageText) return;

    // Check credits before sending
    if (!planUseCredit('ai_chat')) {
      const noCreditsMsg: ChatMessage = {
        id: nextMessageId(),
        role: 'ai',
        content: 'AI credits are unavailable right now. Please try again tomorrow.',
        timestamp: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
      };
      setMessages((prev) => [...prev, noCreditsMsg]);
      setInputValue('');
      return;
    }

    const userMessage: ChatMessage = {
      id: nextMessageId(),
      role: 'user',
      content: messageText,
      timestamp: new Date().toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);

    let askedStock: StockData | null = null;
    let liveStockContext = '';
    let liveStocks: StockData[] = [];
    let scholarshipFeed: ScholarshipFeed | null = null;
    let scholarshipContext = '';
    let recommendations: Recommendations | null = null;
    const wantsBenefits = BENEFIT_INTENT.test(messageText) || !hasStockIntent(messageText.toLowerCase());
    try {
      const [stocks, scholarships, recs] = await Promise.all([
        fetchLiveStocks().catch((error) => {
          console.warn('[ChatPage] Stock list lookup failed:', error);
          return [] as StockData[];
        }),
        loadLiveScholarshipFeed(),
        wantsBenefits ? fetchRecommendations(effectiveUser, messageText) : Promise.resolve(null),
      ]);
      liveStocks = stocks;
      scholarshipFeed = scholarships;
      recommendations = recs;
      scholarshipContext = buildScholarshipContext(effectiveUser, scholarshipFeed);
      askedStock = await resolveAskedStock(messageText);
      liveStockContext = askedStock ? buildLiveStockContext(askedStock) : '';
    } catch (error) {
      console.warn('[ChatPage] Context lookup failed:', error);
    }

    const cards = BENEFIT_INTENT.test(messageText) ? recommendationCards(recommendations, messageText, effectiveUser) : undefined;

    const addFallbackResponse = (includeNotice = false) => {
      const aiResponse: ChatMessage = {
        id: nextMessageId(),
        role: 'ai',
        content: `${includeNotice ? 'Live AI is unavailable right now, so I am using DhanSathi smart mode.\n\n' : ''}${getAIResponse(messageText, effectiveUser, askedStock, liveStocks, scholarshipFeed, recommendations)}`,
        schemes: cards,
        timestamp: new Date().toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }),
      };

      setIsTyping(false);
      setMessages((prev) => [...prev, aiResponse]);
    };

    try {
      const chatHistory: ChatRequestMessage[] = messages
        .filter(m => !['1', '2', '3'].includes(m.id)) // Skip all initial mock messages to ensure strict role alternation
        .map(m => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.content
        }));

      const aiResult = await requestDhanSathiAI([
          {
            role: "system",
            content: buildSystemPrompt(
              effectiveUser,
              isHindi,
              liveStockContext,
              liveStocks,
              proTools,
              scholarshipContext,
              wantsBenefits ? buildRecommendationContext(recommendations, effectiveUser) : '',
            ),
          },
          ...chatHistory,
          { role: "user", content: liveStockContext ? `${messageText}\n\n${liveStockContext}` : messageText }
        ]);

      const responseId = nextMessageId();

      setMessages((prev) => [
        ...prev,
        {
          id: responseId,
          role: 'ai',
          content: aiResult.content || getAIResponse(messageText, effectiveUser, askedStock, liveStocks, scholarshipFeed, recommendations),
          reasoning: aiResult.reasoning,
          schemes: cards,
          timestamp: new Date().toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          }),
        },
      ]);
      setIsTyping(false);
    } catch (error) {
      console.error('[ChatPage] AI request failed, using fallback response:', error);
      addFallbackResponse(true);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={stagger}
      className="flex flex-col h-[calc(100dvh-11rem)] md:h-[calc(100vh-6rem)]"
    >
      {/* ── Header ── */}
      <motion.div variants={fadeUp} custom={0} className="mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary-container rounded-xl flex items-center justify-center">
              <span className="material-symbols-outlined text-white text-[22px]">psychology</span>
            </div>
            <div>
              <h1 className="font-headline text-xl md:text-2xl font-extrabold text-on-surface">
                Ask DhanSathi
              </h1>
              <p className="text-xs text-on-surface-variant">AI-powered financial assistant</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={toggleLang}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-bold border transition-all',
                isHindi
                  ? 'bg-primary text-white border-primary'
                  : 'bg-surface-container-lowest text-on-surface-variant border-outline-variant/30 hover:border-primary/40',
              )}
              title={isHindi ? 'Switch to English' : 'हिंदी में बदलें'}
            >
              {isHindi ? 'हिं' : 'EN'}
            </button>
          </div>
        </div>
      </motion.div>

      {/* ── Chat Messages ── */}
      <motion.div
        variants={fadeUp}
        custom={1}
        className="flex-1 overflow-y-auto rounded-2xl bg-surface-container-lowest border border-outline-variant/20 p-4 md:p-6 space-y-4"
      >
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              'flex',
              message.role === 'user' ? 'justify-end' : 'justify-start',
            )}
          >
            <div
              className={cn(
                'max-w-[85%] md:max-w-[70%]',
                message.role === 'user' ? 'order-1' : 'order-1',
              )}
            >
              {/* Avatar + Bubble */}
              <div
                className={cn(
                  'flex items-start space-x-3',
                  message.role === 'user' ? 'flex-row-reverse space-x-reverse' : '',
                )}
              >
                {/* Avatar */}
                <div
                  className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-1',
                    message.role === 'ai'
                      ? 'bg-gradient-to-br from-primary to-primary-container'
                      : 'bg-gradient-to-br from-saffron to-secondary-container',
                  )}
                >
                  {message.role === 'ai' ? (
                    <span className="material-symbols-outlined text-white text-[16px]">
                      psychology
                    </span>
                  ) : (
                    <span className="text-white font-bold text-xs">R</span>
                  )}
                </div>

                {/* Message Bubble */}
                <div>
                  <div
                    className={cn(
                      'rounded-2xl px-4 py-3',
                      message.role === 'ai'
                        ? 'bg-surface-container-low text-on-surface rounded-tl-sm'
                        : 'bg-primary text-white rounded-tr-sm',
                    )}
                  >
                    {message.reasoning && (
                      <div className="mb-2 p-2 bg-on-surface-variant/5 rounded-lg border-l-2 border-primary/30 text-[11px] italic text-on-surface-variant/70 font-mono leading-tight">
                        <div className="flex items-center space-x-1 mb-1 opacity-50">
                          <span className="material-symbols-outlined text-[12px]">psychology</span>
                          <span className="font-bold uppercase tracking-wider">Thinking Process</span>
                        </div>
                        {message.reasoning}
                      </div>
                    )}
                    {message.role === 'ai' && message.id !== '1' ? (
                      <Markdown text={message.content} className="space-y-2 text-sm leading-relaxed text-on-surface" />
                    ) : (
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">
                        {message.id === '1' ? (isHindi ? WELCOME_HI : WELCOME_EN) : message.content}
                      </p>
                    )}
                  </div>

                  {/* Scheme & scholarship cards (from the website catalogue, filtered for this profile) */}
                  {message.schemes && (
                    <div className="mt-3 space-y-2">
                      {message.schemes.map((card) => (
                        <div
                          key={`${card.kind}-${card.slug || card.name}`}
                          className="bg-white rounded-xl border border-outline-variant/20 p-4 hover:shadow-md transition-shadow"
                        >
                          <div className="flex items-start space-x-3">
                            <div className="w-9 h-9 rounded-lg bg-primary-fixed flex items-center justify-center flex-shrink-0">
                              <span className="material-symbols-outlined text-primary text-[18px]">
                                {card.kind === 'scholarship' ? 'school' : 'account_balance'}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-on-surface text-sm leading-snug">{card.name}</p>
                              <p className="text-[11px] text-on-surface-variant mt-0.5">
                                {card.kind === 'scholarship' ? 'Scholarship' : 'Scheme'} · {card.subtitle}
                                {card.closeDate && <span className="text-error font-semibold"> · Last date {card.closeDate}</span>}
                              </p>
                              <p className="text-xs text-on-surface-variant mt-1 line-clamp-2">{card.description}</p>
                              <div className="flex gap-2 mt-2">
                                <button
                                  onClick={() => setOpenCard(card)}
                                  className="inline-flex items-center gap-1 text-xs font-bold text-primary border border-primary/30 hover:bg-primary-fixed px-2.5 py-1 rounded-lg"
                                >
                                  <span className="material-symbols-outlined text-[14px]">menu_book</span>
                                  Details
                                </button>
                                <a
                                  href={card.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs font-bold text-on-primary bg-primary hover:bg-primary-container px-2.5 py-1 rounded-lg"
                                >
                                  <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                                  Apply
                                </a>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Timestamp */}
                  <p
                    className={cn(
                      'text-[10px] mt-1 px-1',
                      message.role === 'ai'
                        ? 'text-on-surface-variant/60'
                        : 'text-on-surface-variant/60 text-right',
                    )}
                  >
                    {message.timestamp}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* Typing Indicator */}
        <AnimatePresence>
          {isTyping && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex items-start space-x-3"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary-container flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-white text-[16px]">psychology</span>
              </div>
              <div className="bg-surface-container-low rounded-2xl rounded-tl-sm">
                <TypingIndicator />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={messagesEndRef} />
      </motion.div>

      {/* ── Suggested Prompts ── */}
      <motion.div variants={fadeUp} custom={2} className="mt-3">
        <div className="flex flex-wrap gap-2">
          {(isHindi ? SUGGESTED_PROMPTS_HI : SUGGESTED_PROMPTS_EN).map((prompt) => (
            <button
              key={prompt.label}
              onClick={() => handleSend(prompt.label)}
              disabled={isTyping}
              className={cn(
                'flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all border border-outline-variant/20',
                isTyping
                  ? 'bg-surface-container-low text-on-surface-variant/50 cursor-not-allowed'
                  : 'bg-surface-container-lowest text-on-surface-variant hover:bg-primary-fixed hover:text-primary hover:border-primary/20',
              )}
            >
              <span className="material-symbols-outlined text-[14px]">{prompt.icon}</span>
              <span>{prompt.label}</span>
            </button>
          ))}
        </div>
      </motion.div>

      {/* ── Input Area ── */}
      <motion.div
        variants={fadeUp}
        custom={3}
        className="mt-3 space-y-2"
      >
        {/* Credit indicator */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center space-x-1.5 text-xs text-on-surface-variant">
            <span className="material-symbols-outlined text-[14px] text-saffron">token</span>
            <span>
              {Number.isFinite(planRemaining('ai_chat')) ? (
                <><span className="font-mono font-semibold">{planRemaining('ai_chat')}</span> credits today</>
              ) : (
                <><span className="font-mono font-semibold">Unlimited</span> credits today</>
              )}
            </span>
            <span className="text-[10px] font-bold text-primary bg-primary-fixed/40 px-1.5 py-0.5 rounded">FULL ACCESS</span>
          </div>
        </div>
      </motion.div>
      <motion.div
        variants={fadeUp}
        custom={3}
        className="flex items-center space-x-3"
      >
        <div className="flex-1 relative">
          <input
            ref={inputRef}
            type="text"
            placeholder="Ask me anything about finance, schemes, stocks..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isTyping}
            className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-2xl pl-5 pr-12 py-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button
            onClick={() => handleSend()}
            disabled={!inputValue.trim() || isTyping}
            className={cn(
              'absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-xl flex items-center justify-center transition-all',
              inputValue.trim() && !isTyping
                ? 'bg-primary text-white hover:bg-primary-container shadow-md'
                : 'bg-surface-container-high text-on-surface-variant/40',
            )}
          >
            <span className="material-symbols-outlined text-[20px]">send</span>
          </button>
        </div>
      </motion.div>

      {openCard && (
        <SchemeDetailModal
          title={openCard.name}
          slug={openCard.slug}
          applyUrl={openCard.url}
          fallback={{ description: openCard.description, deadline: openCard.closeDate ?? undefined, department: openCard.subtitle }}
          onClose={() => setOpenCard(null)}
        />
      )}
    </motion.div>
  );
}

/* ── Offline fallback answers (used only when the AI is unreachable) ── */

function getAIResponse(
  userInput: string,
  user: UserProfile | null,
  askedStock: StockData | null = null,
  liveStocks: StockData[] = [],
  scholarshipFeed: ScholarshipFeed | null = null,
  recommendations: Recommendations | null = null,
): string {
  const input = userInput.toLowerCase();
  const matches = user ? calculateSchemeMatches(user).slice(0, 3) : [];
  const stockIdeas = getPersonalizedStockIdeas(user, liveStocks).slice(0, 3);
  const scholarshipMatches = (scholarshipFeed?.scholarships || [])
    .filter((scholarship) => matchesScholarshipProfile(scholarship, user))
    .slice(0, 5);
  const profileIntro = user
    ? `Using your saved profile (${user.state || 'state not set'}, ${formatEducationLevel(user.education_level) || 'education not set'}, ${humanize(user.occupation) || 'occupation not set'}, income ${user.annual_income != null ? formatINR(user.annual_income) : 'not set'}), `
    : '';

  if (input.includes('salary') || input.includes('income') || input.includes('वेतन') || input.includes('आय')) {
    if (!user?.annual_income) {
      return 'I still cannot see your saved annual income. Please save Annual Income in Settings once, then ask again.';
    }

    const monthlyIncome = user.annual_income / 12;
    return `I can see your saved income now.\n\n- Annual income: ${formatINR(user.annual_income)}\n- Approx monthly income: ${formatINR(monthlyIncome)}\n- Occupation: ${humanize(user.occupation) || 'Not set'}\n- Location: ${user.district || 'District not set'}, ${user.state || 'State not set'}\n\nI will use this income for scheme eligibility, benefit matching, SIP planning, and risk-aware stock suggestions.`;
  }

  if (askedStock) {
    return buildStockMasterResponse(askedStock, user);
  }

  if (hasStockIntent(input) || input.includes('analysis')) {
    const ideas = stockIdeas.map((stock) =>
      `- ${stock.symbol}: ${formatSignal(stock.signal)} signal, CMP ${formatStockPrice(stock)}, RSI ${stock.rsi_14}, PE ${stock.pe_ratio}`,
    ).join('\n');
    return `${profileIntro}here are stock ideas from the DhanSathi screener:\n\n${ideas || '- I could not identify the stock name/symbol. Try asking "explain RELIANCE stock" or "TCS RSI signal".'}\n\nFor a master stock view, ask with a company name or NSE symbol. I will fetch CMP, change %, volume, RSI, SMA trend and signal. Use this for education only. Keep position size small, define a stop-loss before entry, and do not trade without your own confirmation.`;
  }

  if (recommendations && BENEFIT_INTENT.test(userInput)) {
    const items = [...recommendations.scholarships.slice(0, 3), ...recommendations.schemes.slice(0, 5)];
    const missing = missingProfileFields(user);
    return `${profileIntro}${recommendations.eligible_total} schemes on DhanSathi match your profile (${recommendations.filters_applied.join('; ') || 'profile incomplete'}). Most relevant to your question:\n\n${items
      .map((item) => `- ${item.name} (${item.state}): ${item.description} [Details](${item.url})`)
      .join('\n')}\n\n${missing.length ? `Add ${missing.join(', ')} in Settings for sharper matches.\n\n` : ''}Tap Details on a card to see benefits, documents and how to apply.`;
  }

  if (
    input.includes('scholarship') ||
    input.includes('student') ||
    input.includes('college') ||
    input.includes('graduation') ||
    input.includes('post graduation') ||
    input.includes('छात्रवृत्ति')
  ) {
    const summary = scholarshipMatches.map((scholarship) => {
      const deadline = scholarship.studentApplicationCloseDate || scholarship.deadline_hint || 'check official portal';
      const details = scholarship.specifications_url || scholarship.application_url;
      return `- ${scholarship.name}: ${scholarship.department}. Levels: ${scholarship.education_levels.map(formatEducationLevel).join(', ')}. Deadline: ${deadline}. Details: ${details}`;
    }).join('\n');

    const missing = [
      !user?.education_level ? 'education level' : '',
      !user?.current_course ? 'course/class' : '',
      !user?.last_exam_percentage ? 'last exam percentage' : '',
      !user?.category ? 'category' : '',
      !user?.annual_income ? 'annual income' : '',
    ].filter(Boolean).join(', ');

    return `${profileIntro}these live scholarships look relevant from the current NSP feed:\n\n${summary || '- I could not load live scholarships in smart mode right now. Please open the Scholarships page or try again.'}\n\n${missing ? `To improve matching, update these fields in Settings: ${missing}.\n\n` : ''}Always verify final eligibility, documents, and dates on the official portal before applying.`;
  }

  if (input.includes('sip') || input.includes('calculator')) {
    return 'Let me help you with SIP calculations!\n\nFor a monthly SIP of ₹5,000 at 12% returns:\n- 5 years: ₹4,12,432\n- 10 years: ₹11,61,695\n- 20 years: ₹49,95,740\n\nYou can try different amounts in the Crossover Engine for interactive projections. Want me to calculate for a specific amount?';
  }

  if (input.includes('market') || input.includes('update')) {
    if (!liveStocks.length) return 'Live market data could not be loaded right now. Please open the Stocks page for the latest prices.';
    const sorted = [...liveStocks].sort((a, b) => b.change_pct - a.change_pct);
    const fmt = (s: StockData) => `${s.symbol} (${s.change_pct >= 0 ? '+' : ''}${s.change_pct.toFixed(2)}%)`;
    const up = liveStocks.filter((s) => s.change_pct > 0).length;
    return `Live Nifty 50 snapshot:\n\n- Advancing: ${up}, declining: ${liveStocks.length - up}\n- Top gainers: ${sorted.slice(0, 3).map(fmt).join(', ')}\n- Top losers: ${sorted.slice(-3).reverse().map(fmt).join(', ')}\n\nOpen the Stocks page for full live data.`;
  }

  if (input.includes('eligib') || input.includes('scheme') || input.includes('yojana')) {
    const schemeSummary = matches.map((match) =>
      `- ${match.scheme.name} (${match.score}% match): ${match.scheme.benefits || match.scheme.description}. Why: ${match.reasons.slice(0, 2).join(', ') || 'profile match'}`,
    ).join('\n');
    return `${profileIntro}these schemes look most relevant:\n\n${schemeSummary || '- I need your state, income, age, category, and occupation in Settings to match schemes accurately.'}\n\nOpen each scheme page, confirm documents, and check the official application link before applying.`;
  }

  if (input.includes('tax') || input.includes('budget')) {
    return `I can definitely help with your taxes and budget! Since I am in DhanSathi smart mode right now, please make sure you've entered your details in the Tax Calculator or Budget Analyzer tools. Once the live AI is back, I will give you personalized advice based exactly on the numbers you saved there!`;
  }

  return 'That\'s a great question! I\'m analyzing the relevant financial data to give you the most accurate response. For personalized advice, please make sure your profile is updated. Is there anything specific about government schemes, stocks, or financial planning I can help with?';
}
