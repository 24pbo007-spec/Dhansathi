// Ask DhanSathi chat endpoint — self-hosted Gemma 4 E4B only.
// Accepts OpenAI-style { messages } and returns an OpenAI-style chat
// completion, so the frontend parser stays simple. If Gemma is unreachable,
// a short rule-based answer is returned instead of an error.

import { callGemma, messagesToPrompt } from './_lib/gemma.js';
import { rateLimit } from './_lib/ratelimit.js';
import { classifyTopic, offTopicReply, SCOPE_RULE } from './_lib/scope.js';

export const config = {
  maxDuration: 60,
};

const GEMMA_MODEL_LABEL = 'gemma-4-e4b-selfhosted';
const GEMMA_TIMEOUT_MS = 55000;

function getLastUserMessage(messages = []) {
  const last = [...messages].reverse().find((message) => message?.role === 'user');
  return typeof last?.content === 'string' ? last.content : '';
}

function getLiveStockContext(messages = []) {
  const joined = messages
    .map((message) => typeof message?.content === 'string' ? message.content : '')
    .join('\n');
  const marker = 'DhanSathi live stock context:';
  const index = joined.lastIndexOf(marker);
  if (index === -1) return null;

  const context = joined.slice(index).split('\n').slice(0, 16);
  const fields = {};
  for (const line of context) {
    const [key, ...rest] = line.split(':');
    if (!rest.length) continue;
    fields[key.trim().toLowerCase()] = rest.join(':').trim();
  }
  return Object.keys(fields).length ? fields : null;
}

function buildStockFallbackAnswer(messages) {
  const stock = getLiveStockContext(messages);
  if (!stock) {
    return [
      'Here is a practical DhanSathi market view you can use while live AI is busy.',
      '',
      'I could not identify live stock data in this request. Ask with a clear NSE symbol or company name, for example: "explain RELIANCE stock" or "TCS RSI signal".',
      '',
      'For any stock, confirm CMP, volume, delivery percentage, trend, RSI, support/resistance, stop-loss and position size before acting. This is educational, not guaranteed profit.',
    ].join('\n');
  }

  return [
    `${stock.company || stock.symbol || 'Stock'} (${stock.symbol || 'symbol unavailable'}) stock view`,
    '',
    `- CMP: ${stock.cmp || 'N/A'}`,
    `- Change: ${stock.change || 'N/A'}`,
    `- Volume: ${stock.volume || 'N/A'}`,
    `- Delivery %: ${stock['delivery percentage'] || 'N/A'}`,
    `- RSI 14: ${stock['rsi 14'] || 'N/A'}`,
    `- SMA 20/50/200: ${stock['sma 20/50/200'] || 'N/A'}`,
    `- DhanSathi signal: ${stock['dhansathi signal'] || 'N/A'}`,
    '',
    'Interpretation:',
    '- If price is above SMA20 and SMA50 with healthy RSI, trend is constructive.',
    '- If price is below SMA20 or RSI is weak, wait for confirmation instead of chasing.',
    '- Delivery data is shown only when the provider supplies exchange delivery percentage.',
    '',
    'Trading discipline:',
    '- Decide entry, stop-loss, target and position size before placing any trade.',
    '- Avoid averaging down blindly; no signal is 100% guaranteed.',
    '',
    'This is educational stock analysis, not financial advice.',
  ].join('\n');
}

function buildServerFallbackAnswer(messages) {
  const question = getLastUserMessage(messages).toLowerCase();

  if (question.includes('salary') || question.includes('income') || question.includes('scheme')) {
    return [
      'Based on the details you shared, I can still help you with a practical DhanSathi check.',
      '',
      'For government schemes, match eligibility mainly by state, age, category, occupation, annual income, and BPL status. If your annual income is around ₹5,00,000 and you are in Uttar Pradesh, first check central schemes such as Ayushman Bharat/PM-JAY eligibility, PM Suraksha Bima Yojana, PM Jeevan Jyoti Bima Yojana, Atal Pension Yojana if applicable, and Uttar Pradesh state welfare schemes based on your category and occupation.',
      '',
      'For savings, keep an emergency fund first, then consider SIP or recurring deposits according to your risk capacity. Do not invest all surplus in stocks; keep position sizes small and use stop-loss discipline.',
    ].join('\n');
  }

  if (question.includes('stock') || question.includes('trade') || question.includes('rsi') || question.includes('signal')) {
    return buildStockFallbackAnswer(messages);
  }

  return [
    'I can help with government schemes, savings, budgeting, SIP planning, and educational stock analysis.',
    '',
    'Tell me your state, occupation, annual income, age, category, and goal, and I will narrow the answer into clear next steps.',
  ].join('\n');
}

function sendServerFallback(res, messages, failures) {
  res.status(200);
  res.setHeader('content-type', 'application/json');
  res.setHeader('x-dhansathi-model-used', 'dhansathi-server-fallback');
  res.setHeader('x-dhansathi-ai-failures', failures.slice(0, 2).join(' | ').slice(0, 500));
  res.json({
    id: `dhansathi-fallback-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: 'dhansathi-server-fallback',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: buildServerFallbackAnswer(messages),
          reasoning_content: '',
        },
        finish_reason: 'stop',
      },
    ],
  });
}

/** Reply without calling the model (used for off-topic requests). */
function sendDirectReply(res, content, label) {
  res.status(200);
  res.setHeader('content-type', 'application/json');
  res.setHeader('x-dhansathi-model-used', label);
  res.json({
    id: `${label}-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: label,
    choices: [{ index: 0, message: { role: 'assistant', content, reasoning_content: '' }, finish_reason: 'stop' }],
  });
}

function wantsJson(body) {
  if (body.response_format?.type === 'json_object') return true;
  return (body.messages || []).some(
    (message) => message.role === 'system' && /only valid json/i.test(String(message.content || '')),
  );
}

// Gemma's reply wrapped in the OpenAI chat-completion shape the frontend parses.
async function callGemmaChat(body) {
  const text = await callGemma(messagesToPrompt(body.messages), {
    json: wantsJson(body),
    timeoutMs: GEMMA_TIMEOUT_MS,
  });
  const payload = {
    id: `gemma-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: GEMMA_MODEL_LABEL,
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: text, reasoning_content: '' },
        finish_reason: 'stop',
      },
    ],
  };
  return {
    ok: true,
    status: 200,
    contentType: 'application/json',
    payload: Buffer.from(JSON.stringify(payload)),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!rateLimit(req, res, { route: 'chat', limit: 20, windowMs: 60000 })) return;

  const body = { ...(req.body || {}) };
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const question = getLastUserMessage(messages);

  // Clearly off-topic (code, stories, movies, cricket…): refuse without calling the model.
  if (classifyTopic(question) === 'off') {
    sendDirectReply(res, offTopicReply(question), 'dhansathi-scope-guard');
    return;
  }

  // Everything else goes to the model with the scope rule first, so it also
  // declines off-topic requests the keyword check could not recognise.
  body.messages = [{ role: 'system', content: SCOPE_RULE }, ...messages];

  try {
    const upstream = await callGemmaChat(body);
    res.status(200);
    res.setHeader('content-type', upstream.contentType);
    res.setHeader('x-dhansathi-model-used', GEMMA_MODEL_LABEL);
    res.send(upstream.payload);
  } catch (error) {
    sendServerFallback(res, body.messages || [], [error instanceof Error ? error.message : String(error)]);
  }
}
