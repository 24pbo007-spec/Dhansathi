// Market data + quantitative engine behind DhanMitra.
//
// Everything here is measured, not guessed:
//   - prices/volumes: Yahoo Finance daily chart (5 years, split/dividend adjusted)
//   - fundamentals, sector, earnings date, analyst consensus: Yahoo quote APIs
//   - news: Google News RSS search for the company, last 30 days
//   - forecasts: Monte Carlo that resamples the stock's own historical daily
//     returns, so the price range reflects how this stock actually moves.

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

// ─── Yahoo Finance ──────────────────────────────────────────────────────────

export async function fetchChart(ticker, range = '5y') {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=${range}&includeAdjustedClose=true`;
  const response = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Price history unavailable for ${ticker} (HTTP ${response.status})`);
  const json = await response.json();
  const result = json?.chart?.result?.[0];
  if (!result?.meta?.regularMarketPrice) throw new Error(`No price data found for ${ticker}`);

  const quote = result.indicators?.quote?.[0] || {};
  const adj = result.indicators?.adjclose?.[0]?.adjclose || [];
  const bars = [];
  (result.timestamp || []).forEach((t, i) => {
    const close = quote.close?.[i];
    if (close == null || !Number.isFinite(close) || close <= 0) return;
    bars.push({
      date: new Date((t + (result.meta.gmtoffset || 19800)) * 1000).toISOString().slice(0, 10),
      open: quote.open?.[i] ?? close,
      high: quote.high?.[i] ?? close,
      low: quote.low?.[i] ?? close,
      close,
      adjClose: adj[i] ?? close,
      volume: quote.volume?.[i] ?? 0,
    });
  });
  return { meta: result.meta, bars };
}

let crumbSession = null;

async function getYahooSession() {
  if (crumbSession && Date.now() - crumbSession.at < 30 * 60 * 1000) return crumbSession;
  const init = await fetch('https://fc.yahoo.com', {
    headers: { 'user-agent': UA },
    redirect: 'manual',
    signal: AbortSignal.timeout(8000),
  });
  const cookies = (init.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
  const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'user-agent': UA, cookie: cookies },
    signal: AbortSignal.timeout(8000),
  });
  const crumb = (await crumbRes.text()).trim();
  if (!crumbRes.ok || !crumb || crumb.includes('<')) throw new Error('Yahoo session unavailable');
  crumbSession = { cookies, crumb, at: Date.now() };
  return crumbSession;
}

async function yahooJson(url) {
  const session = await getYahooSession();
  const sep = url.includes('?') ? '&' : '?';
  const response = await fetch(`${url}${sep}crumb=${encodeURIComponent(session.crumb)}`, {
    headers: { 'user-agent': UA, cookie: session.cookies },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Yahoo HTTP ${response.status}`);
  return response.json();
}

const raw = (field) => (field && typeof field === 'object' ? field.raw : field) ?? null;

/** Live P/E, market cap etc. for up to 50 tickers in one call. */
export async function fetchQuotes(tickers) {
  const json = await yahooJson(
    `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${tickers.map(encodeURIComponent).join(',')}`,
  );
  return (json?.quoteResponse?.result || []).map((q) => ({
    ticker: q.symbol,
    name: q.longName || q.shortName || null,
    pe: q.trailingPE ?? null,
    pb: q.priceToBook ?? null,
    eps: q.epsTrailingTwelveMonths ?? null,
    market_cap: q.marketCap ?? null,
    avg_volume_3m: q.averageDailyVolume3Month ?? null,
  }));
}

/** Live valuation + company profile. Every field may be null; never invented. */
export async function fetchFundamentals(ticker) {
  const out = {};
  const [quote, summary] = await Promise.allSettled([
    yahooJson(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(ticker)}`),
    yahooJson(
      `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=assetProfile,calendarEvents,financialData`,
    ),
  ]);

  const q = quote.status === 'fulfilled' ? quote.value?.quoteResponse?.result?.[0] : null;
  if (q) {
    Object.assign(out, {
      name: q.longName || q.shortName || null,
      pe: q.trailingPE ?? null,
      forward_pe: q.forwardPE ?? null,
      pb: q.priceToBook ?? null,
      eps: q.epsTrailingTwelveMonths ?? null,
      market_cap: q.marketCap ?? null,
      dividend_yield: q.trailingAnnualDividendYield ?? null,
      avg_volume_3m: q.averageDailyVolume3Month ?? null,
      week_52_high: q.fiftyTwoWeekHigh ?? null,
      week_52_low: q.fiftyTwoWeekLow ?? null,
    });
  }

  const s = summary.status === 'fulfilled' ? summary.value?.quoteSummary?.result?.[0] : null;
  if (s) {
    const profile = s.assetProfile || {};
    const fin = s.financialData || {};
    const earnings = s.calendarEvents?.earnings;
    Object.assign(out, {
      sector: profile.sector || null,
      industry: profile.industry || null,
      revenue_growth: raw(fin.revenueGrowth),
      earnings_growth: raw(fin.earningsGrowth),
      profit_margin: raw(fin.profitMargins),
      roe: raw(fin.returnOnEquity),
      debt_to_equity: raw(fin.debtToEquity),
      analyst_target: raw(fin.targetMeanPrice),
      analyst_rating: fin.recommendationKey || null,
      analyst_count: raw(fin.numberOfAnalystOpinions),
      next_earnings_date: earnings?.earningsDate?.[0]?.fmt || null,
      next_earnings_is_estimate: earnings?.isEarningsDateEstimate ?? null,
    });
  }
  return out;
}

// ─── News (internet search) ─────────────────────────────────────────────────

function decodeXml(value = '') {
  return value
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

/** Recent headlines from Google News search, newest first. */
export async function fetchNews(query, { limit = 8, maxAgeDays = 30 } = {}) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;
  const response = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(8000) });
  if (!response.ok) return [];
  const xml = await response.text();
  const cutoff = Date.now() - maxAgeDays * 86400000;
  const seen = new Set();
  const items = [];

  for (const block of xml.split('<item>').slice(1)) {
    const title = decodeXml(block.match(/<title>(.*?)<\/title>/s)?.[1] || '');
    const link = decodeXml(block.match(/<link>(.*?)<\/link>/s)?.[1] || '');
    const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/s)?.[1];
    const source = decodeXml(block.match(/<source[^>]*>(.*?)<\/source>/s)?.[1] || '');
    const published = pubDate ? new Date(pubDate) : null;
    if (!title || !published || published.getTime() < cutoff) continue;

    const headline = source && title.endsWith(` - ${source}`) ? title.slice(0, -(source.length + 3)) : title;
    const key = headline.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60);
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ title: headline, source, url: link, published: published.toISOString() });
  }

  return items.sort((a, b) => b.published.localeCompare(a.published)).slice(0, limit);
}

// ─── Indicators ─────────────────────────────────────────────────────────────

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const std = (xs) => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1));
};
const round = (value, digits = 2) => (value == null || !Number.isFinite(value) ? null : Number(value.toFixed(digits)));

function sma(values, n) {
  return values.length >= n ? mean(values.slice(-n)) : null;
}

function emaSeries(values, n) {
  const k = 2 / (n + 1);
  const out = [];
  values.forEach((v, i) => out.push(i === 0 ? v : v * k + out[i - 1] * (1 - k)));
  return out;
}

function rsi(closes, n = 14) {
  if (closes.length <= n) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= n; i += 1) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= n;
  loss /= n;
  for (let i = n + 1; i < closes.length; i += 1) {
    const d = closes[i] - closes[i - 1];
    gain = (gain * (n - 1) + Math.max(d, 0)) / n;
    loss = (loss * (n - 1) + Math.max(-d, 0)) / n;
  }
  return loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
}

function atr(bars, n = 14) {
  if (bars.length <= n) return null;
  const trs = bars.slice(1).map((b, i) => {
    const prev = bars[i].close;
    return Math.max(b.high - b.low, Math.abs(b.high - prev), Math.abs(b.low - prev));
  });
  let value = mean(trs.slice(0, n));
  for (let i = n; i < trs.length; i += 1) value = (value * (n - 1) + trs[i]) / n;
  return value;
}

function logReturns(values) {
  const out = [];
  for (let i = 1; i < values.length; i += 1) out.push(Math.log(values[i] / values[i - 1]));
  return out;
}

function maxDrawdown(values) {
  let peak = values[0];
  let worst = 0;
  for (const v of values) {
    peak = Math.max(peak, v);
    worst = Math.min(worst, v / peak - 1);
  }
  return worst;
}

function beta(stockBars, marketBars) {
  const marketByDate = new Map(marketBars.map((b) => [b.date, b.adjClose]));
  const pairs = stockBars.filter((b) => marketByDate.has(b.date)).slice(-253);
  if (pairs.length < 60) return null;
  const s = logReturns(pairs.map((b) => b.adjClose));
  const m = logReturns(pairs.map((b) => marketByDate.get(b.date)));
  const ms = mean(s);
  const mm = mean(m);
  let cov = 0;
  let varM = 0;
  for (let i = 0; i < s.length; i += 1) {
    cov += (s[i] - ms) * (m[i] - mm);
    varM += (m[i] - mm) ** 2;
  }
  return varM ? cov / varM : null;
}

function periodReturn(closes, days) {
  return closes.length > days ? closes[closes.length - 1] / closes[closes.length - 1 - days] - 1 : null;
}

/** Technical + risk profile computed from real daily bars. */
export function computeTechnicals(bars, marketBars = []) {
  const closes = bars.map((b) => b.close);
  const adj = bars.map((b) => b.adjClose);
  const price = closes[closes.length - 1];
  const returns = logReturns(adj);
  const lastYear = returns.slice(-252);
  const ema12 = emaSeries(closes, 12);
  const ema26 = emaSeries(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signalLine = emaSeries(macdLine, 9);
  const recent20 = bars.slice(-20);
  const recent60 = bars.slice(-60);
  const vol20 = mean(bars.slice(-20).map((b) => b.volume));
  const vol60 = mean(bars.slice(-60).map((b) => b.volume));

  return {
    price,
    previous_close: closes[closes.length - 2] ?? price,
    as_of: bars[bars.length - 1].date,
    history_days: bars.length,
    sma_20: sma(closes, 20),
    sma_50: sma(closes, 50),
    sma_200: sma(closes, 200),
    rsi_14: rsi(closes.slice(-300), 14),
    macd: macdLine[macdLine.length - 1],
    macd_signal: signalLine[signalLine.length - 1],
    atr_14: atr(bars.slice(-100), 14),
    volatility_annual: lastYear.length > 20 ? std(lastYear) * Math.sqrt(252) : null,
    volatility_recent: returns.length > 21 ? std(returns.slice(-21)) * Math.sqrt(252) : null,
    beta: marketBars.length ? beta(bars, marketBars) : null,
    max_drawdown_1y: maxDrawdown(adj.slice(-252)),
    return_1w: periodReturn(adj, 5),
    return_1m: periodReturn(adj, 21),
    return_3m: periodReturn(adj, 63),
    return_6m: periodReturn(adj, 126),
    return_1y: periodReturn(adj, 252),
    week_52_high: Math.max(...bars.slice(-252).map((b) => b.high)),
    week_52_low: Math.min(...bars.slice(-252).map((b) => b.low)),
    support_20d: Math.min(...recent20.map((b) => b.low)),
    resistance_20d: Math.max(...recent20.map((b) => b.high)),
    support_60d: Math.min(...recent60.map((b) => b.low)),
    resistance_60d: Math.max(...recent60.map((b) => b.high)),
    volume_last: bars[bars.length - 1].volume,
    volume_avg_20: vol20,
    volume_ratio: vol60 ? vol20 / vol60 : null,
    returns,
  };
}

// ─── Monte Carlo ────────────────────────────────────────────────────────────

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

function quantile(sorted, q) {
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

// Historical average returns are a poor guide to the future, so only a
// quarter of the measured drift is kept; the shape of moves (fat tails, how
// big a bad day is) comes entirely from the stock's own history.
const DRIFT_SHRINK = 0.25;
const BLOCK = 5; // resample 5-day blocks to keep short-term momentum/clustering

/** Re-centre and re-scale a return pool so its drift is shrunk and its volatility matches today's regime. */
export function preparePool(returns, recentVol, longVol) {
  const pool = returns.slice(-504);
  const m = mean(pool);
  const regime = longVol && recentVol ? Math.min(1.8, Math.max(0.6, 0.5 + 0.5 * (recentVol / longVol))) : 1;
  return { pool: pool.map((r) => (r - m) * regime + m * DRIFT_SHRINK), regime, drift: m * DRIFT_SHRINK };
}

/**
 * Simulate `days` trading days `paths` times by block-bootstrapping the pool.
 * shock: total extra log-return from the scenario, phased in over `shockDays`.
 */
export function monteCarlo({ price, pool, days, paths = 4000, seed = 1, shock = 0, shockDays = 5, volMultiplier = 1, checkpoints = [] }) {
  const rand = mulberry32(seed);
  const terminal = new Float64Array(paths);
  const minPrice = new Float64Array(paths);
  const maxPrice = new Float64Array(paths);
  const cpValues = checkpoints.map(() => new Float64Array(paths));
  const phase = Math.max(1, Math.min(days, shockDays));

  for (let p = 0; p < paths; p += 1) {
    let logP = 0;
    let lo = 0;
    let hi = 0;
    let cp = 0;
    let d = 0;
    while (d < days) {
      const start = Math.floor(rand() * (pool.length - BLOCK));
      for (let k = 0; k < BLOCK && d < days; k += 1, d += 1) {
        logP += pool[start + k] * volMultiplier + (d < phase ? shock / phase : 0);
        if (logP < lo) lo = logP;
        if (logP > hi) hi = logP;
        if (cp < checkpoints.length && d + 1 === checkpoints[cp]) {
          cpValues[cp][p] = price * Math.exp(logP);
          cp += 1;
        }
      }
    }
    terminal[p] = price * Math.exp(logP);
    minPrice[p] = price * Math.exp(lo);
    maxPrice[p] = price * Math.exp(hi);
  }

  const sorted = Float64Array.from(terminal).sort();
  const pct = (q) => quantile(sorted, q);
  let up = 0;
  let sum = 0;
  for (const v of terminal) {
    if (v > price) up += 1;
    sum += v;
  }

  return {
    paths,
    percentiles: { p5: pct(0.05), p10: pct(0.1), p25: pct(0.25), p50: pct(0.5), p75: pct(0.75), p90: pct(0.9), p95: pct(0.95) },
    mean: sum / paths,
    prob_up: up / paths,
    probTouchBelow: (level) => minPrice.filter((v) => v <= level).length / paths,
    probTouchAbove: (level) => maxPrice.filter((v) => v >= level).length / paths,
    checkpoints: checkpoints.map((day, i) => {
      const s = Float64Array.from(cpValues[i]).sort();
      return { day, p10: quantile(s, 0.1), p50: quantile(s, 0.5), p90: quantile(s, 0.9) };
    }),
  };
}

/**
 * Honesty check: replay the same method on past dates and count how often the
 * real price ended inside the predicted 80% range (P10–P90). A well-calibrated
 * model scores close to 80%.
 */
export function backtestCoverage(adjCloses, days, { recentWindow = 21, step = 5, maxTests = 120 } = {}) {
  const returns = logReturns(adjCloses);
  const tests = [];
  for (let end = returns.length - days; end >= 252 && tests.length < maxTests; end -= step) {
    const history = returns.slice(Math.max(0, end - 504), end);
    const longVol = std(history.slice(-252));
    const recentVol = std(history.slice(-recentWindow));
    const { pool } = preparePool(history, recentVol, longVol);
    // Empirical distribution of `days`-day sums from overlapping blocks.
    const sums = [];
    for (let i = 0; i + days <= pool.length; i += Math.max(1, Math.floor(days / 4))) {
      let s = 0;
      for (let k = 0; k < days; k += 1) s += pool[i + k];
      sums.push(s);
    }
    if (sums.length < 20) continue; // too few windows for long horizons
    const sorted = sums.sort((a, b) => a - b);
    const lo = quantile(sorted, 0.1);
    const hi = quantile(sorted, 0.9);
    let realized = 0;
    for (let k = 0; k < days; k += 1) realized += returns[end + k];
    tests.push(realized >= lo && realized <= hi);
  }
  if (tests.length < 10) return null;
  return { tests: tests.length, inside_80pct_range: tests.filter(Boolean).length / tests.length };
}

export { round, mean, std };
