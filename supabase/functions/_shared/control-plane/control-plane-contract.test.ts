// deno-lint-ignore-file no-import-prefix -- Edge tests pin the deployed Deno std version.
import {
  assert,
  assertEquals,
  assertNotEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  authorizeCommand,
  ControlPlaneAuthorizationError,
  createObserverResult,
} from "./authorization.ts";
import { hashControlIntent } from "./canonical-json.ts";
import {
  COMMAND_REGISTRY,
  ControlPlaneRegistryError,
  parseConversationalCommand,
} from "./registry.ts";
import {
  assertBoundedCommandArgs,
  ControlPlaneSchemaError,
  parseWireCommandRequest,
} from "./schemas.ts";
import {
  CONTROL_CHANNELS,
  type ControlCommandName,
  type IntentHashInput,
} from "./types.ts";

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const USER_A = "33333333-3333-4333-8333-333333333333";
const USER_B = "44444444-4444-4444-8444-444444444444";
const INSTALL_A = "55555555-5555-4555-8555-555555555555";
const INSTALL_B = "66666666-6666-4666-8666-666666666666";
const CAMPAIGN_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LEAD_A = "88888888-8888-4888-8888-888888888888";
const COMMAND_A = "99999999-9999-4999-8999-999999999999";
const APPROVAL = "A".repeat(43);

function wire(
  name: ControlCommandName | string,
  args: Record<string, unknown>,
  additions: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    version: "control.command.v1",
    external_request_id: "request-1234",
    command: { name, args },
    mode: "plan",
    ...additions,
  };
}

function assertSchemaCode(
  action: () => unknown,
  code: string,
): ControlPlaneSchemaError {
  const error = assertThrows(action, ControlPlaneSchemaError);
  assertEquals(error.code, code);
  return error;
}

function assertRegistryCode(action: () => unknown, code: string): void {
  const error = assertThrows(action, ControlPlaneRegistryError);
  assertEquals(error.code, code);
}

function assertAuthorizationCode(action: () => unknown, code: string): void {
  const error = assertThrows(action, ControlPlaneAuthorizationError);
  assertEquals(error.code, code);
}

Deno.test("strict wire schema accepts only the exact R0 request shape", () => {
  const parsed = parseWireCommandRequest({
    version: "control.command.v1",
    external_request_id: "slack:request-123",
    command: { name: "system.status", args: { window_hours: 24 } },
    mode: "plan",
  });
  assertEquals(parsed, {
    version: "control.command.v1",
    external_request_id: "slack:request-123",
    command: { name: "system.status", args: { window_hours: 24 } },
    mode: "plan",
  });

  assertSchemaCode(
    () =>
      parseWireCommandRequest({ ...wire("system.status", {}), surprise: true }),
    "UNKNOWN_FIELD",
  );
  assertSchemaCode(
    () =>
      parseWireCommandRequest({
        ...wire("system.status", {}),
        command: { name: "system.status", args: {}, surprise: true },
      }),
    "UNKNOWN_FIELD",
  );
  assertSchemaCode(
    () => parseWireCommandRequest(wire("system.status", { surprise: true })),
    "UNKNOWN_FIELD",
  );
});

Deno.test("wire identity, tenant, role, scopes, internal, and effect authority are forbidden", () => {
  for (
    const field of [
      "user_id",
      "organization_id",
      "role",
      "scopes",
      "internal",
      "contact_authorized",
      "launch_authorized",
      "queue_mutation_authorized",
      "crm_write_authorized",
      "spend_authorized",
    ]
  ) {
    assertSchemaCode(
      () =>
        parseWireCommandRequest({
          ...wire("system.status", {}),
          [field]: true,
        }),
      "WIRE_AUTHORITY_FORBIDDEN",
    );
  }

  for (
    const field of [
      "organizationId",
      "userId",
      "tenant_alias",
      "internal",
      "effects",
    ] as const
  ) {
    assertSchemaCode(
      () =>
        parseWireCommandRequest(wire("system.status", { [field]: "forged" })),
      "WIRE_AUTHORITY_FORBIDDEN",
    );
  }
});

Deno.test("command text and arguments are bounded and reject unsafe controls", () => {
  assertRegistryCode(
    () => parseConversationalCommand("x".repeat(513)),
    "COMMAND_TEXT_LIMIT",
  );
  assertSchemaCode(
    () =>
      parseWireCommandRequest({
        ...wire("system.status", {}),
        external_request_id: `request-${"x".repeat(300)}`,
      }),
    "STRING_BOUNDS",
  );
  assertSchemaCode(
    () =>
      parseWireCommandRequest(wire("campaign.upsert_draft", {
        name: "Solar",
        provider: "retell",
        agent_id: "agent_1",
        script: "x".repeat(20_001),
        calls_per_minute: 1,
        max_attempts: 1,
        calling_hours_start: "09:00",
        calling_hours_end: "17:00",
        timezone: "America/Denver",
      }, { idempotency_key: "draft-1234" })),
    "ARG_STRING_LIMIT",
  );
  assertSchemaCode(
    () =>
      assertBoundedCommandArgs({
        a: { b: { c: { d: { e: { f: { g: true } } } } } },
      }),
    "ARG_DEPTH_LIMIT",
  );
  assertSchemaCode(
    () =>
      parseWireCommandRequest({
        ...wire("system.status", {}),
        external_request_id: "request\u0000bad",
      }),
    "UNSAFE_TEXT",
  );
});

Deno.test("safe Unicode content is distinct from unsafe Unicode command selection", () => {
  const draft = parseWireCommandRequest(wire("campaign.upsert_draft", {
    name: "Élite Solar",
    provider: "retell",
    agent_id: "agent_1",
    script: "Ayudamos al propietario.",
    calls_per_minute: 1,
    max_attempts: 2,
    calling_hours_start: "09:00",
    calling_hours_end: "17:00",
    timezone: "America/Denver",
  }, { idempotency_key: "draft-unicode-1" }));
  assertEquals(draft.command.args.name, "Élite Solar");

  assertRegistryCode(
    () => parseConversationalCommand("stаtus"), // Cyrillic small a.
    "UNSAFE_COMMAND_TEXT",
  );
  assertRegistryCode(
    () => parseConversationalCommand("status\ncampaigns"),
    "UNSAFE_COMMAND_TEXT",
  );
  assertSchemaCode(
    () =>
      parseWireCommandRequest(wire("campaign.pause", {
        campaign_id: CAMPAIGN_A,
        reason: "pause\u202eforged",
      }, { idempotency_key: "pause-unsafe-1" })),
    "UNSAFE_TEXT",
  );
});

Deno.test("deterministic aliases resolve R0 commands and unknown or ambiguous text never falls through", () => {
  assertEquals(parseConversationalCommand("  WHO   AM I  "), {
    command: { name: "operator.context", args: {} },
    mode: "plan",
    parser: "deterministic_alias_v1",
  });
  assertEquals(parseConversationalCommand("list campaigns").command, {
    name: "campaign.list",
    args: {},
  });
  assertEquals(
    parseConversationalCommand(`inspect campaign ${CAMPAIGN_A}`).command,
    { name: "campaign.inspect", args: { campaign_id: CAMPAIGN_A } },
  );

  for (
    const text of [
      "status campaigns",
      "please launch campaign",
      "campaign solar exit",
      `campaign ${CAMPAIGN_A} now`,
    ]
  ) {
    assertRegistryCode(
      () => parseConversationalCommand(text),
      "UNKNOWN_COMMAND_TEXT",
    );
  }
});

Deno.test("prototype property names are not registered commands", () => {
  for (const name of ["toString", "constructor", "__proto__"]) {
    assertRegistryCode(
      () => parseWireCommandRequest(wire(name, {})),
      "UNKNOWN_COMMAND",
    );
    assertRegistryCode(
      () => parseConversationalCommand(name),
      "UNKNOWN_COMMAND_TEXT",
    );
  }
});

Deno.test("campaign selectors require an exact canonical lowercase UUID", () => {
  assertEquals(
    parseWireCommandRequest(
      wire("campaign.inspect", { campaign_id: CAMPAIGN_A }),
    )
      .command.args.campaign_id,
    CAMPAIGN_A,
  );
  assertSchemaCode(
    () =>
      parseWireCommandRequest(
        wire("campaign.inspect", { campaign_id: CAMPAIGN_A.toUpperCase() }),
      ),
    "CANONICAL_UUID_REQUIRED",
  );
  assertSchemaCode(
    () =>
      parseWireCommandRequest(
        wire("campaign.inspect", { campaign_id: "solar" }),
      ),
    "STRING_BOUNDS",
  );
  assertRegistryCode(
    () => parseConversationalCommand(`campaign ${CAMPAIGN_A.toUpperCase()}`),
    "UNKNOWN_COMMAND_TEXT",
  );
});

function baseIntent(): IntentHashInput {
  return {
    organization_id: ORG_A,
    user_id: USER_A,
    channel: "slack",
    installation_id: INSTALL_A,
    command: {
      name: "campaign.inspect",
      args: { campaign_id: CAMPAIGN_A, include: ["validation", "live_stats"] },
    },
    mode: "plan",
    approval_handle: "first-token",
  };
}

Deno.test("intent hash is stable across key order and excludes approval handle", async () => {
  const a = await hashControlIntent(baseIntent());
  const reordered = baseIntent();
  reordered.command.args = {
    include: ["validation", "live_stats"],
    campaign_id: CAMPAIGN_A,
  };
  reordered.approval_handle = "different-token";
  const b = await hashControlIntent(reordered);
  assertEquals(a, b);
  assertEquals(a.length, 64);
});

Deno.test("intent hash binds every authoritative identity and intent field", async () => {
  const baseline = await hashControlIntent(baseIntent());
  const variants: IntentHashInput[] = [
    { ...baseIntent(), organization_id: ORG_B },
    { ...baseIntent(), user_id: USER_B },
    { ...baseIntent(), channel: "teams" },
    { ...baseIntent(), installation_id: INSTALL_B },
    { ...baseIntent(), mode: "execute" },
    { ...baseIntent(), command: { name: "system.status", args: {} } },
    {
      ...baseIntent(),
      command: {
        ...baseIntent().command,
        args: { campaign_id: CAMPAIGN_A, include: ["validation"] },
      },
    },
  ];
  for (const variant of variants) {
    assertNotEquals(await hashControlIntent(variant), baseline);
  }

  const channelHashes = new Set<string>();
  for (const channel of CONTROL_CHANNELS) {
    channelHashes.add(await hashControlIntent({ ...baseIntent(), channel }));
  }
  assertEquals(channelHashes.size, CONTROL_CHANNELS.length);
});

Deno.test("role and scope matrix is fail-closed and preserves scope hierarchy", () => {
  assertEquals(
    authorizeCommand("system.status", {
      profile: "observer",
      role: "admin",
      scopes: ["system:read"],
    }).risk,
    "R0",
  );
  authorizeCommand("campaign.list", {
    profile: "observer",
    role: "admin",
    scopes: ["read"],
  });
  authorizeCommand("campaign.upsert_draft", {
    profile: "operator",
    role: "manager",
    scopes: ["campaigns:write"],
  });
  authorizeCommand("campaign.dispatch", {
    profile: "operator",
    role: "admin",
    scopes: ["admin"],
  });

  assertAuthorizationCode(
    () =>
      authorizeCommand("campaign.dispatch", {
        profile: "bogus" as "operator",
        role: "owner",
        scopes: ["admin"],
      }),
    "INVALID_PROFILE",
  );
  assertAuthorizationCode(
    () =>
      authorizeCommand("campaign.dispatch", {
        profile: "operator",
        role: "bogus" as "owner",
        scopes: ["admin"],
      }),
    "INVALID_ROLE",
  );
  assertAuthorizationCode(
    () =>
      authorizeCommand("system.status", {
        profile: "observer",
        role: "admin",
        scopes: ["system:read", 7] as unknown as string[],
      }),
    "INVALID_SCOPES",
  );
  assertAuthorizationCode(
    () =>
      authorizeCommand("system.status", {
        profile: "observer",
        role: "member",
        scopes: ["system:read"],
      }),
    "ROLE_FORBIDDEN",
  );
  assertAuthorizationCode(
    () =>
      authorizeCommand("campaign.upsert_draft", {
        profile: "operator",
        role: "member",
        scopes: ["campaigns:write"],
      }),
    "ROLE_FORBIDDEN",
  );
  assertAuthorizationCode(
    () =>
      authorizeCommand("campaign.upsert_draft", {
        profile: "operator",
        role: "manager",
        scopes: ["campaigns:read"],
      }),
    "SCOPE_FORBIDDEN",
  );
  assertAuthorizationCode(
    () =>
      authorizeCommand("campaign.dispatch", {
        profile: "operator",
        role: "admin",
        scopes: ["campaigns:write"],
      }),
    "SCOPE_FORBIDDEN",
  );
});

Deno.test("observer profile blocks every non-R0 command regardless of role or scopes", () => {
  const nonObserverCommands = Object.values(COMMAND_REGISTRY).filter((
    definition,
  ) => definition.risk !== "R0");
  assert(nonObserverCommands.length > 0);
  for (const definition of nonObserverCommands) {
    assertAuthorizationCode(
      () =>
        authorizeCommand(definition.name, {
          profile: "observer",
          role: "owner",
          scopes: ["admin"],
        }),
      "OBSERVER_PROFILE_BLOCKED",
    );
  }
});

Deno.test("registry represents R0 through R3 with observer authority only on R0", () => {
  const risks = new Set(
    Object.values(COMMAND_REGISTRY).map((definition) => definition.risk),
  );
  assertEquals(risks, new Set(["R0", "R1", "R2", "R3"]));
  for (const definition of Object.values(COMMAND_REGISTRY)) {
    assertEquals(definition.observer_allowed, definition.risk === "R0");
  }
});

Deno.test("observer results always deny contact, launch, queue, CRM, and spend authority", () => {
  const result = createObserverResult({
    command_id: COMMAND_A,
    command_name: "system.status",
    status: "completed",
    data: { healthy: true },
  });
  assertEquals(result.authority, {
    contact_authorized: false,
    launch_authorized: false,
    queue_mutation_authorized: false,
    crm_write_authorized: false,
    spend_authorized: false,
  });
  assertAuthorizationCode(
    () =>
      createObserverResult({
        command_id: COMMAND_A,
        command_name: "campaign.activate",
        status: "held",
        data: {},
      }),
    "OBSERVER_RESULT_BLOCKED",
  );
});

Deno.test("non-R0 wire requests require idempotency and exact approval semantics", () => {
  assertSchemaCode(
    () =>
      parseWireCommandRequest(wire("campaign.pause", {
        campaign_id: CAMPAIGN_A,
        reason: "Operator safety pause",
      })),
    "IDEMPOTENCY_KEY_REQUIRED",
  );
  const pause = parseWireCommandRequest(wire("campaign.pause", {
    campaign_id: CAMPAIGN_A,
    reason: "Operator safety pause",
  }, { idempotency_key: "pause-1234" }));
  assertEquals(pause.command.name, "campaign.pause");

  const stage = parseWireCommandRequest(wire("campaign.stage_lead", {
    campaign_id: CAMPAIGN_A,
    lead_id: LEAD_A,
    scheduled_at: "2026-07-14T16:00:00Z",
    priority: 10,
  }, { idempotency_key: "stage-1234" }));
  assertEquals(stage.command.name, "campaign.stage_lead");

  assertSchemaCode(
    () =>
      parseWireCommandRequest(wire("campaign.activate", {
        campaign_id: CAMPAIGN_A,
      }, {
        mode: "execute",
        idempotency_key: "activate-1234",
      })),
    "APPROVAL_HANDLE_REQUIRED",
  );
  const activation = parseWireCommandRequest(wire("campaign.activate", {
    campaign_id: CAMPAIGN_A,
  }, {
    mode: "execute",
    idempotency_key: "activate-1234",
    approval_handle: APPROVAL,
  }));
  assertEquals(activation.approval_handle, APPROVAL);

  assertSchemaCode(
    () =>
      parseWireCommandRequest(wire("campaign.activate", {
        campaign_id: CAMPAIGN_A,
      }, {
        idempotency_key: "activate-plan-1",
        approval_handle: APPROVAL,
      })),
    "PLAN_APPROVAL_FORBIDDEN",
  );
});
