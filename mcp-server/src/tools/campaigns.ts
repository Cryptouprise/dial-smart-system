import type { ToolDefinition } from "./index.js";

export const campaignTools: ToolDefinition[] = [
  {
    name: "dialsmart_list_campaigns",
    description:
      "List predictive-dialing campaigns. Returns name, status (draft/active/paused/completed), provider (retell/telnyx/twilio), agent_id, and pacing/retry config.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", description: "draft | active | paused | completed" },
        limit: { type: "number", default: 50 },
        offset: { type: "number", default: 0 },
      },
    },
    handler: (c, args) => c.get("/v1/campaigns", args),
  },

  {
    name: "dialsmart_get_campaign",
    description:
      "Get the full configuration for a single campaign, including its script, sms_template, and workflow_id.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Campaign UUID" } },
      required: ["id"],
    },
    handler: (c, args) => c.get(`/v1/campaigns/${args.id}`),
  },

  {
    name: "dialsmart_launch_campaign",
    description:
      "Launch (activate) a campaign by setting its status to 'active'. The dispatcher will start placing calls on its next tick.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Campaign UUID" } },
      required: ["id"],
    },
    handler: (c, args) => c.post(`/v1/campaigns/${args.id}/launch`),
  },

  {
    name: "dialsmart_pause_campaign",
    description:
      "Pause a running campaign by setting its status to 'paused'. Existing in-flight calls finish; no new calls are dispatched until you launch it again.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Campaign UUID" } },
      required: ["id"],
    },
    handler: (c, args) => c.post(`/v1/campaigns/${args.id}/pause`),
  },

  {
    name: "dialsmart_create_campaign",
    description:
      "Create a new campaign in draft status. Requires a name and provider. Returns the full campaign object with its UUID.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Campaign name" },
        description: { type: "string", description: "Optional description" },
        provider: { type: "string", description: "retell | telnyx | twilio (default: retell)" },
        agent_id: { type: "string", description: "Retell agent ID" },
        telnyx_assistant_id: { type: "string", description: "Telnyx assistant UUID" },
        script: { type: "string", description: "Call script text" },
        calls_per_minute: { type: "number", description: "Pacing (default: 5)" },
        max_attempts: { type: "number", description: "Max retry attempts (default: 3)" },
        retry_delay_minutes: { type: "number", description: "Minutes between retries (default: 60)" },
        calling_hours_start: { type: "string", description: "e.g. 09:00 (default)" },
        calling_hours_end: { type: "string", description: "e.g. 21:00 (default)" },
        timezone: { type: "string", description: "e.g. America/New_York (default)" },
        sms_on_no_answer: { type: "boolean", description: "Send SMS on no answer" },
        sms_template: { type: "string", description: "SMS template text" },
        workflow_id: { type: "string", description: "Workflow UUID to attach" },
      },
      required: ["name"],
    },
    handler: (c, args) => c.post("/v1/campaigns", args),
  },
];
