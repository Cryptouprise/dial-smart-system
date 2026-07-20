#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  OutboundEmailDraftError,
  compileOutboundEmailDraft,
} from "./lib/outbound-email-draft.mjs";

function usage() {
  return "Usage: node scripts/compile-outbound-email-draft.mjs --input <non-PII-draft.json>";
}

function parseArgs(argv) {
  if (argv.length !== 2 || argv[0] !== "--input") {
    throw new OutboundEmailDraftError("USAGE", usage());
  }
  return { input: resolve(argv[1]) };
}

try {
  const { input } = parseArgs(process.argv.slice(2));
  const raw = await readFile(input, "utf8");
  const draft = compileOutboundEmailDraft(JSON.parse(raw));
  process.stdout.write(`${JSON.stringify(draft, null, 2)}\n`);
} catch (error) {
  const code = error instanceof OutboundEmailDraftError ? error.code : "DRAFT_COMPILATION_FAILED";
  process.stderr.write(`${JSON.stringify({ ok: false, error_code: code })}\n`);
  process.exitCode = 1;
}
