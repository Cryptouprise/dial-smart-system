import type { ToolDefinition } from "./index.js";

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
      "Send an outbound SMS to a phone number. If from_number is omitted, the platform picks an active rotating number. If lead_id is provided, the message is linked to the lead's conversation history.",
    inputSchema: {
      type: "object",
      properties: {
        to_number: { type: "string", description: "E.164 phone number" },
        body: { type: "string", description: "Message text" },
        from_number: {
          type: "string",
          description: "Optional sender number (E.164). Auto-selected if omitted.",
        },
        lead_id: {
          type: "string",
          description: "Optional lead UUID for conversation tracking",
        },
      },
      required: ["to_number", "body"],
    },
    handler: (c, args) => c.post("/v1/sms", args),
  },
];
