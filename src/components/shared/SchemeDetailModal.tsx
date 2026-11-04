import { useEffect, useState, type ReactNode } from 'react';
import { Markdown } from '@/components/shared/Markdown';
import { askAI } from '@/lib/aiClient';
import { cn } from '@/lib/utils';
import { useLanguageStore } from '@/stores/languageStore';

export interface SchemeDetail {
  slug: string;
  name: string;
  level?: string | null;
  scheme_type?: string | null;
  ministry?: string | null;
  department?: string | null;
  state?: string | null;
  implementing_agency?: string | null;
  categories: string[];
  tags: string[];
  target_beneficiaries: string[];
  open_date?: string | null;
  close_date?: string | null;
  is_closed?: boolean;
  description_md: string;
  benefits_md: string;
  exclusions_md: string;
  eligibility_md: string;
  documents_md: string;
  application_process: { mode: string; url: string | null; process_md: string }[];
  references: { title: string; url: string }[];
  official_url: string;
}

/** What the card already knows, shown when there is no myScheme page. */
export interface SchemeDetailFallback {
  description?: string;
  benefits?: string;
  eligibility?: string;
  documents?: string[];
  deadline?: string;
  department?: string;
  tags?: string[];
}

interface Props {
  title: string;
  slug?: string;
  applyUrl?: string;
  fallback?: SchemeDetailFallback;
  onClose: () => void;
}

const detailCache = new Map<string, SchemeDetail>();

async function loadDetail(slug: string): Promise<SchemeDetail> {
  const cached = detailCache.get(slug);
  if (cached) return cached;
  const response = await fetch(`/api/scheme-detail?slug=${encodeURIComponent(slug)}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Could not load details (HTTP ${response.status})`);
  detailCache.set(slug, data as SchemeDetail);
  return data as SchemeDetail;
}

function formatDate(value?: string | null) {
  if (!value) return null;
  return new Date(`${value}T00:00:00+05:30`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function buildAiPrompt(title: string, detail: SchemeDetail | null, fallback: SchemeDetailFallback | undefined, hindi: boolean) {
  const facts = detail
    ? [
        `Name: ${detail.name}`,
        detail.ministry && `Ministry: ${detail.ministry}`,
        detail.state && `State: ${detail.state}`,
        detail.close_date && `Closes on: ${detail.close_date}`,
        `About:\n${detail.description_md}`,
        detail.benefits_md && `Benefits:\n${detail.benefits_md}`,
        detail.eligibility_md && `Eligibility:\n${detail.eligibility_md}`,
        detail.exclusions_md && `Not eligible:\n${detail.exclusions_md}`,
        detail.documents_md && `Documents:\n${detail.documents_md}`,
        detail.application_process.length &&
          `How to apply:\n${detail.application_process.map((step) => `${step.mode}: ${step.process_md}`).join('\n')}`,
      ]
    : [
        `Name: ${title}`,
        fallback?.department && `Department: ${fallback.department}`,
        fallback?.description && `About: ${fallback.description}`,
        fallback?.benefits && `Benefits: ${fallback.benefits}`,
        fallback?.eligibility && `Eligibility: ${fallback.eligibility}`,
        fallback?.documents?.length && `Documents: ${fallback.documents.join(', ')}`,
        fallback?.deadline && `Deadline: ${fallback.deadline}`,
      ];

  const language = hindi ? 'simple Hindi (Devanagari script)' : 'simple English';
  return [
    `You are DhanSathi, helping an ordinary Indian citizen understand a government scheme. Answer in ${language}.`,
    'Use exactly these four short sections with bold headings: What you get, Who can apply, Documents needed, How to apply.',
    'Use only the facts below. Never invent amounts, dates or rules. If a section has no facts, say to check the official portal.',
    'Keep it under 170 words. End with one line reminding them to apply only on the official government website.',
    '',
    facts.filter(Boolean).join('\n\n').slice(0, 7000),
  ].join('\n');
}

function Section({ icon, title, children }: { icon: string; title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 font-headline font-bold text-on-surface">
        <span className="material-symbols-outlined text-lg text-primary">{icon}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

export function SchemeDetailModal({ title, slug, applyUrl, fallback, onClose }: Props) {
  const lang = useLanguageStore((s) => s.lang);
  const [detail, setDetail] = useState<SchemeDetail | null>(slug ? detailCache.get(slug) ?? null : null);
  const [loading, setLoading] = useState(!!slug && !detail);
  const [error, setError] = useState<string | null>(null);
  const [aiHindi, setAiHindi] = useState(lang === 'hi');
  const [aiText, setAiText] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug || detailCache.has(slug)) return;
    let mounted = true;
    loadDetail(slug)
      .then((data) => mounted && setDetail(data))
      .catch((err) => mounted && setError(err instanceof Error ? err.message : 'Could not load details.'))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [slug]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const explainWithAI = async (hindi: boolean) => {
    setAiHindi(hindi);
    const cacheKey = `dhansathi-ai-explain:${slug || title}:${hindi ? 'hi' : 'en'}`;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        setAiText(cached);
        setAiError(null);
        return;
      }
    } catch {
      // sessionStorage unavailable (private mode) — just call the model.
    }

    setAiLoading(true);
    setAiError(null);
    try {
      const text = await askAI(buildAiPrompt(title, detail, fallback, hindi));
      setAiText(text);
      try {
        sessionStorage.setItem(cacheKey, text);
      } catch {
        // ignore quota errors
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI is busy right now. Please try again.');
    } finally {
      setAiLoading(false);
    }
  };

  const officialUrl = detail?.official_url || applyUrl;
  const portalUrl = detail?.application_process.find((step) => step.url)?.url || applyUrl;
  const closeDate = formatDate(detail?.close_date || fallback?.deadline);

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="bg-surface-container-lowest w-full sm:max-w-3xl max-h-[92vh] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 md:p-6 border-b border-outline-variant/20 bg-gradient-to-r from-primary-fixed/60 via-surface-container-lowest to-tertiary-fixed/40">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap gap-2 mb-2">
                {detail?.level && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-primary-fixed text-primary">{detail.level}</span>
                )}
                {detail?.state && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-tertiary-fixed text-tertiary">{detail.state}</span>
                )}
                {detail?.categories.slice(0, 2).map((category) => (
                  <span key={category} className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-surface-container-high text-on-surface-variant">
                    {category}
                  </span>
                ))}
                {detail?.is_closed && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-error-container text-error">Closed</span>
                )}
              </div>
              <h2 className="font-headline font-bold text-xl md:text-2xl text-on-surface leading-snug">{detail?.name || title}</h2>
              {(detail?.ministry || fallback?.department) && (
                <p className="text-xs text-on-surface-variant mt-1">
                  {[detail?.ministry || fallback?.department, detail?.department].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="shrink-0 w-10 h-10 rounded-full bg-surface-container-high hover:bg-surface-container-highest flex items-center justify-center"
              aria-label="Close"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
          {closeDate && (
            <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-on-surface bg-surface-container-lowest/80 px-3 py-1.5 rounded-lg">
              <span className="material-symbols-outlined text-sm text-secondary">event</span>
              {detail?.is_closed ? 'Closed on' : 'Last date'}: {closeDate}
            </p>
          )}
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-5 md:p-6 space-y-6">
          {/* AI explain */}
          <div className="rounded-2xl border border-primary/20 bg-primary-fixed/30 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">auto_awesome</span>
                <p className="font-headline font-bold text-on-surface text-sm">Samjhiye aasaan bhasha mein</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => explainWithAI(true)}
                  disabled={aiLoading || loading}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-50',
                    aiText && aiHindi ? 'bg-primary text-on-primary' : 'bg-surface-container-lowest text-primary border border-primary/30',
                  )}
                >
                  हिंदी में समझाएं
                </button>
                <button
                  onClick={() => explainWithAI(false)}
                  disabled={aiLoading || loading}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-50',
                    aiText && !aiHindi ? 'bg-primary text-on-primary' : 'bg-surface-container-lowest text-primary border border-primary/30',
                  )}
                >
                  Explain in English
                </button>
              </div>
            </div>
            {aiLoading && (
              <p className="flex items-center gap-2 text-xs text-on-surface-variant">
                <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
                DhanSathi AI is reading the official scheme page…
              </p>
            )}
            {aiError && <p className="text-xs text-error">{aiError}</p>}
            {aiText && !aiLoading && <Markdown text={aiText} />}
            {!aiText && !aiLoading && !aiError && (
              <p className="text-xs text-on-surface-variant">
                Get a short summary of benefits, eligibility, documents and steps — generated from the official page.
              </p>
            )}
          </div>

          {loading && (
            <div className="space-y-3 animate-pulse">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 rounded-xl bg-surface-container-high" />
              ))}
            </div>
          )}

          {error && (
            <p className="text-sm text-error bg-error-container/50 rounded-xl p-3">
              {error} You can still open the official page below.
            </p>
          )}

          {detail ? (
            <>
              {detail.description_md && (
                <Section icon="info" title="About the scheme">
                  <Markdown text={detail.description_md} />
                </Section>
              )}
              {detail.benefits_md && (
                <Section icon="redeem" title="Benefits">
                  <Markdown text={detail.benefits_md} />
                </Section>
              )}
              {detail.eligibility_md && (
                <Section icon="how_to_reg" title="Eligibility">
                  <Markdown text={detail.eligibility_md} />
                </Section>
              )}
              {detail.exclusions_md && (
                <Section icon="block" title="Who is not eligible">
                  <Markdown text={detail.exclusions_md} />
                </Section>
              )}
              {detail.documents_md && (
                <Section icon="description" title="Documents required">
                  <Markdown text={detail.documents_md} />
                </Section>
              )}
              {detail.application_process.length > 0 && (
                <Section icon="checklist" title="How to apply">
                  <div className="space-y-4">
                    {detail.application_process.map((step, index) => (
                      <div key={index} className="rounded-xl bg-surface-container-low p-4 space-y-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-primary">{step.mode}</p>
                        <Markdown text={step.process_md} />
                      </div>
                    ))}
                  </div>
                </Section>
              )}
              {detail.references.length > 0 && (
                <Section icon="link" title="Official references">
                  <ul className="space-y-1">
                    {detail.references.map((ref) => (
                      <li key={ref.url}>
                        <a href={ref.url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary font-semibold hover:underline">
                          {ref.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
            </>
          ) : (
            !loading &&
            fallback && (
              <>
                {fallback.description && (
                  <Section icon="info" title="About">
                    <p className="text-sm text-on-surface-variant leading-relaxed">{fallback.description}</p>
                  </Section>
                )}
                {fallback.benefits && (
                  <Section icon="redeem" title="Benefits">
                    <p className="text-sm text-on-surface-variant leading-relaxed">{fallback.benefits}</p>
                  </Section>
                )}
                {fallback.eligibility && (
                  <Section icon="how_to_reg" title="Eligibility">
                    <p className="text-sm text-on-surface-variant leading-relaxed">{fallback.eligibility}</p>
                  </Section>
                )}
                {!!fallback.documents?.length && (
                  <Section icon="description" title="Documents usually required">
                    <ul className="list-disc pl-5 text-sm text-on-surface-variant space-y-1">
                      {fallback.documents.map((doc) => (
                        <li key={doc}>{doc}</li>
                      ))}
                    </ul>
                  </Section>
                )}
              </>
            )
          )}

          <div className="rounded-xl bg-error-container/40 p-3 flex items-start gap-2">
            <span className="material-symbols-outlined text-sm text-error mt-0.5">warning</span>
            <p className="text-[11px] text-on-surface leading-snug">
              Apply only on the official government website. Never share OTP, Aadhaar password or bank PIN with anyone.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-outline-variant/20 flex flex-col sm:flex-row gap-2">
          {officialUrl && (
            <a
              href={officialUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 inline-flex items-center justify-center gap-2 bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-bold text-sm px-4 py-3 rounded-xl"
            >
              <span className="material-symbols-outlined text-lg">article</span>
              Official scheme page
            </a>
          )}
          {portalUrl && (
            <a
              href={portalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary-container text-on-primary font-bold text-sm px-4 py-3 rounded-xl"
            >
              <span className="material-symbols-outlined text-lg">open_in_new</span>
              Apply on official portal
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
