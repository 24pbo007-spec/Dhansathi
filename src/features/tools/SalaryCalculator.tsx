import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { computeSalary, DEFAULT_SALARY_INPUT, type Component, type SalaryStructureInput } from '@/lib/salary';
import { AnimatedNumber, Card, Grid, MoneyInput, Segmented, Toggle } from './tax/ui';
import { inr, inrShort } from './tax/format';

const RingBar = ({ value, max, cls }: { value: number; max: number; cls: string }) => (
  <div className="h-2 overflow-hidden rounded-full bg-surface-container-high">
    <motion.div className={cn('h-full rounded-full', cls)} initial={{ width: 0 }} animate={{ width: `${max ? Math.min(100, (value / max) * 100) : 0}%` }} transition={{ type: 'spring', stiffness: 90, damping: 18 }} />
  </div>
);

function Rows({ items, max }: { items: Component[]; max: number }) {
  return (
    <div className="space-y-3">
      {items.map((c, i) => (
        <motion.div key={c.label} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-on-surface">
              {c.label}
              {c.note && <span className="ml-1 text-[11px] text-on-surface-variant">· {c.note}</span>}
            </span>
            <span className="shrink-0 font-mono text-sm tabular-nums text-on-surface">{inr(c.monthly)}<span className="text-on-surface-variant">/mo</span></span>
          </div>
          <div className="mt-1"><RingBar value={c.annual} max={max} cls="bg-gradient-to-r from-primary to-tertiary" /></div>
        </motion.div>
      ))}
    </div>
  );
}

export default function SalaryCalculator() {
  const [view, setView] = useState<'employee' | 'hr'>('employee');
  const [inp, setInp] = useState<SalaryStructureInput>(DEFAULT_SALARY_INPUT);
  const set = (patch: Partial<SalaryStructureInput>) => setInp((s) => ({ ...s, ...patch }));
  const r = useMemo(() => computeSalary(inp), [inp]);
  const best = inp && (r.better === 'new' ? r.new : r.old);
  const maxAnnual = Math.max(...r.earnings.map((e) => e.annual), 1);

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-16">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-3">
          <motion.div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-secondary shadow-lg shadow-primary/25" animate={{ y: [0, -3, 0] }} transition={{ duration: 3, repeat: Infinity }}>
            <span className="material-symbols-outlined text-2xl text-on-primary">payments</span>
          </motion.div>
          <div>
            <h1 className="font-headline text-2xl font-extrabold text-on-surface md:text-3xl">Salary &amp; CTC Calculator</h1>
            <p className="text-sm text-on-surface-variant">CTC se monthly in-hand — dono tax regime — aur poora HR/employer breakup.</p>
          </div>
        </div>
        <Segmented
          layoutId="salary-view"
          value={view}
          onChange={setView}
          options={[
            { value: 'employee', label: <span className="inline-flex items-center gap-1"><span className="material-symbols-outlined text-[16px]">person</span>Employee</span> },
            { value: 'hr', label: <span className="inline-flex items-center gap-1"><span className="material-symbols-outlined text-[16px]">groups</span>HR / Employer</span> },
          ]}
        />
      </motion.div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Inputs */}
        <div className="space-y-6 lg:col-span-7">
          <Card title="Package" icon="tune">
            <Grid>
              <MoneyInput label="Annual CTC" value={inp.ctcAnnual} onChange={(v) => set({ ctcAnnual: v })} hint="Total cost to company (yearly)." />
              <MoneyInput label="Performance bonus (in CTC)" value={inp.bonusAnnual} onChange={(v) => set({ bonusAnnual: v })} />
              <MoneyInput label="Rent you pay / month" value={inp.rentPaidMonthly} onChange={(v) => set({ rentPaidMonthly: v })} hint="Used for HRA exemption (old regime)." />
              <MoneyInput label="Professional tax / year" value={inp.professionalTaxAnnual} onChange={(v) => set({ professionalTaxAnnual: v })} max={2500} />
            </Grid>
            <div className="mt-5 space-y-4">
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Basic = {Math.round(inp.basicPctOfCtc * 100)}% of CTC</span>
                  <span className="font-mono text-xs text-on-surface">{inr(r.basic)}</span>
                </div>
                <input type="range" min={30} max={60} value={inp.basicPctOfCtc * 100} onChange={(e) => set({ basicPctOfCtc: Number(e.target.value) / 100 })} className="w-full accent-primary" />
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">HRA = {Math.round(inp.hraPctOfBasic * 100)}% of basic</span>
                </div>
                <input type="range" min={0} max={50} value={inp.hraPctOfBasic * 100} onChange={(e) => set({ hraPctOfBasic: Number(e.target.value) / 100 })} className="w-full accent-primary" />
              </div>
            </div>
            <div className="mt-4 space-y-1 rounded-2xl bg-surface-container-low px-4 py-1">
              <Toggle checked={inp.metro} onChange={(v) => set({ metro: v })} label="Metro city" hint="50% of basic HRA limit (else 40%)." />
              <Toggle checked={inp.employeePf} onChange={(v) => set({ employeePf: v })} label="EPF deducted" hint="You contribute 12% of basic to PF." />
              <Toggle checked={inp.pfOnCappedWage} onChange={(v) => set({ pfOnCappedWage: v })} label="PF on ₹15,000 ceiling" hint="Compute PF on the statutory wage cap, not full basic." />
            </div>
            <div className="mt-4">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Financial year</p>
              <Segmented layoutId="salary-fy" size="sm" value={inp.fy} onChange={(fy) => set({ fy })} options={[{ value: '2025-26', label: 'FY 2025-26' }, { value: '2026-27', label: 'FY 2026-27' }]} />
            </div>
          </Card>

          {/* Breakup */}
          {view === 'employee' ? (
            <Card title="Your monthly earnings" icon="account_balance_wallet" subtitle={`Gross ${inr(r.grossMonthly)}/month before deductions`}>
              <Rows items={r.earnings} max={maxAnnual} />
            </Card>
          ) : (
            <Card title="CTC breakup (HR view)" icon="groups" subtitle="Everything the company spends on this employee.">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wider text-on-surface-variant">
                      <th className="pb-2">Component</th>
                      <th className="pb-2 text-right">Monthly</th>
                      <th className="pb-2 text-right">Annual</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/10">
                    {[...r.earnings, ...r.employerContributions].map((c) => (
                      <tr key={c.label}>
                        <td className="py-2 text-on-surface">{c.label}{c.note && <span className="ml-1 text-[11px] text-on-surface-variant">· {c.note}</span>}</td>
                        <td className="py-2 text-right font-mono tabular-nums text-on-surface">{inr(c.monthly)}</td>
                        <td className="py-2 text-right font-mono tabular-nums text-on-surface">{inr(c.annual)}</td>
                      </tr>
                    ))}
                    <tr className="font-bold">
                      <td className="py-2 text-on-surface">Total CTC</td>
                      <td className="py-2 text-right font-mono text-on-surface">{inr(r.ctcAnnual / 12)}</td>
                      <td className="py-2 text-right font-mono text-on-surface">{inr(r.ctcAnnual)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="mt-4 text-xs text-on-surface-variant">Employer PF (12% of basic) and gratuity (4.81% of basic) are part of CTC but are not paid in your monthly salary — they build your retirement/exit corpus.</p>
            </Card>
          )}
        </div>

        {/* Result */}
        <div className="space-y-6 lg:col-span-5">
          <div className="lg:sticky lg:top-4 space-y-6">
            <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-primary via-primary to-primary-container p-6 text-on-primary shadow-2xl shadow-primary/30">
              <motion.div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10 blur-3xl" animate={{ x: [0, -24, 0], y: [0, 16, 0] }} transition={{ duration: 10, repeat: Infinity }} />
              <p className="relative text-xs font-bold uppercase tracking-wider text-on-primary/70">Monthly in-hand · {r.better === 'new' ? 'New' : 'Old'} regime</p>
              <AnimatedNumber value={best ? best.monthlyInHand : 0} className="relative block font-headline text-4xl font-extrabold sm:text-5xl" />
              <p className="relative mt-1 text-sm text-on-primary/80">Annual take-home <span className="font-bold text-white">{inrShort(best ? best.annualInHand : 0)}</span></p>

              <div className="relative mt-5 grid grid-cols-2 gap-3">
                {(['new', 'old'] as const).map((rg) => {
                  const th = rg === 'new' ? r.new : r.old;
                  const isBest = r.better === rg;
                  return (
                    <div key={rg} className={cn('rounded-2xl p-4 backdrop-blur', isBest ? 'bg-white/20 ring-2 ring-white/60' : 'bg-white/10')}>
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold uppercase tracking-wider text-on-primary/80">{rg === 'new' ? 'New' : 'Old'}</p>
                        {isBest && <span className="rounded-full bg-india-green px-2 py-0.5 text-[10px] font-bold text-white">BEST</span>}
                      </div>
                      <AnimatedNumber value={th.monthlyInHand} className="mt-1 block font-headline text-lg font-bold" />
                      <p className="text-[11px] text-on-primary/70">tax {inrShort(th.incomeTaxAnnual)}/yr</p>
                    </div>
                  );
                })}
              </div>
            </div>

            <Card title="Where your CTC goes" icon="donut_small">
              {[
                { label: 'In-hand salary', value: best ? best.annualInHand : 0, cls: 'bg-india-green' },
                { label: 'Income tax (TDS)', value: best ? best.incomeTaxAnnual : 0, cls: 'bg-error' },
                { label: 'Your PF + prof. tax', value: r.deductionsExTaxAnnual, cls: 'bg-saffron' },
                { label: 'Employer PF + gratuity', value: r.employerContributions.reduce((a, c) => a + c.annual, 0), cls: 'bg-primary' },
              ].map((seg) => (
                <div key={seg.label} className="mb-3">
                  <div className="mb-1 flex items-baseline justify-between text-xs">
                    <span className="text-on-surface-variant">{seg.label}</span>
                    <span className="font-mono text-on-surface">{inr(seg.value)}</span>
                  </div>
                  <RingBar value={seg.value} max={r.ctcAnnual} cls={seg.cls} />
                </div>
              ))}
              <p className="mt-2 text-[11px] text-on-surface-variant">Based on the better regime. Full tax detail is on the Tax Calculator page.</p>
            </Card>
          </div>
        </div>
      </div>

      <p className="text-center text-[11px] text-on-surface-variant">An estimate from a typical salary structure — your actual payslip depends on your company's components. Not tax or legal advice.</p>
    </div>
  );
}
