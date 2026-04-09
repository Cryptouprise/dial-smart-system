/**
 * Deno unit tests for _shared/api-auth.ts.
 *
 * Run from the repo root:
 *   deno test supabase/functions/_shared/api-auth.test.ts
 *
 * These tests guard the pure-logic parts of the API key layer without
 * touching Supabase — hash determinism, key format, and the scope
 * hierarchy that every edge function relies on.
 */

import {
  assert,
  assertEquals,
  assertRejects,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type ApiKeyContext,
  authenticateApiKey,
  generateApiKey,
  hashApiKey,
  requireScope,
} from "./api-auth.ts";
import { AuthenticationError } from "./utils.ts";

function ctx(overrides: Partial<ApiKeyContext> = {}): ApiKeyContext {
  return {
    apiKeyId: "test-key",
    userId: "test-user",
    organizationId: null,
    scopes: [],
    rateLimitPerMinute: 120,
    keyName: "test",
    ...overrides,
  };
}

Deno.test("hashApiKey is deterministic and 64 hex chars", async () => {
  const a = await hashApiKey("dsk_live_abc");
  const b = await hashApiKey("dsk_live_abc");
  assertEquals(a, b);
  assertEquals(a.length, 64);
  assert(/^[0-9a-f]{64}$/.test(a));
});

Deno.test("hashApiKey produces different hashes for different inputs", async () => {
  const a = await hashApiKey("dsk_live_abc");
  const b = await hashApiKey("dsk_live_abd");
  assert(a !== b);
});

Deno.test("generateApiKey produces dsk_live_ prefix and matching hash", async () => {
  const { plaintext, hash, prefix } = await generateApiKey();
  assert(plaintext.startsWith("dsk_live_"));
  assertEquals(prefix, plaintext.slice(0, 12));
  assertEquals(hash, await hashApiKey(plaintext));
  // 9 prefix chars + 32 random chars = 41 total
  assertEquals(plaintext.length, "dsk_live_".length + 32);
});

Deno.test("generateApiKey produces unique keys each call", async () => {
  const a = await generateApiKey();
  const b = await generateApiKey();
  assert(a.plaintext !== b.plaintext);
  assert(a.hash !== b.hash);
});

// ── Scope hierarchy ─────────────────────────────────────────────────────────

Deno.test("requireScope: admin scope grants everything", () => {
  const c = ctx({ scopes: ["admin"] });
  requireScope(c, "leads:read");
  requireScope(c, "calls:write");
  requireScope(c, "system:read");
  requireScope(c, "anything_at_all:write");
});

Deno.test("requireScope: exact match passes", () => {
  const c = ctx({ scopes: ["leads:read"] });
  requireScope(c, "leads:read");
});

Deno.test("requireScope: domain:write implies domain:read", () => {
  const c = ctx({ scopes: ["leads:write"] });
  requireScope(c, "leads:read");
  requireScope(c, "leads:write");
});

Deno.test("requireScope: global write implies everything", () => {
  const c = ctx({ scopes: ["write"] });
  requireScope(c, "leads:read");
  requireScope(c, "calls:write");
});

Deno.test("requireScope: global read implies all reads", () => {
  const c = ctx({ scopes: ["read"] });
  requireScope(c, "leads:read");
  requireScope(c, "campaigns:read");
});

Deno.test("requireScope: global read does NOT imply writes", () => {
  const c = ctx({ scopes: ["read"] });
  assertThrows(() => requireScope(c, "leads:write"), AuthenticationError);
});

Deno.test("requireScope: leads:read does NOT imply calls:read", () => {
  const c = ctx({ scopes: ["leads:read"] });
  assertThrows(() => requireScope(c, "calls:read"), AuthenticationError);
});

Deno.test("requireScope: leads:read does NOT imply leads:write", () => {
  const c = ctx({ scopes: ["leads:read"] });
  assertThrows(() => requireScope(c, "leads:write"), AuthenticationError);
});

Deno.test("requireScope: empty scopes rejects everything", () => {
  const c = ctx({ scopes: [] });
  assertThrows(() => requireScope(c, "leads:read"), AuthenticationError);
});

Deno.test("requireScope: error message names the missing scope", () => {
  const c = ctx({ scopes: ["leads:read"] });
  const err = assertThrows(
    () => requireScope(c, "campaigns:write"),
    AuthenticationError,
  );
  assert(
    (err as Error).message.includes("campaigns:write"),
    `error should mention the scope, got: ${(err as Error).message}`,
  );
});

// ── authenticateApiKey ──────────────────────────────────────────────────────

function mockSupabase(keyRow: Record<string, unknown> | null, opts: { dbError?: boolean } = {}) {
  // Tiny shim that mirrors the shape authenticateApiKey uses.
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle() {
                  if (opts.dbError) {
                    return Promise.resolve({ data: null, error: new Error("db blew up") });
                  }
                  return Promise.resolve({ data: keyRow, error: null });
                },
              };
            },
          };
        },
      };
    },
    rpc() {
      return { then(cb: any) { cb(); return { then() {} }; } };
    },
  };
}

function makeReq(token: string | null): Request {
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return new Request("https://example.test/v1/me", { headers });
}

Deno.test("authenticateApiKey rejects missing header", async () => {
  await assertRejects(
    () => authenticateApiKey(makeReq(null), mockSupabase(null)),
    AuthenticationError,
    "Missing",
  );
});

Deno.test("authenticateApiKey rejects wrong format", async () => {
  await assertRejects(
    () => authenticateApiKey(makeReq("not_a_dial_smart_key"), mockSupabase(null)),
    AuthenticationError,
    "format",
  );
});

Deno.test("authenticateApiKey rejects unknown key", async () => {
  await assertRejects(
    () => authenticateApiKey(makeReq("dsk_live_unknown"), mockSupabase(null)),
    AuthenticationError,
    "Invalid API key",
  );
});

Deno.test("authenticateApiKey rejects revoked key", async () => {
  await assertRejects(
    () =>
      authenticateApiKey(
        makeReq("dsk_live_revoked"),
        mockSupabase({
          id: "k1",
          user_id: "u1",
          organization_id: null,
          scopes: ["admin"],
          rate_limit_per_minute: 120,
          name: "test",
          expires_at: null,
          revoked_at: "2025-01-01T00:00:00Z",
        }),
      ),
    AuthenticationError,
    "revoked",
  );
});

Deno.test("authenticateApiKey rejects expired key", async () => {
  await assertRejects(
    () =>
      authenticateApiKey(
        makeReq("dsk_live_expired"),
        mockSupabase({
          id: "k1",
          user_id: "u1",
          organization_id: null,
          scopes: ["admin"],
          rate_limit_per_minute: 120,
          name: "test",
          expires_at: "2020-01-01T00:00:00Z",
          revoked_at: null,
        }),
      ),
    AuthenticationError,
    "expired",
  );
});

Deno.test("authenticateApiKey returns the context on valid key", async () => {
  const result = await authenticateApiKey(
    makeReq("dsk_live_valid"),
    mockSupabase({
      id: "k1",
      user_id: "u1",
      organization_id: "o1",
      scopes: ["leads:read", "campaigns:write"],
      rate_limit_per_minute: 240,
      name: "primary",
      expires_at: null,
      revoked_at: null,
    }),
  );
  assertEquals(result.apiKeyId, "k1");
  assertEquals(result.userId, "u1");
  assertEquals(result.organizationId, "o1");
  assertEquals(result.scopes, ["leads:read", "campaigns:write"]);
  assertEquals(result.rateLimitPerMinute, 240);
  assertEquals(result.keyName, "primary");
});

Deno.test("authenticateApiKey maps DB error to AuthenticationError", async () => {
  await assertRejects(
    () => authenticateApiKey(makeReq("dsk_live_db_error"), mockSupabase(null, { dbError: true })),
    AuthenticationError,
    "Key lookup failed",
  );
});
