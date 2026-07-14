import { parseBoundedJsonObject } from "./bounded-json.ts";
import { TEAMS_BOT_EXPECTED_ISSUER } from "./teams-bot-auth.ts";

export const TEAMS_BOT_OPENID_METADATA_URL =
  "https://login.botframework.com/v1/.well-known/openidconfiguration";
export const TEAMS_BOT_JWKS_URL =
  "https://login.botframework.com/v1/.well-known/keys";

const MAX_DOCUMENT_BYTES = 256 * 1024;
const DEFAULT_CACHE_SECONDS = 60;
const MAX_CACHE_SECONDS = 300;
const KEY_ID_PATTERN = /^[A-Za-z0-9._~:/+=-]{1,256}$/;
const JSON_LIMITS = Object.freeze({
  maxDepth: 8,
  maxNodes: 512,
  maxObjectKeys: 64,
  maxArrayLength: 128,
  maxStringLength: 32_768,
});

export class TeamsOpenIdKeyError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

export interface TeamsOpenIdKeyResolverConfig {
  fetcher?: typeof fetch;
  now?: () => number;
}

type CachedKeys = {
  by_id: Map<string, JsonWebKey>;
  expires_at: number;
};

function fail(code: string): never {
  throw new TeamsOpenIdKeyError(code);
}

function acceptsJson(contentType: string | null): boolean {
  return contentType !== null &&
    /^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?$/i
      .test(contentType.trim());
}

function cacheSeconds(cacheControl: string | null): number {
  const match = cacheControl?.match(/(?:^|,)\s*max-age=(\d+)(?:\s*,|$)/i);
  if (match === null || match === undefined) return DEFAULT_CACHE_SECONDS;
  const seconds = Number(match[1]);
  return Number.isSafeInteger(seconds)
    ? Math.min(Math.max(seconds, 1), MAX_CACHE_SECONDS)
    : DEFAULT_CACHE_SECONDS;
}

async function readBoundedJson(
  response: Response,
): Promise<Record<string, unknown>> {
  if (
    response.status !== 200 ||
    !acceptsJson(response.headers.get("content-type"))
  ) {
    return fail("OPENID_RESPONSE_INVALID");
  }
  const contentLength = response.headers.get("content-length");
  if (
    contentLength !== null &&
    (!/^(?:0|[1-9][0-9]*)$/.test(contentLength) ||
      Number(contentLength) > MAX_DOCUMENT_BYTES)
  ) {
    return fail("OPENID_RESPONSE_INVALID");
  }
  if (response.body === null) return fail("OPENID_RESPONSE_INVALID");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_DOCUMENT_BYTES) {
        await reader.cancel("openid_document_too_large");
        return fail("OPENID_RESPONSE_INVALID");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return fail("OPENID_RESPONSE_INVALID");
  }
  try {
    return parseBoundedJsonObject(text, JSON_LIMITS);
  } catch {
    return fail("OPENID_RESPONSE_INVALID");
  }
}

function parseMetadata(value: Record<string, unknown>): void {
  if (
    value.issuer !== TEAMS_BOT_EXPECTED_ISSUER ||
    value.jwks_uri !== TEAMS_BOT_JWKS_URL ||
    !Array.isArray(value.id_token_signing_alg_values_supported) ||
    value.id_token_signing_alg_values_supported.length > 8 ||
    !value.id_token_signing_alg_values_supported.includes("RS256")
  ) {
    fail("OPENID_METADATA_INVALID");
  }
}

function parseKeys(value: Record<string, unknown>): Map<string, JsonWebKey> {
  if (
    !Array.isArray(value.keys) || value.keys.length === 0 ||
    value.keys.length > 128
  ) {
    return fail("OPENID_KEYS_INVALID");
  }
  const keys = new Map<string, JsonWebKey>();
  for (const candidate of value.keys) {
    if (
      !candidate || typeof candidate !== "object" || Array.isArray(candidate)
    ) {
      return fail("OPENID_KEYS_INVALID");
    }
    const key = candidate as JsonWebKey & { kid?: unknown };
    if (
      typeof key.kid !== "string" || !KEY_ID_PATTERN.test(key.kid) ||
      keys.has(key.kid)
    ) {
      return fail("OPENID_KEYS_INVALID");
    }
    // The inbound verifier independently validates every cryptographic JWK
    // property. This resolver owns only the pinned-source and cache boundary.
    keys.set(key.kid, key);
  }
  return keys;
}

/**
 * Pinned, bounded resolver for Bot Framework inbound signing keys. It never
 * follows metadata-controlled URLs, accepts only the Microsoft public-cloud
 * endpoints above, and exposes no user/activity identity.
 */
export function createTeamsBotPublicJwkResolver(
  config: TeamsOpenIdKeyResolverConfig = {},
): (keyId: string) => Promise<JsonWebKey | null> {
  const fetcher = config.fetcher ?? fetch;
  const now = config.now ?? Date.now;
  let cache: CachedKeys | null = null;
  let refresh: Promise<CachedKeys> | null = null;

  const load = async (): Promise<CachedKeys> => {
    if (refresh !== null) return await refresh;
    refresh = (async () => {
      let metadataResponse: Response;
      try {
        metadataResponse = await fetcher(TEAMS_BOT_OPENID_METADATA_URL, {
          method: "GET",
          headers: { Accept: "application/json" },
          redirect: "error",
        });
      } catch {
        return fail("OPENID_FETCH_FAILED");
      }
      const metadata = await readBoundedJson(metadataResponse);
      parseMetadata(metadata);

      let keysResponse: Response;
      try {
        keysResponse = await fetcher(TEAMS_BOT_JWKS_URL, {
          method: "GET",
          headers: { Accept: "application/json" },
          redirect: "error",
        });
      } catch {
        return fail("OPENID_FETCH_FAILED");
      }
      const keys = parseKeys(await readBoundedJson(keysResponse));
      const seconds = Math.min(
        cacheSeconds(metadataResponse.headers.get("cache-control")),
        cacheSeconds(keysResponse.headers.get("cache-control")),
      );
      const next = { by_id: keys, expires_at: now() + seconds * 1_000 };
      cache = next;
      return next;
    })();
    try {
      return await refresh;
    } finally {
      refresh = null;
    }
  };

  return async (keyId: string): Promise<JsonWebKey | null> => {
    if (!KEY_ID_PATTERN.test(keyId)) return null;
    const active = cache !== null && now() < cache.expires_at
      ? cache
      : await load();
    return active.by_id.get(keyId) ?? null;
  };
}
