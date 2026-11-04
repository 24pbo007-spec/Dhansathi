import { cn } from '@/lib/utils';
import type { SimulationResult } from '@/lib/simulationService';

const inr = (value?: number | null) =>
  value == null ? 'N/A' : `₹${value.toLocaleString('en-IN', { maximumFractionDigits: value < 100 ? 2 : 0 })}`;
const pct = (value?: number | null, digits = 0) => (value == null ? 'N/A' : `${(value * 100).toFixed(digits)}%`);
const num = (value: unknown, digits = 1) => (typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : 'N/A');

function timeAgo(iso: string) {
  const hours = Math.round((Date.now() - new Date(iso).getTime()) / 3600000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function RangeChart({ result }: { result: SimulationResult }) {
  const p = result.percentiles!;
  const lo = Math.min(p.p5, result.stopLoss, result.currentPrice);
  const hi = Math.max(p.p95, result.stopLoss, result.currentPrice);
  const span = hi - lo || 1;
  const x = (v: number) => `${((v - lo) / span) * 100}%`;
  const width = (a: number, b: number) => `${((b - a) / span) * 100}%`;

  const markers = [
    // "Now" sits above the bar so it never collides with the nearby median label.
    { value: result.currentPrice, label: 'Now', cls: 'bg-on-surface', text: 'text-on-surface', above: true },
    { value: p.p50, label: 'Median', cls: 'bg-primary', text: 'text-primary', above: false },
    { value: result.stopLoss, label: 'Stop', cls: 'bg-error', text: 'text-error', above: false },
  ];

  return (
    <div className="pt-8 pb-10 px-2">
      <div className="relative h-8">
        <div className="absolute inset-y-3 left-0 right-0 rounded-full bg-surface-container-high" />
        <div className="absolute inset-y-2 rounded-full bg-primary/20" style={{ left: x(p.p10), width: width(p.p10, p.p90) }} />
        <div className="absolute inset-y-1 rounded-full bg-primary/45" style={{ left: x(p.p25), width: width(p.p25, p.p75) }} />
        {markers.map((m) => (
          <div key={m.label} className="absolute top-0 bottom-0 -translate-x-1/2" style={{ left: x(m.value) }}>
            <div className={cn('w-0.5 h-full mx-auto', m.cls)} />
            <p
              className={cn(
                'absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-bold',
                m.above ? 'bottom-full mb-1' : 'top-full mt-1',
                m.text,
              )}
            >
              {m.label} {inr(m.value)}
            </p>
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-on-surface-variant mt-8">
        <span>5% chance below {inr(p.p5)}</span>
        <span>5% chance above {inr(p.p95)}</span>
      </div>
      <div className="flex flex-wrap gap-4 mt-3 text-[11px] text-on-surface-variant">
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-primary/45" />50% of outcomes</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-primary/20" />80% of outcomes</span>
      </div>
    </div>
  );
}

export function SimulationDetails({ result }: { result: SimulationResult }) {
  const prob = result.probabilities!;
  const stock = result.stock;
  const scenario = result.scenario;
  const calibration = result.calibration;
  const bearish = result.direction === 'Bearish';

  const stats = [
    { label: 'Chance price is higher', value: pct(prob.up), icon: 'trending_up', cls: 'text-india-green' },
    { label: 'Chance stop-loss is hit', value: pct(prob.hit_stop), icon: 'shield', cls: 'text-error' },
    {
      label: bearish ? 'Chance it touches the lower 25% level' : 'Chance it touches the upper 25% level',
      value: pct(prob.reach_p75),
      icon: 'flag',
      cls: 'text-primary',
    },
    {
      label: calibration ? `Accuracy check (${calibration.tests} past tests)` : 'Accuracy check',
      value: calibration ? pct(calibration.inside_80pct_range) : 'N/A',
      icon: 'verified',
      cls: 'text-tertiary',
    },
  ];

  const facts: [string, string][] = stock
    ? [
        ['Sector', String(stock.sector ?? 'N/A')],
        ['P/E', num(stock.pe)],
        ['P/B', num(stock.pb, 2)],
        ['Market cap', typeof stock.market_cap_cr === 'number' ? `₹${stock.market_cap_cr.toLocaleString('en-IN')} Cr` : 'N/A'],
        ['RSI-14', num(stock.rsi_14, 0)],
        ['52-week range', `${inr(stock.week_52_low as number)} – ${inr(stock.week_52_high as number)}`],
        ['1-year return', typeof stock.return_1y === 'number' ? pct(stock.return_1y, 1) : 'N/A'],
        ['Volatility (annual)', typeof stock.annual_volatility === 'number' ? pct(stock.annual_volatility) : 'N/A'],
        ['Beta vs Nifty', num(stock.beta_vs_nifty, 2)],
        ['ROE', typeof stock.roe === 'number' ? pct(stock.roe, 1) : 'N/A'],
        [
          'Analyst target',
          typeof stock.analyst_target === 'number'
            ? `${inr(stock.analyst_target)} (${stock.analysts ?? '?'} analysts, ${String(stock.analyst_rating ?? '').replace('_', ' ')})`
            : 'N/A',
        ],
        ['Next results', String(stock.next_earnings_date ?? 'N/A')],
      ]
    : [];

  return (
    <div className="space-y-6">
      {/* Probability range */}
      <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 p-6">
        <div className="flex items-center justify-between gap-3 mb-1">
          <div className="flex items-center space-x-2">
            <span className="material-symbols-outlined text-primary text-[20px]">ssid_chart</span>
            <h4 className="font-headline font-bold text-on-surface">Where the price could be in {result.horizonDays} trading days</h4>
          </div>
        </div>
        <p className="text-xs text-on-surface-variant">From 4,000 simulations built on this stock&apos;s real daily moves.</p>
        <RangeChart result={result} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-xl bg-surface-container-low p-3">
              <span className={cn('material-symbols-outlined text-[18px]', stat.cls)}>{stat.icon}</span>
              <p className={cn('font-mono font-bold text-xl', stat.cls)}>{stat.value}</p>
              <p className="text-[11px] text-on-surface-variant leading-tight">{stat.label}</p>
            </div>
          ))}
        </div>
        {calibration && (
          <p className="text-xs text-on-surface-variant mt-3">
            <span className="font-semibold text-on-surface">How accurate is this?</span> We replayed the same method on {calibration.tests} past
            dates for this stock. The real price landed inside the predicted 80% range {pct(calibration.inside_80pct_range)} of the time
            {Math.abs(calibration.inside_80pct_range - 0.8) <= 0.08 ? ' — the ranges are well calibrated.' : ' — treat the range with extra caution.'}
          </p>
        )}
      </div>

      {/* Scenario assumption */}
      {scenario && (
        <div className="bg-saffron/5 rounded-2xl border border-saffron/20 p-5">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-saffron text-xl">tune</span>
            <div>
              <p className="font-headline font-bold text-on-surface text-sm">
                Scenario assumption: {scenario.title}{' '}
                <span className={cn('font-mono', scenario.shock_pct >= 0 ? 'text-india-green' : 'text-error')}>
                  {scenario.shock_pct >= 0 ? '+' : ''}{scenario.shock_pct.toFixed(1)}%
                </span>
                <span className="text-on-surface-variant font-normal"> · volatility ×{scenario.vol_multiplier.toFixed(2)}</span>
              </p>
              <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">{scenario.rationale}</p>
              <p className="text-[11px] text-on-surface-variant mt-1">
                {scenario.basis === 'ai'
                  ? 'Estimated by Gemma AI from your scenario text and capped at ±25%.'
                  : scenario.basis === 'preset'
                    ? 'A DhanSathi model assumption for this what-if, not a forecast that it will happen.'
                    : 'Fallback assumption.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* News */}
      <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center space-x-2">
            <span className="material-symbols-outlined text-primary text-[20px]">newspaper</span>
            <h4 className="font-headline font-bold text-on-surface">Latest news (last 30 days)</h4>
          </div>
          {result.newsSentiment != null && result.news?.length ? (
            <span
              className={cn(
                'text-xs font-bold px-2.5 py-1 rounded-lg',
                result.newsSentiment > 0.2 ? 'bg-india-green/15 text-india-green' : result.newsSentiment < -0.2 ? 'bg-error-container text-error' : 'bg-surface-container-high text-on-surface-variant',
              )}
            >
              News mood: {result.newsSentiment > 0.2 ? 'Positive' : result.newsSentiment < -0.2 ? 'Negative' : 'Mixed'}
            </span>
          ) : null}
        </div>
        {result.news?.length ? (
          <ul className="divide-y divide-outline-variant/15">
            {result.news.map((item) => (
              <li key={item.url} className="py-2.5 flex items-start gap-3">
                <span
                  className={cn(
                    'material-symbols-outlined text-[18px] mt-0.5',
                    item.impact === 'positive' ? 'text-india-green' : item.impact === 'negative' ? 'text-error' : 'text-on-surface-variant',
                  )}
                >
                  {item.impact === 'positive' ? 'arrow_upward' : item.impact === 'negative' ? 'arrow_downward' : 'remove'}
                </span>
                <div className="min-w-0">
                  <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-sm text-on-surface font-medium hover:text-primary hover:underline">
                    {item.title}
                  </a>
                  <p className="text-[11px] text-on-surface-variant">
                    {item.source} · {timeAgo(item.published)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-on-surface-variant">No news about this company in the last 30 days.</p>
        )}
        <p className="text-[11px] text-on-surface-variant mt-3">
          News is shown for context. Past headlines are usually already in the price, so they do not move the simulated range.
        </p>
      </div>

      {/* Live stock facts */}
      {facts.length > 0 && (
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 p-6">
          <div className="flex items-center space-x-2 mb-4">
            <span className="material-symbols-outlined text-primary text-[20px]">fact_check</span>
            <h4 className="font-headline font-bold text-on-surface">Live data used</h4>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {facts.map(([label, value]) => (
              <div key={label} className="rounded-xl bg-surface-container-low px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-on-surface-variant">{label}</p>
                <p className="text-sm font-semibold text-on-surface">{value}</p>
              </div>
            ))}
          </div>
          {result.methodology && <p className="text-xs text-on-surface-variant mt-4 leading-relaxed">{result.methodology}</p>}
          {!!result.dataSources?.length && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {result.dataSources.map((source) => (
                <li key={source} className="text-[11px] bg-surface-container-high text-on-surface-variant px-2 py-1 rounded-md">
                  {source}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
