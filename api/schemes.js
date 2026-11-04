// Live government-schemes feed, served straight from myScheme (central +
// every state/UT). No env vars or GitHub token required. The response is
// edge-cached until 00:30 IST, so the catalogue refreshes once a day.

import { dailyCacheHeader, fetchAllMySchemeItems, isPastDate, toIsoDate } from './_lib/myscheme.js';
import { rateLimit } from './_lib/ratelimit.js';

export const config = { maxDuration: 60 };

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// Only the fields the website renders — the raw catalogue is ~4.7 MB.
function mapScheme(item) {
  const fields = item.fields || {};
  const slug = fields.slug || slugify(fields.schemeName || item.id);
  const categories = Array.isArray(fields.schemeCategory) ? fields.schemeCategory : [];
  const states = Array.isArray(fields.beneficiaryState) ? fields.beneficiaryState : [];
  const tags = Array.isArray(fields.tags) ? fields.tags : [];
  const closeDate = toIsoDate(fields.schemeCloseDate);

  return {
    id: `myscheme-${slug}`,
    slug,
    name: fields.schemeName || fields.schemeShortTitle || slug,
    short_title: fields.schemeShortTitle || undefined,
    description: fields.briefDescription || 'Details available on myScheme.',
    ministry:
      fields.nodalMinistryName ||
      (fields.level === 'State' && states.length === 1 && states[0] !== 'All'
        ? `Government of ${states[0]}`
        : 'Government of India'),
    type: fields.level === 'State' ? 'state' : 'central',
    state: states.filter((state) => state !== 'All').join(', ') || undefined,
    benefits: '',
    tags,
    eligibility_criteria: { states: states.length ? states : undefined, gender: 'any' },
    documents_required: [],
    // A close date only means "closed" once it has actually passed.
    status: isPastDate(closeDate) ? 'closed' : 'active',
    deadline: closeDate || undefined,
    application_url: `https://www.myscheme.gov.in/schemes/${slug}`,
    scheme_categories: categories,
    scheme_for: fields.schemeFor || undefined,
    source: 'myScheme',
  };
}

export default async function handler(req, res) {
  if (!rateLimit(req, res, { route: 'schemes', limit: 10, windowMs: 60000 })) return;
  try {
    const { total, items } = await fetchAllMySchemeItems();
    const schemes = items.map(mapScheme);

    res.setHeader('Cache-Control', dailyCacheHeader());
    return res.status(200).json({
      meta: {
        source: 'myScheme',
        source_url: 'https://www.myscheme.gov.in/',
        updated_at: new Date().toISOString(),
        total,
        fetched: schemes.length,
        new_count: 0,
      },
      schemes,
    });
  } catch (error) {
    // The frontend falls back to the committed static snapshot on any error.
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({
      meta: { source: 'Live Fail', updated_at: new Date().toISOString() },
      schemes: [],
      error: error.message,
    });
  }
}
