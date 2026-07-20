import type { ObserverCommandName, DialSmartClient } from "../client.js";
import type { ToolDefinition } from "./index.js";

function observerTool(
  name: string,
  description: string,
  command: ObserverCommandName,
  inputSchema: ToolDefinition["inputSchema"],
): ToolDefinition {
  return {
    name,
    description,
    inputSchema,
    handler: (client: DialSmartClient, args: Record<string, unknown>) =>
      client.observe(command, args),
  };
}

/**
 * The only MCP catalog intended for an operator. Every tool is a direct map
 * to the shared R0 registry; names describe the useful question, not legacy
 * REST resources. No listed tool can call, text, queue, mutate CRM data, or
 * spend money.
 */
export const observerControlPlaneTools: ToolDefinition[] = [
  observerTool(
    "dialsmart_operator_context",
    "Show the authenticated operator, organization-bound observer context, and the finite safe command guide. Use this first when you need to confirm which company the MCP key is bound to.",
    "operator.context",
    { type: "object", properties: {} },
  ),
  observerTool(
    "dialsmart_system_status",
    "Read a tenant-scoped operational status snapshot. It never authorizes calls, texts, queues, CRM writes, launch, or spend.",
    "system.status",
    {
      type: "object",
      properties: {
        window_hours: { type: "number", minimum: 1, maximum: 168 },
      },
    },
  ),
  observerTool(
    "dialsmart_elite_solar_brief",
    "Read the bounded Elite Solar Recovery first-pilot brief: direct import is primary, GHL is optional, and the exact no-contact next step.",
    "elite.solar_brief",
    { type: "object", properties: {} },
  ),
  observerTool(
    "dialsmart_elite_solar_pulse",
    "Read the Elite Solar morning beat: release posture, blockers, next gate, and zero-authority status. Use this for an honest launch-readiness update.",
    "elite.solar_pulse",
    { type: "object", properties: {} },
  ),
  observerTool(
    "dialsmart_list_campaigns",
    "List only campaigns in the MCP key's tenant using bounded optional status, limit, and cursor filters. A campaign record is not contact permission.",
    "campaign.list",
    {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["draft", "active", "paused", "completed"],
        },
        limit: { type: "number", minimum: 1, maximum: 100 },
        cursor: { type: "string" },
      },
    },
  ),
  observerTool(
    "dialsmart_inspect_campaign",
    "Inspect one exact tenant-scoped campaign UUID. The release_status view is a non-PII summary and never authorizes a call or launch.",
    "campaign.inspect",
    {
      type: "object",
      properties: {
        campaign_id: { type: "string" },
        include: {
          type: "array",
          items: {
            type: "string",
            enum: ["validation", "live_stats", "dispositions", "release_status"],
          },
        },
      },
      required: ["campaign_id"],
    },
  ),
];
