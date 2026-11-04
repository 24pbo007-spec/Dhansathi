// Every equity and ETF tradable on Angel One (NSE + BSE), from
// public/stock-universe.json (built by `npm run update:stocks`).

export interface UniverseStock {
  symbol: string;
  name: string;
  exchange: 'NSE' | 'BSE';
  series: string;
  angelToken: string;
  type: 'EQ' | 'ETF';
  /** Yahoo Finance ticker used for live prices, e.g. RELIANCE.NS. */
  ticker: string;
}

interface UniverseFile {
  generated_at: string;
  count: number;
  rows: [string, string, string, string, string, string][];
}

// Old names people still search for → current NSE symbol.
const ALIASES: Record<string, string[]> = {
  ETERNAL: ['zomato'],
  TMPV: ['tata motors', 'tatamotors'],
  TMCV: ['tata motors commercial', 'tatamotors'],
  'M&M': ['mahindra', 'mahindra and mahindra'],
  'BAJAJ-AUTO': ['bajaj auto'],
  LICI: ['lic', 'life insurance corporation'],
  NAUKRI: ['info edge', 'naukri'],
  IRCTC: ['indian railway catering'],
  JIOFIN: ['jio financial'],
  ADANIENSOL: ['adani transmission'],
};

let universePromise: Promise<UniverseStock[]> | null = null;
let universeMeta: { generated_at: string; count: number } | null = null;

export function loadStockUniverse(): Promise<UniverseStock[]> {
  if (!universePromise) {
    universePromise = fetch(`${import.meta.env.BASE_URL}stock-universe.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`Stock list unavailable (HTTP ${response.status})`);
        return response.json() as Promise<UniverseFile>;
      })
      .then((file) => {
        universeMeta = { generated_at: file.generated_at, count: file.count };
        return file.rows.map(([symbol, name, exchange, series, angelToken, type]) => ({
          symbol,
          name,
          exchange: exchange as 'NSE' | 'BSE',
          series,
          angelToken,
          type: type as 'EQ' | 'ETF',
          ticker: `${symbol}.${exchange === 'BSE' ? 'BO' : 'NS'}`,
        }));
      })
      .catch((error) => {
        universePromise = null; // allow a retry on the next search
        throw error;
      });
  }
  return universePromise;
}

export function getStockUniverseMeta() {
  return universeMeta;
}

const normalise = (value: string) => value.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const compact = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Rank stocks by how well they match: exact symbol > symbol prefix > name prefix > word match. */
export async function searchStockUniverse(query: string, limit = 20): Promise<UniverseStock[]> {
  const q = normalise(query);
  const qCompact = compact(query);
  if (!qCompact) return [];
  const stocks = await loadStockUniverse();
  const words = q.split(' ');

  const scored: { stock: UniverseStock; score: number }[] = [];
  for (const stock of stocks) {
    const sym = compact(stock.symbol);
    const name = normalise(stock.name);
    const aliases = ALIASES[stock.symbol] ?? [];
    let score = 0;

    if (sym === qCompact) score = 100;
    else if (aliases.some((a) => normalise(a) === q)) score = 95;
    else if (sym.startsWith(qCompact)) score = 80 - Math.min(20, sym.length - qCompact.length);
    else if (name.startsWith(q)) score = 70;
    else if (aliases.some((a) => normalise(a).startsWith(q))) score = 68;
    else if (words.every((w) => name.split(' ').some((part) => part.startsWith(w)))) score = 55;
    else if (qCompact.length >= 3 && (sym.includes(qCompact) || compact(stock.name).includes(qCompact))) score = 35;

    if (!score) continue;
    // Prefer main-board NSE shares over SME/BSE-only lines and ETFs on ties.
    if (stock.exchange === 'NSE') score += 3;
    if (stock.series === 'EQ') score += 2;
    if (stock.type === 'ETF') score -= 1;
    scored.push({ stock, score });
  }

  return scored
    .sort((a, b) => b.score - a.score || a.stock.symbol.length - b.stock.symbol.length)
    .slice(0, limit)
    .map((s) => s.stock);
}

export async function findUniverseStock(symbol: string): Promise<UniverseStock | null> {
  const upper = symbol.toUpperCase().replace(/\.(NS|BO)$/, '');
  const stocks = await loadStockUniverse();
  return stocks.find((s) => s.symbol === upper) ?? null;
}
