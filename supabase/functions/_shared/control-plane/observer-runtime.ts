import { authorizeCommand, createObserverResult } from "./authorization.ts";
import { hashControlIntent } from "./canonical-json.ts";
import {
  executeObserverCommand,
  type ObserverQueryStore,
} from "./observer-executor.ts";
import { parseWireCommandRequest } from "./schemas.ts";
import type {
  AuthorizedCommandIdentity,
  ControlChannel,
  ControlCommand,
  JsonObject,
  JsonValue,
  ObserverControlResult,
  OrganizationRole,
  WireCommandRequestV1,
} from "./types.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const IDENTIFIER_KEY_PATTERN = /^[A-Za-z0-9_-]{43,}$/;
const KEY_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const OBSERVER_ROLES = new Set<OrganizationRole>(["owner", "admin"]);
const OBSERVER_SCOPES = Object.freeze(["system:read", "campaigns:read"]);
const CAMPAIGN_FIELDS =
  "id,name,status,provider,agent_id,calls_per_minute,max_attempts,max_calls_per_day,calling_hours_start,calling_hours_end,timezone,created_at,updated_at";
const ELITE_SOLAR_BRIEF_NEXT_STEPS = Object.freeze([
  "Approve Elite's legal seller, service description, claims, consent disclosure, DNC, state, and recording policy.",
  "Run the signed direct-import shadow with exact consent evidence; GHL is optional.",
  "Bind the tenant-owned Retell agent, LLM, webhook, and company-owned test number outside the browser.",
  "Complete twenty company-owned-phone lifecycles before requesting a five-person human canary.",
]);

type Row = Record<string, unknown>;
type QueryResult = {
  data: unknown;
  error: unknown | null;
  count?: number | null;
};

/** Minimal structural contract shared by the real Supabase client and fakes. */
export interface ObserverRuntimeQuery extends PromiseLike<QueryResult> {
  select(columns: string, options?: { count?: "exact" }): ObserverRuntimeQuery;
  eq(column: string, value: unknown): ObserverRuntimeQuery;
  gte(column: string, value: string): ObserverRuntimeQuery;
  order(
    column: string,
    options?: { ascending?: boolean },
  ): ObserverRuntimeQuery;
  limit(count: number): ObserverRuntimeQuery;
  range(from: number, to: number): ObserverRuntimeQuery;
  maybeSingle(): Promise<QueryResult>;
}

export interface ObserverRuntimeClient {
  from(table: string): ObserverRuntimeQuery;
  rpc(functionName: string, args: Row): Promise<QueryResult>;
}

export interface ObserverRuntimeConfig {
  client: ObserverRuntimeClient;
  /** URL-safe, 256-bit-or-stronger HMAC secret; never stored in SQL. */
  identifier_hmac_key: string;
  identifier_key_version: string;
  now?: () => Date;
}

export interface SlackObserverSubmission {
  team_id: string;
  user_id: string;
  api_app_id?: string;
  trigger_id?: string;
  signature_timestamp: number;
  raw_payload_sha256: string;
  command: ControlCommand;
  mode: "plan";
}

export interface ZapierObserverSubmission {
  identity: AuthorizedCommandIdentity;
  raw_payload_sha256: string;
  request: WireCommandRequestV1;
}

export interface McpObserverSubmission {
  identity: AuthorizedCommandIdentity;
  raw_payload_sha256: string;
  request: WireCommandRequestV1;
}

export interface TeamsObserverSubmission {
  tenant_id: string;
  bot_app_id: string;
  user_id: string;
  activity_id: string;
  source_occurred_at: string;
  raw_payload_sha256: string;
  command: ControlCommand;
  mode: "plan";
}

export class ObserverRuntimeError extends Error {
  readonly code: string;

  constructor(code: string, message = code) {
    super(message);
    this.code = code;
  }
}

function asRecord(value: unknown, code: string): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ObserverRuntimeError(code);
  }
  return value as Row;
}

function asRows(value: unknown, code: string): Row[] {
  if (
    !Array.isArray(value) ||
    value.some((row) => !row || typeof row !== "object" || Array.isArray(row))
  ) {
    throw new ObserverRuntimeError(code);
  }
  return value as Row[];
}

function expectResult(result: QueryResult, code: string): unknown {
  if (result.error !== null) throw new ObserverRuntimeError(code);
  return result.data;
}

function expectSingle(result: QueryResult, code: string): Row {
  return asRecord(expectResult(result, code), code);
}

function expectRpcRow(result: QueryResult, code: string): Row {
  const value = expectResult(result, code);
  if (Array.isArray(value)) {
    if (value.length !== 1) throw new ObserverRuntimeError(code);
    return asRecord(value[0], code);
  }
  return asRecord(value, code);
}

function canonicalUuid(value: unknown, code: string): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new ObserverRuntimeError(code);
  }
  return value;
}

function sha256(value: unknown, code: string): string {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw new ObserverRuntimeError(code);
  }
  return value;
}

function safeExternalIdentifier(value: unknown, code: string): string {
  if (
    typeof value !== "string" || value.length < 1 || value.length > 256 ||
    !/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(value)
  ) {
    throw new ObserverRuntimeError(code);
  }
  return value;
}

function runtimeConfig(
  config: ObserverRuntimeConfig,
): Required<ObserverRuntimeConfig> {
  if (!IDENTIFIER_KEY_PATTERN.test(config.identifier_hmac_key)) {
    throw new ObserverRuntimeError("IDENTIFIER_HMAC_KEY_INVALID");
  }
  if (!KEY_VERSION_PATTERN.test(config.identifier_key_version)) {
    throw new ObserverRuntimeError("IDENTIFIER_KEY_VERSION_INVALID");
  }
  return { ...config, now: config.now ?? (() => new Date()) };
}

function role(value: unknown, code: string): OrganizationRole {
  if (
    value !== "member" && value !== "manager" && value !== "admin" &&
    value !== "owner"
  ) {
    throw new ObserverRuntimeError(code);
  }
  return value;
}

function stringArray(value: unknown, code: string): string[] {
  if (
    !Array.isArray(value) ||
    value.some((item) =>
      typeof item !== "string" || !/^[a-z]+(?::[a-z]+)?$/.test(item)
    )
  ) {
    throw new ObserverRuntimeError(code);
  }
  return [...new Set(value)].sort();
}

function base64urlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(
    /=+$/g,
    "",
  );
}

function base64urlDecode(value: string): string {
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(value)) {
    throw new ObserverRuntimeError("CURSOR_INVALID");
  }
  try {
    const padded = value.replaceAll("-", "+").replaceAll("_", "/") +
      "=".repeat((4 - value.length % 4) % 4);
    const binary = atob(padded);
    return new TextDecoder("utf-8", { fatal: true }).decode(
      Uint8Array.from(binary, (character) => character.charCodeAt(0)),
    );
  } catch {
    throw new ObserverRuntimeError("CURSOR_INVALID");
  }
}

function decodeCampaignCursor(value: string | undefined): number {
  if (value === undefined) return 0;
  try {
    const parsed = JSON.parse(base64urlDecode(value)) as unknown;
    const record = asRecord(parsed, "CURSOR_INVALID");
    if (
      Object.keys(record).length !== 2 || record.v !== 1 ||
      !Number.isSafeInteger(record.o) || Number(record.o) < 0 ||
      Number(record.o) > 10_000
    ) {
      throw new ObserverRuntimeError("CURSOR_INVALID");
    }
    return Number(record.o);
  } catch (error) {
    if (error instanceof ObserverRuntimeError) throw error;
    throw new ObserverRuntimeError("CURSOR_INVALID");
  }
}

function campaignCursor(offset: number): string {
  return base64urlEncode(JSON.stringify({ v: 1, o: offset }));
}

/** HMAC values are the only external identifiers that cross into SQL. */
export async function hashExternalIdentifier(
  identifierKey: string,
  namespace: string,
  value: string,
): Promise<string> {
  if (!IDENTIFIER_KEY_PATTERN.test(identifierKey)) {
    throw new ObserverRuntimeError("IDENTIFIER_HMAC_KEY_INVALID");
  }
  const safeNamespace = safeExternalIdentifier(
    namespace,
    "IDENTIFIER_NAMESPACE_INVALID",
  );
  const safeValue = safeExternalIdentifier(value, "IDENTIFIER_VALUE_INVALID");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(identifierKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`${safeNamespace}\u0000${safeValue}`),
    ),
  );
  return [...signature].map((byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function sanitizedCampaign(row: Row): JsonObject {
  const id = canonicalUuid(row.id, "CAMPAIGN_ROW_INVALID");
  const text = (key: string, maximum: number): string | null => {
    const value = row[key];
    if (value === null || value === undefined) return null;
    if (typeof value !== "string" || value.length > maximum) {
      throw new ObserverRuntimeError("CAMPAIGN_ROW_INVALID");
    }
    return value;
  };
  const integer = (key: string): number | null => {
    const value = row[key];
    if (value === null || value === undefined) return null;
    if (!Number.isSafeInteger(value)) {
      throw new ObserverRuntimeError("CAMPAIGN_ROW_INVALID");
    }
    return Number(value);
  };
  return {
    id,
    name: text("name", 120),
    status: text("status", 32),
    provider: text("provider", 32),
    agent_id: text("agent_id", 256),
    calls_per_minute: integer("calls_per_minute"),
    max_attempts: integer("max_attempts"),
    max_calls_per_day: integer("max_calls_per_day"),
    calling_hours_start: text("calling_hours_start", 8),
    calling_hours_end: text("calling_hours_end", 8),
    timezone: text("timezone", 128),
    created_at: text("created_at", 40),
    updated_at: text("updated_at", 40),
  };
}

function countStrings(rows: Row[], key: string): JsonObject {
  const counts: Record<string, number> = Object.create(null);
  for (const row of rows) {
    const value = row[key];
    if (typeof value === "string" && value.length > 0 && value.length <= 128) {
      counts[value] = (counts[value] ?? 0) + 1;
    }
  }
  return counts;
}

function sanitizedReleaseStatus(row: Row): JsonObject {
  const state = safeExternalIdentifier(
    row.release_state,
    "CAMPAIGN_RELEASE_STATUS_INVALID",
  );
  if (
    ![
      "no_release",
      "current_release_present",
      "current_release_cohort_invalid",
      "latest_release_expired_or_revoked",
    ].includes(state)
  ) {
    throw new ObserverRuntimeError("CAMPAIGN_RELEASE_STATUS_INVALID");
  }
  const stage = row.release_stage;
  if (
    stage !== null && ![
      "canary_5",
      "canary_20",
      "canary_50",
      "normal",
    ].includes(String(stage))
  ) {
    throw new ObserverRuntimeError("CAMPAIGN_RELEASE_STATUS_INVALID");
  }
  const expiresAt = row.release_expires_at;
  if (
    expiresAt !== null && (
      typeof expiresAt !== "string" || expiresAt.length < 20 ||
      expiresAt.length > 40 || !Number.isFinite(Date.parse(expiresAt))
    )
  ) {
    throw new ObserverRuntimeError("CAMPAIGN_RELEASE_STATUS_INVALID");
  }
  const limit = row.cohort_limit;
  if (
    limit !== null &&
    (!Number.isSafeInteger(limit) || Number(limit) < 1 || Number(limit) > 1_000)
  ) {
    throw new ObserverRuntimeError("CAMPAIGN_RELEASE_STATUS_INVALID");
  }
  const members = row.cohort_member_count;
  if (
    !Number.isSafeInteger(members) || Number(members) < 0 ||
    Number(members) > 1_000
  ) {
    throw new ObserverRuntimeError("CAMPAIGN_RELEASE_STATUS_INVALID");
  }
  if (row.final_contact_evaluation_required !== true) {
    throw new ObserverRuntimeError("CAMPAIGN_RELEASE_STATUS_INVALID");
  }
  return {
    kind: "server_release_summary_only",
    release_state: state,
    release_stage: stage === null ? null : String(stage),
    release_expires_at: expiresAt === null ? null : String(expiresAt),
    cohort_limit: limit === null ? null : Number(limit),
    cohort_member_count: Number(members),
    final_contact_evaluation_required: true,
    contact_authorized: false,
    launch_certified: false,
  };
}

function eliteSolarOperatorBeat(
  releasePosture: Array<{ release_status: JsonObject }>,
): JsonObject {
  const releaseStates = releasePosture.map((entry) =>
    String(entry.release_status.release_state)
  );
  const stagesVisible = [
    ...new Set(
      releasePosture
        .map((entry) => entry.release_status.release_stage)
        .filter((stage): stage is string => typeof stage === "string"),
    ),
  ].sort();
  const currentReleaseCount =
    releaseStates.filter((state) => state === "current_release_present").length;
  const invalidOrExpiredCount =
    releaseStates.filter((state) =>
      state === "current_release_cohort_invalid" ||
      state === "latest_release_expired_or_revoked"
    ).length;

  let headline =
    "Elite Solar has no observed campaign metadata yet; the pilot remains review-only.";
  let recommendedFocus =
    "Verify the non-active Elite draft, then begin the signed direct-import zero-contact shadow.";
  if (invalidOrExpiredCount > 0) {
    headline =
      "An Elite release record is invalid, expired, or revoked. Contact remains locked.";
    recommendedFocus =
      "Resolve the exact release evidence and cohort boundary before any provider or contact review.";
  } else if (currentReleaseCount > 0) {
    headline =
      "A bounded Elite release record is visible, but contact remains locked pending final per-call evaluation.";
    recommendedFocus =
      "Review the exact evidence chain and keep the cohort human-approved; a release record never bypasses consent or provider checks.";
  } else if (releasePosture.length > 0) {
    headline =
      "No current Elite release record is present. The pilot remains review-only.";
    recommendedFocus =
      "Complete the signed source shadow and provider-binding evidence before requesting any cohort release.";
  }

  return {
    kind: "elite_solar_operator_morning_beat_v1",
    headline,
    recommended_focus: recommendedFocus,
    campaign_records_observed: releasePosture.length,
    current_release_records_observed: currentReleaseCount,
    invalid_or_expired_release_records_observed: invalidOrExpiredCount,
    release_stages_visible: stagesVisible,
    direct_import_primary: true,
    gohighlevel_required: false,
    operator_lanes: {
      unified_preflight: "available_configuration_required",
      retell_voice_readiness: "available_configuration_required",
      instantly_mailgun_email_release:
        "signed_no_send_candidate_available_provider_connections_not_established",
    },
    local_operator_commands: [
      "npm run campaign:solar-exit:operator-preflight",
      "npm run retell:solar:readiness",
      "npm run email:elite-solar:release-candidate -- --template",
      "npm run email:elite-solar:create-source-proof -- --template",
    ],
    contact_authorized: false,
    launch_authorized: false,
  };
}

/**
 * The actual R0 read model. It selects only tenant-scoped operational metadata:
 * no lead PII, phone numbers, transcripts, messages, callbacks, or provider calls.
 */
export function createObserverQueryStore(
  client: ObserverRuntimeClient,
  now: () => Date = () => new Date(),
): ObserverQueryStore {
  return {
    async readSystemStatus(context) {
      const result = await client.from("campaigns")
        .select("status")
        .eq("organization_id", context.organization_id)
        .eq("user_id", context.user_id)
        .limit(1_000);
      const rows = asRows(
        expectResult(result, "SYSTEM_STATUS_QUERY_FAILED"),
        "SYSTEM_STATUS_QUERY_FAILED",
      );
      return {
        source: "tenant_scoped_read_model",
        observed_at: now().toISOString(),
        window_hours: context.window_hours,
        campaign_count: rows.length,
        campaigns_by_status: countStrings(rows, "status"),
        authority: {
          contact_authorized: false,
          launch_authorized: false,
          queue_mutation_authorized: false,
          crm_write_authorized: false,
          spend_authorized: false,
        },
      };
    },

    async readEliteSolarBrief(context) {
      const result = await client.from("campaigns")
        .select(CAMPAIGN_FIELDS)
        .eq("organization_id", context.organization_id)
        .eq("user_id", context.user_id)
        .order("created_at", { ascending: false })
        .limit(5);
      const rows = asRows(
        expectResult(result, "ELITE_SOLAR_BRIEF_QUERY_FAILED"),
        "ELITE_SOLAR_BRIEF_QUERY_FAILED",
      );
      return {
        briefing_kind: "elite_solar_first_pilot_operator_brief_v1",
        source: "tenant_scoped_read_model",
        observed_at: now().toISOString(),
        campaign_metadata_scope: "five_most_recent_tenant_campaigns",
        recent_campaigns: rows.map(sanitizedCampaign),
        source_lane: {
          primary: "signed_direct_import",
          gohighlevel_required: false,
          direct_import_contact_authorized: false,
          direct_import_provider_invocation_authorized: false,
        },
        next_human_actions: [...ELITE_SOLAR_BRIEF_NEXT_STEPS],
        authority: {
          contact_authorized: false,
          launch_authorized: false,
          queue_mutation_authorized: false,
          crm_write_authorized: false,
          spend_authorized: false,
        },
      };
    },

    async readEliteSolarPulse(context) {
      const result = await client.from("campaigns")
        .select(CAMPAIGN_FIELDS)
        .eq("organization_id", context.organization_id)
        .eq("user_id", context.user_id)
        .order("created_at", { ascending: false })
        .limit(5);
      const rows = asRows(
        expectResult(result, "ELITE_SOLAR_PULSE_QUERY_FAILED"),
        "ELITE_SOLAR_PULSE_QUERY_FAILED",
      );
      const campaigns = rows.map(sanitizedCampaign);
      const release_posture = await Promise.all(
        campaigns.map(async (campaign) => {
          const campaignId = String(campaign.id);
          const releaseStatusResult = await client.rpc(
            "get_campaign_contact_release_observer_status",
            {
              p_organization_id: context.organization_id,
              p_user_id: context.user_id,
              p_campaign_id: campaignId,
            },
          );
          return {
            campaign_id: campaignId,
            campaign_name: campaign.name,
            campaign_status: campaign.status,
            provider: campaign.provider,
            release_status: sanitizedReleaseStatus(
              expectRpcRow(
                releaseStatusResult,
                "ELITE_SOLAR_PULSE_RELEASE_QUERY_FAILED",
              ),
            ),
          };
        }),
      );
      return {
        pulse_kind: "elite_solar_first_pilot_release_pulse_v1",
        source: "tenant_scoped_read_model",
        observed_at: now().toISOString(),
        campaign_metadata_scope: "five_most_recent_tenant_campaigns",
        operator_beat: eliteSolarOperatorBeat(release_posture),
        release_posture,
        source_lane: {
          primary: "signed_direct_import",
          gohighlevel_required: false,
          direct_import_contact_authorized: false,
          direct_import_provider_invocation_authorized: false,
        },
        next_human_actions: [...ELITE_SOLAR_BRIEF_NEXT_STEPS],
        caveats: [
          "Release posture is server metadata only; it does not evaluate consent, DNC, jurisdiction, provider binding, or call eligibility.",
          "A current release record never grants contact authority; final per-call evaluation remains mandatory.",
        ],
        authority: {
          contact_authorized: false,
          launch_authorized: false,
          queue_mutation_authorized: false,
          crm_write_authorized: false,
          spend_authorized: false,
        },
      };
    },

    async listCampaigns(context) {
      const offset = decodeCampaignCursor(context.cursor);
      const limit = Math.min(Math.max(context.limit, 1), 100);
      let query = client.from("campaigns")
        .select(CAMPAIGN_FIELDS, { count: "exact" })
        .eq("organization_id", context.organization_id)
        .eq("user_id", context.user_id)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (context.status !== undefined) {
        query = query.eq("status", context.status);
      }
      const result = await query;
      const rows = asRows(
        expectResult(result, "CAMPAIGN_LIST_QUERY_FAILED"),
        "CAMPAIGN_LIST_QUERY_FAILED",
      );
      const total = typeof result.count === "number" && result.count >= 0
        ? result.count
        : null;
      const nextOffset = offset + rows.length;
      return {
        source: "tenant_scoped_read_model",
        campaigns: rows.map(sanitizedCampaign),
        limit,
        offset,
        total,
        next_cursor: total !== null && nextOffset < total
          ? campaignCursor(nextOffset)
          : null,
      };
    },

    async inspectCampaign(context) {
      const campaignResult = await client.from("campaigns")
        .select(CAMPAIGN_FIELDS)
        .eq("organization_id", context.organization_id)
        .eq("user_id", context.user_id)
        .eq("id", context.campaign_id)
        .maybeSingle();
      const campaign = sanitizedCampaign(
        expectSingle(campaignResult, "CAMPAIGN_NOT_FOUND"),
      );
      const include = new Set(context.include);
      const result: Record<string, JsonValue> = {
        source: "tenant_scoped_read_model",
        campaign,
      };

      if (include.has("validation")) {
        result.validation = {
          kind: "configuration_inventory_only",
          launch_certified: false,
          note:
            "R0 reads do not evaluate consent, DNC, jurisdiction, provider binding, or launch evidence.",
        };
      }
      if (include.has("release_status")) {
        const releaseStatusResult = await client.rpc(
          "get_campaign_contact_release_observer_status",
          {
            p_organization_id: context.organization_id,
            p_user_id: context.user_id,
            p_campaign_id: context.campaign_id,
          },
        );
        result.release_status = sanitizedReleaseStatus(
          expectRpcRow(
            releaseStatusResult,
            "CAMPAIGN_RELEASE_STATUS_QUERY_FAILED",
          ),
        );
      }
      if (include.has("live_stats")) {
        const cutoff = new Date(now().getTime() - 24 * 60 * 60 * 1_000)
          .toISOString();
        const callsResult = await client.from("call_logs")
          .select("status", { count: "exact" })
          .eq("organization_id", context.organization_id)
          .eq("user_id", context.user_id)
          .eq("campaign_id", context.campaign_id)
          .gte("created_at", cutoff)
          .limit(1_000);
        const calls = asRows(
          expectResult(callsResult, "CAMPAIGN_STATS_QUERY_FAILED"),
          "CAMPAIGN_STATS_QUERY_FAILED",
        );
        result.live_stats = {
          kind: "last_24_hours_metadata_only",
          observed_calls: typeof callsResult.count === "number"
            ? callsResult.count
            : calls.length,
          calls_by_status: countStrings(calls, "status"),
          launch_certified: false,
        };
      }
      if (include.has("dispositions")) {
        const dispositionsResult = await client.from("call_logs")
          .select("auto_disposition")
          .eq("organization_id", context.organization_id)
          .eq("user_id", context.user_id)
          .eq("campaign_id", context.campaign_id)
          .order("created_at", { ascending: false })
          .limit(500);
        const dispositions = asRows(
          expectResult(
            dispositionsResult,
            "CAMPAIGN_DISPOSITIONS_QUERY_FAILED",
          ),
          "CAMPAIGN_DISPOSITIONS_QUERY_FAILED",
        );
        result.dispositions = {
          kind: "recent_non_pii_metadata_only",
          values: countStrings(dispositions, "auto_disposition"),
          launch_certified: false,
        };
      }
      return result;
    },
  };
}

type Installation = {
  id: string;
  organization_id: string;
  provider: ControlChannel;
};

type Principal = {
  id: string;
  user_id: string;
};

function installationFromRow(row: Row, provider: ControlChannel): Installation {
  const actualProvider = row.provider;
  if (actualProvider !== provider) {
    throw new ObserverRuntimeError("INSTALLATION_NOT_ACTIVE");
  }
  return {
    id: canonicalUuid(row.id, "INSTALLATION_NOT_ACTIVE"),
    organization_id: canonicalUuid(
      row.organization_id,
      "INSTALLATION_NOT_ACTIVE",
    ),
    provider,
  };
}

function principalFromRow(row: Row): Principal {
  return {
    id: canonicalUuid(row.id, "PRINCIPAL_NOT_ACTIVE"),
    user_id: canonicalUuid(row.user_id, "PRINCIPAL_NOT_ACTIVE"),
  };
}

export interface ExternalObserverRuntime {
  readonly store: ObserverQueryStore;
  resolveZapierIdentity(
    credential: string,
  ): Promise<AuthorizedCommandIdentity | null>;
  resolveMcpIdentity(
    credential: string,
  ): Promise<AuthorizedCommandIdentity | null>;
  submitZapierCommand(
    submission: ZapierObserverSubmission,
  ): Promise<ObserverControlResult>;
  submitMcpCommand(
    submission: McpObserverSubmission,
  ): Promise<ObserverControlResult>;
  submitTeamsCommand(
    submission: TeamsObserverSubmission,
  ): Promise<ObserverControlResult>;
  submitSlackCommand(
    submission: SlackObserverSubmission,
  ): Promise<ObserverControlResult>;
}

/**
 * Trusted runtime for the eventual Slack/Zapier deployment. Construction is
 * pure; no installation, principal, credential, provider, CRM, or contact
 * data is created. The public adapters remain hard-disabled until deployment
 * and environment provisioning are independently reviewed.
 */
export function createExternalObserverRuntime(
  initialConfig: ObserverRuntimeConfig,
): ExternalObserverRuntime {
  const config = runtimeConfig(initialConfig);
  const store = createObserverQueryStore(config.client, config.now);

  const identifier = (namespace: string, value: string) =>
    hashExternalIdentifier(config.identifier_hmac_key, namespace, value);

  async function loadInstallation(
    provider: ControlChannel,
    tenantHash: string,
    installationHash: string,
    routeHash: string,
  ): Promise<Installation> {
    const result = await config.client.from("external_control_installations")
      .select("id,organization_id,provider")
      .eq("provider", provider)
      .eq("external_tenant_id_hmac", tenantHash)
      .eq("external_installation_id_hmac", installationHash)
      .eq("external_route_id_hmac", routeHash)
      .eq("identifier_key_version", config.identifier_key_version)
      .eq("status", "active")
      .maybeSingle();
    return installationFromRow(
      expectSingle(result, "INSTALLATION_NOT_ACTIVE"),
      provider,
    );
  }

  async function loadPrincipal(
    installation: Installation,
    externalPrincipalHash: string,
  ): Promise<Principal> {
    const result = await config.client.from("external_control_principals")
      .select("id,user_id")
      .eq("installation_id", installation.id)
      .eq("organization_id", installation.organization_id)
      .eq("external_principal_id_hmac", externalPrincipalHash)
      .eq("identifier_key_version", config.identifier_key_version)
      .eq("status", "active")
      .maybeSingle();
    return principalFromRow(expectSingle(result, "PRINCIPAL_NOT_ACTIVE"));
  }

  async function loadObserverRole(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationRole> {
    const result = await config.client.from("organization_users")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .maybeSingle();
    const membership = expectSingle(result, "LIVE_ADMIN_REQUIRED");
    const currentRole = role(membership.role, "LIVE_ADMIN_REQUIRED");
    if (!OBSERVER_ROLES.has(currentRole)) {
      throw new ObserverRuntimeError("LIVE_ADMIN_REQUIRED");
    }
    return currentRole;
  }

  async function resolveApiKeyObserverCredential(
    provider: "zapier" | "mcp",
    credential: string,
  ): Promise<AuthorizedCommandIdentity | null> {
    if (!/^dsk_live_[A-Za-z0-9]{32}$/.test(credential)) return null;
    const credentialHash = await (async () => {
      const digest = new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(credential),
        ),
      );
      return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join(
        "",
      );
    })();
    const keyResult = await config.client.from("api_keys")
      .select("id,user_id,organization_id,scopes,revoked_at,expires_at")
      .eq("key_hash", credentialHash)
      .maybeSingle();
    if (keyResult.error !== null || keyResult.data === null) return null;
    const apiKey = asRecord(keyResult.data, "API_KEY_INVALID");
    if (apiKey.revoked_at !== null || apiKey.organization_id === null) {
      return null;
    }
    if (apiKey.expires_at !== null) {
      const expiresAt = typeof apiKey.expires_at === "string"
        ? Date.parse(apiKey.expires_at)
        : Number.NaN;
      if (!Number.isFinite(expiresAt) || expiresAt <= config.now().getTime()) {
        return null;
      }
    }
    const apiKeyId = canonicalUuid(apiKey.id, "API_KEY_INVALID");
    const userId = canonicalUuid(apiKey.user_id, "API_KEY_INVALID");
    const organizationId = canonicalUuid(
      apiKey.organization_id,
      "API_KEY_INVALID",
    );
    const scopes = stringArray(apiKey.scopes, "API_KEY_INVALID");
    const installation = await loadInstallation(
      provider,
      await identifier(`${provider}:organization`, organizationId),
      await identifier(`${provider}:api-key`, apiKeyId),
      await identifier(`${provider}:route`, "observer-v1"),
    );
    if (installation.organization_id !== organizationId) {
      throw new ObserverRuntimeError("TENANT_BINDING_MISMATCH");
    }
    const principal = await loadPrincipal(
      installation,
      await identifier(`${provider}:api-key`, apiKeyId),
    );
    if (principal.user_id !== userId) {
      throw new ObserverRuntimeError("PRINCIPAL_BINDING_MISMATCH");
    }
    const organizationRole = await loadObserverRole(organizationId, userId);
    return {
      channel: provider,
      installation_id: installation.id,
      external_principal_id: apiKeyId,
      user_id: userId,
      organization_id: organizationId,
      organization_role: organizationRole,
      granted_scopes: scopes,
    };
  }

  async function resolveZapierCredential(
    credential: string,
  ): Promise<AuthorizedCommandIdentity | null> {
    return await resolveApiKeyObserverCredential("zapier", credential);
  }

  async function resolveMcpCredential(
    credential: string,
  ): Promise<AuthorizedCommandIdentity | null> {
    return await resolveApiKeyObserverCredential("mcp", credential);
  }

  async function claimAndExecute(input: {
    identity: AuthorizedCommandIdentity;
    externalPrincipalHash: string;
    externalEventId: string;
    rawPayloadSha256: string;
    sourceOccurredAt: string;
    request: WireCommandRequestV1;
  }): Promise<ObserverControlResult> {
    const request = parseWireCommandRequest(input.request);
    authorizeCommand(request.command.name, {
      profile: "observer",
      role: input.identity.organization_role,
      scopes: input.identity.granted_scopes,
    });
    const intentSha256 = await hashControlIntent({
      organization_id: input.identity.organization_id,
      user_id: input.identity.user_id,
      channel: input.identity.channel,
      installation_id: input.identity.installation_id,
      command: request.command,
      mode: request.mode,
    });
    const claimResult = await config.client.rpc(
      "claim_external_observer_command",
      {
        p_organization_id: input.identity.organization_id,
        p_installation_id: input.identity.installation_id,
        p_external_principal_id_hmac: input.externalPrincipalHash,
        p_external_event_id_hmac: await identifier(
          `${input.identity.channel}:event`,
          input.externalEventId,
        ),
        p_payload_sha256: sha256(
          input.rawPayloadSha256,
          "RAW_PAYLOAD_HASH_INVALID",
        ),
        p_intent_sha256: intentSha256,
        p_command_name: request.command.name,
        p_command_schema_version: request.version,
        p_source_occurred_at: input.sourceOccurredAt,
      },
    );
    const claim = expectRpcRow(claimResult, "OBSERVER_CLAIM_FAILED");
    const claimId = canonicalUuid(claim.claim_id, "OBSERVER_CLAIM_FAILED");
    const receiptId = canonicalUuid(claim.receipt_id, "OBSERVER_CLAIM_FAILED");
    const commitStatus = claim.commit_status;
    const reasonCodes = Array.isArray(claim.reason_codes)
      ? claim.reason_codes.filter((value): value is string =>
        typeof value === "string"
      ).sort()
      : [];
    if (commitStatus !== "committed") {
      return createObserverResult({
        command_id: claimId,
        command_name: request.command.name,
        status: "held",
        data: {
          execution: "not_run",
          receipt_id: receiptId,
          commit_status: typeof commitStatus === "string"
            ? commitStatus
            : "unknown",
          reason_codes: reasonCodes,
        },
      });
    }
    const execution = await executeObserverCommand({
      command_id: claimId,
      identity: input.identity,
      request,
      store,
    });
    return createObserverResult({
      command_id: execution.result.command_id,
      command_name: execution.result.command_name,
      status: execution.result.status,
      data: {
        receipt_id: receiptId,
        commit_status: "committed",
        reason_codes: reasonCodes,
        result: execution.result.data,
      },
    });
  }

  return {
    store,

    resolveZapierIdentity: resolveZapierCredential,
    resolveMcpIdentity: resolveMcpCredential,

    async submitZapierCommand(submission) {
      const identity = submission.identity;
      if (identity.channel !== "zapier") {
        throw new ObserverRuntimeError("CHANNEL_MISMATCH");
      }
      const externalPrincipalHash = await identifier(
        "zapier:api-key",
        canonicalUuid(
          identity.external_principal_id,
          "ZAPIER_PRINCIPAL_INVALID",
        ),
      );
      return await claimAndExecute({
        identity,
        externalPrincipalHash,
        externalEventId: safeExternalIdentifier(
          submission.request.external_request_id,
          "ZAPIER_EVENT_ID_INVALID",
        ),
        rawPayloadSha256: submission.raw_payload_sha256,
        sourceOccurredAt: submission.request.source_occurred_at ?? (() => {
          throw new ObserverRuntimeError("ZAPIER_SOURCE_TIME_REQUIRED");
        })(),
        request: submission.request,
      });
    },

    async submitMcpCommand(submission) {
      const identity = submission.identity;
      if (identity.channel !== "mcp") {
        throw new ObserverRuntimeError("CHANNEL_MISMATCH");
      }
      const externalPrincipalHash = await identifier(
        "mcp:api-key",
        canonicalUuid(
          identity.external_principal_id,
          "MCP_PRINCIPAL_INVALID",
        ),
      );
      return await claimAndExecute({
        identity,
        externalPrincipalHash,
        externalEventId: safeExternalIdentifier(
          submission.request.external_request_id,
          "MCP_EVENT_ID_INVALID",
        ),
        rawPayloadSha256: submission.raw_payload_sha256,
        sourceOccurredAt: submission.request.source_occurred_at ?? (() => {
          throw new ObserverRuntimeError("MCP_SOURCE_TIME_REQUIRED");
        })(),
        request: submission.request,
      });
    },

    async submitTeamsCommand(submission) {
      const tenantId = safeExternalIdentifier(
        submission.tenant_id,
        "TEAMS_TENANT_ID_INVALID",
      );
      const appId = safeExternalIdentifier(
        submission.bot_app_id,
        "TEAMS_APP_ID_INVALID",
      );
      const userId = safeExternalIdentifier(
        submission.user_id,
        "TEAMS_USER_ID_INVALID",
      );
      const activityId = safeExternalIdentifier(
        submission.activity_id,
        "TEAMS_ACTIVITY_ID_INVALID",
      );
      const installation = await loadInstallation(
        "teams",
        await identifier("teams:tenant", tenantId),
        await identifier("teams:app", appId),
        await identifier("teams:route", "observer-v1"),
      );
      const externalPrincipalHash = await identifier("teams:user", userId);
      const principal = await loadPrincipal(
        installation,
        externalPrincipalHash,
      );
      const organizationRole = await loadObserverRole(
        installation.organization_id,
        principal.user_id,
      );
      const identity: AuthorizedCommandIdentity = {
        channel: "teams",
        installation_id: installation.id,
        // The authenticated Teams user ID remains only in the keyed HMAC used
        // by the immutable claim boundary; the binding row is canonical.
        external_principal_id: principal.id,
        user_id: principal.user_id,
        organization_id: installation.organization_id,
        organization_role: organizationRole,
        granted_scopes: [...OBSERVER_SCOPES],
      };
      const request = parseWireCommandRequest({
        version: "control.command.v1",
        external_request_id: `teams:${activityId}`,
        source_occurred_at: submission.source_occurred_at,
        command: submission.command,
        mode: submission.mode,
      });
      if (request.source_occurred_at === undefined) {
        throw new ObserverRuntimeError("TEAMS_SOURCE_TIME_REQUIRED");
      }
      return await claimAndExecute({
        identity,
        externalPrincipalHash,
        externalEventId: activityId,
        rawPayloadSha256: submission.raw_payload_sha256,
        sourceOccurredAt: request.source_occurred_at,
        request,
      });
    },

    async submitSlackCommand(submission) {
      const teamId = safeExternalIdentifier(
        submission.team_id,
        "SLACK_TEAM_ID_INVALID",
      );
      const userId = safeExternalIdentifier(
        submission.user_id,
        "SLACK_USER_ID_INVALID",
      );
      const appId = safeExternalIdentifier(
        submission.api_app_id,
        "SLACK_APP_ID_REQUIRED",
      );
      const triggerId = submission.trigger_id === undefined
        ? submission.raw_payload_sha256
        : safeExternalIdentifier(
          submission.trigger_id,
          "SLACK_EVENT_ID_INVALID",
        );
      const installation = await loadInstallation(
        "slack",
        await identifier("slack:team", teamId),
        await identifier("slack:app", appId),
        // This is the canonical route token, not a user-supplied path. The
        // HTTP adapter independently requires the exact `/dial-smart` path.
        await identifier("slack:route", "dial-smart"),
      );
      const externalPrincipalHash = await identifier("slack:user", userId);
      const principal = await loadPrincipal(
        installation,
        externalPrincipalHash,
      );
      const organizationRole = await loadObserverRole(
        installation.organization_id,
        principal.user_id,
      );
      const identity: AuthorizedCommandIdentity = {
        channel: "slack",
        installation_id: installation.id,
        // The binding record is a canonical UUID; the actual Slack user ID is
        // retained only as the keyed HMAC passed to the claim RPC.
        external_principal_id: principal.id,
        user_id: principal.user_id,
        organization_id: installation.organization_id,
        organization_role: organizationRole,
        granted_scopes: [...OBSERVER_SCOPES],
      };
      if (!Number.isSafeInteger(submission.signature_timestamp)) {
        throw new ObserverRuntimeError("SLACK_TIMESTAMP_INVALID");
      }
      const occurredAt = new Date(submission.signature_timestamp * 1_000);
      if (!Number.isFinite(occurredAt.getTime())) {
        throw new ObserverRuntimeError("SLACK_TIMESTAMP_INVALID");
      }
      return await claimAndExecute({
        identity,
        externalPrincipalHash,
        externalEventId: triggerId,
        rawPayloadSha256: submission.raw_payload_sha256,
        sourceOccurredAt: occurredAt.toISOString(),
        request: {
          version: "control.command.v1",
          external_request_id: `slack:${triggerId}`,
          command: submission.command,
          mode: submission.mode,
        },
      });
    },
  };
}
