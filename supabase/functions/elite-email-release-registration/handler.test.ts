// deno-lint-ignore-file no-import-prefix -- repository Edge tests pin the deployed Deno std version.
import {
  assertEquals,
  assertMatch,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  type EliteEmailReleaseRegistrationInput,
  type EliteEmailReleaseRegistrationStore,
  handleEliteEmailReleaseRegistrationRequest,
} from "./handler.ts";

const IDS = Object.freeze({
  owner: "123e4567-e89b-42d3-a456-426614174000",
  organization: "223e4567-e89b-42d3-a456-426614174000",
  campaign: "323e4567-e89b-42d3-a456-426614174000",
  release: "423e4567-e89b-42d3-a456-426614174000",
});
const ORIGIN = "https://app.elitesolar.example";
const KEY_ID = "elite-email-release-key-v1";
const TOKEN = `eyJ${"a".repeat(120)}`;

function encodedSecret(): string {
  const bytes = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
  return `base64url:${
    btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "")
  }`;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record).sort().map((key) => [key, canonicalize(record[key])]),
    );
  }
  return value;
}

function signingKey(): Promise<CryptoKey> {
  const encoded = encodedSecret().slice("base64url:".length);
  const decoded = atob(encoded.replace(/-/g, "+").replace(/_/g, "/") + "=");
  const bytes = Uint8Array.from(
    decoded,
    (character) => character.charCodeAt(0),
  );
  return crypto.subtle.importKey(
    "raw",
    bytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function signature(body: Record<string, unknown>): Promise<string> {
  const signed = await crypto.subtle.sign(
    "HMAC",
    await signingKey(),
    new TextEncoder().encode(JSON.stringify(canonicalize(body))),
  );
  return `hmac-sha256:${
    [...new Uint8Array(signed)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")
  }`;
}

async function release(overrides: Record<string, unknown> = {}) {
  const body = {
    kind: "elite_solar_email_execution_release_candidate_v1",
    status: "pending_future_server_adapter_verification",
    organization_id: IDS.organization,
    campaign_id: IDS.campaign,
    provider: "mailgun",
    sender_domain: "mail.elitesolar.example",
    provider_account_reference: "mailgun-elite-account-v1",
    recipient_manifest_sha256: "a".repeat(64),
    recipient_count: 1,
    source_release_reference: "elite-source-release-v1",
    suppression_snapshot_sha256: "b".repeat(64),
    approvals: {
      copy: "elite-copy-approval-v1",
      compliance: "elite-compliance-approval-v1",
      owner: "elite-owner-approval-v1",
    },
    handoff_proposal_sha256: "c".repeat(64),
    execution_key_id: KEY_ID,
    signer_principal_reference: "elite-authorized-signer-v1",
    idempotency_key: "elite-email-registration-0001",
    issued_at: "2026-07-20T13:50:00.000Z",
    expires_at: "2026-07-20T14:30:00.000Z",
    ...overrides,
  };
  return {
    ...body,
    signature: await signature(body),
    recipient_data_included: false,
    provider_action: "none",
    authority: {
      contact_authorized: false,
      launch_authorized: false,
      queue_mutation_authorized: false,
      crm_write_authorized: false,
      provider_write_authorized: false,
      spend_authorized: false,
    },
    side_effect_invariants: {
      database_reads: 0,
      database_writes: 0,
      network_requests: 0,
      provider_calls: 0,
      external_messages: 0,
    },
  };
}

function request(
  body: unknown,
  options: {
    origin?: string;
    method?: string;
    authorization?: string;
    url?: string;
    contentType?: string;
  } = {},
) {
  return new Request(
    options.url ||
      "https://project.example/functions/v1/elite-email-release-registration",
    {
      method: options.method || "POST",
      headers: {
        origin: options.origin || ORIGIN,
        authorization: options.authorization || `Bearer ${TOKEN}`,
        "content-type": options.contentType || "application/json",
      },
      ...(options.method === "OPTIONS" ? {} : { body: JSON.stringify(body) }),
    },
  );
}

function environment(overrides: Record<string, string | undefined> = {}) {
  const values: Record<string, string | undefined> = {
    ELITE_EMAIL_RELEASE_REGISTRATION_ENABLED: "true",
    ELITE_EMAIL_RELEASE_REGISTRATION_OWNER_USER_ID: IDS.owner,
    ELITE_EMAIL_RELEASE_REGISTRATION_ORGANIZATION_ID: IDS.organization,
    ELITE_EMAIL_RELEASE_REGISTRATION_CAMPAIGN_ID: IDS.campaign,
    ELITE_EMAIL_RELEASE_REGISTRATION_SIGNING_KEY_ID: KEY_ID,
    ELITE_EMAIL_RELEASE_REGISTRATION_ALLOWED_ORIGIN: ORIGIN,
    ELITE_EMAIL_RELEASE_REGISTRATION_SIGNING_HMAC_KEY: encodedSecret(),
    ...overrides,
  };
  return (name: string) => values[name];
}

function dependencies(overrides: {
  getEnvironment?: (name: string) => string | undefined;
  authenticate?: (jwt: string) => Promise<string | null>;
  store?: Partial<EliteEmailReleaseRegistrationStore>;
} = {}) {
  const inputs: EliteEmailReleaseRegistrationInput[] = [];
  const store: EliteEmailReleaseRegistrationStore = {
    register(input) {
      inputs.push(input);
      return Promise.resolve({
        registered: true,
        release_id: IDS.release,
        release_state: "pending_adapter_provisioning",
        reason_code: "EMAIL_RELEASE_REGISTERED_PENDING_ADAPTER_VERIFICATION",
      });
    },
    ...overrides.store,
  };
  return {
    inputs,
    deps: {
      getEnvironment: overrides.getEnvironment || environment(),
      authenticate: overrides.authenticate ||
        (() => Promise.resolve(IDS.owner)),
      store,
      now: () => new Date("2026-07-20T14:00:00.000Z"),
    },
  };
}

Deno.test("registration stays disabled before authentication or database work", async () => {
  let authCalls = 0;
  let storeCalls = 0;
  const { deps } = dependencies({
    getEnvironment: environment({
      ELITE_EMAIL_RELEASE_REGISTRATION_ENABLED: "false",
    }),
    authenticate: () => {
      authCalls += 1;
      return Promise.resolve(IDS.owner);
    },
    store: {
      register: () => {
        storeCalls += 1;
        return Promise.reject(new Error("must not register"));
      },
    },
  });
  const response = await handleEliteEmailReleaseRegistrationRequest(
    request(await release()),
    deps,
  );
  assertEquals(response.status, 503);
  assertEquals(authCalls, 0);
  assertEquals(storeCalls, 0);
});

Deno.test("registration rejects wrong origin, shape, query, and user before storing", async () => {
  let calls = 0;
  const { deps } = dependencies({
    store: {
      register: () => {
        calls += 1;
        return Promise.reject(new Error("must not register"));
      },
    },
  });
  assertEquals(
    (await handleEliteEmailReleaseRegistrationRequest(
      request(await release(), { origin: "https://evil.example" }),
      deps,
    )).status,
    403,
  );
  assertEquals(
    (await handleEliteEmailReleaseRegistrationRequest(
      request({ arbitrary: true }),
      deps,
    )).status,
    422,
  );
  assertEquals(
    (await handleEliteEmailReleaseRegistrationRequest(
      request(await release(), { contentType: "text/plain" }),
      deps,
    )).status,
    415,
  );
  assertEquals(
    (await handleEliteEmailReleaseRegistrationRequest(
      request(await release(), {
        url:
          "https://project.example/functions/v1/elite-email-release-registration?forged=1",
      }),
      deps,
    )).status,
    400,
  );
  assertEquals(
    (await handleEliteEmailReleaseRegistrationRequest(
      request(await release()),
      dependencies({ authenticate: () => Promise.resolve(null) }).deps,
    )).status,
    403,
  );
  assertEquals(calls, 0);
});

Deno.test("a valid signed artifact registers exactly one pending no-send release without retaining its signature", async () => {
  const { deps, inputs } = dependencies();
  const candidate = await release();
  const response = await handleEliteEmailReleaseRegistrationRequest(
    request(candidate),
    deps,
  );
  assertEquals(response.status, 200);
  assertEquals(inputs.length, 1);
  assertEquals(inputs[0].user_id, IDS.owner);
  assertEquals(inputs[0].organization_id, IDS.organization);
  assertEquals(inputs[0].campaign_id, IDS.campaign);
  assertEquals(inputs[0].provider, "mailgun");
  assertMatch(inputs[0].release_fingerprint, /^sha256:[a-f0-9]{64}$/);
  assertEquals(JSON.stringify(inputs[0]).includes(candidate.signature), false);
  const body = await response.json();
  assertEquals(body.release_state, "pending_adapter_provisioning");
  assertEquals(body.provider_action, "none");
  assertEquals(body.authority.provider_write_authorized, false);
});

Deno.test("bad signatures, wrong key/campaign bindings, expiry, and authority changes are held before registration", async () => {
  const { deps, inputs } = dependencies();
  const variants = [
    { ...(await release()), signature: `hmac-sha256:${"0".repeat(64)}` },
    await release({ execution_key_id: "other-release-key-v1" }),
    await release({ organization_id: "423e4567-e89b-42d3-a456-426614174000" }),
    await release({ expires_at: "2026-07-20T13:59:00.000Z" }),
    { ...(await release()), authority: { contact_authorized: true } },
  ];
  for (const candidate of variants) {
    const response = await handleEliteEmailReleaseRegistrationRequest(
      request(candidate),
      deps,
    );
    assertEquals(response.status, 422);
  }
  assertEquals(inputs.length, 0);
});

Deno.test("only a durable registration or known idempotent registration receives a success response", async () => {
  const { deps } = dependencies({
    store: {
      register: () =>
        Promise.resolve({
          registered: false,
          release_id: null,
          release_state: "pending_adapter_provisioning",
          reason_code: "EMAIL_RELEASE_IDEMPOTENCY_COLLISION",
        }),
    },
  });
  let response = await handleEliteEmailReleaseRegistrationRequest(
    request(await release()),
    deps,
  );
  assertEquals(response.status, 503);
  deps.store.register = () =>
    Promise.resolve({
      registered: false,
      release_id: IDS.release,
      release_state: "pending_adapter_provisioning",
      reason_code: "EMAIL_RELEASE_ALREADY_REGISTERED",
    });
  response = await handleEliteEmailReleaseRegistrationRequest(
    request(await release()),
    deps,
  );
  assertEquals(response.status, 200);
});
