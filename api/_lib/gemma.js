// Self-hosted Gemma 4 E4B, exposed as a Supabase Edge Function.
// Contract: POST { prompt: string, json?: boolean } -> { text: string }.
// GEMMA_AI_URL overrides the endpoint if it ever moves.

export const GEMMA_AI_URL =
  process.env.GEMMA_AI_URL || 'https://ljxoyygsyiqnmndyhrhc.supabase.co/functions/v1/ai';

const MAX_PROMPT_CHARS = 24000;

/** Flatten OpenAI-style chat messages into the single prompt Gemma takes. */
export function messagesToPrompt(messages = []) {
  const parts = [];
  for (const message of messages) {
    const content = Array.isArray(message.content)
      ? message.content.map((part) => part?.text || '').join('\n')
      : String(message.content || '');
    if (!content.trim()) continue;
    const role = message.role === 'system' ? 'Instructions' : message.role === 'assistant' ? 'Assistant' : 'User';
    parts.push(`${role}:\n${content.trim()}`);
  }
  let prompt = `${parts.join('\n\n')}\n\nAssistant:`;
  // Keep the instructions and the latest turns if a long chat overflows.
  if (prompt.length > MAX_PROMPT_CHARS) {
    prompt = `${prompt.slice(0, MAX_PROMPT_CHARS / 2)}\n...\n${prompt.slice(-MAX_PROMPT_CHARS / 2)}`;
  }
  return prompt;
}

export async function callGemma(prompt, { json = false, timeoutMs = 30000 } = {}) {
  const response = await fetch(GEMMA_AI_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt, ...(json ? { json: true } : {}) }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`Gemma HTTP ${response.status}: ${raw.slice(0, 160)}`);

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`Gemma returned non-JSON: ${raw.slice(0, 160)}`);
  }
  const text = typeof data.text === 'string' ? data.text.trim() : '';
  if (!text) throw new Error(`Gemma returned no text: ${raw.slice(0, 160)}`);
  return text;
}
