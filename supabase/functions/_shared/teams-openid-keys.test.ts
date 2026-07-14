// deno-lint-ignore-file no-import-prefix
import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  createTeamsBotPublicJwkResolver,
  TEAMS_BOT_JWKS_URL,
  TEAMS_BOT_OPENID_METADATA_URL,
  TeamsOpenIdKeyError,
} from "./teams-openid-keys.ts";

const KID = "bot-framework-key-1";
type JwkWithKid = JsonWebKey & { kid: string };

const JWK: JwkWithKid = {
  kty: "RSA",
  kid: KID,
  n: "sXch0ctqwhqR2QpphxoKVQ",
  e: "AQAB",
};

function response(value: unknown, cacheControl = "max-age=120"): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": cacheControl,
    },
  });
}

Deno.test("Teams JWK resolver accepts only the pinned metadata path and caches keys", async () => {
  const calls: string[] = [];
  const resolver = createTeamsBotPublicJwkResolver({
    now: () => 1_000,
    fetcher: (url) => {
      calls.push(String(url));
      if (url === TEAMS_BOT_OPENID_METADATA_URL) {
        return Promise.resolve(response({
          issuer: "https://api.botframework.com",
          jwks_uri: TEAMS_BOT_JWKS_URL,
          id_token_signing_alg_values_supported: ["RS256"],
        }));
      }
      if (url === TEAMS_BOT_JWKS_URL) {
        return Promise.resolve(response({ keys: [JWK] }));
      }
      throw new Error("unexpected endpoint");
    },
  });

  assertEquals(await resolver(KID), JWK);
  assertEquals(await resolver("unknown-key"), null);
  assertEquals(calls, [TEAMS_BOT_OPENID_METADATA_URL, TEAMS_BOT_JWKS_URL]);
});

Deno.test("Teams JWK resolver rejects metadata-controlled key URLs and malformed responses", async () => {
  const resolver = createTeamsBotPublicJwkResolver({
    fetcher: () =>
      Promise.resolve(response({
        issuer: "https://api.botframework.com",
        jwks_uri: "https://attacker.invalid/keys",
        id_token_signing_alg_values_supported: ["RS256"],
      })),
  });
  await assertRejects(
    () => resolver(KID),
    TeamsOpenIdKeyError,
    "OPENID_METADATA_INVALID",
  );

  const badBody = createTeamsBotPublicJwkResolver({
    fetcher: () =>
      Promise.resolve(
        new Response("not-json", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
  });
  await assertRejects(
    () => badBody(KID),
    TeamsOpenIdKeyError,
    "OPENID_RESPONSE_INVALID",
  );
});
