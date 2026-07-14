// deno-lint-ignore-file no-import-prefix
import {
  assertEquals,
  assertRejects,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  CampaignContactReleaseError,
  evaluateCampaignContactRelease,
  parseCampaignContactReleaseDecision,
} from "./campaign-contact-release.ts";

const INPUT = {
  user_id: "11111111-aaaa-4aaa-8aaa-111111111111",
  organization_id: "22222222-bbbb-4bbb-8bbb-222222222222",
  campaign_id: "33333333-cccc-4ccc-8ccc-333333333333",
  lead_id: "44444444-dddd-4ddd-8ddd-444444444444",
  provider: "retell" as const,
  retell_agent_id: "agent_release_001",
  retell_agent_version: 7,
  retell_llm_id: "llm_release_001",
  retell_llm_version: 4,
  caller_number_id: "55555555-eeee-4eee-8eee-555555555555",
};

Deno.test("campaign release parser accepts only exact approved or default-deny results", () => {
  assertEquals(
    parseCampaignContactReleaseDecision([{
      allowed: true,
      release_id: "66666666-ffff-4fff-8fff-666666666666",
      release_stage: "canary_5",
      reason_code: "CONTACT_RELEASE_APPROVED",
    }]),
    {
      allowed: true,
      release_id: "66666666-ffff-4fff-8fff-666666666666",
      release_stage: "canary_5",
      reason_code: "CONTACT_RELEASE_APPROVED",
    },
  );
  assertEquals(
    parseCampaignContactReleaseDecision([{
      allowed: false,
      release_id: null,
      release_stage: null,
      reason_code: "LEAD_NOT_IN_RELEASE_COHORT",
    }]),
    {
      allowed: false,
      release_id: null,
      release_stage: null,
      reason_code: "LEAD_NOT_IN_RELEASE_COHORT",
    },
  );
});

Deno.test("campaign release parser rejects malformed or widened results", () => {
  for (
    const value of [
      [],
      [{
        allowed: true,
        release_id: "not-a-uuid",
        release_stage: "normal",
        reason_code: "CONTACT_RELEASE_APPROVED",
      }],
      [{
        allowed: true,
        release_id: "66666666-ffff-4fff-8fff-666666666666",
        release_stage: "normal",
        reason_code: "forged",
      }],
      [{
        allowed: false,
        release_id: "66666666-ffff-4fff-8fff-666666666666",
        release_stage: null,
        reason_code: "CAMPAIGN_RELEASE_NOT_FOUND",
      }],
      [{
        allowed: false,
        release_id: null,
        release_stage: null,
        reason_code: "forged",
      }],
    ]
  ) {
    assertThrows(
      () => parseCampaignContactReleaseDecision(value),
      CampaignContactReleaseError,
      "CAMPAIGN_RELEASE_RESPONSE_INVALID",
    );
  }
});

Deno.test("campaign release RPC is exact, and input or RPC failures never allow egress", async () => {
  let called: { name: string; args: Record<string, unknown> } | null = null;
  const decision = await evaluateCampaignContactRelease({
    rpc(name, args) {
      called = { name, args };
      return Promise.resolve({
        data: [{
          allowed: false,
          release_id: null,
          release_stage: null,
          reason_code: "CAMPAIGN_RELEASE_NOT_FOUND",
        }],
        error: null,
      });
    },
  }, INPUT);
  assertEquals(decision.allowed, false);
  assertEquals(called, {
    name: "evaluate_campaign_contact_release",
    args: {
      p_user_id: INPUT.user_id,
      p_organization_id: INPUT.organization_id,
      p_campaign_id: INPUT.campaign_id,
      p_lead_id: INPUT.lead_id,
      p_provider: "retell",
      p_retell_agent_id: INPUT.retell_agent_id,
      p_retell_agent_version: 7,
      p_retell_llm_id: INPUT.retell_llm_id,
      p_retell_llm_version: 4,
      p_caller_number_id: INPUT.caller_number_id,
    },
  });
  await assertRejects(
    () =>
      evaluateCampaignContactRelease({
        rpc: () => Promise.resolve({ data: null, error: { message: "down" } }),
      }, INPUT),
    CampaignContactReleaseError,
    "CAMPAIGN_RELEASE_UNAVAILABLE",
  );
  await assertRejects(
    () =>
      evaluateCampaignContactRelease({
        rpc: () => Promise.resolve({ data: [], error: null }),
      }, { ...INPUT, provider: "telnyx" as "retell" }),
    CampaignContactReleaseError,
    "CAMPAIGN_RELEASE_INPUT_INVALID",
  );
});
