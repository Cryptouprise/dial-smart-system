// deno-lint-ignore-file no-import-prefix -- repository Edge tests pin Deno std modules.
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type EliteSolarSupervisedTelnyxReply,
  handleEliteSolarSupervisedTelnyxInboundRequest,
  importEliteSolarSupervisedTelnyxPublicKey,
  parseEliteSolarSupervisedTelnyxInboundConfiguration,
} from "./handler.ts";

const PROFILE = "profile_00000001";
const NOW = new Date("2026-07-26T12:00:00Z");
const TIMESTAMP = String(Math.floor(NOW.getTime() / 1_000));

function payload(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      event_type: "message.received",
      id: "event_00000001",
      occurred_at: NOW.toISOString(),
      payload: {
        id: "message_00000001",
        direction: "inbound",
        from: { phone_number: "+15555550102" },
        to: [{ phone_number: "+15555550101" }],
        text: " yes ",
        messaging_profile_id: PROFILE,
      },
    },
    ...overrides,
  };
}

function base64(value: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(value)));
}

async function signedRequest(
  privateKey: CryptoKey,
  body: string,
  options: { timestamp?: string; signature?: string } = {},
): Promise<Request> {
  const timestamp = options.timestamp || TIMESTAMP;
  const signature = options.signature || base64(
    await crypto.subtle.sign(
      "Ed25519",
      privateKey,
      new TextEncoder().encode(`${timestamp}|${body}`),
    ),
  );
  return new Request(
    "https://project.example/functions/v1/elite-solar-supervised-telnyx-inbound",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "telnyx-timestamp": timestamp,
        "telnyx-signature-ed25519": signature,
      },
      body,
    },
  );
}

async function fixture() {
  const pair = await crypto.subtle.generateKey("Ed25519", true, [
    "sign",
    "verify",
  ]) as CryptoKeyPair;
  const records: EliteSolarSupervisedTelnyxReply[] = [];
  return {
    privateKey: pair.privateKey,
    publicKey: pair.publicKey,
    records,
    deps: {
      configuration: {
        publicKey: pair.publicKey,
        messagingProfileId: PROFILE,
        maxClockSkewSeconds: 300,
      },
      store: {
        recordReply: (input: EliteSolarSupervisedTelnyxReply) => {
          records.push(input);
          return Promise.resolve({
            recorded: true,
            resultCode: "SUPERVISED_TEST_REPLY_RECORDED_AND_STOPPED",
          });
        },
      },
      now: () => NOW,
    },
  };
}

Deno.test("a signed raw Telnyx SMS reply is persisted once for the atomic stop-and-handoff RPC", async () => {
  const { privateKey, records, deps } = await fixture();
  const response = await handleEliteSolarSupervisedTelnyxInboundRequest(
    await signedRequest(privateKey, JSON.stringify(payload())),
    deps,
  );
  assertEquals(response.status, 204);
  assertEquals(records.length, 1);
  assertEquals(records[0].providerEventId, "event_00000001");
  assertEquals(records[0].messageText, " yes ");
  assertEquals(records[0].occurredAt, NOW.toISOString());
  assert(/^[a-f0-9]{64}$/.test(records[0].payloadSha256));
});

Deno.test("a changed raw body, stale timestamp, malformed event, or wrong profile never reaches reply storage", async () => {
  const { privateKey, records, deps } = await fixture();
  const validBody = JSON.stringify(payload());
  const signedOriginal = await signedRequest(privateKey, validBody);
  let response = await handleEliteSolarSupervisedTelnyxInboundRequest(
    new Request(signedOriginal.url, {
      method: "POST",
      headers: signedOriginal.headers,
      body: `${validBody} `,
    }),
    deps,
  );
  assertEquals(response.status, 401);
  response = await handleEliteSolarSupervisedTelnyxInboundRequest(
    await signedRequest(privateKey, validBody, { timestamp: "1700000000" }),
    deps,
  );
  assertEquals(response.status, 401);
  response = await handleEliteSolarSupervisedTelnyxInboundRequest(
    await signedRequest(
      privateKey,
      JSON.stringify(payload({ data: { event_type: "message.sent" } })),
    ),
    deps,
  );
  assertEquals(response.status, 202);
  response = await handleEliteSolarSupervisedTelnyxInboundRequest(
    await signedRequest(
      privateKey,
      JSON.stringify(payload({
        data: {
          ...payload().data,
          payload: {
            ...payload().data.payload,
            messaging_profile_id: "other_00000001",
          },
        },
      })),
    ),
    deps,
  );
  assertEquals(response.status, 202);
  assertEquals(records.length, 0);
});

Deno.test("a durable duplicate/replay receipt is acknowledged without creating another handoff", async () => {
  const { privateKey, records, deps } = await fixture();
  deps.store.recordReply = () =>
    Promise.resolve({
      recorded: false,
      resultCode: "SUPERVISED_TEST_REPLY_DUPLICATE_OR_REPLAY",
    });
  const response = await handleEliteSolarSupervisedTelnyxInboundRequest(
    await signedRequest(privateKey, JSON.stringify(payload())),
    deps,
  );
  assertEquals(response.status, 204);
  assertEquals(records.length, 0);
});

Deno.test("a media-only inbound MMS still halts the sequence without storing media data", async () => {
  const { privateKey, records, deps } = await fixture();
  const baseline = payload();
  const response = await handleEliteSolarSupervisedTelnyxInboundRequest(
    await signedRequest(
      privateKey,
      JSON.stringify({
        data: {
          ...baseline.data,
          payload: {
            ...baseline.data.payload,
            text: "",
            media: [{ content_type: "image/png" }],
          },
        },
      }),
    ),
    deps,
  );
  assertEquals(response.status, 204);
  assertEquals(records.length, 1);
  assertEquals(records[0].messageText, "[MEDIA_ONLY_REPLY]");
  assertEquals(JSON.stringify(records[0]).includes("image/png"), false);
});

Deno.test("Telnyx runtime configuration is disabled by default and imports only a raw Ed25519 key", async () => {
  let disabled = false;
  try {
    await parseEliteSolarSupervisedTelnyxInboundConfiguration(() => undefined);
  } catch {
    disabled = true;
  }
  assert(disabled);
  const pair = await crypto.subtle.generateKey("Ed25519", true, [
    "sign",
    "verify",
  ]) as CryptoKeyPair;
  const raw = await crypto.subtle.exportKey("raw", pair.publicKey);
  const values = new Map<string, string>([
    ["ELITE_SOLAR_SUPERVISED_TEST_ENABLED", "true"],
    ["ELITE_SOLAR_SUPERVISED_TEST_TELNYX_INBOUND_ENABLED", "true"],
    ["ELITE_SOLAR_SUPERVISED_TEST_TELNYX_MESSAGING_PROFILE_ID", PROFILE],
    ["ELITE_SOLAR_SUPERVISED_TEST_TELNYX_PUBLIC_KEY_BASE64", base64(raw)],
  ]);
  const configuration =
    await parseEliteSolarSupervisedTelnyxInboundConfiguration(
      (name) => values.get(name),
    );
  assertEquals(configuration.messagingProfileId, PROFILE);
  assert(await importEliteSolarSupervisedTelnyxPublicKey(base64(raw)));
});
