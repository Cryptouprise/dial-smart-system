import { getCommandDefinition } from "./registry.ts";
import { CONTROL_PROFILES, ORGANIZATION_ROLES } from "./types.ts";
import type {
  CommandAuthorizationContext,
  CommandDefinition,
  ControlCommandName,
  JsonValue,
  ObserverAuthority,
  ObserverControlResult,
  OrganizationRole,
} from "./types.ts";

const ROLE_RANK: Readonly<Record<OrganizationRole, number>> = Object.freeze({
  member: 0,
  manager: 1,
  admin: 2,
  owner: 3,
});

const CANONICAL_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export class ControlPlaneAuthorizationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ControlPlaneAuthorizationError";
    this.code = code;
  }
}

export const OBSERVER_AUTHORITY: Readonly<ObserverAuthority> = Object.freeze({
  contact_authorized: false,
  launch_authorized: false,
  queue_mutation_authorized: false,
  crm_write_authorized: false,
  spend_authorized: false,
});

/** Match the existing API-key hierarchy without importing network/DB code. */
export function scopeGrants(
  grantedScopes: readonly string[],
  needed: string,
): boolean {
  const granted = new Set(grantedScopes);
  if (granted.has("admin") || granted.has(needed)) return true;

  const [domain, action] = needed.includes(":")
    ? needed.split(":", 2)
    : ["", needed];
  if (action === "read" && (granted.has("read") || granted.has("write"))) {
    return true;
  }
  if (action === "write" && granted.has("write")) return true;
  if (domain && action === "read" && granted.has(`${domain}:write`)) {
    return true;
  }
  return false;
}

export function authorizeCommand(
  commandName: ControlCommandName,
  context: CommandAuthorizationContext,
): CommandDefinition {
  const definition = getCommandDefinition(commandName);

  if (!(CONTROL_PROFILES as readonly unknown[]).includes(context.profile)) {
    throw new ControlPlaneAuthorizationError(
      "INVALID_PROFILE",
      "The control-plane capability profile is not recognized",
    );
  }
  if (!(ORGANIZATION_ROLES as readonly unknown[]).includes(context.role)) {
    throw new ControlPlaneAuthorizationError(
      "INVALID_ROLE",
      "The organization role is not recognized",
    );
  }
  if (
    !Array.isArray(context.scopes) ||
    context.scopes.some((scope) => typeof scope !== "string")
  ) {
    throw new ControlPlaneAuthorizationError(
      "INVALID_SCOPES",
      "Granted scopes must be a string array",
    );
  }

  if (context.profile === "observer" && !definition.observer_allowed) {
    throw new ControlPlaneAuthorizationError(
      "OBSERVER_PROFILE_BLOCKED",
      "The observer profile permits R0 read commands only",
    );
  }
  if (ROLE_RANK[context.role] < ROLE_RANK[definition.minimum_role]) {
    throw new ControlPlaneAuthorizationError(
      "ROLE_FORBIDDEN",
      `Command requires organization role ${definition.minimum_role} or higher`,
    );
  }

  const missing = definition.required_scopes.filter((scope) =>
    !scopeGrants(context.scopes, scope)
  );
  if (missing.length > 0) {
    throw new ControlPlaneAuthorizationError(
      "SCOPE_FORBIDDEN",
      `Command is missing required scope: ${missing[0]}`,
    );
  }
  return definition;
}

/** Construct an observer result without accepting any authority override. */
export function createObserverResult<T extends JsonValue>(input: {
  command_id: string;
  command_name: ControlCommandName;
  status: ObserverControlResult<T>["status"];
  data: T;
}): ObserverControlResult<T> {
  if (!CANONICAL_UUID_PATTERN.test(input.command_id)) {
    throw new ControlPlaneAuthorizationError(
      "INVALID_COMMAND_ID",
      "Observer result command_id must be a canonical lowercase UUID",
    );
  }
  const definition = getCommandDefinition(input.command_name);
  if (definition.risk !== "R0" || !definition.observer_allowed) {
    throw new ControlPlaneAuthorizationError(
      "OBSERVER_RESULT_BLOCKED",
      "Observer results may be created for R0 commands only",
    );
  }
  return {
    version: "control.result.v1",
    profile: "observer",
    command_id: input.command_id,
    command_name: input.command_name,
    status: input.status,
    authority: OBSERVER_AUTHORITY,
    data: input.data,
  };
}
