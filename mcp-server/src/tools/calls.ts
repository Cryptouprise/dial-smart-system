import type { ToolDefinition } from "./index.js";

export const callTools: ToolDefinition[] = [
  {
    name: "dialsmart_list_calls",
    description:
      "List recent call_logs. Filter by lead_id, campaign_id, status (queued/calling/completed/failed), or `since` (ISO timestamp). Returns lightweight rows without transcripts.",
    inputSchema: {
      type: "object",
      properties: {
        lead_id: { type: "string" },
        campaign_id: { type: "string" },
        status: { type: "string" },
        since: { type: "string", description: "ISO 8601 timestamp" },
        limit: { type: "number", default: 50 },
        offset: { type: "number", default: 0 },
      },
    },
    handler: (c, args) => c.get("/v1/calls", args),
  },

  {
    name: "dialsmart_get_call",
    description:
      "Get full details for a single call including transcript, call_summary, sentiment, ai_analysis, and recording_url. Use this to investigate what happened on a specific call.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Call UUID" } },
      required: ["id"],
    },
    handler: (c, args) => c.get(`/v1/calls/${args.id}`),
  },

  {
    name: "dialsmart_place_call",
    description:
      "Place a single outbound call to a lead immediately. The call goes through the configured Retell agent or Telnyx assistant. The lead must not be marked do_not_call. Returns the queued call info — actual outcome arrives via webhooks.",
    inputSchema: {
      type: "object",
      properties: {
        lead_id: { type: "string", description: "UUID of the lead to call" },
        agent_id: {
          type: "string",
          description: "Retell agent_id (use this OR telnyx_assistant_id, not both)",
        },
        telnyx_assistant_id: {
          type: "string",
          description: "Telnyx assistant id",
        },
        provider: {
          type: "string",
          description: "retell | telnyx (auto-detected if omitted)",
        },
      },
      required: ["lead_id"],
    },
    handler: (c, args) => c.post("/v1/calls", args),
  },
];
