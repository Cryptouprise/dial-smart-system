# security::client-secrets

- status: completed
- tldr: src/ clean: no real vendor secrets; only the public Supabase anon key hardcoded at client.ts:6 and AutomationEngine.tsx:53 (public-safe).

CONCERN (c) SECRETS IN CLIENT CODE - COMPLETE. Swept src/ (462 files). Verdict: no real vendor secret is embedded in client code.

Ranked result:
- LOW/informational (public-safe, not a leak): the Supabase PUBLIC anon key (JWT role=anon) is hardcoded in two spots -- src/integrations/supabase/client.ts:6 (+hardcoded project URL :5, file is auto-generated) and duplicated inline in src/components/AutomationEngine.tsx:53 as the 'apikey' header. Anon key is client-exposed by design.
- GOOD: zero matches for Stripe sk_live_/sk_test_/pk_live_, Slack xox, Google AIza, SendGrid SG., Telnyx KEY0, Retell key_, Twilio AC SID, GHL pit-, GitHub ghp_, Slack/Discord webhook URLs, 'BEGIN PRIVATE KEY', hardcoded Basic/Bearer, or credential-bearing URIs.
- GOOD: .env holds ONLY VITE_SUPABASE_URL/PROJECT_ID/PUBLISHABLE_KEY (all public-safe). NO service_role key in .env (classic browser-leak bug absent). No non-public secret is VITE_-prefixed.
- GOOD: server secret names (TELNYX_API_KEY, RETELL_AI_API_KEY, TWILIO_*, SUPABASE_SERVICE_ROLE) appear only as error strings, never values. GHL webhook key is generated server-side via RPC, not hardcoded.

Validation: multiple regex sweeps across all 462 src files; JWT payload decoded to role=anon; .env read as key NAMES only (no values printed).

Confidence: high for src/. Blocker/next: real secret risk (the 'believed leaked' Telnyx key) is NOT in src/ -- assign lanes for supabase/functions/, supabase/migrations/, git history, dist/, mcp-server/, and repo-root .deployed-*.ts. RLS correctness is the gating fact for the anon key's safety.

## Artifact

**Findings**

CONCERN (c) SECRETS IN CLIENT CODE - src/ (462 files) swept. NO real vendor secret is embedded in client code. Only secret-like literals found are one PUBLIC Supabase anon key (JWT role=anon, public-safe by design) hardcoded in two places, ranked LOW/informational. (1) src/integrations/supabase/client.ts:6 hardcodes SUPABASE_PUBLISHABLE_KEY, an auto-generated Supabase anon key whose JWT payload decodes to role:anon (ref emonjusymdripmkvtttc); line 5 hardcodes the project URL; file marked 'automatically generated' at line 1. (2) src/components/AutomationEngine.tsx:53 hardcodes the SAME anon key inline as the 'apikey' fetch header (line 52 Bearer session.access_token, line 49 VITE_SUPABASE_URL) - not a leak, just a duplicate vs importing the shared client. GOOD: zero matches across src/ for Stripe sk_live_/sk_test_/pk_live_, Slack xox, Google AIza, SendGrid SG., Telnyx KEY0, Retell key_, Twilio AC SID, GHL pit-, GitHub ghp_, Slack/Discord webhook URLs, 'BEGIN PRIVATE KEY', hardcoded Basic/Bearer literals, or credential-bearing postgres URIs. .env holds ONLY VITE_SUPABASE_URL, VITE_SUPABASE_PROJECT_ID, VITE_SUPABASE_PUBLISHABLE_KEY (all public-safe); NO service_role key in .env, so the classic service-role-in-browser bug is ABSENT. No non-public secret is VITE_-prefixed. Server secrets appear in client code by NAME only inside error strings (TELNYX_API_KEY EnhancedSpamDashboard.tsx:248,251; RETELL_AI_API_KEY/TWILIO_* SystemHealthCheck.tsx:180,231; provider comments telnyxAdapter.ts:29-30, twilioAdapter.ts:30). GHL webhook key generated server-side via rpc generate_webhook_key and stored in ghl_sync_settings (GHLWebhookConfig.tsx:65-66). index.html clean.

**evidence**

- src/integrations/supabase/client.ts:6 - hardcoded Supabase anon/publishable key (JWT role=anon); secret present (public-safe)
- src/integrations/supabase/client.ts:5 - hardcoded Supabase project URL
- src/components/AutomationEngine.tsx:53 - same anon key hardcoded as 'apikey'; secret present (public-safe)
- src/components/AutomationEngine.tsx:49,52 - VITE_SUPABASE_URL + dynamic Bearer session token
- sweep src/ for sk_live_|sk_test_|pk_live_|xox|AIza|BEGIN PRIVATE KEY|SG.|AC[0-9a-f]{32} => 2 matches in 2 files (both the anon key)
- sweep src/ eyJ => 2 matches in 2 files (same anon key)
- sweep src/ ghp_|glpat-|pit-|hooks.slack.com/services/|discord webhooks|postgres://user:pass@ => 0 matches
- sweep src/ SERVICE_ROLE|_KEY|_TOKEN|API_KEY|PASSWORD => 32 matches in 14 files, names/error-strings/localStorage keys only, no values
- .env names: VITE_SUPABASE_PROJECT_ID, VITE_SUPABASE_PUBLISHABLE_KEY, VITE_SUPABASE_URL only (values not printed)
- .env.example/.env.monitoring.example: only VITE_SUPABASE_*, VITE_SENTRY_DSN, VITE_ENVIRONMENT, VITE_APP_VERSION, flags
- src/components/settings/GHLWebhookConfig.tsx:65-66 generate_webhook_key RPC; 73-81 upsert to ghl_sync_settings

**validation**

Multiple independent regex sweeps over src/ (462 files) for Stripe/Slack/Google/SendGrid/Telnyx/Retell/Twilio/GHL/GitHub token prefixes, JWT eyJ, PRIVATE KEY blocks, Basic/Bearer literals, credential-bearing URLs, and secret env-var names. Only the public anon key matched. JWT payload decoded to role=anon. .env key NAMES only (values never printed). Cross-checked no VITE_-prefixed non-public secret exists.

**open_questions**

- Is RLS correct on all tables? A public anon key is only safe if row-level security holds - out of this lane, but it gates whether the anon key matters.
- App map says a Telnyx key is 'believed leaked' - not in src/; confirm in .env, edge functions, or git history (other lanes).

**what_i_did_not_check**

- supabase/functions/ (110 edge functions) and supabase/migrations/ (199) - server-side, where real secrets live
- git history / .git - previously committed secrets
- dist/ minified bundles - built artifacts
- mcp-server/ at repo root
- .deployed-*.ts files at repo root
- scripts/, campaigns/, certification/, content/, e2e/, .lovable/, .github/
- Base64/hex secrets not matching listed patterns (no entropy scan)
- actual .env values and whether served context leaks VITE_ vars

**confidence**: high