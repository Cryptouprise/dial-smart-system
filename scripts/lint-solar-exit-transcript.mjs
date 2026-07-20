#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadSolarExitBundle } from './lib/solar-exit-bundle.mjs';
import {
  SolarExitTranscriptLintError,
  lintSolarExitTranscript,
} from './lib/solar-exit-transcript-lint.mjs';

function parseArgs(argv) {
  if (argv.length !== 2 || argv[0] !== '--input') {
    throw new SolarExitTranscriptLintError('USAGE', 'Usage: node scripts/lint-solar-exit-transcript.mjs --input <synthetic-transcript.json>');
  }
  return resolve(argv[1]);
}

try {
  const inputPath = parseArgs(process.argv.slice(2));
  const input = JSON.parse(await readFile(inputPath, 'utf8'));
  const result = lintSolarExitTranscript(loadSolarExitBundle(), input);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.passed_automated_checks) process.exitCode = 2;
} catch (error) {
  const code = error instanceof SolarExitTranscriptLintError ? error.code : 'TRANSCRIPT_LINT_FAILED';
  process.stderr.write(`${JSON.stringify({ ok: false, error_code: code })}\n`);
  process.exitCode = 1;
}
