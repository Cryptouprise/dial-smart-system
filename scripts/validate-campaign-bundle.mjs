#!/usr/bin/env node

import {
  compileSolarExitDraft,
  loadSolarExitBundle,
  loadSolarExitTrustRoot,
  validateSolarExitBundleData,
} from './lib/solar-exit-bundle.mjs';

function option(name, fallback) {
  const exact = process.argv.find((argument) => argument.startsWith(`--${name}=`));
  if (exact) return exact.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const mode = option('mode', 'offline');
const root = option('root', undefined);
const trustRootPath = option('trust-root', undefined);
const emitCompiled = process.argv.includes('--emit-compiled');
const json = process.argv.includes('--json') || emitCompiled;

try {
  const bundle = loadSolarExitBundle(root);
  const trustRoot = trustRootPath
    ? loadSolarExitTrustRoot(trustRootPath, {
      candidateRoot: bundle.root,
      expectedSha256: process.env.SOLAR_EXIT_TRUST_ROOT_SHA256,
    })
    : null;
  const report = validateSolarExitBundleData(bundle, { mode, trustRoot });

  if (emitCompiled) {
    if (!report.valid) throw new Error(`Cannot compile an invalid bundle (${report.error_count} error(s)).`);
    process.stdout.write(`${JSON.stringify(compileSolarExitDraft(bundle, { trustRoot }), null, 2)}\n`);
  } else if (json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    const outcome = report.valid ? 'PASS' : 'FAIL';
    console.log(`Solar Exit ${mode} validation: ${outcome}`);
    console.log(`Artifacts: ${report.counts.dispositions} dispositions, ${report.counts.conversation_tests} conversation tests, ${report.counts.synthetic_leads} synthetic leads`);
    console.log(`Validation: ${report.error_count} error(s), ${report.warning_count} warning(s)`);
    for (const issue of report.issues) {
      console.log(`- [${issue.severity.toUpperCase()}] ${issue.code}: ${issue.message}`);
    }
    if (report.launch_blockers.length > 0) {
      console.log(`Production launch blockers (${report.launch_blockers.length}):`);
      report.launch_blockers.forEach((blocker) => console.log(`- ${blocker}`));
    }
  }

  if (!report.valid) process.exitCode = 1;
} catch (error) {
  console.error(`Solar Exit validation failed to run: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
