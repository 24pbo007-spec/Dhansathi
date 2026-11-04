// DhanSathi income-tax engine. Pure functions, no UI: give it a TaxInput and a
// regime and it returns every step of the computation, so the UI can show
// exactly how each rupee of tax was arrived at.

import { TAX_RULES, type AgeBand, type Regime, type Slab, type YearRules } from './rules';
import type { Instalment, Line, RegimeResult, SpecialTaxLine, Suggestion, TaxInput, TaxReport } from './types';

const pos = (n: number) => Math.max(0, n || 0);
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const round10 = (n: number) => Math.round(n / 10) * 10; // sec 288A/288B

function slabsFor(rules: YearRules, regime: Regime, age: AgeBand, resident: boolean): Slab[] {
  // Higher old-regime exemption limits for seniors apply to residents only.
  return rules.regimes[regime].slabs[resident ? age : 'below60'];
}

function slabTax(income: number, slabs: Slab[]) {
  const rows: RegimeResult['slabBreakdown'] = [];
  let from = 0;
  let tax = 0;
  for (const slab of slabs) {
    if (income <= from) break;
    const amount = Math.min(income, slab.upTo) - from;
    const t = amount * slab.rate;
    rows.push({ from, to: slab.upTo, rate: slab.rate, amount, tax: t });
    tax += t;
    from = slab.upTo;
  }
  return { tax, rows };
}

function surchargeRateFor(totalIncome: number, rules: YearRules, regime: Regime): number {
  const bracket = rules.surcharge.find((s) => totalIncome > s.above);
  return bracket ? Math.min(bracket.rate, rules.regimes[regime].maxSurchargeRate) : 0;
}

// ─── Income under each head ────────────────────────────────────────────────

interface Heads {
  grossSalary: number;
  salary: number;
  exemptions: Line[];
  salaryDeductions: Line[];
  houseProperty: number;
  hpLossCarried: number;
  business: number; // may be negative
  speculativeLossCarried: number;
  otherSlab: number; // other sources at slab rates (after family-pension deduction)
  familyPensionDeduction: number;
  dividends: number;
  notes: string[];
}

function computeHeads(input: TaxInput, regime: Regime, rules: YearRules): Heads {
  const r = rules.regimes[regime];
  const s = input.salary;
  const notes: string[] = [];
  const basicDa = pos(s.basic) + pos(s.da);
  // Employer PF + NPS above ₹7.5 lakh a year is a taxable perquisite (both regimes).
  const retirementExcess = pos(pos(s.employerPf) + pos(s.employerNps) - rules.employerRetirementCap);
  if (retirementExcess > 0) {
    notes.push(`Employer PF + NPS above ₹7.5 lakh (${inr(retirementExcess)}) is taxed as a perquisite.`);
  }
  const grossSalary =
    basicDa + pos(s.hra) + pos(s.special) + pos(s.bonus) + pos(s.otherTaxable) + pos(s.employerNps) + pos(s.pension) + retirementExcess;

  const exemptions: Line[] = [];
  if (regime === 'old' && s.hra > 0 && s.rentPaid > 0) {
    const hraExempt = Math.min(s.hra, pos(s.rentPaid - 0.1 * basicDa), (s.metro ? 0.5 : 0.4) * basicDa);
    if (hraExempt > 0) {
      exemptions.push({
        label: 'HRA exemption (sec 10(13A))',
        amount: hraExempt,
        note: `Least of HRA received, rent − 10% of basic+DA, and ${s.metro ? '50' : '40'}% of basic+DA (${s.metro ? rules.hraMetros.join(', ') : 'non-metro'})`,
      });
    }
  }
  if (regime === 'old' && s.ltaExempt > 0) exemptions.push({ label: 'LTA exemption (sec 10(5))', amount: s.ltaExempt });
  const totalExempt = exemptions.reduce((a, l) => a + l.amount, 0);

  const salaryDeductions: Line[] = [];
  const afterExempt = pos(grossSalary - totalExempt);
  if (afterExempt > 0) {
    salaryDeductions.push({ label: 'Standard deduction (sec 16(ia))', amount: Math.min(r.standardDeduction, afterExempt) });
  }
  if (regime === 'old' && s.professionalTax > 0) {
    salaryDeductions.push({ label: 'Professional tax (sec 16(iii))', amount: Math.min(s.professionalTax, rules.limits.professionalTax) });
  }
  const salary = pos(afterExempt - salaryDeductions.reduce((a, l) => a + l.amount, 0));

  // House property
  const hp = input.houseProperty;
  let selfOcc = 0;
  if (hp.selfOccupiedInterest > 0) {
    if (regime === 'old') selfOcc = -Math.min(hp.selfOccupiedInterest, rules.limits.sec24bSelfOccupied);
    else notes.push('Home-loan interest on a self-occupied house is not deductible in the new regime.');
  }
  let letOut = 0;
  if (hp.letOutRent > 0 || hp.letOutInterest > 0) {
    const nav = pos(hp.letOutRent - hp.letOutMunicipalTax);
    letOut = nav * 0.7 - pos(hp.letOutInterest);
  }
  let houseProperty = selfOcc + letOut;
  let hpLossCarried = 0;
  if (houseProperty < 0) {
    if (regime === 'new') {
      houseProperty = 0;
      notes.push('A loss from house property cannot be set off against other income or carried forward in the new regime.');
    } else if (-houseProperty > rules.limits.housePropertyLossSetOff) {
      hpLossCarried = -houseProperty - rules.limits.housePropertyLossSetOff;
      houseProperty = -rules.limits.housePropertyLossSetOff;
      notes.push('House-property loss above ₹2,00,000 is carried forward for up to 8 years.');
    }
  }

  // Business / profession
  const b = input.business;
  let bizProfit = 0;
  if (b.type === '44AD') {
    const digital = Math.min(100, pos(b.digitalPct)) / 100;
    const presumptive = b.turnover * (digital * rules.presumptive.ad.digitalRate + (1 - digital) * rules.presumptive.ad.cashRate);
    bizProfit = Math.max(presumptive, pos(b.declaredProfit));
    const limit = digital >= 0.95 ? rules.presumptive.ad.limitIfMostlyDigital : rules.presumptive.ad.limit;
    if (b.turnover > limit) notes.push(`Turnover above ₹${(limit / 1e7).toFixed(0)} crore is not eligible for 44AD — books and audit are required.`);
  } else if (b.type === '44ADA') {
    bizProfit = Math.max(b.turnover * rules.presumptive.ada.rate, pos(b.declaredProfit));
    const limit = pos(b.digitalPct) >= 95 ? rules.presumptive.ada.limitIfMostlyDigital : rules.presumptive.ada.limit;
    if (b.turnover > limit) notes.push(`Receipts above ₹${(limit / 1e5).toFixed(0)} lakh are not eligible for 44ADA.`);
  } else if (b.type === 'regular') {
    bizProfit = b.regularProfit || 0;
  }
  const t = input.trading;
  let speculativeLossCarried = 0;
  let speculative = t.intradayProfit || 0;
  if (speculative < 0) {
    speculativeLossCarried = -speculative;
    speculative = 0;
    notes.push('Intraday (speculative) losses can only be set off against speculative income; they are carried forward for 4 years.');
  }
  const business = bizProfit + (t.fnoProfit || 0) + speculative;

  // Other sources at slab rates
  const o = input.other;
  const familyPensionDeduction = Math.min(pos(o.familyPension) / 3, r.familyPensionCap);
  const otherSlab = pos(o.savingsInterest) + pos(o.fdInterest) + pos(o.dividends) + pos(o.other) + pos(o.familyPension) - familyPensionDeduction;

  return {
    grossSalary,
    salary,
    exemptions,
    salaryDeductions,
    houseProperty,
    hpLossCarried,
    business,
    speculativeLossCarried,
    otherSlab,
    familyPensionDeduction,
    dividends: pos(o.dividends),
    notes,
  };
}

// ─── Capital gains netting ─────────────────────────────────────────────────

interface Gains {
  stcg111A: number;
  stcgSlab: number;
  ltcg112A: number;
  ltcgOther: number;
  property: number;
  propertyRate: number;
  propertyIndexed: boolean;
  stLossCarried: number;
  ltLossCarried: number;
}

function netGains(input: TaxInput, rules: YearRules): Gains {
  const c = input.capitalGains;
  // Land/building bought before 23 Jul 2024: resident individuals may pick the
  // lower of 12.5% without indexation or 20% with indexation.
  let property = c.propertyGain || 0;
  let propertyRate = rules.cg.ltcgOther;
  let propertyIndexed = false;
  if (input.resident && c.propertyBoughtBefore2024 && c.propertyGain > 0) {
    const plain = c.propertyGain * rules.cg.ltcgOther;
    const indexed = pos(c.propertyGainIndexed) * rules.cg.ltcgPropertyIndexed;
    if (indexed < plain) {
      property = pos(c.propertyGainIndexed);
      propertyRate = rules.cg.ltcgPropertyIndexed;
      propertyIndexed = true;
    }
  }

  const g = {
    stcg111A: c.stcg111A || 0,
    stcgSlab: c.stcgSlab || 0,
    ltcg112A: c.ltcg112A || 0,
    ltcgOther: c.ltcgOther || 0,
    property,
  };

  // Short-term losses: against short-term gains, then long-term gains.
  let stLoss = pos(-g.stcg111A) + pos(-g.stcgSlab);
  g.stcg111A = pos(g.stcg111A);
  g.stcgSlab = pos(g.stcgSlab);
  // Long-term losses: only against long-term gains.
  let ltLoss = pos(-g.ltcg112A) + pos(-g.ltcgOther) + pos(-g.property);
  g.ltcg112A = pos(g.ltcg112A);
  g.ltcgOther = pos(g.ltcgOther);
  g.property = pos(g.property);

  const absorb = (key: keyof typeof g, loss: number) => {
    const used = Math.min(g[key], loss);
    g[key] -= used;
    return loss - used;
  };
  // Use losses against the highest-taxed gains first.
  for (const key of ['stcgSlab', 'stcg111A', 'property', 'ltcgOther', 'ltcg112A'] as const) stLoss = absorb(key, stLoss);
  for (const key of ['property', 'ltcgOther', 'ltcg112A'] as const) ltLoss = absorb(key, ltLoss);

  return { ...g, propertyRate, propertyIndexed, stLossCarried: stLoss, ltLossCarried: ltLoss };
}

// ─── Core tax on a given income mix (used again for surcharge marginal relief) ─

interface Mix {
  normal: number; // slab income after deductions
  stcg111A: number;
  ltcg112A: number; // before the ₹1.25 lakh exemption
  ltcgOther: number;
  property: number;
  propertyRate: number;
  vda: number;
  lottery: number;
  dividends: number;
}

interface CoreTax {
  slabRows: RegimeResult['slabBreakdown'];
  taxOnNormal: number;
  special: SpecialTaxLine[];
  taxOnSpecial: number;
  shortfallUsed: number;
  totalIncome: number;
  rebate: number;
  rebateMarginalRelief: number;
  surchargeRate: number;
  surcharge: number;
}

function coreTax(mix: Mix, input: TaxInput, regime: Regime, rules: YearRules, rateOverride?: number): CoreTax {
  const r = rules.regimes[regime];
  const slabs = slabsFor(rules, regime, input.age, input.resident);
  const { tax: taxOnNormal, rows: slabRows } = slabTax(mix.normal, slabs);

  // Unused basic exemption can absorb 111A/112/112A gains (residents only).
  const basicLimit = slabs[0].upTo;
  let shortfall = input.resident ? pos(basicLimit - mix.normal) : 0;
  const shortfallStart = shortfall;
  const take = (amount: number) => {
    const used = Math.min(shortfall, amount);
    shortfall -= used;
    return amount - used;
  };

  const ltcg112AAfterExemption = pos(mix.ltcg112A - rules.cg.ltcg112AExemption);
  const ordered: { label: string; income: number; rate: number; base: number }[] = [
    { label: 'Short-term equity gains (sec 111A)', income: mix.stcg111A, rate: rules.cg.stcg111A, base: mix.stcg111A },
    { label: `Land/building LTCG (sec 112)${mix.propertyRate > rules.cg.ltcgOther ? ' with indexation' : ''}`, income: mix.property, rate: mix.propertyRate, base: mix.property },
    { label: 'Other long-term gains (sec 112)', income: mix.ltcgOther, rate: rules.cg.ltcgOther, base: mix.ltcgOther },
    { label: 'Long-term equity gains (sec 112A, above ₹1.25 lakh)', income: mix.ltcg112A, rate: rules.cg.ltcg112A, base: ltcg112AAfterExemption },
  ].sort((a, b) => b.rate - a.rate);

  const special: SpecialTaxLine[] = [];
  for (const item of ordered) {
    if (item.income <= 0) continue;
    const taxable = take(item.base);
    special.push({ label: item.label, income: item.income, taxable, rate: item.rate, tax: taxable * item.rate });
  }
  if (mix.vda > 0) special.push({ label: 'Crypto / VDA gains (sec 115BBH)', income: mix.vda, taxable: mix.vda, rate: rules.vdaRate, tax: mix.vda * rules.vdaRate });
  if (mix.lottery > 0) special.push({ label: 'Lottery / game winnings (sec 115BB)', income: mix.lottery, taxable: mix.lottery, rate: rules.lotteryRate, tax: mix.lottery * rules.lotteryRate });
  const taxOnSpecial = special.reduce((a, s) => a + s.tax, 0);

  const totalIncome = mix.normal + mix.stcg111A + mix.ltcg112A + mix.ltcgOther + mix.property + mix.vda + mix.lottery;

  // Section 87A rebate (residents only)
  let rebate = 0;
  let rebateMarginalRelief = 0;
  const capitalGainTax = special
    .filter((s) => /111A|sec 112\)|Land/.test(s.label) && !/112A/.test(s.label))
    .reduce((a, s) => a + s.tax, 0);
  const rebateBase = taxOnNormal + (r.rebateOnSpecialIncome ? capitalGainTax : 0);
  if (input.resident && totalIncome <= r.rebateLimit) {
    rebate = Math.min(r.rebateMax, rebateBase);
  } else if (input.resident && r.rebateMarginalRelief && totalIncome > r.rebateLimit) {
    // Tax on slab income may not exceed the income earned above the limit.
    rebateMarginalRelief = pos(taxOnNormal - (totalIncome - r.rebateLimit));
  }

  // Surcharge: 15% cap on capital gains under 111A/112/112A and on dividends.
  const surchargeRate = rateOverride ?? surchargeRateFor(totalIncome, rules, regime);
  const normalAfterRebate = pos(taxOnNormal - rebate - rebateMarginalRelief);
  const dividendShare = mix.normal > 0 ? normalAfterRebate * Math.min(1, mix.dividends / mix.normal) : 0;
  const cgTax = pos(special.filter((s) => !/VDA|Lottery/.test(s.label)).reduce((a, s) => a + s.tax, 0) - (r.rebateOnSpecialIncome ? pos(rebate - Math.min(rebate, taxOnNormal)) : 0));
  const otherSpecial = special.filter((s) => /VDA|Lottery/.test(s.label)).reduce((a, s) => a + s.tax, 0);
  const cappedRate = Math.min(surchargeRate, rules.specialSurchargeCap);
  const surcharge =
    surchargeRate * (normalAfterRebate - dividendShare + otherSpecial) + cappedRate * (cgTax + dividendShare);

  return {
    slabRows,
    taxOnNormal,
    special,
    taxOnSpecial,
    shortfallUsed: shortfallStart - shortfall,
    totalIncome,
    rebate,
    rebateMarginalRelief,
    surchargeRate,
    surcharge,
  };
}

const taxPlusSurcharge = (c: CoreTax) => pos(c.taxOnNormal + c.taxOnSpecial - c.rebate - c.rebateMarginalRelief) + c.surcharge;

// ─── One regime, end to end ────────────────────────────────────────────────

export function computeRegime(input: TaxInput, regime: Regime): RegimeResult {
  const rules = TAX_RULES[input.fy];
  const r = rules.regimes[regime];
  const heads = computeHeads(input, regime, rules);
  const gains = netGains(input, rules);
  const notes = [...heads.notes];
  const carriedForward: Line[] = [];

  // Business loss: set off against every head except salary — slab income
  // first, then capital gains.
  let normalNonSalary = heads.houseProperty + heads.otherSlab + gains.stcgSlab;
  let business = heads.business;
  if (business < 0) {
    let loss = -business;
    business = 0;
    const fromSlab = Math.min(loss, pos(normalNonSalary));
    normalNonSalary -= fromSlab;
    loss -= fromSlab;
    for (const key of ['stcg111A', 'property', 'ltcgOther', 'ltcg112A'] as const) {
      const used = Math.min(loss, gains[key]);
      gains[key] -= used;
      loss -= used;
    }
    if (loss > 0) {
      carriedForward.push({ label: 'Business / F&O loss', amount: loss, note: 'Carry forward 8 years — file ITR on time' });
      notes.push('Unabsorbed business/F&O loss can be carried forward only if you file your return before the due date.');
    }
  }
  if (heads.hpLossCarried) carriedForward.push({ label: 'House-property loss', amount: heads.hpLossCarried });
  if (heads.speculativeLossCarried) carriedForward.push({ label: 'Intraday (speculative) loss', amount: heads.speculativeLossCarried });
  if (gains.stLossCarried) carriedForward.push({ label: 'Short-term capital loss', amount: gains.stLossCarried });
  if (gains.ltLossCarried) carriedForward.push({ label: 'Long-term capital loss', amount: gains.ltLossCarried });
  if (input.crypto.losses > 0) {
    notes.push('Crypto (VDA) losses cannot be set off against any income — not even other crypto gains — and cannot be carried forward.');
  }

  // Salary absorbs a house-property loss (old regime) like any other head.
  let normalGross = heads.salary + business + normalNonSalary;
  if (normalGross < 0) normalGross = 0;

  const capitalGainsHead = gains.stcg111A + gains.stcgSlab + gains.ltcg112A + gains.ltcgOther + gains.property;
  const vda = pos(input.crypto.gains);
  const lottery = pos(input.other.lottery);
  const grossTotalIncome = normalGross + gains.stcg111A + gains.ltcg112A + gains.ltcgOther + gains.property + vda + lottery;

  // Chapter VI-A — only against slab income, never against special-rate income.
  const d = input.deductions;
  const s = input.salary;
  const basicDa = pos(s.basic) + pos(s.da);
  const deductions: Line[] = [];
  const add = (label: string, amount: number, note?: string) => {
    if (amount > 0) deductions.push({ label, amount, note });
  };
  const npsPct = s.govtEmployer ? r.employerNpsPctGovt : r.employerNpsPctOfSalary;
  const employerNpsCap = s.employerNps > 0 ? Math.min(s.employerNps, npsPct * basicDa) : 0;
  add('Employer NPS (sec 80CCD(2))', employerNpsCap, `Up to ${Math.round(npsPct * 100)}% of basic + DA`);
  add('Agniveer Corpus Fund (sec 80CCH)', pos(d.agniveer80CCH));
  if (regime === 'old') {
    const senior = input.age !== 'below60';
    add('80C — PF, PPF, ELSS, LIC, tuition, principal', Math.min(rules.limits.sec80C, pos(d.sec80C) + pos(s.employeePf)), 'Max ₹1,50,000');
    add('80CCD(1B) — own NPS', Math.min(rules.limits.sec80CCD1B, pos(d.sec80CCD1B)), 'Max ₹50,000 over 80C');
    add('80D — health insurance (self & family)', Math.min(senior ? rules.limits.sec80DSelfSenior : rules.limits.sec80DSelf, pos(d.sec80DSelf)));
    add('80D — parents', Math.min(d.parentsSenior ? rules.limits.sec80DParentsSenior : rules.limits.sec80DParents, pos(d.sec80DParents)));
    add('80E — education-loan interest', pos(d.sec80E));
    add('80G — donations', pos(d.sec80G));
    add('80EEA — affordable-housing loan interest', Math.min(150000, pos(d.sec80EEA)));
    if (senior) {
      add('80TTB — interest (senior citizen)', Math.min(rules.limits.sec80TTB, pos(input.other.savingsInterest) + pos(input.other.fdInterest)));
    } else {
      add('80TTA — savings-account interest', Math.min(rules.limits.sec80TTA, pos(input.other.savingsInterest)));
    }
    if (d.disability !== 'none') add('80U — self disability', d.disability === 'severe' ? rules.limits.sec80USevere : rules.limits.sec80U);
    add('Other Chapter VI-A deductions', pos(d.otherVIA));
    // 80GG: rent paid without HRA.
    if (s.hra === 0 && s.rentPaid > 0) {
      const ati = pos(normalGross - deductions.reduce((a, l) => a + l.amount, 0));
      add('80GG — rent paid (no HRA)', Math.min(rules.limits.sec80GGMonthly * 12, 0.25 * ati, pos(s.rentPaid - 0.1 * ati)));
    }
  } else if (d.sec80C + d.sec80CCD1B + d.sec80DSelf + d.sec80DParents + d.sec80E + d.sec80G > 0) {
    notes.push('80C, 80D, 80E, 80G and other Chapter VI-A deductions (except employer NPS) are not allowed in the new regime.');
  }
  const totalDeductions = Math.min(normalGross, deductions.reduce((a, l) => a + l.amount, 0));
  const normalIncome = round10(pos(normalGross - totalDeductions));

  const mix: Mix = {
    normal: normalIncome,
    stcg111A: gains.stcg111A,
    ltcg112A: gains.ltcg112A,
    ltcgOther: gains.ltcgOther,
    property: gains.property,
    propertyRate: gains.propertyRate,
    vda,
    lottery,
    dividends: heads.dividends,
  };
  const core = coreTax(mix, input, regime, rules);

  // Marginal relief on surcharge: crossing a surcharge threshold may not cost
  // more extra tax than the extra income.
  let surchargeMarginalRelief = 0;
  if (core.surchargeRate > 0) {
    const threshold = rules.surcharge.find((b) => core.totalIncome > b.above)!.above;
    const excess = core.totalIncome - threshold;
    const lowerRate = surchargeRateFor(threshold, rules, regime);
    const atThreshold = coreTax({ ...mix, normal: pos(mix.normal - excess) }, input, regime, rules, lowerRate);
    surchargeMarginalRelief = pos(taxPlusSurcharge(core) - (taxPlusSurcharge(atThreshold) + excess));
    surchargeMarginalRelief = Math.min(surchargeMarginalRelief, core.surcharge);
  }

  const taxAfterRebate = pos(core.taxOnNormal + core.taxOnSpecial - core.rebate - core.rebateMarginalRelief);
  const surcharge = pos(core.surcharge - surchargeMarginalRelief);
  const cess = (taxAfterRebate + surcharge) * rules.cess;
  const totalTax = round10(taxAfterRebate + surcharge + cess);

  if (core.rebate > 0 && core.taxOnSpecial > 0 && !r.rebateOnSpecialIncome) {
    notes.push('The 87A rebate covers tax on salary and other slab income only — tax on capital gains, crypto and lottery is still payable.');
  }
  if (core.rebateMarginalRelief > 0) {
    notes.push(`Marginal relief of ₹${Math.round(core.rebateMarginalRelief).toLocaleString('en-IN')} applied: your tax cannot exceed the income you earn above ₹12 lakh.`);
  }

  return {
    regime,
    heads: {
      salary: heads.salary,
      houseProperty: heads.houseProperty,
      business,
      capitalGains: capitalGainsHead,
      otherSources: heads.otherSlab + lottery,
    },
    exemptions: [...heads.exemptions, ...heads.salaryDeductions, ...(heads.familyPensionDeduction ? [{ label: 'Family pension deduction (sec 57(iia))', amount: heads.familyPensionDeduction }] : [])],
    grossTotalIncome,
    deductions,
    totalDeductions,
    normalIncome,
    totalIncome: round10(core.totalIncome),
    slabBreakdown: core.slabRows,
    taxOnNormal: core.taxOnNormal,
    special: core.special,
    taxOnSpecial: core.taxOnSpecial,
    basicExemptionUsedOnGains: core.shortfallUsed,
    rebate: core.rebate,
    rebateMarginalRelief: core.rebateMarginalRelief,
    surchargeRate: core.surchargeRate,
    surcharge,
    surchargeMarginalRelief,
    cess,
    totalTax,
    effectiveRate: core.totalIncome > 0 ? totalTax / core.totalIncome : 0,
    carriedForward,
    notes,
  };
}

// ─── Full report ───────────────────────────────────────────────────────────

function withExtraDeduction(input: TaxInput, extra: number): TaxInput {
  return { ...input, deductions: { ...input.deductions, otherVIA: pos(input.deductions.otherVIA) + extra } };
}

/** Smallest extra old-regime deduction at which the old regime beats the new one. */
function oldBreakEven(input: TaxInput, newTax: number): number | null {
  if (computeRegime(input, 'old').totalTax <= newTax) return 0;
  let lo = 0;
  let hi = 5000000;
  if (computeRegime(withExtraDeduction(input, hi), 'old').totalTax > newTax) return null;
  while (hi - lo > 1000) {
    const mid = (lo + hi) / 2;
    if (computeRegime(withExtraDeduction(input, mid), 'old').totalTax <= newTax) hi = mid;
    else lo = mid;
  }
  return Math.ceil(hi / 1000) * 1000;
}

function chooseItr(input: TaxInput, res: RegimeResult): { form: string; reason: string } {
  const b = input.business;
  const t = input.trading;
  const c = input.capitalGains;
  const hasBooksBusiness = b.type === 'regular' || t.fnoProfit !== 0 || t.intradayProfit !== 0 || t.fnoTurnover > 0;
  const hasPresumptive = b.type === '44AD' || b.type === '44ADA';
  const otherCg = c.stcg111A !== 0 || c.stcgSlab !== 0 || c.ltcgOther !== 0 || c.propertyGain !== 0 || c.ltcg112A > 125000 || c.ltcg112A < 0;
  const hasVda = input.crypto.gains > 0 || input.crypto.losses > 0;
  const twoHouses = input.houseProperty.selfOccupiedInterest > 0 && (input.houseProperty.letOutRent > 0 || input.houseProperty.letOutInterest > 0);
  const carry = res.carriedForward.length > 0;

  if (hasBooksBusiness) return { form: 'ITR-3', reason: 'You have business income from books, F&O or intraday trading.' };
  if (hasPresumptive) {
    if (!input.resident || res.totalIncome > 5000000 || otherCg || hasVda || carry) {
      return { form: 'ITR-3', reason: 'Presumptive income together with capital gains, crypto, losses, NRI status or income above ₹50 lakh needs ITR-3.' };
    }
    return { form: 'ITR-4 (Sugam)', reason: 'Presumptive business/professional income (44AD/44ADA), income up to ₹50 lakh.' };
  }
  if (!input.resident || res.totalIncome > 5000000 || otherCg || hasVda || twoHouses || carry || input.other.lottery > 0) {
    return { form: 'ITR-2', reason: 'Capital gains beyond ₹1.25 lakh LTCG, crypto, more than one house, losses to carry forward, NRI status or income above ₹50 lakh.' };
  }
  return { form: 'ITR-1 (Sahaj)', reason: 'Resident with salary/pension, one house, other sources and LTCG (112A) up to ₹1.25 lakh; income up to ₹50 lakh.' };
}

/** Tax on salary, which the employer deducts as TDS every month. */
function salaryTaxShare(res: RegimeResult): number {
  return res.totalIncome > 0 ? res.totalTax * Math.min(1, res.heads.salary / res.totalIncome) : 0;
}

/** TDS entered by the user, or — if none was entered — the employer's salary TDS. */
function effectiveTds(input: TaxInput, res: RegimeResult): number {
  const entered = pos(input.paid.tds);
  if (entered > 0 || !input.paid.assumeSalaryTds) return entered;
  return Math.round(salaryTaxShare(res));
}

function advanceTax(input: TaxInput, res: RegimeResult, rules: YearRules) {
  const paidByInstalment = [input.paid.advanceJun, input.paid.advanceSep, input.paid.advanceDec, input.paid.advanceMar].map(pos);
  const liability = pos(res.totalTax - effectiveTds(input, res) - pos(input.paid.tcs) - pos(input.crypto.tds));
  const seniorNoBusiness = input.resident && input.age !== 'below60' && input.business.type === 'none' && !input.trading.fnoProfit && !input.trading.intradayProfit;
  const applicable = liability >= rules.advanceTax.threshold && !seniorNoBusiness;
  const presumptiveOnly = input.business.type === '44AD' || input.business.type === '44ADA';

  let cumulativePaid = 0;
  let interest234C = 0;
  const instalments: Instalment[] = rules.advanceTax.dueDates.map((due, i) => {
    cumulativePaid += paidByInstalment[i];
    let required = liability * due.cumulative;
    if (presumptiveOnly) required = i === 3 ? liability : 0;
    // No 234C interest if at least 12% by June and 36% by September.
    const safeHarbour = !presumptiveOnly && ((i === 0 && cumulativePaid >= liability * 0.12) || (i === 1 && cumulativePaid >= liability * 0.36));
    const shortfall = applicable && !safeHarbour ? pos(required - cumulativePaid) : 0;
    const months = i < 3 ? 3 : 1;
    const interest = Math.floor(shortfall / 100) * 100 * 0.01 * months;
    interest234C += interest;
    return { date: due.date, requiredCumulative: required, paidCumulative: cumulativePaid, shortfall, interest };
  });

  // 234B: paid less than 90% of assessed tax by 31 March → 1% a month from
  // April until the return is filed (assumed July).
  const totalAdvance = paidByInstalment.reduce((a, b) => a + b, 0);
  const interest234B = applicable && totalAdvance < liability * 0.9 ? Math.floor(pos(liability - totalAdvance) / 100) * 100 * 0.01 * 4 : 0;

  return { applicable, liability, instalments, interest234B, interest234C };
}

function marginalRate(input: TaxInput, regime: Regime, delta = 10000): number {
  const base = computeRegime(input, regime).totalTax;
  const less = computeRegime(withExtraDeduction(input, delta), regime).totalTax;
  return pos(base - less) / delta;
}

function buildSuggestions(input: TaxInput, report: Omit<TaxReport, 'suggestions'>): Suggestion[] {
  const out: Suggestion[] = [];
  const { old, new: nw, better, saving } = report;
  const rules = TAX_RULES[input.fy];

  if (saving > 0) {
    out.push({
      kind: 'save',
      title: `${better === 'new' ? 'New' : 'Old'} regime saves you ${inr(saving)}`,
      detail: `Tax is ${inr(nw.totalTax)} in the new regime and ${inr(old.totalTax)} in the old regime.${
        report.oldBreakEvenExtraDeductions && better === 'new'
          ? ` The old regime would win only with about ${inr(report.oldBreakEvenExtraDeductions)} more in deductions.`
          : ''
      }`,
      saving,
    });
  }

  // Why "₹12 lakh tax-free" still shows tax.
  if (nw.totalIncome <= rules.regimes.new.rebateLimit && nw.totalTax > 0 && input.resident) {
    out.push({
      kind: 'info',
      title: 'Why you pay tax even though income is under ₹12 lakh',
      detail: `The ₹60,000 rebate (87A) only covers tax on salary/slab income. ${nw.special
        .filter((s) => s.tax > 0)
        .map((s) => `${s.label}: ${inr(s.tax)}`)
        .join('; ')} is still payable.`,
    });
  }
  // The ₹12 lakh cliff: gains push total income over the limit and the whole rebate goes.
  const specialIncome = nw.totalIncome - nw.normalIncome;
  if (input.resident && specialIncome > 0 && nw.normalIncome <= rules.regimes.new.rebateLimit && nw.totalIncome > rules.regimes.new.rebateLimit) {
    const withoutGains = computeRegime(
      { ...input, capitalGains: { ...input.capitalGains, stcg111A: 0, ltcg112A: 0, stcgSlab: 0, ltcgOther: 0, propertyGain: 0, propertyGainIndexed: 0 }, crypto: { ...input.crypto, gains: 0 }, other: { ...input.other, lottery: 0 } },
      'new',
    ).totalTax;
    out.push({
      kind: 'warn',
      title: 'Capital gains pushed you over ₹12 lakh — rebate lost',
      detail: `Gains count towards the ₹12 lakh limit. Without them your tax would be ${inr(withoutGains)}; with them it is ${inr(nw.totalTax)}. Spreading sales across two financial years can keep you under the limit.`,
    });
  }

  if (nw.rebateMarginalRelief > 0) {
    out.push({ kind: 'info', title: 'Marginal relief applied', detail: nw.notes.find((n) => n.startsWith('Marginal relief')) || '' });
  }

  // Just above ₹12 lakh: employer NPS can pull income under the limit.
  const above = nw.totalIncome - rules.regimes.new.rebateLimit;
  const npsRoom = pos(rules.regimes.new.employerNpsPctOfSalary * (pos(input.salary.basic) + pos(input.salary.da)) - pos(input.salary.employerNps));
  if (input.resident && above > 0 && npsRoom > 0 && nw.special.length === 0 && input.salary.basic > 0) {
    const shift = Math.min(above, npsRoom);
    const after = computeRegime(
      { ...input, salary: { ...input.salary, employerNps: pos(input.salary.employerNps) + shift, special: pos(input.salary.special) - shift } },
      'new',
    ).totalTax;
    const saved = pos(nw.totalTax - after);
    if (saved > 0) {
      out.push({
        kind: 'save',
        title: shift >= above ? `Get under ₹12 lakh with employer NPS` : `Restructure salary into employer NPS`,
        detail: `Ask HR to move ${inr(shift)} of your salary into NPS (sec 80CCD(2), up to 14% of basic+DA, allowed in the new regime). Your tax would drop from ${inr(nw.totalTax)} to ${inr(after)}.`,
        saving: saved,
      });
    }
  }

  if (better === 'old' || (old.totalTax - nw.totalTax) < 50000) {
    const rate = marginalRate(input, 'old');
    const d = input.deductions;
    const c80 = pos(rules.limits.sec80C - pos(d.sec80C) - pos(input.salary.employeePf));
    if (c80 > 0 && rate > 0) out.push({ kind: 'save', title: `Invest ${inr(c80)} more under 80C`, detail: 'ELSS, PPF, tax-saver FD or term-insurance premium (old regime).', saving: c80 * rate });
    const nps = pos(rules.limits.sec80CCD1B - pos(d.sec80CCD1B));
    if (nps > 0 && rate > 0) out.push({ kind: 'save', title: `Put ${inr(nps)} in your own NPS (80CCD(1B))`, detail: 'Extra ₹50,000 deduction over and above 80C (old regime).', saving: nps * rate });
    if (d.sec80DSelf === 0 && rate > 0) out.push({ kind: 'save', title: 'Buy health insurance (80D)', detail: 'Premium up to ₹25,000 (₹50,000 for seniors) is deductible; another ₹25,000–50,000 for parents.', saving: 25000 * rate });
  }

  const ltcg = input.capitalGains.ltcg112A;
  if (ltcg >= 0 && ltcg < rules.cg.ltcg112AExemption && (ltcg > 0 || input.capitalGains.stcg111A > 0)) {
    out.push({
      kind: 'save',
      title: 'Harvest tax-free equity gains',
      detail: `You can book about ${inr(rules.cg.ltcg112AExemption - ltcg)} more long-term equity gains this year tax-free (sell and buy back) to raise your cost price.`,
    });
  }
  if (input.salary.hra > 0 && input.salary.rentPaid === 0) {
    out.push({ kind: 'info', title: 'HRA without rent', detail: 'HRA is fully taxable if you do not pay rent. Paying rent to parents (with a genuine agreement and their ITR showing it) is a common legal option in the old regime.' });
  }
  if (input.crypto.losses > 0) {
    out.push({ kind: 'warn', title: 'Crypto losses give no tax benefit', detail: `${inr(input.crypto.losses)} of VDA losses cannot reduce any tax, including tax on other crypto gains.` });
  }
  if (input.trading.fnoTurnover > 100000000) {
    out.push({ kind: 'warn', title: 'Tax audit may apply', detail: 'F&O turnover above ₹10 crore needs a tax audit (sec 44AB).' });
  }
  if (report.advanceTax.applicable && (report.advanceTax.interest234B > 0 || report.advanceTax.interest234C > 0)) {
    out.push({
      kind: 'warn',
      title: 'Advance-tax interest likely',
      detail: `Estimated interest: 234B ${inr(report.advanceTax.interest234B)}, 234C ${inr(report.advanceTax.interest234C)}. Pay the next instalment on time to stop it growing.`,
    });
  }
  if (report.netPayable < 0) {
    out.push({ kind: 'info', title: `Refund of ${inr(-report.netPayable)} due`, detail: `File your ITR to claim it. Match every TDS entry with ${report.filing.statement} first — a mismatch is the most common reason refunds get stuck.` });
  }
  if (report.chosen.carriedForward.length > 0) {
    out.push({ kind: 'warn', title: 'File on time to keep your losses', detail: `Losses can only be carried forward if the ITR is filed by the due date (${report.filing.dueDate}).` });
  }
  if (input.business.type !== 'none' || input.trading.fnoProfit || input.trading.intradayProfit) {
    out.push({
      kind: 'info',
      title: 'Choosing the old regime with business income',
      detail: 'With business/F&O income you must opt out of the new regime with Form 10-IEA before the due date, and you can switch back to the new regime only once in your lifetime.',
    });
  }
  if (report.filing.passed) {
    out.push({
      kind: 'warn',
      title: `${rules.label} due date has passed`,
      detail: `You can still file a belated return until ${report.filing.belatedBy}, with a late fee of ₹1,000 (income up to ₹5 lakh) or ₹5,000, plus 1% a month interest (234A) on unpaid tax. Losses cannot be carried forward and the old regime cannot be chosen for business income in a belated return.`,
    });
  }
  if (input.salary.basic > 0 && report.better !== 'new') {
    out.push({
      kind: 'info',
      title: 'Your employer may have deducted TDS under the new regime',
      detail: 'The new regime is the default. You can still pick the old regime while filing your ITR (salaried people can switch every year) — the extra TDS comes back as a refund.',
    });
  }
  return out;
}

export function buildTaxReport(input: TaxInput, preferredRegime?: 'new' | 'old'): TaxReport {
  const rules = TAX_RULES[input.fy];
  const oldRes = computeRegime(input, 'old');
  const newRes = computeRegime(input, 'new');
  const better: 'new' | 'old' = oldRes.totalTax < newRes.totalTax ? 'old' : 'new';
  const chosenRegime = preferredRegime ?? better;
  const chosen = chosenRegime === 'new' ? newRes : oldRes;

  const advance = pos(input.paid.advanceJun) + pos(input.paid.advanceSep) + pos(input.paid.advanceDec) + pos(input.paid.advanceMar);
  const tds = effectiveTds(input, chosen) + pos(input.paid.tcs) + pos(input.crypto.tds);
  const paid = { tds, advance, selfAssessment: pos(input.paid.selfAssessment), total: tds + advance + pos(input.paid.selfAssessment) };
  const adv = advanceTax(input, chosen, rules);
  const netPayable = round10(chosen.totalTax + adv.interest234B + adv.interest234C - paid.total);

  const grossSalary = computeHeads(input, chosenRegime, rules).grossSalary;
  const monthly =
    grossSalary > 0
      ? (() => {
          const salaryTax = salaryTaxShare(chosen);
          const deductionsFromPay = pos(input.salary.employerNps) + pos(input.salary.employeePf) + (pos(input.salary.professionalTax) || 0);
          return {
            grossSalary: grossSalary / 12,
            tds: salaryTax / 12,
            takeHome: pos(grossSalary - deductionsFromPay - salaryTax) / 12,
          };
        })()
      : null;

  const itr = chooseItr(input, chosen);
  const businessForm = /ITR-3|ITR-4/.test(itr.form);
  const filing = {
    dueDate: businessForm ? rules.dueDates.itrBusinessNoAudit : rules.dueDates.itrNonBusiness,
    // ITR-1/2 deadline (31 July) has passed for FY 2025-26; ITR-3/4 (31 August) too.
    passed: rules.dueDates.nonBusinessPassed,
    belatedBy: rules.dueDates.belated,
    statement: rules.statementName,
  };

  const base = {
    yearLabel: rules.label,
    assessmentYear: rules.assessmentYear,
    old: oldRes,
    new: newRes,
    better,
    saving: Math.abs(oldRes.totalTax - newRes.totalTax),
    oldBreakEvenExtraDeductions: better === 'new' ? oldBreakEven(input, newRes.totalTax) : 0,
    chosen,
    chosenRegime,
    paid,
    netPayable,
    advanceTax: adv,
    itr,
    monthly,
    itrDueDate: filing.passed ? filing.belatedBy : filing.dueDate,
    filing,
  };
  return { ...base, suggestions: buildSuggestions(input, base) };
}

export function emptyTaxInput(fy: TaxInput['fy']): TaxInput {
  return {
    fy,
    age: 'below60',
    resident: true,
    salary: { basic: 0, da: 0, hra: 0, special: 0, bonus: 0, otherTaxable: 0, ltaExempt: 0, employerNps: 0, employerPf: 0, govtEmployer: false, employeePf: 0, professionalTax: 0, rentPaid: 0, metro: false, pension: 0 },
    houseProperty: { selfOccupiedInterest: 0, letOutRent: 0, letOutMunicipalTax: 0, letOutInterest: 0 },
    business: { type: 'none', turnover: 0, digitalPct: 100, declaredProfit: 0, regularProfit: 0 },
    trading: { fnoProfit: 0, intradayProfit: 0, fnoTurnover: 0 },
    capitalGains: { stcg111A: 0, ltcg112A: 0, stcgSlab: 0, ltcgOther: 0, propertyGain: 0, propertyGainIndexed: 0, propertyBoughtBefore2024: true },
    crypto: { gains: 0, losses: 0, tds: 0 },
    other: { savingsInterest: 0, fdInterest: 0, dividends: 0, familyPension: 0, lottery: 0, other: 0 },
    deductions: { sec80C: 0, sec80CCD1B: 0, sec80DSelf: 0, sec80DParents: 0, parentsSenior: false, sec80E: 0, sec80G: 0, sec80EEA: 0, disability: 'none', agniveer80CCH: 0, otherVIA: 0 },
    paid: { assumeSalaryTds: true, tds: 0, tcs: 0, advanceJun: 0, advanceSep: 0, advanceDec: 0, advanceMar: 0, selfAssessment: 0 },
  };
}
