/**
 * Strict parser and RPC wrapper for the final campaign-contact release gate.
 * A malformed, missing, or denied database response never becomes permission
 * to invoke a voice provider.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PROVIDER_IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const RELEASE_STAGES = new Set([
  "canary_5",
  "canary_20",
  "canary_50",
  "normal",
]);
type ReleaseStage = "canary_5" | "canary_20" | "canary_50" | "normal";
const DENIAL_REASONS = new Set([
  "CAMPAIGN_RELEASE_NOT_FOUND",
  "CAMPAIGN_RELEASE_EXPIRED_OR_REVOKED",
  "CAMPAIGN_RELEASE_IDENTITY_MISMATCH",
  "CAMPAIGN_RELEASE_COHORT_LIMIT_INVALID",
  "LEAD_NOT_IN_RELEASE_COHORT",
]);
type DenialReason =
  | "CAMPAIGN_RELEASE_NOT_FOUND"
  | "CAMPAIGN_RELEASE_EXPIRED_OR_REVOKED"
  | "CAMPAIGN_RELEASE_IDENTITY_MISMATCH"
  | "CAMPAIGN_RELEASE_COHORT_LIMIT_INVALID"
  | "LEAD_NOT_IN_RELEASE_COHORT";

export type CampaignContactReleaseInput = {
  user_id: string;
  organization_id: string;
  campaign_id: string;
  lead_id: string;
  provider: "retell";
  retell_agent_id: string;
  retell_agent_version: number;
  retell_llm_id: string;
  retell_llm_version: number;
  caller_number_id: string;
};

export type CampaignContactReleaseDecision =
  | {
    allowed: true;
    release_id: string;
    release_stage: ReleaseStage;
    reason_code: "CONTACT_RELEASE_APPROVED";
  }
  | {
    allowed: false;
    release_id: null;
    release_stage: null;
    reason_code: DenialReason;
  };

export interface CampaignContactReleaseRpcClient {
  rpc(
    functionName: "evaluate_campaign_contact_release",
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown | null }>;
}

export class CampaignContactReleaseError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "CampaignContactReleaseError";
    this.code = code;
  }
}

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null
    ? value as Record<string, unknown>
    : null;
}

function canonicalUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function providerIdentifier(value: unknown): value is string {
  return typeof value === "string" && PROVIDER_IDENTIFIER_PATTERN.test(value);
}

function validInput(input: CampaignContactReleaseInput): boolean {
  return canonicalUuid(input.user_id) &&
    canonicalUuid(input.organization_id) &&
    canonicalUuid(input.campaign_id) &&
    canonicalUuid(input.lead_id) &&
    canonicalUuid(input.caller_number_id) &&
    input.provider === "retell" &&
    providerIdentifier(input.retell_agent_id) &&
    providerIdentifier(input.retell_llm_id) &&
    Number.isSafeInteger(input.retell_agent_version) &&
    input.retell_agent_version >= 0 &&
    Number.isSafeInteger(input.retell_llm_version) &&
    input.retell_llm_version >= 0;
}

/** Parse exactly one database decision; unknown shapes fail closed. */
export function parseCampaignContactReleaseDecision(
  value: unknown,
): CampaignContactReleaseDecision {
  if (!Array.isArray(value) || value.length !== 1) {
    throw new CampaignContactReleaseError("CAMPAIGN_RELEASE_RESPONSE_INVALID");
  }
  const row = record(value[0]);
  if (!row || typeof row.allowed !== "boolean") {
    throw new CampaignContactReleaseError("CAMPAIGN_RELEASE_RESPONSE_INVALID");
  }
  if (row.allowed) {
    if (
      !canonicalUuid(row.release_id) ||
      typeof row.release_stage !== "string" ||
      !RELEASE_STAGES.has(row.release_stage) ||
      row.reason_code !== "CONTACT_RELEASE_APPROVED"
    ) {
      throw new CampaignContactReleaseError(
        "CAMPAIGN_RELEASE_RESPONSE_INVALID",
      );
    }
    return {
      allowed: true,
      release_id: row.release_id,
      release_stage: row.release_stage as ReleaseStage,
      reason_code: "CONTACT_RELEASE_APPROVED",
    } as CampaignContactReleaseDecision;
  }
  if (
    row.release_id !== null || row.release_stage !== null ||
    typeof row.reason_code !== "string" || !DENIAL_REASONS.has(row.reason_code)
  ) {
    throw new CampaignContactReleaseError("CAMPAIGN_RELEASE_RESPONSE_INVALID");
  }
  return {
    allowed: false,
    release_id: null,
    release_stage: null,
    reason_code: row.reason_code as DenialReason,
  } as CampaignContactReleaseDecision;
}

/** Calls the single server-owned final release decision boundary. */
export async function evaluateCampaignContactRelease(
  client: CampaignContactReleaseRpcClient,
  input: CampaignContactReleaseInput,
): Promise<CampaignContactReleaseDecision> {
  if (!validInput(input)) {
    throw new CampaignContactReleaseError("CAMPAIGN_RELEASE_INPUT_INVALID");
  }
  let response: { data: unknown; error: unknown | null };
  try {
    response = await client.rpc("evaluate_campaign_contact_release", {
      p_user_id: input.user_id,
      p_organization_id: input.organization_id,
      p_campaign_id: input.campaign_id,
      p_lead_id: input.lead_id,
      p_provider: input.provider,
      p_retell_agent_id: input.retell_agent_id,
      p_retell_agent_version: input.retell_agent_version,
      p_retell_llm_id: input.retell_llm_id,
      p_retell_llm_version: input.retell_llm_version,
      p_caller_number_id: input.caller_number_id,
    });
  } catch {
    throw new CampaignContactReleaseError("CAMPAIGN_RELEASE_UNAVAILABLE");
  }
  if (response.error !== null) {
    throw new CampaignContactReleaseError("CAMPAIGN_RELEASE_UNAVAILABLE");
  }
  return parseCampaignContactReleaseDecision(response.data);
}
