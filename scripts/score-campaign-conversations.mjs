#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildConversationResultTemplate,
  loadSolarExitBundle,
  scoreConversationResults,
} from './lib/solar-exit-bundle.mjs';

function option(name) {
  const exact = process.argv.find((argument) => argument.startsWith(`--${name}=`));
  if (exact) return exact.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

try {
  const bundle = loadSolarExitBundle(option('root'));
  if (process.argv.includes('--template')) {
    process.stdout.write(`${JSON.stringify(buildConversationResultTemplate(bundle), null, 2)}\n`);
  } else {
    const input = option('input');
    if (!input) throw new Error('Provide --input <results.json>, or use --template to print a blank evidence form.');
    const trustedContextInput = option('trusted-context');
    if (!trustedContextInput) throw new Error('Provide an independently produced --trusted-context <provider-evidence.json>.');
    if (resolve(input) === resolve(trustedContextInput)) throw new Error('Execution results and trusted provider context must be separate files.');
    const execution = JSON.parse(readFileSync(resolve(input), 'utf8'));
    const trustedExecutionContext = JSON.parse(readFileSync(resolve(trustedContextInput), 'utf8'));
    const score = scoreConversationResults(bundle, execution, { trustedExecutionContext });
    process.stdout.write(`${JSON.stringify(score, null, 2)}\n`);
    if (!score.valid) process.exitCode = 1;
  }
} catch (error) {
  console.error(`Conversation scoring failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
