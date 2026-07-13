import type { ToolDefinition } from "./index.js";
import { parseAndBindPlaceCall } from "./contact-egress-contract.js";

const canonicalUuidSchema = {
  type: "string",
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
};

const idempotencyKeySchema = {
  type: "string",
  minLength: 8,
  maxLength: 512,
  pattern: "^[\\x21-\\x7e]+$",
  description:
    "Stable printable-ASCII key for this exact call intent. Reuse only to replay the identical payload.",
};

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
      "Request one outbound lead call through the currently disabled external API boundary. Requires exact campaign and idempotency bindings; tenant ownership is derived only from the authenticated API key. The tool rejects payload drift before making a client request.",
    inputSchema: {
      type: "object",
      properties: {
        lead_id: {
          ...canonicalUuidSchema,
          description: "Canonical lowercase UUID of the lead to call",
        },
        campaign_id: {
          ...canonicalUuidSchema,
          description: "Canonical lowercase UUID of the campaign authorizing the call",
        },
        idempotency_key: idempotencyKeySchema,
        agent_id: {
          type: "string",
          minLength: 1,
          maxLength: 256,
          pattern: "^[\\x21-\\x7e]+$",
          description: "Retell agent_id (use this OR telnyx_assistant_id, not both)",
        },
        telnyx_assistant_id: {
          type: "string",
          minLength: 1,
          maxLength: 256,
          pattern: "^[\\x21-\\x7e]+$",
          description: "Telnyx assistant id",
        },
        provider: {
          type: "string",
          enum: ["retell", "telnyx"],
          description: "retell | telnyx (auto-detected if omitted)",
        },
        from_number: {
          type: "string",
          pattern: "^\\+[1-9][0-9]{7,14}$",
          description: "Optional exact E.164 caller ID owned by the API-key tenant",
        },
      },
      required: ["lead_id", "campaign_id", "idempotency_key"],
      additionalProperties: false,
    },
    handler: (c, args) => c.post("/v1/calls", parseAndBindPlaceCall(args)),
  },
];
