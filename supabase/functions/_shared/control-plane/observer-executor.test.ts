// deno-lint-ignore-file no-import-prefix -- Edge tests pin the deployed Deno std version.
import {
  assertEquals,
  assertNotEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { ControlPlaneAuthorizationError } from "./authorization.ts";
import {
  executeObserverCommand,
  type ObserverQueryStore,
} from "./observer-executor.ts";
import type {
  AuthorizedCommandIdentity,
  WireCommandRequestV1,
} from "./types.ts";

const COMMAND_ID = "99999999-9999-4999-8999-999999999999";
const CAMPAIGN_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function identity(
  organizationId = "11111111-1111-4111-8111-111111111111",
): AuthorizedCommandIdentity {
  return {
    channel: "slack",
    installation_id: "55555555-5555-4555-8555-555555555555",
    external_principal_id: "slack-user-hmac",
    user_id: "33333333-3333-4333-8333-333333333333",
    organization_id: organizationId,
    organization_role: "owner",
    granted_scopes: ["campaigns:read", "system:read"],
  };
}

function wire(
  name: WireCommandRequestV1["command"]["name"],
  args: Record<string, unknown> = {},
): unknown {
  return {
    version: "control.command.v1",
    external_request_id: "slack:request-123",
    command: { name, args },
    mode: "plan",
  };
}

function store(
  overrides: Partial<ObserverQueryStore> = {},
): ObserverQueryStore {
  return {
    readSystemStatus: () => Promise.resolve({ healthy: true }),
    readEliteSolarBrief: () =>
      Promise.resolve({
        briefing_kind: "elite_solar_first_pilot_operator_brief_v1",
      }),
    readEliteSolarPulse: () =>
      Promise.resolve({
        pulse_kind: "elite_solar_first_pilot_release_pulse_v1",
      }),
    listCampaigns: () => Promise.resolve({ campaigns: [] }),
    inspectCampaign: () => Promise.resolve({ campaign: null }),
    ...overrides,
  };
}

Deno.test("operator context includes the finite help guide and always carries false authority", async () => {
  const result = await executeObserverCommand({
    command_id: COMMAND_ID,
    identity: identity(),
    request: wire("operator.context"),
    store: store({
      readSystemStatus: () => Promise.reject(new Error("must not query")),
    }),
  });

  assertEquals(result.result.data, {
    channel: "slack",
    installation_id: "55555555-5555-4555-8555-555555555555",
    user_id: "33333333-3333-4333-8333-333333333333",
    organization_id: "11111111-1111-4111-8111-111111111111",
    organization_role: "owner",
    granted_scopes: ["campaigns:read", "system:read"],
    command_guide: {
      profile: "read_only_observer",
      inputs: [
        "help",
        "who am i",
        "status",
        "elite brief",
        "elite pulse",
        "campaigns",
        "campaign <exact campaign UUID>",
        "release <exact campaign UUID>",
      ],
      constraints: [
        "Commands are exact, read-only, and tenant-scoped.",
        "This observer cannot launch campaigns, contact people, write CRM data, or spend money.",
        "A campaign release summary is not contact authorization.",
      ],
    },
  });
  assertEquals(result.result.authority, {
    contact_authorized: false,
    launch_authorized: false,
    queue_mutation_authorized: false,
    crm_write_authorized: false,
    spend_authorized: false,
  });
});

Deno.test("status queries receive only authoritative tenant identity and bounded defaults", async () => {
  let received: unknown;
  const execution = await executeObserverCommand({
    command_id: COMMAND_ID,
    identity: identity(),
    request: wire("system.status"),
    store: store({
      readSystemStatus: (context) => {
        received = context;
        return Promise.resolve({ calls: 0 });
      },
    }),
  });
  assertEquals(received, {
    organization_id: "11111111-1111-4111-8111-111111111111",
    user_id: "33333333-3333-4333-8333-333333333333",
    window_hours: 24,
  });
  assertEquals(execution.result.data, { calls: 0 });
});

Deno.test("Elite brief receives only authoritative tenant identity and remains read-only", async () => {
  let received: unknown;
  const execution = await executeObserverCommand({
    command_id: COMMAND_ID,
    identity: identity(),
    request: wire("elite.solar_brief"),
    store: store({
      readEliteSolarBrief: (context) => {
        received = context;
        return Promise.resolve({
          briefing_kind: "elite_solar_first_pilot_operator_brief_v1",
          contact_authorized: false,
        });
      },
    }),
  });
  assertEquals(received, {
    organization_id: "11111111-1111-4111-8111-111111111111",
    user_id: "33333333-3333-4333-8333-333333333333",
  });
  assertEquals(execution.result.command_name, "elite.solar_brief");
  assertEquals(execution.result.authority.contact_authorized, false);
  assertEquals(execution.result.authority.launch_authorized, false);
});

Deno.test("Elite pulse receives only authoritative tenant identity and remains read-only", async () => {
  let received: unknown;
  const execution = await executeObserverCommand({
    command_id: COMMAND_ID,
    identity: identity(),
    request: wire("elite.solar_pulse"),
    store: store({
      readEliteSolarPulse: (context) => {
        received = context;
        return Promise.resolve({
          pulse_kind: "elite_solar_first_pilot_release_pulse_v1",
          contact_authorized: false,
        });
      },
    }),
  });
  assertEquals(received, {
    organization_id: "11111111-1111-4111-8111-111111111111",
    user_id: "33333333-3333-4333-8333-333333333333",
  });
  assertEquals(execution.result.command_name, "elite.solar_pulse");
  assertEquals(execution.result.authority.contact_authorized, false);
  assertEquals(execution.result.authority.launch_authorized, false);
});

Deno.test("campaign inspection preserves exact UUID selection and include bounds", async () => {
  let received: unknown;
  await executeObserverCommand({
    command_id: COMMAND_ID,
    identity: identity(),
    request: wire("campaign.inspect", {
      campaign_id: CAMPAIGN_ID,
      include: ["validation", "live_stats"],
    }),
    store: store({
      inspectCampaign: (context) => {
        received = context;
        return Promise.resolve({ id: CAMPAIGN_ID });
      },
    }),
  });
  assertEquals(received, {
    organization_id: "11111111-1111-4111-8111-111111111111",
    user_id: "33333333-3333-4333-8333-333333333333",
    campaign_id: CAMPAIGN_ID,
    include: ["validation", "live_stats"],
  });
});

Deno.test("release inspection remains an R0 read and carries no execution authority", async () => {
  let received: unknown;
  const result = await executeObserverCommand({
    command_id: COMMAND_ID,
    identity: identity(),
    request: wire("campaign.inspect", {
      campaign_id: CAMPAIGN_ID,
      include: ["release_status"],
    }),
    store: store({
      inspectCampaign: (context) => {
        received = context;
        return Promise.resolve({
          release_status: { contact_authorized: false },
        });
      },
    }),
  });
  assertEquals(received, {
    organization_id: "11111111-1111-4111-8111-111111111111",
    user_id: "33333333-3333-4333-8333-333333333333",
    campaign_id: CAMPAIGN_ID,
    include: ["release_status"],
  });
  assertEquals(result.result.authority.contact_authorized, false);
  assertEquals(result.result.authority.launch_authorized, false);
});

Deno.test("observer execution blocks every non-R0 command before store access", async () => {
  let storeCalled = false;
  await assertRejects(
    () =>
      executeObserverCommand({
        command_id: COMMAND_ID,
        identity: { ...identity(), granted_scopes: ["admin"] },
        request: {
          ...wire("campaign.pause", {
            campaign_id: CAMPAIGN_ID,
            reason: "Safety pause",
          }) as Record<string, unknown>,
          idempotency_key: "pause-1234",
        },
        store: store({
          listCampaigns: () => {
            storeCalled = true;
            return Promise.resolve([]);
          },
        }),
      }),
    ControlPlaneAuthorizationError,
    "observer profile",
  );
  assertEquals(storeCalled, false);
});

Deno.test("intent hash binds the authoritative organization", async () => {
  const first = await executeObserverCommand({
    command_id: COMMAND_ID,
    identity: identity(),
    request: wire("system.status", { window_hours: 12 }),
    store: store(),
  });
  const second = await executeObserverCommand({
    command_id: COMMAND_ID,
    identity: identity("22222222-2222-4222-8222-222222222222"),
    request: wire("system.status", { window_hours: 12 }),
    store: store(),
  });
  assertNotEquals(first.intent_sha256, second.intent_sha256);
});

Deno.test("non-JSON store results cannot enter a durable observer receipt", async () => {
  await assertRejects(
    () =>
      executeObserverCommand({
        command_id: COMMAND_ID,
        identity: identity(),
        request: wire("system.status"),
        store: store({
          readSystemStatus: () => Promise.resolve(undefined as never),
        }),
      }),
    Error,
    "Canonical JSON accepts only JSON values",
  );
});
