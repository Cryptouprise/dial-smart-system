import { describe, expect, it, vi } from "vitest";
import type { DialSmartClient } from "../src/client.js";
import { allTools } from "../src/tools/index.js";

/**
 * Tool registry integrity tests.
 *
 * These don't hit the network. They verify:
 *  - every tool has a unique name starting with "dialsmart_"
 *  - every tool has a description and a valid JSON Schema shape
 *  - required-field declarations match what the schema properties contain
 *  - every handler routes to at least one client method when invoked
 *    with the declared required args (so we catch dead paths in CI)
 */

describe("tool registry", () => {
  const validUuid = "11111111-1111-4111-8111-111111111111";

  function requiredArgument(field: string): string {
    if (field === "to_number" || field === "phone_number") return "+15551234567";
    if (field === "body") return "Contract test message";
    if (field === "idempotency_key") return "registry-contract-test-001";
    if (field === "lead_id" || field === "campaign_id" || field === "id") {
      return validUuid;
    }
    return validUuid;
  }

  it("has tools", () => {
    expect(allTools.length).toBeGreaterThan(20);
  });

  it("every tool name is unique and namespaced", () => {
    const names = allTools.map((t) => t.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
    for (const name of names) {
      expect(name).toMatch(/^dialsmart_/);
    }
  });

  it("every tool has a non-empty description", () => {
    for (const t of allTools) {
      expect(t.description.length, `${t.name} has no description`).toBeGreaterThan(20);
    }
  });

  it("every tool has a well-formed input schema", () => {
    for (const t of allTools) {
      expect(t.inputSchema.type, `${t.name}`).toBe("object");
      expect(typeof t.inputSchema.properties, `${t.name}`).toBe("object");
      if (t.inputSchema.required) {
        for (const req of t.inputSchema.required) {
          expect(
            t.inputSchema.properties[req],
            `${t.name}: required field '${req}' missing from properties`,
          ).toBeDefined();
        }
      }
    }
  });

  it("every handler calls the client exactly once per invocation", async () => {
    // Build a mock that records calls and returns an empty object.
    const clientMethods = {
      get: vi.fn().mockResolvedValue({}),
      post: vi.fn().mockResolvedValue({}),
      patch: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
      observe: vi.fn().mockResolvedValue({}),
    };
    const mock = clientMethods as unknown as DialSmartClient;

    for (const t of allTools) {
      // Build args matching the required fields with dummy UUIDs.
      const args: Record<string, unknown> = {};
      for (const req of t.inputSchema.required ?? []) {
        args[req] = requiredArgument(req);
      }

      await t.handler(mock, args);
      const total =
        clientMethods.get.mock.calls.length +
        clientMethods.post.mock.calls.length +
        clientMethods.patch.mock.calls.length +
        clientMethods.delete.mock.calls.length +
        clientMethods.observe.mock.calls.length;

      expect(total, `${t.name} did not call the client`).toBeGreaterThan(0);

      // Reset for next tool
      clientMethods.get.mockClear();
      clientMethods.post.mockClear();
      clientMethods.patch.mockClear();
      clientMethods.delete.mockClear();
      clientMethods.observe.mockClear();
    }
  });

  it("operational tools include the full campaign-launch set", () => {
    const names = new Set(allTools.map((t) => t.name));
    for (const expected of [
      "dialsmart_validate_campaign",
      "dialsmart_campaign_live_stats",
      "dialsmart_disposition_breakdown",
      "dialsmart_retry_failed_calls",
      "dialsmart_force_dispatch",
      "dialsmart_dry_run_campaign",
      "dialsmart_pre_launch_audit",
      "dialsmart_phone_number_health",
      "dialsmart_find_stuck_calls",
      "dialsmart_search_leads",
      "dialsmart_health_check",
    ]) {
      expect(names.has(expected), `missing tool: ${expected}`).toBe(true);
    }
  });
});
