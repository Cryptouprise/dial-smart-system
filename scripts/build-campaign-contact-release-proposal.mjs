#!/usr/bin/env node

import { readFileSync } from 'node:fs';

import { buildCanary5CampaignContactReleaseProposal } from './lib/campaign-contact-release-proposal.mjs';
import { loadSolarExitBundle, loadSolarExitTrustRoot } from './lib/solar-exit-bundle.mjs';

function option(name, fallback) {
  const exact = process.argv.find((argument) => argument.startsWith(`--${name}=`));
  if (exact) return exact.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const root = option('root', undefined);
const trustRootPath = option('trust-root', undefined);
const inputPath = option('input', undefined);
const template = process.argv.includes('--template');

const canary5RequestTemplate = Object.freeze({
  schema_version: '1.0.0',
  release_id: '__REQUIRED_NEW_RELEASE_UUID__',
  organization_id: '__REQUIRED_DIALSMART_ORGANIZATION_UUID__',
  user_id: '__REQUIRED_DIALSMART_OWNER_USER_UUID__',
  campaign_id: '__REQUIRED_EXISTING_CAMPAIGN_UUID__',
  caller_number_id: '__REQUIRED_OWNED_CALLER_NUMBER_UUID__',
  release_stage: 'canary_5',
  expires_at: '__REQUIRED_UTC_EXPIRY_10_MIN_TO_24_HOURS_FROM_COMPILATION__',
  cohort_lead_ids: [
    '__REQUIRED_CONSENTED_LEAD_UUID_1__',
    '__REQUIRED_CONSENTED_LEAD_UUID_2__',
    '__REQUIRED_CONSENTED_LEAD_UUID_3__',
    '__REQUIRED_CONSENTED_LEAD_UUID_4__',
    '__REQUIRED_CONSENTED_LEAD_UUID_5__',
  ],
});

try {
  if (template) {
    if (root || trustRootPath || inputPath || process.argv.length !== 3) {
      throw new Error('--template cannot be combined with any other option.');
    }
    process.stdout.write(`${JSON.stringify(canary5RequestTemplate, null, 2)}\n`);
    process.exit(0);
  }
  if (!trustRootPath) throw new Error('--trust-root is required.');
  if (!inputPath) throw new Error('--input is required.');
  if (process.argv.includes('--write') || process.argv.includes('--apply') || process.argv.includes('--activate')) {
    throw new Error('This command only compiles a review artifact and never writes, applies, or activates a release.');
  }

  const bundle = loadSolarExitBundle(root);
  const trustRoot = loadSolarExitTrustRoot(trustRootPath, {
    candidateRoot: bundle.root,
    expectedSha256: process.env.SOLAR_EXIT_TRUST_ROOT_SHA256,
  });
  const request = JSON.parse(readFileSync(inputPath, 'utf8'));
  const proposal = buildCanary5CampaignContactReleaseProposal(bundle, { trustRoot, request });
  process.stdout.write(`${JSON.stringify(proposal, null, 2)}\n`);
} catch (error) {
  console.error(`Campaign contact-release proposal was not compiled: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
