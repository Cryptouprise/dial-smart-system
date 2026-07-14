// deno-lint-ignore-file no-import-prefix -- repository Edge tests pin this std version.
import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  extractZapierApiKeyCredential,
  normalizeResolvedZapierIdentity,
  ZapierObserverAuthError,
} from "./auth.ts";

const KEY = `dsk_live_${"A1".repeat(16)}`;
const INSTALLATION_ID = "123e4567-e89b-42d3-a456-426614174000";
const PRINCIPAL_ID = "223e4567-e89b-42d3-a456-426614174000";
const USER_ID = "323e4567-e89b-42d3-a456-426614174000";
const ORGANIZATION_ID = "423e4567-e89b-42d3-a456-426614174000";

function resolvedIdentity(overrides: Record<string, unknown> = {}) {
  return {
    channel: "zapier",
    installation_id: INSTALLATION_ID,
    external_principal_id: PRINCIPAL_ID,
    user_id: USER_ID,
    organization_id: ORGANIZATION_ID,
    organization_role: "member",
    granted_scopes: ["system:read", "campaigns:read"],
    ...overrides,
  };
}

Deno.test("accepts only the exact Dial Smart bearer key format", () => {
  assertEquals(extractZapierApiKeyCredential(`Bearer ${KEY}`), KEY);
  for (
    const header of [
      null,
      "",
      KEY,
      `bearer ${KEY}`,
      `Bearer  ${KEY}`,
      `Bearer ${KEY} `,
      "Bearer dsk_live_short",
      `Basic ${KEY}`,
    ]
  ) {
    assertThrows(
      () => extractZapierApiKeyCredential(header),
      ZapierObserverAuthError,
    );
  }
});

Deno.test("normalizes server identity and strips every non-observer scope", () => {
  const normalized = normalizeResolvedZapierIdentity(resolvedIdentity({
    organization_role: "owner",
    granted_scopes: ["admin", "write", "leads:write", "sms:write"],
  }));
  assertEquals(normalized, {
    channel: "zapier",
    installation_id: INSTALLATION_ID,
    external_principal_id: PRINCIPAL_ID,
    user_id: USER_ID,
    organization_id: ORGANIZATION_ID,
    organization_role: "owner",
    granted_scopes: ["system:read", "campaigns:read"],
  });
});

Deno.test("projects partial read credentials without widening them", () => {
  assertEquals(
    normalizeResolvedZapierIdentity(resolvedIdentity({
      granted_scopes: ["system:read"],
    })).granted_scopes,
    ["system:read"],
  );
  assertEquals(
    normalizeResolvedZapierIdentity(resolvedIdentity({
      granted_scopes: ["campaigns:read"],
    })).granted_scopes,
    ["campaigns:read"],
  );
  assertEquals(
    normalizeResolvedZapierIdentity(resolvedIdentity({
      granted_scopes: ["leads:read"],
    })).granted_scopes,
    [],
  );
});

Deno.test("rejects malformed or non-Zapier resolved identity", () => {
  for (
    const value of [
      null,
      [],
      resolvedIdentity({ channel: "mcp" }),
      resolvedIdentity({ installation_id: "not-a-uuid" }),
      resolvedIdentity({ external_principal_id: "not-a-uuid" }),
      resolvedIdentity({ user_id: "not-a-uuid" }),
      resolvedIdentity({ organization_id: "not-a-uuid" }),
      resolvedIdentity({ organization_role: "superadmin" }),
      resolvedIdentity({ granted_scopes: ["system:read", "Calls:WRITE"] }),
      resolvedIdentity({ granted_scopes: "system:read" }),
    ]
  ) {
    assertThrows(
      () => normalizeResolvedZapierIdentity(value),
      ZapierObserverAuthError,
      "invalid_resolved_identity",
    );
  }
});
