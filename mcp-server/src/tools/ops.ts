import type { ToolDefinition } from "./index.js";

/**
 * Operational tools designed for the campaign testing + launch loop.
 * These are the daily-driver tools that turn the MCP from "generic CRUD"
 * into "actually useful for running real campaigns".
 */
export const opsTools: ToolDefinition[] = [
  {
    name: "dialsmart_validate_campaign",
    description:
      "Run a pre-launch checklist on a campaign. Checks: agent/assistant assigned, retries configured, calling hours set, pacing sanity, leads queued, phone number availability (provider-aware). Returns { ready: bool, has_warnings: bool, checks: [...] } where each check has status pass/warn/fail. Use this before launching any campaign.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Campaign UUID" } },
      required: ["id"],
    },
    handler: (c, args) => c.get(`/v1/campaigns/${args.id}/validate`),
  },

  {
    name: "dialsmart_campaign_live_stats",
    description:
      "Get a live snapshot of a running campaign: queue breakdown (pending/calling/completed/failed), calls in the last hour, answer rate, actual pacing over the last 5 minutes vs. configured pacing, and the most recent call. Use this to answer 'how is campaign X doing right now?' Refresh every 30s for a live view.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Campaign UUID" } },
      required: ["id"],
    },
    handler: (c, args) => c.get(`/v1/campaigns/${args.id}/live-stats`),
  },

  {
    name: "dialsmart_disposition_breakdown",
    description:
      "Get the disposition breakdown for a campaign over the last N hours (default 1, max 168). Returns counts by status, outcome, disposition, and AMD result. Use this to answer 'what happened in the last hour?' or 'how are calls going this shift?'",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Campaign UUID" },
        hours: {
          type: "number",
          description: "Window in hours (default 1, max 168)",
          default: 1,
        },
      },
      required: ["id"],
    },
    handler: (c, args) =>
      c.get(`/v1/campaigns/${args.id}/disposition-breakdown`, { hours: args.hours }),
  },

  {
    name: "dialsmart_retry_failed_calls",
    description:
      "Bulk requeue all no_answer/busy/failed dialing_queue entries for a campaign that failed within the last `within_minutes` (default 60, max 1440) and still have retry attempts available. Returns how many were requeued. Use this after a noisy patch of calls to recover lost opportunities.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Campaign UUID" },
        within_minutes: {
          type: "number",
          description: "How far back to look for failures (default 60, max 1440)",
          default: 60,
        },
        max: {
          type: "number",
          description: "Safety cap on requeued rows (default 500, max 2000)",
          default: 500,
        },
      },
      required: ["id"],
    },
    handler: (c, args) => {
      const { id, ...body } = args;
      return c.post(`/v1/campaigns/${id}/retry-failed`, body);
    },
  },

  {
    name: "dialsmart_force_dispatch",
    description:
      "Force an immediate dispatch cycle for a campaign. Bypasses scheduled_at gating — the dispatcher will pick up any pending leads right now. Use this to trigger a test call or kick a stuck campaign. Requires campaigns:write scope.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Campaign UUID" } },
      required: ["id"],
    },
    handler: (c, args) => c.post(`/v1/campaigns/${args.id}/force-dispatch`),
  },

  {
    name: "dialsmart_dry_run_campaign",
    description:
      "Simulate a campaign run without actually placing any calls. Returns how many leads would dispatch right now, configured pacing, and an estimate of how long it would take to drain the queue. Use this to sanity-check a campaign before committing to launch.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Campaign UUID" } },
      required: ["id"],
    },
    handler: (c, args) => c.post(`/v1/campaigns/${args.id}/dry-run`),
  },

  {
    name: "dialsmart_pre_launch_audit",
    description:
      "Comprehensive pre-launch audit for a campaign. Runs the full validate check PLUS number health snapshot AND credit balance check. Returns a consolidated { ready, has_warnings, passed, warnings, failures, checks } report. Use this as your one-stop 'is this campaign safe to launch RIGHT NOW?' question.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Campaign UUID" } },
      required: ["id"],
    },
    handler: (c, args) => c.get(`/v1/campaigns/${args.id}/pre-launch-audit`),
  },

  {
    name: "dialsmart_phone_number_health",
    description:
      "Snapshot every phone number's health. Each number is classified healthy / watch / unhealthy with a list of flags (spam_flagged, quarantined, at_daily_cap, rotation_disabled, etc.). Use this to answer 'are any of my numbers getting flagged?' before and during campaigns.",
    inputSchema: { type: "object", properties: {} },
    handler: (c) => c.get("/v1/phone-numbers/health"),
  },

  {
    name: "dialsmart_find_stuck_calls",
    description:
      "Find calls stuck in 'calling' status for longer than N minutes (default 5, max 60). Checks both the dialing_queues table AND call_logs. Stuck calls are usually provider hiccups that need manual cleanup. Use this when the live stats look off.",
    inputSchema: {
      type: "object",
      properties: {
        minutes: {
          type: "number",
          description: "Stuck threshold in minutes (default 5, max 60)",
          default: 5,
        },
      },
    },
    handler: (c, args) => c.get("/v1/calls/stuck", args),
  },

  {
    name: "dialsmart_search_leads",
    description:
      "Rich lead search with structured filters. Supports: status (single or array via 'statuses'), lead_source, do_not_call, tags (array-contains), last_contacted_before/after, last_contacted_is_null, next_callback_before/after, created_after, phone_like, text (free-text across name/phone/email/notes). Max 500 results. Use this for things like 'find every lead that hasn't been touched in 48 hours' or 'find every new lead tagged hot'.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string" },
        statuses: { type: "array", items: { type: "string" } },
        lead_source: { type: "string" },
        do_not_call: { type: "boolean" },
        tags: { type: "array", items: { type: "string" } },
        last_contacted_before: { type: "string", description: "ISO 8601" },
        last_contacted_after: { type: "string", description: "ISO 8601" },
        last_contacted_is_null: { type: "boolean" },
        next_callback_before: { type: "string", description: "ISO 8601" },
        next_callback_after: { type: "string", description: "ISO 8601" },
        created_after: { type: "string", description: "ISO 8601" },
        phone_like: { type: "string", description: "Substring match on phone_number" },
        text: {
          type: "string",
          description: "Free-text across phone, first_name, last_name, email, notes",
        },
        limit: { type: "number", default: 100 },
      },
    },
    handler: (c, args) => c.post("/v1/leads/search", args),
  },

  {
    name: "dialsmart_health_check",
    description:
      "Deep self-test of the entire Dial Smart API + MCP stack. Probes connectivity to leads, campaigns, call_logs, sms, phone_numbers, dialing_queues, and writes a sanity row to api_key_audit_log. Returns { ok, probes: [{probe, ok, duration_ms}], scopes }. Run this any time you're unsure whether the MCP is working end-to-end. This is your 'am I actually connected?' button.",
    inputSchema: { type: "object", properties: {} },
    handler: (c) => c.get("/v1/system/health-check"),
  },
];
