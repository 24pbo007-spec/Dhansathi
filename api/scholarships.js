import { EXPLICIT_STATE_SCHEMES } from '../scripts/state_portals.js';
import { dailyCacheHeader, fetchAllMySchemeItems, isPastDate, toIsoDate } from './_lib/myscheme.js';
import { rateLimit } from './_lib/ratelimit.js';

// Fetching NSP + all of myScheme's education schemes takes several seconds.
export const config = { maxDuration: 60 };

// Words that on their own mark a scheme as student financial support.
const STRONG_SCHOLARSHIP_TERMS =
  /scholarship|fellowship|stipend|pre[-\s]?matric|post[-\s]?matric|tuition|fee\s*(reimburse|waiver|concession)|merit\s*(award|incentive|cum)|education\s*loan|study\s*loan|vidya|shiksha|siksha/i;
// Words that count only when myScheme files the scheme under education.
const EDUCATION_SUPPORT_TERMS =
  /\bstudents?\b|ph\.?\s?d|research|coaching|hostel|award|incentive|financial assistance|cash|laptop|tablet|bicycle|cycle|loan|abroad|overseas/i;

// Keep student financial-support schemes out of myScheme's full catalogue.
// Filing under "Education & Learning" alone is not enough: that category also
// holds school buildings, children's homes and teacher programmes.
function isScholarshipScheme(text, categories) {
  if (STRONG_SCHOLARSHIP_TERMS.test(text)) return true;
  const isEducation = categories.some((cat) => /education|learning/i.test(cat));
  return isEducation && EDUCATION_SUPPORT_TERMS.test(text);
}

function decodeHtml(value = '') {
  return String(value)
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

const parseIndianDate = toIsoDate;
const isExpired = isPastDate;

function inferLevels(name) {
  const text = name.toLowerCase();
  const levels = new Set();

  if (text.match(/pre\s*matric|school|class\s*ix|class\s*x|class\s*11|class\s*12|class\s*xi|class\s*xii/i)) {
    levels.add('school');
  }
  if (text.match(/post\s*matric/i)) {
    levels.add('school');
    levels.add('diploma');
    levels.add('graduation');
  }
  if (text.match(/iti|craftsmen|vocational|trade/i)) {
    levels.add('technical');
  }
  if (text.match(/diploma|polytechnic/i)) {
    levels.add('diploma');
  }
  if (text.match(/technical|professional|engineering|aicte|b\.?tech|b\.?e\b|architecture/i)) {
    levels.add('technical');
  }
  if (text.match(/under\s*graduate|undergraduate|ug\b|college|degree|bachelor/i)) {
    levels.add('graduation');
  }
  if (text.match(/post\s*graduate|postgraduate|pg\b|master/i)) {
    levels.add('postgraduation');
  }
  if (text.match(/fellowship|research|ph\.?d|doctorate/i)) {
    levels.add('phd');
  }
  if (text.match(/overseas|abroad/i)) {
    levels.add('abroad');
  }

  if (!levels.size) levels.add('graduation');
  return [...levels];
}

function inferTargetGroups(name, department) {
  const text = `${name} ${department}`.toLowerCase();
  const groups = new Set();

  if (text.includes('disabil')) groups.add('Students with disabilities');
  if (text.includes('sc ') || text.includes('schedule caste') || text.includes('scheduled caste')) groups.add('SC students');
  if (text.includes('st ') || text.includes('schedule tribe') || text.includes('scheduled tribe') || text.includes('tribal')) groups.add('ST students');
  if (text.includes('obc')) groups.add('OBC students');
  if (text.includes('ebc')) groups.add('EBC students');
  if (text.includes('dnt')) groups.add('DNT students');
  if (text.includes('girl') || text.includes('pragati')) groups.add('Girl students');
  if (text.includes('minority')) groups.add('Minority students');
  if (text.includes('transgender')) groups.add('Transgender students');
  if (text.includes('police') || text.includes('armed') || text.includes('railway') || text.includes('rpf')) groups.add('Wards of service personnel');
  if (text.includes('ner') || text.includes('north eastern')) groups.add('North Eastern Region students');
  if (!groups.size) groups.add('Eligible Indian students');

  return [...groups];
}

function inferState(department) {
  const text = department.toLowerCase();
  const match = department.match(/(?:State of|UT of|State Schemes? - |Government of)\s*([a-zA-Z\s]+)/i);
  if (match) {
    let name = match[1].trim();
    if (name.toLowerCase() === 'chattisgarh') name = 'Chhattisgarh';
    if (name.toLowerCase().includes('dadra nagar haveli')) name = 'Dadra and Nagar Haveli and Daman and Diu';
    return name;
  }
  const states = ['Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal'];
  for (const s of states) {
    if (text.includes(s.toLowerCase())) return s;
  }
  return null;
}

function inferPrograms(name, department) {
  const text = `${name} ${department}`.toLowerCase();
  const programs = new Set();
  
  if (text.match(/\bba\b|\bb\.a\b|\barts\b/i)) programs.add('BA');
  if (text.match(/\bbsc\b|\bb\.sc\b|\bscience\b/i)) programs.add('BSc');
  if (text.match(/\bbcom\b|\bb\.com\b|\bcommerce\b/i)) programs.add('BCom');
  if (text.match(/\bbba\b|\bb\.b\.a\b|\bbms\b|\bbbm\b/i)) programs.add('BBA/BMS');
  if (text.match(/\bbca\b|\bb\.c\.a\b/i)) programs.add('BCA');
  if (text.match(/\bbfa\b|\bb\.f\.a\b|\bfine arts\b/i)) programs.add('BFA');
  if (text.match(/\bbjmc\b|\bjournalism\b|\bmass communication\b/i)) programs.add('BJMC/Journalism');

  if (text.match(/\bbtech\b|\bb\.tech\b|\bengineering\b|\bb\.e\b|\bbe\b/i)) programs.add('BTech/BE');
  if (text.match(/\bdiploma\b|\bpolytechnic\b/i)) programs.add('Diploma');
  if (text.match(/\biti\b|\bcraftsmen\b|\bvocational\b/i)) programs.add('ITI');

  if (text.match(/\bmbbs\b|\bbds\b|\bmedical\b|\bneet\b/i)) programs.add('MBBS/BDS');
  if (text.match(/\bbams\b|\bbhms\b|\bayush\b/i)) programs.add('AYUSH (BAMS/BHMS)');
  if (text.match(/\bnursing\b|\bb\.sc nursing\b/i)) programs.add('Nursing');
  if (text.match(/\bpharmacy\b|\bb\.pharm\b|\bd\.pharm\b/i)) programs.add('Pharmacy');
  if (text.match(/\bparamedical\b|\bbpt\b|\bphysiotherapy\b/i)) programs.add('Paramedical/BPT');

  if (text.match(/\bllb\b|\blaw\b|\bclat\b/i)) programs.add('Law (LLB)');
  if (text.match(/\bdesign\b|\bb\.des\b|\bnift\b|\bnid\b/i)) programs.add('Design (B.Des)');
  if (text.match(/\barchitecture\b|\bb\.arch\b|\bplanning\b/i)) programs.add('B.Arch/Planning');
  if (text.match(/\beducation\b|\bb\.ed\b|\bd\.el\.ed\b|\bteaching\b/i)) programs.add('Education (B.Ed/D.El.Ed)');
  if (text.match(/\bagriculture\b|\bhorticulture\b|\bicar\b/i)) programs.add('Agriculture');
  if (text.match(/\bhotel management\b|\bhospitality\b/i)) programs.add('Hotel Management');
  if (text.match(/\bca\b|\bcs\b|\bcma\b|\bchartered accountant\b/i)) programs.add('CA/CS/CMA');

  if (text.match(/\bmsc\b|\bm\.sc\b/i)) programs.add('MSc');
  if (text.match(/\bmba\b|\bm\.b\.a\b/i)) programs.add('MBA');
  if (text.match(/\bmca\b|\bm\.c\.a\b/i)) programs.add('MCA');
  if (text.match(/\bmtech\b|\bm\.tech\b/i)) programs.add('MTech');
  if (text.match(/\bma\b|\bm\.a\b/i)) programs.add('MA');
  if (text.match(/\bmcom\b|\bm\.com\b/i)) programs.add('MCom');

  return [...programs];
}

function inferUniversity(name, department) {
  const text = `${name} ${department}`;
  const uniMatch = text.match(/([A-Za-z\s]+University)/i) || text.match(/([A-Za-z\s]+Institute of Technology)/i);
  if (uniMatch) {
    let uni = uniMatch[1].trim();
    if (uni.length > 50) uni = uni.slice(-50).trim();
    return uni;
  }
  return null;
}

function providerFromDepartment(department) {
  const text = department.toLowerCase();
  if (text.startsWith('state of ') || text.startsWith('ut of ')) return 'state';
  return 'central';
}

function makeId(name, department) {
  return `${department}-${name}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 120);
}

function pushCurrent(items, current) {
  if (!current?.name) return;
  items.push(current);
}

function parseNspScholarships(html, sourceUrl) {
  const lines = html.split('\n');
  const items = [];
  let department = 'National Scholarship Portal';
  let current = null;
  let readingDepartment = false;

  for (const line of lines) {
    if (line.includes('accordion-button')) {
      readingDepartment = true;
      continue;
    }

    if (readingDepartment) {
      const possibleDepartment = decodeHtml(line.replace(/<[^>]+>/g, ' '));
      if (possibleDepartment.includes('data-bs-') || possibleDepartment.includes('aria-') || possibleDepartment.includes('collapseOne')) {
        continue;
      }
      if (possibleDepartment) {
        department = possibleDepartment;
        readingDepartment = false;
      }
      continue;
    }

    const deptMatch = line.match(/<button[^>]*accordion-button[^>]*>\s*([^<]+?)\s*<\/button>/i);
    if (deptMatch) {
      department = decodeHtml(deptMatch[1]);
      continue;
    }

    const nameMatch = line.match(/<h6>\s*([^<]+?)\s*<\/h6>/i);
    if (nameMatch) {
      if (line.includes('<!--')) continue;
      pushCurrent(items, current);
      const name = decodeHtml(nameMatch[1]);
      current = {
        id: makeId(name, department),
        name,
        provider: providerFromDepartment(department),
        department,
        education_levels: inferLevels(name),
        target_groups: inferTargetGroups(name, department),
        // NSP's listing page carries no benefit text; the scheme's
        // specification PDF (specifications_url) is the authoritative source.
        benefits: '',
        eligibility: `Listed on the National Scholarship Portal under ${department}. Open the official specification for amount, eligibility and documents.`,
        documents_required: ['Aadhaar', 'Income/category certificate if applicable', 'Previous marksheet', 'Bank account', 'Institution verification'],
        application_url: 'https://scholarships.gov.in/',
        portal: 'National Scholarship Portal',
        source: 'National Scholarship Portal',
        source_url: sourceUrl,
        deadline_hint: 'Check live portal dates before applying',
        status: 'open',
        state: inferState(department),
        university: inferUniversity(name, department),
        programs: inferPrograms(name, department),
      };
      continue;
    }

    if (!current) continue;

    const spanText = decodeHtml(line.replace(/<[^>]+>/g, ' '));
    if (spanText.includes('Scheme') && spanText.includes('Open from')) {
      current.schemeOpenDate = parseIndianDate(spanText);
    }
    if (spanText.includes('Student Application') && spanText.includes('Open till')) {
      current.studentApplicationCloseDate = parseIndianDate(spanText);
      current.deadline_hint = current.studentApplicationCloseDate
        ? `Student application open till ${current.studentApplicationCloseDate}`
        : current.deadline_hint;
      current.status = isExpired(current.studentApplicationCloseDate) ? 'expired' : 'open';
    }

    const links = [...line.matchAll(/<a\s+href="([^"]+)"[^>]*>([^<]+)<\/a>/gi)];
    for (const [, href, label] of links) {
      const cleanLabel = decodeHtml(label).toLowerCase();
      const url = href.startsWith('http') ? href : new URL(href, sourceUrl).toString();
      if (cleanLabel.includes('specification')) current.specifications_url = url;
      if (cleanLabel.includes('faq')) current.faq_url = url;
    }
  }

  pushCurrent(items, current);
  return items;
}

// Generate the 28 Indian States fallback natively in the API
function getLiveStateFallbacks(liveNspStates = []) {
  const liveStateSet = new Set(liveNspStates.filter(Boolean));
  
  const otherUTs = [
    'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi',
    'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry'
  ];

  const generated = otherUTs
    .filter(state => !liveStateSet.has(state))
    .map(state => ({
      id: `state-portal-${state.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      name: `${state} State Post Matric & Merit Scholarships`,
      provider: 'state',
      department: `Social Welfare / Education Department, ${state}`,
      education_levels: ['school', 'diploma', 'graduation', 'postgraduation', 'technical'],
      target_groups: ['SC students', 'ST students', 'OBC students', 'Minority students', 'Economically Weaker Section'],
      benefits: 'Fee reimbursement and financial assistance for domicile students.',
      eligibility: `Must be a domicile of ${state}. Income and category rules apply.`,
      documents_required: ['Aadhaar', 'Income Certificate', 'Caste/Category Certificate', 'Domicile Certificate'],
      application_url: 'https://scholarships.gov.in/',
      portal: `${state} State Portal`,
      source: 'State Government',
      source_url: 'https://scholarships.gov.in/',
      deadline_hint: 'Check state portal for active dates',
      status: 'open',
      state: state,
      programs: ['BTech/BE', 'BSc', 'BA', 'BCom', 'MSc', 'MA', 'Diploma', 'ITI']
    }));

  return [...EXPLICIT_STATE_SCHEMES, ...generated];
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000); 

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        accept: 'text/html,application/xhtml+xml',
        ...options.headers,
      },
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function mapMySchemeScholarship(item) {
  const fields = item.fields || {};
  const name = fields.schemeName || fields.schemeShortTitle || 'Scholarship';
  const slug = fields.slug || makeId(name, '');
  const categories = Array.isArray(fields.schemeCategory) ? fields.schemeCategory : [];
  const states = Array.isArray(fields.beneficiaryState) ? fields.beneficiaryState : [];
  const tags = Array.isArray(fields.tags) ? fields.tags : [];
  const context = `${name} ${fields.briefDescription || ''} ${tags.join(' ')} ${categories.join(' ')} ${fields.nodalMinistryName || ''}`;
  const provider = fields.level === 'State' ? 'state' : 'central';
  const stateName = states.filter((s) => s && s !== 'All').join(', ') || null;
  const closeDate = toIsoDate(fields.schemeCloseDate);

  return {
    id: `myscheme-${slug}`,
    name,
    provider,
    department: fields.nodalMinistryName || 'Government of India',
    education_levels: inferLevels(context),
    target_groups: inferTargetGroups(name, context),
    // myScheme's search API has no benefit text; the card loads it on demand
    // from /api/scheme-detail using myscheme_slug.
    benefits: '',
    tags,
    myscheme_slug: slug,
    eligibility: fields.briefDescription || 'Eligibility is defined by the official myScheme scheme page.',
    documents_required: ['Aadhaar', 'Income/category certificate if applicable', 'Previous marksheet', 'Bank account'],
    application_url: `https://www.myscheme.gov.in/schemes/${slug}`,
    portal: 'myScheme',
    source: 'myScheme',
    source_url: 'https://www.myscheme.gov.in/',
    deadline_hint: closeDate ? `Applications close on ${closeDate}` : 'Check the myScheme portal for active dates',
    studentApplicationCloseDate: closeDate || undefined,
    status: closeDate && isExpired(closeDate) ? 'expired' : 'open',
    state: stateName,
    states: states.filter((s) => s && s !== 'All'),
    university: null,
    programs: inferPrograms(name, context),
  };
}

async function fetchMySchemeScholarships() {
  const { items } = await fetchAllMySchemeItems();

  return items
    .filter((item) => {
      const fields = item.fields || {};
      const categories = Array.isArray(fields.schemeCategory) ? fields.schemeCategory : [];
      const tags = Array.isArray(fields.tags) ? fields.tags : [];
      const text = `${fields.schemeName || ''} ${fields.briefDescription || ''} ${tags.join(' ')}`;
      return isScholarshipScheme(text, categories);
    })
    .map(mapMySchemeScholarship);
}

export default async function handler(req, res) {
  if (!rateLimit(req, res, { route: 'scholarships', limit: 10, windowMs: 60000 })) return;
  const includeExpired = req.query?.includeExpired === 'true';

  try {
    // 1. Central Schemes (GET)
    const centralReq = fetchWithTimeout('https://scholarships.gov.in/All-Scholarships');
    
    // 2. State Schemes (POST) - Fetches 16 states live!
    const stateReq = fetchWithTimeout('https://scholarships.gov.in/centralsOrsponsoredOrstate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'central_sponsored_state=statescheme'
    });

    // 3. Sponsored Schemes (POST)
    const sponsoredReq = fetchWithTimeout('https://scholarships.gov.in/centralsOrsponsoredOrstate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'central_sponsored_state=sponserscheme'
    });

    // 4. myScheme education/scholarship schemes (official govt catalogue)
    const mySchemeReq = fetchMySchemeScholarships();

    const [centralHtml, stateHtml, sponsoredHtml, mySchemeRes] = await Promise.allSettled([
      centralReq, stateReq, sponsoredReq, mySchemeReq
    ]);

    let allScholarships = [];

    if (centralHtml.status === 'fulfilled') {
      allScholarships.push(...parseNspScholarships(centralHtml.value, 'https://scholarships.gov.in/All-Scholarships'));
    }
    if (stateHtml.status === 'fulfilled') {
      allScholarships.push(...parseNspScholarships(stateHtml.value, 'https://scholarships.gov.in/centralsOrsponsoredOrstate?state'));
    }
    if (sponsoredHtml.status === 'fulfilled') {
      allScholarships.push(...parseNspScholarships(sponsoredHtml.value, 'https://scholarships.gov.in/centralsOrsponsoredOrstate?sponsored'));
    }
    if (mySchemeRes.status === 'fulfilled') {
      allScholarships.push(...mySchemeRes.value);
    }

    // Filter duplicates by ID
    const uniqueMap = new Map();
    for (const scheme of allScholarships) {
      if (!uniqueMap.has(scheme.id)) {
        uniqueMap.set(scheme.id, scheme);
      }
    }
    
    // Check which states were fetched successfully from NSP
    const fetchedStates = Array.from(uniqueMap.values()).map(s => s.state);
    
    // Inject the remaining 28-State Fallbacks (UP, Bihar, MP, and any missing state)
    const stateFallbacks = getLiveStateFallbacks(fetchedStates);
    for (const fallback of stateFallbacks) {
      if (!uniqueMap.has(fallback.id)) {
        uniqueMap.set(fallback.id, fallback);
      }
    }

    allScholarships = Array.from(uniqueMap.values());

    if (!includeExpired) {
      allScholarships = allScholarships.filter((s) => s.status === 'open');
    }

    res.setHeader('Cache-Control', dailyCacheHeader());
    return res.status(200).json({
      meta: {
        source: 'Live feed (NSP + myScheme + Hybrid State Generators)',
        fetched_at: new Date().toISOString(),
        total: allScholarships.length,
        include_expired: includeExpired,
        live_targets_hit: [
          centralHtml.status === 'fulfilled' ? 'NSP Central' : null,
          stateHtml.status === 'fulfilled' ? 'NSP State' : null,
          sponsoredHtml.status === 'fulfilled' ? 'NSP Sponsored' : null,
          mySchemeRes.status === 'fulfilled' ? `myScheme (${mySchemeRes.value.length})` : null,
          'Hybrid Generator for All 28 Indian States & 8 UTs'
        ].filter(Boolean)
      },
      scholarships: allScholarships,
    });
  } catch (err) {
    return res.status(502).json({
      meta: {
        fetched_at: new Date().toISOString(),
        source: 'Live Fail',
      },
      scholarships: [],
      error: 'Unable to live-fetch scholarship data.',
      details: err.message,
    });
  }
}
