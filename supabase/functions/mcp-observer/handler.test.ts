// deno-lint-ignore-file no-import-prefix -- repository Edge tests pin this std version.
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { OBSERVER_AUTHORITY } from "../_shared/control-plane/authorization.ts";
import type {
  AuthorizedCommandIdentity,
  ControlCommandName,
  JsonObject,
  ObserverControlResult,
} from "../_shared/control-plane/types.ts";
import {
  handleMcpObserverRequest,
  type McpObserverCommandSubmission,
  type McpObserverHandlerDependencies,
} from "./handler.ts";

const KEY = `dsk_live_${"B2".repeat(16)}`;
const COMMAND_ID = "523e4567-e89b-42d3-a456-426614174000";
const CAMPAIGN_ID = "623e4567-e89b-42d3-a456-426614174000";
const IDENTITY: AuthorizedCommandIdentity = {
  channel: "mcp",
  installation_id: "123e4567-e89b-42d3-a456-426614174000",
  external_principal_id: "223e4567-e89b-42d3-a456-426614174000",
  user_id: "323e4567-e89b-42d3-a456-426614174000",
  organization_id: "423e4567-e89b-42d3-a456-426614174000",
  organization_role: "admin",
  granted_scopes: ["system:read", "campaigns:read"],
};

function wireBody(
  name: ControlCommandName = "elite.solar_pulse",
  args: JsonObject = {},
  additions: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    version: "control.command.v1",
    external_request_id: "mcp-request-0001",
    source_occurred_at: "2026-07-19T12:00:00.000Z",
    command: { name, args },
    mode: "plan",
    ...additions,
  });
}

function result(
  commandName: ControlCommandName = "elite.solar_pulse",
): ObserverControlResult {
  return {
    version: "control.result.v1",
    profile: "observer",
    command_id: COMMAND_ID,
    command_name: commandName,
    status: "completed",
    authority: OBSERVER_AUTHORITY,
    data: { source: "tenant-scoped-observer-store", contact_authorized: false },
  };
}

function dependencies(
  overrides: Partial<McpObserverHandlerDependencies> = {},
): McpObserverHandlerDependencies {
  return {
    enabled: true,
    resolveServerIdentity: () => Promise.resolve(IDENTITY),
    submitObserverCommand: (submission) =>
      Promise.resolve(result(submission.request.command.name)),
    ...overrides,
  };
}

function request(
  body = wireBody(),
  options: { authorization?: string | null; method?: string } = {},
): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (options.authorization !== null) {
    headers.set("authorization", options.authorization ?? `Bearer ${KEY}`);
  }
  const method = options.method ?? "POST";
  return new Request("https://example.test/functions/v1/mcp-observer", {
    method,
    headers,
    ...(method === "GET" ? {} : { body }),
  });
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

Deno.test("MCP adapter hard-locks before request, credential, or submission work", async () => {
  let resolved = 0;
  let submitted = 0;
  const poisonRequest = new Proxy({} as Request, {
    get() {
      throw new Error("disabled adapter inspected request");
    },
  });
  const response = await handleMcpObserverRequest(
    poisonRequest,
    dependencies({
      enabled: false,
      resolveServerIdentity: () => {
        resolved += 1;
        throw new Error("must not resolve");
      },
      submitObserverCommand: () => {
        submitted += 1;
        throw new Error("must not submit");
      },
    }),
  );
  assertEquals(response.status, 503);
  assertEquals(
    (await json(response)).error_code,
    "MCP_OBSERVER_LAUNCH_DISABLED",
  );
  assertEquals(resolved, 0);
  assertEquals(submitted, 0);
});

Deno.test("MCP submits only the mcp-bound identity and bounded Elite R0 command", async () => {
  let submission: McpObserverCommandSubmission | undefined;
  const response = await handleMcpObserverRequest(
    request(wireBody("campaign.inspect", { campaign_id: CAMPAIGN_ID })),
    dependencies({
      submitObserverCommand: (value) => {
        submission = value;
        return Promise.resolve(result("campaign.inspect"));
      },
    }),
  );
  assertEquals(response.status, 200);
  assertEquals(submission?.channel, "mcp");
  assertEquals(submission?.identity, IDENTITY);
  assertEquals(submission?.request.command.args, { campaign_id: CAMPAIGN_ID });
  const body = await json(response);
  assertEquals(body.authority, OBSERVER_AUTHORITY);
  assertEquals(
    (body.result as Record<string, unknown>).command_name,
    "campaign.inspect",
  );
});

Deno.test("MCP rejects a Zapier-bound identity, execute mode, and missing source time", async () => {
  let submitted = 0;
  const mismatched = await handleMcpObserverRequest(
    request(),
    dependencies({
      resolveServerIdentity: () =>
        Promise.resolve({ ...IDENTITY, channel: "zapier" }),
      submitObserverCommand: () => {
        submitted += 1;
        return Promise.resolve(result());
      },
    }),
  );
  assertEquals(mismatched.status, 503);
  assertEquals(
    (await json(mismatched)).error_code,
    "MCP_IDENTITY_RESOLUTION_UNAVAILABLE",
  );

  const execute = await handleMcpObserverRequest(
    request(wireBody("elite.solar_pulse", {}, { mode: "execute" })),
    dependencies({
      submitObserverCommand: () => {
        submitted += 1;
        return Promise.resolve(result());
      },
    }),
  );
  assertEquals(execute.status, 403);

  const missingTime = await handleMcpObserverRequest(
    request(
      wireBody("elite.solar_pulse", {}, { source_occurred_at: undefined }),
    ),
    dependencies({
      submitObserverCommand: () => {
        submitted += 1;
        return Promise.resolve(result());
      },
    }),
  );
  assertEquals(missingTime.status, 400);
  assertEquals(
    (await json(missingTime)).error_code,
    "MCP_SOURCE_TIME_REQUIRED",
  );
  assertEquals(submitted, 0);
});
