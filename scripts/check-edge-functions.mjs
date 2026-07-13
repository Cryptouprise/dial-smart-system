import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const args = process.argv.slice(2);
const mode = args[0] ?? '--all';
if (!['--all', '--changed'].includes(mode)) {
  console.error('Usage: node scripts/check-edge-functions.mjs --all | --changed [base-ref]');
  process.exit(2);
}

const root = resolve('supabase/functions');
const allEntries = readdirSync(root, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== '_shared')
  .map((entry) => join(root, entry.name, 'index.ts'))
  .filter(existsSync)
  .sort();

function gitNames(commandArgs) {
  const result = spawnSync('git', commandArgs, { encoding: 'utf8' });
  if (result.status !== 0) return [];
  return result.stdout.split(/\r?\n/).filter(Boolean);
}

let entries = allEntries;
if (mode === '--changed') {
  const base = args[1] || process.env.EDGE_BASE_SHA || 'origin/main';
  const invalidBase = !base || /^0+$/.test(base);
  const names = new Set([
    ...(invalidBase ? [] : gitNames(['diff', '--name-only', `${base}...HEAD`, '--', 'supabase/functions'])),
    ...gitNames(['diff', '--name-only', '--', 'supabase/functions']),
    ...gitNames(['ls-files', '--others', '--exclude-standard', '--', 'supabase/functions']),
  ]);
  if (invalidBase) {
    console.warn('No valid base revision was available; checking the complete edge-function inventory.');
  } else if ([...names].some((name) => name.replaceAll('\\', '/').startsWith('supabase/functions/_shared/'))) {
    console.log('A shared edge module changed; checking every edge-function entry point.');
  } else {
    const changedFunctions = new Set(
      [...names]
        .map((name) => name.replaceAll('\\', '/').match(/^supabase\/functions\/([^/]+)\//)?.[1])
        .filter((name) => name && name !== '_shared'),
    );
    entries = allEntries.filter((entry) => changedFunctions.has(relative(root, dirname(entry)).split(sep)[0]));
  }
}

if (entries.length === 0) {
  console.log('No edge-function entry points changed.');
  process.exit(0);
}

const deno = process.env.DENO_BIN || 'deno';
let failures = 0;
for (const entry of entries) {
  const label = relative(process.cwd(), entry).replaceAll('\\', '/');
  console.log(`\n=== deno check ${label} ===`);
  const result = spawnSync(
    deno,
    ['check', '--config', resolve('certification/deno.json'), entry],
    { stdio: 'inherit', env: { ...process.env, DENO_NO_UPDATE_CHECK: '1' } },
  );
  if (result.error?.code === 'ENOENT') {
    console.error('Deno is not installed. Install Deno 2.x, then rerun this command.');
    process.exit(2);
  }
  if (result.status !== 0 || result.signal) failures += 1;
}

if (failures > 0) {
  console.error(`\n${failures} of ${entries.length} edge-function entry point(s) failed typecheck.`);
  process.exit(1);
}
console.log(`\n${entries.length} edge-function entry point(s) passed Deno typecheck.`);
