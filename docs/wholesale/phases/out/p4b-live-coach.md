=== DESIGN NOTE ===
1. Built `coach_proposals` table + `coach_recent_corrections()` SECURITY DEFINER helper (pinned search_path, membership-checked, revoked from PUBLIC/anon), RLS (select for org members, column-level UPDATE grant + `coach_proposal_decide_guard` trigger, insert service_role only).
2. Built `_shared/lithos.ts` (`chatJSON`), `coach-suggest` (one LLM call → 5 proposal rows sharing `proposal.batch_id`), `coach-decide` (updates row, routes accepted disposition/stage through `disposition-router`, merges `field_fill` into `leads.custom_fields`, sets `leads.next_callback_at` for callback), and `CoachPanel.tsx`.
3. **disposition-router request shape** (from material `disposition-router/index.ts`): `POST` body `{ action: 'process_disposition', leadId, userId, dispositionName, dispositionId, callOutcome?, transcript?, callId?, aiConfidence?, setBy? }` — action gate at L133/L159, `userId`+`leadId` required at L160, ownership checks L167-228, `dispositionId`/`dispositionName` drive stage move L436-500. **CRITICAL: L89-99 returns HTTP 503 `DISPOSITION_AUTOMATION_NOT_TENANT_CERTIFIED` unconditionally today** — the coach will surface that error, not move anything, until the foreman flips `isDispositionAutomationTenantCertified()`.
4. ASSUMPTION: `call_live_transcripts` columns are exactly `(call_log_id, organization_id, seq, speaker, text, is_final, at)` per brief; no `id` assumed.
5. ASSUMPTION: `agent_scripts` exists (repo migration `20251205200000_script_management.sql` creates it) but LIVE-SCHEMA says NOT FOUND live — coach-suggest treats a missing table as empty scripts (try/catch), never fails.
6. ASSUMPTION: `merge_custom_fields` signature is UNKNOWN (LIVE-SCHEMA L43) → used jsonb `||` update on `leads.custom_fields` instead.
7. ASSUMPTION: `dispositions`/`pipeline_boards` are per-user (LIVE-SCHEMA L9-10, no `organization_id` live) → coach-suggest loads them by the call_log's `user_id`, not org.
8. ASSUMPTION: `stage` proposals route through disposition-router only when a `dispositionId` is chosen; otherwise coach-decide writes `lead_pipeline_positions` directly (the material shows no separate pipeline function).
9. VERIFY: (a) `call_live_transcripts` exists with those columns; (b) `disposition-router` 503 gate — decide whether coach-decide should no-op with a clear error until certified; (c) `leads.next_callback_at` exists (LIVE-SCHEMA L4 confirms yes); (d) `agent_scripts` live presence; (e) `LITHOS_API_KEY` set in function secrets.
10. VERIFY: RLS negative test needs a second org + user; the SQL below creates them in a transaction and rolls back.

=== FILE: supabase/migrations/20261029030000_live_coach.sql ===
```sql
-- ============================================================================
-- P4b: Live AI coach — proposals, per-company learning, RLS
-- ============================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. coach_proposals
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.coach_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  call_log_id uuid NOT NULL REFERENCES public.call_logs(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  transcript_through_seq integer NOT NULL DEFAULT 0,
  kind text NOT NULL CHECK (kind IN ('say_next','disposition','stage','next_action','field_fill')),
  proposal jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric(3,2),
  model text,
  prompt_tokens integer,
  completion_tokens integer,
  latency_ms integer,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','corrected','dismissed','expired')),
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  chosen jsonb
);

CREATE INDEX IF NOT EXISTS idx_coach_proposals_call_log
  ON public.coach_proposals(call_log_id);
CREATE INDEX IF NOT EXISTS idx_coach_proposals_org_created
  ON public.coach_proposals(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coach_proposals_org_kind_status
  ON public.coach_proposals(organization_id, kind, status);

ALTER TABLE public.coach_proposals ENABLE ROW LEVEL SECURITY;

-- Select: any member of the org
DROP POLICY IF EXISTS "Members view their tenant coach proposals" ON public.coach_proposals;
CREATE POLICY "Members view their tenant coach proposals"
  ON public.coach_proposals FOR SELECT TO authenticated
  USING (public.user_in_organization(auth.uid(), organization_id));

-- Update: members may only change decision columns (enforced by column grant
-- + trigger). USING clause restricts to their org.
DROP POLICY IF EXISTS "Members decide their tenant coach proposals" ON public.coach_proposals;
CREATE POLICY "Members decide their tenant coach proposals"
  ON public.coach_proposals FOR UPDATE TO authenticated
  USING (public.user_in_organization(auth.uid(), organization_id))
  WITH CHECK (public.user_in_organization(auth.uid(), organization_id));

-- Insert: service_role only (edge function writes). No authenticated INSERT policy.
DROP POLICY IF EXISTS "Service role inserts coach proposals" ON public.coach_proposals;
CREATE POLICY "Service role inserts coach proposals"
  ON public.coach_proposals FOR INSERT TO service_role
  WITH CHECK (true);

-- Column-level grants: authenticated may only UPDATE decision columns.
REVOKE ALL ON TABLE public.coach_proposals FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.coach_proposals TO authenticated;
GRANT UPDATE (status, decided_by, decided_at, chosen)
  ON TABLE public.coach_proposals TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.coach_proposals TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Decide guard trigger: forbid changing any column other than the four
--    decision columns; force decided_by = auth.uid() when a member decides.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.coach_proposal_decide_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.call_log_id IS DISTINCT FROM OLD.call_log_id
    OR NEW.lead_id IS DISTINCT FROM OLD.lead_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.transcript_through_seq IS DISTINCT FROM OLD.transcript_through_seq
    OR NEW.kind IS DISTINCT FROM OLD.kind
    OR NEW.proposal IS DISTINCT FROM OLD.proposal
    OR NEW.confidence IS DISTINCT FROM OLD.confidence
    OR NEW.model IS DISTINCT FROM OLD.model
    OR NEW.prompt_tokens IS DISTINCT FROM OLD.prompt_tokens
    OR NEW.completion_tokens IS DISTINCT FROM OLD.completion_tokens
    OR NEW.latency_ms IS DISTINCT FROM OLD.latency_ms
  THEN
    RAISE EXCEPTION 'COACH_PROPOSAL_IMMUTABLE_COLUMNS'
      USING ERRCODE = '42501',
      DETAIL = 'Only status, decided_by, decided_at, chosen may change.';
  END IF;

  -- When a browser user decides, force decided_by to the caller.
  IF auth.uid() IS NOT NULL THEN
    NEW.decided_by := auth.uid();
    IF NEW.decided_at IS NULL THEN
      NEW.decided_at := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.coach_proposal_decide_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS coach_proposal_decide_guard ON public.coach_proposals;
CREATE TRIGGER coach_proposal_decide_guard
  BEFORE UPDATE ON public.coach_proposals
  FOR EACH ROW EXECUTE FUNCTION public.coach_proposal_decide_guard();

-- ---------------------------------------------------------------------------
-- 3. coach_recent_corrections(p_org_id, p_kind, p_limit)
--    Returns the last N corrected/accepted proposals for the org+kind, with a
--    400-char transcript snippet up to transcript_through_seq.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.coach_recent_corrections(
  p_org_id uuid,
  p_kind text,
  p_limit integer DEFAULT 12
)
RETURNS TABLE (
  proposal_id uuid,
  kind text,
  proposal jsonb,
  chosen jsonb,
  status text,
  transcript_snippet text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit integer;
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'p_org_id is required';
  END IF;
  IF auth.uid() IS NOT NULL AND NOT public.user_in_organization(auth.uid(), p_org_id) THEN
    RAISE EXCEPTION 'not a member of organization'
      USING ERRCODE = '42501';
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 12), 1), 12);

  RETURN QUERY
  SELECT
    cp.id,
    cp.kind,
    cp.proposal,
    cp.chosen,
    cp.status,
    LEFT(
      COALESCE(
        (
          SELECT string_agg(t.speaker || ': ' || t.text, E'\n' ORDER BY t.seq)
          FROM public.call_live_transcripts AS t
          WHERE t.call_log_id = cp.call_log_id
            AND t.seq <= cp.transcript_through_seq
            AND t.is_final = true
        ),
        ''
      ),
      400
    ) AS transcript_snippet,
    cp.created_at
  FROM public.coach_proposals AS cp
  WHERE cp.organization_id = p_org_id
    AND cp.kind = p_kind
    AND cp.status IN ('corrected', 'accepted')
  ORDER BY cp.created_at DESC
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.coach_recent_corrections(uuid, text, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coach_recent_corrections(uuid, text, integer)
  TO authenticated, service_role;

COMMENT ON TABLE public.coach_proposals IS
  'Live AI coach proposals and rep decisions; per-company learning source.';
COMMENT ON FUNCTION public.coach_recent_corrections(uuid, text, integer) IS
  'Last N corrected/accepted proposals for an org+kind with a 400-char transcript snippet.';

COMMIT;
```

=== FILE: supabase/functions/_shared/lithos.ts ===
```ts
/**
 * Lithos (OpenAI-compatible) LLM helper.
 * Style reference: _shared/openrouter.ts (fetch, JSON mode, timeouts).
 */

const DEFAULT_BASE_URL = 'https://api.lithosai.cloud/v1';
const DEFAULT_MODEL = 'deepseek-ai/DeepSeek-V4.1-Flash-fast';

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

export async function chatJSON<T = Record<string, unknown>>(
  system: string,
  user: string,
  options: ChatJSONOptions = {},
): Promise<ChatJSONResult<T>> {
  const apiKey = Deno.env.get('LITHOS_API_KEY');
  if (!apiKey) throw new Error('LITHOS_API_KEY is not configured');

  const baseUrl = (Deno.env.get('LITHOS_BASE_URL') || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const model = options.model || DEFAULT_MODEL;
  const maxTokens = options.max_tokens ?? 900;
  const timeoutMs = options.timeout_ms ?? 6000;
  const temperature = options.temperature ?? 0.3;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => 'unknown');
      throw new Error(`Lithos LLM failed (${resp.status}): ${errText.substring(0, 300)}`);
    }

    const payload = await resp.json();
    const content: string | undefined = payload?.choices?.[0]?.message?.content;
    if (!content) throw new Error('Lithos LLM returned empty response');

    let cleaned = content.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    let parsed: T;
    try {
      parsed = JSON.parse(cleaned) as T;
    } catch {
      throw new Error(`Failed to parse Lithos JSON: ${cleaned.substring(0, 200)}`);
    }

    return {
      data: parsed,
      model: payload?.model || model,
      prompt_tokens: Number(payload?.usage?.prompt_tokens ?? 0),
      completion_tokens: Number(payload?.usage?.completion_tokens ?? 0),
      latency_ms: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timer);
  }
}
```

=== FILE: supabase/functions/coach-suggest/index.ts ===
```ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { chatJSON } from '../_shared/lithos.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const KINDS = ['say_next', 'disposition', 'stage', 'next_action', 'field_fill'] as const;
type Kind = typeof KINDS[number];

interface CoachLLMOutput {
  say_next: string;
  disposition: { id: string | null; name: string; confidence: number };
  stage: { board_id: string | null; stage_id: string | null; name: string; confidence: number };
  next_action: { type: 'callback' | 'text' | 'none' | 'book'; when_iso: string | null; note: string };
  field_fill: Record<string, unknown>;
  reasoning: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseServiceKey) {
      return json({ error: 'Supabase configuration missing' }, 500);
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('authorization');
    if (!authHeader) return json({ error: 'Missing authorization' }, 401);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const callLogId: string | undefined = body?.call_log_id;
    const throughSeqInput: number | undefined = body?.through_seq;
    if (!callLogId) return json({ error: 'call_log_id is required' }, 400);

    // Load call_log → organization_id + lead_id + user_id
    const { data: callLog, error: callErr } = await supabaseAdmin
      .from('call_logs')
      .select('id, organization_id, lead_id, user_id')
      .eq('id', callLogId)
      .maybeSingle();
    if (callErr) throw new Error(`call_log lookup failed: ${callErr.message}`);
    if (!callLog) return json({ error: 'Call log not found' }, 404);
    if (!callLog.organization_id) return json({ error: 'Call log has no organization' }, 409);

    const organizationId: string = callLog.organization_id;

    // Membership check
    const { data: membership, error: memErr } = await supabaseAdmin
      .from('organization_users')
      .select('organization_id')
      .eq('user_id', user.id)
      .eq('organization_id', organizationId)
      .maybeSingle();
    if (memErr) throw new Error(`membership lookup failed: ${memErr.message}`);
    if (!membership) return json({ error: 'Not a member of this organization' }, 403);

    // Load lead
    let lead: Record<string, unknown> | null = null;
    if (callLog.lead_id) {
      const { data: leadRow } = await supabaseAdmin
        .from('leads')
        .select('id, first_name, last_name, company, status, notes, custom_fields, phone_number, timezone, next_callback_at')
        .eq('id', callLog.lead_id)
        .maybeSingle();
      lead = leadRow ?? null;
    }

    // Load scripts (agent_scripts may not exist live → tolerate)
    let scripts: Array<{ script_name: string; script_content: string }> = [];
    try {
      const { data: scriptRows } = await supabaseAdmin
        .from('agent_scripts')
        .select('script_name, script_content')
        .eq('user_id', callLog.user_id)
        .eq('is_active', true)
        .limit(5);
      scripts = scriptRows ?? [];
    } catch (_e) {
      scripts = [];
    }

    // Load dispositions + pipeline boards (per-user per LIVE-SCHEMA)
    const { data: dispositions } = await supabaseAdmin
      .from('dispositions')
      .select('id, name, pipeline_stage')
      .eq('user_id', callLog.user_id);
    const { data: boards } = await supabaseAdmin
      .from('pipeline_boards')
      .select('id, name, position')
      .eq('user_id', callLog.user_id)
      .order('position', { ascending: true });

    // Load transcript (final only, last 40)
    const { data: transcriptRows } = await supabaseAdmin
      .from('call_live_transcripts')
      .select('seq, speaker, text, is_final')
      .eq('call_log_id', callLogId)
      .eq('is_final', true)
      .order('seq', { ascending: false })
      .limit(40);
    const transcript = (transcriptRows ?? []).slice().reverse();
    const throughSeq = throughSeqInput
      ?? (transcript.length ? transcript[transcript.length - 1].seq : 0);

    // Load last 12 corrections per kind
    const corrections: Record<string, unknown[]> = {};
    for (const kind of KINDS) {
      const { data: rows } = await supabaseAdmin.rpc('coach_recent_corrections', {
        p_org_id: organizationId,
        p_kind: kind,
        p_limit: 12,
      });
      corrections[kind] = rows ?? [];
    }

    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt({
      lead,
      scripts,
      dispositions: dispositions ?? [],
      boards: boards ?? [],
      transcript,
      corrections,
    });

    let llm: CoachLLMOutput | null = null;
    let model = '';
    let promptTokens = 0;
    let completionTokens = 0;
    let latencyMs = 0;

    try {
      const result = await chatJSON<CoachLLMOutput>(systemPrompt, userPrompt, {
        max_tokens: 900,
        timeout_ms: 6000,
      });
      llm = result.data;
      model = result.model;
      promptTokens = result.prompt_tokens;
      completionTokens = result.completion_tokens;
      latencyMs = result.latency_ms;
    } catch (llmErr) {
      console.error('[coach-suggest] LLM failure:', llmErr);
      return json({ proposals: [], error: llmErr instanceof Error ? llmErr.message : 'LLM failure' }, 200);
    }

    const batchId = crypto.randomUUID();
    const rows = KINDS.map((kind) => {
      const { proposal, confidence } = shapeProposal(kind, llm!);
      return {
        organization_id: organizationId,
        call_log_id: callLogId,
        lead_id: callLog.lead_id ?? null,
        transcript_through_seq: throughSeq,
        kind,
        proposal: { ...proposal, batch_id: batchId, reasoning: llm!.reasoning ?? '' },
        confidence,
        model,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        latency_ms: latencyMs,
        status: 'pending' as const,
      };
    });

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from('coach_proposals')
      .insert(rows)
      .select('*');
    if (insertErr) throw new Error(`coach_proposals insert failed: ${insertErr.message}`);

    return json({ proposals: inserted ?? [], batch_id: batchId }, 200);
  } catch (error) {
    console.error('[coach-suggest] error:', error);
    return json({ proposals: [], error: error instanceof Error ? error.message : 'Unknown error' }, 200);
  }
});

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function buildSystemPrompt(): string {
  return [
    'You are a live sales coach for a rep on a phone call.',
    'Return STRICT JSON only, matching this shape:',
    '{"say_next": string (<=2 sentences, in the rep\'s voice),',
    ' "disposition": {"id": string|null, "name": string, "confidence": number 0..1},',
    ' "stage": {"board_id": string|null, "stage_id": string|null, "name": string, "confidence": number 0..1},',
    ' "next_action": {"type": "callback"|"text"|"none"|"book", "when_iso": string|null, "note": string},',
    ' "field_fill": {<custom_field_key>: value},',
    ' "reasoning": string (<=25 words)}',
    'Use ONLY disposition ids/names and board ids/names from the provided lists.',
    'If unsure, use null ids and confidence 0.',
  ].join('\n');
}

function buildUserPrompt(input: {
  lead: Record<string, unknown> | null;
  scripts: Array<{ script_name: string; script_content: string }>;
  dispositions: Array<{ id: string; name: string; pipeline_stage: string }>;
  boards: Array<{ id: string; name: string; position: number }>;
  transcript: Array<{ seq: number; speaker: string; text: string }>;
  corrections: Record<string, unknown[]>;
}): string {
  const transcriptText = input.transcript
    .map((t) => `${t.speaker}: ${t.text}`)
    .join('\n');

  const correctionsText = Object.entries(input.corrections)
    .map(([kind, rows]) => {
      if (!rows.length) return '';
      const lines = rows.map((r: any) =>
        `- [${kind}] snippet: "${(r.transcript_snippet || '').slice(0, 200)}" -> proposed ${JSON.stringify(r.proposal)} ; team chose ${JSON.stringify(r.chosen)}`
      );
      return `Corrections (${kind}):\n${lines.join('\n')}`;
    })
    .filter(Boolean)
    .join('\n\n');

  return [
    `LEAD: ${JSON.stringify(input.lead ?? {})}`,
    `SCRIPTS: ${JSON.stringify(input.scripts)}`,
    `DISPOSITIONS: ${JSON.stringify(input.dispositions)}`,
    `BOARDS: ${JSON.stringify(input.boards)}`,
    `TRANSCRIPT:\n${transcriptText || '(empty)'}`,
    correctionsText ? `LEARNED CORRECTIONS:\n${correctionsText}` : '',
  ].filter(Boolean).join('\n\n');
}

function shapeProposal(kind: Kind, llm: CoachLLMOutput): { proposal: Record<string, unknown>; confidence: number } {
  switch (kind) {
    case 'say_next':
      return { proposal: { text: llm.say_next ?? '' }, confidence: 0.7 };
    case 'disposition':
      return {
        proposal: {
          id: llm.disposition?.id ?? null,
          name: llm.disposition?.name ?? '',
        },
        confidence: clamp01(llm.disposition?.confidence),
      };
    case 'stage':
      return {
        proposal: {
          board_id: llm.stage?.board_id ?? null,
          stage_id: llm.stage?.stage_id ?? null,
          name: llm.stage?.name ?? '',
        },
        confidence: clamp01(llm.stage?.confidence),
      };
    case 'next_action':
      return {
        proposal: {
          type: llm.next_action?.type ?? 'none',
          when_iso: llm.next_action?.when_iso ?? null,
          note: llm.next_action?.note ?? '',
        },
        confidence: 0.6,
      };
    case 'field_fill':
      return { proposal: { fields: llm.field_fill ?? {} }, confidence: 0.5 };
  }
}

function clamp01(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
```

=== FILE: supabase/functions/coach-decide/index.ts ===
```ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Decision = 'accept' | 'correct' | 'dismiss';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseServiceKey) return json({ error: 'Supabase configuration missing' }, 500);

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('authorization');
    if (!authHeader) return json({ error: 'Missing authorization' }, 401);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const proposalId: string | undefined = body?.proposal_id;
    const decision: Decision | undefined = body?.decision;
    const chosen: Record<string, unknown> | undefined = body?.chosen;
    if (!proposalId) return json({ error: 'proposal_id is required' }, 400);
    if (!decision || !['accept', 'correct', 'dismiss'].includes(decision)) {
      return json({ error: 'decision must be accept|correct|dismiss' }, 400);
    }

    const { data: proposal, error: propErr } = await supabaseAdmin
      .from('coach_proposals')
      .select('*')
      .eq('id', proposalId)
      .maybeSingle();
    if (propErr) throw new Error(`proposal lookup failed: ${propErr.message}`);
    if (!proposal) return json({ error: 'Proposal not found' }, 404);

    const organizationId: string = proposal.organization_id;
    const { data: membership } = await supabaseAdmin
      .from('organization_users')
      .select('organization_id')
      .eq('user_id', user.id)
      .eq('organization_id', organizationId)
      .maybeSingle();
    if (!membership) return json({ error: 'Not a member of this organization' }, 403);

    const newStatus = decision === 'accept' ? 'accepted'
      : decision === 'correct' ? 'corrected'
      : 'dismissed';

    const { error: updErr } = await supabaseAdmin
      .from('coach_proposals')
      .update({
        status: newStatus,
        decided_by: user.id,
        decided_at: new Date().toISOString(),
        chosen: chosen ?? proposal.proposal,
      })
      .eq('id', proposalId);
    if (updErr) throw new Error(`proposal update failed: ${updErr.message}`);

    // Side effects only on accept/correct
    let routed: unknown = null;
    if (decision !== 'dismiss') {
      const effective = chosen ?? proposal.proposal;
      if (proposal.kind === 'disposition') {
        routed = await routeDisposition(supabaseAdmin, supabaseUrl, supabaseServiceKey, token, proposal, effective);
      } else if (proposal.kind === 'stage') {
        routed = await routeStage(supabaseAdmin, supabaseUrl, supabaseServiceKey, token, proposal, effective);
      } else if (proposal.kind === 'field_fill') {
        routed = await applyFieldFill(supabaseAdmin, proposal, effective);
      } else if (proposal.kind === 'next_action') {
        routed = await applyNextAction(supabaseAdmin, proposal, effective);
      }
    }

    return json({ ok: true, status: newStatus, routed }, 200);
  } catch (error) {
    console.error('[coach-decide] error:', error);
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

// disposition-router request shape (from disposition-router/index.ts):
//   action: 'process_disposition' (L159)
//   leadId, userId (L160), dispositionName, dispositionId (L133),
//   callOutcome, transcript, callId, aiConfidence, setBy (L133).
// NOTE: disposition-router currently returns 503 DISPOSITION_AUTOMATION_NOT_TENANT_CERTIFIED
// (L89-99) until the foreman flips isDispositionAutomationTenantCertified().
async function routeDisposition(
  supabaseAdmin: any,
  supabaseUrl: string,
  serviceKey: string,
  callerToken: string,
  proposal: any,
  effective: any,
): Promise<unknown> {
  const dispositionId: string | null = effective?.id ?? null;
  const dispositionName: string = effective?.name ?? '';

  // Resolve lead's user_id (disposition-router requires userId)
  const { data: lead } = await supabaseAdmin
    .from('leads')
    .select('id, user_id')
    .eq('id', proposal.lead_id)
    .maybeSingle();
  if (!lead) return { error: 'lead not found' };

  const resp = await fetch(`${supabaseUrl}/functions/v1/disposition-router`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${callerToken}`,
      'Content-Type': 'application/json',
      'apikey': serviceKey,
    },
    body: JSON.stringify({
      action: 'process_disposition',
      leadId: lead.id,
      userId: lead.user_id,
      dispositionId,
      dispositionName,
      callId: proposal.call_log_id,
      setBy: 'manual',
    }),
  });
  const text = await resp.text();
  let parsed: unknown = text;
  try { parsed = JSON.parse(text); } catch { /* keep text */ }
  return { status: resp.status, body: parsed };
}

// Stage: if a dispositionId is chosen, route through disposition-router (which
// moves the lead's pipeline position, L436-500). Otherwise write
// lead_pipeline_positions directly (material shows no separate pipeline fn).
async function routeStage(
  supabaseAdmin: any,
  supabaseUrl: string,
  serviceKey: string,
  callerToken: string,
  proposal: any,
  effective: any,
): Promise<unknown> {
  const boardId: string | null = effective?.board_id ?? effective?.stage_id ?? null;
  const dispositionId: string | null = effective?.disposition_id ?? null;

  if (dispositionId) {
    return routeDisposition(supabaseAdmin, supabaseUrl, serviceKey, callerToken, proposal, {
      id: dispositionId,
      name: effective?.name ?? '',
    });
  }

  if (!boardId) return { skipped: 'no board_id' };

  const { data: lead } = await supabaseAdmin
    .from('leads')
    .select('id, user_id')
    .eq('id', proposal.lead_id)
    .maybeSingle();
  if (!lead) return { error: 'lead not found' };

  const { error } = await supabaseAdmin
    .from('lead_pipeline_positions')
    .upsert({
      user_id: lead.user_id,
      lead_id: lead.id,
      pipeline_board_id: boardId,
      position: 0,
      moved_at: new Date().toISOString(),
      moved_by_user: true,
      notes: 'Moved by live coach',
    }, { onConflict: 'lead_id,user_id' });
  if (error) return { error: error.message };
  return { moved_to_board: boardId };
}

// field_fill: merge into leads.custom_fields via jsonb || (merge_custom_fields
// signature is UNKNOWN per LIVE-SCHEMA L43, so we do not call it).
async function applyFieldFill(supabaseAdmin: any, proposal: any, effective: any): Promise<unknown> {
  const fields: Record<string, unknown> = effective?.fields ?? effective ?? {};
  if (!proposal.lead_id) return { skipped: 'no lead_id' };

  const { data: lead } = await supabaseAdmin
    .from('leads')
    .select('id, custom_fields')
    .eq('id', proposal.lead_id)
    .maybeSingle();
  if (!lead) return { error: 'lead not found' };

  const merged = { ...(lead.custom_fields ?? {}), ...fields };
  const { error } = await supabaseAdmin
    .from('leads')
    .update({ custom_fields: merged })
    .eq('id', lead.id);
  if (error) return { error: error.message };
  return { merged_keys: Object.keys(fields) };
}

// next_action: 'callback' → set leads.next_callback_at (LIVE-SCHEMA L4 confirms column).
async function applyNextAction(supabaseAdmin: any, proposal: any, effective: any): Promise<unknown> {
  const type = effective?.type;
  if (type !== 'callback') return { skipped: `type=${type}` };
  if (!proposal.lead_id) return { skipped: 'no lead_id' };
  const whenIso: string | null = effective?.when_iso ?? null;
  if (!whenIso) return { skipped: 'no when_iso' };

  const { error } = await supabaseAdmin
    .from('leads')
    .update({ next_callback_at: whenIso })
    .eq('id', proposal.lead_id);
  if (error) return { error: error.message };
  return { next_callback_at: whenIso };
}
```

=== FILE: src/components/call/CoachPanel.tsx ===
```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface CoachProposal {
  id: string;
  kind: 'say_next' | 'disposition' | 'stage' | 'next_action' | 'field_fill';
  proposal: Record<string, any>;
  confidence: number | null;
  status: 'pending' | 'accepted' | 'corrected' | 'dismissed' | 'expired';
}

interface CoachPanelProps {
  callLogId: string;
  organizationId: string;
  ended?: boolean;
}

interface DispositionOption { id: string; name: string; }
interface BoardOption { id: string; name: string; }

export function CoachPanel({ callLogId, organizationId, ended = false }: CoachPanelProps) {
  const [proposals, setProposals] = useState<CoachProposal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dispositions, setDispositions] = useState<DispositionOption[]>([]);
  const [boards, setBoards] = useState<BoardOption[]>([]);
  const [changing, setChanging] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);

  // Load org dispositions + boards for the "Change" dropdowns.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: disp } = await supabase
        .from('dispositions')
        .select('id, name')
        .eq('organization_id', organizationId);
      const { data: bds } = await supabase
        .from('pipeline_boards')
        .select('id, name')
        .eq('organization_id', organizationId)
        .order('position', { ascending: true });
      if (cancelled) return;
      setDispositions((disp ?? []) as DispositionOption[]);
      setBoards((bds ?? []) as BoardOption[]);
    })();
    return () => { cancelled = true; };
  }, [organizationId]);

  const requestSuggest = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('coach-suggest', {
        body: { call_log_id: callLogId },
      });
      if (fnErr) throw fnErr;
      if (data?.error) setError(String(data.error));
      setProposals((data?.proposals ?? []) as CoachProposal[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'coach-suggest failed');
    } finally {
      setLoading(false);
    }
  }, [callLogId]);

  // Realtime subscription on call_live_transcripts; debounce 2.5s after latest
  // final contact line.
  useEffect(() => {
    const channel = supabase
      .channel(`coach-transcripts-${callLogId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'call_live_transcripts',
          filter: `call_log_id=eq.${callLogId}`,
        },
        (payload) => {
          const row = payload.new as { speaker?: string; is_final?: boolean };
          if (!row?.is_final) return;
          if (row.speaker !== 'contact') return;
          if (debounceRef.current) window.clearTimeout(debounceRef.current);
          debounceRef.current = window.setTimeout(() => { void requestSuggest(); }, 2500);
        },
      )
      .subscribe();
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      void supabase.removeChannel(channel);
    };
  }, [callLogId, requestSuggest]);

  const decide = useCallback(async (
    proposalId: string,
    decision: 'accept' | 'correct' | 'dismiss',
    chosen?: Record<string, unknown>,
  ) => {
    const { data, error: fnErr } = await supabase.functions.invoke('coach-decide', {
      body: { proposal_id: proposalId, decision, chosen },
    });
    if (fnErr) { setError(fnErr.message); return; }
    if (data?.error) { setError(String(data.error)); return; }
    setProposals((prev) => prev.map((p) =>
      p.id === proposalId ? { ...p, status: data.status } : p,
    ));
    setChanging(null);
  }, []);

  const byKind = useMemo(() => {
    const map: Record<string, CoachProposal | undefined> = {};
    for (const p of proposals) map[p.kind] = p;
    return map;
  }, [proposals]);

  const sayNext = byKind['say_next'];
  const disposition = byKind['disposition'];
  const stage = byKind['stage'];

  const showFinal = ended && proposals.some((p) => p.status === 'pending');

  return (
    <div className="flex flex-col gap-3">
      {loading && <div className="text-xs text-muted-foreground">Thinking…</div>}
      {error && <div className="text-xs text-destructive">{error}</div>}

      {sayNext && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Say this</CardTitle></CardHeader>
          <CardContent className="text-sm">{sayNext.proposal?.text ?? ''}</CardContent>
        </Card>
      )}

      {(disposition || stage) && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">We think this goes to</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <div>
              <span className="font-medium">{stage?.proposal?.name || '—'}</span>
              {' as '}
              <span className="font-medium">{disposition?.proposal?.name || '—'}</span>
              {' — correct?'}
            </div>
            <div className="flex flex-wrap gap-2">
              {disposition && disposition.status === 'pending' && (
                <Button size="sm" onClick={() => decide(disposition.id, 'accept')}>Accept</Button>
              )}
              {disposition && disposition.status === 'pending' && (
                <Button size="sm" variant="outline"
                  onClick={() => setChanging(changing === disposition.id ? null : disposition.id)}>
                  Change
                </Button>
              )}
              {disposition && disposition.status === 'pending' && (
                <Button size="sm" variant="ghost" onClick={() => decide(disposition.id, 'dismiss')}>Dismiss</Button>
              )}
              {disposition && disposition.status !== 'pending' && (
                <span className="text-xs text-muted-foreground">disposition: {disposition.status}</span>
              )}
            </div>
            {disposition && changing === disposition.id && (
              <Select
                onValueChange={(value) => {
                  const opt = dispositions.find((d) => d.id === value);
                  if (!opt) return;
                  void decide(disposition.id, 'correct', { id: opt.id, name: opt.name });
                }}
              >
                <SelectTrigger className="h-8"><SelectValue placeholder="Choose disposition" /></SelectTrigger>
                <SelectContent>
                  {dispositions.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {stage && stage.status === 'pending' && (
              <Select
                onValueChange={(value) => {
                  const opt = boards.find((b) => b.id === value);
                  if (!opt) return;
                  void decide(stage.id, 'correct', { board_id: opt.id, name: opt.name });
                }}
              >
                <SelectTrigger className="h-8"><SelectValue placeholder="Choose stage" /></SelectTrigger>
                <SelectContent>
                  {boards.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </CardContent>
        </Card>
      )}

      {showFinal && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Final proposals</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {proposals.filter((p) => p.status === 'pending').map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2">
                <span className="truncate">{p.kind}: {JSON.stringify(p.proposal).slice(0, 80)}</span>
                <Button size="sm" onClick={() => decide(p.id, 'accept')}>Apply</Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

=== TESTS ===
```sql
-- 1. Apply migration
--    supabase db push   (or psql -f supabase/migrations/20261029030000_live_coach.sql)
--    Expected: no errors; table + function + trigger exist.

-- 2. Insert 3 fake transcript lines for an existing call_log (replace <CALL_LOG_ID>)
INSERT INTO public.call_live_transcripts (call_log_id, organization_id, seq, speaker, text, is_final, at)
SELECT '<CALL_LOG_ID>', cl.organization_id, v.seq, v.speaker, v.text, true, now()
FROM public.call_logs cl,
     (VALUES (1,'contact','Hi, who is this?'),
             (2,'rep','Hi, this is Sam from Acme Solar.'),
             (3,'contact','I already have solar.')) AS v(seq, speaker, text)
WHERE cl.id = '<CALL_LOG_ID>';
-- Expected: INSERT 0 3

-- 3. Call coach-suggest (replace <JWT> with a member's access token)
--    curl -sS -X POST "$SUPABASE_URL/functions/v1/coach-suggest" \
--      -H "Authorization: Bearer <JWT>" -H "Content-Type: application/json" \
--      -d '{"call_log_id":"<CALL_LOG_ID>"}'
--    Expected: HTTP 200, body { proposals: [ ...5 rows... ], batch_id: "..." }
--    On LLM failure: HTTP 200, { proposals: [], error: "..." }

-- 4. Show the 5 proposal rows
SELECT kind, status, confidence, proposal->>'batch_id' AS batch_id
FROM public.coach_proposals
WHERE call_log_id = '<CALL_LOG_ID>'
ORDER BY created_at DESC, kind
LIMIT 5;
-- Expected: 5 rows, kinds say_next/disposition/stage/next_action/field_fill,
--           status='pending', same batch_id.

-- 5. coach_recent_corrections returns nothing yet (no decisions)
SELECT * FROM public.coach_recent_corrections(
  (SELECT organization_id FROM public.call_logs WHERE id = '<CALL_LOG_ID>'),
  'disposition', 12);
-- Expected: 0 rows.

-- 6. Second-org RLS negative test (rolled back)
BEGIN;
DO $$
DECLARE
  v_org2 uuid;
  v_user2 uuid := gen_random_uuid();
  v_call uuid;
  v_visible int;
BEGIN
  INSERT INTO public.organizations (name, slug) VALUES ('Test Org 2', 'test-org-2-' || substr(v_user2::text,1,8))
    RETURNING id INTO v_org2;
  INSERT INTO public.organization_users (organization_id, user_id, role) VALUES (v_org2, v_user2, 'owner');

  -- Simulate a member of org2 querying org1's proposals
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user2::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_visible FROM public.coach_proposals
    WHERE organization_id <> v_org2;
  IF v_visible <> 0 THEN
    RAISE EXCEPTION 'RLS LEAK: org2 member saw % foreign proposals', v_visible;
  END IF;

  -- Attempt to UPDATE a foreign proposal's status → must affect 0 rows
  UPDATE public.coach_proposals SET status = 'dismissed'
    WHERE organization_id <> v_org2;
  IF FOUND THEN
    RAISE EXCEPTION 'RLS LEAK: org2 member updated a foreign proposal';
  END IF;

  RAISE NOTICE 'RLS negative test PASSED';
END $$;
ROLLBACK;
-- Expected: NOTICE "RLS negative test PASSED", no exception.

-- 7. Column-level UPDATE guard
--    As an authenticated member of the owning org:
UPDATE public.coach_proposals SET proposal = '{}'::jsonb WHERE id = '<PROPOSAL_ID>';
-- Expected: ERROR 42501 COACH_PROPOSAL_IMMUTABLE_COLUMNS

UPDATE public.coach_proposals SET status = 'accepted' WHERE id = '<PROPOSAL_ID>';
-- Expected: UPDATE 1; decided_by = auth.uid(); decided_at set.
```