// deno-lint-ignore-file no-explicit-any no-import-prefix
import {
  assert,
  assertEquals,
  assertNotEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  createExternalObserverRuntime,
  createObserverQueryStore,
  hashExternalIdentifier,
  type ObserverRuntimeClient,
  ObserverRuntimeError,
  type ObserverRuntimeQuery,
} from "./observer-runtime.ts";
import type { JsonObject, WireCommandRequestV1 } from "./types.ts";

const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const API_KEY_ID = "33333333-3333-4333-8333-333333333333";
const INSTALLATION_ID = "44444444-4444-4444-8444-444444444444";
const PRINCIPAL_ID = "55555555-5555-4555-8555-555555555555";
const CLAIM_ID = "66666666-6666-4666-8666-666666666666";
const RECEIPT_ID = "77777777-7777-4777-8777-777777777777";
const CAMPAIGN_ID = "88888888-8888-4888-8888-888888888888";
const IDENTIFIER_KEY = "A".repeat(43);
const FIXED_NOW = new Date("2026-07-14T12:00:00.000Z");

type Filter = { kind: "eq" | "gte"; column: string; value: unknown };
type QueryLog = {
  table: string;
  filters: Filter[];
  select: string | null;
  range: [number, number] | null;
};

function cloneRows(value: unknown): any[] {
  return JSON.parse(JSON.stringify(value)) as any[];
}

class FakeQuery implements ObserverRuntimeQuery {
  readonly filters: Filter[] = [];
  selectValue: string | null = null;
  rangeValue: [number, number] | null = null;
  limitValue: number | null = null;

  constructor(
    private readonly client: FakeClient,
    private readonly table: string,
  ) {}

  select(columns: string): ObserverRuntimeQuery {
    this.selectValue = columns;
    return this;
  }

  eq(column: string, value: unknown): ObserverRuntimeQuery {
    this.filters.push({ kind: "eq", column, value });
    return this;
  }

  gte(column: string, value: string): ObserverRuntimeQuery {
    this.filters.push({ kind: "gte", column, value });
    return this;
  }

  order(): ObserverRuntimeQuery {
    return this;
  }

  limit(count: number): ObserverRuntimeQuery {
    this.limitValue = count;
    return this;
  }

  range(from: number, to: number): ObserverRuntimeQuery {
    this.rangeValue = [from, to];
    return this;
  }

  maybeSingle() {
    const rows = this.rows();
    return Promise.resolve({ data: rows[0] ?? null, error: null, count: null });
  }

  then<
    TResult1 = { data: unknown; error: unknown | null; count: number | null },
    TResult2 = never,
  >(
    onfulfilled?:
      | ((
        value: { data: unknown; error: unknown | null; count: number | null },
      ) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const rows = this.rows();
    return Promise.resolve({ data: rows, error: null, count: rows.length })
      .then(
        onfulfilled,
        onrejected,
      );
  }

  private rows(): any[] {
    this.client.queryLog.push({
      table: this.table,
      filters: [...this.filters],
      select: this.selectValue,
      range: this.rangeValue,
    });
    let rows = cloneRows(this.client.rows[this.table] ?? []);
    for (const filter of this.filters) {
      if (
        (this.table === "external_control_installations" ||
          this.table === "external_control_principals") &&
        filter.column.endsWith("_hmac")
      ) {
        continue;
      }
      if (filter.kind === "eq") {
        rows = rows.filter((row) => row[filter.column] === filter.value);
      }
      if (filter.kind === "gte") {
        rows = rows.filter((row) => String(row[filter.column]) >= filter.value);
      }
    }
    if (this.rangeValue !== null) {
      rows = rows.slice(this.rangeValue[0], this.rangeValue[1] + 1);
    }
    if (this.limitValue !== null) rows = rows.slice(0, this.limitValue);
    return rows;
  }
}

class FakeClient implements ObserverRuntimeClient {
  readonly queryLog: QueryLog[] = [];
  readonly rpcCalls: Array<
    { functionName: string; args: Record<string, unknown> }
  > = [];
  rpcResult: unknown = [{
    claim_id: CLAIM_ID,
    receipt_id: RECEIPT_ID,
    commit_status: "committed",
    decision: "held",
    reason_codes: ["OBSERVER_ONLY"],
  }];
  releaseStatusResult: unknown = [{
    release_state: "current_release_present",
    release_stage: "canary_5",
    release_expires_at: "2026-07-14T13:00:00.000Z",
    cohort_limit: 5,
    cohort_member_count: 1,
    final_contact_evaluation_required: true,
  }];
  readonly rows: Record<string, any[]> = {
    api_keys: [{
      id: API_KEY_ID,
      user_id: USER_ID,
      organization_id: ORGANIZATION_ID,
      key_hash:
        "03303b58ce860da4f642e12863918fdc24ea19bdd9ee21339bf61c9f33781d87",
      scopes: ["system:read", "campaigns:read"],
      revoked_at: null,
      expires_at: null,
    }],
    external_control_installations: [{
      id: INSTALLATION_ID,
      organization_id: ORGANIZATION_ID,
      provider: "zapier",
      identifier_key_version: "v1",
      status: "active",
    }],
    external_control_principals: [{
      id: PRINCIPAL_ID,
      user_id: USER_ID,
      installation_id: INSTALLATION_ID,
      organization_id: ORGANIZATION_ID,
      identifier_key_version: "v1",
      status: "active",
    }],
    organization_users: [{
      organization_id: ORGANIZATION_ID,
      user_id: USER_ID,
      role: "owner",
    }],
    campaigns: [
      {
        id: CAMPAIGN_ID,
        organization_id: ORGANIZATION_ID,
        user_id: USER_ID,
        name: "Solar Exit Intake",
        status: "draft",
        provider: "retell",
        agent_id: "agent_solar",
        calls_per_minute: 5,
        max_attempts: 2,
        max_calls_per_day: 50,
        calling_hours_start: "09:00",
        calling_hours_end: "17:00",
        timezone: "America/Denver",
        created_at: "2026-07-01T12:00:00.000Z",
        updated_at: "2026-07-02T12:00:00.000Z",
      },
    ],
    call_logs: [{
      organization_id: ORGANIZATION_ID,
      user_id: USER_ID,
      campaign_id: CAMPAIGN_ID,
      status: "completed",
      auto_disposition: "qualified",
      created_at: "2026-07-14T11:00:00.000Z",
    }],
  };

  from(table: string): ObserverRuntimeQuery {
    return new FakeQuery(this, table);
  }

  rpc(functionName: string, args: Record<string, unknown>) {
    this.rpcCalls.push({ functionName, args: { ...args } });
    return Promise.resolve({
      data: cloneRows(
        functionName === "get_campaign_contact_release_observer_status"
          ? this.releaseStatusResult
          : this.rpcResult,
      ),
      error: null,
      count: null,
    });
  }
}

function runtime(client = new FakeClient()) {
  return {
    client,
    runtime: createExternalObserverRuntime({
      client,
      identifier_hmac_key: IDENTIFIER_KEY,
      identifier_key_version: "v1",
      now: () => new Date(FIXED_NOW),
    }),
  };
}

async function credentialHash(credential: string): Promise<string> {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(credential)),
  );
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function wire(
  name: WireCommandRequestV1["command"]["name"] = "system.status",
  args: JsonObject = {},
): WireCommandRequestV1 {
  return {
    version: "control.command.v1",
    external_request_id: "zapier-run-0001",
    source_occurred_at: "2026-07-14T12:00:00.000Z",
    command: { name, args },
    mode: "plan",
  };
}

Deno.test("identifier HMACs are deterministic, domain-separated, and never plain external IDs", async () => {
  const team = "T012ABC";
  const teamHash = await hashExternalIdentifier(
    IDENTIFIER_KEY,
    "slack:team",
    team,
  );
  const userHash = await hashExternalIdentifier(
    IDENTIFIER_KEY,
    "slack:user",
    team,
  );

  assertEquals(teamHash.length, 64);
  assert(/^[a-f0-9]{64}$/.test(teamHash));
  assertNotEquals(teamHash, userHash);
  assertEquals(teamHash.includes(team), false);
  await assertRejects(
    () => hashExternalIdentifier("too-short", "slack:team", team),
    ObserverRuntimeError,
    "IDENTIFIER_HMAC_KEY_INVALID",
  );
});

Deno.test("Zapier identity is key-bound, tenant-bound, principal-bound, and live-admin only", async () => {
  const { client, runtime: observer } = runtime();
  const credential = `dsk_live_${"A".repeat(32)}`;
  const identity = await observer.resolveZapierIdentity(credential);

  assertEquals(identity, {
    channel: "zapier",
    installation_id: INSTALLATION_ID,
    external_principal_id: API_KEY_ID,
    user_id: USER_ID,
    organization_id: ORGANIZATION_ID,
    organization_role: "owner",
    granted_scopes: ["campaigns:read", "system:read"],
  });
  const apiKeyQuery = client.queryLog.find((entry) =>
    entry.table === "api_keys"
  );
  assert(apiKeyQuery !== undefined);
  assertEquals(
    apiKeyQuery.filters.find((filter) => filter.column === "key_hash")?.value,
    await credentialHash(credential),
  );
  const installationQuery = client.queryLog.find((entry) =>
    entry.table === "external_control_installations"
  );
  assert(installationQuery !== undefined);
  for (
    const name of [
      "external_tenant_id_hmac",
      "external_installation_id_hmac",
      "external_route_id_hmac",
    ] as const
  ) {
    const value = installationQuery.filters.find((filter) =>
      filter.column === name
    )?.value;
    assert(typeof value === "string" && /^[a-f0-9]{64}$/.test(value));
    assertNotEquals(value, ORGANIZATION_ID);
  }
  const membershipQuery = client.queryLog.find((entry) =>
    entry.table === "organization_users"
  );
  assertEquals(membershipQuery?.filters, [
    { kind: "eq", column: "organization_id", value: ORGANIZATION_ID },
    { kind: "eq", column: "user_id", value: USER_ID },
  ]);
});

Deno.test("Zapier identity is immediately refused when its key is revoked or its live role is narrowed", async () => {
  const credential = `dsk_live_${"A".repeat(32)}`;

  const revokedClient = new FakeClient();
  revokedClient.rows.api_keys[0].revoked_at = "2026-07-14T11:00:00.000Z";
  const revoked = await runtime(revokedClient).runtime.resolveZapierIdentity(
    credential,
  );
  assertEquals(revoked, null);
  assertEquals(
    revokedClient.queryLog.some((entry) =>
      entry.table === "external_control_installations"
    ),
    false,
  );

  const malformedExpiryClient = new FakeClient();
  malformedExpiryClient.rows.api_keys[0].expires_at = "not-an-instant";
  assertEquals(
    await runtime(malformedExpiryClient).runtime.resolveZapierIdentity(
      credential,
    ),
    null,
  );

  const narrowedClient = new FakeClient();
  narrowedClient.rows.organization_users[0].role = "manager";
  await assertRejects(
    () => runtime(narrowedClient).runtime.resolveZapierIdentity(credential),
    ObserverRuntimeError,
    "LIVE_ADMIN_REQUIRED",
  );
});

Deno.test("Slack commands resolve one signed workspace, app, route, and user before the receipt claim", async () => {
  const { client, runtime: observer } = runtime();
  client.rows.external_control_installations[0].provider = "slack";
  const result = await observer.submitSlackCommand({
    team_id: "T012ABC",
    user_id: "U045DEF",
    api_app_id: "A078GHI",
    trigger_id: "13345224609.738474920.8088930838d88f008e0",
    signature_timestamp: Math.floor(FIXED_NOW.getTime() / 1_000),
    raw_payload_sha256: "c".repeat(64),
    command: wire("system.status").command,
    mode: "plan",
  });

  assertEquals(result.status, "completed");
  const installationQuery = client.queryLog.find((entry) =>
    entry.table === "external_control_installations"
  );
  assertEquals(
    installationQuery?.filters.find((filter) => filter.column === "provider")
      ?.value,
    "slack",
  );
  const principalQuery = client.queryLog.find((entry) =>
    entry.table === "external_control_principals"
  );
  const principalHash = principalQuery?.filters.find((filter) =>
    filter.column === "external_principal_id_hmac"
  )?.value;
  assert(
    typeof principalHash === "string" && /^[a-f0-9]{64}$/.test(principalHash),
  );
  assertEquals(String(principalHash).includes("U045DEF"), false);
  assertEquals(
    client.rpcCalls[0].args.p_source_occurred_at,
    "2026-07-14T12:00:00.000Z",
  );
});

Deno.test("Teams commands resolve one tenant, app, route, and user before the receipt claim", async () => {
  const { client, runtime: observer } = runtime();
  client.rows.external_control_installations[0].provider = "teams";
  const result = await observer.submitTeamsCommand({
    tenant_id: "11111111-aaaa-4aaa-8aaa-111111111111",
    bot_app_id: "33333333-bbbb-4bbb-8bbb-333333333333",
    user_id: "29:1A2B3C4D5E",
    activity_id: "teams-activity-0001",
    source_occurred_at: "2026-07-14T12:00:00.000Z",
    raw_payload_sha256: "e".repeat(64),
    command: wire("campaign.list").command,
    mode: "plan",
  });

  assertEquals(result.status, "completed");
  const installationQuery = client.queryLog.find((entry) =>
    entry.table === "external_control_installations"
  );
  assertEquals(
    installationQuery?.filters.find((filter) => filter.column === "provider")
      ?.value,
    "teams",
  );
  const principalQuery = client.queryLog.find((entry) =>
    entry.table === "external_control_principals"
  );
  const principalHash = principalQuery?.filters.find((filter) =>
    filter.column === "external_principal_id_hmac"
  )?.value;
  assert(
    typeof principalHash === "string" && /^[a-f0-9]{64}$/.test(principalHash),
  );
  assertEquals(String(principalHash).includes("29:1A2B3C4D5E"), false);
  assertEquals(
    client.rpcCalls[0].args.p_source_occurred_at,
    "2026-07-14T12:00:00.000Z",
  );
});

Deno.test("a committed observer request claims first, then returns only tenant-scoped non-PII metadata", async () => {
  const { client, runtime: observer } = runtime();
  const identity = await observer.resolveZapierIdentity(
    `dsk_live_${"A".repeat(32)}`,
  );
  assert(identity !== null);
  client.queryLog.length = 0;
  const result = await observer.submitZapierCommand({
    identity,
    raw_payload_sha256: "a".repeat(64),
    request: wire("campaign.inspect", {
      campaign_id: CAMPAIGN_ID,
      include: ["validation", "live_stats", "dispositions"],
    }),
  });

  assertEquals(result.status, "completed");
  assertEquals(result.authority, {
    contact_authorized: false,
    launch_authorized: false,
    queue_mutation_authorized: false,
    crm_write_authorized: false,
    spend_authorized: false,
  });
  assertEquals(client.rpcCalls.length, 1);
  assertEquals(
    client.rpcCalls[0].functionName,
    "claim_external_observer_command",
  );
  assertEquals(client.rpcCalls[0].args.p_organization_id, ORGANIZATION_ID);
  assertEquals(client.rpcCalls[0].args.p_installation_id, INSTALLATION_ID);
  assert(
    /^[a-f0-9]{64}$/.test(
      String(client.rpcCalls[0].args.p_external_principal_id_hmac),
    ),
  );
  const campaignQuery = client.queryLog.find((entry) =>
    entry.table === "campaigns"
  );
  assert(campaignQuery !== undefined);
  assertEquals(campaignQuery.filters, [
    { kind: "eq", column: "organization_id", value: ORGANIZATION_ID },
    { kind: "eq", column: "user_id", value: USER_ID },
    { kind: "eq", column: "id", value: CAMPAIGN_ID },
  ]);
  const encoded = JSON.stringify(result);
  assertEquals(
    /phone_number|transcript|recording_url|lead_id/.test(encoded),
    false,
  );
  assertEquals(encoded.includes("Solar Exit Intake"), true);
});

Deno.test("release inspection invokes only the service summary with the verified tenant identity", async () => {
  const { client, runtime: observer } = runtime();
  const identity = await observer.resolveZapierIdentity(
    `dsk_live_${"A".repeat(32)}`,
  );
  assert(identity !== null);
  client.queryLog.length = 0;
  const result = await observer.submitZapierCommand({
    identity,
    raw_payload_sha256: "d".repeat(64),
    request: wire("campaign.inspect", {
      campaign_id: CAMPAIGN_ID,
      include: ["release_status"],
    }),
  });

  assertEquals(client.rpcCalls.length, 2);
  assertEquals(
    client.rpcCalls[1],
    {
      functionName: "get_campaign_contact_release_observer_status",
      args: {
        p_organization_id: ORGANIZATION_ID,
        p_user_id: USER_ID,
        p_campaign_id: CAMPAIGN_ID,
      },
    },
  );
  const encoded = JSON.stringify(result);
  assertEquals(encoded.includes("current_release_present"), true);
  assertEquals(
    /phone_number|transcript|recording_url|lead_id|caller_number/.test(encoded),
    false,
  );
  assertEquals(encoded.includes('"contact_authorized":true'), false);
  assertEquals(encoded.includes('"launch_certified":true'), false);
});

Deno.test("replayed or collided events are held after the immutable receipt and never run a read query", async () => {
  const { client, runtime: observer } = runtime();
  const identity = await observer.resolveZapierIdentity(
    `dsk_live_${"A".repeat(32)}`,
  );
  assert(identity !== null);
  client.queryLog.length = 0;
  client.rpcResult = [{
    claim_id: CLAIM_ID,
    receipt_id: RECEIPT_ID,
    commit_status: "duplicate",
    decision: "held",
    reason_codes: ["EXACT_REPLAY", "OBSERVER_ONLY"],
  }];
  const result = await observer.submitZapierCommand({
    identity,
    raw_payload_sha256: "b".repeat(64),
    request: wire(),
  });

  assertEquals(result.status, "held");
  assertEquals(client.rpcCalls.length, 1);
  assertEquals(client.queryLog.length, 0);
  assertEquals(result.data, {
    execution: "not_run",
    receipt_id: RECEIPT_ID,
    commit_status: "duplicate",
    reason_codes: ["EXACT_REPLAY", "OBSERVER_ONLY"],
  });
});

Deno.test("Zapier runtime rejects a request without the stable source timestamp before a claim", async () => {
  const { client, runtime: observer } = runtime();
  const identity = await observer.resolveZapierIdentity(
    `dsk_live_${"A".repeat(32)}`,
  );
  assert(identity !== null);
  const request = wire();
  delete request.source_occurred_at;
  await assertRejects(
    () =>
      observer.submitZapierCommand({
        identity,
        raw_payload_sha256: "d".repeat(64),
        request,
      }),
    ObserverRuntimeError,
    "ZAPIER_SOURCE_TIME_REQUIRED",
  );
  assertEquals(client.rpcCalls.length, 0);
});

Deno.test("the direct R0 store always filters campaigns and calls by both tenant and user", async () => {
  const client = new FakeClient();
  const store = createObserverQueryStore(client, () => new Date(FIXED_NOW));
  const list = await store.listCampaigns({
    organization_id: ORGANIZATION_ID,
    user_id: USER_ID,
    status: "draft",
    limit: 25,
  });
  assertEquals((list as Record<string, unknown>).total, 1);
  const brief = await store.readEliteSolarBrief({
    organization_id: ORGANIZATION_ID,
    user_id: USER_ID,
  });
  assertEquals(
    (brief as Record<string, unknown>).briefing_kind,
    "elite_solar_first_pilot_operator_brief_v1",
  );
  assertEquals(
    (brief as Record<string, unknown>).authority,
    {
      contact_authorized: false,
      launch_authorized: false,
      queue_mutation_authorized: false,
      crm_write_authorized: false,
      spend_authorized: false,
    },
  );
  const pulse = await store.readEliteSolarPulse({
    organization_id: ORGANIZATION_ID,
    user_id: USER_ID,
  });
  assertEquals(
    (pulse as Record<string, unknown>).pulse_kind,
    "elite_solar_first_pilot_release_pulse_v1",
  );
  assertEquals(
    ((pulse as Record<string, unknown>).release_posture as unknown[]).length,
    1,
  );
  assertEquals(
    (pulse as Record<string, unknown>).authority,
    {
      contact_authorized: false,
      launch_authorized: false,
      queue_mutation_authorized: false,
      crm_write_authorized: false,
      spend_authorized: false,
    },
  );
  const inspect = await store.inspectCampaign({
    organization_id: ORGANIZATION_ID,
    user_id: USER_ID,
    campaign_id: CAMPAIGN_ID,
    include: ["live_stats"],
  });
  assert(typeof inspect === "object");
  for (
    const entry of client.queryLog.filter((query) =>
      ["campaigns", "call_logs"].includes(query.table)
    )
  ) {
    assertEquals(
      entry.filters.some((filter) =>
        filter.column === "organization_id" && filter.value === ORGANIZATION_ID
      ),
      true,
    );
    assertEquals(
      entry.filters.some((filter) =>
        filter.column === "user_id" && filter.value === USER_ID
      ),
      true,
    );
  }
});
