#!/usr/bin/env node

import { assertProviderAdministrationSurfaces } from './lib/provider-administration-surface-audit.mjs';

try {
  const report = assertProviderAdministrationSurfaces();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
