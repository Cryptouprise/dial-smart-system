=== DESIGN NOTE ===
1. FIXED: #1/#28 `coach_recent_corrections` now requires `auth.uid()` OR `current_user IN ('service_role','postgres')`; anon always rejected.
2. FIXED: #2/#23 `coach_merge_custom_fields` is plpgsql, resolves the lead's org, rejects non-members (service_role exempt), pinned search_path.
3. FIXED: #3/#16/#24 decide-guard only forces `decided_by`/`decided_at` when `current_user IN ('authenticated','anon')`; service_role keeps explicit values.
4. FIXED: #4/#20 removed the dead `health_check` probe; a 503 from disposition-router is a hard failure returned as 502.
5. FIXED: #5 side effect runs BEFORE the status update; on `routed.error` the row stays `pending` and 502 is returned.
6. FIXED: #6 payload now sends `callOutcome, transcript, aiConfidence` and `userId: lead.user_id` (router L167-228 ownership is per-user; caller is a teammate).
7. FIXED: #7 stage move is one atomic RPC `coach_move_stage` (delete+insert in one transaction, org-checked).
8. FIXED: #8 migration renamed to `20261029150000_live_coach.sql` (sorts after phase 1 `20261029142121`).
9. FIXED: #9 realtime DO block RAISEs if `call_live_transcripts` is missing (P4a must ship first).
10. FIXED: #10/#11/#12/#21/#27 CoachPanel: org-scoped dropdowns with per-user fallback, passes `through_seq`, Apply gated to working kinds, `REPLICA IDENTITY FULL` kept (house fact), unused prop used.
11. FIXED: #13/#14 lead + transcript lookups select/filter `organization_id` and reject mismatch.
12. FIXED: #15 `chosen` stored only on `correct`; accept stores `null`.
13. FIXED: #17 removed dead `disposition_id` branch in routeStage.
14. FIXED: #18 `through_seq` clamped to last final seq; prompt filtered to `seq <= throughSeq`.
15. FIXED: #19 added `batch_id uuid` column + index; coach-suggest sets it.
16. FIXED: #22/#29/#30 membership lookups use `.limit(1).maybeSingle()`; #25/#26 separate anon client for `getUser`.
17. FIXED: gaps #6 (scripts from `campaigns.script`), #18 (Apply includes say_next), #20 (RLS test moved out of DO block).
18. ASSUMPTION: `call_live_transcripts` columns exactly `(call_log_id, organization_id, seq, speaker, text, is_final, at)` per brief; no `id` assumed.
19. ASSUMPTION: disposition-router request shape = `{action:'process_disposition', leadId, userId, dispositionId, dispositionName, callOutcome, transcript, callId, aiConfidence, setBy}` (L133, L159-160, L538-539).
20. DISPUTED: blocker #21 asks for `REPLICA IDENTITY DEFAULT`; house fact mandates `FULL` — kept `FULL`.
21. DISPUTED: blocker #13's `merge_custom_fields` RPC signature is UNKNOWN (LIVE-SCHEMA.md:43) — used a new pinned function.
22. VERIFY: disposition-router L89-99 returns 503 unconditionally today; coach-decide surfaces it as 502 and leaves the proposal `pending`.

=== FILE: supabase/migrations/20261029150000_live_coach.sql ===
-- ============================================================================
-- P4b: Live AI coach — proposals, per-company learning, RLS
-- Sorts AFTER 20261029142121_phase1_org_scope.sql (needs dispositions.organization_id,
-- pipeline_boards.organization_id, lead_pipeline_positions.organization_id).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. coach_proposals
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.coach_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  call_log_id uuid NOT NULL REFERENCES public.call_logs(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  batch_id uuid NOT NULL DEFAULT gen_random_uuid(),
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
CREATE INDEX IF NOT EXISTS idx_coach_proposals_batch
  ON public.coach_proposals(batch_id);
CREATE INDEX IF NOT EXISTS idx_coach_proposals_call_seq
  ON public.coach_proposals(call_log_id, transcript_through_seq);

ALTER TABLE public.coach_proposals ENABLE ROW LEVEL SECURITY;

-- Select: any member of the org
DROP POLICY IF EXISTS "Members view their tenant coach proposals" ON public.coach_proposals;
CREATE POLICY "Members view their tenant coach proposals"
  ON public.coach_proposals FOR SELECT TO authenticated
  USING (public.user_in_organization(organization_id));

-- Update: members may only change decision columns (enforced by column grant
-- + trigger). USING clause restricts to their org.
DROP POLICY IF EXISTS "Members decide their tenant coach proposals" ON public.coach_proposals;
CREATE POLICY "Members decide their tenant coach proposals"
  ON public.coach_proposals FOR UPDATE TO authenticated
  USING (public.user_in_organization(organization_id))
  WITH CHECK (public.user_in_organization(organization_id));

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
--    decision columns; force decided_by = auth.uid() only for browser users
--    (service_role keeps the explicit decided_by the edge function writes).
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
    OR NEW.batch_id IS DISTINCT FROM OLD.batch_id
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

  -- Browser users: force decided_by to the caller. service_role/postgres keep
  -- the explicit value written by coach-decide (auth.uid() is NULL there).
  IF current_user IN ('authenticated','anon') THEN
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
--    SECURITY DEFINER: requires an authenticated member OR service_role.
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
    RAISE EXCEPTION 'p_org_id is required' USING ERRCODE = '22023';
  END IF;

  -- service_role/postgres (edge functions) are exempt; everyone else must be
  -- an authenticated member of the org.
  IF current_user NOT IN ('service_role','postgres') THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
    END IF;
    IF NOT public.user_in_organization(p_org_id) THEN
      RAISE EXCEPTION 'not a member of organization' USING ERRCODE = '42501';
    END IF;
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

-- ---------------------------------------------------------------------------
-- 4. coach_merge_custom_fields(p_lead_id, p_patch)
--    Single-statement jsonb || merge (avoids read-modify-write race).
--    merge_custom_fields signature is UNKNOWN per LIVE-SCHEMA.md:43, so we
--    add our own pinned function instead of calling it.
--    Membership-checked against the lead's organization_id.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.coach_merge_custom_fields(
  p_lead_id uuid,
  p_patch jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.leads WHERE id = p_lead_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'lead not found' USING ERRCODE = '42501';
  END IF;
  IF current_user NOT IN ('service_role','postgres') THEN
    IF auth.uid() IS NULL OR NOT public.user_in_organization(v_org) THEN
      RAISE EXCEPTION 'not a member of organization' USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE public.leads
     SET custom_fields = COALESCE(custom_fields, '{}'::jsonb) || COALESCE(p_patch, '{}'::jsonb)
   WHERE id = p_lead_id;
END;
$$;

REVOKE ALL ON FUNCTION public.coach_merge_custom_fields(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coach_merge_custom_fields(uuid, jsonb)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. coach_move_stage(p_lead_id, p_org_id, p_board_id)
--    Atomic delete+insert on lead_pipeline_positions (no unique constraint on
--    (lead_id,user_id) live, LIVE-SCHEMA.md:11). Org-checked.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.coach_move_stage(
  p_lead_id uuid,
  p_org_id uuid,
  p_board_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lead_org uuid;
  v_lead_user uuid;
  v_board_org uuid;
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'p_org_id is required' USING ERRCODE = '22023';
  END IF;
  IF current_user NOT IN ('service_role','postgres') THEN
    IF auth.uid() IS NULL OR NOT public.user_in_organization(p_org_id) THEN
      RAISE EXCEPTION 'not a member of organization' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT organization_id, user_id INTO v_lead_org, v_lead_user
    FROM public.leads WHERE id = p_lead_id;
  IF v_lead_org IS NULL OR v_lead_org IS DISTINCT FROM p_org_id THEN
    RAISE EXCEPTION 'lead not in organization' USING ERRCODE = '42501';
  END IF;

  SELECT organization_id INTO v_board_org
    FROM public.pipeline_boards WHERE id = p_board_id;
  IF v_board_org IS NULL OR v_board_org IS DISTINCT FROM p_org_id THEN
    RAISE EXCEPTION 'board not in organization' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.lead_pipeline_positions
   WHERE lead_id = p_lead_id
     AND organization_id = p_org_id;

  INSERT INTO public.lead_pipeline_positions (
    user_id, organization_id, lead_id, pipeline_board_id, position,
    moved_at, moved_by_user, notes
  ) VALUES (
    v_lead_user, p_org_id, p_lead_id, p_board_id, 0,
    now(), true, 'Moved by live coach'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.coach_move_stage(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coach_move_stage(uuid, uuid, uuid)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Realtime: call_live_transcripts must be in supabase_realtime with
--    REPLICA IDENTITY FULL for the CoachPanel subscription (house fact).
--    Hard-fails if P4a has not shipped (a silent skip ships a dead panel).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'call_live_transcripts'
  ) THEN
    RAISE EXCEPTION 'call_live_transcripts missing — apply P4a first';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'call_live_transcripts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.call_live_transcripts;
  END IF;

  ALTER TABLE public.call_live_transcripts REPLICA IDENTITY FULL;
END $$;

COMMENT ON TABLE public.coach_proposals IS
  'Live AI coach proposals and rep decisions; per-company learning source.';
COMMENT ON FUNCTION public.coach_recent_corrections(uuid, text, integer) IS
  'Last N corrected/accepted proposals for an org+kind with a 400-char transcript snippet.';
COMMENT ON FUNCTION public.coach_merge_custom_fields(uuid, jsonb) IS
  'Single-statement jsonb || merge into leads.custom_fields; org-checked.';
COMMENT ON FUNCTION public.coach_move_stage(uuid, uuid, uuid) IS
  'Atomic delete+insert of a lead''s pipeline position; org-checked.';

=== FILE: supabase/functions/_shared/lithos.ts ===
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

=== FILE: supabase/functions/coach-suggest/index.ts ===
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
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      return json({ error: 'Supabase configuration missing' }, 500);
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });
    const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
    });

    const authHeader = req.headers.get('authorization');
    if (!authHeader) return json({ error: 'Missing authorization' }, 401);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAnon.auth.getUser(token);
    if (authError || !user) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const callLogId: string | undefined = body?.call_log_id;
    const throughSeqInput: number | undefined = body?.through_seq;
    if (!callLogId) return json({ error: 'call_log_id is required' }, 400);

    // Load call_log → organization_id + lead_id + user_id
    const { data: callLog, error: callErr } = await supabaseAdmin
      .from('call_logs')
      .select('id, organization_id, lead_id, user_id, campaign_id')
      .eq('id', callLogId)
      .maybeSingle();
    if (callErr) throw new Error(`call_log lookup failed: ${callErr.message}`);
    if (!callLog) return json({ error: 'Call log not found' }, 404);
    if (!callLog.organization_id) return json({ error: 'Call log has no organization' }, 409);

    const organizationId: string = callLog.organization_id;

    // Membership check (limit(1) — organization_users has no unique constraint shown)
    const { data: membership, error: memErr } = await supabaseAdmin
      .from('organization_users')
      .select('organization_id')
      .eq('user_id', user.id)
      .eq('organization_id', organizationId)
      .limit(1)
      .maybeSingle();
    if (memErr) throw new Error(`membership lookup failed: ${memErr.message}`);
    if (!membership) return json({ error: 'Not a member of this organization' }, 403);

    // Load lead (org-checked)
    let lead: Record<string, unknown> | null = null;
    if (callLog.lead_id) {
      const { data: leadRow } = await supabaseAdmin
        .from('leads')
        .select('id, organization_id, first_name, last_name, company, status, notes, custom_fields, phone_number, timezone, next_callback_at')
        .eq('id', callLog.lead_id)
        .maybeSingle();
      if (leadRow && leadRow.organization_id !== organizationId) {
        return json({ error: 'lead org mismatch' }, 403);
      }
      lead = leadRow ?? null;
    }

    // agent_scripts is NOT FOUND live (LIVE-SCHEMA.md:12). Scripts come from
    // campaigns.script for the call's campaign (LIVE-SCHEMA.md:5).
    // UNKNOWN: any other script table; do not invent columns.
    const scripts: Array<{ campaign_id: string; script: string }> = [];
    if (callLog.campaign_id) {
      const { data: campaignRow } = await supabaseAdmin
        .from('campaigns')
        .select('id, organization_id, name, script')
        .eq('id', callLog.campaign_id)
        .maybeSingle();
      if (campaignRow && campaignRow.organization_id === organizationId && campaignRow.script) {
        scripts.push({ campaign_id: campaignRow.id, script: campaignRow.script });
      }
    }

    // Load dispositions + pipeline boards by organization_id (phase 1 adds the column).
    const { data: dispositions } = await supabaseAdmin
      .from('dispositions')
      .select('id, name, pipeline_stage')
      .eq('organization_id', organizationId);
    const { data: boards } = await supabaseAdmin
      .from('pipeline_boards')
      .select('id, name, position')
      .eq('organization_id', organizationId)
      .order('position', { ascending: true });

    // Load transcript (final only, last 40, org-scoped)
    const { data: transcriptRows } = await supabaseAdmin
      .from('call_live_transcripts')
      .select('seq, speaker, text, is_final')
      .eq('call_log_id', callLogId)
      .eq('organization_id', organizationId)
      .eq('is_final', true)
      .order('seq', { ascending: false })
      .limit(40);
    const transcriptAll = (transcriptRows ?? []).slice().reverse();
    const lastFinalSeq = transcriptAll.length ? transcriptAll[transcriptAll.length - 1].seq : 0;
    const throughSeq = Math.min(
      typeof throughSeqInput === 'number' ? throughSeqInput : lastFinalSeq,
      lastFinalSeq,
    );
    const transcript = transcriptAll.filter((t) => t.seq <= throughSeq);

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
        batch_id: batchId,
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
    return json({ proposals: [], error: error instanceof Error ? error.message : 'Unknown error' }, 500);
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
  scripts: Array<{ campaign_id: string; script: string }>;
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
      const lines = rows.slice(0, 3).map((r: any) =>
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

=== FILE: supabase/functions/coach-decide/index.ts ===
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
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      return json({ error: 'Supabase configuration missing' }, 500);
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });
    const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
    });

    const authHeader = req.headers.get('authorization');
    if (!authHeader) return json({ error: 'Missing authorization' }, 401);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAnon.auth.getUser(token);
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
      .limit(1)
      .maybeSingle();
    if (!membership) return json({ error: 'Not a member of this organization' }, 403);

    const newStatus = decision === 'accept' ? 'accepted'
      : decision === 'correct' ? 'corrected'
      : 'dismissed';

    // Side effects run BEFORE the status update so a failed route leaves the
    // proposal pending (retryable) instead of terminal with no effect.
    let routed: unknown = null;
    if (decision !== 'dismiss') {
      const effective = chosen ?? proposal.proposal;
      if (proposal.kind === 'disposition') {
        routed = await routeDisposition(supabaseAdmin, supabaseUrl, supabaseServiceKey, proposal, effective);
      } else if (proposal.kind === 'stage') {
        routed = await routeStage(supabaseAdmin, proposal, effective);
      } else if (proposal.kind === 'field_fill') {
        routed = await applyFieldFill(supabaseAdmin, proposal, effective);
      } else if (proposal.kind === 'next_action') {
        routed = await applyNextAction(supabaseAdmin, proposal, effective);
      }
    }

    if (routed && typeof routed === 'object' && (routed as any).error) {
      return json({ error: (routed as any).error, routed }, 502);
    }

    const { error: updErr } = await supabaseAdmin
      .from('coach_proposals')
      .update({
        status: newStatus,
        decided_by: user.id,
        decided_at: new Date().toISOString(),
        chosen: decision === 'correct' ? (chosen ?? null) : null,
      })
      .eq('id', proposalId);
    if (updErr) throw new Error(`proposal update failed: ${updErr.message}`);

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
// Router ownership checks (L167-228) are per-user: leads.user_id = userId,
// dispositions.user_id = userId, call_logs.user_id = userId. We pass the
// lead's owner (lead.user_id) so a teammate's accept still resolves.
// NOTE: disposition-router currently returns 503 DISPOSITION_AUTOMATION_NOT_TENANT_CERTIFIED
// (L89-99) until the foreman flips isDispositionAutomationTenantCertified().
async function routeDisposition(
  supabaseAdmin: any,
  supabaseUrl: string,
  serviceKey: string,
  proposal: any,
  effective: any,
): Promise<unknown> {
  const dispositionId: string | null = effective?.id ?? null;
  const dispositionName: string = effective?.name ?? '';

  const { data: lead } = await supabaseAdmin
    .from('leads')
    .select('id, user_id, organization_id')
    .eq('id', proposal.lead_id)
    .maybeSingle();
  if (!lead) return { error: 'lead not found' };
  if (lead.organization_id !== proposal.organization_id) return { error: 'lead org mismatch' };

  const resp = await fetch(`${supabaseUrl}/functions/v1/disposition-router`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${serviceKey}`,
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
      callOutcome: null,
      transcript: null,
      aiConfidence: proposal.confidence,
      setBy: 'manual',
    }),
  });
  if (resp.status === 503) {
    return { error: 'disposition-router disabled (503 DISPOSITION_AUTOMATION_NOT_TENANT_CERTIFIED)' };
  }
  const text = await resp.text();
  let parsed: unknown = text;
  try { parsed = JSON.parse(text); } catch { /* keep text */ }
  if (!resp.ok) {
    const msg = (parsed && typeof parsed === 'object' && (parsed as any).error)
      ? String((parsed as any).error)
      : `disposition-router ${resp.status}`;
    return { error: msg, status: resp.status, body: parsed };
  }
  return { status: resp.status, body: parsed };
}

// Stage: material shows no separate pipeline function; move via the atomic
// coach_move_stage RPC (delete+insert in one transaction, org-checked).
async function routeStage(
  supabaseAdmin: any,
  proposal: any,
  effective: any,
): Promise<unknown> {
  const boardId: string | null = effective?.board_id ?? effective?.stage_id ?? null;
  if (!boardId) return { skipped: 'no board_id' };
  if (!proposal.lead_id) return { skipped: 'no lead_id' };

  const { data: lead } = await supabaseAdmin
    .from('leads')
    .select('id, organization_id')
    .eq('id', proposal.lead_id)
    .maybeSingle();
  if (!lead) return { error: 'lead not found' };
  if (lead.organization_id !== proposal.organization_id) return { error: 'lead org mismatch' };

  const { error } = await supabaseAdmin.rpc('coach_move_stage', {
    p_lead_id: lead.id,
    p_org_id: proposal.organization_id,
    p_board_id: boardId,
  });
  if (error) return { error: error.message };
  return { moved_to_board: boardId };
}

// field_fill: merge into leads.custom_fields via coach_merge_custom_fields
// (single-statement jsonb ||; merge_custom_fields signature is UNKNOWN per
// LIVE-SCHEMA.md:43, so we do not call it).
async function applyFieldFill(supabaseAdmin: any, proposal: any, effective: any): Promise<unknown> {
  const fields: Record<string, unknown> = effective?.fields ?? effective ?? {};
  if (!proposal.lead_id) return { skipped: 'no lead_id' };

  const { data: lead } = await supabaseAdmin
    .from('leads')
    .select('id, organization_id')
    .eq('id', proposal.lead_id)
    .maybeSingle();
  if (!lead) return { error: 'lead not found' };
  if (lead.organization_id !== proposal.organization_id) return { error: 'lead org mismatch' };

  const { error } = await supabaseAdmin.rpc('coach_merge_custom_fields', {
    p_lead_id: lead.id,
    p_patch: fields,
  });
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

  const { data: lead } = await supabaseAdmin
    .from('leads')
    .select('id, organization_id')
    .eq('id', proposal.lead_id)
    .maybeSingle();
  if (!lead) return { error: 'lead not found' };
  if (lead.organization_id !== proposal.organization_id) return { error: 'lead org mismatch' };

  const { error } = await supabaseAdmin
    .from('leads')
    .update({ next_callback_at: whenIso })
    .eq('id', lead.id);
  if (error) return { error: error.message };
  return { next_callback_at: whenIso };
}

=== FILE: src/components/call/CoachPanel.tsx ===
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
  const lastSeqRef = useRef<number>(0);

  // Load org dispositions + boards for the "Change" dropdowns. Phase 1 adds
  // organization_id; if the org-scoped query returns nothing, fall back to the
  // caller's own rows (per-user policies still work today).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: disp } = await supabase
        .from('dispositions')
        .select('id, name')
        .eq('organization_id', organizationId);
      let dispRows = disp;
      if (!dispRows || dispRows.length === 0) {
        const { data: own } = await supabase.from('dispositions').select('id, name');
        dispRows = own;
      }
      const { data: bds } = await supabase
        .from('pipeline_boards')
        .select('id, name')
        .eq('organization_id', organizationId)
        .order('position', { ascending: true });
      let boardRows = bds;
      if (!boardRows || boardRows.length === 0) {
        const { data: own } = await supabase.from('pipeline_boards').select('id, name').order('position', { ascending: true });
        boardRows = own;
      }
      if (cancelled) return;
      setDispositions((dispRows ?? []) as DispositionOption[]);
      setBoards((boardRows ?? []) as BoardOption[]);
    })();
    return () => { cancelled = true; };
  }, [organizationId]);

  const requestSuggest = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('coach-suggest', {
        body: { call_log_id: callLogId, through_seq: lastSeqRef.current || undefined },
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
          const row = payload.new as { speaker?: string; is_final?: boolean; seq?: number };
          if (!row?.is_final) return;
          if (typeof row.seq === 'number' && row.seq > lastSeqRef.current) {
            lastSeqRef.current = row.seq;
          }
          if (row.speaker !== 'contact') return;
          if (debounceRef.current) window.clearTimeout(debounceRef.current);
          debounceRef.current = window.setTimeout(() => {
            debounceRef.current = null;
            void requestSuggest();
          }, 2500);
        },
      )
      .subscribe();
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
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

  // "Apply" for every still-pending proposal (say_next included — accept just
  // records the decision; side effects only exist for the other kinds).
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
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => decide(stage.id, 'accept')}>Accept stage</Button>
                <Button size="sm" variant="ghost" onClick={() => decide(stage.id, 'dismiss')}>Dismiss stage</Button>
              </div>
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
            {stage && stage.status !== 'pending' && (
              <span className="text-xs text-muted-foreground">stage: {stage.status}</span>
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

=== TESTS ===
```sql
-- 1. Apply migration (must run AFTER 20261029142121_phase1_org_scope.sql)
--    supabase db push   (or psql -f supabase/migrations/20261029150000_live_coach.sql)
--    Expected: no errors; table coach_proposals + functions coach_recent_corrections,
--              coach_merge_custom_fields, coach_move_stage + trigger
--              coach_proposal_decide_guard exist; call_live_transcripts in
--              supabase_realtime with REPLICA IDENTITY FULL.
--    If P4a has not shipped: ERROR 'call_live_transcripts missing — apply P4a first'.

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
--    On DB error: HTTP 500, { proposals: [], error: "..." }

-- 4. Show the 5 proposal rows
SELECT kind, status, confidence, batch_id, proposal->>'batch_id' AS proposal_batch_id
FROM public.coach_proposals
WHERE call_log_id = '<CALL_LOG_ID>'
ORDER BY created_at DESC, kind
LIMIT 5;
-- Expected: 5 rows, kinds say_next/disposition/stage/next_action/field_fill,
--           status='pending', same batch_id (column and proposal->>'batch_id' agree).

-- 5. coach_recent_corrections returns nothing yet (no decisions)
SELECT * FROM public.coach_recent_corrections(
  (SELECT organization_id FROM public.call_logs WHERE id = '<CALL_LOG_ID>'),
  'disposition', 12);
-- Expected: 0 rows.

-- 6. Second-org RLS negative test (rolled back). SET LOCAL ROLE must be at the
--    top level, not inside a DO block.
BEGIN;
DO $$
DECLARE
  v_org2 uuid;
  v_user2 uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.organizations (name, slug) VALUES ('Test Org 2', 'test-org-2-' || substr(v_user2::text,1,8))
    RETURNING id INTO v_org2;
  INSERT INTO public.organization_users (organization_id, user_id, role) VALUES (v_org2, v_user2, 'owner');
  PERFORM set_config('test.org2_user', v_user2::text, true);
END $$;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.org2_user'), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT count(*) AS visible_foreign FROM public.coach_proposals
  WHERE organization_id <> (SELECT organization_id FROM public.organization_users
                             WHERE user_id = current_setting('test.org2_user')::uuid LIMIT 1);
-- Expected: visible_foreign = 0
UPDATE public.coach_proposals SET status = 'dismissed'
  WHERE organization_id <> (SELECT organization_id FROM public.organization_users
                             WHERE user_id = current_setting('test.org2_user')::uuid LIMIT 1);
-- Expected: UPDATE 0
RESET ROLE;
ROLLBACK;

-- 7. Column-level UPDATE guard
--    As an authenticated member of the owning org:
UPDATE public.coach_proposals SET proposal = '{}'::jsonb WHERE id = '<PROPOSAL_ID>';
-- Expected: ERROR 42501 COACH_PROPOSAL_IMMUTABLE_COLUMNS

UPDATE public.coach_proposals SET status = 'accepted' WHERE id = '<PROPOSAL_ID>';
-- Expected: UPDATE 1; decided_by = auth.uid(); decided_at set.

-- 8. coach_merge_custom_fields single-statement merge
SELECT public.coach_merge_custom_fields(
  (SELECT id FROM public.leads WHERE organization_id IS NOT NULL LIMIT 1),
  '{"test_key":"test_value"}'::jsonb);
SELECT custom_fields->>'test_key' FROM public.leads
 WHERE custom_fields ? 'test_key' LIMIT 1;
-- Expected: 'test_value'

-- 9. coach_move_stage atomic move (service_role / postgres)
SELECT public.coach_move_stage(
  (SELECT id FROM public.leads WHERE organization_id IS NOT NULL LIMIT 1),
  (SELECT organization_id FROM public.leads WHERE organization_id IS NOT NULL LIMIT 1),
  (SELECT id FROM public.pipeline_boards WHERE organization_id IS NOT NULL LIMIT 1));
SELECT count(*) FROM public.lead_pipeline_positions
 WHERE lead_id = (SELECT id FROM public.leads WHERE organization_id IS NOT NULL LIMIT 1);
-- Expected: exactly 1 row for that lead.
```

```bash
# 10. coach-decide surfaces the disposition-router 503 gate as 502 and leaves
#     the proposal pending (replace <JWT>, <DISPOSITION_PROPOSAL_ID>)
curl -sS -o /tmp/out.json -w '%{http_code}\n' -X POST "$SUPABASE_URL/functions/v1/coach-decide" \
  -H "Authorization: Bearer <JWT>" -H "Content-Type: application/json" \
  -d '{"proposal_id":"<DISPOSITION_PROPOSAL_ID>","decision":"accept"}'
cat /tmp/out.json
# Expected: 502, body {"error":"disposition-router disabled (503 DISPOSITION_AUTOMATION_NOT_TENANT_CERTIFIED)",...}
psql "$DATABASE_URL" -c "SELECT status FROM public.coach_proposals WHERE id='<DISPOSITION_PROPOSAL_ID>';"
# Expected: pending
```