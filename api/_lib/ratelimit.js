// Per-IP rate limiting for the public API routes.
//
// This is an in-memory token bucket kept per serverless instance. It needs no
// extra infrastructure and instantly throttles a client that floods one
// instance — which is what casual abuse and most scripts do. It is NOT a hard
// distributed guarantee: Vercel may run several instances, and a cold start
// resets the counters. For strict global limits, point `hit()` at a shared
// store (Vercel KV / Upstash Redis, or a Supabase SECURITY DEFINER function) —
// the rest of the code does not change.

const buckets = new Map(); // key -> { count, resetAt }
let lastSweep = 0;

function sweep(now) {
  if (now - lastSweep < 60000) return;
  lastSweep = now;
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key);
  }
}

/** Best-effort client identifier. Vercel sets x-forwarded-for to the real IP. */
export function clientId(req) {
  const fwd = req.headers['x-forwarded-for'];
  const ip = (Array.isArray(fwd) ? fwd[0] : fwd || '').split(',')[0].trim();
  return ip || req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

/**
 * Fixed-window counter. Returns { ok, remaining, retryAfter }.
 * `limit` requests are allowed per `windowMs` for each (route, client).
 */
export function hit(route, id, limit, windowMs) {
  const now = Date.now();
  sweep(now);
  const key = `${route}:${id}`;
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfter: 0 };
  }
  if (bucket.count >= limit) {
    return { ok: false, remaining: 0, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  bucket.count += 1;
  return { ok: true, remaining: limit - bucket.count, retryAfter: 0 };
}

/**
 * Guard a handler. Returns true if the request may proceed; otherwise it has
 * already written a 429 response and the caller should return.
 *
 *   if (!rateLimit(req, res, { route: 'ai', limit: 20, windowMs: 60000 })) return;
 */
export function rateLimit(req, res, { route, limit, windowMs = 60000 }) {
  const result = hit(route, clientId(req), limit, windowMs);
  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, result.remaining)));
  if (result.ok) return true;
  res.setHeader('Retry-After', String(result.retryAfter));
  res.status(429).json({ error: `Too many requests. Try again in ${result.retryAfter}s.` });
  return false;
}
