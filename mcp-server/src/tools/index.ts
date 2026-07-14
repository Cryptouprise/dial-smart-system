import type { DialSmartClient } from "../client.js";
import { leadTools } from "./leads.js";
import { campaignTools } from "./campaigns.js";
import { callTools } from "./calls.js";
import { smsTools } from "./sms.js";
import { systemTools } from "./system.js";
import { opsTools } from "./ops.js";

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
];

/**
 * The MCP package historically advertised every legacy API route, including
 * direct call/SMS/campaign mutations. The certified provider path now requires
 * durable server-side command receipts, approvals, and queue claims that the
 * legacy API does not yet supply. Keep the broad catalog available to contract
 * tests, but expose only this observer profile to real MCP clients.
 */
export type CertifiedMcpProfile = "observer";

const OBSERVER_TOOL_NAME_LIST = [
  "dialsmart_whoami",
  "dialsmart_system_stats",
  "dialsmart_list_campaigns",
  "dialsmart_get_campaign",
] as const;

type ObserverToolName = typeof OBSERVER_TOOL_NAME_LIST[number];

const OBSERVER_TOOL_NAMES = new Set<string>(OBSERVER_TOOL_NAME_LIST);
const CANONICAL_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CAMPAIGN_STATUSES = new Set(["draft", "active", "paused", "completed"]);

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

  if (toolName === "dialsmart_whoami" || toolName === "dialsmart_system_stats") {
    requireExactKeys(args, []);
    return {};
  }

  if (toolName === "dialsmart_get_campaign") {
    requireExactKeys(args, ["id"]);
    if (typeof args.id !== "string" || !CANONICAL_UUID_PATTERN.test(args.id)) {
      throw new Error("Campaign id must be an exact canonical lowercase UUID");
    }
    return { id: args.id };
  }

  requireExactKeys(args, ["status", "limit", "offset"]);
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
  if (args.offset !== undefined) {
    if (
      typeof args.offset !== "number" || !Number.isInteger(args.offset) ||
      args.offset < 0 || args.offset > 10_000
    ) {
      throw new Error("Campaign offset must be an integer from 0 through 10000");
    }
    validated.offset = args.offset;
  }
  return validated;
}

export function certifiedToolsForProfile(
  requestedProfile: string | undefined,
): ToolDefinition[] {
  const profile = requestedProfile?.trim() || "observer";
  if (profile !== "observer") {
    throw new Error(
      `MCP capability profile ${JSON.stringify(profile)} is not certified. ` +
        "Only the observer profile is available.",
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
