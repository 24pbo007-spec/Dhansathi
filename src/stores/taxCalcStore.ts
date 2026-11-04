import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { emptyTaxInput } from '@/lib/tax/engine';
import { DEFAULT_YEAR, type FinancialYear } from '@/lib/tax/rules';
import type { TaxInput } from '@/lib/tax/types';

export type TaxMode = 'quick' | 'pro';
export type RegimeChoice = 'auto' | 'new' | 'old';

/** The few numbers most salaried people know off-hand. */
export interface QuickInput {
  grossSalary: number;
  otherIncome: number; // interest, rent, freelance (slab income)
  stcgEquity: number;
  ltcgEquity: number;
  sec80C: number;
  sec80D: number;
  homeLoanInterest: number;
  employerNps: number;
}

const EMPTY_QUICK: QuickInput = {
  grossSalary: 0,
  otherIncome: 0,
  stcgEquity: 0,
  ltcgEquity: 0,
  sec80C: 0,
  sec80D: 0,
  homeLoanInterest: 0,
  employerNps: 0,
};

/** Quick mode → full engine input. Basic pay is taken as 50% of gross, the usual CTC split. */
export function quickToInput(q: QuickInput, base: TaxInput): TaxInput {
  const input = emptyTaxInput(base.fy);
  input.age = base.age;
  input.resident = base.resident;
  const gross = Math.max(0, q.grossSalary - q.employerNps);
  input.salary.basic = gross * 0.5;
  input.salary.special = gross - input.salary.basic;
  input.salary.employerNps = q.employerNps;
  input.other.other = q.otherIncome;
  input.capitalGains.stcg111A = q.stcgEquity;
  input.capitalGains.ltcg112A = q.ltcgEquity;
  input.deductions.sec80C = q.sec80C;
  input.deductions.sec80DSelf = q.sec80D;
  input.houseProperty.selfOccupiedInterest = q.homeLoanInterest;
  return input;
}

interface TaxCalcState {
  mode: TaxMode;
  regimeChoice: RegimeChoice;
  quick: QuickInput;
  input: TaxInput;
  setMode: (mode: TaxMode) => void;
  setRegimeChoice: (choice: RegimeChoice) => void;
  setQuick: (patch: Partial<QuickInput>) => void;
  setInput: <K extends keyof TaxInput>(section: K, patch: TaxInput[K] extends object ? Partial<TaxInput[K]> : TaxInput[K]) => void;
  setYear: (fy: FinancialYear) => void;
  continueInPro: () => void;
  reset: () => void;
}

export const useTaxCalcStore = create<TaxCalcState>()(
  persist(
    (set, get) => ({
      mode: 'quick',
      regimeChoice: 'auto',
      quick: EMPTY_QUICK,
      input: emptyTaxInput(DEFAULT_YEAR),
      setMode: (mode) => set({ mode }),
      setRegimeChoice: (regimeChoice) => set({ regimeChoice }),
      setQuick: (patch) => set((s) => ({ quick: { ...s.quick, ...patch } })),
      setInput: (section, patch) =>
        set((s) => {
          const current = s.input[section];
          const next = typeof current === 'object' && current !== null ? { ...current, ...(patch as object) } : patch;
          return { input: { ...s.input, [section]: next } };
        }),
      setYear: (fy) => set((s) => ({ input: { ...s.input, fy } })),
      continueInPro: () => {
        const { quick, input } = get();
        set({ input: quickToInput(quick, input), mode: 'pro' });
      },
      reset: () => set({ quick: EMPTY_QUICK, input: emptyTaxInput(get().input.fy), regimeChoice: 'auto' }),
    }),
    { name: 'dhansathi-tax-calculator', version: 1 },
  ),
);
