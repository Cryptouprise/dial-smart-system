export const CONTROL_CHANNELS = [
  "slack",
  "teams",
  "zapier",
  "mcp",
] as const;

export type ControlChannel = typeof CONTROL_CHANNELS[number];

export const CONTROL_MODES = ["plan", "execute"] as const;
export type ControlMode = typeof CONTROL_MODES[number];

export const CONTROL_RISK_CLASSES = ["R0", "R1", "R2", "R3"] as const;
export type ControlRiskClass = typeof CONTROL_RISK_CLASSES[number];

export const ORGANIZATION_ROLES = [
  "member",
  "manager",
  "admin",
  "owner",
] as const;
export type OrganizationRole = typeof ORGANIZATION_ROLES[number];

export const CONTROL_PROFILES = ["observer", "operator"] as const;
export type ControlProfile = typeof CONTROL_PROFILES[number];

export const CONTROL_COMMAND_NAMES = [
  "operator.context",
  "system.status",
  "campaign.list",
  "campaign.inspect",
  "campaign.upsert_draft",
  "lead.upsert",
  "campaign.pause",
  "lead.mark_dnc",
  "campaign.stage_lead",
  "campaign.activate",
  "campaign.dispatch",
] as const;

export type ControlCommandName = typeof CONTROL_COMMAND_NAMES[number];

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export interface ControlCommand {
  name: ControlCommandName;
  args: JsonObject;
}

/**
 * The only command shape accepted from an adapter or API client. Identity,
 * tenant, role, scopes, internal-service state, and effect authority are
 * deliberately absent and must be attached by trusted server code later.
 */
export interface WireCommandRequestV1 {
  version: "control.command.v1";
  external_request_id: string;
  /** Optional for transport-neutral parsing; required by Zapier's replay lane. */
  source_occurred_at?: string;
  command: ControlCommand;
  mode: ControlMode;
  idempotency_key?: string;
  approval_handle?: string;
}

export interface AuthorizedCommandIdentity {
  channel: ControlChannel;
  installation_id: string;
  external_principal_id: string;
  user_id: string;
  organization_id: string;
  organization_role: OrganizationRole;
  granted_scopes: string[];
}

export interface IntentHashInput {
  organization_id: string;
  user_id: string;
  channel: ControlChannel;
  installation_id: string;
  command: ControlCommand;
  mode: ControlMode;
  /** Accepted for call-site convenience but intentionally never hashed. */
  approval_handle?: string;
}

export interface CommandDefinition {
  name: ControlCommandName;
  risk: ControlRiskClass;
  minimum_role: OrganizationRole;
  required_scopes: readonly string[];
  observer_allowed: boolean;
  requires_approval: boolean;
  description: string;
}

export interface CommandAuthorizationContext {
  profile: ControlProfile;
  role: OrganizationRole;
  scopes: readonly string[];
}

export interface ParsedConversationalCommand {
  command: ControlCommand;
  mode: "plan";
  parser: "deterministic_alias_v1";
}

export interface ObserverAuthority {
  contact_authorized: false;
  launch_authorized: false;
  queue_mutation_authorized: false;
  crm_write_authorized: false;
  spend_authorized: false;
}

export interface ObserverControlResult<T extends JsonValue = JsonValue> {
  version: "control.result.v1";
  profile: "observer";
  command_id: string;
  command_name: ControlCommandName;
  status: "completed" | "held" | "failed";
  authority: ObserverAuthority;
  data: T;
}
