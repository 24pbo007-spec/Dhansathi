import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { computeGst, computeItc, GST_RATES, RATE_EXAMPLES, type SupplyType } from '@/lib/gst';
import { AnimatedNumber, Card, MoneyInput, Segmented } from './tax/ui';
import { inr } from './tax/format';

export default function GstCalculator() {
  const [amount, setAmount] = useState(10000);
  const [rate, setRate] = useState(18);
  const [customRate, setCustomRate] = useState(0);
  const [cess, setCess] = useState(0);
  const [supply, setSupply] = useState<SupplyType>('intra');
  const [inclusive, setInclusive] = useState(false);
  const effectiveRate = rate === -1 ? customRate : rate;

  const result = useMemo(() => computeGst(amount, effectiveRate, supply, inclusive, cess), [amount, effectiveRate, supply, inclusive, cess]);

  const [output, setOutput] = useState(0);
  const [input, setInput] = useState(0);
  const itc = useMemo(() => computeItc(output, input), [output, input]);

  const splitRows = supply === 'intra'
    ? [
        { label: `CGST @ ${(effectiveRate / 2).toFixed(effectiveRate % 2 ? 1 : 0)}%`, value: result.cgst },
        { label: `SGST @ ${(effectiveRate / 2).toFixed(effectiveRate % 2 ? 1 : 0)}%`, value: result.sgst },
      ]
    : [{ label: `IGST @ ${effectiveRate}%`, value: result.igst }];
  if (cess > 0) splitRows.push({ label: `Cess @ ${cess}%`, value: result.cess });

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <motion.div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-tertiary to-primary shadow-lg shadow-primary/25" animate={{ rotate: [0, 8, -8, 0] }} transition={{ duration: 5, repeat: Infinity, repeatDelay: 3 }}>
          <span className="material-symbols-outlined text-2xl text-on-primary">receipt_long</span>
        </motion.div>
        <div>
          <h1 className="font-headline text-2xl font-extrabold text-on-surface md:text-3xl">GST Calculator</h1>
          <p className="text-sm text-on-surface-variant">Add or remove GST, split CGST/SGST/IGST, add cess, and net off input tax credit.</p>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Input */}
        <Card title="Amount & rate" icon="tune">
          <div className="space-y-4">
            <Segmented
              layoutId="gst-inclusive"
              value={inclusive ? 'incl' : 'excl'}
              onChange={(v) => setInclusive(v === 'incl')}
              options={[
                { value: 'excl', label: 'Add GST' },
                { value: 'incl', label: 'Remove GST (amount includes GST)' },
              ]}
            />
            <MoneyInput label={inclusive ? 'Amount (GST included)' : 'Amount (before GST)'} value={amount} onChange={setAmount} />

            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">GST rate</p>
              <div className="flex flex-wrap gap-2">
                {GST_RATES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRate(r)}
                    className={cn('rounded-xl px-3 py-1.5 text-sm font-bold transition-colors', rate === r ? 'bg-primary text-on-primary shadow' : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container')}
                  >
                    {r}%
                  </button>
                ))}
                <button type="button" onClick={() => setRate(-1)} className={cn('rounded-xl px-3 py-1.5 text-sm font-bold transition-colors', rate === -1 ? 'bg-primary text-on-primary shadow' : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container')}>
                  Custom
                </button>
              </div>
              {rate === -1 && <div className="mt-3 max-w-[180px]"><MoneyInput label="Custom rate" value={customRate} onChange={setCustomRate} suffix="%" max={100} /></div>}
              {rate >= 0 && RATE_EXAMPLES[rate] && <p className="mt-2 text-[11px] text-on-surface-variant">{RATE_EXAMPLES[rate]}</p>}
            </div>

            <Segmented
              layoutId="gst-supply"
              value={supply}
              onChange={setSupply}
              options={[
                { value: 'intra', label: 'Same state (CGST+SGST)' },
                { value: 'inter', label: 'Other state (IGST)' },
              ]}
            />
            <div className="max-w-[180px]"><MoneyInput label="Compensation cess (optional)" value={cess} onChange={setCess} suffix="%" max={300} hint="On cars, tobacco, aerated drinks." /></div>
          </div>
        </Card>

        {/* Result */}
        <div className="space-y-4">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-primary-container p-6 text-on-primary shadow-xl shadow-primary/25">
            <motion.div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 8, repeat: Infinity }} />
            <p className="relative text-xs font-bold uppercase tracking-wider text-on-primary/70">Total GST</p>
            <AnimatedNumber value={result.totalGst + result.cess} className="relative block font-headline text-4xl font-extrabold" />
            <div className="relative mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-black/15 p-3">
                <p className="text-xs text-on-primary/70">Taxable value</p>
                <AnimatedNumber value={result.base} className="block font-headline text-lg font-bold" />
              </div>
              <div className="rounded-xl bg-black/15 p-3">
                <p className="text-xs text-on-primary/70">Invoice total</p>
                <AnimatedNumber value={result.total} className="block font-headline text-lg font-bold" />
              </div>
            </div>
          </div>
          <Card title="Tax split" icon="splitscreen">
            <div className="divide-y divide-outline-variant/10">
              {splitRows.map((row) => (
                <div key={row.label} className="flex items-center justify-between py-2.5">
                  <span className="text-sm text-on-surface-variant">{row.label}</span>
                  <span className="font-mono text-sm font-semibold text-on-surface">{inr(row.value)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between py-2.5 font-bold">
                <span className="text-sm text-on-surface">Total tax</span>
                <span className="font-mono text-sm text-on-surface">{inr(result.totalGst + result.cess)}</span>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* ITC */}
      <Card title="Net GST payable (input tax credit)" icon="account_balance" subtitle="For a registered business filing GSTR-3B: tax collected minus tax paid on purchases.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <MoneyInput label="Output GST (collected on sales)" value={output} onChange={setOutput} />
          <MoneyInput label="Input GST (paid on purchases / ITC)" value={input} onChange={setInput} />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-primary-fixed/40 p-4">
            <p className="text-xs text-on-surface-variant">GST to pay in cash</p>
            <AnimatedNumber value={itc.netPayable} className="block font-headline text-2xl font-bold text-primary" />
          </div>
          <div className="rounded-2xl bg-india-green/10 p-4">
            <p className="text-xs text-on-surface-variant">Credit carried forward</p>
            <AnimatedNumber value={itc.creditCarried} className="block font-headline text-2xl font-bold text-india-green" />
          </div>
        </div>
      </Card>

      <p className="text-center text-[11px] text-on-surface-variant">Standard GST rates. Actual rate and cess depend on the HSN/SAC code of the goods or service. Not tax advice.</p>
    </div>
  );
}
