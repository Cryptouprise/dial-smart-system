#!/usr/bin/env node

import {
  loadPilotPortfolio,
  summarizePilotPortfolio,
  validatePilotPortfolio,
} from './lib/pilot-portfolio.mjs';

try {
  let root;
  let json = false;
  let summary = false;
  const argumentsList = process.argv.slice(2);
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === '--root') {
      if (root !== undefined) throw new Error('--root may only be provided once.');
      const candidate = argumentsList[index + 1];
      if (!candidate || candidate.startsWith('--')) throw new Error('--root requires a directory.');
      root = candidate;
      index += 1;
    } else if (argument === '--json') {
      if (json) throw new Error('--json may only be provided once.');
      json = true;
    } else if (argument === '--summary') {
      if (summary) throw new Error('--summary may only be provided once.');
      summary = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  const portfolio = loadPilotPortfolio(root);
  const report = validatePilotPortfolio(portfolio);
  const output = summary ? summarizePilotPortfolio(portfolio) : report;
  if (json || summary) {
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  } else {
    process.stdout.write(`Pilot portfolio validation: ${report.valid ? 'PASS' : 'FAIL'}\n`);
    process.stdout.write(`Pilots: ${portfolio.manifest.pilots.length}; production launch: disabled\n`);
    for (const entry of portfolio.manifest.pilots) {
      process.stdout.write(`- ${entry.display_name}: ${entry.pilot_status}; next: ${entry.next_gate}\n`);
    }
    for (const entry of report.issues) process.stdout.write(`- [${entry.code}] ${entry.path}: ${entry.message}\n`);
  }
  if (!report.valid) process.exitCode = 1;
} catch (error) {
  process.stderr.write(`Pilot portfolio validation failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
