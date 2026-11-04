// Builds public/stock-universe.json: every equity and ETF tradable on Angel One
// (NSE + BSE), with official company names from NSE's listing files.
//
//   npm run update:stocks
//
// Angel One's instrument master is ~36 MB and lists 150k+ instruments (F&O,
// commodities, bonds), so the website ships this compact ~6k-row extract
// instead of downloading the master on every search.

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ANGEL_MASTER_URL = 'https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json';
const NSE_EQUITY_URL = 'https://archives.nseindia.com/content/equities/EQUITY_L.csv';
const NSE_SME_URL = 'https://archives.nseindia.com/emerge/corporates/content/SME_EQUITY_L.csv';
const NSE_ETF_URL = 'https://archives.nseindia.com/content/equities/eq_etfseclist.csv';
const OUTPUT_PATH = resolve('public/stock-universe.json');

// NSE series that are ordinary shares: main board (EQ/BE/BZ) and SME (SM/ST/SZ).
// Excluded: bonds (N0-N9, NA…), G-secs (GS), T-bills (TB), gold bonds (SG), etc.
const NSE_EQUITY_SERIES = new Set(['EQ', 'BE', 'BZ', 'SM', 'ST', 'SZ']);

async function fetchText(url, timeoutMs = 180000) {
  const response = await fetch(url, {
    headers: { 'user-agent': 'Mozilla/5.0 (DhanSathi stock universe builder)', accept: '*/*' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
  return response.text();
}

function parseCsv(text) {
  const [headerLine, ...lines] = text.replace(/\r/g, '').split('\n').filter(Boolean);
  const headers = headerLine.split(',').map((h) => h.trim().toUpperCase().replace(/\s+/g, '_'));
  return lines.map((line) => {
    // NSE files have no quoted commas in the columns we read (symbol, name).
    const cells = line.split(',');
    return Object.fromEntries(headers.map((h, i) => [h, (cells[i] || '').trim()]));
  });
}

// Angel One only carries BSE ticker codes ("PUNJCOMMU"); look up the real
// company names from Yahoo Finance, 50 tickers per request.
async function fetchBseNames(symbols) {
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
  const init = await fetch('https://fc.yahoo.com', { headers: { 'user-agent': ua }, redirect: 'manual' });
  const cookie = (init.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
  const crumb = (await (await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', { headers: { 'user-agent': ua, cookie } })).text()).trim();
  const names = new Map();
  for (let i = 0; i < symbols.length; i += 50) {
    const batch = symbols.slice(i, i + 50).map((s) => `${s}.BO`);
    try {
      const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${batch.map(encodeURIComponent).join(',')}&crumb=${encodeURIComponent(crumb)}`;
      const json = await (await fetch(url, { headers: { 'user-agent': ua, cookie }, signal: AbortSignal.timeout(15000) })).json();
      for (const q of json?.quoteResponse?.result || []) {
        const name = q.longName || q.shortName;
        if (name) names.set(q.symbol.replace(/\.BO$/, ''), name.trim());
      }
    } catch {
      // keep ticker-based names for this batch
    }
  }
  return names;
}

function titleCase(value) {
  return value.replace(/\b([A-Z])([A-Z]+)\b/g, (_, a, b) => a + b.toLowerCase());
}

async function main() {
  console.log('Downloading NSE listing files…');
  const [equityCsv, smeCsv, etfCsv] = await Promise.all([
    fetchText(NSE_EQUITY_URL),
    fetchText(NSE_SME_URL),
    fetchText(NSE_ETF_URL).catch(() => ''),
  ]);

  const nseNames = new Map();
  for (const row of [...parseCsv(equityCsv), ...parseCsv(smeCsv)]) {
    if (row.SYMBOL && row.NAME_OF_COMPANY) nseNames.set(row.SYMBOL, row.NAME_OF_COMPANY);
  }
  const etfNames = new Map();
  if (etfCsv) {
    for (const row of parseCsv(etfCsv)) {
      if (row.SYMBOL) etfNames.set(row.SYMBOL, row.UNDERLYING_ASSET ? `${row.UNDERLYING_ASSET} ETF` : row.SECURITYNAME);
    }
  }
  console.log(`NSE names: ${nseNames.size} companies, ${etfNames.size} ETFs`);

  console.log('Downloading Angel One instrument master (≈36 MB)…');
  const master = JSON.parse(await fetchText(ANGEL_MASTER_URL));
  console.log(`Angel One instruments: ${master.length}`);

  const rows = [];
  const nseSymbols = new Set();

  for (const item of master) {
    if (item.exch_seg !== 'NSE' || item.instrumenttype !== '') continue;
    const dash = item.symbol.lastIndexOf('-');
    if (dash < 0) continue;
    const series = item.symbol.slice(dash + 1);
    const symbol = item.name;
    if (!NSE_EQUITY_SERIES.has(series) || /NSETEST/.test(symbol) || nseSymbols.has(symbol)) continue;

    const isEtf = etfNames.has(symbol) || (!nseNames.has(symbol) && /ETF|BEES|IETF/.test(symbol));
    const name = nseNames.get(symbol) || etfNames.get(symbol) || symbol;
    nseSymbols.add(symbol);
    // [symbol, company name, exchange, series, Angel One token, type]
    rows.push([symbol, name, 'NSE', series, item.token, isEtf ? 'ETF' : 'EQ']);
  }

  // BSE equities carry 6-digit scrip codes starting with 5; 7xxxxx/8xxxxx/
  // 9xxxxx are debt and commercial paper. Keep only stocks not already on NSE.
  for (const item of master) {
    if (item.exch_seg !== 'BSE' || item.instrumenttype !== '') continue;
    if (!/^5\d{5}$/.test(item.token)) continue;
    const symbol = item.name;
    // "07ABB", "08AQD"… are fund-plan units listed in the equity code range.
    if (nseSymbols.has(symbol) || /^\d{2}[A-Z]{3}$/.test(symbol)) continue;
    nseSymbols.add(symbol);
    rows.push([symbol, titleCase(symbol), 'BSE', '', item.token, 'EQ']);
  }

  const bseRows = rows.filter((r) => r[2] === 'BSE');
  console.log(`Looking up ${bseRows.length} BSE company names on Yahoo Finance…`);
  try {
    const bseNames = await fetchBseNames(bseRows.map((r) => r[0]));
    for (const row of bseRows) if (bseNames.has(row[0])) row[1] = bseNames.get(row[0]);
    console.log(`Named ${bseNames.size} of ${bseRows.length} BSE-only stocks`);
  } catch (error) {
    console.warn('BSE name lookup failed; keeping ticker names:', error.message);
  }

  rows.sort((a, b) => a[0].localeCompare(b[0]));

  const output = {
    generated_at: new Date().toISOString(),
    source: 'Angel One SmartAPI instrument master + NSE listing files',
    fields: ['symbol', 'name', 'exchange', 'series', 'angel_token', 'type'],
    count: rows.length,
    rows,
  };
  writeFileSync(OUTPUT_PATH, JSON.stringify(output));
  const nse = rows.filter((r) => r[2] === 'NSE').length;
  console.log(`Wrote ${rows.length} instruments (${nse} NSE, ${rows.length - nse} BSE-only) to ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
