// Full details for one myScheme scheme: benefits, eligibility, documents and
// the official application process. Fetched on demand when a user opens a
// scheme or scholarship card, and edge-cached until the nightly refresh.

import { dailyCacheHeader, fetchMySchemeDetail } from './_lib/myscheme.js';
import { rateLimit } from './_lib/ratelimit.js';

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (!rateLimit(req, res, { route: 'scheme-detail', limit: 60, windowMs: 60000 })) return;
  const slug = String(req.query?.slug || '').trim();
  if (!/^[a-z0-9][a-z0-9-]{0,150}$/i.test(slug)) {
    return res.status(400).json({ error: 'A valid scheme slug is required.' });
  }

  try {
    const detail = await fetchMySchemeDetail(slug);
    res.setHeader('Cache-Control', dailyCacheHeader());
    return res.status(200).json(detail);
  } catch (error) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: error.message || 'Unable to load scheme details.' });
  }
}
