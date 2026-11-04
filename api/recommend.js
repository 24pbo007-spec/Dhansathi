// Profile-aware scheme & scholarship finder for Ask DhanSathi.
//
// POST { profile, question } -> the schemes and scholarships this person is
// eligible for, ranked by relevance to the question. Eligibility comes from
// myScheme's own filters (state, gender, caste, disability, minority, BPL),
// so the chat recommends from the same official catalogue the website shows.

import { isPastDate, mySchemeHeaders, toIsoDate } from './_lib/myscheme.js';
import { rateLimit } from './_lib/ratelimit.js';

export const config = { maxDuration: 30 };

const SEARCH_URL = 'https://api.myscheme.gov.in/search/v6/schemes';

const CASTE = {
  sc: 'Scheduled Caste (SC)',
  st: 'Scheduled Tribe (ST)',
  obc: 'Other Backward Class (OBC)',
  general: 'General',
  ews: 'General',
};

const STOPWORDS = new Set(
  `a an the i me my mine we our you your is am are was be for of to in on at by and or with from about which what who how
  can could should would will do does any all some get give tell show find list please need want help eligible eligibility
  scheme schemes yojana yojna sarkari government govt suggest recommend best top benefit benefits apply available
  mujhe mere mera meri mujhko hum hame hamare kya kaun kaunsi konsi kon kis kaise kitna hai hain ho hoga ke ki ka ko se me mein
  par liye chahiye chahta chahti batao bataiye bataye dikhao milega milegi sakta sakti sakte wala wali vale aur ya bhi ab abhi koi
  mil milta milti milega sakti sakta karna karo kare karu raha rahi rahe hu hoon tha thi chahte jankari details information
  about please plz pls`.split(/\s+/),
);

// Common Hindi words → the English terms myScheme indexes.
const HINDI_TERMS = {
  किसान: 'farmer', खेती: 'agriculture', छात्रवृत्ति: 'scholarship', स्कॉलरशिप: 'scholarship', पढ़ाई: 'education', शिक्षा: 'education',
  पेंशन: 'pension', विधवा: 'widow', बुजुर्ग: 'old age', वृद्धा: 'old age', आवास: 'housing', घर: 'housing', मकान: 'housing',
  लोन: 'loan', ऋण: 'loan', कर्ज: 'loan', महिला: 'women', बेटी: 'girl', लड़की: 'girl', शादी: 'marriage', विवाह: 'marriage',
  स्वास्थ्य: 'health', इलाज: 'medical treatment', बीमा: 'insurance', व्यापार: 'business', बिजनेस: 'business', रोजगार: 'employment',
  नौकरी: 'employment', दिव्यांग: 'disability', विकलांग: 'disability', मजदूर: 'worker', श्रमिक: 'labour', बच्चे: 'child',
  गर्भवती: 'pregnant maternity', सब्सिडी: 'subsidy', ट्रैक्टर: 'tractor', बिजली: 'electricity', पानी: 'water', राशन: 'ration food',
};

const SCHOLARSHIP_INTENT = /scholar|chhatravrit|chatravrit|छात्रवृत्ति|स्कॉलरशिप|fellowship|stipend|study|padhai|पढ़ाई|college|school|student|tuition|fees?\b|education|शिक्षा/i;

function questionTerms(question) {
  const text = String(question || '').slice(0, 400);
  const terms = new Set();
  for (const [hindi, english] of Object.entries(HINDI_TERMS)) {
    if (text.includes(hindi)) english.split(' ').forEach((t) => terms.add(t));
  }
  for (const word of text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)) {
    if (word.length > 2 && !STOPWORDS.has(word) && !/^\d+$/.test(word)) terms.add(word);
  }
  return [...terms].slice(0, 8);
}

function profileTerms(profile) {
  const terms = [];
  const occupation = String(profile.occupation || '').toLowerCase();
  if (/farm|kisan|agri/.test(occupation) || profile.is_farmer_family) terms.push('farmer');
  if (/construction|labour|labor|worker|majdoor/.test(occupation)) terms.push('worker');
  if (/business|self|entrepreneur|shop/.test(occupation)) terms.push('entrepreneur');
  if (/unemploy/.test(occupation)) terms.push('unemployed');
  if (/fish/.test(occupation)) terms.push('fishermen');
  if (profile.has_disability) terms.push('disability');
  if (profile.is_ex_serviceman_family) terms.push('ex-servicemen');
  if (profile.is_orphan_single_parent) terms.push('orphan');
  return terms;
}

/** What most people in this life situation look for, used when the question names no topic. */
function lifeStageTerms(profile) {
  const terms = ['insurance', 'pension', 'health', 'housing'];
  if (profile.gender === 'female') terms.push('women');
  if (profile.age != null && profile.age >= 60) terms.push('old', 'senior');
  if (profile.age != null && profile.age < 30) terms.push('skill', 'employment');
  return terms;
}

/** Turn the saved profile into myScheme eligibility filters (same field = OR, different fields = AND). */
function eligibilityFilters(profile) {
  const filters = [];
  const applied = [];
  if (profile.state) {
    filters.push({ identifier: 'beneficiaryState', value: profile.state }, { identifier: 'beneficiaryState', value: 'All' });
    applied.push(`state: ${profile.state} + all-India`);
  }
  if (profile.gender === 'female' || profile.gender === 'male') {
    const gender = profile.gender === 'female' ? 'Female' : 'Male';
    filters.push({ identifier: 'gender', value: gender }, { identifier: 'gender', value: 'All' });
    applied.push(`gender: ${gender}`);
  }
  if (profile.category && CASTE[profile.category]) {
    filters.push({ identifier: 'caste', value: CASTE[profile.category] }, { identifier: 'caste', value: 'All' });
    applied.push(`category: ${profile.category.toUpperCase()}`);
  }
  // Exclude schemes reserved for groups the person has not said they belong to.
  if (profile.has_disability !== true) filters.push({ identifier: 'disability', value: 'No' });
  if (profile.is_minority !== true) filters.push({ identifier: 'minority', value: 'No' });
  if (profile.is_bpl === false) filters.push({ identifier: 'isBpl', value: 'No' });
  return { filters, applied };
}

async function search({ filters, keyword = '', size = 20 }) {
  const url = new URL(SEARCH_URL);
  url.searchParams.set('lang', 'en');
  url.searchParams.set('q', JSON.stringify(filters));
  url.searchParams.set('keyword', keyword);
  url.searchParams.set('sort', '');
  url.searchParams.set('from', '0');
  url.searchParams.set('size', String(size));
  const response = await fetch(url, { headers: mySchemeHeaders, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`myScheme search failed: ${response.status}`);
  const data = await response.json();
  return { total: data?.data?.hits?.page?.total ?? 0, items: data?.data?.hits?.items ?? [] };
}

function mapItem(item) {
  const f = item.fields || {};
  const closeDate = toIsoDate(f.schemeCloseDate);
  const states = (f.beneficiaryState || []).filter((s) => s !== 'All');
  return {
    name: f.schemeName,
    slug: f.slug,
    url: `https://www.myscheme.gov.in/schemes/${f.slug}`,
    level: f.level || null,
    state: states.join(', ') || 'All India',
    ministry: f.nodalMinistryName || (states.length === 1 ? `Government of ${states[0]}` : null),
    categories: f.schemeCategory || [],
    tags: (f.tags || []).slice(0, 5),
    description: String(f.briefDescription || '').replace(/\s+/g, ' ').slice(0, 220),
    close_date: closeDate,
    closed: isPastDate(closeDate),
  };
}

// Words schemes use for the same idea, matched as prefixes ("agricultur" → agricultural).
const SYNONYMS = {
  farmer: ['farmer', 'kisan', 'krishi', 'agricultur', 'cultivat', 'crop'],
  agriculture: ['agricultur', 'krishi', 'farm', 'crop'],
  loan: ['loan', 'credit', 'interest subsidy'],
  worker: ['worker', 'labour', 'shramik', 'construction'],
  housing: ['housing', 'house', 'awas', 'shelter'],
  women: ['women', 'woman', 'mahila', 'female'],
  girl: ['girl', 'daughter', 'beti', 'kanya'],
  pension: ['pension'],
  disability: ['disab', 'divyang', 'handicap'],
  scholarship: ['scholarship', 'fellowship', 'stipend'],
};

/**
 * Re-rank by how many search terms hit the name (×3), tags (×2) and
 * description (×1). Profile terms count double: a farmer asking about "loan"
 * should see Kisan Credit Card before an education loan.
 */
function rerank(items, terms, profileWords) {
  if (!terms.length) return items;
  const groups = terms.map((t) => ({
    weight: profileWords.includes(t) ? 2 : 1,
    patterns: (SYNONYMS[t] || [t]).map((w) => new RegExp(`\\b${w.replace(/[^a-z0-9 -]/gi, '')}`, 'i')),
  }));
  const score = (item) => {
    const f = item.fields || {};
    const fields = [
      [f.schemeName || '', 3],
      [(f.tags || []).join(' '), 2],
      [f.briefDescription || '', 1],
    ];
    return groups.reduce(
      (sum, g) => sum + g.weight * fields.reduce((s2, [text, w]) => s2 + (g.patterns.some((re) => re.test(text)) ? w : 0), 0),
      0,
    );
  };
  return items
    .map((item, index) => ({ item, index, score: score(item) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((x) => x.item);
}

/** For open-ended questions, alternate the user's own state schemes with all-India ones. */
function interleaveByState(items, state) {
  if (!state) return items;
  const own = items.filter((i) => (i.fields?.beneficiaryState || []).includes(state));
  const national = items.filter((i) => !own.includes(i));
  const out = [];
  for (let i = 0; out.length < items.length; i += 1) {
    if (own[i]) out.push(own[i]);
    if (national[i]) out.push(national[i]);
    if (i > items.length) break;
  }
  return out;
}

// Scholarships for a different stage of study than the user's.
function wrongStudyLevel(item, level) {
  if (!level) return false;
  const text = `${item.fields?.schemeName || ''} ${item.fields?.briefDescription || ''}`;
  if (/emeritus|in-service faculty|for teachers|retired/i.test(item.fields?.schemeName || '')) return true;
  if (['graduation', 'postgraduation', 'phd', 'diploma', 'technical', 'abroad'].includes(level)) {
    if (/pre[-\s]?matric|secondary education|class\s*(i{1,3}|iv|v|vi{1,3}|ix|x|[1-9]|10)\b(?!\s*pass)|std\.?\s*[1-9]\b/i.test(text) && !/post[-\s]?matric/i.test(text)) return true;
  }
  if (['graduation', 'diploma', 'technical'].includes(level) && /post[-\s]?graduat|\bm\.?\s?tech|\bm\.e\.|ph\.?\s?d|doctoral|gate\/gpat|senior fellowship|research fellowship/i.test(text)) return true;
  if (level === 'school') return /post[-\s]?graduat|ph\.?\s?d|doctoral|fellowship|research/i.test(text);
  return false;
}

const isStudySupport = (item) =>
  /scholarship|fellowship|stipend|matric|student|school|college/i.test(item.fields?.schemeName || '') ||
  item.fields?.schemeCategory?.[0] === 'Education & Learning';

const openOnly = (items, limit) => items.map(mapItem).filter((i) => i.name && i.slug && !i.closed).slice(0, limit);

// Only the fields that decide eligibility are accepted; nothing else is stored or forwarded.
function sanitiseProfile(raw = {}) {
  const pick = (k, allowed) => (allowed.includes(raw[k]) ? raw[k] : undefined);
  const bool = (k) => (typeof raw[k] === 'boolean' ? raw[k] : undefined);
  return {
    state: typeof raw.state === 'string' ? raw.state.slice(0, 60) : undefined,
    gender: pick('gender', ['male', 'female', 'other']),
    category: pick('category', ['general', 'obc', 'sc', 'st', 'ews']),
    occupation: typeof raw.occupation === 'string' ? raw.occupation.slice(0, 60) : undefined,
    age: Number.isFinite(raw.age) && raw.age > 0 && raw.age < 120 ? Math.round(raw.age) : undefined,
    education_level: pick('education_level', ['school', 'diploma', 'graduation', 'postgraduation', 'phd', 'technical', 'abroad']),
    has_disability: bool('has_disability'),
    is_minority: bool('is_minority'),
    is_bpl: bool('is_bpl'),
    is_farmer_family: bool('is_farmer_family'),
    is_orphan_single_parent: bool('is_orphan_single_parent'),
    is_ex_serviceman_family: bool('is_ex_serviceman_family'),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!rateLimit(req, res, { route: 'recommend', limit: 30, windowMs: 60000 })) return;

  const profile = sanitiseProfile(req.body?.profile);
  const question = typeof req.body?.question === 'string' ? req.body.question : '';
  const { filters, applied } = eligibilityFilters(profile);
  const asked = questionTerms(question);
  // The question decides the topic; the profile (farmer, disability…) nudges the ranking.
  const keyword = [...new Set([...(asked.length ? asked : lifeStageTerms(profile)), ...profileTerms(profile)])].join(' ');
  const isStudent = !!profile.education_level || /student/i.test(profile.occupation || '');
  const wantsScholarships = isStudent || SCHOLARSHIP_INTENT.test(question);
  const studyTerms = ['scholarship', 'fellowship', 'stipend', 'post matric', 'pre matric', 'education', profile.education_level || ''];

  try {
    const [eligible, ranked, scholarships] = await Promise.all([
      search({ filters, size: 1 }),
      search({ filters, keyword, size: 60 }),
      wantsScholarships
        ? search({ filters, keyword: [...studyTerms, ...asked].filter(Boolean).join(' '), size: 30 })
        : Promise.resolve(null),
    ]);

    // A very specific question can match nothing; fall back to the profile ranking.
    let schemeItems = ranked.items.length ? ranked.items : (await search({ filters, keyword: profileTerms(profile).join(' '), size: 60 })).items;
    if (!wantsScholarships) schemeItems = schemeItems.filter((i) => !isStudySupport(i));
    schemeItems = schemeItems.filter((i) => !wrongStudyLevel(i, profile.education_level));
    schemeItems = asked.length
      ? rerank(schemeItems, keyword.split(' '), profileTerms(profile))
      : interleaveByState(rerank(schemeItems, keyword.split(' '), profileTerms(profile)), profile.state);
    const scholarshipList = scholarships
      ? openOnly(
          scholarships.items.filter(
            (i) =>
              /scholar|fellowship|stipend|matric|tuition|education|student|vidya|shiksha/i.test(
                `${i.fields?.schemeName} ${i.fields?.briefDescription} ${(i.fields?.tags || []).join(' ')}`,
              ) && !wrongStudyLevel(i, profile.education_level),
          ),
          8,
        )
      : [];
    const scholarshipSlugs = new Set(scholarshipList.map((s) => s.slug));

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      eligible_total: eligible.total,
      filters_applied: applied,
      search_terms: keyword ? keyword.split(' ') : [],
      schemes: openOnly(schemeItems, 18).filter((s) => !scholarshipSlugs.has(s.slug)).slice(0, 10),
      scholarships: scholarshipList,
      source: 'myScheme (Government of India) eligibility filters',
    });
  } catch (error) {
    return res.status(502).json({ error: error.message || 'Recommendation lookup failed' });
  }
}
