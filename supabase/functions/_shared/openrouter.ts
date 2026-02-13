/**
 * OpenRouter LLM Integration
 *
 * Shared helper for making LLM calls via OpenRouter.
 * Supports model selection by task tier (cheap/medium/premium).
 * Falls back to Lovable AI gateway if OpenRouter key is missing.
 *
 * Strategy: Free models first → paid fallback on 429/503 → Lovable gateway as last resort.
 */

// ---------------------------------------------------------------------------
// Model tiers — Free-first with paid fallbacks
// ---------------------------------------------------------------------------

export const MODELS = {
  fast: 'google/gemini-2.5-flash',
  balanced: 'anthropic/claude-sonnet-4-20250514',
  premium: 'anthropic/claude-sonnet-4-20250514',
} as const;

export const FREE_MODELS: Record<ModelTier, string> = {
  // Llama 3.3 70B: fast instruction-following, great for classification/SMS/simple parsing
  fast: 'meta-llama/llama-3.3-70b:free',
  // Llama 3.3 70B: same fast model for balanced — avoids slow MoE models
  balanced: 'meta-llama/llama-3.3-70b:free',
  // Llama 3.3 70B: same fast model for premium — avoids DeepSeek R1 timeouts
  premium: 'meta-llama/llama-3.3-70b:free',
};

export type ModelTier = keyof typeof MODELS;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface LLMResponse {
  content: string;
  model: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

interface LLMCallOptions {
  messages: ChatMessage[];
  model?: string;
  tier?: ModelTier;
  temperature?: number;
  max_tokens?: number;
  json_mode?: boolean;
}

// Status codes that trigger automatic fallback to paid model
const RETRYABLE_STATUSES = new Set([429, 503]);

// ---------------------------------------------------------------------------
// Internal: single attempt against one model
// ---------------------------------------------------------------------------

async function attemptLLMCall(
  apiUrl: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  temperature: number,
  max_tokens: number,
  json_mode: boolean,
  isOpenRouter: boolean,
): Promise<{ ok: true; data: LLMResponse } | { ok: false; status: number; errText: string }> {
  const body: Record<string, unknown> = { model, messages, temperature, max_tokens };
  if (json_mode) body.response_format = { type: 'json_object' };

  const resp = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(isOpenRouter ? { 'HTTP-Referer': 'https://dial-smart-system.com' } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => 'unknown');
    return { ok: false, status: resp.status, errText };
  }

  const data = await resp.json();
  const choice = data.choices?.[0];
  if (!choice?.message?.content) {
    return { ok: false, status: 0, errText: 'LLM returned empty response' };
  }

  return {
    ok: true,
    data: {
      content: choice.message.content,
      model: data.model || model,
      usage: data.usage,
    },
  };
}

// ---------------------------------------------------------------------------
// Core call function — free first, paid fallback
// ---------------------------------------------------------------------------

export async function callLLM(options: LLMCallOptions): Promise<LLMResponse> {
  const {
    messages,
    temperature = 0.3,
    max_tokens = 2000,
    json_mode = false,
  } = options;

  const tier = options.tier || 'fast';
  const paidModel = options.model || MODELS[tier];

  const openrouterKey = Deno.env.get('OPENROUTER_API_KEY');
  const lovableKey = Deno.env.get('LOVABLE_API_KEY');

  if (!openrouterKey && !lovableKey) {
    throw new Error('No LLM API key configured. Set OPENROUTER_API_KEY or LOVABLE_API_KEY.');
  }

  // --- Path A: OpenRouter available → try free model first, then paid ---
  if (openrouterKey) {
    const apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
    const freeModel = options.model ? null : FREE_MODELS[tier]; // skip free if caller specified exact model

    if (freeModel) {
      console.log(`[LLM] Trying FREE model: ${freeModel} (tier: ${tier})`);
      const freeResult = await attemptLLMCall(apiUrl, openrouterKey, freeModel, messages, temperature, max_tokens, json_mode, true);

      if (freeResult.ok) {
        console.log(`[LLM] ✅ FREE model succeeded: ${freeResult.data.model}`);
        return freeResult.data;
      }

      if (RETRYABLE_STATUSES.has(freeResult.status)) {
        console.warn(`[LLM] ⚠️ FREE model ${freeModel} returned ${freeResult.status}, falling back to paid: ${paidModel}`);
      } else {
        console.warn(`[LLM] ⚠️ FREE model ${freeModel} failed (${freeResult.status}): ${freeResult.errText.substring(0, 200)}, falling back to paid: ${paidModel}`);
      }
    }

    // Paid fallback
    console.log(`[LLM] Trying PAID model: ${paidModel}`);
    const paidResult = await attemptLLMCall(apiUrl, openrouterKey, paidModel, messages, temperature, max_tokens, json_mode, true);

    if (paidResult.ok) {
      console.log(`[LLM] ✅ PAID model succeeded: ${paidResult.data.model}`);
      return paidResult.data;
    }

    throw new Error(`LLM call failed (${paidResult.status}): ${paidResult.errText}`);
  }

  // --- Path B: Lovable gateway fallback (no OpenRouter key) ---
  console.log(`[LLM] Using Lovable AI gateway (no OpenRouter key)`);
  const gatewayResult = await attemptLLMCall(
    'https://ai.gateway.lovable.dev/v1/chat/completions',
    lovableKey!,
    'google/gemini-2.5-flash',
    messages, temperature, max_tokens, json_mode, false,
  );

  if (gatewayResult.ok) return gatewayResult.data;
  throw new Error(`LLM call failed (${gatewayResult.status}): ${gatewayResult.errText}`);
}

// ---------------------------------------------------------------------------
// Convenience: Call LLM and parse JSON response
// ---------------------------------------------------------------------------

export async function callLLMJson<T = Record<string, unknown>>(
  options: LLMCallOptions
): Promise<{ data: T; model: string; usage?: LLMResponse['usage'] }> {
  const response = await callLLM({ ...options, json_mode: true });

  let parsed: T;
  try {
    let content = response.content.trim();
    if (content.startsWith('```')) {
      content = content.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`Failed to parse LLM JSON response: ${response.content.substring(0, 200)}`);
  }

  return { data: parsed, model: response.model, usage: response.usage };
}

// ---------------------------------------------------------------------------
// Convenience: Simple one-shot prompt
// ---------------------------------------------------------------------------

export async function promptLLM(
  systemPrompt: string,
  userPrompt: string,
  tier: ModelTier = 'fast'
): Promise<string> {
  const response = await callLLM({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    tier,
  });
  return response.content;
}
