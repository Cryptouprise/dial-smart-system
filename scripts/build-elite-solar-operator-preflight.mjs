#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { buildEliteSolarOperatorPreflight } from "./lib/elite-solar-operator-preflight.mjs";

function parseArguments(argumentsList) {
  if (argumentsList.length > 0) throw new Error(`Unknown argument: ${argumentsList[0]}`);
}

export async function main({ environment = process.env } = {}) {
  parseArguments(process.argv.slice(2));
  return buildEliteSolarOperatorPreflight({ environment });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const preflight = await main();
    process.stdout.write(`${JSON.stringify(preflight)}\n`);
    if (preflight.status === "offline_bundle_invalid" || preflight.status === "offline_bundle_ready_readiness_blocked") {
      process.exitCode = 2;
    }
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      kind: "elite_solar_operator_preflight_v1",
      status: "invalid_request",
      error_code: "ELITE_SOLAR_OPERATOR_PREFLIGHT_FAILED",
      error: error instanceof Error ? error.message : String(error),
    })}\n`);
    process.exitCode = 1;
  }
}
