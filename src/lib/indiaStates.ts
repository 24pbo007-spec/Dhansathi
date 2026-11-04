// All 28 states and 8 union territories, plus helpers to match the slightly
// different spellings used by myScheme, NSP and URLs ("dadra-nagar-haveli…").

export const INDIA_STATES_AND_UTS = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana',
  'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi',
  'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
] as const;

/** Comparable key: lower-case, "&" → "and", punctuation and spaces removed. */
export function stateKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(nct of|state of|ut of|government of)\b/g, '')
    .replace(/chattisgarh/g, 'chhattisgarh')
    .replace(/orissa/g, 'odisha')
    .replace(/pondicherry/g, 'puducherry')
    .replace(/[^a-z]/g, '');
}

const BY_KEY = new Map(INDIA_STATES_AND_UTS.map((name) => [stateKey(name), name]));

/** Canonical state/UT name, or null when the text is not a state. */
export function canonicalState(value?: string | null): string | null {
  if (!value) return null;
  return BY_KEY.get(stateKey(value)) ?? null;
}

/** "uttar-pradesh" → "Uttar Pradesh". */
export function stateFromSlug(slug?: string): string | null {
  if (!slug) return null;
  return canonicalState(slug.replace(/-/g, ' '));
}

export function stateToSlug(state: string): string {
  return state.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
