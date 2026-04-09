#!/usr/bin/env node
/**
 * Write-path smoke test.
 *
 * This script exercises the MUTATING endpoints against a live API. It is
 * intentionally SEPARATE from `smoke.ts` so it can never be accidentally
 * triggered by CI or a casual validation run.
 *
 * What it does:
 *   1. Creates a throwaway test lead (tagged "mcp-write-smoke")
 *   2. Updates the lead (sets notes + priority)
 *   3. Re-fetches the lead to verify the update persisted
 *   4. Marks the lead as do_not_call
 *   5. Sends a free-text `dialsmart_search_leads` query to find the tagged lead
 *
 * What it does NOT do:
 *   - Place any real phone calls (would cost money and violate DNC)
 *   - Send any real SMS
 *   - Launch or modify any campaign
 *   - Delete anything (we WANT the test leads in the audit trail)
 *
 * Requires: DIALSMART_API_KEY (admin or leads:write scope).
 * Opt-in:   Must set CONFIRM=yes to run. Prevents muscle-memory mistakes.
 *
 * Usage:
 *   CONFIRM=yes DIALSMART_API_KEY=dsk_live_... node dist/smoke-write.js
 */

import { DialSmartApiError, DialSmartClient } from "./client.js";

const DEFAULT_API_URL =
  "https://emonjusymdripmkvtttc.supabase.co/functions/v1/api-gateway";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

interface Lead {
  id: string;
  phone_number: string;
  status: string;
  do_not_call?: boolean;
  notes?: string | null;
  priority?: number | null;
  tags?: string[] | null;
}

function uniquePhone(): string {
  // Use a reserved test area code (555) so this never dials a real number.
  const suffix = Math.floor(Math.random() * 9000 + 1000).toString();
  return `+1555555${suffix}`;
}

async function main(): Promise<void> {
  if (process.env.CONFIRM !== "yes") {
    console.error(
      `${YELLOW}Refusing to run write-path smoke test without CONFIRM=yes.${RESET}`,
    );
    console.error(
      `${DIM}This script creates test data in your live database. Set CONFIRM=yes to proceed.${RESET}`,
    );
    process.exit(2);
  }

  const apiKey = process.env.DIALSMART_API_KEY;
  if (!apiKey) {
    console.error(`${RED}DIALSMART_API_KEY env var is required.${RESET}`);
    process.exit(2);
  }

  const baseUrl = process.env.DIALSMART_API_URL ?? DEFAULT_API_URL;
  const client = new DialSmartClient({ baseUrl, apiKey });

  console.log(`${DIM}Dial Smart write-path smoke test${RESET}`);
  console.log(`${DIM}API: ${baseUrl}${RESET}`);
  console.log();

  const results: { name: string; ok: boolean; detail?: string; ms: number }[] = [];

  async function step<T>(name: string, fn: () => Promise<T>): Promise<T | null> {
    const t0 = Date.now();
    try {
      const result = await fn();
      const ms = Date.now() - t0;
      console.log(`  ${GREEN}✔${RESET} ${name.padEnd(40)} ${DIM}${ms}ms${RESET}`);
      results.push({ name, ok: true, ms });
      return result;
    } catch (err) {
      const ms = Date.now() - t0;
      const detail =
        err instanceof DialSmartApiError
          ? `[${err.status}] ${err.message}`
          : err instanceof Error
            ? err.message
            : String(err);
      console.log(`  ${RED}✘${RESET} ${name.padEnd(40)} ${RED}${detail}${RESET}`);
      results.push({ name, ok: false, detail, ms });
      return null;
    }
  }

  const phone = uniquePhone();
  const stamp = new Date().toISOString();

  // 1. Create a lead
  const created = await step("create_lead (tagged mcp-write-smoke)", () =>
    client.post<Lead>("/v1/leads", {
      phone_number: phone,
      first_name: "SmokeTest",
      last_name: stamp.slice(0, 16),
      lead_source: "mcp-write-smoke",
      status: "new",
      tags: ["mcp-write-smoke"],
      notes: `Automated write-path test at ${stamp}`,
    }),
  );

  if (!created?.id) {
    console.log();
    console.log(`${RED}Create failed — aborting rest of the test.${RESET}`);
    process.exit(1);
  }

  // 2. Update the lead
  await step("update_lead (set priority + notes)", () =>
    client.patch(`/v1/leads/${created.id}`, {
      priority: 7,
      notes: `Updated by write-smoke at ${stamp}`,
    }),
  );

  // 3. Re-fetch and confirm
  const fetched = await step("get_lead (verify update persisted)", async () => {
    const l = await client.get<Lead>(`/v1/leads/${created.id}`);
    if (l.priority !== 7) {
      throw new Error(`priority did not persist (got ${l.priority}, wanted 7)`);
    }
    return l;
  });

  // 4. Rich search for the tag
  await step("search_leads (tag = mcp-write-smoke)", async () => {
    const result = await client.request<{ leads: Lead[] }>(
      "POST",
      "/v1/leads/search",
      { body: { tags: ["mcp-write-smoke"], limit: 5 } },
    );
    if (!result.leads || result.leads.length === 0) {
      throw new Error("search returned 0 results for the tag we just created");
    }
    return result;
  });

  // 5. DNC the lead so it never accidentally gets called
  await step("mark_lead_dnc (cleanup)", () =>
    client.post(`/v1/leads/${created.id}/dnc`),
  );

  // Final verification: the lead should now be do_not_call=true, status=dnc
  await step("get_lead (verify DNC stuck)", async () => {
    const l = await client.get<Lead>(`/v1/leads/${created.id}`);
    if (!l.do_not_call) {
      throw new Error("do_not_call flag did not persist");
    }
    return l;
  });

  console.log();
  const failed = results.filter((r) => !r.ok);
  if (failed.length === 0) {
    console.log(
      `${GREEN}All ${results.length} write-path probes passed.${RESET}`,
    );
    console.log(
      `${DIM}Test lead id ${created.id} is marked DNC. Safe to leave in the DB as an audit record.${RESET}`,
    );
    process.exit(0);
  } else {
    console.log(`${RED}${failed.length}/${results.length} write probes failed:${RESET}`);
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Write smoke test crashed:", err);
  process.exit(1);
});
