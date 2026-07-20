import type { DialSmartClient } from "../client.js";
import { leadTools } from "./leads.js";
import { campaignTools } from "./campaigns.js";
import { callTools } from "./calls.js";
import { smsTools } from "./sms.js";
import { systemTools } from "./system.js";
import { opsTools } from "./ops.js";
import { observerControlPlaneTools } from "./control-plane.js";
import { elitePilotPlaybookTools } from "./elite-pilot-playbook.js";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
  handler: (
    client: DialSmartClient,
    args: Record<string, unknown>,
  ) => Promise<unknown>;
}

export const allTools: ToolDefinition[] = [
  ...systemTools,
  ...leadTools,
  ...campaignTools,
  ...callTools,
  ...smsTools,
  ...opsTools,
  ...observerControlPlaneTools,
];

/**
 * The MCP package historically advertised every legacy API route, including
 * direct call/SMS/campaign mutations. The certified provider path now requires
 * durable server-side command receipts, approvals, and queue claims that the
 * legacy API does not yet supply. Keep the broad catalog available to contract
 * tests, but expose only this observer profile to real MCP clients.
 */
export type CertifiedMcpProfile = "observer" | "elite-pilot-playbook";

const OBSERVER_TOOL_NAME_LIST = [
  "dialsmart_operator_context",
  "dialsmart_system_status",
  "dialsmart_elite_solar_brief",
  "dialsmart_elite_solar_pulse",
  "dialsmart_list_campaigns",
  "dialsmart_inspect_campaign",
] as const;

type ObserverToolName = typeof OBSERVER_TOOL_NAME_LIST[number];

const OBSERVER_TOOL_NAMES = new Set<string>(OBSERVER_TOOL_NAME_LIST);
const ELITE_PILOT_PLAYBOOK_TOOL_NAMES = new Set<string>([
  "dialsmart_elite_morning_beat",
  "dialsmart_elite_pilot_guide",
  "dialsmart_elite_source_shadow_plan",
  "dialsmart_elite_test_plan",
  "dialsmart_elite_email_draft_plan",
]);
const CANONICAL_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CAMPAIGN_STATUSES = new Set(["draft", "active", "paused", "completed"]);
const CAMPAIGN_INCLUDE_OPTIONS = new Set([
  "validation",
  "live_stats",
  "dispositions",
  "release_status",
]);

function requirePlainArguments(args: unknown): Record<string, unknown> {
  if (args === null || typeof args !== "object" || Array.isArray(args)) {
    throw new Error("Observer tool arguments must be an object");
  }
  const prototype = Object.getPrototypeOf(args);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error("Observer tool arguments must be a plain object");
  }
  return args as Record<string, unknown>;
}

function requireExactKeys(
  args: Record<string, unknown>,
  allowed: readonly string[],
): void {
  const allowedKeys = new Set(allowed);
  const unknown = Object.keys(args).find((key) => !allowedKeys.has(key));
  if (unknown !== undefined) {
    throw new Error(`Unknown observer tool argument: ${unknown}`);
  }
}

/** Runtime enforcement. MCP inputSchema metadata is not an authorization gate. */
export function validateCertifiedObserverArguments(
  toolName: ObserverToolName,
  rawArgs: unknown,
): Record<string, unknown> {
  const args = requirePlainArguments(rawArgs);

  if (
    toolName === "dialsmart_operator_context" ||
    toolName === "dialsmart_elite_solar_brief" ||
    toolName === "dialsmart_elite_solar_pulse"
  ) {
    requireExactKeys(args, []);
    return {};
  }

  if (toolName === "dialsmart_system_status") {
    requireExactKeys(args, ["window_hours"]);
    if (args.window_hours === undefined) return {};
    if (
      typeof args.window_hours !== "number" ||
      !Number.isInteger(args.window_hours) ||
      args.window_hours < 1 || args.window_hours > 168
    ) {
      throw new Error("window_hours must be an integer from 1 through 168");
    }
    return { window_hours: args.window_hours };
  }

  if (toolName === "dialsmart_inspect_campaign") {
    requireExactKeys(args, ["campaign_id", "include"]);
    if (
      typeof args.campaign_id !== "string" ||
      !CANONICAL_UUID_PATTERN.test(args.campaign_id)
    ) {
      throw new Error("Campaign id must be an exact canonical lowercase UUID");
    }
    const validated: Record<string, unknown> = { campaign_id: args.campaign_id };
    if (args.include !== undefined) {
      if (!Array.isArray(args.include) || args.include.length > 4) {
        throw new Error("Campaign include must contain at most four allowlisted values");
      }
      const include: string[] = [];
      for (const entry of args.include) {
        if (typeof entry !== "string" || !CAMPAIGN_INCLUDE_OPTIONS.has(entry)) {
          throw new Error("Campaign include is not observer-allowlisted");
        }
        if (include.includes(entry)) {
          throw new Error("Campaign include values must be unique");
        }
        include.push(entry);
      }
      validated.include = include;
    }
    return validated;
  }

  requireExactKeys(args, ["status", "limit", "cursor"]);
  const validated: Record<string, unknown> = {};
  if (args.status !== undefined) {
    if (typeof args.status !== "string" || !CAMPAIGN_STATUSES.has(args.status)) {
      throw new Error("Campaign status is not observer-allowlisted");
    }
    validated.status = args.status;
  }
  if (args.limit !== undefined) {
    if (
      typeof args.limit !== "number" || !Number.isInteger(args.limit) ||
      args.limit < 1 || args.limit > 100
    ) {
      throw new Error("Campaign limit must be an integer from 1 through 100");
    }
    validated.limit = args.limit;
  }
  if (args.cursor !== undefined) {
    if (
      typeof args.cursor !== "string" || args.cursor.length < 1 ||
      args.cursor.length > 256 || !/^[A-Za-z0-9_-]+$/.test(args.cursor)
    ) {
      throw new Error("Campaign cursor must be a bounded base64url-safe token");
    }
    validated.cursor = args.cursor;
  }
  return validated;
}

export function certifiedToolsForProfile(
  requestedProfile: string | undefined,
): ToolDefinition[] {
  const profile = requestedProfile?.trim() || "observer";
  if (profile === "elite-pilot-playbook") {
    return elitePilotPlaybookTools
      .filter((tool) => ELITE_PILOT_PLAYBOOK_TOOL_NAMES.has(tool.name))
      .map((tool) => ({
        ...tool,
        inputSchema: {
          ...tool.inputSchema,
          additionalProperties: false,
        },
        handler: async (client: DialSmartClient, args: Record<string, unknown>) => {
          const validated = requirePlainArguments(args);
          requireExactKeys(validated, []);
          return await tool.handler(client, {});
        },
      }));
  }
  if (profile !== "observer") {
    throw new Error(
      `MCP capability profile ${JSON.stringify(profile)} is not certified. ` +
        "Only observer and elite-pilot-playbook profiles are available.",
    );
  }

  return allTools
    .filter((tool) => OBSERVER_TOOL_NAMES.has(tool.name))
    .map((tool) => {
      const toolName = tool.name as ObserverToolName;
      return {
        ...tool,
        inputSchema: {
          ...tool.inputSchema,
          additionalProperties: false,
        },
        handler: async (client: DialSmartClient, args: Record<string, unknown>) =>
          await tool.handler(
            client,
            validateCertifiedObserverArguments(toolName, args),
          ),
      };
    });
}
