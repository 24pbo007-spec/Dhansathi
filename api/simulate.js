// DhanMitra simulation: real data in, measured probabilities out.
//
// 1. Pull 5y of daily prices, live fundamentals and recent news headlines.
// 2. Turn the scenario into an explicit assumption (preset table, or Gemma
//    reading a custom scenario — bounded and shown to the user).
// 3. Monte Carlo: resample this stock's own daily returns 4,000 times.
// 4. Gemma writes the explanation from those numbers; it cannot change them.

import { callGemma } from './_lib/gemma.js';
import {
  backtestCoverage,
  computeTechnicals,
  fetchChart,
  fetchFundamentals,
  fetchNews,
  hashSeed,
  monteCarlo,
  preparePool,
  round,
} from './_lib/market.js';
import { getScenario, presetShock } from './_lib/scenarios.js';
import { rateLimit } from './_lib/ratelimit.js';

export const config = { maxDuration: 60 };

const HORIZON_DAYS = { '1 Day': 1, '1 Week': 5, '2 Weeks': 10, '1 Month': 21, '1 Year': 252 };
const PATHS = 4000;

const inr = (v) => (v == null ? 'N/A' : `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: v < 100 ? 2 : 0 })}`);
const pctText = (v, digits = 1) => (v == null ? 'N/A' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(digits)}%`);

function addTradingDays(isoDate, days) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  let added = 0;
  while (added < days) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) added += 1;
  }
  return d.toISOString().slice(0, 10);
}

function fmtDate(iso) {
  return new Date(`${iso}T00:00:00+05:30`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

async function loadChart(symbol, exchange) {
  const clean = String(symbol || '').trim().toUpperCase();
  if (!/^[A-Z0-9&^.\-_]{1,30}$/.test(clean)) throw new Error('Invalid stock symbol.');
  const candidates = clean.includes('.')
    ? [clean]
    : exchange === 'BSE'
      ? [`${clean}.BO`, `${clean}.NS`]
      : [`${clean}.NS`, `${clean}.BO`];
  let lastError;
  for (const ticker of candidates) {
    try {
      return { ticker, ...(await fetchChart(ticker, '5y')) };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error(`No market data for ${clean}`);
}

async function customShock(text, ctx) {
  const prompt = [
    'You convert a market scenario into a numeric assumption for a Monte Carlo stock simulation.',
    `Stock: ${ctx.name} (${ctx.symbol}), sector: ${ctx.sector || 'unknown'}, industry: ${ctx.industry || 'unknown'}, beta vs Nifty: ${ctx.beta == null ? 'unknown' : ctx.beta.toFixed(2)}.`,
    `Horizon: ${ctx.horizon}.`,
    `Scenario: "${text.slice(0, 600)}"`,
    'Estimate the extra price move this scenario would cause for THIS stock, beyond normal market noise.',
    'Be conservative: most real news moves a stock 0-8%. Only extreme events justify more than 15%.',
    'Return JSON: {"shock_pct": number between -25 and 25, "vol_multiplier": number between 0.8 and 2.5, "rationale": "one sentence"}',
  ].join('\n');
  const parsed = JSON.parse(await callGemma(prompt, { json: true, timeoutMs: 25000 }));
  const shock = Number(parsed.shock_pct);
  const vol = Number(parsed.vol_multiplier);
  if (!Number.isFinite(shock)) throw new Error('AI returned no shock');
  return {
    title: 'Custom scenario',
    shock_pct: Math.max(-25, Math.min(25, shock)),
    vol_multiplier: Number.isFinite(vol) ? Math.max(0.8, Math.min(2.5, vol)) : 1.2,
    shock_days: Math.min(10, HORIZON_DAYS[ctx.horizon] || 10),
    basis: 'ai',
    rationale: String(parsed.rationale || '').slice(0, 300),
  };
}

function deterministicNarrative(f) {
  const t = f.technicals;
  const drivers = [];
  const risks = [];
  if (t.sma_200) drivers.push(`Price ${inr(t.price)} is ${t.price > t.sma_200 ? 'above' : 'below'} its 200-day average (${inr(t.sma_200)}) — long-term trend is ${t.price > t.sma_200 ? 'up' : 'down'}.`);
  if (t.return_3m != null) drivers.push(`3-month return ${pctText(t.return_3m)}, 1-year return ${pctText(t.return_1y)}.`);
  if (t.rsi_14 != null) drivers.push(`RSI-14 is ${t.rsi_14.toFixed(0)} (${t.rsi_14 > 70 ? 'overbought' : t.rsi_14 < 30 ? 'oversold' : 'neutral zone'}).`);
  if (f.scenario) drivers.push(`Scenario assumption: ${f.scenario.title} adds ${f.scenario.shock_pct.toFixed(1)}% with volatility ×${f.scenario.vol_multiplier.toFixed(2)}.`);
  risks.push(`Annual volatility ${(t.volatility_annual * 100).toFixed(0)}% — a typical ${f.horizon} swing is ±${(f.typicalMove * 100).toFixed(1)}%.`);
  risks.push(`Worst fall from peak in the last year: ${pctText(t.max_drawdown_1y)}.`);
  if (f.fundamentals.next_earnings_date) risks.push(`Next results around ${f.fundamentals.next_earnings_date}${f.fundamentals.next_earnings_is_estimate ? ' (estimated)' : ''} — prices can gap on results day.`);
  risks.push('Simulations use past behaviour; sudden news can move the price outside the range.');
  return { key_drivers: drivers, risk_factors: risks };
}

async function aiNarrative(facts, news) {
  const prompt = [
    'You are DhanMitra AI, explaining a quantitative stock simulation to an Indian retail investor.',
    'All numbers below were computed from real market data. Use ONLY these numbers. Never invent prices, targets, percentages, events or dates.',
    'Do not promise profit. Say clearly this is a probability estimate.',
    '',
    `FACTS: ${JSON.stringify(facts)}`,
    '',
    'NEWS HEADLINES (numbered, newest first):',
    news.length ? news.map((n, i) => `${i}. [${n.published.slice(0, 10)}] ${n.title} (${n.source})`).join('\n') : '(no recent headlines found)',
    '',
    'Return JSON with exactly these keys:',
    '{"news_impact": [{"i": headline number, "impact": "positive"|"negative"|"neutral"}],',
    ' "news_sentiment": number from -1 (very negative) to 1 (very positive), 0 if no news,',
    ' "key_drivers": [3-5 short strings citing the facts or headlines],',
    ' "risk_factors": [3-5 short strings],',
    ' "agents": {"technical": "...", "fundamental": "...", "institutional": "...", "macro": "...", "risk": "..."} (1-2 sentences each; say "not available" for missing data),',
    ' "reasoning": "3-4 sentences explaining why the probabilities look the way they do",',
    ' "hindi_summary": "2-3 simple sentences in Hindi (Devanagari) with the direction, probability and range"}',
  ].join('\n');
  const text = await callGemma(prompt, { json: true, timeoutMs: 35000 });
  return JSON.parse(text);
}

const asStrings = (value, max = 5) =>
  Array.isArray(value) ? value.filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim().slice(0, 300)).slice(0, max) : [];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!rateLimit(req, res, { route: 'simulate', limit: 15, windowMs: 60000 })) return;

  const body = req.body || {};
  const horizon = HORIZON_DAYS[body.horizon] ? body.horizon : '1 Month';
  const days = HORIZON_DAYS[horizon];
  const customText = typeof body.customScenario === 'string' ? body.customScenario.trim() : '';

  try {
    // ── 1. Data ───────────────────────────────────────────────────────────
    const chart = await loadChart(body.symbol, body.exchange);
    const name = chart.meta.longName || chart.meta.shortName || String(body.symbol).toUpperCase();
    const displaySymbol = chart.ticker.replace(/\.(NS|BO)$/, '');
    const newsQuery = `"${name.replace(/\s+(Limited|Ltd\.?)$/i, '')}" share OR stock`;

    const [market, fundamentalsRes, newsRes] = await Promise.allSettled([
      fetchChart('^NSEI', '2y'),
      fetchFundamentals(chart.ticker),
      fetchNews(newsQuery, { limit: 8, maxAgeDays: 30 }),
    ]);
    const fundamentals = fundamentalsRes.status === 'fulfilled' ? fundamentalsRes.value : {};
    const news = newsRes.status === 'fulfilled' ? newsRes.value : [];
    const marketBars = market.status === 'fulfilled' ? market.value.bars : [];

    if (chart.bars.length < 120) {
      return res.status(422).json({
        error: `${displaySymbol} has only ${chart.bars.length} trading days of history — too little for a reliable simulation.`,
      });
    }

    const t = computeTechnicals(chart.bars, marketBars);
    const price = chart.meta.regularMarketPrice || t.price;

    // ── 2. Scenario assumption ────────────────────────────────────────────
    let scenario = null;
    if (body.scenarioId && getScenario(body.scenarioId)) {
      scenario = presetShock(body.scenarioId, { sector: fundamentals.sector, beta: t.beta });
    } else if (customText) {
      try {
        scenario = await customShock(customText, {
          name,
          symbol: displaySymbol,
          sector: fundamentals.sector,
          industry: fundamentals.industry,
          beta: t.beta,
          horizon,
        });
      } catch {
        scenario = {
          title: 'Custom scenario',
          shock_pct: 0,
          vol_multiplier: 1.2,
          shock_days: 5,
          basis: 'fallback',
          rationale: 'AI could not quantify this scenario right now, so only extra uncertainty (volatility ×1.2) was added.',
        };
      }
    }

    // ── 3. Monte Carlo ────────────────────────────────────────────────────
    const { pool, regime } = preparePool(t.returns, t.volatility_recent, t.volatility_annual);
    const checkpointDays = [1, 5, 10, 21, 63, 126].filter((d) => d < days).concat(days);
    const sim = monteCarlo({
      price,
      pool,
      days,
      paths: PATHS,
      seed: hashSeed(`${chart.ticker}|${t.as_of}|${horizon}|${body.scenarioId || customText}`),
      shock: scenario ? Math.log(1 + scenario.shock_pct / 100) : 0,
      shockDays: scenario?.shock_days ?? 5,
      volMultiplier: scenario?.vol_multiplier ?? 1,
      checkpoints: checkpointDays,
    });
    const p = sim.percentiles;

    const direction = sim.prob_up >= 0.55 ? 'Bullish' : sim.prob_up <= 0.45 ? 'Bearish' : 'Neutral';
    const confidence = Math.round(Math.max(sim.prob_up, 1 - sim.prob_up) * 100);
    const atrStop = (t.atr_14 || price * 0.02) * 2;
    const stopLoss = direction === 'Bearish' ? price + atrStop : price - atrStop;
    const reward = direction === 'Bearish' ? price - p.p25 : p.p75 - price;
    const riskReward = Math.max(0, reward) / atrStop;
    const typicalMove = (p.p75 - p.p25) / 2 / price;

    const calibration = days <= 63 ? backtestCoverage(chart.bars.map((b) => b.adjClose), days) : null;

    // ── 4. Timeline from simulated checkpoints and real calendar events ──
    const timeline = sim.checkpoints.map((cp) => {
      const date = addTradingDays(t.as_of, cp.day);
      return {
        date: fmtDate(date),
        sortKey: date,
        event: `Middle estimate ${inr(cp.p50)} · 80% chance between ${inr(cp.p10)} and ${inr(cp.p90)}`,
      };
    });
    const horizonEnd = addTradingDays(t.as_of, days);
    if (fundamentals.next_earnings_date && fundamentals.next_earnings_date <= horizonEnd && fundamentals.next_earnings_date >= t.as_of) {
      timeline.push({
        date: fmtDate(fundamentals.next_earnings_date),
        sortKey: fundamentals.next_earnings_date,
        event: `Quarterly results ${fundamentals.next_earnings_is_estimate ? '(estimated date)' : ''} — expect a bigger-than-usual move`,
      });
    }
    timeline.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

    const facts = {
      stock: `${name} (${displaySymbol}, ${chart.ticker.endsWith('.BO') ? 'BSE' : 'NSE'})`,
      price,
      as_of: t.as_of,
      horizon,
      sector: fundamentals.sector,
      industry: fundamentals.industry,
      technicals: {
        rsi_14: round(t.rsi_14, 1),
        sma_20: round(t.sma_20),
        sma_50: round(t.sma_50),
        sma_200: round(t.sma_200),
        macd_above_signal: t.macd > t.macd_signal,
        return_1m: round(t.return_1m, 4),
        return_3m: round(t.return_3m, 4),
        return_1y: round(t.return_1y, 4),
        week_52_high: round(t.week_52_high),
        week_52_low: round(t.week_52_low),
        volume_20d_vs_60d: round(t.volume_ratio, 2),
        annual_volatility: round(t.volatility_annual, 3),
        beta_vs_nifty: round(t.beta, 2),
        max_drawdown_1y: round(t.max_drawdown_1y, 3),
      },
      fundamentals: {
        pe: round(fundamentals.pe, 1),
        pb: round(fundamentals.pb, 2),
        market_cap_cr: fundamentals.market_cap ? Math.round(fundamentals.market_cap / 1e7) : null,
        revenue_growth: round(fundamentals.revenue_growth, 3),
        earnings_growth: round(fundamentals.earnings_growth, 3),
        roe: round(fundamentals.roe, 3),
        debt_to_equity: round(fundamentals.debt_to_equity, 1),
        analyst_target: round(fundamentals.analyst_target),
        analyst_rating: fundamentals.analyst_rating,
        analysts: fundamentals.analyst_count,
        next_earnings_date: fundamentals.next_earnings_date,
      },
      scenario,
      simulation: {
        paths: PATHS,
        probability_price_higher: round(sim.prob_up, 3),
        direction,
        median_price: round(p.p50),
        range_80pct: [round(p.p10), round(p.p90)],
        expected_return: round(sim.mean / price - 1, 4),
        stop_loss_2atr: round(stopLoss),
        probability_hit_stop: round(direction === 'Bearish' ? sim.probTouchAbove(stopLoss) : sim.probTouchBelow(stopLoss), 3),
      },
      delivery_percentage: 'not available from the data source',
    };

    // ── 5. Explanation ────────────────────────────────────────────────────
    let narrative = null;
    try {
      narrative = await aiNarrative(facts, news);
    } catch {
      narrative = null;
    }
    const fallback = deterministicNarrative({ technicals: t, fundamentals, scenario, horizon, typicalMove });
    const impacts = new Map(
      (Array.isArray(narrative?.news_impact) ? narrative.news_impact : [])
        .filter((n) => Number.isInteger(n?.i) && ['positive', 'negative', 'neutral'].includes(n?.impact))
        .map((n) => [n.i, n.impact]),
    );
    const agents = narrative?.agents || {};
    const sentiment = Number(narrative?.news_sentiment);

    const agentInsights = {
      technical:
        agents.technical ||
        `RSI ${t.rsi_14?.toFixed(0)}; price vs SMA20/50/200: ${[t.sma_20, t.sma_50, t.sma_200].map((v) => (v == null ? 'N/A' : t.price > v ? 'above' : 'below')).join('/')}; MACD ${t.macd > t.macd_signal ? 'above' : 'below'} signal.`,
      fundamental:
        agents.fundamental ||
        `P/E ${fundamentals.pe?.toFixed(1) ?? 'N/A'}, P/B ${fundamentals.pb?.toFixed(2) ?? 'N/A'}, ROE ${fundamentals.roe != null ? (fundamentals.roe * 100).toFixed(1) + '%' : 'N/A'}.`,
      institutional:
        agents.institutional ||
        `20-day volume is ${t.volume_ratio ? (t.volume_ratio * 100).toFixed(0) : 'N/A'}% of the 60-day average. Delivery % is not available from this source.`,
      macro: agents.macro || `Beta vs Nifty 50: ${t.beta?.toFixed(2) ?? 'N/A'}.${scenario ? ` Scenario: ${scenario.rationale}` : ''}`,
      risk:
        agents.risk ||
        `2×ATR stop at ${inr(stopLoss)}; ${(facts.simulation.probability_hit_stop * 100).toFixed(0)}% of simulated paths touch it within the horizon.`,
    };

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      direction,
      confidence,
      priceRange: { low: round(p.p10), high: round(p.p90) },
      currentPrice: round(price),
      targetPrice: round(p.p50),
      stopLoss: round(stopLoss),
      expectedReturn: round((sim.mean / price - 1) * 100),
      riskReward: round(riskReward),
      keyDrivers: asStrings(narrative?.key_drivers).length ? asStrings(narrative.key_drivers) : fallback.key_drivers,
      riskFactors: asStrings(narrative?.risk_factors).length ? asStrings(narrative.risk_factors) : fallback.risk_factors,
      timeline: timeline.map(({ date, event }) => ({ date, event })),
      agentInsights: Object.fromEntries(Object.entries(agentInsights).map(([k, v]) => [k, String(v).slice(0, 400)])),
      source: narrative ? 'ai' : 'quant',
      hindiSummary:
        typeof narrative?.hindi_summary === 'string' && narrative.hindi_summary.trim()
          ? narrative.hindi_summary.trim()
          : `${displaySymbol}: ${horizon} में कीमत बढ़ने की संभावना ${(sim.prob_up * 100).toFixed(0)}% है। मध्य अनुमान ${inr(p.p50)}, 80% संभावना ${inr(p.p10)} से ${inr(p.p90)} के बीच।`,
      reasoning: typeof narrative?.reasoning === 'string' ? narrative.reasoning.slice(0, 1200) : '',
      // Extra detail for the redesigned result view.
      probabilities: {
        up: round(sim.prob_up, 3),
        hit_stop: facts.simulation.probability_hit_stop,
        reach_p75: round(direction === 'Bearish' ? sim.probTouchBelow(p.p25) : sim.probTouchAbove(p.p75), 3),
      },
      percentiles: Object.fromEntries(Object.entries(p).map(([k, v]) => [k, round(v)])),
      horizonDays: days,
      scenario,
      news: news.map((n, i) => ({ ...n, impact: impacts.get(i) || null })),
      newsSentiment: Number.isFinite(sentiment) ? Math.max(-1, Math.min(1, sentiment)) : null,
      calibration,
      stock: {
        symbol: displaySymbol,
        ticker: chart.ticker,
        exchange: chart.ticker.endsWith('.BO') ? 'BSE' : 'NSE',
        name,
        sector: fundamentals.sector || null,
        industry: fundamentals.industry || null,
        price: round(price),
        change_pct: round((price / t.previous_close - 1) * 100),
        as_of: t.as_of,
        ...facts.technicals,
        ...facts.fundamentals,
        atr_14: round(t.atr_14),
        volatility_regime: round(regime, 2),
      },
      methodology: `Monte Carlo with ${PATHS.toLocaleString('en-IN')} paths resampling ${Math.min(504, t.returns.length)} real daily returns of ${displaySymbol} in 5-day blocks, volatility adjusted to the current regime (×${regime.toFixed(2)}), historical drift shrunk to 25%.${scenario ? ` Scenario adds ${scenario.shock_pct.toFixed(1)}% over ${scenario.shock_days} days with volatility ×${scenario.vol_multiplier.toFixed(2)}.` : ''}`,
      dataSources: [
        `Yahoo Finance daily prices (${t.history_days} days, last ${t.as_of})`,
        fundamentals.pe != null || fundamentals.sector ? 'Yahoo Finance fundamentals & analyst data' : null,
        news.length ? `Google News: ${news.length} headlines from the last 30 days` : 'Google News: no headlines in the last 30 days',
        marketBars.length ? 'Nifty 50 index for beta' : null,
        narrative ? 'Gemma 4 (self-hosted) for the written explanation' : null,
      ].filter(Boolean),
    });
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : 'Simulation failed' });
  }
}
