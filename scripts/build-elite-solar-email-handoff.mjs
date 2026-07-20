#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  EliteSolarEmailHandoffError,
  buildEliteSolarEmailHandoffProposal,
} from './lib/elite-solar-email-handoff.mjs';

const TEMPLATE = Object.freeze({
  version: 'elite.solar.email.handoff.v1',
  organization_id: '__REQUIRED_ORGANIZATION_UUID__',
  campaign_id: '__REQUIRED_CAMPAIGN_UUID__',
  provider_account_reference: 'replace-provider-account-reference',
  recipient_manifest_sha256: '__REQUIRED_64_HEX_RECIPIENT_MANIFEST_DIGEST__',
  recipient_count: 25,
  source_release_reference: 'replace-reviewed-source-release-reference',
  suppression_snapshot_sha256: '__REQUIRED_64_HEX_SUPPRESSION_SNAPSHOT_DIGEST__',
  copy_approval_reference: 'replace-copy-approval-reference',
  compliance_approval_reference: 'replace-compliance-approval-reference',
  owner_approval_reference: 'replace-owner-approval-reference',
  expires_at: '__REQUIRED_UTC_EXPIRY_10_MIN_TO_24_HOURS__',
});

function parseArguments(argumentsList) {
  let draft;
  let release;
  let template = false;
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === '--draft' || argument === '--release') {
      const value = argumentsList[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${argument} requires a JSON file.`);
      if (argument === '--draft') {
        if (draft !== undefined) throw new Error('--draft may only be provided once.');
        draft = resolve(value);
      } else {
        if (release !== undefined) throw new Error('--release may only be provided once.');
        release = resolve(value);
      }
      index += 1;
    } else if (argument === '--template') {
      if (template) throw new Error('--template may only be provided once.');
      template = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (template && (draft || release)) throw new Error('--template cannot be combined with --draft or --release.');
  if (!template && (!draft || !release)) throw new Error('--draft and --release are required.');
  return { draft, release, template };
}

try {
  const args = parseArguments(process.argv.slice(2));
  if (args.template) {
    process.stdout.write(`${JSON.stringify(TEMPLATE, null, 2)}\n`);
  } else {
    const [draftRaw, releaseRaw] = await Promise.all([
      readFile(args.draft, 'utf8'),
      readFile(args.release, 'utf8'),
    ]);
    const proposal = buildEliteSolarEmailHandoffProposal({
      draftInput: JSON.parse(draftRaw),
      releaseRequest: JSON.parse(releaseRaw),
    });
    process.stdout.write(`${JSON.stringify(proposal, null, 2)}\n`);
  }
} catch (error) {
  const code = error instanceof EliteSolarEmailHandoffError ? error.code : 'ELITE_SOLAR_EMAIL_HANDOFF_FAILED';
  process.stderr.write(`${JSON.stringify({ ok: false, error_code: code })}\n`);
  process.exitCode = 1;
}
