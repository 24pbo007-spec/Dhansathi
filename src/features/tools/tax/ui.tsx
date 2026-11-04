import { useEffect, useId, useState, type ReactNode } from 'react';
import { animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { cn } from '@/lib/utils';
import { inr } from './format';

/** Number that counts smoothly to its new value. */
export function AnimatedNumber({ value, format = inr, className }: { value: number; format?: (n: number) => string; className?: string }) {
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => format(v));
  useEffect(() => {
    const controls = animate(mv, value, { duration: 0.6, ease: [0.22, 1, 0.36, 1] });
    return controls.stop;
  }, [mv, value]);
  return <motion.span className={cn('tabular-nums', className)}>{text}</motion.span>;
}

/** ₹ input with lakh/crore grouping that accepts negative values where allowed. */
export function MoneyInput({
  label,
  value,
  onChange,
  hint,
  allowNegative = false,
  suffix,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  hint?: ReactNode;
  allowNegative?: boolean;
  suffix?: string;
  max?: number;
}) {
  const id = useId();
  const formatted = value ? Math.round(value).toLocaleString('en-IN') : '';
  // While typing, show exactly what the user typed; otherwise show the stored value.
  const [draft, setDraft] = useState<string | null>(null);
  const focused = draft !== null;
  const text = draft ?? formatted;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
        {label}
      </label>
      <div
        className={cn(
          'flex items-center rounded-xl border bg-surface-container-lowest transition-all',
          focused ? 'border-primary ring-4 ring-primary/10' : 'border-outline-variant/40 hover:border-outline-variant',
        )}
      >
        <span className="pl-3 text-on-surface-variant font-semibold">{suffix === '%' ? '' : '₹'}</span>
        <input
          id={id}
          inputMode="numeric"
          value={text}
          placeholder="0"
          onFocus={() => setDraft(formatted)}
          onBlur={() => setDraft(null)}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^\d-]/g, '');
            const negative = allowNegative && raw.startsWith('-');
            const digits = raw.replace(/-/g, '');
            let n = digits ? Number(digits) : 0;
            if (max != null) n = Math.min(n, max);
            const signed = negative ? -n : n;
            setDraft(digits ? `${negative ? '-' : ''}${n.toLocaleString('en-IN')}` : negative ? '-' : '');
            onChange(signed);
          }}
          className="w-full bg-transparent px-2 py-2.5 text-sm font-semibold text-on-surface tabular-nums focus:outline-none"
        />
        {suffix && <span className="pr-3 text-xs font-bold text-on-surface-variant">{suffix}</span>}
      </div>
      {hint && <p className="text-[11px] leading-snug text-on-surface-variant">{hint}</p>}
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  layoutId,
  size = 'md',
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  layoutId: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div className="inline-flex rounded-xl bg-surface-container-high/70 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'relative rounded-lg font-bold transition-colors',
            size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm',
            value === o.value ? 'text-on-primary' : 'text-on-surface-variant hover:text-on-surface',
          )}
        >
          {value === o.value && (
            <motion.span layoutId={layoutId} className="absolute inset-0 rounded-lg bg-primary shadow-md" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />
          )}
          <span className="relative z-10">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex w-full items-center justify-between gap-3 rounded-xl px-1 py-2 text-left">
      <span>
        <span className="block text-sm font-semibold text-on-surface">{label}</span>
        {hint && <span className="block text-[11px] text-on-surface-variant">{hint}</span>}
      </span>
      <span className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors', checked ? 'bg-primary' : 'bg-surface-container-highest')}>
        <motion.span layout className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow', checked ? 'right-0.5' : 'left-0.5')} transition={{ type: 'spring', stiffness: 500, damping: 30 }} />
      </span>
    </button>
  );
}

export function Card({ title, icon, subtitle, children, className, action }: { title?: string; icon?: string; subtitle?: string; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={cn('rounded-3xl border border-outline-variant/20 bg-surface-container-lowest p-5 md:p-6 shadow-ambient', className)}
    >
      {title && (
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            {icon && (
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-fixed text-primary">
                <span className="material-symbols-outlined text-[20px]">{icon}</span>
              </span>
            )}
            <div>
              <h3 className="font-headline text-base font-bold text-on-surface">{title}</h3>
              {subtitle && <p className="text-xs text-on-surface-variant">{subtitle}</p>}
            </div>
          </div>
          {action}
        </div>
      )}
      {children}
    </motion.section>
  );
}

export function Grid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>;
}
