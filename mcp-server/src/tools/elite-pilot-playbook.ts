import type { DialSmartClient } from "../client.js";
import type { ToolDefinition } from "./index.js";

const NO_AUTHORITY = Object.freeze({
  contact_authorized: false,
  launch_authorized: false,
  queue_mutation_authorized: false,
  crm_write_authorized: false,
  spend_authorized: false,
});

function playbookTool(
  name: string,
  description: string,
  result: Record<string, unknown>,
): ToolDefinition {
  return {
    name,
    description,
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    // The explicit unused client proves the offline profile has no transport.
    handler: async (_client: DialSmartClient, _args: Record<string, unknown>) =>
      Object.freeze({
        kind: "elite_solar_offline_playbook_v1",
        offline: true,
        provider_action: "none",
        authority: NO_AUTHORITY,
        ...result,
      }),
  };
}

/**
 * A credential-free, static MCP catalog for the Elite pilot. It deliberately
 * has no tenant data, remote client call, lead data, or execution capability.
 * Operators must opt into this profile by name; it is not a fallback for the
 * authenticated observer profile.
 */
export const elitePilotPlaybookTools: ToolDefinition[] = [
  playbookTool(
    "dialsmart_elite_morning_beat",
    "Read the offline Elite Solar Recovery morning beat: current no-authority posture, immediate next proof, and provider lane state. It contains no tenant, contact, provider, or credential data.",
    {
      topic: "morning_beat",
      headline: "Elite Solar is staged for review; it is not authorized to contact anyone.",
      current_posture: "review_only_no_contact_authority",
      next_proof: "signed_25_record_zero_contact_source_shadow",
      email_lane: "review_package_ready_provider_connections_not_established",
      authority_reminder: "Calls, texts, provider sends, CRM writes, queues, and spend remain locked.",
    },
  ),
  playbookTool(
    "dialsmart_elite_pilot_guide",
    "Read the offline Elite Solar Recovery launch guide: the current safe lane, no-authority posture, and exact next gate. This tool contains no tenant or provider data.",
    {
      topic: "next_gate",
      headline: "Begin with a 25-record signed direct-import shadow.",
      detail: "The direct import is GHL-independent and zero-contact. A historical appointment, database row, or current CRM phone is never contact authority.",
      next_actions: [
        "Create signing and HMAC keys in an access-controlled directory outside the repository.",
        "Bind only the public signing fingerprint and reviewed source metadata in an isolated, launch-disabled release candidate.",
        "Evaluate exactly 25 consent-proven records in zero-contact shadow mode and review the redacted result.",
      ],
    },
  ),
  playbookTool(
    "dialsmart_elite_source_shadow_plan",
    "Read the offline signed-source shadow requirements for Elite Solar Recovery. It never accepts, imports, or reveals a lead record.",
    {
      topic: "source_shadow",
      required_evidence: [
        "Exact legal seller, lead source, source-form version, and AI/telemarketing consent disclosure binding.",
        "Original consent phone matching the dialed phone, current revocation status, suppression checks, property state, and calling state.",
        "One short-lived signed export with 25 records and a clean redacted zero-contact comparison.",
      ],
      prohibited_shortcuts: [
        "No generic CSV or GHL import qualifies as first-pilot release evidence.",
        "No historical appointment, interest, or present-day CRM field substitutes for immutable consent evidence.",
        "A clean shadow report is evidence only and never authorizes a provider request.",
      ],
    },
  ),
  playbookTool(
    "dialsmart_elite_test_plan",
    "Read the offline Elite Solar Recovery test ladder: synthetic language checks, conversation review, owned phones, then human-approved canaries. It cannot start a test call.",
    {
      topic: "test_ladder",
      stages: [
        "Run the locked Solar suite and synthetic transcript lint before any provider interaction.",
        "Run all 27 conversation contracts in Retell sandbox or only on company-owned phones, with human recording/transcript review.",
        "Pass exactly 20 consecutive owned-phone lifecycles with webhook, billing, reconciliation, DNC, opt-out, and global-stop evidence.",
        "Only then request manually reviewed human cohorts of 5, 20, and 50; stop on any hard failure.",
      ],
      commands: [
        "npm run campaign:solar-exit:test",
        "npm run retell:solar:readiness",
        "npm run campaign:solar-exit:lint-transcript -- --input <synthetic-transcript.json>",
        "npm run campaign:solar-exit:canary-template -- owned_phone_20",
      ],
    },
  ),
  playbookTool(
    "dialsmart_elite_email_draft_plan",
    "Read the offline Elite Solar Recovery email draft posture. It describes the no-send Instantly/Mailgun planning lane and cannot upload recipients or create a provider campaign.",
    {
      topic: "email_draft",
      headline: "The email reactivation sequence is draft-only.",
      required_before_future_handoff: [
        "Reviewed source basis, list hygiene, suppression synchronization, sender identity, postal address, reply owner, unsubscribe destination, and copy approval.",
        "A healthy verified sending domain/account and a separate signed recipient-import/release process.",
        "A human-approved, small staged provider campaign; no automated send authority exists in this profile.",
        "A tenant-bound, signature-verified receipt endpoint with replay and suppression evidence before any provider webhook is enabled.",
      ],
      commands: [
        "npm run email:outbound:draft -- --input <non-PII-draft.json>",
        "npm run email:instantly:readiness",
        "npm run email:mailgun:readiness",
      ],
    },
  ),
];
