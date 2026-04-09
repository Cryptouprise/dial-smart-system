/**
 * api-gateway: external REST surface for Dial Smart.
 *
 * Authenticates with API keys (dsk_live_...) issued from `api_keys` table.
 * Backs the @dialsmart/mcp-server NPM package and any other external caller.
 *
 * Routes (all under /v1):
 *   GET    /v1/health
 *   GET    /v1/me
 *
 *   GET    /v1/leads                  ?status&search&limit&offset&do_not_call
 *   GET    /v1/leads/:id
 *   POST   /v1/leads                  body: { phone_number*, first_name, ... }
 *   PATCH  /v1/leads/:id              body: partial fields
 *   POST   /v1/leads/:id/dnc          marks do_not_call=true
 *
 *   GET    /v1/campaigns              ?status
 *   GET    /v1/campaigns/:id
 *   POST   /v1/campaigns/:id/launch
 *   POST   /v1/campaigns/:id/pause
 *
 *   GET    /v1/calls                  ?lead_id&campaign_id&status&since&limit
 *   GET    /v1/calls/:id              (includes transcript)
 *   POST   /v1/calls                  body: { lead_id*, agent_id?, telnyx_assistant_id? }
 *
 *   GET    /v1/sms                    ?lead_id&direction&since&limit
 *   POST   /v1/sms                    body: { to_number*, body*, lead_id?, from_number? }
 *
 *   GET    /v1/phone-numbers          ?provider&status
 *
 *   GET    /v1/system/stats           dashboard-friendly snapshot
 *   GET    /v1/credits/balance
 *
 * All responses: { success: bool, data?: ..., error?: ..., timestamp }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  authenticateApiKey,
  logApiRequest,
  requireScope,
  type ApiKeyContext,
} from "../_shared/api-auth.ts";
import {
  AuthenticationError,
  corsHeaders,
  errorResponse,
  NotFoundError,
  successResponse,
  ValidationError,
} from "../_shared/utils.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const VERSION = "0.1.0";
const API_PREFIX = "/v1";

// Selector strings — kept narrow on purpose; admin scope can request more.
const LEAD_FIELDS =
  "id,user_id,phone_number,first_name,last_name,email,company,lead_source,status,priority,tags,do_not_call,notes,last_contacted_at,next_callback_at,timezone,city,state,created_at,updated_at";
const CAMPAIGN_FIELDS =
  "id,user_id,name,description,status,provider,agent_id,telnyx_assistant_id,calls_per_minute,max_attempts,max_calls_per_day,retry_delay_minutes,calling_hours_start,calling_hours_end,timezone,workflow_id,created_at,updated_at";
const CALL_FIELDS_LIST =
  "id,user_id,lead_id,campaign_id,phone_number,caller_id,provider,status,outcome,auto_disposition,agent_id,agent_name,duration_seconds,started_at,answered_at,ended_at,sentiment,amd_result,recording_url,created_at";
const CALL_FIELDS_FULL = `${CALL_FIELDS_LIST},transcript,call_summary,ai_analysis,notes`;
const SMS_FIELDS =
  "id,user_id,lead_id,conversation_id,direction,from_number,to_number,body,status,provider_type,sent_at,delivered_at,read_at,error_message,is_ai_generated,created_at";
const PHONE_FIELDS =
  "id,user_id,number,area_code,status,provider,purpose,daily_calls,max_daily_calls,is_spam,rotation_enabled,allowed_uses,friendly_name,last_call_at,created_at";

interface RouteContext {
  ctx: ApiKeyContext;
  supabase: ReturnType<typeof createClient>;
  url: URL;
  req: Request;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const url = new URL(req.url);
  // Strip the function name prefix that Supabase prepends
  let path = url.pathname.replace(/^\/api-gateway/, "");
  if (!path.startsWith(API_PREFIX)) {
    path = API_PREFIX + (path.startsWith("/") ? path : `/${path}`);
  }
  url.pathname = path;

  // Public health check (no auth)
  if (path === "/v1/health" && req.method === "GET") {
    return successResponse({ ok: true, version: VERSION, ts: new Date().toISOString() });
  }

  const startedAt = Date.now();
  let ctx: ApiKeyContext | null = null;

  try {
    ctx = await authenticateApiKey(req, supabase);

    const routeCtx: RouteContext = { ctx, supabase, url, req };
    const response = await dispatch(path, req.method, routeCtx);

    logApiRequest(supabase, ctx, req, {
      status: response.status,
      durationMs: Date.now() - startedAt,
    });
    return response;
  } catch (err) {
    const response = errorResponse(err);
    if (ctx) {
      logApiRequest(supabase, ctx, req, {
        status: response.status,
        durationMs: Date.now() - startedAt,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return response;
  }
});

// ─── Router ────────────────────────────────────────────────────────────────────

async function dispatch(
  path: string,
  method: string,
  rc: RouteContext,
): Promise<Response> {
  // /v1/me
  if (path === "/v1/me" && method === "GET") {
    return successResponse({
      api_key_id: rc.ctx.apiKeyId,
      user_id: rc.ctx.userId,
      organization_id: rc.ctx.organizationId,
      key_name: rc.ctx.keyName,
      scopes: rc.ctx.scopes,
      rate_limit_per_minute: rc.ctx.rateLimitPerMinute,
    });
  }

  // ── Leads ───────────────────────────────────────────────────────────────────
  if (path === "/v1/leads") {
    if (method === "GET") return listLeads(rc);
    if (method === "POST") return createLead(rc);
  }
  const leadMatch = path.match(/^\/v1\/leads\/([0-9a-f-]{36})(\/dnc)?$/);
  if (leadMatch) {
    const id = leadMatch[1];
    const isDnc = !!leadMatch[2];
    if (isDnc && method === "POST") return markLeadDnc(rc, id);
    if (!isDnc && method === "GET") return getLead(rc, id);
    if (!isDnc && method === "PATCH") return updateLead(rc, id);
  }

  // ── Campaigns ───────────────────────────────────────────────────────────────
  if (path === "/v1/campaigns" && method === "GET") return listCampaigns(rc);
  const campMatch = path.match(/^\/v1\/campaigns\/([0-9a-f-]{36})(\/(launch|pause))?$/);
  if (campMatch) {
    const id = campMatch[1];
    const action = campMatch[3];
    if (!action && method === "GET") return getCampaign(rc, id);
    if (action === "launch" && method === "POST") return setCampaignStatus(rc, id, "active");
    if (action === "pause" && method === "POST") return setCampaignStatus(rc, id, "paused");
  }

  // ── Calls ───────────────────────────────────────────────────────────────────
  if (path === "/v1/calls") {
    if (method === "GET") return listCalls(rc);
    if (method === "POST") return placeCall(rc);
  }
  const callMatch = path.match(/^\/v1\/calls\/([0-9a-f-]{36})$/);
  if (callMatch && method === "GET") return getCall(rc, callMatch[1]);

  // ── SMS ─────────────────────────────────────────────────────────────────────
  if (path === "/v1/sms") {
    if (method === "GET") return listSms(rc);
    if (method === "POST") return sendSms(rc);
  }

  // ── Phone numbers ───────────────────────────────────────────────────────────
  if (path === "/v1/phone-numbers" && method === "GET") return listPhoneNumbers(rc);

  // ── System ──────────────────────────────────────────────────────────────────
  if (path === "/v1/system/stats" && method === "GET") return systemStats(rc);
  if (path === "/v1/credits/balance" && method === "GET") return creditsBalance(rc);

  throw new NotFoundError(`Unknown route: ${method} ${path}`);
}

// ─── Leads ─────────────────────────────────────────────────────────────────────

async function listLeads(rc: RouteContext): Promise<Response> {
  requireScope(rc.ctx, "leads:read");
  const { limit, offset } = paginate(rc.url);
  const status = rc.url.searchParams.get("status");
  const search = rc.url.searchParams.get("search");
  const dnc = rc.url.searchParams.get("do_not_call");

  let q = rc.supabase
    .from("leads")
    .select(LEAD_FIELDS, { count: "exact" })
    .eq("user_id", rc.ctx.userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) q = q.eq("status", status);
  if (dnc != null) q = q.eq("do_not_call", dnc === "true");
  if (search) {
    q = q.or(
      `phone_number.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`,
    );
  }

  const { data, count, error } = await q;
  if (error) throw error;
  return successResponse({ leads: data, total: count, limit, offset });
}

async function getLead(rc: RouteContext, id: string): Promise<Response> {
  requireScope(rc.ctx, "leads:read");
  const { data, error } = await rc.supabase
    .from("leads")
    .select(`${LEAD_FIELDS},custom_fields,address,zip_code`)
    .eq("user_id", rc.ctx.userId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new NotFoundError(`Lead ${id} not found`);
  return successResponse(data);
}

async function createLead(rc: RouteContext): Promise<Response> {
  requireScope(rc.ctx, "leads:write");
  const body = await safeJson(rc.req);
  if (!body.phone_number) throw new ValidationError("phone_number is required");

  const insert = {
    user_id: rc.ctx.userId,
    phone_number: String(body.phone_number),
    first_name: body.first_name ?? null,
    last_name: body.last_name ?? null,
    email: body.email ?? null,
    company: body.company ?? null,
    lead_source: body.lead_source ?? "api",
    status: body.status ?? "new",
    priority: body.priority ?? null,
    tags: Array.isArray(body.tags) ? body.tags : null,
    notes: body.notes ?? null,
    timezone: body.timezone ?? null,
    city: body.city ?? null,
    state: body.state ?? null,
    custom_fields: body.custom_fields ?? null,
  };

  const { data, error } = await rc.supabase
    .from("leads")
    .insert(insert)
    .select(LEAD_FIELDS)
    .single();
  if (error) throw error;
  return successResponse(data, 201);
}

async function updateLead(rc: RouteContext, id: string): Promise<Response> {
  requireScope(rc.ctx, "leads:write");
  const body = await safeJson(rc.req);
  const allowed: Record<string, unknown> = {};
  for (const k of [
    "first_name",
    "last_name",
    "email",
    "company",
    "lead_source",
    "status",
    "priority",
    "tags",
    "notes",
    "timezone",
    "city",
    "state",
    "do_not_call",
    "next_callback_at",
    "preferred_contact_time",
    "custom_fields",
  ]) {
    if (k in body) allowed[k] = body[k];
  }
  if (Object.keys(allowed).length === 0) {
    throw new ValidationError("No updatable fields supplied");
  }

  const { data, error } = await rc.supabase
    .from("leads")
    .update(allowed)
    .eq("user_id", rc.ctx.userId)
    .eq("id", id)
    .select(LEAD_FIELDS)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new NotFoundError(`Lead ${id} not found`);
  return successResponse(data);
}

async function markLeadDnc(rc: RouteContext, id: string): Promise<Response> {
  requireScope(rc.ctx, "leads:write");
  const { data, error } = await rc.supabase
    .from("leads")
    .update({ do_not_call: true, status: "dnc" })
    .eq("user_id", rc.ctx.userId)
    .eq("id", id)
    .select("id,phone_number,do_not_call,status")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new NotFoundError(`Lead ${id} not found`);

  // Best-effort: also add to dnc_list table if it exists
  await rc.supabase
    .from("dnc_list")
    .insert({
      user_id: rc.ctx.userId,
      phone_number: data.phone_number,
      reason: "API: marked DNC",
    })
    .then(() => {});

  return successResponse(data);
}

// ─── Campaigns ─────────────────────────────────────────────────────────────────

async function listCampaigns(rc: RouteContext): Promise<Response> {
  requireScope(rc.ctx, "campaigns:read");
  const { limit, offset } = paginate(rc.url);
  const status = rc.url.searchParams.get("status");

  let q = rc.supabase
    .from("campaigns")
    .select(CAMPAIGN_FIELDS, { count: "exact" })
    .eq("user_id", rc.ctx.userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (status) q = q.eq("status", status);

  const { data, count, error } = await q;
  if (error) throw error;
  return successResponse({ campaigns: data, total: count, limit, offset });
}

async function getCampaign(rc: RouteContext, id: string): Promise<Response> {
  requireScope(rc.ctx, "campaigns:read");
  const { data, error } = await rc.supabase
    .from("campaigns")
    .select(`${CAMPAIGN_FIELDS},script,sms_template,sms_from_number,sms_on_no_answer`)
    .eq("user_id", rc.ctx.userId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new NotFoundError(`Campaign ${id} not found`);
  return successResponse(data);
}

async function setCampaignStatus(
  rc: RouteContext,
  id: string,
  status: "active" | "paused",
): Promise<Response> {
  requireScope(rc.ctx, "campaigns:write");
  const { data, error } = await rc.supabase
    .from("campaigns")
    .update({ status })
    .eq("user_id", rc.ctx.userId)
    .eq("id", id)
    .select(CAMPAIGN_FIELDS)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new NotFoundError(`Campaign ${id} not found`);
  return successResponse(data);
}

// ─── Calls ─────────────────────────────────────────────────────────────────────

async function listCalls(rc: RouteContext): Promise<Response> {
  requireScope(rc.ctx, "calls:read");
  const { limit, offset } = paginate(rc.url);
  const leadId = rc.url.searchParams.get("lead_id");
  const campaignId = rc.url.searchParams.get("campaign_id");
  const status = rc.url.searchParams.get("status");
  const since = rc.url.searchParams.get("since");

  let q = rc.supabase
    .from("call_logs")
    .select(CALL_FIELDS_LIST, { count: "exact" })
    .eq("user_id", rc.ctx.userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (leadId) q = q.eq("lead_id", leadId);
  if (campaignId) q = q.eq("campaign_id", campaignId);
  if (status) q = q.eq("status", status);
  if (since) q = q.gte("created_at", since);

  const { data, count, error } = await q;
  if (error) throw error;
  return successResponse({ calls: data, total: count, limit, offset });
}

async function getCall(rc: RouteContext, id: string): Promise<Response> {
  requireScope(rc.ctx, "calls:read");
  const { data, error } = await rc.supabase
    .from("call_logs")
    .select(CALL_FIELDS_FULL)
    .eq("user_id", rc.ctx.userId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new NotFoundError(`Call ${id} not found`);
  return successResponse(data);
}

async function placeCall(rc: RouteContext): Promise<Response> {
  requireScope(rc.ctx, "calls:write");
  const body = await safeJson(rc.req);
  if (!body.lead_id) throw new ValidationError("lead_id is required");

  // Resolve the lead and confirm ownership
  const { data: lead, error: leadErr } = await rc.supabase
    .from("leads")
    .select("id,phone_number,first_name,last_name,do_not_call")
    .eq("user_id", rc.ctx.userId)
    .eq("id", body.lead_id)
    .maybeSingle();
  if (leadErr) throw leadErr;
  if (!lead) throw new NotFoundError(`Lead ${body.lead_id} not found`);
  if (lead.do_not_call) {
    throw new ValidationError("Lead is marked do_not_call");
  }

  // Proxy to outbound-calling edge function with service-role auth
  const upstream = await fetch(`${SUPABASE_URL}/functions/v1/outbound-calling`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({
      lead_id: lead.id,
      user_id: rc.ctx.userId,
      agent_id: body.agent_id,
      telnyx_assistant_id: body.telnyx_assistant_id,
      provider: body.provider ?? (body.telnyx_assistant_id ? "telnyx" : "retell"),
      from_api: true,
    }),
  });
  const result = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    throw new Error(
      `outbound-calling failed: ${result?.error ?? upstream.statusText}`,
    );
  }
  return successResponse({ queued: true, lead_id: lead.id, upstream: result });
}

// ─── SMS ───────────────────────────────────────────────────────────────────────

async function listSms(rc: RouteContext): Promise<Response> {
  requireScope(rc.ctx, "sms:read");
  const { limit, offset } = paginate(rc.url);
  const leadId = rc.url.searchParams.get("lead_id");
  const direction = rc.url.searchParams.get("direction");
  const since = rc.url.searchParams.get("since");

  let q = rc.supabase
    .from("sms_messages")
    .select(SMS_FIELDS, { count: "exact" })
    .eq("user_id", rc.ctx.userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (leadId) q = q.eq("lead_id", leadId);
  if (direction) q = q.eq("direction", direction);
  if (since) q = q.gte("created_at", since);

  const { data, count, error } = await q;
  if (error) throw error;
  return successResponse({ messages: data, total: count, limit, offset });
}

async function sendSms(rc: RouteContext): Promise<Response> {
  requireScope(rc.ctx, "sms:write");
  const body = await safeJson(rc.req);
  if (!body.to_number) throw new ValidationError("to_number is required");
  if (!body.body) throw new ValidationError("body is required");

  const upstream = await fetch(`${SUPABASE_URL}/functions/v1/sms-messaging`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({
      action: "send_sms",
      user_id: rc.ctx.userId,
      to_number: body.to_number,
      from_number: body.from_number,
      body: body.body,
      lead_id: body.lead_id ?? null,
    }),
  });
  const result = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    throw new Error(`sms-messaging failed: ${result?.error ?? upstream.statusText}`);
  }
  return successResponse(result);
}

// ─── Phone numbers ─────────────────────────────────────────────────────────────

async function listPhoneNumbers(rc: RouteContext): Promise<Response> {
  requireScope(rc.ctx, "system:read");
  const { limit, offset } = paginate(rc.url);
  const provider = rc.url.searchParams.get("provider");
  const status = rc.url.searchParams.get("status");

  let q = rc.supabase
    .from("phone_numbers")
    .select(PHONE_FIELDS, { count: "exact" })
    .eq("user_id", rc.ctx.userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (provider) q = q.eq("provider", provider);
  if (status) q = q.eq("status", status);

  const { data, count, error } = await q;
  if (error) throw error;
  return successResponse({ phone_numbers: data, total: count, limit, offset });
}

// ─── System / dashboards ───────────────────────────────────────────────────────

async function systemStats(rc: RouteContext): Promise<Response> {
  requireScope(rc.ctx, "system:read");
  const userId = rc.ctx.userId;
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [
    { count: totalLeads },
    { count: dncLeads },
    { count: activeCampaigns },
    { count: callsLast24h },
    { count: answeredLast24h },
    { count: smsLast24h },
    { count: activePhoneNumbers },
  ] = await Promise.all([
    rc.supabase.from("leads").select("id", { count: "exact", head: true }).eq("user_id", userId),
    rc.supabase.from("leads").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("do_not_call", true),
    rc.supabase.from("campaigns").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "active"),
    rc.supabase.from("call_logs").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", since24h),
    rc.supabase.from("call_logs").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", since24h).not("answered_at", "is", null),
    rc.supabase.from("sms_messages").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", since24h),
    rc.supabase.from("phone_numbers").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "active"),
  ]);

  return successResponse({
    leads: { total: totalLeads ?? 0, dnc: dncLeads ?? 0 },
    campaigns: { active: activeCampaigns ?? 0 },
    last_24h: {
      calls: callsLast24h ?? 0,
      answered: answeredLast24h ?? 0,
      answer_rate:
        callsLast24h && callsLast24h > 0
          ? Number(((answeredLast24h ?? 0) / callsLast24h).toFixed(3))
          : null,
      sms: smsLast24h ?? 0,
    },
    phone_numbers: { active: activePhoneNumbers ?? 0 },
    generated_at: new Date().toISOString(),
  });
}

async function creditsBalance(rc: RouteContext): Promise<Response> {
  requireScope(rc.ctx, "system:read");
  if (!rc.ctx.organizationId) {
    return successResponse({ billing_enabled: false, message: "No organization linked to this key" });
  }
  const { data, error } = await rc.supabase
    .from("organization_credits")
    .select("balance_cents,cost_per_minute_cents,low_balance_threshold_cents,auto_recharge_enabled,updated_at")
    .eq("organization_id", rc.ctx.organizationId)
    .maybeSingle();
  if (error) throw error;
  return successResponse(data ?? { balance_cents: 0, billing_enabled: false });
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function paginate(url: URL): { limit: number; offset: number } {
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 1), 200);
  const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10) || 0, 0);
  return { limit, offset };
}

async function safeJson(req: Request): Promise<Record<string, any>> {
  try {
    const text = await req.text();
    if (!text) return {};
    return JSON.parse(text);
  } catch {
    throw new ValidationError("Invalid JSON body");
  }
}
