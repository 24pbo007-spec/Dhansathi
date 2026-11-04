// Thin server-side proxy to the Gemma endpoint, so the browser never needs to
// know where the model is hosted. POST { prompt, json? } -> { text }.

import { callGemma } from './_lib/gemma.js';
import { rateLimit } from './_lib/ratelimit.js';

export const config = { maxDuration: 60 };

const MAX_PROMPT_CHARS = 12000;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!rateLimit(req, res, { route: 'ai', limit: 20, windowMs: 60000 })) return;

  const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });
  if (prompt.length > MAX_PROMPT_CHARS) {
    return res.status(413).json({ error: `prompt must be under ${MAX_PROMPT_CHARS} characters` });
  }

  try {
    const text = await callGemma(prompt, { json: req.body?.json === true, timeoutMs: 50000 });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ text, model: 'gemma-4-e4b' });
  } catch (error) {
    return res.status(502).json({ error: error.message || 'AI request failed' });
  }
}
