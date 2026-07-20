import { describe, expect, it } from "vitest";

import {
  allTools,
  certifiedToolsForProfile,
  validateCertifiedObserverArguments,
} from "../src/tools/index.js";

const MUTATING_OR_EXTERNAL_EFFECT_TOOLS = [
  "dialsmart_create_lead",
  "dialsmart_update_lead",
  "dialsmart_mark_lead_dnc",
  "dialsmart_create_campaign",
  "dialsmart_launch_campaign",
  "dialsmart_pause_campaign",
  "dialsmart_place_call",
  "dialsmart_send_sms",
  "dialsmart_retry_failed_calls",
  "dialsmart_force_dispatch",
  // The current health check writes an audit sanity row, so it is not observer-only.
  "dialsmart_health_check",
];

describe("certified MCP capability profiles", () => {
  it("defaults to the exact shared R0 observer command catalog", () => {
    const tools = certifiedToolsForProfile(undefined);
    expect(tools.map((tool) => tool.name)).toEqual([
      "dialsmart_operator_context",
      "dialsmart_system_status",
      "dialsmart_elite_solar_brief",
      "dialsmart_elite_solar_pulse",
      "dialsmart_list_campaigns",
      "dialsmart_inspect_campaign",
    ]);
  });

  it("does not advertise mutation, provider-contact, or audit-write tools", () => {
    const names = new Set(
      certifiedToolsForProfile("observer").map((tool) => tool.name),
    );
    for (const name of MUTATING_OR_EXTERNAL_EFFECT_TOOLS) {
      expect(names.has(name), name).toBe(false);
    }
  });

  it("exposes an explicit zero-authority offline playbook without widening the observer catalog", async () => {
    const tools = certifiedToolsForProfile("elite-pilot-playbook");
    expect(tools.map((tool) => tool.name)).toEqual([
      "dialsmart_elite_pilot_guide",
      "dialsmart_elite_source_shadow_plan",
      "dialsmart_elite_test_plan",
      "dialsmart_elite_email_draft_plan",
    ]);
    for (const tool of tools) {
      expect(tool.inputSchema.additionalProperties).toBe(false);
      await expect(tool.handler({} as never, {})).resolves.toMatchObject({
        offline: true,
        provider_action: "none",
        authority: {
          contact_authorized: false,
          launch_authorized: false,
          queue_mutation_authorized: false,
          crm_write_authorized: false,
          spend_authorized: false,
        },
      });
    }
    await expect(tools[0].handler({} as never, { junk: true })).rejects.toThrow(/unknown/i);
    expect(certifiedToolsForProfile("observer")).toHaveLength(6);
  });

  it("rejects every unsupported profile instead of widening authority", () => {
    for (const profile of ["write", "admin", "full", "contact"]) {
      expect(() => certifiedToolsForProfile(profile)).toThrow(/not certified/i);
    }
    expect(certifiedToolsForProfile("observer ")).toHaveLength(
      certifiedToolsForProfile("observer").length,
    );
  });

  it("rejects unknown arguments on every exposed tool schema", () => {
    for (const tool of certifiedToolsForProfile("observer")) {
      expect(tool.inputSchema.additionalProperties, tool.name).toBe(false);
    }
  });

  it("enforces the observer schemas at runtime instead of trusting metadata", () => {
    expect(validateCertifiedObserverArguments("dialsmart_operator_context", {})).toEqual({});
    expect(
      validateCertifiedObserverArguments("dialsmart_list_campaigns", {
        status: "paused",
        limit: 25,
        cursor: "next_page_2",
      }),
    ).toEqual({ status: "paused", limit: 25, cursor: "next_page_2" });
    expect(
      validateCertifiedObserverArguments("dialsmart_inspect_campaign", {
        campaign_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        include: ["release_status"],
      }),
    ).toEqual({
      campaign_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      include: ["release_status"],
    });

    for (const args of [
      { organization_id: "forged" },
      { junk: true },
      { limit: 999_999 },
      { limit: 1.5 },
      { cursor: "not/a-cursor" },
      { status: "launching" },
    ]) {
      expect(() =>
        validateCertifiedObserverArguments("dialsmart_list_campaigns", args)
      ).toThrow();
    }
  });

  it("blocks campaign path traversal and noncanonical selectors before dispatch", async () => {
    for (const id of [
      "../leads",
      "../calls",
      "../sms",
      "../phone-numbers",
      "../system/health-check",
      "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
      "not-a-campaign",
    ]) {
      expect(() =>
        validateCertifiedObserverArguments("dialsmart_inspect_campaign", {
          campaign_id: id,
        })
      ).toThrow(/canonical lowercase UUID/i);
    }

    let dispatched = false;
    const tool = certifiedToolsForProfile("observer").find(
      (candidate) => candidate.name === "dialsmart_inspect_campaign",
    );
    await expect(
      tool!.handler(
        { get: () => {
          dispatched = true;
          return Promise.resolve({});
        } } as never,
        { campaign_id: "../leads" },
      ),
    ).rejects.toThrow(/canonical lowercase UUID/i);
    expect(dispatched).toBe(false);
  });

  it("keeps the legacy catalog unique while exposing only a strict subset", () => {
    const allNames = allTools.map((tool) => tool.name);
    const observerNames = certifiedToolsForProfile("observer").map(
      (tool) => tool.name,
    );
    expect(new Set(allNames).size).toBe(allNames.length);
    expect(new Set(observerNames).size).toBe(observerNames.length);
    expect(observerNames.length).toBeLessThan(allNames.length);
  });
});
