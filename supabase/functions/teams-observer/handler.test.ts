// deno-lint-ignore-file no-import-prefix
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { OBSERVER_AUTHORITY } from "../_shared/control-plane/authorization.ts";
import type { ObserverControlResult } from "../_shared/control-plane/types.ts";
import {
  handleTeamsObserverRequest,
  type TeamsObserverHandlerDependencies,
} from "./handler.ts";

const APP_ID = "33333333-bbbb-4bbb-8bbb-333333333333";
const COMMAND_ID = "44444444-4444-4444-8444-444444444444";

function body(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: "message",
    channelId: "msteams",
    id: "teams-activity-0001",
    timestamp: "2026-07-14T12:00:00.000Z",
    text: "status",
    serviceUrl: "https://smba.trafficmanager.net/amer/",
    from: { id: "29:1A2B3C4D5E" },
    recipient: { id: APP_ID },
    channelData: { tenant: { id: "11111111-aaaa-4aaa-8aaa-111111111111" } },
    ...overrides,
  });
}

function request(
  payload = body(),
  options: { method?: string; url?: string; contentType?: string } = {},
): Request {
  return new Request(
    options.url ?? "https://example.test/functions/v1/teams-observer",
    {
      method: options.method ?? "POST",
      headers: {
        authorization: "Bearer verified-by-injected-test",
        "content-type": options.contentType ?? "application/json",
      },
      ...(options.method === "GET" ? {} : { body: payload }),
    },
  );
}

function observerResult(
  commandName = "system.status",
): ObserverControlResult {
  return {
    version: "control.result.v1",
    profile: "observer",
    command_id: COMMAND_ID,
    command_name: commandName as ObserverControlResult["command_name"],
    status: "completed",
    authority: OBSERVER_AUTHORITY,
    data: { deliberately_not_returned_to_teams_yet: true },
  };
}

function dependencies(
  overrides: Partial<TeamsObserverHandlerDependencies> = {},
): TeamsObserverHandlerDependencies {
  return {
    enabled: true,
    getMicrosoftAppId: () => APP_ID,
    nowEpochSeconds: () => 1_784_112_000,
    resolvePublicJwk: () => null,
    verifyInbound: () =>
      Promise.resolve({
        issuer: "https://api.botframework.com",
        audience: APP_ID,
        keyId: "test-key",
        serviceUrl: "https://smba.trafficmanager.net/amer/",
        expiresAt: 1_784_113_000,
        notBefore: 1_784_111_000,
      }),
    submitObserverCommand: (submission) =>
      Promise.resolve(observerResult(submission.command.name)),
    ...overrides,
  };
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

Deno.test("disabled Teams observer short-circuits before request, auth, or submit", async () => {
  let verifies = 0;
  let submits = 0;
  const poison = new Proxy({} as Request, {
    get() {
      throw new Error("disabled adapter read request");
    },
  });
  const response = await handleTeamsObserverRequest(
    poison,
    dependencies({
      enabled: false,
      verifyInbound: () => {
        verifies += 1;
        throw new Error("must not verify");
      },
      submitObserverCommand: () => {
        submits += 1;
        throw new Error("must not submit");
      },
    }),
  );
  assertEquals(response.status, 503);
  assertEquals(
    (await json(response)).error_code,
    "TEAMS_OBSERVER_LAUNCH_DISABLED",
  );
  assertEquals(verifies, 0);
  assertEquals(submits, 0);
});

Deno.test("Teams adapter rejects method, query, content type, and auth before submission", async () => {
  let verifies = 0;
  let submits = 0;
  const deps = dependencies({
    verifyInbound: () => {
      verifies += 1;
      return Promise.resolve({
        issuer: "https://api.botframework.com",
        audience: APP_ID,
        keyId: "test-key",
        serviceUrl: "https://smba.trafficmanager.net/amer/",
        expiresAt: 1,
        notBefore: 0,
      });
    },
    submitObserverCommand: () => {
      submits += 1;
      return Promise.resolve(observerResult());
    },
  });
  assertEquals(
    (await handleTeamsObserverRequest(request("", { method: "GET" }), deps))
      .status,
    405,
  );
  assertEquals(
    (await handleTeamsObserverRequest(
      request(body(), {
        url: "https://example.test/teams-observer?tenant=forged",
      }),
      deps,
    )).status,
    400,
  );
  assertEquals(
    (await handleTeamsObserverRequest(
      request(body(), {
        contentType: "text/plain",
      }),
      deps,
    )).status,
    415,
  );
  assertEquals(
    (await handleTeamsObserverRequest(
      request(),
      dependencies({
        verifyInbound: () => Promise.reject(new Error("bad signature")),
      }),
    )).status,
    401,
  );
  assertEquals(verifies, 0);
  assertEquals(submits, 0);
});

Deno.test("Teams adapter submits only the verified bounded R0 command and returns no result data", async () => {
  let verifiedBytes = "";
  let submitted: unknown;
  const response = await handleTeamsObserverRequest(
    request(),
    dependencies({
      verifyInbound: (input) => {
        verifiedBytes = new TextDecoder().decode(input.rawActivityBody);
        assertEquals(input.microsoftAppId, APP_ID);
        return Promise.resolve({
          issuer: "https://api.botframework.com",
          audience: APP_ID,
          keyId: "test-key",
          serviceUrl: "https://smba.trafficmanager.net/amer/",
          expiresAt: 1,
          notBefore: 0,
        });
      },
      submitObserverCommand: (submission) => {
        submitted = submission;
        return Promise.resolve(observerResult(submission.command.name));
      },
    }),
  );
  assertEquals(response.status, 200);
  assertEquals(verifiedBytes, body());
  assertEquals(submitted, {
    tenant_id: "11111111-aaaa-4aaa-8aaa-111111111111",
    bot_app_id: APP_ID,
    user_id: "29:1A2B3C4D5E",
    activity_id: "teams-activity-0001",
    source_occurred_at: "2026-07-14T12:00:00.000Z",
    raw_payload_sha256:
      "00336917c9e902e916399ca1658b6a14c42c865b6fa007bc986e33bc7d7d2a10",
    command: { name: "system.status", args: {} },
    mode: "plan",
  });
  const result = (await json(response)).result as Record<string, unknown>;
  assertEquals(result, {
    accepted: true,
    command_id: COMMAND_ID,
    command_name: "system.status",
    status: "completed",
  });
  assertEquals(
    JSON.stringify(result).includes("deliberately_not_returned"),
    false,
  );
});

Deno.test("Teams adapter rejects non-message activities, app mismatch, and unsupported command text without submit", async () => {
  let submits = 0;
  const deps = dependencies({
    submitObserverCommand: () => {
      submits += 1;
      return Promise.resolve(observerResult());
    },
  });
  const unsupportedActivity = await handleTeamsObserverRequest(
    request(body({ type: "conversationUpdate" })),
    deps,
  );
  assertEquals(unsupportedActivity.status, 422);
  for (
    const payload of [
      body({ recipient: { id: "different-app" } }),
      body({ text: "launch campaign" }),
      body({ timestamp: "2026-07-14T12:00:00+00:00" }),
    ]
  ) {
    const response = await handleTeamsObserverRequest(request(payload), deps);
    assertEquals(response.status, 400);
  }
  assertEquals(submits, 0);
});

Deno.test("Teams adapter fails closed when a dependency widens observer authority", async () => {
  const response = await handleTeamsObserverRequest(
    request(),
    dependencies({
      submitObserverCommand: () =>
        Promise.resolve({
          ...observerResult(),
          authority: { ...OBSERVER_AUTHORITY, launch_authorized: true },
        } as unknown as ObserverControlResult),
    }),
  );
  assertEquals(response.status, 502);
  assertEquals((await json(response)).error_code, "INVALID_OBSERVER_RESULT");
});
