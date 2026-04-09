/**
 * API Key authentication for external / MCP / AI-agent access.
 *
 * Key format:  dsk_live_<32 random base62 chars>
 * Storage:     SHA-256 hex of the full plaintext, plus a 12-char prefix for UI display.
 * Transport:   `Authorization: Bearer dsk_live_...`
 *
 * Usage inside an edge function:
 *
 *   import { authenticateApiKey, requireScope } from "../_shared/api-auth.ts";
 *
 *   const ctx = await authenticateApiKey(req, supabaseAdmin);
 *   requireScope(ctx, "leads:write");
 *   // ctx.userId, ctx.organizationId, ctx.scopes, ctx.apiKeyId available
 */

import { AuthenticationError } from "./utils.ts";

export interface ApiKeyContext {
  apiKeyId: string;
  userId: string;
  organizationId: string | null;
  scopes: string[];
  rateLimitPerMinute: number;
  keyName: string;
}

/**
 * SHA-256 hash of the plaintext key (hex-encoded). Deno-native, no deps.
 */
export async function hashApiKey(plaintext: string): Promise<string> {
  const data = new TextEncoder().encode(plaintext);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Generate a fresh API key. Returns the plaintext (show once) and the hash (store).
 */
export async function generateApiKey(): Promise<{
  plaintext: string;
  hash: string;
  prefix: string;
}> {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const random = Array.from(bytes)
    .map((b) => alphabet[b % alphabet.length])
    .join("");
  const plaintext = `dsk_live_${random}`;
  const hash = await hashApiKey(plaintext);
  const prefix = plaintext.slice(0, 12); // "dsk_live_ABC"
  return { plaintext, hash, prefix };
}

/**
 * Extract the bearer token from the Authorization header.
 */
function extractBearer(req: Request): string | null {
  const header = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

/**
 * Validate an API key and return the authenticated context.
 * Throws AuthenticationError on any failure.
 */
export async function authenticateApiKey(
  req: Request,
  supabaseAdmin: any,
): Promise<ApiKeyContext> {
  const token = extractBearer(req);
  if (!token) {
    throw new AuthenticationError("Missing Authorization: Bearer <api_key> header");
  }
  if (!token.startsWith("dsk_")) {
    throw new AuthenticationError("Invalid API key format (expected dsk_live_...)");
  }

  const hash = await hashApiKey(token);

  const { data: key, error } = await supabaseAdmin
    .from("api_keys")
    .select(
      "id, user_id, organization_id, scopes, rate_limit_per_minute, name, expires_at, revoked_at",
    )
    .eq("key_hash", hash)
    .maybeSingle();

  if (error) {
    console.error("[api-auth] DB error looking up key:", error);
    throw new AuthenticationError("Key lookup failed");
  }
  if (!key) {
    throw new AuthenticationError("Invalid API key");
  }
  if (key.revoked_at) {
    throw new AuthenticationError("API key has been revoked");
  }
  if (key.expires_at && new Date(key.expires_at) < new Date()) {
    throw new AuthenticationError("API key has expired");
  }

  // Fire-and-forget touch + audit log
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null;

  supabaseAdmin.rpc("touch_api_key", { p_key_id: key.id, p_ip: ip }).then(() => {});

  return {
    apiKeyId: key.id,
    userId: key.user_id,
    organizationId: key.organization_id,
    scopes: key.scopes ?? [],
    rateLimitPerMinute: key.rate_limit_per_minute ?? 120,
    keyName: key.name,
  };
}

/**
 * Check that the API key context has a given scope. Throws on failure.
 * Scope hierarchy:
 *   "admin"              implies everything
 *   "write"              implies every "*:write" and "*:read"
 *   "read"               implies every "*:read"
 *   "<domain>:write"     implies "<domain>:read"
 *   "<domain>:read"      only reads that domain
 */
export function requireScope(ctx: ApiKeyContext, needed: string): void {
  const s = new Set(ctx.scopes);

  if (s.has("admin")) return;
  if (s.has(needed)) return;

  const [domain, action] = needed.includes(":") ? needed.split(":") : [null, needed];

  // Global wildcards
  if (action === "read" && (s.has("read") || s.has("write"))) return;
  if (action === "write" && s.has("write")) return;

  // Domain wildcard: having "<domain>:write" grants "<domain>:read"
  if (domain && action === "read" && s.has(`${domain}:write`)) return;

  throw new AuthenticationError(
    `API key missing required scope: ${needed} (has: ${ctx.scopes.join(", ") || "none"})`,
  );
}

/**
 * Async audit-log write. Non-blocking.
 */
export function logApiRequest(
  supabaseAdmin: any,
  ctx: ApiKeyContext,
  req: Request,
  info: {
    status: number;
    durationMs: number;
    error?: string;
  },
): void {
  try {
    const url = new URL(req.url);
    supabaseAdmin
      .from("api_key_audit_log")
      .insert({
        api_key_id: ctx.apiKeyId,
        user_id: ctx.userId,
        method: req.method,
        path: url.pathname + url.search,
        status_code: info.status,
        ip_address:
          req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        user_agent: req.headers.get("user-agent") ?? null,
        duration_ms: info.durationMs,
        error: info.error ?? null,
      })
      .then(() => {});
  } catch {
    // Never let audit logging fail a request.
  }
}
