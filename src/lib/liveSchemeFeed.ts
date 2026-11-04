import { GOVERNMENT_SCHEMES } from '@/data/governmentSchemes';
import type { GovernmentScheme } from '@/types';

export interface LiveSchemeFeed {
  meta?: {
    source: string;
    source_url: string;
    updated_at: string;
    total: number;
    fetched: number;
    new_count: number;
  };
  schemes: GovernmentScheme[];
}

export async function loadLiveSchemeFeed(): Promise<LiveSchemeFeed | null> {
  // Prefer the live myScheme feed (refreshed daily via edge cache); fall back
  // to the committed static snapshot if the live endpoint is unavailable.
  try {
    // Browser cache (15 min) + edge cache (until 00:30 IST) keep repeat visits instant.
    const live = await fetch('/api/schemes');
    if (live.ok) {
      const feed = (await live.json()) as LiveSchemeFeed & { error?: string };
      if (!feed.error && feed.schemes?.length) return feed;
    }
  } catch {
    // ignore and fall back to the static snapshot below
  }

  try {
    const response = await fetch(`${import.meta.env.BASE_URL}generated-government-schemes.json`, { cache: 'no-store' });
    if (!response.ok) return null;
    return await response.json() as LiveSchemeFeed;
  } catch {
    return null;
  }
}

export function mergeSchemeFeeds(liveSchemes: GovernmentScheme[]): GovernmentScheme[] {
  const byKey = new Map<string, GovernmentScheme>();

  for (const scheme of GOVERNMENT_SCHEMES) {
    byKey.set(scheme.slug || scheme.name.toLowerCase(), scheme);
  }

  for (const scheme of liveSchemes) {
    byKey.set(scheme.slug || scheme.name.toLowerCase(), scheme);
  }

  return [...byKey.values()];
}

export function getPrimarySchemeCategory(scheme: GovernmentScheme): string {
  if (scheme.scheme_categories?.length) return scheme.scheme_categories[0];

  const ministry = scheme.ministry.toLowerCase();
  if (ministry.includes('health')) return 'Health';
  if (ministry.includes('finance') || ministry.includes('pension') || ministry.includes('labour')) return 'Finance';
  if (ministry.includes('education') || ministry.includes('skill')) return 'Education & Learning';
  if (ministry.includes('agriculture') || ministry.includes('farmer')) return 'Agriculture,Rural & Environment';
  if (ministry.includes('housing') || ministry.includes('urban')) return 'Housing & Shelter';
  if (ministry.includes('women') || ministry.includes('child')) return 'Women and Child';
  if (ministry.includes('rural') || ministry.includes('panchayati')) return 'Agriculture,Rural & Environment';
  if (ministry.includes('food')) return 'Food & Nutrition';
  if (ministry.includes('energy') || ministry.includes('petroleum') || ministry.includes('power')) return 'Utility & Sanitation';
  if (ministry.includes('social') || ministry.includes('empowerment')) return 'Social welfare & Empowerment';
  return 'General';
}
