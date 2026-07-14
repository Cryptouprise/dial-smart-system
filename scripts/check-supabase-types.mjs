import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const command = process.env.SUPABASE_BIN || 'supabase';
const result = spawnSync(
  command,
  ['gen', 'types', 'typescript', '--local'],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, shell: process.platform === 'win32' },
);
if (result.error || result.status !== 0) {
  console.error(result.stderr || result.error || 'Supabase type generation failed.');
  console.error('Start the disposable local Supabase stack before running npm run check:schema-types.');
  process.exit(result.status ?? 1);
}

const normalize = (value) => value.replaceAll('\r\n', '\n').trimEnd();
const generated = normalize(result.stdout);
const committedPath = resolve('src/integrations/supabase/types.ts');
const committed = normalize(readFileSync(committedPath, 'utf8'));
if (generated !== committed) {
  console.error('Committed Supabase TypeScript types do not match the rebuilt local schema.');
  console.error('Regenerate src/integrations/supabase/types.ts only after the migration stack rebuilds cleanly.');
  process.exit(1);
}
console.log('Committed Supabase types match the rebuilt local schema.');
