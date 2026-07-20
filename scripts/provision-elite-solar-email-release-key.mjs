#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
const KEY_FILE = "elite-solar-email-execution-release-hmac-v1.bin";

function parseArguments(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument !== "--destination" && argument !== "--key-id") throw new Error(`Unsupported option: ${argument}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value.`);
    args[argument.slice(2)] = value;
    index += 1;
  }
  if (!args.destination || !args["key-id"]) throw new Error("--destination and --key-id are required.");
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{3,127}$/.test(args["key-id"])) throw new Error("--key-id must be a safe 4-128 character identifier.");
  if (/(^|[._:-])(synthetic|demo|test)([._:-]|$)/i.test(args["key-id"])) throw new Error("--key-id must not be labeled synthetic, demo, or test.");
  return args;
}

function normalizedPath(path) { return process.platform === "win32" ? path.toLowerCase() : path; }
function inside(parent, child) {
  const difference = relative(parent, child);
  return difference === "" || (!isAbsolute(difference) && difference !== ".." && !difference.startsWith(`..${sep}`));
}

try {
  const args = parseArguments(process.argv.slice(2));
  const destination = resolve(args.destination);
  if (existsSync(destination)) throw new Error("--destination must be a new directory.");
  const parent = resolve(destination, "..");
  if (!existsSync(parent) || !statSync(parent).isDirectory()) throw new Error("--destination parent directory must already exist.");
  const prospective = normalizedPath(resolve(realpathSync(parent), basename(destination)));
  if (inside(normalizedPath(REPOSITORY_ROOT), prospective)) throw new Error("--destination must be outside the repository.");
  mkdirSync(destination, { recursive: false, mode: 0o700 });
  const key = randomBytes(32);
  try {
    const keyPath = resolve(destination, KEY_FILE);
    writeFileSync(keyPath, key, { mode: 0o600, flag: "wx" });
    process.stdout.write(`${JSON.stringify({
      operation: "provision_elite_solar_email_execution_release_key_only",
      key_id: args["key-id"],
      key_file: keyPath,
      key_file_created: true,
      key_printed: false,
      provider_write_performed: false,
      external_messages_sent: 0,
      next_step: "Keep this independent HMAC key in the approved secret location. Use it only to sign and verify a no-send Elite email execution release candidate.",
    }, null, 2)}\n`);
  } finally {
    key.fill(0);
  }
} catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, error_code: "ELITE_SOLAR_EMAIL_RELEASE_KEY_PROVISION_FAILED" })}\n`);
  process.exitCode = 1;
}
