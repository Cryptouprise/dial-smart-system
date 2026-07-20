#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { inspectInstantlyEmailReadiness } from './instantly-email-readiness.mjs';
import { inspectMailgunEmailReadiness } from './mailgun-email-readiness.mjs';
import { buildEmailProviderReadinessBrief } from './lib/email-provider-readiness-brief.mjs';

function parseArguments(argumentsList) {
  if (argumentsList.length > 0) throw new Error(`Unknown argument: ${argumentsList[0]}`);
}

export async function main({ environment = process.env } = {}) {
  parseArguments(process.argv.slice(2));
  return buildEmailProviderReadinessBrief({
    instantly: {
      apiKey: environment.INSTANTLY_API_KEY,
      baseUrl: environment.INSTANTLY_BASE_URL,
    },
    mailgun: {
      apiKey: environment.MAILGUN_API_KEY,
      domain: environment.MAILGUN_DOMAIN,
      baseUrl: environment.MAILGUN_BASE_URL,
    },
    inspectInstantly: inspectInstantlyEmailReadiness,
    inspectMailgun: inspectMailgunEmailReadiness,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const brief = await main();
    process.stdout.write(`${JSON.stringify(brief)}\n`);
    if (brief.status === 'readiness_blocked') process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      kind: 'email_provider_readiness_brief_v1',
      status: 'invalid_request',
      error_code: 'EMAIL_PROVIDER_READINESS_BRIEF_FAILED',
      error: error instanceof Error ? error.message : String(error),
    })}\n`);
    process.exitCode = 1;
  }
}
