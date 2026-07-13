#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildGhlShadowReconciliationReport,
  parseStrictJsonDocument,
  verifyGhlShadowReconciliationReport,
} from "./lib/ghl-shadow-reconciliation.mjs";

function usage() {
  return [
    "Usage:",
    "  node scripts/reconcile-ghl-shadow-evidence.mjs --input <rpc-export.json> --comparison <independent-redacted-export.json> [--compact]",
    "  node scripts/reconcile-ghl-shadow-evidence.mjs --verify-report <report.json> [--compact]",
    "",
    "Reads local JSON evidence files and writes only a deterministic zero-contact report to stdout.",
    "It has no database, network, provider, queue, CRM, messaging, or file-write capability.",
  ].join("\n");
}

function parseArguments(argv) {
  const result = { compact: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--compact") {
      result.compact = true;
      continue;
    }
    if (
      argument === "--input" || argument === "--comparison" ||
      argument === "--verify-report"
    ) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${argument} requires a path.`);
      }
      const key = argument === "--input"
        ? "input"
        : argument === "--comparison"
        ? "comparison"
        : "verifyReport";
      if (result[key]) {
        throw new Error(`${argument} can be provided only once.`);
      }
      result[key] = value;
      index += 1;
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      result.help = true;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  return result;
}

function readStrictJson(path, label) {
  let contents;
  try {
    contents = readFileSync(resolve(path), "utf8");
  } catch {
    throw new Error(`${label} could not be read.`);
  }
  try {
    return parseStrictJsonDocument(contents);
  } catch (error) {
    throw new Error(
      `${label} is not unambiguous JSON: ${
        error instanceof Error ? error.message : "parse failed"
      }`,
    );
  }
}

function writeJson(value, compact) {
  process.stdout.write(`${JSON.stringify(value, null, compact ? 0 : 2)}\n`);
}

function main() {
  const args = parseArguments(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (args.verifyReport && (args.input || args.comparison)) {
    throw new Error("Verify mode cannot be combined with build inputs.");
  }
  if (!args.verifyReport && (!args.input || !args.comparison)) {
    throw new Error("Build mode requires both --input and --comparison.");
  }

  if (args.verifyReport) {
    const report = readStrictJson(args.verifyReport, "Reconciliation report");
    const valid = verifyGhlShadowReconciliationReport(report);
    writeJson({ valid }, args.compact);
    if (!valid) process.exitCode = 2;
    return;
  }

  const exportedEvidence = readStrictJson(args.input, "GHL shadow RPC export");
  const independentComparison = readStrictJson(
    args.comparison,
    "Independent redacted GHL comparison",
  );
  const report = buildGhlShadowReconciliationReport(
    exportedEvidence,
    independentComparison,
  );
  writeJson(report, args.compact);
  if (report.report_status !== "reconciled") process.exitCode = 2;
}

try {
  main();
} catch (error) {
  process.stderr.write(
    `GHL shadow reconciliation failed: ${
      error instanceof Error ? error.message : "unknown error"
    }\n`,
  );
  process.exitCode = 1;
}
