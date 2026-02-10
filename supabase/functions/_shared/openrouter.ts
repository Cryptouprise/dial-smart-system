/**
 * OpenRouter LLM Integration
 *
 * Shared helper for making LLM calls via OpenRouter.
 * Supports model selection by task tier (cheap/medium/premium).
 * Falls back to Lovable AI gateway if OpenRouter key is missing.
 */

// ---------------------------------------------------------------------------
// Model tiers — pick the right tool for the job
// ---------------------------------------------------------------------------

export const MODELS = {
  // Fast + cheap: disposition classification, simple parsing, SMS generation
  fast: 'google/gemini-2.5-flash',
  // Balanced: transcript analysis, intent extraction, playbook evaluation
  balanced: 'anthropic/claude-sonnet-4-20250514',
  // Premium: strategic analysis, playbook rewriting, funnel optimization
  premium: 'anthropic/claude-sonnet-4-20250514',
} as const;

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

// ---------------------------------------------------------------------------
// Core call function
// ---------------------------------------------------------------------------

export async function callLLM(options: LLMCallOptions): Promise<LLMResponse> {
  const {
    messages,
    temperature = 0.3,
    max_tokens = 2000,
    json_mode = false,
  } = options;

  const model = options.model || MODELS[options.tier || 'fast'];

  // Try OpenRouter first, fall back to Lovable gateway
  const openrouterKey = Deno.env.get('OPENROUTER_API_KEY');
  const lovableKey = Deno.env.get('LOVABLE_API_KEY');

  if (!openrouterKey && !lovableKey) {
    throw new Error('No LLM API key configured. Set OPENROUTER_API_KEY or LOVABLE_API_KEY.');
  }

  const useOpenRouter = !!openrouterKey;
  const apiUrl = useOpenRouter
    ? 'https://openrouter.ai/api/v1/chat/completions'
    : 'https://ai.gateway.lovable.dev/v1/chat/completions';
  const apiKey = useOpenRouter ? openrouterKey : lovableKey;

  // If using Lovable gateway, force Gemini model
  const effectiveModel = useOpenRouter ? model : 'google/gemini-2.5-flash';

  const body: Record<string, unknown> = {
    model: effectiveModel,
    messages,
    temperature,
    max_tokens,
  };

  if (json_mode) {
    body.response_format = { type: 'json_object' };
  }

  const resp = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(useOpenRouter ? { 'HTTP-Referer': 'https://dial-smart-system.com' } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => 'unknown');
    throw new Error(`LLM call failed (${resp.status}): ${errText}`);
  }

  const data = await resp.json();
  const choice = data.choices?.[0];

  if (!choice?.message?.content) {
    throw new Error('LLM returned empty response');
  }

  return {
    content: choice.message.content,
    model: data.model || effectiveModel,
    usage: data.usage,
  };
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
    // Sometimes LLM wraps JSON in ```json ... ```
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
