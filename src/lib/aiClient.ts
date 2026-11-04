// Client for the self-hosted Gemma model, reached through the /api/ai proxy.

export async function askAI(prompt: string, options: { json?: boolean; signal?: AbortSignal } = {}): Promise<string> {
  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, json: options.json === true }),
    signal: options.signal ?? AbortSignal.timeout(60000),
  });

  const data = (await response.json().catch(() => ({}))) as { text?: string; error?: string };
  if (!response.ok || !data.text) {
    throw new Error(data.error || `AI request failed (HTTP ${response.status})`);
  }
  return data.text;
}
