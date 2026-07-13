import { scopeGrants } from "../_shared/control-plane/authorization.ts";
import type {
  AuthorizedCommandIdentity,
  OrganizationRole,
} from "../_shared/control-plane/types.ts";

const ZAPIER_API_KEY_PATTERN = /^dsk_live_[A-Za-z0-9]{32}$/;
const CANONICAL_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ORGANIZATION_ROLES = new Set<OrganizationRole>([
  "member",
  "manager",
  "admin",
  "owner",
]);
const MAX_SOURCE_SCOPES = 64;
const SAFE_SCOPE_PATTERN = /^[a-z][a-z0-9_-]*(?::[a-z][a-z0-9_-]*)?$/;

export type ZapierObserverAuthErrorCode =
  | "missing_authorization"
  | "invalid_authorization"
  | "invalid_resolved_identity";

export class ZapierObserverAuthError extends Error {
  readonly code: ZapierObserverAuthErrorCode;

  constructor(code: ZapierObserverAuthErrorCode) {
    super(code);
    this.name = "ZapierObserverAuthError";
    this.code = code;
  }
}

/**
 * Accept only the existing Dial Smart API-key wire format. Credentials in a
 * query string or JSON body are never considered by the observer adapter.
 */
export function extractZapierApiKeyCredential(
  authorizationHeader: string | null,
): string {
  if (authorizationHeader === null || authorizationHeader.length === 0) {
    throw new ZapierObserverAuthError("missing_authorization");
  }
  if (
    authorizationHeader.length > 128 ||
    !authorizationHeader.startsWith("Bearer ")
  ) {
    throw new ZapierObserverAuthError("invalid_authorization");
  }
  const credential = authorizationHeader.slice("Bearer ".length);
  if (!ZAPIER_API_KEY_PATTERN.test(credential)) {
    throw new ZapierObserverAuthError("invalid_authorization");
  }
  return credential;
}

function invalidIdentity(): never {
  throw new ZapierObserverAuthError("invalid_resolved_identity");
}

/**
 * Validate and narrow identity returned by the future server-side credential
 * resolver. Even a broadly scoped API key is projected onto the two exact
 * read scopes used by the observer profile; write/admin scopes never cross
 * this adapter boundary.
 */
export function normalizeResolvedZapierIdentity(
  value: unknown,
): AuthorizedCommandIdentity {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return invalidIdentity();
  }
  const identity = value as Record<string, unknown>;
  if (
    identity.channel !== "zapier" ||
    typeof identity.installation_id !== "string" ||
    !CANONICAL_UUID_PATTERN.test(identity.installation_id) ||
    typeof identity.external_principal_id !== "string" ||
    !CANONICAL_UUID_PATTERN.test(identity.external_principal_id) ||
    typeof identity.user_id !== "string" ||
    !CANONICAL_UUID_PATTERN.test(identity.user_id) ||
    typeof identity.organization_id !== "string" ||
    !CANONICAL_UUID_PATTERN.test(identity.organization_id) ||
    typeof identity.organization_role !== "string" ||
    !ORGANIZATION_ROLES.has(identity.organization_role as OrganizationRole) ||
    !Array.isArray(identity.granted_scopes) ||
    identity.granted_scopes.length > MAX_SOURCE_SCOPES
  ) {
    return invalidIdentity();
  }

  const sourceScopes: string[] = [];
  for (const scope of identity.granted_scopes) {
    if (
      typeof scope !== "string" || scope.length === 0 || scope.length > 128 ||
      !SAFE_SCOPE_PATTERN.test(scope)
    ) {
      return invalidIdentity();
    }
    sourceScopes.push(scope);
  }

  const grantedScopes: string[] = [];
  if (scopeGrants(sourceScopes, "system:read")) {
    grantedScopes.push("system:read");
  }
  if (scopeGrants(sourceScopes, "campaigns:read")) {
    grantedScopes.push("campaigns:read");
  }

  return {
    channel: "zapier",
    installation_id: identity.installation_id,
    external_principal_id: identity.external_principal_id,
    user_id: identity.user_id,
    organization_id: identity.organization_id,
    organization_role: identity.organization_role as OrganizationRole,
    granted_scopes: grantedScopes,
  };
}
