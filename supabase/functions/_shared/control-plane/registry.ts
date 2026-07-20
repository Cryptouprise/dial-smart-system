import type {
  CommandDefinition,
  ControlCommandName,
  JsonObject,
  ParsedConversationalCommand,
} from "./types.ts";

const CANONICAL_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAX_CONVERSATIONAL_COMMAND_LENGTH = 512;

export class ControlPlaneRegistryError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ControlPlaneRegistryError";
    this.code = code;
  }
}

export const COMMAND_REGISTRY: Readonly<
  Record<ControlCommandName, CommandDefinition>
> = Object.freeze({
  "operator.context": {
    name: "operator.context",
    risk: "R0",
    minimum_role: "admin",
    required_scopes: ["system:read"],
    observer_allowed: true,
    requires_approval: false,
    description: "Read the authenticated operator and selected tenant context.",
  },
  "system.status": {
    name: "system.status",
    risk: "R0",
    minimum_role: "admin",
    required_scopes: ["system:read"],
    observer_allowed: true,
    requires_approval: false,
    description: "Read a tenant-scoped operational status snapshot.",
  },
  "elite.solar_brief": {
    name: "elite.solar_brief",
    risk: "R0",
    minimum_role: "admin",
    required_scopes: ["system:read"],
    observer_allowed: true,
    requires_approval: false,
    description: "Read the bounded Elite Solar first-pilot operating brief.",
  },
  "elite.solar_pulse": {
    name: "elite.solar_pulse",
    risk: "R0",
    minimum_role: "admin",
    required_scopes: ["system:read", "campaigns:read"],
    observer_allowed: true,
    requires_approval: false,
    description: "Read the bounded Elite Solar release posture and next gates.",
  },
  "campaign.list": {
    name: "campaign.list",
    risk: "R0",
    minimum_role: "admin",
    required_scopes: ["campaigns:read"],
    observer_allowed: true,
    requires_approval: false,
    description: "List tenant-scoped campaigns using bounded filters.",
  },
  "campaign.inspect": {
    name: "campaign.inspect",
    risk: "R0",
    minimum_role: "admin",
    required_scopes: ["campaigns:read"],
    observer_allowed: true,
    requires_approval: false,
    description: "Inspect one campaign selected by an exact canonical UUID.",
  },
  "campaign.upsert_draft": {
    name: "campaign.upsert_draft",
    risk: "R1",
    minimum_role: "manager",
    required_scopes: ["campaigns:write"],
    observer_allowed: false,
    requires_approval: false,
    description: "Create or update a non-active Retell campaign draft.",
  },
  "lead.upsert": {
    name: "lead.upsert",
    risk: "R1",
    minimum_role: "manager",
    required_scopes: ["leads:write"],
    observer_allowed: false,
    requires_approval: false,
    description: "Create or update a lead without queueing or contact.",
  },
  "campaign.pause": {
    name: "campaign.pause",
    risk: "R2",
    minimum_role: "manager",
    required_scopes: ["campaigns:write"],
    observer_allowed: false,
    requires_approval: false,
    description: "Move one exact campaign toward the safer paused state.",
  },
  "lead.mark_dnc": {
    name: "lead.mark_dnc",
    risk: "R2",
    minimum_role: "member",
    required_scopes: ["leads:write"],
    observer_allowed: false,
    requires_approval: false,
    description: "Apply an irreversible tenant-scoped contact suppression.",
  },
  "campaign.stage_lead": {
    name: "campaign.stage_lead",
    risk: "R2",
    minimum_role: "manager",
    required_scopes: ["campaigns:write", "leads:read"],
    observer_allowed: false,
    requires_approval: true,
    description: "Stage one exact lead for a non-active campaign.",
  },
  "campaign.activate": {
    name: "campaign.activate",
    risk: "R3",
    minimum_role: "admin",
    required_scopes: ["campaigns:write", "calls:write"],
    observer_allowed: false,
    requires_approval: true,
    description: "Activate a preflight-certified campaign.",
  },
  "campaign.dispatch": {
    name: "campaign.dispatch",
    risk: "R3",
    minimum_role: "admin",
    required_scopes: ["campaigns:write", "calls:write"],
    observer_allowed: false,
    requires_approval: true,
    description: "Request a bounded dispatch for one exact campaign.",
  },
});

export function getCommandDefinition(
  name: unknown,
): CommandDefinition {
  if (
    typeof name !== "string" ||
    !Object.prototype.hasOwnProperty.call(COMMAND_REGISTRY, name)
  ) {
    throw new ControlPlaneRegistryError(
      "UNKNOWN_COMMAND",
      "The requested control-plane command is not registered",
    );
  }
  return COMMAND_REGISTRY[name as ControlCommandName];
}

const EXACT_READ_ALIASES: Readonly<
  Record<string, { name: ControlCommandName; args: JsonObject }>
> = Object.freeze({
  // A help request deliberately resolves to the server-derived context result,
  // which includes the finite R0 command guide. No new command identifier is
  // needed, so the durable external-observer SQL envelope stays unchanged.
  "help": { name: "operator.context", args: {} },
  "commands": { name: "operator.context", args: {} },
  "dial smart help": { name: "operator.context", args: {} },
  "solar exit help": { name: "operator.context", args: {} },
  "whoami": { name: "operator.context", args: {} },
  "who am i": { name: "operator.context", args: {} },
  "context": { name: "operator.context", args: {} },
  "operator context": { name: "operator.context", args: {} },
  "status": { name: "system.status", args: {} },
  "stats": { name: "system.status", args: {} },
  "system status": { name: "system.status", args: {} },
  "elite brief": { name: "elite.solar_brief", args: {} },
  "elite solar brief": { name: "elite.solar_brief", args: {} },
  "solar brief": { name: "elite.solar_brief", args: {} },
  "solar exit brief": { name: "elite.solar_brief", args: {} },
  "elite pulse": { name: "elite.solar_pulse", args: {} },
  "elite solar pulse": { name: "elite.solar_pulse", args: {} },
  "solar pulse": { name: "elite.solar_pulse", args: {} },
  "solar exit pulse": { name: "elite.solar_pulse", args: {} },
  "morning beat": { name: "elite.solar_pulse", args: {} },
  "elite morning beat": { name: "elite.solar_pulse", args: {} },
  "elite solar morning beat": { name: "elite.solar_pulse", args: {} },
  "solar morning beat": { name: "elite.solar_pulse", args: {} },
  "campaigns": { name: "campaign.list", args: {} },
  "list campaigns": { name: "campaign.list", args: {} },
});

/**
 * Resolve only a finite observer-safe alias vocabulary. Unknown, fuzzy, or
 * ambiguous text fails closed and is never forwarded to an LLM.
 */
export function parseConversationalCommand(
  value: unknown,
): ParsedConversationalCommand {
  if (typeof value !== "string" || value.length === 0) {
    throw new ControlPlaneRegistryError(
      "COMMAND_TEXT_REQUIRED",
      "A conversational command is required",
    );
  }
  if (value.length > MAX_CONVERSATIONAL_COMMAND_LENGTH) {
    throw new ControlPlaneRegistryError(
      "COMMAND_TEXT_LIMIT",
      "The conversational command exceeds the 512 character limit",
    );
  }
  // Visible ASCII only prevents invisible controls, bidirectional overrides,
  // and Unicode confusables from changing command selection.
  if (!/^[\x20-\x7e]+$/.test(value)) {
    throw new ControlPlaneRegistryError(
      "UNSAFE_COMMAND_TEXT",
      "Conversational commands must use visible ASCII characters",
    );
  }

  const collapsed = value.trim().replace(/ +/g, " ");
  const normalized = collapsed.toLowerCase();
  const exact = Object.prototype.hasOwnProperty.call(
      EXACT_READ_ALIASES,
      normalized,
    )
    ? EXACT_READ_ALIASES[normalized]
    : undefined;
  if (exact) {
    return {
      command: { name: exact.name, args: { ...exact.args } },
      mode: "plan",
      parser: "deterministic_alias_v1",
    };
  }

  const campaignMatch = collapsed.match(
    /^(?:campaign|inspect campaign|campaign inspect) ([0-9A-Fa-f-]{36})$/i,
  );
  if (campaignMatch && CANONICAL_UUID_PATTERN.test(campaignMatch[1])) {
    return {
      command: {
        name: "campaign.inspect",
        args: { campaign_id: campaignMatch[1] },
      },
      mode: "plan",
      parser: "deterministic_alias_v1",
    };
  }

  const releaseMatch = collapsed.match(
    /^(?:release|campaign release|campaign readiness) ([0-9A-Fa-f-]{36})$/i,
  );
  if (releaseMatch && CANONICAL_UUID_PATTERN.test(releaseMatch[1])) {
    return {
      command: {
        name: "campaign.inspect",
        args: { campaign_id: releaseMatch[1], include: ["release_status"] },
      },
      mode: "plan",
      parser: "deterministic_alias_v1",
    };
  }

  throw new ControlPlaneRegistryError(
    "UNKNOWN_COMMAND_TEXT",
    "The conversational command is not an exact registered alias",
  );
}
