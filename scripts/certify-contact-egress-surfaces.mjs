#!/usr/bin/env node

import { assertContactEgressSurfaces } from './lib/contact-egress-surface-audit.mjs';

try {
  const report = assertContactEgressSurfaces();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
