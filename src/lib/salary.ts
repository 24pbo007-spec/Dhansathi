// Salary / CTC breakdown for India. Turns an annual CTC into a full pay
// structure and the monthly in-hand under both tax regimes, reusing the
// income-tax engine. Also gives the HR/employer-cost view.

import { buildTaxReport, emptyTaxInput } from './tax/engine';
import type { FinancialYear, Regime, AgeBand } from './tax/rules';
import type { TaxReport } from './tax/types';

export interface SalaryStructureInput {
  ctcAnnual: number;
  fy: FinancialYear;
  age: AgeBand;
  basicPctOfCtc: number; // e.g. 0.5
  hraPctOfBasic: number; // e.g. 0.5 metro, 0.4 non-metro
  metro: boolean;
  rentPaidMonthly: number; // for HRA exemption (old regime)
  bonusAnnual: number; // performance bonus inside CTC
  employerNpsPctOfBasic: number; // 0 if none
  employeePf: boolean; // employee contributes 12% of basic
  pfOnCappedWage: boolean; // 12% of ₹15,000 instead of actual basic
  professionalTaxAnnual: number;
}

export interface Component {
  label: string;
  monthly: number;
  annual: number;
  note?: string;
}

export interface RegimeTakeHome {
  regime: Regime;
  incomeTaxAnnual: number;
  monthlyInHand: number;
  annualInHand: number;
  monthlyTds: number;
}

export interface SalaryResult {
  ctcAnnual: number;
  earnings: Component[]; // what shows on the payslip (gross)
  grossAnnual: number;
  grossMonthly: number;
  employerContributions: Component[]; // part of CTC, not in-hand
  deductions: Component[]; // from gross (excluding income tax)
  deductionsExTaxAnnual: number;
  new: RegimeTakeHome;
  old: RegimeTakeHome;
  better: Regime;
  report: TaxReport; // full tax detail for the better regime view
  basic: number;
}

const PF_WAGE_CEILING = 15000 * 12; // ₹15,000/month statutory ceiling

function takeHome(report: TaxReport, regime: Regime, grossAnnual: number, deductionsExTax: number): RegimeTakeHome {
  const r = regime === 'new' ? report.new : report.old;
  const incomeTax = r.totalTax;
  const annualInHand = Math.max(0, grossAnnual - deductionsExTax - incomeTax);
  return {
    regime,
    incomeTaxAnnual: incomeTax,
    annualInHand,
    monthlyInHand: annualInHand / 12,
    monthlyTds: incomeTax / 12,
  };
}

export function computeSalary(input: SalaryStructureInput): SalaryResult {
  const ctc = Math.max(0, input.ctcAnnual || 0);
  const basic = ctc * input.basicPctOfCtc;
  const hra = basic * input.hraPctOfBasic;
  const employerPfAnnual = (input.pfOnCappedWage ? Math.min(basic, PF_WAGE_CEILING) : basic) * 0.12;
  const gratuityAnnual = basic * 0.0481; // 15/26 of a month's basic per year ≈ 4.81%
  const employerNpsAnnual = basic * input.employerNpsPctOfBasic;
  const bonus = Math.max(0, Math.min(input.bonusAnnual || 0, ctc * 0.3));

  // Gross = CTC minus the employer-only costs.
  const grossAnnual = Math.max(0, ctc - employerPfAnnual - gratuityAnnual - employerNpsAnnual);
  // Special allowance balances the structure.
  const special = Math.max(0, grossAnnual - basic - hra - bonus);

  const earnings: Component[] = [
    { label: 'Basic salary', monthly: basic / 12, annual: basic },
    { label: 'HRA', monthly: hra / 12, annual: hra, note: `${Math.round(input.hraPctOfBasic * 100)}% of basic` },
    { label: 'Special allowance', monthly: special / 12, annual: special, note: 'Balancing component' },
  ];
  if (bonus > 0) earnings.push({ label: 'Bonus', monthly: bonus / 12, annual: bonus });

  const employerContributions: Component[] = [
    { label: 'Employer PF', monthly: employerPfAnnual / 12, annual: employerPfAnnual, note: '12% of basic' },
    { label: 'Gratuity', monthly: gratuityAnnual / 12, annual: gratuityAnnual, note: '4.81% of basic' },
  ];
  if (employerNpsAnnual > 0) {
    employerContributions.push({ label: 'Employer NPS', monthly: employerNpsAnnual / 12, annual: employerNpsAnnual });
  }

  const employeePfAnnual = input.employeePf ? (input.pfOnCappedWage ? Math.min(basic, PF_WAGE_CEILING) : basic) * 0.12 : 0;
  const ptAnnual = Math.max(0, input.professionalTaxAnnual || 0);
  const deductions: Component[] = [];
  if (employeePfAnnual > 0) deductions.push({ label: 'Your PF (EPF)', monthly: employeePfAnnual / 12, annual: employeePfAnnual, note: '12% of basic' });
  if (ptAnnual > 0) deductions.push({ label: 'Professional tax', monthly: ptAnnual / 12, annual: ptAnnual });
  const deductionsExTaxAnnual = employeePfAnnual + ptAnnual;

  // Income tax via the engine.
  const taxInput = emptyTaxInput(input.fy);
  taxInput.age = input.age;
  taxInput.salary.basic = basic;
  taxInput.salary.hra = hra;
  taxInput.salary.special = special;
  taxInput.salary.bonus = bonus;
  taxInput.salary.employerNps = employerNpsAnnual;
  taxInput.salary.employeePf = employeePfAnnual;
  taxInput.salary.professionalTax = ptAnnual;
  taxInput.salary.rentPaid = Math.max(0, input.rentPaidMonthly || 0) * 12;
  taxInput.salary.metro = input.metro;
  taxInput.paid.assumeSalaryTds = true;

  const report = buildTaxReport(taxInput);
  const newTH = takeHome(report, 'new', grossAnnual, deductionsExTaxAnnual);
  const oldTH = takeHome(report, 'old', grossAnnual, deductionsExTaxAnnual);
  const better: Regime = oldTH.annualInHand >= newTH.annualInHand ? 'old' : 'new';

  return {
    ctcAnnual: ctc,
    earnings,
    grossAnnual,
    grossMonthly: grossAnnual / 12,
    employerContributions,
    deductions,
    deductionsExTaxAnnual,
    new: newTH,
    old: oldTH,
    better,
    report,
    basic,
  };
}

export const DEFAULT_SALARY_INPUT: SalaryStructureInput = {
  ctcAnnual: 1200000,
  fy: '2026-27',
  age: 'below60',
  basicPctOfCtc: 0.5,
  hraPctOfBasic: 0.5,
  metro: true,
  rentPaidMonthly: 0,
  bonusAnnual: 0,
  employerNpsPctOfBasic: 0,
  employeePf: true,
  pfOnCappedWage: false,
  professionalTaxAnnual: 2400,
};
