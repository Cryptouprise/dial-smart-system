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

const VERSION = "0.2.0";
const API_PREFIX = "/v1";

/**
 * Structured JSON log line. One line per request so they're greppable in
 * Supabase logs: grep '"component":"api-gateway"' | jq .
 */
function slog(
  level: "info" | "warn" | "error",
  event: string,
  fields: Record<string, unknown> = {},
): void {
  console.log(
    JSON.stringify({
      component: "api-gateway",
      level,
      event,
      ts: new Date().toISOString(),
      ...fields,
    }),
  );
}

/**
 * Generate a short correlation ID for a request so logs can be grouped.
 */
function newRequestId(): string {
  return crypto.randomUUID().slice(0, 8);
}

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
  requestId: string;
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

  const requestId = newRequestId();
  const startedAt = Date.now();
  let ctx: ApiKeyContext | null = null;

  try {
    ctx = await authenticateApiKey(req, supabase);

    const routeCtx: RouteContext = { ctx, supabase, url, req, requestId };
    const response = await dispatch(path, req.method, routeCtx);

    const durationMs = Date.now() - startedAt;
    slog("info", "request", {
      request_id: requestId,
      key_id: ctx.apiKeyId,
      user_id: ctx.userId,
      method: req.method,
      path,
      status: response.status,
      duration_ms: durationMs,
    });
    logApiRequest(supabase, ctx, req, {
      status: response.status,
      durationMs,
    });
    return response;
  } catch (err) {
    const response = errorResponse(err);
    const durationMs = Date.now() - startedAt;
    const errMsg = err instanceof Error ? err.message : String(err);
    slog("warn", "request_failed", {
      request_id: requestId,
      key_id: ctx?.apiKeyId ?? null,
      user_id: ctx?.userId ?? null,
      method: req.method,
      path,
      status: response.status,
      duration_ms: durationMs,
      error: errMsg,
    });
    if (ctx) {
      logApiRequest(supabase, ctx, req, {
        status: response.status,
        durationMs,
        error: errMsg,
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

  // ── Leads (extended) ────────────────────────────────────────────────────────
  if (path === "/v1/leads/search" && method === "POST") return searchLeads(rc);

  // ── Campaigns ───────────────────────────────────────────────────────────────
  if (path === "/v1/campaigns" && method === "GET") return listCampaigns(rc);
  const campMatch = path.match(
    /^\/v1\/campaigns\/([0-9a-f-]{36})(\/(launch|pause|validate|live-stats|disposition-breakdown|retry-failed|force-dispatch|dry-run|pre-launch-audit))?$/,
  );
  if (campMatch) {
    const id = campMatch[1];
    const action = campMatch[3];
    if (!action && method === "GET") return getCampaign(rc, id);
    if (action === "launch" && method === "POST") return setCampaignStatus(rc, id, "active");
    if (action === "pause" && method === "POST") return setCampaignStatus(rc, id, "paused");
    if (action === "validate" && method === "GET") return validateCampaign(rc, id);
    if (action === "live-stats" && method === "GET") return campaignLiveStats(rc, id);
    if (action === "disposition-breakdown" && method === "GET") return dispositionBreakdown(rc, id);
    if (action === "retry-failed" && method === "POST") return retryFailedCalls(rc, id);
    if (action === "force-dispatch" && method === "POST") return forceDispatch(rc, id);
    if (action === "dry-run" && method === "POST") return dryRunCampaign(rc, id);
    if (action === "pre-launch-audit" && method === "GET") return preLaunchAudit(rc, id);
  }

  // ── Calls ───────────────────────────────────────────────────────────────────
  if (path === "/v1/calls") {
    if (method === "GET") return listCalls(rc);
    if (method === "POST") return placeCall(rc);
  }
  if (path === "/v1/calls/stuck" && method === "GET") return findStuckCalls(rc);
  const callMatch = path.match(/^\/v1\/calls\/([0-9a-f-]{36})$/);
  if (callMatch && method === "GET") return getCall(rc, callMatch[1]);

  // ── SMS ─────────────────────────────────────────────────────────────────────
  if (path === "/v1/sms") {
    if (method === "GET") return listSms(rc);
    if (method === "POST") return sendSms(rc);
  }

  // ── Phone numbers ───────────────────────────────────────────────────────────
  if (path === "/v1/phone-numbers" && method === "GET") return listPhoneNumbers(rc);
  if (path === "/v1/phone-numbers/health" && method === "GET") return phoneNumberHealth(rc);

  // ── System ──────────────────────────────────────────────────────────────────
  if (path === "/v1/system/stats" && method === "GET") return systemStats(rc);
  if (path === "/v1/system/health-check" && method === "GET") return deepHealthCheck(rc);
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

  const insert: Record<string, unknown> = {
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
  // If the key is linked to an org, propagate it (phase 2 multi-tenancy).
  if (rc.ctx.organizationId) insert.organization_id = rc.ctx.organizationId;

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

// ─── Campaign operational tools ────────────────────────────────────────────────
//
// These are the "daily driver" endpoints for running real campaigns. They
// answer questions like: "is this campaign safe to launch?", "what's
// happening right now?", "retry the calls that failed in the last hour",
// "are any numbers getting flagged?". Everything is user-scoped.

interface CheckResult {
  check: string;
  status: "pass" | "warn" | "fail";
  message: string;
  data?: unknown;
}

async function validateCampaign(rc: RouteContext, id: string): Promise<Response> {
  requireScope(rc.ctx, "campaigns:read");
  const checks: CheckResult[] = [];

  const { data: campaign, error } = await rc.supabase
    .from("campaigns")
    .select(
      `${CAMPAIGN_FIELDS},script,sms_template,sms_from_number`,
    )
    .eq("user_id", rc.ctx.userId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!campaign) throw new NotFoundError(`Campaign ${id} not found`);

  // Agent / assistant assigned
  if (campaign.agent_id || campaign.telnyx_assistant_id) {
    checks.push({
      check: "agent_assigned",
      status: "pass",
      message: `Provider=${campaign.provider}, agent=${campaign.agent_id ?? campaign.telnyx_assistant_id}`,
    });
  } else {
    checks.push({
      check: "agent_assigned",
      status: "fail",
      message: "No Retell agent or Telnyx assistant assigned to this campaign.",
    });
  }

  // Retries configured
  if ((campaign.max_attempts ?? 1) < 2) {
    checks.push({
      check: "retries_configured",
      status: "warn",
      message: `max_attempts=${campaign.max_attempts ?? 1}. Recommend >=3 so no_answer/busy/failed get retried.`,
    });
  } else {
    checks.push({
      check: "retries_configured",
      status: "pass",
      message: `max_attempts=${campaign.max_attempts}, retry_delay_minutes=${campaign.retry_delay_minutes ?? "default"}`,
    });
  }

  // Calling hours
  if (campaign.calling_hours_start && campaign.calling_hours_end) {
    checks.push({
      check: "calling_hours",
      status: "pass",
      message: `${campaign.calling_hours_start} - ${campaign.calling_hours_end} ${campaign.timezone ?? ""}`,
    });
  } else {
    checks.push({
      check: "calling_hours",
      status: "warn",
      message: "Calling hours not set — will use global defaults (9am-9pm).",
    });
  }

  // Pacing
  const pace = campaign.calls_per_minute ?? 0;
  if (pace <= 0) {
    checks.push({ check: "pacing", status: "fail", message: "calls_per_minute not set" });
  } else if (pace > 200) {
    checks.push({
      check: "pacing",
      status: "warn",
      message: `calls_per_minute=${pace} is very aggressive. Monitor error rate closely.`,
    });
  } else {
    checks.push({ check: "pacing", status: "pass", message: `${pace} calls/minute` });
  }

  // Leads assigned via dialing_queues
  const { count: queueCount, error: qErr } = await rc.supabase
    .from("dialing_queues")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", id);
  if (qErr) throw qErr;

  if (!queueCount || queueCount === 0) {
    checks.push({
      check: "leads_queued",
      status: "warn",
      message: "No leads in dialing_queues yet. Dispatcher will queue them on first run.",
    });
  } else {
    checks.push({
      check: "leads_queued",
      status: "pass",
      message: `${queueCount} leads in dialing_queues`,
    });
  }

  // Phone number availability for the campaign's provider
  const provider = campaign.provider ?? "retell";
  const phoneQ = rc.supabase
    .from("phone_numbers")
    .select("id,number,status,is_spam,rotation_enabled,daily_calls,max_daily_calls,quarantine_until,retell_phone_id", { count: "exact" })
    .eq("user_id", rc.ctx.userId)
    .eq("status", "active")
    .eq("is_spam", false);
  if (provider === "telnyx") {
    phoneQ.eq("provider", "telnyx");
  } else if (provider === "retell") {
    phoneQ.not("retell_phone_id", "is", null);
  }
  const { data: numbers, count: numCount, error: numErr } = await phoneQ;
  if (numErr) throw numErr;

  if (!numCount || numCount === 0) {
    checks.push({
      check: "phone_numbers",
      status: "fail",
      message: `No active, non-spam ${provider} phone numbers available.`,
    });
  } else {
    const quarantined = (numbers ?? []).filter((n: any) => n.quarantine_until && new Date(n.quarantine_until) > new Date()).length;
    const overCap = (numbers ?? []).filter((n: any) => n.max_daily_calls && n.daily_calls >= n.max_daily_calls).length;
    const usable = numCount - quarantined - overCap;
    checks.push({
      check: "phone_numbers",
      status: usable > 0 ? "pass" : "warn",
      message: `${numCount} active ${provider} numbers (${usable} usable, ${quarantined} quarantined, ${overCap} at daily cap)`,
      data: { total: numCount, usable, quarantined, over_cap: overCap },
    });
  }

  const ready = checks.every((c) => c.status !== "fail");
  const hasWarnings = checks.some((c) => c.status === "warn");

  return successResponse({
    campaign_id: id,
    campaign_name: campaign.name,
    status: campaign.status,
    ready,
    has_warnings: hasWarnings,
    checks,
  });
}

async function campaignLiveStats(rc: RouteContext, id: string): Promise<Response> {
  requireScope(rc.ctx, "campaigns:read");

  // Confirm ownership
  const { data: camp, error: cErr } = await rc.supabase
    .from("campaigns")
    .select("id,name,status,calls_per_minute")
    .eq("user_id", rc.ctx.userId)
    .eq("id", id)
    .maybeSingle();
  if (cErr) throw cErr;
  if (!camp) throw new NotFoundError(`Campaign ${id} not found`);

  const since1h = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const since5m = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const [
    { count: queuePending },
    { count: queueCalling },
    { count: queueCompleted },
    { count: queueFailed },
    { count: callsLast1h },
    { count: answeredLast1h },
    { count: callsLast5m },
    { data: lastCall },
  ] = await Promise.all([
    rc.supabase.from("dialing_queues").select("id", { count: "exact", head: true }).eq("campaign_id", id).eq("status", "pending"),
    rc.supabase.from("dialing_queues").select("id", { count: "exact", head: true }).eq("campaign_id", id).eq("status", "calling"),
    rc.supabase.from("dialing_queues").select("id", { count: "exact", head: true }).eq("campaign_id", id).eq("status", "completed"),
    rc.supabase.from("dialing_queues").select("id", { count: "exact", head: true }).eq("campaign_id", id).eq("status", "failed"),
    rc.supabase.from("call_logs").select("id", { count: "exact", head: true }).eq("user_id", rc.ctx.userId).eq("campaign_id", id).gte("created_at", since1h),
    rc.supabase.from("call_logs").select("id", { count: "exact", head: true }).eq("user_id", rc.ctx.userId).eq("campaign_id", id).gte("created_at", since1h).not("answered_at", "is", null),
    rc.supabase.from("call_logs").select("id", { count: "exact", head: true }).eq("user_id", rc.ctx.userId).eq("campaign_id", id).gte("created_at", since5m),
    rc.supabase.from("call_logs").select("id,created_at,status,outcome").eq("user_id", rc.ctx.userId).eq("campaign_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const last5mPace = (callsLast5m ?? 0) / 5; // calls per minute in last 5 min
  const answerRate1h = callsLast1h && callsLast1h > 0
    ? Number(((answeredLast1h ?? 0) / callsLast1h).toFixed(3))
    : null;

  return successResponse({
    campaign_id: id,
    name: camp.name,
    status: camp.status,
    configured_pace_per_minute: camp.calls_per_minute,
    actual_pace_per_minute_last_5m: Number(last5mPace.toFixed(1)),
    queue: {
      pending: queuePending ?? 0,
      calling: queueCalling ?? 0,
      completed: queueCompleted ?? 0,
      failed: queueFailed ?? 0,
    },
    last_1h: {
      calls: callsLast1h ?? 0,
      answered: answeredLast1h ?? 0,
      answer_rate: answerRate1h,
    },
    last_call: lastCall
      ? {
          id: (lastCall as any).id,
          status: (lastCall as any).status,
          outcome: (lastCall as any).outcome,
          at: (lastCall as any).created_at,
        }
      : null,
    generated_at: new Date().toISOString(),
  });
}

async function dispositionBreakdown(rc: RouteContext, id: string): Promise<Response> {
  requireScope(rc.ctx, "campaigns:read");
  const hours = Math.max(1, Math.min(parseInt(rc.url.searchParams.get("hours") ?? "1", 10) || 1, 168));
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const { data, error } = await rc.supabase
    .from("call_logs")
    .select("status,outcome,auto_disposition,amd_result")
    .eq("user_id", rc.ctx.userId)
    .eq("campaign_id", id)
    .gte("created_at", since);
  if (error) throw error;

  const rows = (data ?? []) as Array<Record<string, string | null>>;
  const byStatus: Record<string, number> = {};
  const byOutcome: Record<string, number> = {};
  const byDisposition: Record<string, number> = {};
  const byAmd: Record<string, number> = {};

  for (const r of rows) {
    byStatus[r.status ?? "unknown"] = (byStatus[r.status ?? "unknown"] ?? 0) + 1;
    if (r.outcome) byOutcome[r.outcome] = (byOutcome[r.outcome] ?? 0) + 1;
    const d = r.auto_disposition ?? r.outcome;
    if (d) byDisposition[d] = (byDisposition[d] ?? 0) + 1;
    if (r.amd_result) byAmd[r.amd_result] = (byAmd[r.amd_result] ?? 0) + 1;
  }

  return successResponse({
    campaign_id: id,
    window_hours: hours,
    total: rows.length,
    by_status: byStatus,
    by_outcome: byOutcome,
    by_disposition: byDisposition,
    by_amd: byAmd,
  });
}

async function retryFailedCalls(rc: RouteContext, id: string): Promise<Response> {
  requireScope(rc.ctx, "campaigns:write");
  const body = await safeJson(rc.req).catch(() => ({}));
  const withinMinutes = Math.max(1, Math.min(parseInt(String(body.within_minutes ?? "60"), 10) || 60, 1440));
  const maxRequeue = Math.max(1, Math.min(parseInt(String(body.max ?? "500"), 10) || 500, 2000));

  // Confirm ownership
  const { data: camp, error: cErr } = await rc.supabase
    .from("campaigns")
    .select("id,max_attempts")
    .eq("user_id", rc.ctx.userId)
    .eq("id", id)
    .maybeSingle();
  if (cErr) throw cErr;
  if (!camp) throw new NotFoundError(`Campaign ${id} not found`);

  const since = new Date(Date.now() - withinMinutes * 60 * 1000).toISOString();

  // Find failed queue entries in that window
  const { data: failedQ, error: qErr } = await rc.supabase
    .from("dialing_queues")
    .select("id,lead_id,attempts,max_attempts,phone_number")
    .eq("campaign_id", id)
    .eq("status", "failed")
    .gte("updated_at", since)
    .limit(maxRequeue);
  if (qErr) throw qErr;

  const eligible = (failedQ ?? []).filter(
    (q: any) => (q.attempts ?? 0) < (q.max_attempts ?? camp.max_attempts ?? 3),
  );

  if (eligible.length === 0) {
    return successResponse({ requeued: 0, eligible: 0, scanned: failedQ?.length ?? 0, window_minutes: withinMinutes });
  }

  const ids = eligible.map((q: any) => q.id);
  const { error: upErr } = await rc.supabase
    .from("dialing_queues")
    .update({
      status: "pending",
      scheduled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .in("id", ids);
  if (upErr) throw upErr;

  return successResponse({
    requeued: eligible.length,
    eligible: eligible.length,
    scanned: failedQ?.length ?? 0,
    window_minutes: withinMinutes,
  });
}

async function forceDispatch(rc: RouteContext, id: string): Promise<Response> {
  requireScope(rc.ctx, "campaigns:write");

  // Confirm ownership
  const { data: camp, error } = await rc.supabase
    .from("campaigns")
    .select("id,name,status")
    .eq("user_id", rc.ctx.userId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!camp) throw new NotFoundError(`Campaign ${id} not found`);

  const upstream = await fetch(`${SUPABASE_URL}/functions/v1/call-dispatcher`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({
      action: "dispatch",
      immediate: true,
      internal: true,
      userId: rc.ctx.userId,
      campaignId: id,
    }),
  });
  const result = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    throw new Error(`call-dispatcher failed: ${result?.error ?? upstream.statusText}`);
  }
  return successResponse({ dispatched: true, campaign_id: id, upstream: result });
}

async function dryRunCampaign(rc: RouteContext, id: string): Promise<Response> {
  requireScope(rc.ctx, "campaigns:read");

  const { data: camp, error } = await rc.supabase
    .from("campaigns")
    .select("id,name,status,provider,agent_id,telnyx_assistant_id,calls_per_minute,max_attempts,calling_hours_start,calling_hours_end,timezone")
    .eq("user_id", rc.ctx.userId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!camp) throw new NotFoundError(`Campaign ${id} not found`);

  // How many leads would be eligible right now?
  const { count: pendingQ } = await rc.supabase
    .from("dialing_queues")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", id)
    .eq("status", "pending")
    .lte("scheduled_at", new Date().toISOString());

  // Simulated pacing math
  const pace = camp.calls_per_minute ?? 0;
  const minutesToDrain = typeof pendingQ === "number" && pace > 0 ? (pendingQ / pace) : null;

  return successResponse({
    campaign_id: id,
    name: camp.name,
    status: camp.status,
    provider: camp.provider,
    agent: camp.agent_id ?? camp.telnyx_assistant_id ?? null,
    would_dispatch_now: pendingQ ?? 0,
    configured_pace_per_minute: pace,
    estimated_minutes_to_drain_queue: minutesToDrain ? Number(minutesToDrain.toFixed(1)) : null,
    dry_run: true,
    note: "This call did NOT place any real calls. It just shows what the dispatcher would do.",
  });
}

async function preLaunchAudit(rc: RouteContext, id: string): Promise<Response> {
  requireScope(rc.ctx, "campaigns:read");

  // Reuse validate and bolt on number health + budget
  const validateResp = await validateCampaign(rc, id);
  const validateJson = await validateResp.json();
  const checks: CheckResult[] = validateJson?.data?.checks ?? [];

  // Number health snapshot
  const { data: numbers } = await rc.supabase
    .from("phone_numbers")
    .select("id,number,status,is_spam,daily_calls,max_daily_calls,quarantine_until,rotation_enabled")
    .eq("user_id", rc.ctx.userId);

  const numberList = (numbers ?? []) as any[];
  const spamFlagged = numberList.filter((n) => n.is_spam).length;
  const quarantined = numberList.filter((n) => n.quarantine_until && new Date(n.quarantine_until) > new Date()).length;
  const atDailyCap = numberList.filter((n) => n.max_daily_calls && n.daily_calls >= n.max_daily_calls).length;

  checks.push({
    check: "number_health",
    status: spamFlagged === 0 && quarantined < numberList.length / 2 ? "pass" : "warn",
    message: `${numberList.length} total numbers, ${spamFlagged} spam-flagged, ${quarantined} quarantined, ${atDailyCap} at daily cap`,
    data: { total: numberList.length, spam_flagged: spamFlagged, quarantined, at_daily_cap: atDailyCap },
  });

  // Credits check
  if (rc.ctx.organizationId) {
    const { data: credits } = await rc.supabase
      .from("organization_credits")
      .select("balance_cents,low_balance_threshold_cents")
      .eq("organization_id", rc.ctx.organizationId)
      .maybeSingle();
    if (credits) {
      const threshold = credits.low_balance_threshold_cents ?? 500;
      checks.push({
        check: "credit_balance",
        status: credits.balance_cents > threshold ? "pass" : "warn",
        message: `Balance: $${(credits.balance_cents / 100).toFixed(2)}, threshold: $${(threshold / 100).toFixed(2)}`,
        data: credits,
      });
    }
  }

  const ready = checks.every((c) => c.status !== "fail");
  const hasWarnings = checks.some((c) => c.status === "warn");

  return successResponse({
    campaign_id: id,
    ready,
    has_warnings: hasWarnings,
    total_checks: checks.length,
    passed: checks.filter((c) => c.status === "pass").length,
    warnings: checks.filter((c) => c.status === "warn").length,
    failures: checks.filter((c) => c.status === "fail").length,
    checks,
  });
}

// ─── Phone number health ───────────────────────────────────────────────────────

async function phoneNumberHealth(rc: RouteContext): Promise<Response> {
  requireScope(rc.ctx, "system:read");
  const { data, error } = await rc.supabase
    .from("phone_numbers")
    .select("id,number,provider,status,is_spam,external_spam_score,daily_calls,max_daily_calls,quarantine_until,rotation_enabled,last_call_at,friendly_name")
    .eq("user_id", rc.ctx.userId);
  if (error) throw error;

  const now = new Date();
  const enriched = (data ?? []).map((n: any) => {
    const quarantined = n.quarantine_until && new Date(n.quarantine_until) > now;
    const capacity = n.max_daily_calls
      ? Math.max(0, n.max_daily_calls - (n.daily_calls ?? 0))
      : null;
    const atCap = n.max_daily_calls ? (n.daily_calls ?? 0) >= n.max_daily_calls : false;

    let health: "healthy" | "watch" | "unhealthy" = "healthy";
    const flags: string[] = [];
    if (n.is_spam) { health = "unhealthy"; flags.push("spam_flagged"); }
    if (quarantined) { health = "unhealthy"; flags.push("quarantined"); }
    if (atCap) { if (health === "healthy") health = "watch"; flags.push("at_daily_cap"); }
    if (n.status !== "active") { health = "unhealthy"; flags.push(`status_${n.status}`); }
    if (!n.rotation_enabled) flags.push("rotation_disabled");

    return {
      id: n.id,
      number: n.number,
      friendly_name: n.friendly_name,
      provider: n.provider,
      health,
      flags,
      daily_calls: n.daily_calls,
      max_daily_calls: n.max_daily_calls,
      capacity_remaining: capacity,
      external_spam_score: n.external_spam_score,
      last_call_at: n.last_call_at,
    };
  });

  return successResponse({
    total: enriched.length,
    healthy: enriched.filter((n) => n.health === "healthy").length,
    watch: enriched.filter((n) => n.health === "watch").length,
    unhealthy: enriched.filter((n) => n.health === "unhealthy").length,
    numbers: enriched,
  });
}

// ─── Stuck call detector ───────────────────────────────────────────────────────

async function findStuckCalls(rc: RouteContext): Promise<Response> {
  requireScope(rc.ctx, "calls:read");
  const minutes = Math.max(1, Math.min(parseInt(rc.url.searchParams.get("minutes") ?? "5", 10) || 5, 60));
  const cutoff = new Date(Date.now() - minutes * 60 * 1000).toISOString();

  // Stuck entries in dialing_queues
  const { data: stuckQueue } = await rc.supabase
    .from("dialing_queues")
    .select("id,campaign_id,lead_id,phone_number,status,updated_at,attempts")
    .eq("status", "calling")
    .lt("updated_at", cutoff)
    .limit(200);

  // Stuck entries in call_logs (started but never ended)
  const { data: stuckCalls } = await rc.supabase
    .from("call_logs")
    .select("id,campaign_id,lead_id,phone_number,status,started_at,caller_id,provider")
    .eq("user_id", rc.ctx.userId)
    .in("status", ["calling", "in-progress", "ringing"])
    .lt("started_at", cutoff)
    .order("started_at", { ascending: false })
    .limit(200);

  return successResponse({
    cutoff_minutes: minutes,
    stuck_in_queue: stuckQueue ?? [],
    stuck_in_call_logs: stuckCalls ?? [],
    total_stuck: (stuckQueue?.length ?? 0) + (stuckCalls?.length ?? 0),
  });
}

// ─── Rich lead search (POST /v1/leads/search) ──────────────────────────────────

async function searchLeads(rc: RouteContext): Promise<Response> {
  requireScope(rc.ctx, "leads:read");
  const body = await safeJson(rc.req);
  const limit = Math.min(Math.max(parseInt(String(body.limit ?? "100"), 10) || 100, 1), 500);

  let q = rc.supabase
    .from("leads")
    .select(LEAD_FIELDS, { count: "exact" })
    .eq("user_id", rc.ctx.userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (body.status) q = q.eq("status", body.status);
  if (Array.isArray(body.statuses) && body.statuses.length > 0) q = q.in("status", body.statuses);
  if (body.lead_source) q = q.eq("lead_source", body.lead_source);
  if (typeof body.do_not_call === "boolean") q = q.eq("do_not_call", body.do_not_call);
  if (Array.isArray(body.tags) && body.tags.length > 0) q = q.contains("tags", body.tags);
  if (body.last_contacted_before) q = q.lt("last_contacted_at", String(body.last_contacted_before));
  if (body.last_contacted_after) q = q.gt("last_contacted_at", String(body.last_contacted_after));
  if (body.last_contacted_is_null === true) q = q.is("last_contacted_at", null);
  if (body.next_callback_before) q = q.lt("next_callback_at", String(body.next_callback_before));
  if (body.next_callback_after) q = q.gt("next_callback_at", String(body.next_callback_after));
  if (body.created_after) q = q.gte("created_at", String(body.created_after));
  if (body.phone_like) q = q.ilike("phone_number", `%${body.phone_like}%`);
  if (body.text) {
    const t = String(body.text);
    q = q.or(`phone_number.ilike.%${t}%,first_name.ilike.%${t}%,last_name.ilike.%${t}%,email.ilike.%${t}%,notes.ilike.%${t}%`);
  }

  const { data, count, error } = await q;
  if (error) throw error;
  return successResponse({ leads: data ?? [], total: count ?? 0, limit });
}

// ─── Deep self-test ────────────────────────────────────────────────────────────

async function deepHealthCheck(rc: RouteContext): Promise<Response> {
  requireScope(rc.ctx, "system:read");
  const probes: Array<{ probe: string; ok: boolean; detail?: string; duration_ms: number }> = [];

  async function probe(name: string, fn: () => Promise<unknown>): Promise<void> {
    const t0 = Date.now();
    try {
      await fn();
      probes.push({ probe: name, ok: true, duration_ms: Date.now() - t0 });
    } catch (e) {
      probes.push({
        probe: name,
        ok: false,
        detail: e instanceof Error ? e.message : String(e),
        duration_ms: Date.now() - t0,
      });
    }
  }

  await probe("leads_read", async () => {
    const { error } = await rc.supabase.from("leads").select("id", { count: "exact", head: true }).eq("user_id", rc.ctx.userId);
    if (error) throw error;
  });
  await probe("campaigns_read", async () => {
    const { error } = await rc.supabase.from("campaigns").select("id", { count: "exact", head: true }).eq("user_id", rc.ctx.userId);
    if (error) throw error;
  });
  await probe("call_logs_read", async () => {
    const { error } = await rc.supabase.from("call_logs").select("id", { count: "exact", head: true }).eq("user_id", rc.ctx.userId);
    if (error) throw error;
  });
  await probe("sms_read", async () => {
    const { error } = await rc.supabase.from("sms_messages").select("id", { count: "exact", head: true }).eq("user_id", rc.ctx.userId);
    if (error) throw error;
  });
  await probe("phone_numbers_read", async () => {
    const { error } = await rc.supabase.from("phone_numbers").select("id", { count: "exact", head: true }).eq("user_id", rc.ctx.userId);
    if (error) throw error;
  });
  await probe("dialing_queues_read", async () => {
    const { error } = await rc.supabase.from("dialing_queues").select("id", { count: "exact", head: true });
    if (error) throw error;
  });
  await probe("audit_log_write", async () => {
    // best-effort sanity check that RLS/permissions let us write
    const { error } = await rc.supabase.from("api_key_audit_log").insert({
      api_key_id: rc.ctx.apiKeyId,
      user_id: rc.ctx.userId,
      method: "INTERNAL",
      path: "deep_health_check_probe",
      status_code: 200,
      duration_ms: 0,
    });
    if (error) throw error;
  });

  const allOk = probes.every((p) => p.ok);
  return successResponse({
    ok: allOk,
    version: VERSION,
    api_key_id: rc.ctx.apiKeyId,
    user_id: rc.ctx.userId,
    organization_id: rc.ctx.organizationId,
    scopes: rc.ctx.scopes,
    probes,
    checked_at: new Date().toISOString(),
  });
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
