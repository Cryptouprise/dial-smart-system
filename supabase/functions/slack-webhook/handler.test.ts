// deno-lint-ignore-file no-import-prefix -- repository Edge tests pin the deployed Deno std version.
import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { OBSERVER_AUTHORITY } from "../_shared/control-plane/authorization.ts";
import type { ObserverControlResult } from "../_shared/control-plane/types.ts";
import {
  handleSlackObserverRequest,
  SLACK_OBSERVER_MAX_RESPONSE_BYTES,
  type SlackObserverCommandSubmission,
  type SlackObserverHandlerDependencies,
} from "./handler.ts";

const encoder = new TextEncoder();
const SIGNING_SECRET = "slack-observer-test-secret";
const TIMESTAMP = 1_770_000_000;
const COMMAND_ID = "123e4567-e89b-42d3-a456-426614174000";

async function slackSignature(
  rawBody: string,
  timestamp = TIMESTAMP,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(SIGNING_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(`v0:${timestamp}:${rawBody}`),
    ),
  );
  return "v0=" + [...digest]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function slashBody(
  text: string,
  additions: Record<string, string> = {},
): string {
  const values: Record<string, string> = {
    team_id: "T012ABC",
    user_id: "U034DEF",
    command: "/dial-smart",
    text,
    trigger_id: "123.456.token",
    api_app_id: "A078XYZ",
    ...additions,
  };
  return new URLSearchParams(values).toString();
}

function observerResult(
  data: ObserverControlResult["data"] = { calls_today: 7 },
): ObserverControlResult {
  return {
    version: "control.result.v1",
    profile: "observer",
    command_id: COMMAND_ID,
    command_name: "system.status",
    status: "completed",
    authority: OBSERVER_AUTHORITY,
    data,
  };
}

function dependencies(
  overrides: Partial<SlackObserverHandlerDependencies> = {},
): SlackObserverHandlerDependencies {
  return {
    enabled: true,
    getSigningSecret: () => SIGNING_SECRET,
    nowEpochSeconds: () => TIMESTAMP,
    submitObserverCommand: () => Promise.resolve(observerResult()),
    ...overrides,
  };
}

async function signedRequest(
  body: string,
  options: {
    signature?: string;
    contentType?: string;
    timestamp?: number;
  } = {},
): Promise<Request> {
  const timestamp = options.timestamp ?? TIMESTAMP;
  return new Request("https://example.test/functions/v1/slack-webhook", {
    method: "POST",
    headers: {
      "content-type": options.contentType ??
        "application/x-www-form-urlencoded; charset=utf-8",
      "x-slack-request-timestamp": String(timestamp),
      "x-slack-signature": options.signature ??
        await slackSignature(body, timestamp),
    },
    body,
  });
}

async function responseJson(
  response: Response,
): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

Deno.test("disabled Slack observer short-circuits before request, auth, or submit", async () => {
  let secretReads = 0;
  let submits = 0;
  const poisonRequest = new Proxy({} as Request, {
    get() {
      throw new Error("disabled handler inspected the request");
    },
  });
  const response = await handleSlackObserverRequest(
    poisonRequest,
    dependencies({
      enabled: false,
      getSigningSecret: () => {
        secretReads += 1;
        throw new Error("secret must not be read");
      },
      submitObserverCommand: () => {
        submits += 1;
        throw new Error("submit must not run");
      },
    }),
  );

  assertEquals(response.status, 503);
  assertEquals(response.headers.get("cache-control"), "no-store, max-age=0");
  assertEquals(secretReads, 0);
  assertEquals(submits, 0);
  const body = await responseJson(response);
  assertEquals(body.error_code, "SLACK_OBSERVER_LAUNCH_DISABLED");
  assertEquals(body.authority, OBSERVER_AUTHORITY);
});

Deno.test("requires POST and the strict Slack slash form media type", async () => {
  let secretReads = 0;
  const deps = dependencies({
    getSigningSecret: () => {
      secretReads += 1;
      return SIGNING_SECRET;
    },
  });
  const getResponse = await handleSlackObserverRequest(
    new Request("https://example.test/slack", { method: "GET" }),
    deps,
  );
  assertEquals(getResponse.status, 405);
  assertEquals(getResponse.headers.get("allow"), "POST");

  const mediaResponse = await handleSlackObserverRequest(
    new Request("https://example.test/slack", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }),
    deps,
  );
  assertEquals(mediaResponse.status, 415);
  assertEquals(secretReads, 0);
});

Deno.test("authenticates exact raw bytes before attempting slash form parsing", async () => {
  let submits = 0;
  const malformedBody =
    "team_id=%ZZ&user_id=U1&command=%2Fdial-smart&text=status";
  const response = await handleSlackObserverRequest(
    await signedRequest(malformedBody, {
      signature: `v0=${"0".repeat(64)}`,
    }),
    dependencies({
      submitObserverCommand: () => {
        submits += 1;
        return Promise.resolve(observerResult());
      },
    }),
  );

  assertEquals(response.status, 401);
  assertEquals(
    (await responseJson(response)).error_code,
    "SLACK_REQUEST_AUTH_FAILED",
  );
  assertEquals(submits, 0);
});

Deno.test("rejects a bad Slack signature without submitting", async () => {
  let submits = 0;
  const response = await handleSlackObserverRequest(
    await signedRequest(slashBody("status"), {
      signature: `v0=${"a".repeat(64)}`,
    }),
    dependencies({
      submitObserverCommand: () => {
        submits += 1;
        return Promise.resolve(observerResult());
      },
    }),
  );

  assertEquals(response.status, 401);
  assertEquals(submits, 0);
});

Deno.test("unknown conversational text fails closed without AI or submit", async () => {
  let submits = 0;
  for (const text of ["please launch the solar campaign", "constructor"]) {
    const response = await handleSlackObserverRequest(
      await signedRequest(slashBody(text)),
      dependencies({
        submitObserverCommand: () => {
          submits += 1;
          return Promise.resolve(observerResult());
        },
      }),
    );

    assertEquals(response.status, 422);
    assertEquals(
      (await responseJson(response)).error_code,
      "UNSUPPORTED_OBSERVER_COMMAND",
    );
  }
  assertEquals(submits, 0);
});

Deno.test("forged response_url is ignored and never enters the submission", async () => {
  let captured: SlackObserverCommandSubmission | undefined;
  const hostileUrl = "http://169.254.169.254/latest/meta-data/";
  const response = await handleSlackObserverRequest(
    await signedRequest(slashBody("status", { response_url: hostileUrl })),
    dependencies({
      submitObserverCommand: (submission) => {
        captured = submission;
        return Promise.resolve(observerResult());
      },
    }),
  );

  assertEquals(response.status, 200);
  assert(captured !== undefined);
  assertEquals(
    Object.keys(captured).some((key) => key.toLowerCase().includes("response")),
    false,
  );
  assertEquals(JSON.stringify(captured).includes(hostileUrl), false);
  assertEquals((await response.text()).includes(hostileUrl), false);
});

Deno.test("submits exact signed R0 command context and returns useful bounded data", async () => {
  let captured: SlackObserverCommandSubmission | undefined;
  const rawBody = slashBody("status");
  const result = observerResult({
    calls_today: 7,
    unsafe_markup: "<!channel> `not-a-fence` & <https://host.test|link>",
  });
  const response = await handleSlackObserverRequest(
    await signedRequest(rawBody),
    dependencies({
      submitObserverCommand: (submission) => {
        captured = submission;
        return Promise.resolve(result);
      },
    }),
  );

  assertEquals(response.status, 200);
  assert(captured !== undefined);
  assertEquals(captured.channel, "slack");
  assertEquals(captured.team_id, "T012ABC");
  assertEquals(captured.user_id, "U034DEF");
  assertEquals(captured.api_app_id, "A078XYZ");
  assertEquals(captured.trigger_id, "123.456.token");
  assertEquals(captured.signature_timestamp, TIMESTAMP);
  assertEquals(captured.command, { name: "system.status", args: {} });
  assertEquals(captured.mode, "plan");
  assertEquals(captured.raw_payload_sha256.length, 64);

  const encodedBody = new Uint8Array(await response.clone().arrayBuffer());
  assert(encodedBody.byteLength <= SLACK_OBSERVER_MAX_RESPONSE_BYTES);
  const body = await responseJson(response);
  assertEquals(body.response_type, "ephemeral");
  assertEquals(body.authority, OBSERVER_AUTHORITY);
  assert(typeof body.text === "string");
  assertStringIncludes(body.text, '"calls_today":7');
  assertStringIncludes(body.text, "contact=false");
  assertEquals(body.text.includes("<!channel>"), false);
  assertEquals(body.text.includes("`not-a-fence`"), false);
  assertEquals(body.text.includes("<https://host.test|link>"), false);
});

Deno.test("Elite pulse returns a concise read-only morning beat instead of a raw payload", async () => {
  const result: ObserverControlResult = {
    ...observerResult({
      operator_beat: {
        kind: "elite_solar_operator_morning_beat_v1",
        headline:
          "A bounded Elite release record is visible, but contact remains locked pending final per-call evaluation.",
        recommended_focus:
          "Review the exact evidence chain and keep the cohort human-approved; a release record never bypasses consent or provider checks.",
        campaign_records_observed: 1,
        current_release_records_observed: 1,
        invalid_or_expired_release_records_observed: 0,
        release_stages_visible: ["canary_5"],
        direct_import_primary: true,
        gohighlevel_required: false,
        contact_authorized: false,
        launch_authorized: false,
      },
      release_posture: [{
        sensitive_but_non_pii_internal_shape: "not rendered",
      }],
    }),
    command_name: "elite.solar_pulse",
  };
  const response = await handleSlackObserverRequest(
    await signedRequest(slashBody("elite pulse")),
    dependencies({ submitObserverCommand: () => Promise.resolve(result) }),
  );

  assertEquals(response.status, 200);
  const body = await responseJson(response);
  assert(typeof body.text === "string");
  assertStringIncludes(body.text, "Elite Solar morning beat (read-only)");
  assertStringIncludes(body.text, "Next focus:");
  assertStringIncludes(body.text, "Visible release stages: canary_5.");
  assertStringIncludes(body.text, "GoHighLevel is optional.");
  assertEquals(
    body.text.includes("sensitive_but_non_pii_internal_shape"),
    false,
  );
  assertEquals(body.text.includes("Result data (bounded preview)"), false);
});

Deno.test("submit failure is sanitized and preserves zero authority", async () => {
  const response = await handleSlackObserverRequest(
    await signedRequest(slashBody("status")),
    dependencies({
      submitObserverCommand: () =>
        Promise.reject(new Error("database password is top-secret")),
    }),
  );

  assertEquals(response.status, 503);
  const body = await responseJson(response);
  assertEquals(body.error_code, "OBSERVER_SUBMISSION_FAILED");
  assertEquals(body.authority, OBSERVER_AUTHORITY);
  assertEquals(JSON.stringify(body).includes("database password"), false);
  assertEquals(JSON.stringify(body).includes("top-secret"), false);
});

Deno.test("dependency cannot smuggle observer authority or unbounded data", async () => {
  const forged = {
    ...observerResult(),
    authority: { ...OBSERVER_AUTHORITY, launch_authorized: true },
  } as unknown as ObserverControlResult;
  let response = await handleSlackObserverRequest(
    await signedRequest(slashBody("status")),
    dependencies({ submitObserverCommand: () => Promise.resolve(forged) }),
  );
  assertEquals(response.status, 502);
  assertEquals((await responseJson(response)).authority, OBSERVER_AUTHORITY);

  response = await handleSlackObserverRequest(
    await signedRequest(slashBody("status")),
    dependencies({
      submitObserverCommand: () =>
        Promise.resolve(observerResult("x".repeat(5_000))),
    }),
  );
  assertEquals(response.status, 502);
  assertEquals((await responseJson(response)).authority, OBSERVER_AUTHORITY);

  class NonJsonResult {
    visible = "must not be silently cloned";
  }
  response = await handleSlackObserverRequest(
    await signedRequest(slashBody("status")),
    dependencies({
      submitObserverCommand: () =>
        Promise.resolve({
          ...observerResult(),
          data: new NonJsonResult(),
        } as unknown as ObserverControlResult),
    }),
  );
  assertEquals(response.status, 502);
  assertEquals((await responseJson(response)).authority, OBSERVER_AUTHORITY);

  const prototypeKeyData = JSON.parse(
    '{"__proto__":{"launch_authorized":true},"safe":true}',
  );
  response = await handleSlackObserverRequest(
    await signedRequest(slashBody("status")),
    dependencies({
      submitObserverCommand: () =>
        Promise.resolve({ ...observerResult(), data: prototypeKeyData }),
    }),
  );
  assertEquals(response.status, 200);
  const prototypeBody = await responseJson(response);
  assertEquals(prototypeBody.authority, OBSERVER_AUTHORITY);
  assertEquals(
    String(prototypeBody.text).includes(
      '"__proto__":{"launch_authorized":true}',
    ),
    true,
  );
  assertEquals(
    Object.prototype.hasOwnProperty.call(
      Object.prototype,
      "launch_authorized",
    ),
    false,
  );
});
