// What-if scenarios for DhanMitra, expressed as explicit, visible assumptions:
// an extra price move (shock) phased in over a few days plus a change in
// volatility. Sector keys are Yahoo Finance sector names. These are model
// assumptions shown to the user, not forecasts of real events.

const SCENARIOS = {
  rbi_rate: {
    title: 'RBI Rate Cut',
    market: 0.01, // market-wide move, scaled by the stock's beta
    sector: {
      'Financial Services': 0.02,
      'Real Estate': 0.025,
      'Consumer Cyclical': 0.015,
      Industrials: 0.01,
      Utilities: 0.005,
      Technology: -0.005,
    },
    stock: 0,
    volMultiplier: 0.95,
    shockDays: 10,
    why: 'Cheaper loans help banks, NBFCs, real estate, autos and capex-heavy companies most.',
  },
  earnings_beat: {
    title: 'Earnings Beat',
    market: 0,
    sector: {},
    stock: 0.04,
    volMultiplier: 1.3,
    shockDays: 3,
    why: 'A results beat usually gaps the stock up and raises volatility around the announcement.',
  },
  policy_change: {
    title: 'Policy Change',
    market: 0,
    sector: { Industrials: 0.015, Utilities: 0.015, Energy: 0.01, 'Basic Materials': 0.01 },
    stock: 0,
    volMultiplier: 1.25,
    shockDays: 10,
    why: 'Policy news mainly raises uncertainty; infrastructure, power and materials tend to benefit from reform pushes.',
  },
  global_crash: {
    title: 'Global Crash',
    market: -0.15,
    sector: { 'Consumer Defensive': 0.05, Healthcare: 0.04, Utilities: 0.03 },
    stock: 0,
    volMultiplier: 2.2,
    shockDays: 15,
    why: 'A global sell-off hits high-beta stocks hardest; FMCG, pharma and utilities usually fall less.',
  },
  fii_dii: {
    title: 'FII/DII Buying',
    market: 0.03,
    sector: { 'Financial Services': 0.01 },
    stock: 0,
    volMultiplier: 1,
    shockDays: 10,
    why: 'Large institutional inflows lift index heavyweights first, especially banks.',
  },
  commodity: {
    title: 'Commodity Shock (crude spike)',
    market: -0.015,
    sector: {
      'Basic Materials': 0.045,
      Energy: 0.02,
      'Consumer Cyclical': -0.03,
      'Consumer Defensive': -0.015,
      Industrials: -0.01,
    },
    stock: 0,
    volMultiplier: 1.3,
    shockDays: 10,
    why: 'Costlier crude and raw materials squeeze autos, paints and FMCG margins while metal and energy producers gain.',
  },
};

export function getScenario(id) {
  return SCENARIOS[id] || null;
}

/** Turn a preset into a total percentage move for this particular stock. */
export function presetShock(id, { sector, beta }) {
  const s = SCENARIOS[id];
  if (!s) return null;
  const b = beta == null ? 1 : Math.max(0.4, Math.min(2, beta));
  const pct = s.market * b + (s.sector[sector] || 0) + s.stock;
  return {
    title: s.title,
    shock_pct: pct * 100,
    vol_multiplier: s.volMultiplier,
    shock_days: s.shockDays,
    basis: 'preset',
    rationale: `${s.why} Assumed impact for this stock: market ${(s.market * 100).toFixed(1)}% × beta ${b.toFixed(2)}${
      s.sector[sector] ? ` + ${sector} sector ${(s.sector[sector] * 100).toFixed(1)}%` : ''
    }${s.stock ? ` + company-specific ${(s.stock * 100).toFixed(1)}%` : ''}.`,
  };
}
