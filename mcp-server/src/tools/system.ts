import type { ToolDefinition } from "./index.js";

export const systemTools: ToolDefinition[] = [
  {
    name: "dialsmart_whoami",
    description:
      "Return the identity and scopes of the API key currently in use. Useful as a smoke test.",
    inputSchema: { type: "object", properties: {} },
    handler: (c) => c.get("/v1/me"),
  },

  {
    name: "dialsmart_system_stats",
    description:
      "Get a high-level snapshot of the Dial Smart account: total leads, active campaigns, calls in the last 24h, answer rate, SMS volume, and active phone numbers. Use this when the user asks 'how is the system doing' or 'what's happening today'.",
    inputSchema: { type: "object", properties: {} },
    handler: (c) => c.get("/v1/system/stats"),
  },

  {
    name: "dialsmart_credits_balance",
    description:
      "Get the current credit balance for the organization linked to this API key (white-label credit system). Returns balance_cents, cost_per_minute_cents, and auto-recharge config. Returns billing_enabled=false if the org is not on a metered plan.",
    inputSchema: { type: "object", properties: {} },
    handler: (c) => c.get("/v1/credits/balance"),
  },

  {
    name: "dialsmart_list_phone_numbers",
    description:
      "List the phone numbers configured for outbound calling/SMS. Filter by provider (retell, twilio, telnyx) or status (active, paused, quarantined).",
    inputSchema: {
      type: "object",
      properties: {
        provider: { type: "string", description: "retell | twilio | telnyx" },
        status: { type: "string", description: "active | paused | quarantined" },
        limit: { type: "number", default: 50 },
        offset: { type: "number", default: 0 },
      },
    },
    handler: (c, args) => c.get("/v1/phone-numbers", args),
  },
];
