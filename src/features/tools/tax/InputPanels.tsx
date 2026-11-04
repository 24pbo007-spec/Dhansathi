import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useTaxCalcStore } from '@/stores/taxCalcStore';
import { TAX_RULES } from '@/lib/tax/rules';
import { Card, Grid, MoneyInput, Segmented, Toggle } from './ui';

export function ProfileBar() {
  const input = useTaxCalcStore((s) => s.input);
  const setInput = useTaxCalcStore((s) => s.setInput);
  const setYear = useTaxCalcStore((s) => s.setYear);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Segmented
        layoutId="fy"
        size="sm"
        value={input.fy}
        onChange={setYear}
        options={[
          { value: '2025-26', label: 'FY 2025-26' },
          { value: '2026-27', label: 'FY 2026-27' },
        ]}
      />
      <Segmented
        layoutId="age"
        size="sm"
        value={input.age}
        onChange={(age) => setInput('age', age)}
        options={[
          { value: 'below60', label: 'Below 60' },
          { value: '60to79', label: '60–79' },
          { value: '80plus', label: '80+' },
        ]}
      />
      <Segmented
        layoutId="residency"
        size="sm"
        value={input.resident ? 'resident' : 'nri'}
        onChange={(v) => setInput('resident', v === 'resident')}
        options={[
          { value: 'resident', label: 'Resident' },
          { value: 'nri', label: 'NRI' },
        ]}
      />
    </div>
  );
}

export function QuickPanel() {
  const quick = useTaxCalcStore((s) => s.quick);
  const setQuick = useTaxCalcStore((s) => s.setQuick);
  const continueInPro = useTaxCalcStore((s) => s.continueInPro);
  return (
    <Card title="Quick calculator" icon="bolt" subtitle="The 8 numbers most people know. Results update as you type.">
      <Grid>
        <MoneyInput label="Annual gross salary (CTC)" value={quick.grossSalary} onChange={(v) => setQuick({ grossSalary: v })} hint="Before PF and tax. Basic pay is assumed to be 50% of this." />
        <MoneyInput label="Other income" value={quick.otherIncome} onChange={(v) => setQuick({ otherIncome: v })} hint="FD/savings interest, rent received, freelance — all taxed at slab rates." />
        <MoneyInput label="Short-term equity gains" value={quick.stcgEquity} onChange={(v) => setQuick({ stcgEquity: v })} allowNegative hint="Shares/equity MF held ≤ 12 months (20%)." />
        <MoneyInput label="Long-term equity gains" value={quick.ltcgEquity} onChange={(v) => setQuick({ ltcgEquity: v })} allowNegative hint="Held > 12 months. First ₹1.25 lakh is tax-free (12.5% above)." />
        <MoneyInput label="80C investments" value={quick.sec80C} onChange={(v) => setQuick({ sec80C: v })} hint="PF, PPF, ELSS, LIC, tuition fees — old regime, max ₹1.5 lakh." />
        <MoneyInput label="Health insurance (80D)" value={quick.sec80D} onChange={(v) => setQuick({ sec80D: v })} hint="Self & family premium — old regime." />
        <MoneyInput label="Home-loan interest" value={quick.homeLoanInterest} onChange={(v) => setQuick({ homeLoanInterest: v })} hint="Self-occupied house — old regime, max ₹2 lakh." />
        <MoneyInput label="Employer NPS contribution" value={quick.employerNps} onChange={(v) => setQuick({ employerNps: v })} hint="Deductible in BOTH regimes (up to 14% of basic in new)." />
      </Grid>
      <button
        type="button"
        onClick={continueInPro}
        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-surface-container-high px-4 py-2.5 text-sm font-bold text-primary hover:bg-primary-fixed"
      >
        <span className="material-symbols-outlined text-[18px]">tune</span>
        Need HRA, business, F&amp;O, crypto or property? Continue in Pro with these numbers
      </button>
    </Card>
  );
}

const STEPS = [
  { key: 'salary', label: 'Salary', icon: 'badge' },
  { key: 'house', label: 'House', icon: 'home' },
  { key: 'business', label: 'Business', icon: 'storefront' },
  { key: 'investments', label: 'Gains & F&O', icon: 'candlestick_chart' },
  { key: 'crypto', label: 'Crypto', icon: 'currency_bitcoin' },
  { key: 'other', label: 'Other income', icon: 'savings' },
  { key: 'deductions', label: 'Deductions', icon: 'receipt_long' },
  { key: 'paid', label: 'Taxes paid', icon: 'task_alt' },
] as const;
type StepKey = (typeof STEPS)[number]['key'];

export function ProPanel() {
  const [step, setStep] = useState<StepKey>('salary');
  const index = STEPS.findIndex((s) => s.key === step);
  const input = useTaxCalcStore((s) => s.input);
  const setInput = useTaxCalcStore((s) => s.setInput);
  const { salary: sal, houseProperty: hp, business: biz, trading, capitalGains: cg, crypto, other, deductions: ded, paid } = input;

  return (
    <div className="space-y-4">
      {/* Stepper */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {STEPS.map((s, i) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setStep(s.key)}
            className={cn(
              'relative flex shrink-0 items-center gap-2 rounded-2xl px-3.5 py-2.5 text-xs font-bold transition-colors',
              step === s.key ? 'text-on-primary' : i < index ? 'bg-primary-fixed text-primary' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container',
            )}
          >
            {step === s.key && <motion.span layoutId="tax-step" className="absolute inset-0 rounded-2xl bg-gradient-to-r from-primary to-primary-container shadow-lg shadow-primary/25" />}
            <span className="material-symbols-outlined relative z-10 text-[16px]">{i < index ? 'check_circle' : s.icon}</span>
            <span className="relative z-10">{s.label}</span>
          </button>
        ))}
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-surface-container-high">
        <motion.div className="h-full rounded-full bg-gradient-to-r from-primary to-tertiary" animate={{ width: `${((index + 1) / STEPS.length) * 100}%` }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} />
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.25 }}>
          {step === 'salary' && (
            <Card title="Salary & pension" icon="badge" subtitle="Annual amounts from your salary slip / Form 16 Part B.">
              <Grid>
                <MoneyInput label="Basic salary" value={sal.basic} onChange={(v) => setInput('salary', { basic: v })} />
                <MoneyInput label="Dearness allowance (DA)" value={sal.da} onChange={(v) => setInput('salary', { da: v })} />
                <MoneyInput label="HRA received" value={sal.hra} onChange={(v) => setInput('salary', { hra: v })} />
                <MoneyInput label="Special allowance" value={sal.special} onChange={(v) => setInput('salary', { special: v })} />
                <MoneyInput label="Bonus / incentives" value={sal.bonus} onChange={(v) => setInput('salary', { bonus: v })} />
                <MoneyInput label="Other taxable pay & perquisites" value={sal.otherTaxable} onChange={(v) => setInput('salary', { otherTaxable: v })} hint="ESOP perquisite, car, other allowances." />
                <MoneyInput label="Employer NPS contribution" value={sal.employerNps} onChange={(v) => setInput('salary', { employerNps: v })} hint="Added to salary, then deducted (80CCD(2)) — works in both regimes." />
                <MoneyInput label="Employer PF contribution" value={sal.employerPf} onChange={(v) => setInput('salary', { employerPf: v })} hint="Employer PF + NPS above ₹7.5 lakh a year becomes taxable." />
                <MoneyInput label="Your PF contribution" value={sal.employeePf} onChange={(v) => setInput('salary', { employeePf: v })} hint="Counts towards 80C (old regime)." />
                <MoneyInput label="Rent you pay (yearly)" value={sal.rentPaid} onChange={(v) => setInput('salary', { rentPaid: v })} hint="For HRA exemption, or 80GG if you get no HRA (old regime)." />
                <MoneyInput label="LTA exemption claimed" value={sal.ltaExempt} onChange={(v) => setInput('salary', { ltaExempt: v })} hint="Only the exempt travel amount (old regime)." />
                <MoneyInput label="Professional tax" value={sal.professionalTax} onChange={(v) => setInput('salary', { professionalTax: v })} max={2500} />
                <MoneyInput label="Pension (from ex-employer)" value={sal.pension} onChange={(v) => setInput('salary', { pension: v })} hint="Gets the standard deduction too." />
              </Grid>
              <div className="mt-3 space-y-1 rounded-2xl bg-surface-container-low px-4 py-1">
                <Toggle
                  checked={sal.metro}
                  onChange={(v) => setInput('salary', { metro: v })}
                  label={`I live in ${TAX_RULES[input.fy].hraMetros.join(', ')}`}
                  hint={`These cities get 50% of basic+DA as the HRA limit, others 40% (${TAX_RULES[input.fy].label}).`}
                />
                <Toggle
                  checked={sal.govtEmployer}
                  onChange={(v) => setInput('salary', { govtEmployer: v })}
                  label="Central / State government employee"
                  hint="Employer NPS is deductible up to 14% of basic+DA in both regimes; private employees get 14% (new) / 10% (old)."
                />
              </div>
            </Card>
          )}

          {step === 'house' && (
            <Card title="House property" icon="home" subtitle="Your own home and any house you rent out.">
              <Grid>
                <MoneyInput label="Home-loan interest (self-occupied)" value={hp.selfOccupiedInterest} onChange={(v) => setInput('houseProperty', { selfOccupiedInterest: v })} hint="Up to ₹2 lakh in the old regime; nothing in the new regime." />
                <div />
                <MoneyInput label="Rent received (let-out)" value={hp.letOutRent} onChange={(v) => setInput('houseProperty', { letOutRent: v })} />
                <MoneyInput label="Municipal tax paid" value={hp.letOutMunicipalTax} onChange={(v) => setInput('houseProperty', { letOutMunicipalTax: v })} />
                <MoneyInput label="Home-loan interest (let-out)" value={hp.letOutInterest} onChange={(v) => setInput('houseProperty', { letOutInterest: v })} hint="Fully deductible from rent; a 30% standard deduction applies automatically." />
              </Grid>
            </Card>
          )}

          {step === 'business' && (
            <Card title="Business & profession" icon="storefront" subtitle="Shops, traders, freelancers, doctors, CAs, consultants, YouTubers.">
              <Segmented
                layoutId="biz-type"
                size="sm"
                value={biz.type}
                onChange={(type) => setInput('business', { type })}
                options={[
                  { value: 'none', label: 'None' },
                  { value: '44AD', label: 'Business (44AD)' },
                  { value: '44ADA', label: 'Profession (44ADA)' },
                  { value: 'regular', label: 'Books of accounts' },
                ]}
              />
              <div className="mt-4">
                {biz.type === '44AD' && (
                  <Grid>
                    <MoneyInput label="Turnover" value={biz.turnover} onChange={(v) => setInput('business', { turnover: v })} hint="Up to ₹3 crore if 95%+ is received digitally, else ₹2 crore." />
                    <MoneyInput label="% received digitally" value={biz.digitalPct} onChange={(v) => setInput('business', { digitalPct: v })} suffix="%" max={100} hint="6% profit on digital receipts, 8% on cash." />
                    <MoneyInput label="Profit you declare (optional)" value={biz.declaredProfit} onChange={(v) => setInput('business', { declaredProfit: v })} hint="Only if higher than the presumptive profit." />
                  </Grid>
                )}
                {biz.type === '44ADA' && (
                  <Grid>
                    <MoneyInput label="Gross professional receipts" value={biz.turnover} onChange={(v) => setInput('business', { turnover: v })} hint="Up to ₹75 lakh if 95%+ digital, else ₹50 lakh. 50% is taxed as profit." />
                    <MoneyInput label="% received digitally" value={biz.digitalPct} onChange={(v) => setInput('business', { digitalPct: v })} suffix="%" max={100} />
                    <MoneyInput label="Profit you declare (optional)" value={biz.declaredProfit} onChange={(v) => setInput('business', { declaredProfit: v })} />
                  </Grid>
                )}
                {biz.type === 'regular' && (
                  <Grid>
                    <MoneyInput label="Net profit (after expenses & depreciation)" value={biz.regularProfit} onChange={(v) => setInput('business', { regularProfit: v })} allowNegative />
                  </Grid>
                )}
                {biz.type === 'none' && <p className="text-sm text-on-surface-variant">Pick a type if you earn from a business or profession.</p>}
              </div>
            </Card>
          )}

          {step === 'investments' && (
            <Card title="Capital gains & trading" icon="candlestick_chart" subtitle="Use net figures from your broker's P&L / capital-gains statement. Losses as negative.">
              <Grid>
                <MoneyInput label="STCG — shares & equity MF" value={cg.stcg111A} onChange={(v) => setInput('capitalGains', { stcg111A: v })} allowNegative hint="Held ≤ 12 months, taxed at 20% (sec 111A). From FY 2026-27 share buybacks are also capital gains." />
                <MoneyInput label="LTCG — shares & equity MF" value={cg.ltcg112A} onChange={(v) => setInput('capitalGains', { ltcg112A: v })} allowNegative hint="Held > 12 months, 12.5% above ₹1.25 lakh (sec 112A)." />
                <MoneyInput label="Short-term gains at slab rate" value={cg.stcgSlab} onChange={(v) => setInput('capitalGains', { stcgSlab: v })} allowNegative hint="Debt MF (>65% debt) bought after Apr 2023, unlisted bonds, gold/property held < 24 months." />
                <MoneyInput label="Other LTCG (gold, unlisted, etc.)" value={cg.ltcgOther} onChange={(v) => setInput('capitalGains', { ltcgOther: v })} allowNegative hint="Held > 24 months, 12.5% without indexation." />
                <MoneyInput label="Property LTCG — without indexation" value={cg.propertyGain} onChange={(v) => setInput('capitalGains', { propertyGain: v })} allowNegative />
                <MoneyInput label="Property LTCG — with indexation" value={cg.propertyGainIndexed} onChange={(v) => setInput('capitalGains', { propertyGainIndexed: v })} hint="We pick the lower tax: 12.5% plain or 20% indexed." />
              </Grid>
              <div className="mt-3 rounded-2xl bg-surface-container-low px-4">
                <Toggle checked={cg.propertyBoughtBefore2024} onChange={(v) => setInput('capitalGains', { propertyBoughtBefore2024: v })} label="Property bought before 23 July 2024" hint="Only then can a resident choose 20% with indexation." />
              </div>
              <h4 className="mb-3 mt-6 text-sm font-bold text-on-surface">F&amp;O and intraday (business income)</h4>
              <Grid>
                <MoneyInput label="F&O net profit / loss" value={trading.fnoProfit} onChange={(v) => setInput('trading', { fnoProfit: v })} allowNegative hint="Loss can reduce other income (not salary) and is carried forward 8 years." />
                <MoneyInput label="Intraday profit / loss" value={trading.intradayProfit} onChange={(v) => setInput('trading', { intradayProfit: v })} allowNegative hint="Speculative: losses only offset speculative profits." />
                <MoneyInput label="F&O turnover" value={trading.fnoTurnover} onChange={(v) => setInput('trading', { fnoTurnover: v })} hint="Sum of absolute profits and losses — decides tax audit." />
              </Grid>
            </Card>
          )}

          {step === 'crypto' && (
            <Card title="Crypto & virtual digital assets" icon="currency_bitcoin" subtitle="Bitcoin, other crypto and NFTs — sec 115BBH.">
              <Grid>
                <MoneyInput label="Total gains (profitable trades)" value={crypto.gains} onChange={(v) => setInput('crypto', { gains: v })} hint="Flat 30% — no basic exemption, no deduction except cost." />
                <MoneyInput label="Total losses" value={crypto.losses} onChange={(v) => setInput('crypto', { losses: v })} hint="Shown for awareness — the law allows no set-off." />
                <MoneyInput label="1% TDS deducted (194S)" value={crypto.tds} onChange={(v) => setInput('crypto', { tds: v })} hint="Claimed as credit against your tax." />
              </Grid>
            </Card>
          )}

          {step === 'other' && (
            <Card title="Other income" icon="savings" subtitle="Interest, dividends, family pension, winnings.">
              <Grid>
                <MoneyInput label="Savings-account interest" value={other.savingsInterest} onChange={(v) => setInput('other', { savingsInterest: v })} hint="₹10,000 deduction (80TTA) in the old regime." />
                <MoneyInput label="FD / RD / bond interest" value={other.fdInterest} onChange={(v) => setInput('other', { fdInterest: v })} hint="Seniors: ₹50,000 deduction on all interest (80TTB, old regime)." />
                <MoneyInput label="Dividends" value={other.dividends} onChange={(v) => setInput('other', { dividends: v })} />
                <MoneyInput label="Family pension" value={other.familyPension} onChange={(v) => setInput('other', { familyPension: v })} hint="1/3rd deductible up to ₹25,000 (new) / ₹15,000 (old)." />
                <MoneyInput label="Lottery / game / online-gaming winnings" value={other.lottery} onChange={(v) => setInput('other', { lottery: v })} hint="Flat 30%, no exemption limit." />
                <MoneyInput label="Any other income" value={other.other} onChange={(v) => setInput('other', { other: v })} hint="Gifts above ₹50,000, freelance not under 44ADA, etc." />
              </Grid>
            </Card>
          )}

          {step === 'deductions' && (
            <Card title="Deductions" icon="receipt_long" subtitle="Mostly for the old regime. Employer NPS & Agniveer also work in the new regime.">
              <Grid>
                <MoneyInput label="80C (excluding your PF)" value={ded.sec80C} onChange={(v) => setInput('deductions', { sec80C: v })} hint="PPF, ELSS, LIC, tuition, home-loan principal, SSY. Max ₹1.5 lakh with PF." />
                <MoneyInput label="80CCD(1B) — own NPS" value={ded.sec80CCD1B} onChange={(v) => setInput('deductions', { sec80CCD1B: v })} hint="Extra ₹50,000." />
                <MoneyInput label="80D — self & family" value={ded.sec80DSelf} onChange={(v) => setInput('deductions', { sec80DSelf: v })} hint="₹25,000 (₹50,000 if you're 60+)." />
                <MoneyInput label="80D — parents" value={ded.sec80DParents} onChange={(v) => setInput('deductions', { sec80DParents: v })} />
                <MoneyInput label="80E — education-loan interest" value={ded.sec80E} onChange={(v) => setInput('deductions', { sec80E: v })} hint="No limit, 8 years." />
                <MoneyInput label="80G — eligible donation amount" value={ded.sec80G} onChange={(v) => setInput('deductions', { sec80G: v })} hint="After the 50%/100% rule on your receipt." />
                <MoneyInput label="80EEA — affordable home-loan interest" value={ded.sec80EEA} onChange={(v) => setInput('deductions', { sec80EEA: v })} />
                <MoneyInput label="80CCH — Agniveer corpus" value={ded.agniveer80CCH} onChange={(v) => setInput('deductions', { agniveer80CCH: v })} />
                <MoneyInput label="Other deductions" value={ded.otherVIA} onChange={(v) => setInput('deductions', { otherVIA: v })} hint="80DD, 80DDB, 80GGC etc." />
              </Grid>
              <div className="mt-3 space-y-1 rounded-2xl bg-surface-container-low px-4 py-1">
                <Toggle checked={ded.parentsSenior} onChange={(v) => setInput('deductions', { parentsSenior: v })} label="Parents are 60+" hint="Raises the parents' 80D limit to ₹50,000." />
              </div>
              <div className="mt-4">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">80U — your own disability</p>
                <Segmented
                  layoutId="disability"
                  size="sm"
                  value={ded.disability}
                  onChange={(disability) => setInput('deductions', { disability })}
                  options={[
                    { value: 'none', label: 'None' },
                    { value: 'disabled', label: '40%+ (₹75,000)' },
                    { value: 'severe', label: '80%+ (₹1.25 lakh)' },
                  ]}
                />
              </div>
            </Card>
          )}

          {step === 'paid' && (
            <Card title="Taxes already paid" icon="task_alt" subtitle="From Form 16 / 26AS / AIS — so we can show refund or balance due.">
              <div className="mb-3 rounded-2xl bg-surface-container-low px-4">
                <Toggle checked={paid.assumeSalaryTds} onChange={(v) => setInput('paid', { assumeSalaryTds: v })} label="My employer deducts TDS from salary" hint="If you leave TDS blank, we assume it matches the tax on your salary." />
              </div>
              <Grid>
                <MoneyInput label="TDS (salary, FD, rent, etc.)" value={paid.tds} onChange={(v) => setInput('paid', { tds: v })} />
                <MoneyInput label="TCS (foreign travel, LRS, etc.)" value={paid.tcs} onChange={(v) => setInput('paid', { tcs: v })} />
                <MoneyInput label="Advance tax paid by 15 June" value={paid.advanceJun} onChange={(v) => setInput('paid', { advanceJun: v })} />
                <MoneyInput label="Paid 16 June – 15 Sep" value={paid.advanceSep} onChange={(v) => setInput('paid', { advanceSep: v })} />
                <MoneyInput label="Paid 16 Sep – 15 Dec" value={paid.advanceDec} onChange={(v) => setInput('paid', { advanceDec: v })} />
                <MoneyInput label="Paid 16 Dec – 15 Mar" value={paid.advanceMar} onChange={(v) => setInput('paid', { advanceMar: v })} />
                <MoneyInput label="Self-assessment tax paid" value={paid.selfAssessment} onChange={(v) => setInput('paid', { selfAssessment: v })} />
              </Grid>
            </Card>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="flex justify-between">
        <button type="button" disabled={index === 0} onClick={() => setStep(STEPS[index - 1].key)} className="inline-flex items-center gap-1 rounded-xl px-4 py-2.5 text-sm font-bold text-on-surface-variant hover:bg-surface-container disabled:opacity-30">
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>Back
        </button>
        <button type="button" disabled={index === STEPS.length - 1} onClick={() => setStep(STEPS[index + 1].key)} className="inline-flex items-center gap-1 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-on-primary shadow-md shadow-primary/20 hover:bg-primary-container disabled:opacity-30">
          Next<span className="material-symbols-outlined text-[18px]">arrow_forward</span>
        </button>
      </div>
    </div>
  );
}
