import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const baseline = JSON.parse(readFileSync(resolve('certification/eslint-error-baseline.json'), 'utf8'));
const result = spawnSync(
  process.execPath,
  [resolve('node_modules/eslint/bin/eslint.js'), '.', '--quiet', '--format', 'json'],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
);

if (result.error || !result.stdout) {
  console.error(result.stderr || result.error || 'ESLint produced no machine-readable output.');
  process.exit(1);
}

let report;
try {
  report = JSON.parse(result.stdout);
} catch (error) {
  console.error('Could not parse ESLint JSON output.', error);
  console.error(result.stderr);
  process.exit(1);
}

const errors = report.flatMap((file) =>
  file.messages.filter((message) => message.severity === 2).map((message) => ({
    filePath: file.filePath,
    ruleId: message.ruleId ?? '<fatal>',
    message: message.message,
  })),
);
const fatalErrors = report.reduce((sum, file) => sum + (file.fatalErrorCount ?? 0), 0);

console.log(`ESLint errors: ${errors.length}; transitional ceiling: ${baseline.maximumErrors}.`);
if (fatalErrors > 0) {
  console.error(`ESLint reported ${fatalErrors} fatal parser/configuration error(s).`);
  process.exit(1);
}
if (errors.length > baseline.maximumErrors) {
  console.error(`ESLint error debt increased by ${errors.length - baseline.maximumErrors}.`);
  for (const error of errors.slice(0, 25)) {
    console.error(`- ${error.filePath}: ${error.ruleId}: ${error.message}`);
  }
  process.exit(1);
}
if (result.status !== 0 && result.status !== 1) {
  console.error(result.stderr);
  process.exit(result.status ?? 1);
}

console.log(`No new net ESLint error debt. ${baseline.maximumErrors - errors.length} legacy error(s) have been removed.`);
