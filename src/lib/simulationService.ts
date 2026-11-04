// ─── DhanMitra AI Simulation Service ──────────────────────────────────────────
// Thin client for /api/simulate (see api/simulate.js). The server pulls 5 years
// of real prices, live fundamentals and recent news, runs a Monte Carlo on the
// stock's own returns, and has Gemma explain the result. All numbers come from
// that maths; nothing here generates or templates a prediction.
// ──────────────────────────────────────────────────────────────────────────────

export interface SimulationRequest {
  symbol: string;
  exchange?: 'NSE' | 'BSE';
  scenarioId: string | null; // Preset scenario ID
  customScenario: string; // Custom scenario text
  horizon: '1 Day' | '1 Week' | '2 Weeks' | '1 Month' | '1 Year';
}

export interface SimulationNewsItem {
  title: string;
  source: string;
  url: string;
  published: string;
  impact: 'positive' | 'negative' | 'neutral' | null;
}

export interface SimulationScenario {
  title: string;
  shock_pct: number;
  vol_multiplier: number;
  shock_days: number;
  basis: 'preset' | 'ai' | 'fallback';
  rationale: string;
}

export interface SimulationResult {
  direction: 'Bullish' | 'Bearish' | 'Neutral';
  confidence: number; // probability (%) that the price ends on the called side
  priceRange: { low: number; high: number }; // 80% range (P10–P90)
  currentPrice: number;
  targetPrice: number; // median simulated price (P50)
  stopLoss: number; // 2 × ATR from current price
  expectedReturn: number; // mean simulated return, %
  riskReward: number;
  keyDrivers: string[];
  riskFactors: string[];
  timeline: { date: string; event: string }[];
  agentInsights: {
    technical: string;
    fundamental: string;
    institutional: string;
    macro: string;
    risk: string;
  };
  source: 'ai' | 'quant';
  hindiSummary: string;
  reasoning?: string;
  probabilities?: { up: number; hit_stop: number; reach_p75: number };
  percentiles?: Record<'p5' | 'p10' | 'p25' | 'p50' | 'p75' | 'p90' | 'p95', number>;
  horizonDays?: number;
  scenario?: SimulationScenario | null;
  news?: SimulationNewsItem[];
  newsSentiment?: number | null;
  calibration?: { tests: number; inside_80pct_range: number } | null;
  stock?: Record<string, string | number | boolean | null> & {
    symbol: string;
    name: string;
    exchange: string;
    price: number;
    as_of: string;
  };
  methodology?: string;
  dataSources?: string[];
}

export interface SimulationProgress {
  stage: string;
  percent: number;
  message: string;
}

const STAGES: { after: number; progress: SimulationProgress }[] = [
  { after: 0, progress: { stage: 'Fetching market data...', percent: 10, message: '5 years of daily prices from Yahoo Finance' } },
  { after: 2500, progress: { stage: 'Reading the news...', percent: 25, message: 'Google News headlines from the last 30 days' } },
  { after: 5000, progress: { stage: 'Running Monte Carlo...', percent: 45, message: "4,000 simulated paths from the stock's own history" } },
  { after: 8000, progress: { stage: 'Checking accuracy...', percent: 60, message: 'Replaying the model on past dates' } },
  { after: 11000, progress: { stage: 'DhanMitra AI explaining...', percent: 80, message: 'Gemma 4 is writing the analysis' } },
];

/** Run a simulation on the server. Throws with a readable message on failure. */
export async function runSimulation(
  request: SimulationRequest,
  onProgress?: (progress: SimulationProgress) => void,
  userProfile?: { state?: string; occupation?: string; annual_income?: number; category?: string } | null,
): Promise<SimulationResult> {
  const timers = STAGES.map(({ after, progress }) => setTimeout(() => onProgress?.(progress), after));
  try {
    const response = await fetch('/api/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...request, profile: userProfile ?? undefined }),
      signal: AbortSignal.timeout(70000),
    });
    const data = (await response.json().catch(() => ({}))) as SimulationResult & { error?: string };
    if (!response.ok || data.error) {
      throw new Error(data.error || `Simulation failed (HTTP ${response.status}). Please try again.`);
    }
    onProgress?.({ stage: 'Complete', percent: 100, message: 'Simulation ready' });
    return data;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new Error('The simulation took too long. Please try again in a minute.');
    }
    throw error;
  } finally {
    timers.forEach(clearTimeout);
  }
}

/** The server engine is always available; the AI explanation is best-effort. */
export function isAIModeAvailable(): boolean {
  return true;
}
