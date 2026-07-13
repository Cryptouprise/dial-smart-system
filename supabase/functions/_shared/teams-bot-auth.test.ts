// deno-lint-ignore-file no-import-prefix -- repository Edge tests pin the deployed Deno std version.
import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  TEAMS_BOT_EXPECTED_ISSUER,
  TEAMS_BOT_MAX_AUTHORIZATION_BYTES,
  TeamsBotAuthError,
  verifyTeamsBotFrameworkRequest,
  type VerifyTeamsBotFrameworkRequestInput,
} from "./teams-bot-auth.ts";

const encoder = new TextEncoder();
const APP_ID = "9e367f62-7bce-4f48-8af4-a474bc1f6387";
const KEY_ID = "bot-framework-test-key-1";
const NOW = 1_800_000_000;
const SERVICE_URL = "https://smba.trafficmanager.net/amer/";
const ACTIVITY_BODY = JSON.stringify({
  type: "message",
  serviceUrl: SERVICE_URL,
  tenantId: "deliberately-untrusted",
  from: { id: "also-untrusted" },
});

type Fixture = {
  privateKey: CryptoKey;
  publicJwk: JsonWebKey;
};

const fixturePromise: Promise<Fixture> = (async () => {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  return {
    privateKey: pair.privateKey,
    publicJwk: await crypto.subtle.exportKey("jwk", pair.publicKey),
  };
})();

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function encodeJson(value: unknown): string {
  return encodeBase64Url(encoder.encode(JSON.stringify(value)));
}

async function signRawSegments(
  rawHeaderJson: string,
  rawPayloadJson: string,
): Promise<string> {
  const fixture = await fixturePromise;
  const header = encodeBase64Url(encoder.encode(rawHeaderJson));
  const payload = encodeBase64Url(encoder.encode(rawPayloadJson));
  const signingInput = `${header}.${payload}`;
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      fixture.privateKey,
      encoder.encode(signingInput),
    ),
  );
  return `${signingInput}.${encodeBase64Url(signature)}`;
}

async function tokenFor(overrides: {
  header?: Record<string, unknown>;
  payload?: Record<string, unknown>;
} = {}): Promise<string> {
  return await signRawSegments(
    JSON.stringify({
      alg: "RS256",
      kid: KEY_ID,
      typ: "JWT",
      ...overrides.header,
    }),
    JSON.stringify({
      iss: TEAMS_BOT_EXPECTED_ISSUER,
      aud: APP_ID,
      exp: NOW + 900,
      nbf: NOW - 60,
      serviceurl: SERVICE_URL,
      ...overrides.payload,
    }),
  );
}

async function validInput(
  overrides: Partial<VerifyTeamsBotFrameworkRequestInput> & {
    token?: string;
  } = {},
): Promise<VerifyTeamsBotFrameworkRequestInput> {
  const fixture = await fixturePromise;
  const token = overrides.token ?? await tokenFor();
  return {
    authorizationHeader: `Bearer ${token}`,
    rawActivityBody: ACTIVITY_BODY,
    microsoftAppId: APP_ID,
    nowEpochSeconds: NOW,
    clockSkewSeconds: 60,
    resolvePublicJwk: (kid) => kid === KEY_ID ? fixture.publicJwk : null,
    ...overrides,
  };
}

async function expectCode(
  input: VerifyTeamsBotFrameworkRequestInput,
  code: string,
): Promise<void> {
  await assertRejects(
    () => verifyTeamsBotFrameworkRequest(input),
    TeamsBotAuthError,
    code,
  );
}

Deno.test("verifies a valid Microsoft Bot Framework JWT and returns no activity identity", async () => {
  const verified = await verifyTeamsBotFrameworkRequest(await validInput());
  assertEquals(verified, {
    issuer: TEAMS_BOT_EXPECTED_ISSUER,
    audience: APP_ID,
    keyId: KEY_ID,
    serviceUrl: SERVICE_URL,
    expiresAt: NOW + 900,
    notBefore: NOW - 60,
  });
  assertEquals("tenantId" in verified, false);
  assertEquals("userId" in verified, false);
  assertEquals("activityId" in verified, false);
});

Deno.test("rejects signature and signed-content tampering", async () => {
  const validToken = await tokenFor();
  const segments = validToken.split(".");
  const replacement = segments[2][0] === "A" ? "B" : "A";
  const signatureTamper = `${segments[0]}.${segments[1]}.${replacement}${
    segments[2].slice(1)
  }`;
  await expectCode(
    await validInput({ token: signatureTamper }),
    "invalid_signature",
  );

  const payloadTamper = `${segments[0]}.${
    encodeJson({
      iss: TEAMS_BOT_EXPECTED_ISSUER,
      aud: APP_ID,
      exp: NOW + 901,
      nbf: NOW - 60,
      serviceurl: SERVICE_URL,
    })
  }.${segments[2]}`;
  await expectCode(
    await validInput({ token: payloadTamper }),
    "invalid_signature",
  );
});

Deno.test("rejects wrong algorithm, key identifier, type, issuer, and audience", async () => {
  const cases: Array<[string, string]> = [
    [await tokenFor({ header: { alg: "HS256" } }), "invalid_alg"],
    [await tokenFor({ header: { kid: "" } }), "invalid_kid"],
    [await tokenFor({ header: { kid: "bad kid" } }), "invalid_kid"],
    [await tokenFor({ header: { typ: "jwt" } }), "invalid_typ"],
    [
      await tokenFor({ payload: { iss: "https://evil.example" } }),
      "invalid_issuer",
    ],
    [
      await tokenFor({ payload: { aud: "some-other-app" } }),
      "invalid_audience",
    ],
    [await tokenFor({ payload: { aud: [APP_ID] } }), "invalid_audience"],
  ];
  for (const [token, code] of cases) {
    await expectCode(await validInput({ token }), code);
  }

  await expectCode(
    await validInput({
      token: await tokenFor({ header: { kid: "unknown-key" } }),
    }),
    "invalid_public_key",
  );
});

Deno.test("requires integer exp and nbf and enforces bounded time windows", async () => {
  const cases: Array<[string, string]> = [
    [await tokenFor({ payload: { exp: undefined } }), "invalid_exp"],
    [await tokenFor({ payload: { exp: String(NOW + 900) } }), "invalid_exp"],
    [await tokenFor({ payload: { nbf: undefined } }), "invalid_nbf"],
    [await tokenFor({ payload: { nbf: String(NOW - 60) } }), "invalid_nbf"],
    [
      await tokenFor({ payload: { exp: NOW - 60, nbf: NOW - 900 } }),
      "token_expired",
    ],
    [await tokenFor({ payload: { nbf: NOW + 61 } }), "token_not_yet_valid"],
    [
      await tokenFor({ payload: { exp: NOW + 60, nbf: NOW + 60 } }),
      "invalid_exp",
    ],
  ];
  for (const [token, code] of cases) {
    await expectCode(await validInput({ token }), code);
  }

  await expectCode(
    await validInput({ nowEpochSeconds: 1.5 }),
    "invalid_now",
  );
  await expectCode(
    await validInput({ clockSkewSeconds: 301 }),
    "invalid_clock_skew",
  );
});

Deno.test("binds the signed serviceurl to the exact safe activity HTTPS origin and path", async () => {
  const cases: Array<[
    Partial<VerifyTeamsBotFrameworkRequestInput> & { token?: string },
    string,
  ]> = [
    [
      {
        rawActivityBody: JSON.stringify({
          serviceUrl: "http://smba.trafficmanager.net/amer/",
        }),
      },
      "invalid_activity_service_url",
    ],
    [
      {
        rawActivityBody: JSON.stringify({
          serviceUrl: "https://localhost/amer/",
        }),
      },
      "invalid_activity_service_url",
    ],
    [
      {
        rawActivityBody: JSON.stringify({
          serviceUrl: `${SERVICE_URL}?next=1`,
        }),
      },
      "invalid_activity_service_url",
    ],
    [
      {
        rawActivityBody: JSON.stringify({
          serviceUrl: "https://smba.trafficmanager.net/emea/",
        }),
      },
      "service_url_mismatch",
    ],
    [
      {
        token: await tokenFor({
          payload: { serviceurl: "http://smba.trafficmanager.net/amer/" },
        }),
      },
      "invalid_token_service_url",
    ],
    [
      {
        token: await tokenFor({
          payload: { serviceurl: "https://other.example/amer/" },
        }),
      },
      "service_url_mismatch",
    ],
  ];
  for (const [overrides, code] of cases) {
    await expectCode(await validInput(overrides), code);
  }
});

Deno.test("rejects duplicate JWT and activity JSON keys", async () => {
  const duplicateHeaderToken = await signRawSegments(
    `{"alg":"RS256","alg":"RS256","kid":"${KEY_ID}","typ":"JWT"}`,
    JSON.stringify({
      iss: TEAMS_BOT_EXPECTED_ISSUER,
      aud: APP_ID,
      exp: NOW + 900,
      nbf: NOW - 60,
      serviceurl: SERVICE_URL,
    }),
  );
  await expectCode(
    await validInput({ token: duplicateHeaderToken }),
    "invalid_jwt_json",
  );

  const duplicatePayloadToken = await signRawSegments(
    JSON.stringify({ alg: "RS256", kid: KEY_ID, typ: "JWT" }),
    `{"iss":"${TEAMS_BOT_EXPECTED_ISSUER}","iss":"${TEAMS_BOT_EXPECTED_ISSUER}","aud":"${APP_ID}","exp":${
      NOW + 900
    },"nbf":${NOW - 60},"serviceurl":"${SERVICE_URL}"}`,
  );
  await expectCode(
    await validInput({ token: duplicatePayloadToken }),
    "invalid_jwt_json",
  );

  await expectCode(
    await validInput({
      rawActivityBody:
        `{"serviceUrl":"${SERVICE_URL}","serviceUrl":"${SERVICE_URL}"}`,
    }),
    "invalid_activity_json",
  );
});

Deno.test("strict bearer and compact-JWT parsing rejects malformed and noncanonical input", async () => {
  const base = await validInput();
  const malformed: Array<[string | null, string]> = [
    [null, "missing_authorization"],
    ["", "missing_authorization"],
    ["bearer a.b.c", "invalid_authorization"],
    ["Bearer  a.b.c", "invalid_authorization"],
    ["Bearer a.b.c ", "invalid_authorization"],
    ["Basic a.b.c", "invalid_authorization"],
    ["Bearer a.b", "invalid_authorization"],
    ["Bearer a.b.c.d", "invalid_authorization"],
    ["Bearer Zh.e30.AA", "invalid_base64url"],
    ["Bearer A.e30.AA", "invalid_base64url"],
    ["Bearer _w.e30.AA", "invalid_jwt_utf8"],
  ];
  for (const [authorizationHeader, code] of malformed) {
    await expectCode({ ...base, authorizationHeader }, code);
  }

  await expectCode(
    {
      ...base,
      authorizationHeader: `Bearer ${
        "a".repeat(TEAMS_BOT_MAX_AUTHORIZATION_BYTES)
      }`,
    },
    "authorization_too_large",
  );
});

Deno.test("does not call the public-key resolver before all structural checks pass", async () => {
  let resolverCalls = 0;
  const resolver = () => {
    resolverCalls += 1;
    return null;
  };
  const invalidInputs: Array<
    [string, Partial<VerifyTeamsBotFrameworkRequestInput>]
  > = [
    [
      "invalid_alg",
      { token: await tokenFor({ header: { alg: "none" } }) } as never,
    ],
    [
      "invalid_issuer",
      { token: await tokenFor({ payload: { iss: "wrong" } }) } as never,
    ],
    [
      "invalid_audience",
      { token: await tokenFor({ payload: { aud: [APP_ID] } }) } as never,
    ],
    [
      "token_expired",
      {
        token: await tokenFor({
          payload: { exp: NOW - 60, nbf: NOW - 900 },
        }),
      } as never,
    ],
    [
      "service_url_mismatch",
      {
        rawActivityBody: JSON.stringify({
          serviceUrl: "https://smba.trafficmanager.net/emea/",
        }),
      },
    ],
  ];

  for (const [code, overrides] of invalidInputs) {
    const token = (overrides as { token?: string }).token;
    await expectCode(
      await validInput({
        ...overrides,
        ...(token === undefined ? {} : { token }),
        resolvePublicJwk: resolver,
      }),
      code,
    );
  }
  assertEquals(resolverCalls, 0);
});

Deno.test("rejects resolver failures, private/malformed keys, and unsupported JWK use", async () => {
  const fixture = await fixturePromise;
  await expectCode(
    await validInput({
      resolvePublicJwk: () => {
        throw new Error("network is forbidden here");
      },
    }),
    "key_resolution_failed",
  );
  await expectCode(
    await validInput({ resolvePublicJwk: () => ({ kty: "EC" }) }),
    "invalid_public_key",
  );
  await expectCode(
    await validInput({
      resolvePublicJwk: () => ({ ...fixture.publicJwk, use: "enc" }),
    }),
    "invalid_public_key",
  );
  for (
    const publicJwk of [
      { ...fixture.publicJwk, n: `${fixture.publicJwk.n}=` },
      { ...fixture.publicJwk, n: "A" },
      { ...fixture.publicJwk, n: "a".repeat(4_097) },
      { ...fixture.publicJwk, e: "AQAB=" },
      { ...fixture.publicJwk, e: "a".repeat(17) },
      { ...fixture.publicJwk, kid: "different-key" },
    ]
  ) {
    await expectCode(
      await validInput({ resolvePublicJwk: () => publicJwk }),
      "invalid_public_key",
    );
  }
});
