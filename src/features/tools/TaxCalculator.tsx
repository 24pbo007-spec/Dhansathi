import { useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { buildTaxReport } from '@/lib/tax/engine';
import { TAX_RULES } from '@/lib/tax/rules';
import { quickToInput, useTaxCalcStore } from '@/stores/taxCalcStore';
import { ProfileBar, ProPanel, QuickPanel } from './tax/InputPanels';
import { AiExplain, Breakdown, FilingPanel, Suggestions, TaxHero } from './tax/ResultPanels';
import { Segmented } from './tax/ui';

const FEATURES = [
  { icon: 'compare_arrows', label: 'Old vs new regime' },
  { icon: 'functions', label: '87A, marginal relief, surcharge' },
  { icon: 'candlestick_chart', label: 'Capital gains, F&O, crypto' },
  { icon: 'storefront', label: '44AD / 44ADA business' },
  { icon: 'event_upcoming', label: 'Advance tax & interest' },
  { icon: 'description', label: 'ITR form finder' },
];

export default function TaxCalculator() {
  const mode = useTaxCalcStore((s) => s.mode);
  const setMode = useTaxCalcStore((s) => s.setMode);
  const quick = useTaxCalcStore((s) => s.quick);
  const input = useTaxCalcStore((s) => s.input);
  const regimeChoice = useTaxCalcStore((s) => s.regimeChoice);
  const reset = useTaxCalcStore((s) => s.reset);

  const effectiveInput = useMemo(() => (mode === 'quick' ? quickToInput(quick, input) : input), [mode, quick, input]);
  const report = useMemo(
    () => buildTaxReport(effectiveInput, regimeChoice === 'auto' ? undefined : regimeChoice),
    [effectiveInput, regimeChoice],
  );
  const rules = TAX_RULES[input.fy];

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-16">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <motion.div
              className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-tertiary shadow-lg shadow-primary/30"
              animate={{ rotate: [0, -6, 6, 0] }}
              transition={{ duration: 4, repeat: Infinity, repeatDelay: 3 }}
            >
              <span className="material-symbols-outlined text-2xl text-on-primary">calculate</span>
            </motion.div>
            <div>
              <h1 className="font-headline text-2xl font-extrabold text-on-surface md:text-3xl">Income Tax Calculator</h1>
              <p className="text-sm text-on-surface-variant">
                {rules.label} rules · salary, business, capital gains, F&amp;O, crypto — every regime, every rupee explained
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {FEATURES.map((f, i) => (
              <motion.span
                key={f.label}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * i }}
                className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant/30 bg-surface-container-lowest px-3 py-1 text-[11px] font-semibold text-on-surface-variant"
              >
                <span className="material-symbols-outlined text-[14px] text-primary">{f.icon}</span>
                {f.label}
              </motion.span>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Segmented
            layoutId="tax-mode"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'quick', label: <span className="inline-flex items-center gap-1"><span className="material-symbols-outlined text-[16px]">bolt</span>Quick</span> },
              { value: 'pro', label: <span className="inline-flex items-center gap-1"><span className="material-symbols-outlined text-[16px]">workspace_premium</span>Pro</span> },
            ]}
          />
          <button type="button" onClick={reset} className="rounded-xl px-3 py-2 text-xs font-bold text-error hover:bg-error-container/40">
            Reset
          </button>
        </div>
      </motion.div>

      <ProfileBar />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Inputs */}
        <div className="space-y-6 xl:col-span-7">
          <AnimatePresence mode="wait">
            <motion.div key={mode} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25 }}>
              {mode === 'quick' ? <QuickPanel /> : <ProPanel />}
            </motion.div>
          </AnimatePresence>
          <Breakdown result={report.chosen} />
        </div>

        {/* Results — shown first on narrower screens so the answer is always visible */}
        <div className="order-first space-y-6 xl:order-none xl:col-span-5">
          <div className="space-y-6 xl:sticky xl:top-4">
            <TaxHero report={report} />
            <Suggestions report={report} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <FilingPanel report={report} />
        <AiExplain report={report} />
      </div>

      <p className="text-center text-[11px] text-on-surface-variant">
        Estimates based on {rules.label} income-tax rules for individuals. Verify with Form 16 and {rules.statementName} before filing. Not tax advice.
      </p>
    </div>
  );
}
