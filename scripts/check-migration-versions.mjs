import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationDir = resolve('supabase/migrations');
const baseline = JSON.parse(readFileSync(resolve('certification/migration-version-baseline.json'), 'utf8'));
const groups = new Map();
const modernPrefixFloor = '20260712';

for (const name of readdirSync(migrationDir).filter((file) => file.endsWith('.sql')).sort()) {
  const match = name.match(/^(\d+)[_-]/);
  if (!match) {
    console.error(`Migration does not start with a numeric version: ${name}`);
    process.exitCode = 1;
    continue;
  }
  if (match[1] >= modernPrefixFloor && match[1].length !== 14) {
    console.error(`New migration must use a unique 14-digit UTC timestamp prefix: ${name}`);
    process.exitCode = 1;
  }
  const entries = groups.get(match[1]) ?? [];
  entries.push(name);
  groups.set(match[1], entries);
}

const collisions = [...groups.entries()].filter(([, files]) => files.length > 1);
const violations = [];
for (const [version, files] of collisions) {
  const allowed = baseline.allowedLegacyCollisions[version];
  const unexpected = allowed ? files.filter((file) => !allowed.includes(file)) : files;
  if (!allowed || unexpected.length > 0) violations.push({ version, files });
}

if (violations.length > 0) {
  console.error('New or expanded migration version collisions detected:');
  for (const violation of violations) {
    console.error(`- ${violation.version}: ${violation.files.join(', ')}`);
  }
  process.exit(1);
}
if (process.exitCode) process.exit(process.exitCode);

console.log(`${collisions.length} known legacy migration collision group(s); no new or expanded collisions.`);
console.log('New migrations must use a unique 14-digit UTC timestamp prefix.');
