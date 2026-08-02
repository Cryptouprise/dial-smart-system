// deno-lint-ignore-file no-explicit-any no-import-prefix
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  handleEliteSolarSupervisedTestMatrixRequest,
} from "./handler.ts";

const OWNER = "11111111-1111-4111-8111-111111111111";
const FOREIGN = "11111111-1111-4111-8111-111111111112";
const ORG = "22222222-2222-4222-8222-222222222222";
const CAMPAIGN = "33333333-3333-4333-8333-333333333333";
const PLAN_ID = "elite_solar_self_test_v1";
const PLAN_VERSION = "2026-07-26";
const RUN_ID = "44444444-4444-4444-8444-444444444444";
const TOKEN = `eyJ${"a".repeat(120)}`;

function request(
  body: unknown,
  options: {
    method?: string;
    authorization?: string;
    contentType?: string;
  } = {},
) {
  const headers = new Headers({
    authorization: options.authorization ?? `Bearer ${TOKEN}`,
    "content-type": options.contentType ?? "application/json",
  });

  return new Request(
    "https://project.example/functions/v1/elite-solar-supervised-test-matrix",
    {
      method: options.method ?? "POST",
      headers,
      ...(options.method === "GET" || options.method === "DELETE"
        ? {}
        : { body: typeof body === "string" ? body : JSON.stringify(body) }),
    },
  );
}

function runtime(overrides: Record<string, any> = {}) {
  return {
    ownerUserId: OWNER,
    organizationId: ORG,
    campaignId: CAMPAIGN,
    authenticate: (jwt: string) => Promise.resolve(jwt === TOKEN ? OWNER : null),
    store: {
      getReplay: () =>
        Promise.resolve({
          run: {
            run_id: RUN_ID,
            plan_id: PLAN_ID,
            plan_version: PLAN_VERSION,
            stop_on_first_inbound_reply: true,
          },
          steps: [
            {
              step_id: "s1",
              ordinal: 1,
              provider: "sms",
              channel: "sms",
              simulated_elapsed_minutes: 0,
              compressed_offset_seconds: null,
              simulation_label: "text 1",
              not_before_at: null,
              message_body: "Hi {{first_name}}, this is a fast check-in text.",
              status: "delivered",
              accepted_at: null,
              cancelled_at: null,
              cancellation_reason_code: null,
              dispatch: null,
            },
            {
              step_id: "s2",
              ordinal: 2,
              provider: "call",
              channel: "voice",
              simulated_elapsed_minutes: 45,
              compressed_offset_seconds: null,
              simulation_label: "call 1",
              not_before_at: null,
              message_body: "call step",
              status: "queued",
              accepted_at: null,
              cancelled_at: null,
              cancellation_reason_code: null,
              dispatch: null,
            },
            {
              step_id: "s3",
              ordinal: 3,
              provider: "sms",
              channel: "sms",
              simulated_elapsed_minutes: 180,
              compressed_offset_seconds: null,
              simulation_label: "text 2",
              not_before_at: null,
              message_body: "Quick follow-up text.",
              status: "queued",
              accepted_at: null,
              cancelled_at: null,
              cancellation_reason_code: null,
              dispatch: null,
            },
          ],
        }),
    },
    ...overrides,
  };
}

function getBody(response: Response): Promise<Record<string, any>> {
  return response.json() as Promise<Record<string, any>>;
}

Deno.test("matrix sim validates method/auth and owner before replay lookup", async () => {
  const response = await handleEliteSolarSupervisedTestMatrixRequest(
    request({ action: "simulate", run_id: RUN_ID }, { method: "GET" }),
    runtime(),
  );
  assertEquals(response.status, 405);

  const unauthorized = await handleEliteSolarSupervisedTestMatrixRequest(
    request({ action: "simulate", run_id: RUN_ID }, {
      authorization: "Bearer short",
    }),
    runtime(),
  );
  assertEquals(unauthorized.status, 401);

  const forbidden = await handleEliteSolarSupervisedTestMatrixRequest(
    request({ action: "simulate", run_id: RUN_ID }),
    runtime({
      authenticate: () => Promise.resolve(FOREIGN),
    }),
  );
  assertEquals(forbidden.status, 403);
});

Deno.test("matrix sim rejects malformed payload before replay RPC", async () => {
  let called = false;
  const response = await handleEliteSolarSupervisedTestMatrixRequest(
    request({ action: "simulate", run_id: "not-a-uuid" }),
    runtime({
      store: {
        getReplay: () => {
          called = true;
          return Promise.resolve({});
        },
      },
    }),
  );
  assertEquals(response.status, 400);
  assertEquals(called, false);

  const badKeys = await handleEliteSolarSupervisedTestMatrixRequest(
    request({
      action: "simulate",
      run_id: RUN_ID,
      simulation_profile: {},
      extra: "bad",
    }),
    runtime(),
  );
  assertEquals(badKeys.status, 400);
});

Deno.test("matrix sim returns deterministic scenario matrix on valid payload", async () => {
  const first = await handleEliteSolarSupervisedTestMatrixRequest(
    request({
      action: "simulate",
      run_id: RUN_ID,
      simulation_profile: {
        voice_speed: 1,
        turn_delay_ms: 700,
        tool_calling_mode: "balanced",
        personality: "empathetic",
        sms_step_gap_hours: 4,
      },
    }),
    runtime(),
  );

  const second = await handleEliteSolarSupervisedTestMatrixRequest(
    request({
      action: "simulate",
      run_id: RUN_ID,
      simulation_profile: {
        voice_speed: 1,
        turn_delay_ms: 700,
        tool_calling_mode: "balanced",
        personality: "empathetic",
        sms_step_gap_hours: 4,
      },
    }),
    runtime(),
  );

  assertEquals(first.status, 200);
  assertEquals(second.status, 200);

  const firstBody = await getBody(first);
  const secondBody = await getBody(second);
  assertEquals(firstBody.ok, true);
  assertEquals(firstBody.simulation.scenarios.length, 8);
  assertEquals(firstBody.simulation.scenarios.length, secondBody.simulation.scenarios.length);
  assertEquals(firstBody.simulation.scenarios[0].scenario_id, "baseline-appointment_ready");
  assertEquals(firstBody.simulation.scenarios, secondBody.simulation.scenarios);
});

Deno.test("matrix sim supports sample_size and defaults invalid input safely", async () => {
  const responseWithSampleSize = await handleEliteSolarSupervisedTestMatrixRequest(
    request({
      action: "simulate",
      run_id: RUN_ID,
      simulation_profile: {
        sample_size: 4,
      },
    }),
    runtime(),
  );
  assertEquals(responseWithSampleSize.status, 200);
  const bodyWithSampleSize = await getBody(responseWithSampleSize);
  assertEquals(bodyWithSampleSize.simulation.sample_size, 4);
  const firstScenario = bodyWithSampleSize.simulation.scenarios[0];
  assertEquals(firstScenario.sample_size, 4);
  assertEquals(firstScenario.settings_used.sample_size, 4);

  const responseInvalidSampleSize = await handleEliteSolarSupervisedTestMatrixRequest(
    request({
      action: "simulate",
      run_id: RUN_ID,
      simulation_profile: {
        sample_size: 1.5,
      },
    }),
    runtime(),
  );
  assertEquals(responseInvalidSampleSize.status, 200);
  const bodyInvalidSampleSize = await getBody(responseInvalidSampleSize);
  const firstInvalidScenario = bodyInvalidSampleSize.simulation.scenarios[0];
  assertEquals(bodyInvalidSampleSize.simulation.sample_size, 1);
  assertEquals(firstInvalidScenario.sample_size, 1);
  assertEquals(firstInvalidScenario.settings_used.sample_size, 1);

  const responseLargeSampleSize = await handleEliteSolarSupervisedTestMatrixRequest(
    request({
      action: "simulate",
      run_id: RUN_ID,
      simulation_profile: {
        sample_size: 9999,
      },
    }),
    runtime(),
  );
  assertEquals(responseLargeSampleSize.status, 200);
  const bodyLargeSampleSize = await getBody(responseLargeSampleSize);
  assertEquals(bodyLargeSampleSize.simulation.sample_size, 5000);
  assertEquals(bodyLargeSampleSize.simulation.scenarios[0].sample_size, 5000);
});

Deno.test("matrix sim rejects plan mismatch and missing replay", async () => {
  const wrongPlan = runtime({
    store: {
      getReplay: () =>
        Promise.resolve({
          run: {
            run_id: RUN_ID,
            plan_id: "wrong_plan_id",
            plan_version: PLAN_VERSION,
            stop_on_first_inbound_reply: false,
          },
          steps: [],
        }),
    },
  });
  const mismatch = await handleEliteSolarSupervisedTestMatrixRequest(
    request({ action: "simulate", run_id: RUN_ID }),
    wrongPlan,
  );
  assertEquals(mismatch.status, 400);

  const missing = await handleEliteSolarSupervisedTestMatrixRequest(
    request({ action: "simulate", run_id: RUN_ID }),
    runtime({
      store: {
        getReplay: () => Promise.reject(new Error("missing")),
      },
    }),
  );
  assertEquals(missing.status, 404);
});
