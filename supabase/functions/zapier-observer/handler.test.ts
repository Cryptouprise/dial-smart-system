// deno-lint-ignore-file no-import-prefix -- repository Edge tests pin this std version.
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { OBSERVER_AUTHORITY } from "../_shared/control-plane/authorization.ts";
import type {
  AuthorizedCommandIdentity,
  ControlCommandName,
  JsonObject,
  ObserverControlResult,
} from "../_shared/control-plane/types.ts";
import {
  handleZapierObserverRequest,
  ZAPIER_OBSERVER_MAX_BODY_BYTES,
  type ZapierObserverCommandSubmission,
  type ZapierObserverHandlerDependencies,
} from "./handler.ts";

const KEY = `dsk_live_${"A1".repeat(16)}`;
const COMMAND_ID = "523e4567-e89b-42d3-a456-426614174000";
const CAMPAIGN_ID = "623e4567-e89b-42d3-a456-426614174000";
const IDENTITY: AuthorizedCommandIdentity = {
  channel: "zapier",
  installation_id: "123e4567-e89b-42d3-a456-426614174000",
  external_principal_id: "223e4567-e89b-42d3-a456-426614174000",
  user_id: "323e4567-e89b-42d3-a456-426614174000",
  organization_id: "423e4567-e89b-42d3-a456-426614174000",
  organization_role: "admin",
  granted_scopes: ["system:read", "campaigns:read"],
};

function wireBody(
  name: ControlCommandName = "system.status",
  args: JsonObject = {},
  additions: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    version: "control.command.v1",
    external_request_id: "zapier-request-0001",
    source_occurred_at: "2026-07-14T12:00:00.000Z",
    command: { name, args },
    mode: "plan",
    ...additions,
  });
}

function observerResult(
  commandName: ControlCommandName = "system.status",
): ObserverControlResult {
  return {
    version: "control.result.v1",
    profile: "observer",
    command_id: COMMAND_ID,
    command_name: commandName,
    status: "completed",
    authority: OBSERVER_AUTHORITY,
    data: { source: "tenant-scoped-observer-store", calls_today: 7 },
  };
}

function dependencies(
  overrides: Partial<ZapierObserverHandlerDependencies> = {},
): ZapierObserverHandlerDependencies {
  return {
    enabled: true,
    resolveServerIdentity: () => Promise.resolve(IDENTITY),
    submitObserverCommand: (submission) =>
      Promise.resolve(observerResult(submission.request.command.name)),
    ...overrides,
  };
}

function request(
  body = wireBody(),
  options: {
    authorization?: string | null;
    contentType?: string;
    method?: string;
    url?: string;
    headers?: Record<string, string>;
  } = {},
): Request {
  const headers = new Headers({
    "content-type": options.contentType ?? "application/json; charset=utf-8",
    ...(options.headers ?? {}),
  });
  if (options.authorization !== null) {
    headers.set("authorization", options.authorization ?? `Bearer ${KEY}`);
  }
  const method = options.method ?? "POST";
  return new Request(
    options.url ?? "https://example.test/functions/v1/zapier-observer",
    {
      method,
      headers,
      ...(method === "GET" || method === "HEAD" ? {} : { body }),
    },
  );
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

Deno.test("disabled adapter short-circuits before request, auth, or submit", async () => {
  let resolves = 0;
  let submits = 0;
  const poisonRequest = new Proxy({} as Request, {
    get() {
      throw new Error("disabled adapter inspected the request");
    },
  });
  const response = await handleZapierObserverRequest(
    poisonRequest,
    dependencies({
      enabled: false,
      resolveServerIdentity: () => {
        resolves += 1;
        throw new Error("must not resolve");
      },
      submitObserverCommand: () => {
        submits += 1;
        throw new Error("must not submit");
      },
    }),
  );
  assertEquals(response.status, 503);
  assertEquals(response.headers.get("cache-control"), "no-store, max-age=0");
  assertEquals(resolves, 0);
  assertEquals(submits, 0);
  const body = await json(response);
  assertEquals(body.error_code, "ZAPIER_OBSERVER_LAUNCH_DISABLED");
  assertEquals(body.authority, OBSERVER_AUTHORITY);
});

Deno.test("rejects method, query, media type, and encoding before auth", async () => {
  let resolves = 0;
  const deps = dependencies({
    resolveServerIdentity: () => {
      resolves += 1;
      return Promise.resolve(IDENTITY);
    },
  });
  assertEquals(
    (await handleZapierObserverRequest(request("", { method: "GET" }), deps))
      .status,
    405,
  );
  assertEquals(
    (await handleZapierObserverRequest(
      request(wireBody(), {
        url: "https://example.test/zapier?organization_id=attacker",
      }),
      deps,
    )).status,
    400,
  );
  assertEquals(
    (await handleZapierObserverRequest(
      request(wireBody(), {
        contentType: "text/plain",
      }),
      deps,
    )).status,
    415,
  );
  assertEquals(
    (await handleZapierObserverRequest(
      request(wireBody(), {
        headers: { "content-encoding": "gzip" },
      }),
      deps,
    )).status,
    400,
  );
  assertEquals(resolves, 0);
});

Deno.test("requires exact bearer authentication and never reads a body credential", async () => {
  let resolves = 0;
  const deps = dependencies({
    resolveServerIdentity: () => {
      resolves += 1;
      return Promise.resolve(IDENTITY);
    },
  });
  for (const authorization of [null, KEY, `bearer ${KEY}`, "Bearer bad"]) {
    const response = await handleZapierObserverRequest(
      request(JSON.stringify({ api_key: KEY }), { authorization }),
      deps,
    );
    assertEquals(response.status, 401);
    assertEquals(
      (await json(response)).error_code,
      "ZAPIER_AUTHENTICATION_FAILED",
    );
  }
  assertEquals(resolves, 0);
});

Deno.test("passes only the exact bearer credential to server identity resolution", async () => {
  let resolvedCredential = "";
  const response = await handleZapierObserverRequest(
    request(),
    dependencies({
      resolveServerIdentity: (credential) => {
        resolvedCredential = credential;
        return Promise.resolve(IDENTITY);
      },
    }),
  );
  assertEquals(response.status, 200);
  assertEquals(resolvedCredential, KEY);
});

Deno.test("unknown, missing, or malformed resolved identities fail closed", async () => {
  assertEquals(
    (await handleZapierObserverRequest(
      request(),
      dependencies({
        resolveServerIdentity: () => Promise.resolve(null),
      }),
    )).status,
    401,
  );
  for (
    const resolved of [
      { ...IDENTITY, channel: "mcp" },
      { ...IDENTITY, organization_id: "attacker-org" },
    ]
  ) {
    const response = await handleZapierObserverRequest(
      request(),
      dependencies({
        resolveServerIdentity: () => Promise.resolve(resolved),
      }),
    );
    assertEquals(response.status, 503);
    assertEquals(
      (await json(response)).error_code,
      "ZAPIER_IDENTITY_RESOLUTION_UNAVAILABLE",
    );
  }
});

Deno.test("rejects oversized, duplicate-key, and malformed JSON without submit", async () => {
  let submits = 0;
  const deps = dependencies({
    submitObserverCommand: () => {
      submits += 1;
      return Promise.resolve(observerResult());
    },
  });
  const oversized = `{"x":"${"a".repeat(ZAPIER_OBSERVER_MAX_BODY_BYTES)}"}`;
  assertEquals(
    (await handleZapierObserverRequest(request(oversized), deps)).status,
    413,
  );
  const duplicate =
    '{"version":"control.command.v1","version":"control.command.v2","external_request_id":"zapier-request-0001","command":{"name":"system.status","args":{}},"mode":"plan"}';
  assertEquals(
    (await handleZapierObserverRequest(request(duplicate), deps)).status,
    400,
  );
  assertEquals(
    (await handleZapierObserverRequest(request("{not-json"), deps)).status,
    400,
  );
  assertEquals(submits, 0);
});

Deno.test("accepts exactly the six R0 commands with deterministic schemas", async () => {
  const cases: Array<[ControlCommandName, JsonObject]> = [
    ["operator.context", {}],
    ["system.status", {}],
    ["elite.solar_brief", {}],
    ["elite.solar_pulse", {}],
    ["campaign.list", {}],
    ["campaign.inspect", { campaign_id: CAMPAIGN_ID }],
  ];
  const submitted: ZapierObserverCommandSubmission[] = [];
  const deps = dependencies({
    submitObserverCommand: (submission) => {
      submitted.push(submission);
      return Promise.resolve(observerResult(submission.request.command.name));
    },
  });
  for (const [name, args] of cases) {
    const response = await handleZapierObserverRequest(
      request(wireBody(name, args)),
      deps,
    );
    assertEquals(response.status, 200);
    const body = await json(response);
    assertEquals(body.ok, true);
    assertEquals(body.authority, OBSERVER_AUTHORITY);
  }
  assertEquals(submitted.length, 6);
  assertEquals(
    submitted.map((item) => item.request.command.name),
    cases.map(([name]) => name),
  );
  assert(submitted.every((item) => item.channel === "zapier"));
  assert(
    submitted.every((item) => /^[a-f0-9]{64}$/.test(item.raw_payload_sha256)),
  );
});

Deno.test("blocks R1-R3 and execute mode before durable submission", async () => {
  let submits = 0;
  const deps = dependencies({
    submitObserverCommand: () => {
      submits += 1;
      return Promise.resolve(observerResult());
    },
  });
  const mutation = wireBody("campaign.pause", {
    campaign_id: CAMPAIGN_ID,
    reason: "test",
  }, { idempotency_key: "zapier-mutation-0001" });
  assertEquals(
    (await handleZapierObserverRequest(request(mutation), deps)).status,
    403,
  );
  assertEquals(
    (await handleZapierObserverRequest(
      request(wireBody("system.status", {}, { mode: "execute" })),
      deps,
    )).status,
    403,
  );
  assertEquals(submits, 0);
});

Deno.test("requires a canonical payload-bound source time before durable submission", async () => {
  let submits = 0;
  const deps = dependencies({
    submitObserverCommand: () => {
      submits += 1;
      return Promise.resolve(observerResult());
    },
  });
  const missing = await handleZapierObserverRequest(
    request(wireBody("system.status", {}, { source_occurred_at: undefined })),
    deps,
  );
  assertEquals(missing.status, 400);
  assertEquals((await json(missing)).error_code, "ZAPIER_SOURCE_TIME_REQUIRED");
  const malformed = await handleZapierObserverRequest(
    request(wireBody("system.status", {}, {
      source_occurred_at: "2026-07-14T12:00:00+00:00",
    })),
    deps,
  );
  assertEquals(malformed.status, 400);
  assertEquals((await json(malformed)).error_code, "INVALID_REQUEST_BODY");
  assertEquals(submits, 0);
});

Deno.test("rejects tenant, principal, role, authority, and unknown command claims", async () => {
  let submits = 0;
  const deps = dependencies({
    submitObserverCommand: () => {
      submits += 1;
      return Promise.resolve(observerResult());
    },
  });
  const attempts = [
    JSON.stringify({
      version: "control.command.v1",
      external_request_id: "zapier-request-0001",
      organization_id: IDENTITY.organization_id,
      command: { name: "system.status", args: {} },
      mode: "plan",
    }),
    wireBody("system.status", { contact_authorized: true }),
    wireBody("system.status", {}, { user_id: IDENTITY.user_id }),
    wireBody("system.status", {}, { role: "owner" }),
    JSON.stringify({
      version: "control.command.v1",
      external_request_id: "zapier-request-0001",
      command: { name: "launch solar", args: {} },
      mode: "plan",
    }),
  ];
  for (const body of attempts) {
    assertEquals(
      (await handleZapierObserverRequest(request(body), deps)).status,
      400,
    );
  }
  assertEquals(submits, 0);
});

Deno.test("uses only server-resolved tenant and principal in submission", async () => {
  let submission: ZapierObserverCommandSubmission | undefined;
  const response = await handleZapierObserverRequest(
    request(wireBody("campaign.inspect", { campaign_id: CAMPAIGN_ID })),
    dependencies({
      submitObserverCommand: (value) => {
        submission = value;
        return Promise.resolve(observerResult("campaign.inspect"));
      },
    }),
  );
  assertEquals(response.status, 200);
  assertEquals(submission?.identity, IDENTITY);
  assertEquals(submission?.request.command.args, { campaign_id: CAMPAIGN_ID });
  assertEquals(
    Object.prototype.hasOwnProperty.call(
      submission?.request ?? {},
      "organization_id",
    ),
    false,
  );
});

Deno.test("enforces server-side role and projected observer scopes", async () => {
  let submits = 0;
  const response = await handleZapierObserverRequest(
    request(wireBody("campaign.list")),
    dependencies({
      resolveServerIdentity: () =>
        Promise.resolve({
          ...IDENTITY,
          granted_scopes: ["system:read", "leads:write"],
        }),
      submitObserverCommand: () => {
        submits += 1;
        return Promise.resolve(observerResult("campaign.list"));
      },
    }),
  );
  assertEquals(response.status, 403);
  assertEquals(submits, 0);
});

Deno.test("submit failure and authority-widened results fail closed", async () => {
  const failed = await handleZapierObserverRequest(
    request(),
    dependencies({
      submitObserverCommand: () =>
        Promise.reject(new Error("store unavailable")),
    }),
  );
  assertEquals(failed.status, 503);
  assertEquals((await json(failed)).error_code, "OBSERVER_SUBMISSION_FAILED");

  const widened = await handleZapierObserverRequest(
    request(),
    dependencies({
      submitObserverCommand: () =>
        Promise.resolve({
          ...observerResult(),
          authority: { ...OBSERVER_AUTHORITY, spend_authorized: true },
        } as unknown as ObserverControlResult),
    }),
  );
  assertEquals(widened.status, 502);
  assertEquals((await json(widened)).error_code, "INVALID_OBSERVER_RESULT");
});

Deno.test("success response remains bounded, no-store, and observer-only", async () => {
  const response = await handleZapierObserverRequest(request(), dependencies());
  assertEquals(response.status, 200);
  assertEquals(response.headers.get("cache-control"), "no-store, max-age=0");
  assertEquals(response.headers.get("x-content-type-options"), "nosniff");
  const body = await json(response);
  assertEquals(body.authority, OBSERVER_AUTHORITY);
  const result = body.result as Record<string, unknown>;
  assertEquals(result.authority, OBSERVER_AUTHORITY);
  assertEquals(result.profile, "observer");
  assertEquals(result.command_name, "system.status");
});
