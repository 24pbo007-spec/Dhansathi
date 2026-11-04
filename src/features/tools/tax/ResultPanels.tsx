import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { askAI } from '@/lib/aiClient';
import { Markdown } from '@/components/shared/Markdown';
import type { RegimeResult, TaxReport } from '@/lib/tax/types';
import { useTaxCalcStore } from '@/stores/taxCalcStore';
import { useLanguageStore } from '@/stores/languageStore';
import { AnimatedNumber, Card } from './ui';
import { inr, inrShort } from './format';

const pct = (n: number, digits = 1) => `${(n * 100).toFixed(digits)}%`;

/* ── Hero: tax due, regime face-off, refund / payable ─────────────────── */

export function TaxHero({ report }: { report: TaxReport }) {
  const regimeChoice = useTaxCalcStore((s) => s.regimeChoice);
  const setRegimeChoice = useTaxCalcStore((s) => s.setRegimeChoice);
  const { chosen, better, saving } = report;
  const maxTax = Math.max(report.new.totalTax, report.old.totalTax, 1);

  return (
    <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-primary via-primary to-primary-container p-6 text-on-primary shadow-2xl shadow-primary/30 md:p-7">
      {/* Animated light blobs */}
      <motion.div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" animate={{ x: [0, -30, 0], y: [0, 20, 0] }} transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }} />
      <motion.div className="pointer-events-none absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-tertiary/30 blur-3xl" animate={{ x: [0, 40, 0], y: [0, -20, 0] }} transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }} />

      <div className="relative">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-on-primary/70">
            {report.yearLabel} · {report.assessmentYear}
          </p>
          <div className="rounded-xl bg-white/10 p-1 backdrop-blur">
            {(['auto', 'new', 'old'] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setRegimeChoice(c)}
                className={cn('relative rounded-lg px-3 py-1 text-xs font-bold', regimeChoice === c ? 'text-primary' : 'text-on-primary/80')}
              >
                {regimeChoice === c && <motion.span layoutId="hero-regime" className="absolute inset-0 rounded-lg bg-white" />}
                <span className="relative">{c === 'auto' ? 'Best' : c === 'new' ? 'New' : 'Old'}</span>
              </button>
            ))}
          </div>
        </div>

        <p className="mt-5 text-sm font-medium text-on-primary/80">
          Total tax · {report.chosenRegime === 'new' ? 'New regime' : 'Old regime'}
        </p>
        <AnimatedNumber value={chosen.totalTax} className="block break-all font-headline text-4xl font-extrabold tracking-tight sm:text-5xl 2xl:text-6xl" />
        <p className="mt-1 text-sm text-on-primary/80">
          Effective rate <span className="font-bold text-white">{pct(chosen.effectiveRate)}</span> on taxable income of{' '}
          <span className="font-bold text-white">{inrShort(chosen.totalIncome)}</span>
        </p>

        <AnimatePresence>
          {saving > 0 && (
            <motion.div
              key={better}
              initial={{ opacity: 0, scale: 0.9, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-4 inline-flex flex-wrap items-center gap-x-2 rounded-full bg-white px-4 py-2 text-sm font-bold text-primary shadow-lg"
            >
              <span className="material-symbols-outlined text-[18px] text-india-green">verified</span>
              <span className="whitespace-nowrap">{better === 'new' ? 'New' : 'Old'} regime saves you</span>
              <AnimatedNumber value={saving} className="whitespace-nowrap" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Regime face-off */}
        <div className="mt-6 grid grid-cols-2 gap-3">
          {(['new', 'old'] as const).map((regime) => {
            const r = report[regime];
            const isBest = better === regime && saving > 0;
            return (
              <div key={regime} className={cn('rounded-2xl p-4 backdrop-blur', isBest ? 'bg-white/20 ring-2 ring-white/60' : 'bg-white/10')}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wider text-on-primary/80">{regime === 'new' ? 'New regime' : 'Old regime'}</p>
                  {isBest && <span className="rounded-full bg-india-green px-2 py-0.5 text-[10px] font-bold text-white">BEST</span>}
                </div>
                <AnimatedNumber value={r.totalTax} className="mt-1 block font-headline text-xl font-bold" />
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/15">
                  <motion.div className="h-full rounded-full bg-white" animate={{ width: `${(r.totalTax / maxTax) * 100}%` }} transition={{ type: 'spring', stiffness: 90, damping: 18 }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Payable / refund + monthly */}
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-2xl bg-black/15 p-4">
            <p className="text-xs text-on-primary/70">{report.netPayable < 0 ? 'Refund due to you' : 'Balance tax to pay'}</p>
            <AnimatedNumber value={Math.abs(report.netPayable)} className={cn('block font-headline text-xl font-bold', report.netPayable < 0 ? 'text-tertiary-fixed' : 'text-white')} />
            <p className="text-[11px] text-on-primary/60">After {inrShort(report.paid.total)} TDS/advance tax</p>
          </div>
          <div className="rounded-2xl bg-black/15 p-4">
            {report.monthly ? (
              <>
                <p className="text-xs text-on-primary/70">Monthly take-home</p>
                <AnimatedNumber value={report.monthly.takeHome} className="block font-headline text-xl font-bold" />
                <p className="text-[11px] text-on-primary/60">TDS about {inr(report.monthly.tds)}/month</p>
              </>
            ) : (
              <>
                <p className="text-xs text-on-primary/70">ITR form</p>
                <p className="font-headline text-xl font-bold">{report.itr.form}</p>
                <p className="text-[11px] text-on-primary/60">Due {report.itrDueDate}</p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── How the tax was calculated ───────────────────────────────────────── */

function Row({ label, amount, note, strong, minus, indent }: { label: string; amount: number; note?: string; strong?: boolean; minus?: boolean; indent?: boolean }) {
  return (
    <div className={cn('flex items-start justify-between gap-4 py-2', strong && 'border-t border-outline-variant/30 font-bold text-on-surface', indent && 'pl-4')}>
      <div className="min-w-0">
        <p className={cn('text-sm', strong ? 'text-on-surface' : 'text-on-surface-variant')}>{label}</p>
        {note && <p className="text-[11px] text-on-surface-variant/80">{note}</p>}
      </div>
      <p className={cn('shrink-0 font-mono text-sm tabular-nums', minus ? 'text-india-green' : 'text-on-surface')}>
        {minus ? '− ' : ''}
        {inr(amount)}
      </p>
    </div>
  );
}

export function Breakdown({ result }: { result: RegimeResult }) {
  const h = result.heads;
  return (
    <Card title={`How your tax is calculated · ${result.regime === 'new' ? 'New' : 'Old'} regime`} icon="account_tree" subtitle="Every step, the same way the Income Tax Department computes it.">
      <div className="divide-y divide-outline-variant/10">
        {h.salary > 0 && <Row label="Income from salary (after exemptions & standard deduction)" amount={h.salary} />}
        {h.houseProperty !== 0 && <Row label="Income from house property" amount={h.houseProperty} />}
        {h.business !== 0 && <Row label="Business / profession / F&O" amount={h.business} />}
        {h.capitalGains > 0 && <Row label="Capital gains" amount={h.capitalGains} />}
        {h.otherSources > 0 && <Row label="Income from other sources" amount={h.otherSources} />}
        {result.exemptions.map((e) => (
          <Row key={e.label} label={e.label} amount={e.amount} note={e.note} minus indent />
        ))}
        <Row label="Gross total income" amount={result.grossTotalIncome} strong />
        {result.deductions.map((d) => (
          <Row key={d.label} label={d.label} amount={d.amount} note={d.note} minus indent />
        ))}
        <Row label="Taxable income" amount={result.totalIncome} strong />
      </div>

      {result.slabBreakdown.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Slab-wise tax on {inr(result.normalIncome)}</p>
          <div className="space-y-1.5">
            {result.slabBreakdown.map((s, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }} className="flex items-center gap-3 text-xs">
                <span className="w-28 shrink-0 text-on-surface-variant">
                  {inrShort(s.from)} – {s.to === Infinity ? 'above' : inrShort(s.to)}
                </span>
                <span className="w-10 shrink-0 font-bold text-primary">{Math.round(s.rate * 100)}%</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-container-high">
                  <motion.div className="h-full rounded-full bg-gradient-to-r from-primary to-tertiary" initial={{ width: 0 }} animate={{ width: `${Math.min(100, (s.rate / 0.3) * 100)}%` }} />
                </div>
                <span className="w-24 shrink-0 text-right font-mono tabular-nums text-on-surface">{inr(s.tax)}</span>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 divide-y divide-outline-variant/10">
        <Row label="Tax on slab income" amount={result.taxOnNormal} />
        {result.special.map((s) => (
          <Row
            key={s.label}
            label={`${s.label} @ ${Math.round(s.rate * 1000) / 10}%`}
            amount={s.tax}
            note={s.taxable !== s.income ? `${inr(s.income)} gain, ${inr(s.taxable)} taxable` : undefined}
          />
        ))}
        {result.basicExemptionUsedOnGains > 0 && (
          <Row label="Unused basic exemption applied to capital gains" amount={result.basicExemptionUsedOnGains} note="Allowed for residents under sec 111A/112/112A" indent />
        )}
        {result.rebate > 0 && <Row label="Rebate u/s 87A" amount={result.rebate} minus />}
        {result.rebateMarginalRelief > 0 && <Row label="Marginal relief (just above ₹12 lakh)" amount={result.rebateMarginalRelief} minus />}
        {result.surcharge > 0 && <Row label={`Surcharge @ ${pct(result.surchargeRate, 0)}`} amount={result.surcharge} note={result.surchargeMarginalRelief > 0 ? `After marginal relief of ${inr(result.surchargeMarginalRelief)}` : undefined} />}
        <Row label="Health & education cess @ 4%" amount={result.cess} />
        <Row label="Total tax liability" amount={result.totalTax} strong />
      </div>

      {(result.notes.length > 0 || result.carriedForward.length > 0) && (
        <div className="mt-5 space-y-2 rounded-2xl bg-surface-container-low p-4">
          {result.carriedForward.map((c) => (
            <p key={c.label} className="flex gap-2 text-xs text-on-surface">
              <span className="material-symbols-outlined text-[16px] text-saffron">history</span>
              <span>
                <strong>{c.label} carried forward:</strong> {inr(c.amount)}
              </span>
            </p>
          ))}
          {result.notes.map((n) => (
            <p key={n} className="flex gap-2 text-xs text-on-surface-variant">
              <span className="material-symbols-outlined text-[16px] text-primary">info</span>
              {n}
            </p>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ── Suggestions ──────────────────────────────────────────────────────── */

export function Suggestions({ report }: { report: TaxReport }) {
  if (!report.suggestions.length) return null;
  const totalSaving = report.suggestions.filter((s) => s.kind === 'save' && s.saving).reduce((a, s) => a + (s.saving || 0), 0);
  return (
    <Card title="Smart suggestions" icon="tips_and_updates" subtitle={totalSaving > 0 ? `Up to ${inr(totalSaving)} in possible savings` : 'Things worth knowing about your return'}>
      <div className="space-y-3">
        {report.suggestions.map((s, i) => (
          <motion.div
            key={s.title}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className={cn(
              'flex gap-3 rounded-2xl border p-4',
              s.kind === 'save' ? 'border-india-green/25 bg-india-green/5' : s.kind === 'warn' ? 'border-error/25 bg-error-container/30' : 'border-primary/15 bg-primary-fixed/30',
            )}
          >
            <span className={cn('material-symbols-outlined text-[22px]', s.kind === 'save' ? 'text-india-green' : s.kind === 'warn' ? 'text-error' : 'text-primary')}>
              {s.kind === 'save' ? 'savings' : s.kind === 'warn' ? 'warning' : 'lightbulb'}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-bold text-on-surface">{s.title}</p>
                {s.saving ? <span className="rounded-full bg-india-green px-2 py-0.5 text-[11px] font-bold text-white">save ~{inr(s.saving)}</span> : null}
              </div>
              <p className="mt-0.5 text-xs leading-relaxed text-on-surface-variant">{s.detail}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </Card>
  );
}

/* ── Advance tax, ITR form, deadlines ─────────────────────────────────── */

export function FilingPanel({ report }: { report: TaxReport }) {
  const adv = report.advanceTax;
  return (
    <Card
      title="Advance tax & filing"
      icon="event_upcoming"
      subtitle={report.filing.passed ? `Due date ${report.filing.dueDate} has passed — belated return allowed till ${report.filing.belatedBy}` : `File by ${report.filing.dueDate} (no audit)`}
    >
      <div className="mb-5 flex items-start gap-3 rounded-2xl bg-primary-fixed/40 p-4">
        <span className="material-symbols-outlined text-primary">description</span>
        <div>
          <p className="text-sm font-bold text-on-surface">File {report.itr.form}</p>
          <p className="text-xs text-on-surface-variant">{report.itr.reason}</p>
          <p className="mt-1 text-xs text-on-surface-variant">Check your TDS in {report.filing.statement} before filing.</p>
        </div>
      </div>

      {adv.applicable ? (
        <>
          <p className="mb-3 text-sm text-on-surface-variant">
            Tax not covered by TDS: <strong className="text-on-surface">{inr(adv.liability)}</strong>. Pay it in instalments to avoid interest:
          </p>
          <div className="relative space-y-3 pl-6">
            <div className="absolute bottom-2 left-2 top-2 w-0.5 bg-outline-variant/40" />
            {adv.instalments.map((ins, i) => (
              <motion.div key={ins.date} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }} className="relative">
                <span className={cn('absolute -left-[22px] top-1 h-3 w-3 rounded-full ring-4 ring-surface-container-lowest', ins.shortfall > 0 ? 'bg-error' : 'bg-india-green')} />
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-bold text-on-surface">{ins.date}</p>
                  <p className="font-mono text-sm tabular-nums text-on-surface">{inr(ins.requiredCumulative)} total due</p>
                </div>
                <p className="text-xs text-on-surface-variant">
                  Paid so far {inr(ins.paidCumulative)}
                  {ins.interest > 0 && <span className="font-semibold text-error"> · interest 234C ≈ {inr(ins.interest)}</span>}
                </p>
              </motion.div>
            ))}
          </div>
          {(adv.interest234B > 0 || adv.interest234C > 0) && (
            <p className="mt-4 rounded-xl bg-error-container/40 p-3 text-xs text-on-surface">
              Estimated interest: <strong>234B {inr(adv.interest234B)}</strong> and <strong>234C {inr(adv.interest234C)}</strong> (included in the balance shown above; assumes filing in July).
            </p>
          )}
        </>
      ) : (
        <p className="flex items-center gap-2 text-sm text-on-surface-variant">
          <span className="material-symbols-outlined text-india-green">check_circle</span>
          No advance tax needed — tax not covered by TDS is under ₹10,000{' '}
          {report.chosen.totalTax > 0 ? 'or you are a senior citizen without business income.' : '.'}
        </p>
      )}
    </Card>
  );
}

/* ── Gemma explanation ────────────────────────────────────────────────── */

export function AiExplain({ report }: { report: TaxReport }) {
  const lang = useLanguageStore((s) => s.lang);
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const explain = async (hindi: boolean) => {
    setLoading(true);
    setError(null);
    const c = report.chosen;
    const facts = {
      year: report.yearLabel,
      regime_used: report.chosenRegime,
      tax_new: report.new.totalTax,
      tax_old: report.old.totalTax,
      better_regime: report.better,
      saving: report.saving,
      taxable_income: c.totalIncome,
      slab_tax: Math.round(c.taxOnNormal),
      special_taxes: c.special.map((s) => ({ item: s.label, tax: Math.round(s.tax) })),
      rebate_87A: Math.round(c.rebate),
      marginal_relief: Math.round(c.rebateMarginalRelief),
      surcharge: Math.round(c.surcharge),
      cess: Math.round(c.cess),
      deductions: c.deductions.map((d) => ({ item: d.label, amount: Math.round(d.amount) })),
      net_payable_or_refund: report.netPayable,
      itr_form: report.itr.form,
      suggestions: report.suggestions.map((s) => s.title),
      notes: c.notes,
    };
    try {
      const out = await askAI(
        [
          `You are DhanSathi's tax expert explaining a computed Indian income-tax result to a common person in ${hindi ? 'simple Hindi (Devanagari)' : 'simple English'}.`,
          'Use ONLY these computed numbers; never recalculate or invent figures. Explain: why this regime, how the tax was reached, what to do next (top 3 actions).',
          'Use short bold headings and bullet points. Under 200 words. Remind them to verify with Form 16/AIS before filing.',
          JSON.stringify(facts),
        ].join('\n'),
      );
      setText(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI is busy. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card
      title="Explain my tax"
      icon="auto_awesome"
      subtitle="DhanSathi AI (Gemma) explains your result in plain language."
      action={
        <div className="flex gap-2">
          <button type="button" disabled={loading} onClick={() => explain(true)} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-on-primary disabled:opacity-50">
            हिंदी
          </button>
          <button type="button" disabled={loading} onClick={() => explain(false)} className="rounded-lg border border-primary/30 px-3 py-1.5 text-xs font-bold text-primary disabled:opacity-50">
            English
          </button>
        </div>
      }
    >
      {loading && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <motion.div key={i} className="h-3 rounded-full bg-surface-container-high" style={{ width: `${90 - i * 20}%` }} animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.15 }} />
          ))}
        </div>
      )}
      {error && <p className="text-sm text-error">{error}</p>}
      {text && !loading && <Markdown text={text} />}
      {!text && !loading && !error && (
        <p className="text-sm text-on-surface-variant">{lang === 'hi' ? 'अपने टैक्स का आसान भाषा में मतलब समझें।' : 'Get a plain-language walkthrough of your numbers and next steps.'}</p>
      )}
    </Card>
  );
}

