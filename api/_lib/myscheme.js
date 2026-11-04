// Shared myScheme (myscheme.gov.in) client used by the scheme, scholarship and
// scheme-detail endpoints. Files under api/_lib are not exposed as routes.
//
// MYSCHEME_API_KEY is the public x-api-key that myscheme.gov.in ships to every
// visitor's browser (visible in DevTools > Network). It is not a private
// secret. An env var of the same name overrides it if myScheme rotates it.

export const MYSCHEME_API_KEY =
  process.env.MYSCHEME_API_KEY || 'tYTy5eEhlu9rFjyxuCr7ra7ACp4dv1RH8gWuHTDc';

const SEARCH_URL = 'https://api.myscheme.gov.in/search/v6/schemes';
const DETAIL_URL = 'https://api.myscheme.gov.in/schemes/v6/public/schemes';
const PAGE_SIZE = 100;
const PARALLEL_PAGES = 10;

export const mySchemeHeaders = {
  origin: 'https://www.myscheme.gov.in',
  referer: 'https://www.myscheme.gov.in/',
  'user-agent': 'Mozilla/5.0 (DhanSathi scheme updater)',
  'x-api-key': MYSCHEME_API_KEY,
};

async function getJson(url) {
  const response = await fetch(url, {
    headers: mySchemeHeaders,
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    throw new Error(`myScheme request failed: ${response.status} ${response.statusText}`);
  }
  const data = await response.json();
  if (data.statusCode !== 200 || !data.data) {
    throw new Error(`Unexpected myScheme response: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return data.data;
}

async function fetchSearchPage(from) {
  const url = new URL(SEARCH_URL);
  url.searchParams.set('lang', 'en');
  url.searchParams.set('q', '');
  url.searchParams.set('keyword', '');
  url.searchParams.set('sort', 'multiple_sort');
  url.searchParams.set('from', String(from));
  url.searchParams.set('size', String(PAGE_SIZE));
  const data = await getJson(url);
  if (!data.hits?.items) throw new Error('myScheme search returned no items');
  return data;
}

/** Every scheme in the myScheme catalogue (central + all states/UTs). */
export async function fetchAllMySchemeItems() {
  const first = await fetchSearchPage(0);
  const total = first.hits.page.total;
  const items = [...first.hits.items];

  const offsets = [];
  for (let from = PAGE_SIZE; from < total; from += PAGE_SIZE) offsets.push(from);
  for (let i = 0; i < offsets.length; i += PARALLEL_PAGES) {
    const batch = offsets.slice(i, i + PARALLEL_PAGES);
    const pages = await Promise.all(batch.map((from) => fetchSearchPage(from)));
    for (const page of pages) items.push(...page.hits.items);
  }

  return { total, items };
}

/** Today's date in India as YYYY-MM-DD. */
export function todayIST() {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Normalise "2025-03-31", "31-03-2025" or "31/03/2025" to YYYY-MM-DD.
 * myScheme uses ISO dates; NSP uses dd-mm-yyyy.
 */
export function toIsoDate(value) {
  const text = String(value || '');
  const iso = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const indian = text.match(/(\d{2})[-/](\d{2})[-/](\d{4})/);
  if (indian) return `${indian[3]}-${indian[2]}-${indian[1]}`;
  return null;
}

/** True when the date (YYYY-MM-DD) is strictly before today in India. */
export function isPastDate(isoDate) {
  return !!isoDate && isoDate < todayIST();
}

/**
 * Cache header that expires every night at 00:30 IST, so all visitors see a
 * fresh catalogue each day instead of a cache that drifts by up to 48h.
 */
export function dailyCacheHeader() {
  const nowIst = Date.now() + 5.5 * 60 * 60 * 1000;
  const next = new Date(nowIst);
  next.setUTCHours(0, 30, 0, 0);
  if (next.getTime() <= nowIst) next.setUTCDate(next.getUTCDate() + 1);
  const seconds = Math.max(300, Math.floor((next.getTime() - nowIst) / 1000));
  return `public, max-age=900, s-maxage=${seconds}, stale-while-revalidate=3600`;
}

function richTextToMarkdown(nodes) {
  if (!Array.isArray(nodes)) return '';
  const walk = (node) => {
    if (!node) return '';
    if (typeof node.text === 'string') return node.text;
    const inner = (node.children || []).map(walk).join('');
    if (node.type === 'table_cell') return ` ${inner.replace(/\|/g, '/').replace(/\s+/g, ' ').trim()} |`;
    if (node.type === 'table_row') return `|${inner}\n`;
    if (node.type === 'table') return `\n${inner}\n`;
    if (node.type === 'list_item') return `- ${inner.trim()}\n`;
    if (node.type === 'paragraph') return `${inner.trim()}\n\n`;
    if (node.type === 'link' && node.link) return `[${inner.trim() || node.link}](${node.link})`;
    return inner;
  };
  return nodes.map(walk).join('').trim();
}

function hasTable(nodes) {
  if (!Array.isArray(nodes)) return false;
  return nodes.some((node) => node?.type === 'table' || hasTable(node?.children));
}

// myScheme's *_md fields flatten tables into run-on text ("1Female40 years2000"),
// so use the structured rich text whenever a section contains a table.
function sectionMarkdown(markdown, richText) {
  return cleanMarkdown(hasTable(richText) || !markdown ? richTextToMarkdown(richText) : markdown);
}

// myScheme text is sometimes HTML-escaped twice ("&amp;quot;").
function decodeEntities(value) {
  let text = String(value || '');
  for (let i = 0; i < 8 && /&(amp|quot|#39|apos|lt|gt|nbsp);/.test(text); i += 1) {
    text = text
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&');
  }
  return text;
}

function cleanMarkdown(value) {
  return decodeEntities(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Full scheme page: benefits, eligibility, documents, how to apply. */
export async function fetchMySchemeDetail(slug) {
  const detailUrl = new URL(DETAIL_URL);
  detailUrl.searchParams.set('slug', slug);
  detailUrl.searchParams.set('lang', 'en');
  const detail = await getJson(detailUrl);
  const en = detail.en || {};
  const basic = en.basicDetails || {};
  const content = en.schemeContent || {};

  let documentsMd = '';
  try {
    const docs = await getJson(`${DETAIL_URL}/${detail._id}/documents?lang=en`);
    documentsMd = hasTable(docs.en?.documents_required) || !docs.en?.documentsRequired_md
      ? richTextToMarkdown(docs.en?.documents_required)
      : docs.en.documentsRequired_md;
  } catch {
    // Documents are optional; the rest of the page is still useful.
  }

  const label = (field) => (field && typeof field === 'object' ? field.label : field) || null;
  const closeDate = toIsoDate(basic.schemeCloseDate);

  return {
    slug,
    name: basic.schemeName || slug,
    short_title: basic.schemeShortTitle || null,
    level: label(basic.level),
    scheme_type: label(basic.schemeType),
    ministry: label(basic.nodalMinistryName),
    department: label(basic.nodalDepartmentName),
    state: label(basic.state),
    implementing_agency: basic.implementingAgency || null,
    categories: (basic.schemeCategory || []).map(label).filter(Boolean),
    tags: basic.tags || [],
    target_beneficiaries: (basic.targetBeneficiaries || []).map(label).filter(Boolean),
    open_date: toIsoDate(basic.schemeOpenDate),
    close_date: closeDate,
    is_closed: isPastDate(closeDate),
    description_md:
      sectionMarkdown(content.detailedDescription_md, content.detailedDescription) ||
      cleanMarkdown(content.briefDescription),
    benefits_md: sectionMarkdown(content.benefits_md, content.benefits),
    exclusions_md: sectionMarkdown(content.exclusions_md, content.exclusions),
    eligibility_md: sectionMarkdown(
      en.eligibilityCriteria?.eligibilityDescription_md,
      en.eligibilityCriteria?.eligibilityDescription,
    ),
    documents_md: cleanMarkdown(documentsMd),
    application_process: (en.applicationProcess || []).map((step) => ({
      mode: step.mode || 'Online',
      url: step.url ? (String(step.url).startsWith('http') ? step.url : `https://${step.url}`) : null,
      process_md: sectionMarkdown(step.process_md, step.process),
    })),
    references: (content.references || [])
      .filter((ref) => ref?.url)
      .map((ref) => ({ title: ref.title || 'Reference', url: String(ref.url).trim() })),
    official_url: `https://www.myscheme.gov.in/schemes/${slug}`,
  };
}
