/**
 * coach-decide  (POST { proposal_id: uuid, decision: 'accept'|'correct'|'dismiss', chosen?: object })
 *
 * Records the rep's decision on one coach proposal and, for accept/correct,
 * applies the side effect FIRST. The row is marked accepted/corrected ONLY
 * after the side effect succeeded; on failure it stays 'pending' and the error
 * is returned (502 for a downstream failure, 400 for a bad choice).
 *
 * Side effects by kind:
 *   disposition -> the LIVE disposition-router (supabase/functions-live/
 *                  disposition-router/index.ts), action 'process_disposition'.
 *                  The coach never moves a lead itself.
 *   stage       -> public.coach_move_stage(lead, org, board) (atomic RPC).
 *   field_fill  -> public.merge_custom_fields(p_lead_id, p_updates) (exists live).
 *   next_action -> type 'callback' with when_iso sets leads.next_callback_at.
 *   say_next    -> none (decision is recorded for learning only).
 *
 * Auth: caller JWT + membership in the proposal's company. Every lookup is
 * company-scoped; dispositions/boards fall back to the call owner's rows with
 * organization_id IS NULL while backfill completes.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Decision = 'accept' | 'correct' | 'dismiss';
const DECISIONS: Decision[] = ['accept', 'correct', 'dismiss'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FIELD_KEY_RE = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;
const FIELD_FILL_MAX_KEYS = 12;
const ROUTER_TIMEOUT_MS = 12_000;

// The live router scans `transcript` for phrases such as "lawyer" and
// "threatening" and auto-DNCs the lead (functions-live/disposition-router
// L294-328, phrase list L295-306). In a solar-exit conversation the word
// "lawyer" is routine, so the coach does NOT forward the transcript. Flip only
// after that list is reviewed.
const SEND_TRANSCRIPT_TO_ROUTER = false;

type SideEffect =
  | { ok: true; detail: Record<string, unknown> }
  | { ok: false; error: string; status: number; detail?: unknown };

interface ProposalRow {
  id: string;
  organization_id: string;
  call_log_id: string;
  lead_id: string | null;
  kind: 'say_next' | 'disposition' | 'stage' | 'next_action' | 'field_fill';
  proposal: Record<string, unknown>;
  confidence: number | null;
  status: string;
}

interface Ctx {
  supabaseAdmin: ReturnType<typeof createClient>;
  supabaseUrl: string;
  serviceKey: string;
  organizationId: string;
  callOwnerId: string;
  leadId: string;
  scopeOr: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      return json({ error: 'Supabase configuration missing' }, 500);
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });
    const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });

    // --- Caller JWT -------------------------------------------------------
    const authHeader = req.headers.get('authorization');
    if (!authHeader) return json({ error: 'Missing authorization' }, 401);
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: { user }, error: authError } = await supabaseAnon.auth.getUser(token);
    if (authError || !user) return json({ error: 'Unauthorized' }, 401);

    // --- Body ---------------------------------------------------------------
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const proposalId = typeof body.proposal_id === 'string' ? body.proposal_id : '';
    const decision = body.decision as Decision;
    const chosen = (body.chosen && typeof body.chosen === 'object' && !Array.isArray(body.chosen))
      ? body.chosen as Record<string, unknown>
      : undefined;
    if (!UUID_RE.test(proposalId)) return json({ error: 'proposal_id (uuid) is required' }, 400);
    if (!DECISIONS.includes(decision)) return json({ error: 'decision must be accept|correct|dismiss' }, 400);
    if (decision === 'correct' && !chosen) return json({ error: 'chosen is required for decision=correct' }, 400);

    // --- Proposal + membership ---------------------------------------------
    const { data: proposalRaw, error: propErr } = await supabaseAdmin
      .from('coach_proposals')
      .select('id, organization_id, call_log_id, lead_id, kind, proposal, confidence, status')
      .eq('id', proposalId)
      .maybeSingle();
    if (propErr) throw new Error(`proposal lookup failed: ${propErr.message}`);
    if (!proposalRaw) return json({ error: 'Proposal not found' }, 404);
    const proposal = proposalRaw as ProposalRow;
    const organizationId = proposal.organization_id;

    const { data: membership, error: memErr } = await supabaseAdmin
      .from('organization_users')
      .select('organization_id')
      .eq('user_id', user.id)
      .eq('organization_id', organizationId)
      .limit(1)
      .maybeSingle();
    if (memErr) throw new Error(`membership lookup failed: ${memErr.message}`);
    if (!membership) return json({ error: 'Not a member of this organization' }, 403);

    if (proposal.status !== 'pending') {
      return json({ error: `Proposal is already ${proposal.status}`, status: proposal.status }, 409);
    }

    // --- Call owner (the router is per-user; mirror today's callers which
    //     pass the call's user_id) --------------------------------------------
    const { data: callLog, error: callErr } = await supabaseAdmin
      .from('call_logs')
      .select('id, user_id, organization_id')
      .eq('id', proposal.call_log_id)
      .eq('organization_id', organizationId)
      .maybeSingle();
    if (callErr) throw new Error(`call_log lookup failed: ${callErr.message}`);
    if (!callLog) return json({ error: 'Call log is not in this organization' }, 403);

    const newStatus = decision === 'accept' ? 'accepted' : decision === 'correct' ? 'corrected' : 'dismissed';

    // --- Side effect FIRST (accept/correct only) ----------------------------
    let effect: SideEffect = { ok: true, detail: { skipped: decision === 'dismiss' ? 'dismissed' : 'no side effect for this kind' } };
    if (decision !== 'dismiss' && proposal.kind !== 'say_next') {
      if (!proposal.lead_id) {
        effect = { ok: false, error: 'Proposal has no lead; nothing to apply', status: 400 };
      } else {
        const ctx: Ctx = {
          supabaseAdmin,
          supabaseUrl,
          serviceKey: supabaseServiceKey,
          organizationId,
          callOwnerId: callLog.user_id,
          leadId: proposal.lead_id,
          scopeOr: `organization_id.eq.${organizationId},and(organization_id.is.null,user_id.eq.${callLog.user_id})`,
        };
        // The lead must be in this company (every lookup is company-scoped).
        const { data: lead, error: leadErr } = await supabaseAdmin
          .from('leads')
          .select('id, user_id, organization_id')
          .eq('id', proposal.lead_id)
          .eq('organization_id', organizationId)
          .maybeSingle();
        if (leadErr) throw new Error(`lead lookup failed: ${leadErr.message}`);
        if (!lead) {
          effect = { ok: false, error: 'Lead is not in this organization', status: 403 };
        } else {
          const effective = decision === 'correct' ? (chosen as Record<string, unknown>) : proposal.proposal;
          switch (proposal.kind) {
            case 'disposition':
              effect = await routeDisposition(ctx, proposal, effective, decision);
              break;
            case 'stage':
              effect = await routeStage(ctx, effective);
              break;
            case 'field_fill':
              effect = await applyFieldFill(ctx, effective);
              break;
            case 'next_action':
              effect = await applyNextAction(ctx, effective);
              break;
          }
        }
      }
    }

    if (!effect.ok) {
      // Row stays 'pending' so the rep can retry or Change.
      return json({ error: effect.error, detail: effect.detail ?? null, status: 'pending' }, effect.status);
    }

    // --- Record the decision (only after the side effect succeeded) ---------
    const { data: updated, error: updErr } = await supabaseAdmin
      .from('coach_proposals')
      .update({
        status: newStatus,
        decided_by: user.id,
        decided_at: new Date().toISOString(),
        chosen: decision === 'correct' ? (chosen ?? null) : null,
      })
      .eq('id', proposalId)
      .eq('status', 'pending')
      .select('id, status');
    if (updErr) throw new Error(`proposal update failed: ${updErr.message}`);
    if (!updated || updated.length === 0) {
      // Lost a race (expired/decided meanwhile). The side effect already ran;
      // report it honestly so the panel can refresh.
      return json({ error: 'Proposal was decided or expired concurrently; the side effect was applied', routed: effect.detail }, 409);
    }

    return json({ ok: true, status: newStatus, routed: effect.detail }, 200);
  } catch (error) {
    console.error('[coach-decide] error:', error);
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// ---------------------------------------------------------------------------

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

/**
 * LIVE disposition-router contract (supabase/functions-live/disposition-router/index.ts,
 * byte-exact deployed source, 698 lines):
 *   auth    L133-158 Authorization: Bearer <token>; getUser(token) L147; rejected
 *                    only if that fails AND token !== SUPABASE_SERVICE_ROLE_KEY (L148).
 *   body    L160     { action, leadId, userId, dispositionName, dispositionId,
 *                      callOutcome, transcript, callId, aiConfidence, setBy }
 *   action  L182     'process_disposition'   (L162 'health_check' also exists)
 *   userId  L88 (rules), L220 (disposition_auto_actions), L233-240 + L313-320
 *                    (dnc_list), L361 -> L632-691 (board lookup .eq('user_id') L635,
 *                    auto-create L680-691), L363-373 (position upsert, onConflict
 *                    'lead_id,user_id' L372), L385-394 (reachability_events),
 *                    L404-433 (disposition_metrics; set_by_user_id L411).
 *   lead    L188, L231, L242-245, L277-280: read/updated by leadId only; the live
 *                    router has NO ownership check on leads, so we scope here.
 *   dispositionId L331: pipeline_stage/name looked up by id (no user filter);
 *                    stage name normalized L333-357.
 *   callId  L201-210: call_logs.ended_at/campaign_id for metrics.
 *   result  L440-448 200 { success: true, actions: string[] }; any throw ->
 *                    L451-462 500 { error }; unknown action L450.
 *                    There is NO 503 certification gate live.
 */
async function routeDisposition(
  ctx: Ctx,
  proposal: ProposalRow,
  effective: Record<string, unknown>,
  decision: Decision,
): Promise<SideEffect> {
  const idIn = typeof effective?.id === 'string' && UUID_RE.test(effective.id) ? effective.id : null;
  const nameIn = typeof effective?.name === 'string' ? effective.name.trim() : '';
  if (!idIn && !nameIn) return { ok: false, error: 'No disposition chosen; use Change to pick one', status: 400 };

  // Resolve to a disposition this company actually has (by id, else exact name).
  let query = ctx.supabaseAdmin.from('dispositions').select('id, name, pipeline_stage').or(ctx.scopeOr);
  query = idIn ? query.eq('id', idIn) : query.ilike('name', nameIn);
  const { data: dispRows, error: dispErr } = await query.limit(2);
  if (dispErr) return { ok: false, error: `dispositions lookup failed: ${dispErr.message}`, status: 500 };
  const disposition = (dispRows ?? [])[0] as { id: string; name: string; pipeline_stage: string | null } | undefined;
  if (!disposition) {
    return { ok: false, error: `Disposition "${nameIn || idIn}" is not one of this company's dispositions; use Change to pick one`, status: 400 };
  }

  const payload = {
    action: 'process_disposition',
    leadId: ctx.leadId,
    userId: ctx.callOwnerId,
    dispositionId: disposition.id,
    dispositionName: disposition.name,
    callOutcome: disposition.name,
    transcript: SEND_TRANSCRIPT_TO_ROUTER ? await loadTranscriptText(ctx, proposal.call_log_id) : null,
    callId: proposal.call_log_id,
    aiConfidence: decision === 'accept' ? (proposal.confidence ?? null) : null,
    setBy: 'manual',
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ROUTER_TIMEOUT_MS);
  let resp: Response;
  try {
    resp = await fetch(`${ctx.supabaseUrl}/functions/v1/disposition-router`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ctx.serviceKey}`,
        'apikey': ctx.serviceKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    const msg = e instanceof Error && e.name === 'AbortError'
      ? `disposition-router timed out after ${ROUTER_TIMEOUT_MS} ms`
      : `disposition-router unreachable: ${e instanceof Error ? e.message : String(e)}`;
    return { ok: false, error: msg, status: 502 };
  }
  clearTimeout(timer);

  const text = await resp.text();
  let parsed: unknown = text;
  try { parsed = JSON.parse(text); } catch { /* keep raw text */ }

  if (!resp.ok) {
    const msg = parsed && typeof parsed === 'object' && typeof (parsed as { error?: unknown }).error === 'string'
      ? String((parsed as { error: string }).error)
      : `disposition-router returned ${resp.status}`;
    return { ok: false, error: msg, status: 502, detail: { router_status: resp.status, body: parsed } };
  }
  return {
    ok: true,
    detail: {
      via: 'disposition-router',
      disposition_id: disposition.id,
      disposition_name: disposition.name,
      router_status: resp.status,
      actions: (parsed as { actions?: unknown })?.actions ?? null,
    },
  };
}

async function loadTranscriptText(ctx: Ctx, callLogId: string): Promise<string | null> {
  const { data } = await ctx.supabaseAdmin
    .from('call_live_transcripts')
    .select('seq, speaker, text')
    .eq('call_log_id', callLogId)
    .eq('organization_id', ctx.organizationId)
    .eq('is_final', true)
    .order('seq', { ascending: true })
    .limit(200);
  if (!data || data.length === 0) return null;
  return (data as Array<{ speaker: string; text: string }>).map((t) => `${t.speaker}: ${t.text}`).join('\n');
}

// Stage: the live router only moves stages derived from a disposition's
// pipeline_stage/name (L329-383) or from disposition_auto_actions config
// (move_to_stage L488-507), never from a board id in the request, so an explicit
// board move uses our atomic, company-scoped RPC.
async function routeStage(ctx: Ctx, effective: Record<string, unknown>): Promise<SideEffect> {
  const boardId = typeof effective?.board_id === 'string' && UUID_RE.test(effective.board_id)
    ? effective.board_id
    : (typeof effective?.stage_id === 'string' && UUID_RE.test(effective.stage_id) ? effective.stage_id : null);
  if (!boardId) return { ok: false, error: 'No stage chosen; use Change to pick one', status: 400 };

  const { data, error } = await ctx.supabaseAdmin.rpc('coach_move_stage', {
    p_lead_id: ctx.leadId,
    p_org_id: ctx.organizationId,
    p_board_id: boardId,
  });
  if (error) {
    const notInOrg = /not in organization/i.test(error.message);
    return { ok: false, error: notInOrg ? 'That stage is not one of this company\'s stages' : error.message, status: notInOrg ? 400 : 502 };
  }
  return { ok: true, detail: { via: 'coach_move_stage', ...(data as Record<string, unknown> ?? { board_id: boardId }) } };
}

// field_fill: merge into leads.custom_fields through the live RPC
// merge_custom_fields(p_lead_id uuid, p_updates jsonb) (SECURITY DEFINER,
// service_role only). The lead was already verified to be in this company.
async function applyFieldFill(ctx: Ctx, effective: Record<string, unknown>): Promise<SideEffect> {
  const raw = (effective?.fields && typeof effective.fields === 'object') ? effective.fields : effective;
  const fields = sanitizeFields(raw);
  if (Object.keys(fields).length === 0) return { ok: true, detail: { skipped: 'no valid fields to merge' } };

  const { data, error } = await ctx.supabaseAdmin.rpc('merge_custom_fields', {
    p_lead_id: ctx.leadId,
    p_updates: fields,
  });
  if (error) return { ok: false, error: `merge_custom_fields failed: ${error.message}`, status: 502 };
  return { ok: true, detail: { via: 'merge_custom_fields', merged_keys: Object.keys(fields), custom_fields: data ?? null } };
}

// next_action: 'callback' with a valid when_iso sets leads.next_callback_at
// (column confirmed LIVE-SCHEMA.md:4). Other types are recorded only.
async function applyNextAction(ctx: Ctx, effective: Record<string, unknown>): Promise<SideEffect> {
  const type = typeof effective?.type === 'string' ? effective.type : 'none';
  if (type !== 'callback') return { ok: true, detail: { skipped: `next_action type=${type} has no automatic side effect` } };
  const when = typeof effective?.when_iso === 'string' ? new Date(effective.when_iso) : null;
  if (!when || Number.isNaN(when.getTime())) return { ok: false, error: 'Callback needs a valid time (when_iso)', status: 400 };
  if (when.getTime() < Date.now() - 60_000) return { ok: false, error: 'Callback time is in the past', status: 400 };

  const { data, error } = await ctx.supabaseAdmin
    .from('leads')
    .update({ next_callback_at: when.toISOString() })
    .eq('id', ctx.leadId)
    .eq('organization_id', ctx.organizationId)
    .select('id');
  if (error) return { ok: false, error: `next_callback_at update failed: ${error.message}`, status: 502 };
  if (!data || data.length === 0) return { ok: false, error: 'Lead not found in this organization', status: 403 };
  return { ok: true, detail: { via: 'leads.next_callback_at', next_callback_at: when.toISOString() } };
}

function sanitizeFields(input: unknown): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (Object.keys(out).length >= FIELD_FILL_MAX_KEYS) break;
    if (!FIELD_KEY_RE.test(k)) continue;
    if (v === null || typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'string') {
      const s = v.trim().slice(0, 200);
      if (s) out[k] = s;
    }
  }
  return out;
}
