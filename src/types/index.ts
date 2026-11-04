// ─── User & Auth ────────────────────────────────────────────────────────────

export type SubscriptionPlan = 'free' | 'pro';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string;
  phone?: string;
  date_of_birth?: string;
  gender?: 'male' | 'female' | 'other';
  state?: string;
  district?: string;
  pincode?: string;
  category?: 'general' | 'obc' | 'sc' | 'st' | 'ews';
  occupation?: string;
  annual_income?: number;
  is_bpl?: boolean;
  has_disability?: boolean;
  // Existing education fields
  education_level?: 'school' | 'diploma' | 'graduation' | 'postgraduation' | 'phd' | 'technical' | 'abroad';
  current_course?: string;
  institution_name?: string;
  current_year?: string;
  last_exam_percentage?: number;
  is_hosteller?: boolean;
  
  // New extended student & demographic fields
  stream?: string;
  board_university?: string;
  passing_year?: string;
  institution_type?: 'government' | 'private' | 'aided';
  parent_occupation?: string;
  is_minority?: boolean;
  is_farmer_family?: boolean;
  is_orphan_single_parent?: boolean;
  is_ex_serviceman_family?: boolean;

  // Document Readiness flags
  has_income_certificate?: boolean;
  has_caste_certificate?: boolean;
  has_domicile_certificate?: boolean;
  is_aadhaar_bank_linked?: boolean;

  // Base IDs
  pan_number?: string;
  aadhaar_last_four?: string;
  plan: SubscriptionPlan;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Government Schemes ─────────────────────────────────────────────────────

export interface EligibilityCriteria {
  min_age?: number;
  max_age?: number;
  states?: string[];
  categories?: string[];
  max_income?: number;
  occupations?: string[];
  gender?: 'male' | 'female' | 'any';
  is_bpl?: boolean;
}

export type SchemeStatus = 'active' | 'closed' | 'upcoming';
export type SchemeType = 'central' | 'state';

export interface GovernmentScheme {
  id: string;
  name: string;
  name_hi?: string;
  description: string;
  description_hi?: string;
  ministry: string;
  type: SchemeType;
  state?: string;
  benefits: string;
  eligibility_criteria: EligibilityCriteria;
  application_url?: string;
  documents_required: string[];
  status: SchemeStatus;
  deadline?: string;
  scheme_categories?: string[];
  tags?: string[];
  short_title?: string;
  scheme_for?: string;
  source?: string;
  source_url?: string;
  slug?: string;
  is_new?: boolean;
  first_seen_at?: string;
  last_seen_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface SchemeMatch {
  scheme: GovernmentScheme;
  score: number;
  eligibility: 'eligible' | 'maybe' | 'not_eligible';
  reasons: string[];
  missingCriteria: string[];
  missingDocuments?: string[];
}

// ─── Scholarships ─────────────────────────────────────────────────────────────

export interface StructuredScholarship {
  id: string;
  name: string;
  provider: string; // e.g. "NSP", "Buddy4Study"
  description: string;
  eligibility: {
    min_marks?: number;
    max_income?: number;
    course_level?: string[]; // e.g. ["graduation", "postgraduation"]
    categories?: string[]; // e.g. ["sc", "st", "obc"]
    gender?: 'male' | 'female' | 'any';
    states?: string[];
  };
  benefits: string;
  deadline?: string;
  application_url?: string;
  documents_required?: string[];
}

// ─── Stock Market ───────────────────────────────────────────────────────────

export type StockSignal = 'strong_buy' | 'buy' | 'hold' | 'sell' | 'strong_sell';
export type StockPreset = 'all' | 'nifty50' | 'watchlist' | 'gainers' | 'losers' | 'high_volume' | 'oversold' | 'overbought';

export interface StockData {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  currency?: string;
  exchange?: string;
  change: number;
  change_pct: number;
  volume: number;
  avg_volume: number;
  delivery_pct: number;
  market_cap: number;
  pe_ratio: number;
  week_52_high: number;
  week_52_low: number;
  rsi_14: number;
  sma_20: number;
  sma_50: number;
  sma_200: number;
  signal: StockSignal;
  updated_at: string;
  data_source?: string;
  data_quality?: 'live' | 'partial' | 'estimated';
  delivery_source?: 'exchange' | 'unavailable' | 'estimated';
  signal_source?: 'live_history' | 'partial_history' | 'estimated';
  as_of?: string;
  warning?: string;
}

export interface StockAlert {
  id: string;
  user_id: string;
  symbol: string;
  condition: 'above' | 'below';
  target_price: number;
  triggered: boolean;
  created_at: string;
}

// ─── DhanMitra AI Simulation ────────────────────────────────────────────────

export type SimulationStatus = 'queued' | 'running' | 'completed' | 'failed';
export type ScenarioType = 'bull' | 'bear' | 'black_swan' | 'custom';

export interface SimulationResult {
  projected_price: number;
  confidence_interval: [number, number];
  risk_score: number;
  key_factors: string[];
  timeline: { date: string; price: number; event?: string }[];
}

export interface Simulation {
  id: string;
  user_id: string;
  ticker: string;
  scenario_type: ScenarioType;
  description: string;
  horizon_days: number;
  status: SimulationStatus;
  progress: number;
  result?: SimulationResult;
  created_at: string;
  completed_at?: string;
}

// ─── Notifications ──────────────────────────────────────────────────────────

export type NotificationType = 'scheme' | 'stock_alert' | 'simulation' | 'system' | 'subscription';

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  action_url?: string;
  created_at: string;
}

// ─── Subscription & Plan Limits ─────────────────────────────────────────────

export interface PlanLimits {
  schemes_per_month: number;
  stock_alerts: number;
  simulations_per_month: number;
  watchlist_size: number;
  export_reports: boolean;
  ai_insights: boolean;
  priority_support: boolean;
}
