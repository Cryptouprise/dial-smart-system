import type { ToolDefinition } from "./index.js";
import { parseAndBindSendSms } from "./contact-egress-contract.js";

export const smsTools: ToolDefinition[] = [
  {
    name: "dialsmart_list_sms",
    description:
      "List recent SMS messages (inbound and outbound). Filter by lead_id, direction (inbound/outbound), or `since` (ISO timestamp).",
    inputSchema: {
      type: "object",
      properties: {
        lead_id: { type: "string" },
        direction: { type: "string", description: "inbound | outbound" },
        since: { type: "string", description: "ISO 8601 timestamp" },
        limit: { type: "number", default: 50 },
        offset: { type: "number", default: 0 },
      },
    },
    handler: (c, args) => c.get("/v1/sms", args),
  },

  {
    name: "dialsmart_send_sms",
    description:
      "Request one outbound SMS through the currently disabled external API boundary. Requires a stable idempotency key; tenant ownership is derived only from the authenticated API key. Exact replays are allowed and payload drift is rejected before making a client request.",
    inputSchema: {
      type: "object",
      properties: {
        to_number: {
          type: "string",
          pattern: "^\\+[1-9][0-9]{7,14}$",
          description: "Exact E.164 destination number",
        },
        body: {
          type: "string",
          minLength: 1,
          maxLength: 1600,
          description: "Message text",
        },
        idempotency_key: {
          type: "string",
          minLength: 8,
          maxLength: 512,
          pattern: "^[\\x21-\\x7e]+$",
          description:
            "Stable printable-ASCII key for this exact SMS intent. Reuse only to replay the identical payload.",
        },
        from_number: {
          type: "string",
          pattern: "^\\+[1-9][0-9]{7,14}$",
          description: "Optional sender number (E.164). Auto-selected if omitted.",
        },
        lead_id: {
          type: "string",
          pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
          description: "Optional canonical lowercase lead UUID for conversation tracking",
        },
      },
      required: ["to_number", "body", "idempotency_key"],
      additionalProperties: false,
    },
    handler: (c, args) => c.post("/v1/sms", parseAndBindSendSms(args)),
  },
];
