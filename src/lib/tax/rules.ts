// Income-tax rules by financial year. Every number the calculator uses lives
// here, with its legal basis, so a Budget change is a one-file edit.

export type FinancialYear = '2025-26' | '2026-27';
export type Regime = 'new' | 'old';
export type AgeBand = 'below60' | '60to79' | '80plus';

export interface Slab {
  upTo: number; // upper limit of the slab (Infinity for the last)
  rate: number; // fraction, e.g. 0.05
}

export interface RegimeRules {
  slabs: Record<AgeBand, Slab[]>;
  standardDeduction: number; // salary / pension
  familyPensionCap: number; // 1/3rd of family pension, capped
  rebateLimit: number; // 87A: total income must not exceed this
  rebateMax: number; // 87A: maximum rebate
  rebateMarginalRelief: boolean; // tax capped at income above the rebate limit
  rebateOnSpecialIncome: boolean; // can 87A reduce tax on 111A/112/112A income?
  maxSurchargeRate: number;
  employerNpsPctOfSalary: number; // 80CCD(2) cap as fraction of basic + DA (private employer)
  employerNpsPctGovt: number; // 80CCD(2) cap for Central/State government employers
}

export interface YearRules {
  label: string;
  assessmentYear: string;
  regimes: Record<Regime, RegimeRules>;
  surcharge: { above: number; rate: number }[];
  specialSurchargeCap: number; // surcharge cap on 111A/112/112A gains and dividends
  cess: number;
  cg: {
    stcg111A: number;
    ltcg112A: number;
    ltcg112AExemption: number;
    ltcgOther: number;
    ltcgPropertyIndexed: number; // option for land/building bought before 23 Jul 2024
  };
  vdaRate: number; // crypto / VDA, 115BBH
  lotteryRate: number; // 115BB
  limits: {
    sec80C: number;
    sec80CCD1B: number;
    sec80DSelf: number;
    sec80DSelfSenior: number;
    sec80DParents: number;
    sec80DParentsSenior: number;
    sec80DPreventive: number;
    sec80TTA: number;
    sec80TTB: number;
    sec24bSelfOccupied: number;
    housePropertyLossSetOff: number;
    sec80U: number;
    sec80USevere: number;
    professionalTax: number;
    sec80GGMonthly: number;
  };
  presumptive: {
    ad: { digitalRate: number; cashRate: number; limit: number; limitIfMostlyDigital: number };
    ada: { rate: number; limit: number; limitIfMostlyDigital: number };
  };
  advanceTax: { dueDates: { date: string; cumulative: number }[]; threshold: number };
  employerRetirementCap: number; // employer PF + NPS + superannuation above this is taxable
  hraMetros: string[];
  dueDates: {
    itrNonBusiness: string; // ITR-1 / ITR-2
    itrBusinessNoAudit: string; // ITR-3 / ITR-4 without audit
    belated: string; // last date for a belated / revised return
    nonBusinessPassed: boolean; // is the normal due date already over (as of today)?
  };
  statementName: string; // where TDS shows up
}

const NEW_SLABS: Slab[] = [
  { upTo: 400000, rate: 0 },
  { upTo: 800000, rate: 0.05 },
  { upTo: 1200000, rate: 0.1 },
  { upTo: 1600000, rate: 0.15 },
  { upTo: 2000000, rate: 0.2 },
  { upTo: 2400000, rate: 0.25 },
  { upTo: Infinity, rate: 0.3 },
];

const OLD_SLABS: Record<AgeBand, Slab[]> = {
  below60: [
    { upTo: 250000, rate: 0 },
    { upTo: 500000, rate: 0.05 },
    { upTo: 1000000, rate: 0.2 },
    { upTo: Infinity, rate: 0.3 },
  ],
  '60to79': [
    { upTo: 300000, rate: 0 },
    { upTo: 500000, rate: 0.05 },
    { upTo: 1000000, rate: 0.2 },
    { upTo: Infinity, rate: 0.3 },
  ],
  '80plus': [
    { upTo: 500000, rate: 0 },
    { upTo: 1000000, rate: 0.2 },
    { upTo: Infinity, rate: 0.3 },
  ],
};

// Finance Act 2025 rules (FY 2025-26). The Income-tax Act, 2025 that applies
// from 1 April 2026 carried the same rates into tax year 2026-27.
const FY2526: YearRules = {
  label: 'FY 2025-26',
  assessmentYear: 'AY 2026-27',
  regimes: {
    new: {
      slabs: { below60: NEW_SLABS, '60to79': NEW_SLABS, '80plus': NEW_SLABS },
      standardDeduction: 75000,
      familyPensionCap: 25000,
      rebateLimit: 1200000,
      rebateMax: 60000,
      rebateMarginalRelief: true,
      rebateOnSpecialIncome: false,
      maxSurchargeRate: 0.25,
      employerNpsPctOfSalary: 0.14,
      employerNpsPctGovt: 0.14,
    },
    old: {
      slabs: OLD_SLABS,
      standardDeduction: 50000,
      familyPensionCap: 15000,
      rebateLimit: 500000,
      rebateMax: 12500,
      rebateMarginalRelief: false,
      rebateOnSpecialIncome: true,
      maxSurchargeRate: 0.37,
      employerNpsPctOfSalary: 0.1,
      employerNpsPctGovt: 0.14,
    },
  },
  surcharge: [
    { above: 50000000, rate: 0.37 },
    { above: 20000000, rate: 0.25 },
    { above: 10000000, rate: 0.15 },
    { above: 5000000, rate: 0.1 },
  ],
  specialSurchargeCap: 0.15,
  cess: 0.04,
  cg: {
    stcg111A: 0.2,
    ltcg112A: 0.125,
    ltcg112AExemption: 125000,
    ltcgOther: 0.125,
    ltcgPropertyIndexed: 0.2,
  },
  vdaRate: 0.3,
  lotteryRate: 0.3,
  limits: {
    sec80C: 150000,
    sec80CCD1B: 50000,
    sec80DSelf: 25000,
    sec80DSelfSenior: 50000,
    sec80DParents: 25000,
    sec80DParentsSenior: 50000,
    sec80DPreventive: 5000,
    sec80TTA: 10000,
    sec80TTB: 50000,
    sec24bSelfOccupied: 200000,
    housePropertyLossSetOff: 200000,
    sec80U: 75000,
    sec80USevere: 125000,
    professionalTax: 2500,
    sec80GGMonthly: 5000,
  },
  presumptive: {
    ad: { digitalRate: 0.06, cashRate: 0.08, limit: 20000000, limitIfMostlyDigital: 30000000 },
    ada: { rate: 0.5, limit: 5000000, limitIfMostlyDigital: 7500000 },
  },
  advanceTax: {
    dueDates: [
      { date: '15 June', cumulative: 0.15 },
      { date: '15 September', cumulative: 0.45 },
      { date: '15 December', cumulative: 0.75 },
      { date: '15 March', cumulative: 1 },
    ],
    threshold: 10000,
  },
  employerRetirementCap: 750000,
  hraMetros: ['Delhi', 'Mumbai', 'Kolkata', 'Chennai'],
  dueDates: {
    itrNonBusiness: '31 July 2026',
    itrBusinessNoAudit: '31 August 2026',
    belated: '31 December 2026',
    nonBusinessPassed: true,
  },
  statementName: 'Form 26AS / AIS',
};

// Budget 2026 left slabs, rebate, surcharge and capital-gains rates unchanged.
// The Income-tax Rules 2026 widen the 50% HRA list to eight cities.
const FY2627: YearRules = {
  ...FY2526,
  label: 'FY 2026-27',
  assessmentYear: 'Tax year 2026-27',
  hraMetros: ['Delhi', 'Mumbai', 'Kolkata', 'Chennai', 'Bengaluru', 'Hyderabad', 'Pune', 'Ahmedabad'],
  dueDates: {
    itrNonBusiness: '31 July 2027',
    itrBusinessNoAudit: '31 August 2027',
    belated: '31 December 2027',
    nonBusinessPassed: false,
  },
  statementName: 'Form 168 (annual tax statement) / AIS',
};

export const TAX_RULES: Record<FinancialYear, YearRules> = {
  '2025-26': FY2526,
  '2026-27': FY2627,
};

export const DEFAULT_YEAR: FinancialYear = '2026-27';
