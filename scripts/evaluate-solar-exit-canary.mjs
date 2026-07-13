#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  SOLAR_EXIT_CANARY_TEMPLATE_STAGES,
  buildSolarExitCanaryTemplate,
  computeCanaryEvidenceDigest,
  evaluateSolarExitCanary,
} from './lib/solar-exit-canary.mjs';

const usage = `Usage:
  node scripts/evaluate-solar-exit-canary.mjs --input <results.json>
  node scripts/evaluate-solar-exit-canary.mjs --input <results.json> --evidence-digest
  node scripts/evaluate-solar-exit-canary.mjs --template <owned_phone_20|live_5|live_20|live_50>

Template generation writes JSON to stdout only. The command never creates or overwrites a file.
Exit 0 means template/promote/normal, exit 2 means hold, and exit 1 means command failure.`;

function parseArguments(arguments_) {
  const allowed = new Set(['--input', '--template', '--evidence-digest', '--help']);
  const parsed = { input: null, template: null, evidenceDigest: false, help: false };
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (!allowed.has(argument)) throw new Error(`Unknown argument: ${argument}`);
    if (argument === '--input' || argument === '--template') {
      const value = arguments_[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value.`);
      if (argument === '--input') parsed.input = value;
      else parsed.template = value;
      index += 1;
    } else if (argument === '--evidence-digest') parsed.evidenceDigest = true;
    else parsed.help = true;
  }
  return parsed;
}

try {
  const arguments_ = parseArguments(process.argv.slice(2));
  if (arguments_.help) {
    process.stdout.write(`${usage}\n`);
  } else {
    if (Boolean(arguments_.input) === Boolean(arguments_.template)) throw new Error('Provide exactly one of --input or --template.');
    if (arguments_.template) {
      if (arguments_.evidenceDigest) throw new Error('--evidence-digest is only valid with --input.');
      if (!Object.hasOwn(SOLAR_EXIT_CANARY_TEMPLATE_STAGES, arguments_.template)) {
        throw new Error(`Unknown template. Expected one of: ${Object.keys(SOLAR_EXIT_CANARY_TEMPLATE_STAGES).join(', ')}.`);
      }
      process.stdout.write(`${JSON.stringify(buildSolarExitCanaryTemplate(arguments_.template), null, 2)}\n`);
    } else {
      const input = JSON.parse(readFileSync(resolve(arguments_.input), 'utf8'));
      if (arguments_.evidenceDigest) {
        process.stdout.write(`${computeCanaryEvidenceDigest(input)}\n`);
      } else {
        const report = evaluateSolarExitCanary(input);
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
        if (!report.passed) process.exitCode = 2;
      }
    }
  }
} catch (error) {
  process.stderr.write(`Solar Exit canary evaluation failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
