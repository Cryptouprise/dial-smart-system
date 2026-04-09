#!/usr/bin/env node
/**
 * Smoke test script.
 *
 * Runs every read-only tool against a live Dial Smart API key and reports
 * pass/fail for each. Does NOT exercise any write operations (no leads
 * created, no calls placed, no SMS sent).
 *
 * Usage:
 *   DIALSMART_API_KEY=dsk_live_... node dist/smoke.js
 *   DIALSMART_API_KEY=dsk_live_... DIALSMART_API_URL=https://... node dist/smoke.js
 *
 * Exit codes:
 *   0 = all probes passed
 *   1 = any probe failed
 *   2 = misconfiguration (missing env var, etc.)
 */

import { DialSmartApiError, DialSmartClient } from "./client.js";

const DEFAULT_API_URL =
  "https://emonjusymdripmkvtttc.supabase.co/functions/v1/api-gateway";

interface Probe {
  name: string;
  fn: (c: DialSmartClient) => Promise<unknown>;
}

const READ_ONLY_PROBES: Probe[] = [
  { name: "whoami", fn: (c) => c.get("/v1/me") },
  { name: "system_stats", fn: (c) => c.get("/v1/system/stats") },
  { name: "credits_balance", fn: (c) => c.get("/v1/credits/balance") },
  { name: "deep_health_check", fn: (c) => c.get("/v1/system/health-check") },
  { name: "list_phone_numbers", fn: (c) => c.get("/v1/phone-numbers", { limit: 5 }) },
  { name: "phone_number_health", fn: (c) => c.get("/v1/phone-numbers/health") },
  { name: "list_leads", fn: (c) => c.get("/v1/leads", { limit: 5 }) },
  {
    name: "search_leads",
    fn: (c) =>
      c.request("POST", "/v1/leads/search", { body: { limit: 5 }, retry: true }),
  },
  { name: "list_campaigns", fn: (c) => c.get("/v1/campaigns", { limit: 5 }) },
  { name: "list_calls", fn: (c) => c.get("/v1/calls", { limit: 5 }) },
  { name: "find_stuck_calls", fn: (c) => c.get("/v1/calls/stuck") },
  { name: "list_sms", fn: (c) => c.get("/v1/sms", { limit: 5 }) },
];

const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

async function main(): Promise<void> {
  const apiKey = process.env.DIALSMART_API_KEY;
  if (!apiKey) {
    console.error(
      `${RED}DIALSMART_API_KEY env var is required. See mcp-server/README.md to mint one.${RESET}`,
    );
    process.exit(2);
  }

  const baseUrl = process.env.DIALSMART_API_URL ?? DEFAULT_API_URL;
  const client = new DialSmartClient({ baseUrl, apiKey });

  console.log(`${DIM}Dial Smart MCP smoke test${RESET}`);
  console.log(`${DIM}API: ${baseUrl}${RESET}`);
  console.log(`${DIM}Key: ${apiKey.slice(0, 12)}...${RESET}`);
  console.log();

  const results: { name: string; ok: boolean; ms: number; detail?: string }[] = [];

  // Probe /v1/health first (no auth) so we can quickly distinguish
  // network/deployment problems from auth problems.
  const t0 = Date.now();
  try {
    const publicHealth = new DialSmartClient({ baseUrl, apiKey: "unused", maxRetries: 2 });
    await publicHealth.get("/v1/health");
    console.log(`  ${GREEN}✔${RESET} public health check        ${DIM}${Date.now() - t0}ms${RESET}`);
  } catch (err) {
    const msg = err instanceof DialSmartApiError ? err.message : String(err);
    console.log(`  ${RED}✘${RESET} public health check        ${RED}${msg}${RESET}`);
    console.log();
    console.log(`${RED}Cannot reach the api-gateway. Is it deployed?${RESET}`);
    console.log(`Try: ${YELLOW}supabase functions deploy api-gateway --no-verify-jwt${RESET}`);
    process.exit(1);
  }

  for (const probe of READ_ONLY_PROBES) {
    const start = Date.now();
    try {
      await probe.fn(client);
      const ms = Date.now() - start;
      results.push({ name: probe.name, ok: true, ms });
      console.log(
        `  ${GREEN}✔${RESET} ${probe.name.padEnd(26)} ${DIM}${ms}ms${RESET}`,
      );
    } catch (err) {
      const ms = Date.now() - start;
      const detail =
        err instanceof DialSmartApiError
          ? `[${err.status}] ${err.message}`
          : err instanceof Error
            ? err.message
            : String(err);
      results.push({ name: probe.name, ok: false, ms, detail });
      console.log(
        `  ${RED}✘${RESET} ${probe.name.padEnd(26)} ${RED}${detail}${RESET}`,
      );
    }
  }

  const failed = results.filter((r) => !r.ok);
  console.log();
  console.log(
    `${results.length - failed.length}/${results.length} probes passed` +
      ` ${DIM}(total ${results.reduce((a, r) => a + r.ms, 0)}ms)${RESET}`,
  );

  if (failed.length > 0) {
    console.log();
    console.log(`${RED}Failures:${RESET}`);
    for (const f of failed) {
      console.log(`  - ${f.name}: ${f.detail}`);
    }
    process.exit(1);
  }

  console.log(`${GREEN}All probes passed.${RESET}`);
}

main().catch((err) => {
  console.error("Smoke test crashed:", err);
  process.exit(1);
});
