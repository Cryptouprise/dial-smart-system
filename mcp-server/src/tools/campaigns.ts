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
];
