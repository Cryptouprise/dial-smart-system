/**
 * Lithos (OpenAI-compatible) LLM helper for edge functions.
 *
 * Style reference: _shared/openrouter.ts (fetch + JSON mode + fenced-JSON
 * cleanup). Differences: one fixed endpoint, a hard AbortController deadline,
 * and token/latency accounting returned to the caller so coach-suggest can
 * store model/prompt_tokens/completion_tokens/latency_ms on each proposal.
 *
 * Env:
 *   LITHOS_API_KEY   required
 *   LITHOS_BASE_URL  optional, default https://api.lithosai.cloud/v1
 */

export const LITHOS_DEFAULT_BASE_URL = 'https://api.lithosai.cloud/v1';
export const LITHOS_DEFAULT_MODEL = 'deepseek-ai/DeepSeek-V4.1-Flash-fast';

export interface ChatJSONOptions {
  max_tokens?: number;
  timeout_ms?: number;
  temperature?: number;
  model?: string;
}

export interface ChatJSONResult<T> {
  data: T;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  latency_ms: number;
}

export class LithosError extends Error {
  constructor(message: string, public status: number = 0) {
    super(message);
    this.name = 'LithosError';
  }
}

interface AttemptResult {
  ok: boolean;
  status: number;
  payload?: Record<string, unknown>;
  errText?: string;
}

async function attempt(
  url: string,
  apiKey: string,
  body: Record<string, unknown>,
  signal: AbortSignal,
): Promise<AttemptResult> {
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => 'unknown');
    return { ok: false, status: resp.status, errText };
  }
  const payload = (await resp.json().catch(() => null)) as Record<string, unknown> | null;
  if (!payload) return { ok: false, status: resp.status, errText: 'non-JSON response body' };
  return { ok: true, status: resp.status, payload };
}

function extractContent(payload: Record<string, unknown>): string | undefined {
  const choices = payload?.choices as Array<{ message?: { content?: unknown } }> | undefined;
  const content = choices?.[0]?.message?.content;
  return typeof content === 'string' ? content : undefined;
}

/**
 * One system + one user message, JSON-mode, parsed. Throws LithosError on any
 * failure (missing key, HTTP error, timeout, empty or unparsable content).
 * The caller decides how to degrade; coach-suggest returns {proposals: []}.
 */
export async function chatJSON<T = Record<string, unknown>>(
  system: string,
  user: string,
  options: ChatJSONOptions = {},
): Promise<ChatJSONResult<T>> {
  const apiKey = Deno.env.get('LITHOS_API_KEY');
  if (!apiKey) throw new LithosError('LITHOS_API_KEY is not configured');

  const baseUrl = (Deno.env.get('LITHOS_BASE_URL') || LITHOS_DEFAULT_BASE_URL).replace(/\/+$/, '');
  const url = `${baseUrl}/chat/completions`;
  const model = options.model || LITHOS_DEFAULT_MODEL;
  const maxTokens = options.max_tokens ?? 900;
  const timeoutMs = options.timeout_ms ?? 6000;
  const temperature = options.temperature ?? 0.2;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  const baseBody: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature,
    max_tokens: maxTokens,
  };

  try {
    let result = await attempt(url, apiKey, { ...baseBody, response_format: { type: 'json_object' } }, controller.signal);

    // Some OpenAI-compatible gateways reject response_format for some models.
    // Retry once without it, inside the same deadline; the prompt already
    // demands strict JSON.
    if (!result.ok && result.status === 400 && /response_format|json_object/i.test(result.errText ?? '')) {
      result = await attempt(url, apiKey, baseBody, controller.signal);
    }

    if (!result.ok || !result.payload) {
      throw new LithosError(
        `Lithos LLM failed (${result.status}): ${(result.errText ?? 'unknown').substring(0, 300)}`,
        result.status,
      );
    }

    const content = extractContent(result.payload);
    if (!content) throw new LithosError('Lithos LLM returned empty content', result.status);

    let cleaned = content.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    }
    // Tolerate a leading/trailing sentence around the JSON object.
    if (!cleaned.startsWith('{')) {
      const first = cleaned.indexOf('{');
      const last = cleaned.lastIndexOf('}');
      if (first >= 0 && last > first) cleaned = cleaned.slice(first, last + 1);
    }

    let parsed: T;
    try {
      parsed = JSON.parse(cleaned) as T;
    } catch {
      throw new LithosError(`Failed to parse Lithos JSON: ${cleaned.substring(0, 200)}`, result.status);
    }

    const usage = (result.payload.usage ?? {}) as Record<string, unknown>;
    return {
      data: parsed,
      model: typeof result.payload.model === 'string' ? result.payload.model : model,
      prompt_tokens: Number(usage.prompt_tokens ?? 0) || 0,
      completion_tokens: Number(usage.completion_tokens ?? 0) || 0,
      latency_ms: Date.now() - startedAt,
    };
  } catch (err) {
    if (err instanceof LithosError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new LithosError(`Lithos LLM timed out after ${timeoutMs} ms`, 0);
    }
    throw new LithosError(err instanceof Error ? err.message : String(err), 0);
  } finally {
    clearTimeout(timer);
  }
}
