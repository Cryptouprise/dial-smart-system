#!/usr/bin/env node
import { existsSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EliteSolarEmailExecutionReleaseError,
  buildEliteSolarEmailExecutionRelease,
  verifyEliteSolarEmailExecutionRelease,
} from "./lib/elite-solar-email-execution-release.mjs";

const REPOSITORY_ROOT = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
const REQUEST_TEMPLATE = Object.freeze({
  version: "elite.solar.email.execution.release.v1",
  execution_key_id: "replace-release-key-id",
  signer_principal_reference: "replace-approved-signer-reference",
  idempotency_key: "replace-unique-16-to-128-character-idempotency-key",
  expires_at: "__REQUIRED_UTC_EXPIRY_10_MIN_TO_HANDOFF_EXPIRY__",
});

function parseArguments(argv) {
  const args = {};
  const allowed = new Set(["--proposal", "--request", "--hmac-key-file", "--output", "--verify", "--input", "--template"]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!allowed.has(argument)) throw new Error(`Unsupported option: ${argument}`);
    if (argument === "--verify" || argument === "--template") {
      args[argument.slice(2)] = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value.`);
    args[argument.slice(2)] = value;
    index += 1;
  }
  if (args.template) {
    if (args.verify || args.proposal || args.request || args.output || args.input || args["hmac-key-file"]) throw new Error("--template cannot be combined with other options.");
  } else if (args.verify) {
    if (args.proposal || args.request || args.output || !args.input || !args["hmac-key-file"]) throw new Error("--verify requires --input and --hmac-key-file only.");
  } else if (!args.proposal || !args.request || !args["hmac-key-file"] || !args.output || args.input) {
    throw new Error("--proposal, --request, --hmac-key-file, and --output are required.");
  }
  return args;
}

function normalizedPath(path) {
  return process.platform === "win32" ? path.toLowerCase() : path;
}

function inside(parent, child, allowSame = false) {
  const difference = relative(parent, child);
  if (difference === "") return allowSame;
  return !isAbsolute(difference) && difference !== ".." && !difference.startsWith(`..${sep}`);
}

function externalFile(path, label) {
  const file = normalizedPath(realpathSync(resolve(path)));
  if (inside(normalizedPath(REPOSITORY_ROOT), file, true)) throw new Error(`${label} must be outside the repository.`);
  if (!statSync(file).isFile()) throw new Error(`${label} must be a regular file.`);
  return file;
}

function externalOutput(path) {
  const output = resolve(path);
  if (existsSync(output)) throw new Error("--output must not already exist.");
  const parent = resolve(output, "..");
  if (!existsSync(parent) || !statSync(parent).isDirectory()) throw new Error("--output parent directory must already exist.");
  const realParent = normalizedPath(realpathSync(parent));
  const prospective = normalizedPath(resolve(realParent, output.split(/[\\/]/).pop()));
  if (inside(normalizedPath(REPOSITORY_ROOT), prospective, true)) throw new Error("--output must be outside the repository.");
  return output;
}

try {
  const args = parseArguments(process.argv.slice(2));
  if (args.template) {
    process.stdout.write(`${JSON.stringify(REQUEST_TEMPLATE, null, 2)}\n`);
    process.exit(0);
  }
  const keyPath = externalFile(args["hmac-key-file"], "HMAC key file");
  const key = readFileSync(keyPath);
  if (args.verify) {
    const inputPath = externalFile(args.input, "Release input");
    const result = verifyEliteSolarEmailExecutionRelease({ release: JSON.parse(readFileSync(inputPath, "utf8")), executionHmacKey: key });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.valid) process.exitCode = 2;
  } else {
    const proposalPath = externalFile(args.proposal, "Handoff proposal");
    const requestPath = externalFile(args.request, "Release request");
    const outputPath = externalOutput(args.output);
    const release = buildEliteSolarEmailExecutionRelease({
      handoffProposal: JSON.parse(readFileSync(proposalPath, "utf8")),
      request: JSON.parse(readFileSync(requestPath, "utf8")),
      executionHmacKey: key,
    });
    writeFileSync(outputPath, `${JSON.stringify(release, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    process.stdout.write(`${JSON.stringify({
      operation: "signed_elite_solar_email_execution_release_candidate_only",
      output_created: true,
      recipient_data_included: false,
      provider_action: "none",
      provider_write_performed: false,
      external_messages_sent: 0,
      next_step: "A future tenant-bound server adapter must verify this signature, claim the idempotency key in a durable replay store, and independently pass every source, suppression, provider, and human-approval gate before any provider request.",
    }, null, 2)}\n`);
  }
} catch (error) {
  const code = error instanceof EliteSolarEmailExecutionReleaseError ? error.code : "ELITE_SOLAR_EMAIL_EXECUTION_RELEASE_FAILED";
  process.stderr.write(`${JSON.stringify({ ok: false, error_code: code })}\n`);
  process.exitCode = 1;
}
