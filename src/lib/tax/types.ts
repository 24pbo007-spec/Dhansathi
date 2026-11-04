import type { AgeBand, FinancialYear, Regime } from './rules';

export interface TaxInput {
  fy: FinancialYear;
  age: AgeBand;
  resident: boolean;
  salary: {
    basic: number;
    da: number;
    hra: number;
    special: number;
    bonus: number;
    otherTaxable: number; // other allowances, perquisites, taxable reimbursements
    ltaExempt: number; // LTA exemption claimed (old regime only)
    employerNps: number;
    employerPf: number;
    govtEmployer: boolean;
    employeePf: number;
    professionalTax: number;
    rentPaid: number; // annual rent, used for HRA or 80GG
    metro: boolean;
    pension: number; // pension from a former employer
  };
  houseProperty: {
    selfOccupiedInterest: number;
    letOutRent: number;
    letOutMunicipalTax: number;
    letOutInterest: number;
  };
  business: {
    type: 'none' | '44AD' | '44ADA' | 'regular';
    turnover: number;
    digitalPct: number; // % of receipts received digitally (0–100)
    declaredProfit: number; // profit you declare, if higher than the presumptive rate
    regularProfit: number; // net profit from books (can be negative)
  };
  trading: {
    fnoProfit: number; // non-speculative business income (can be negative)
    intradayProfit: number; // speculative (can be negative)
    fnoTurnover: number;
  };
  capitalGains: {
    stcg111A: number; // listed equity / equity MF, STT paid (can be negative)
    ltcg112A: number; // listed equity / equity MF held > 12 months (can be negative)
    stcgSlab: number; // debt MF, other short-term (taxed at slab)
    ltcgOther: number; // gold, unlisted shares, etc. at 12.5%
    propertyGain: number; // land/building LTCG without indexation
    propertyGainIndexed: number; // same sale, with indexation (if bought before 23 Jul 2024)
    propertyBoughtBefore2024: boolean;
  };
  crypto: {
    gains: number; // total gains from profitable VDA transfers
    losses: number; // losses — cannot be set off
    tds: number; // 1% TDS (194S)
  };
  other: {
    savingsInterest: number;
    fdInterest: number;
    dividends: number;
    familyPension: number;
    lottery: number; // lottery, games, online gaming winnings
    other: number;
  };
  deductions: {
    sec80C: number; // ELSS, PPF, LIC, tuition, home-loan principal (excluding employee PF)
    sec80CCD1B: number;
    sec80DSelf: number;
    sec80DParents: number;
    parentsSenior: boolean;
    sec80E: number;
    sec80G: number; // eligible donation deduction
    sec80EEA: number;
    disability: 'none' | 'disabled' | 'severe';
    agniveer80CCH: number;
    otherVIA: number;
  };
  paid: {
    assumeSalaryTds: boolean; // employer deducts TDS on salary (used when TDS is not entered)
    tds: number;
    tcs: number;
    advanceJun: number;
    advanceSep: number;
    advanceDec: number;
    advanceMar: number;
    selfAssessment: number;
  };
}

export interface Line {
  label: string;
  amount: number;
  note?: string;
}

export interface SpecialTaxLine {
  label: string;
  income: number;
  taxable: number;
  rate: number;
  tax: number;
}

export interface RegimeResult {
  regime: Regime;
  heads: {
    salary: number;
    houseProperty: number;
    business: number;
    capitalGains: number;
    otherSources: number;
  };
  exemptions: Line[];
  grossTotalIncome: number;
  deductions: Line[];
  totalDeductions: number;
  normalIncome: number;
  totalIncome: number;
  slabBreakdown: { from: number; to: number; rate: number; amount: number; tax: number }[];
  taxOnNormal: number;
  special: SpecialTaxLine[];
  taxOnSpecial: number;
  basicExemptionUsedOnGains: number;
  rebate: number;
  rebateMarginalRelief: number;
  surchargeRate: number;
  surcharge: number;
  surchargeMarginalRelief: number;
  cess: number;
  totalTax: number;
  effectiveRate: number;
  carriedForward: Line[];
  notes: string[];
}

export interface Instalment {
  date: string;
  requiredCumulative: number;
  paidCumulative: number;
  shortfall: number;
  interest: number;
}

export interface Suggestion {
  kind: 'save' | 'info' | 'warn';
  title: string;
  detail: string;
  saving?: number;
}

export interface TaxReport {
  yearLabel: string;
  assessmentYear: string;
  old: RegimeResult;
  new: RegimeResult;
  better: Regime;
  saving: number;
  oldBreakEvenExtraDeductions: number | null;
  chosen: RegimeResult;
  chosenRegime: Regime;
  paid: { tds: number; advance: number; selfAssessment: number; total: number };
  netPayable: number; // negative = refund
  advanceTax: { applicable: boolean; liability: number; instalments: Instalment[]; interest234B: number; interest234C: number };
  itr: { form: string; reason: string };
  monthly: { grossSalary: number; tds: number; takeHome: number } | null;
  suggestions: Suggestion[];
  itrDueDate: string;
  filing: { dueDate: string; passed: boolean; belatedBy: string; statement: string };
}
