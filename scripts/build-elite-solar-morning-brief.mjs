#!/usr/bin/env node

import { buildEliteSolarMorningBrief } from './lib/elite-solar-morning-brief.mjs';
import { loadSolarExitBundle } from './lib/solar-exit-bundle.mjs';

function parseArguments(argumentsList) {
  let root;
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === '--root') {
      if (root !== undefined) throw new Error('--root may only be provided once.');
      const value = argumentsList[index + 1];
      if (!value || value.startsWith('--')) throw new Error('--root requires a campaign bundle directory.');
      root = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return { root };
}

try {
  const { root } = parseArguments(process.argv.slice(2));
  const brief = buildEliteSolarMorningBrief(loadSolarExitBundle(root));
  process.stdout.write(`${JSON.stringify(brief, null, 2)}\n`);
  if (!brief.offline_validation.valid) process.exitCode = 1;
} catch (error) {
  process.stderr.write(`${JSON.stringify({
    ok: false,
    error_code: 'ELITE_SOLAR_MORNING_BRIEF_FAILED',
    error: error instanceof Error ? error.message : String(error),
  })}\n`);
  process.exitCode = 1;
}
