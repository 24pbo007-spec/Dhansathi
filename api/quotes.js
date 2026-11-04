// Live fundamentals (P/E, P/B, EPS, market cap) for a batch of Yahoo tickers.
// GET /api/quotes?tickers=RELIANCE.NS,TCS.NS

import { fetchQuotes } from './_lib/market.js';
import { rateLimit } from './_lib/ratelimit.js';

export const config = { maxDuration: 20 };

export default async function handler(req, res) {
  if (!rateLimit(req, res, { route: 'quotes', limit: 60, windowMs: 60000 })) return;
  const tickers = String(req.query?.tickers || '')
    .split(',')
    .map((t) => t.trim().toUpperCase())
    .filter((t) => /^[A-Z0-9&^.\-_%]{1,30}$/.test(t))
    .slice(0, 50);
  if (!tickers.length) return res.status(400).json({ error: 'tickers query parameter is required' });

  try {
    const quotes = await fetchQuotes(tickers);
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=900, stale-while-revalidate=3600');
    return res.status(200).json({ quotes });
  } catch (error) {
    return res.status(502).json({ error: error.message || 'Quote lookup failed' });
  }
}
