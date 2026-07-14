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
      "dialsmart_whoami",
      "dialsmart_system_stats",
      "dialsmart_list_campaigns",
      "dialsmart_get_campaign",
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

  it("rejects every non-observer profile instead of widening authority", () => {
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
    expect(validateCertifiedObserverArguments("dialsmart_whoami", {})).toEqual({});
    expect(
      validateCertifiedObserverArguments("dialsmart_list_campaigns", {
        status: "paused",
        limit: 25,
        offset: 0,
      }),
    ).toEqual({ status: "paused", limit: 25, offset: 0 });
    expect(
      validateCertifiedObserverArguments("dialsmart_get_campaign", {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }),
    ).toEqual({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });

    for (const args of [
      { organization_id: "forged" },
      { junk: true },
      { limit: 999_999 },
      { limit: 1.5 },
      { offset: -1 },
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
        validateCertifiedObserverArguments("dialsmart_get_campaign", { id })
      ).toThrow(/canonical lowercase UUID/i);
    }

    let dispatched = false;
    const tool = certifiedToolsForProfile("observer").find(
      (candidate) => candidate.name === "dialsmart_get_campaign",
    );
    await expect(
      tool!.handler(
        { get: () => {
          dispatched = true;
          return Promise.resolve({});
        } } as never,
        { id: "../leads" },
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
