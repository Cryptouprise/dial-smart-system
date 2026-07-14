import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const shardCount = Number.parseInt(process.env.VITEST_SHARD_COUNT ?? '4', 10);
const requestedShard = process.env.VITEST_SHARD;

if (!Number.isInteger(shardCount) || shardCount < 1) {
  console.error('VITEST_SHARD_COUNT must be a positive integer.');
  process.exit(2);
}

const shardPattern = /^([1-9]\d*)\/([1-9]\d*)$/;
const shards = requestedShard
  ? [requestedShard]
  : Array.from({ length: shardCount }, (_, index) => `${index + 1}/${shardCount}`);

for (const shard of shards) {
  const match = shard.match(shardPattern);
  if (!match || Number(match[1]) > Number(match[2])) {
    console.error(`Invalid VITEST_SHARD value: ${shard}. Expected, for example, 1/4.`);
    process.exit(2);
  }
}

const vitestEntry = resolve('node_modules/vitest/vitest.mjs');
if (!existsSync(vitestEntry)) {
  console.error('Vitest is not installed. Run npm ci first.');
  process.exit(2);
}

function findTests(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...findTests(path));
    else if (/\.(test|spec)\.(c|m)?(j|t)sx?$/.test(entry.name)) files.push(path);
  }
  return files;
}

const tests = findTests(resolve('src'))
  .map((file) => relative(process.cwd(), file).replaceAll('\\', '/'))
  .sort();

for (const shard of shards) {
  const [, shardIndex, totalShards] = shard.match(shardPattern).map(Number);
  const selected = tests.filter((_, index) => index % totalShards === shardIndex - 1);
  console.log(`\n=== Vitest shard ${shard}: ${selected.length} isolated test files ===`);
  for (const testFile of selected) {
    console.log(`\n--- ${testFile} ---`);
    // Run each file in a fresh process. This prevents module/DOM retention in
    // one legacy test from accumulating until a later worker OOMs.
    const result = spawnSync(
      process.execPath,
      [vitestEntry, 'run', testFile],
      { stdio: 'inherit', env: { ...process.env, VITEST_SHARD: '' } },
    );

    if (result.error) {
      console.error(`Unable to start ${testFile}:`, result.error);
      process.exit(1);
    }
    if (result.signal) {
      console.error(`${testFile} was terminated by signal ${result.signal}.`);
      process.exit(1);
    }
    if (result.status !== 0) {
      console.error(`${testFile} failed with exit code ${result.status}.`);
      process.exit(result.status ?? 1);
    }
  }
}

console.log(`\nAll ${shards.length} requested Vitest shard(s) passed without worker crashes or unhandled errors.`);
