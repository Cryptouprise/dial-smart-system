# sr::crm-ghl

- status: completed
- tldr: 8-function service-role auth audit done: 6 gated (4 dead-code behind 503), 2 ungated+unverified (update-lead-info, bulk-lead-import) = HIGH RISK client-trusted identity.

Service-role auth audit complete for all 8 GHL/CRM/sync edge functions. Per-file: path:line | uses-service-role | disabled gate | caller-verified | evidence.

1) ghl-integration/index.ts | YES (89,94) | YES hardcoded isGhlMultiAccountSyncCertified()=>false (63-65)->503 (75-85) | VERIFIED (auth.getUser 102 + server-side org authorizeOrganizationContext 127-131 -> _shared/tenant-context.ts:66-84)
2) ghl-batch-callback/index.ts | YES (312,318) | YES gate=>false (9-11)->503 (298-308) | SERVICE-ONLY-TRUST (header presence only 321-327; trusts body user_id 330; never auth.getUser)
3) ghl-webhook-trigger/index.ts | YES (100,106) UNREACHABLE | YES unconditional 503 (88-96) | UNVERIFIED-CLIENT-ORG (webhook_key->user_id 149-153, no org/signature)
4) ghl-shadow-ingest/index.ts | NO - anon/publishable key (46-47,63) | fail-closed 503 when unconfigured (23-42,136-146) | VERIFIED (ed25519 x-ghl-signature required, handler.ts:228-246)
5) twilio-integration/index.ts | YES (46,55) | YES unconditional 503 (34-42) | VERIFIED (auth.getUser 63) but dead code behind return
6) update-lead-info/index.ts | YES (88,89) | NO gate | UNVERIFIED-CLIENT-ORG (no auth; body phone/lead_id 77-78 updates any lead 92-100) HIGH RISK
7) bulk-lead-import/index.ts | YES (64,65) | NO gate | UNVERIFIED-CLIENT-ORG (trusts body.userId 97,136) HIGH RISK
8) airtable-sync/index.ts | YES (50,56) | YES gate=>false (10-12)->503 (36-46) | SERVICE-ONLY-TRUST (no verification, dead code)

Top risk: update-lead-info and bulk-lead-import have no in-function gate and no caller verification. Both are absent from supabase/config.toml (others have explicit verify_jwt); they fall back to platform default JWT, but the write identity is still a client-supplied value (phone/lead_id/userId), so a valid-JWT caller can target another tenant's records.

Validation: direct reads of each index.ts + tenant-context.ts + ghl-shadow handler.ts + config.toml. No secrets printed.

## Artifact

**Findings**

PER-FILE (path:line | uses-service-role | disabled | caller-verified | evidence):
1) ghl-integration/index.ts | YES (89,94) | YES hardcoded isGhlMultiAccountSyncCertified()=>false (63-65) -> 503 (75-85) | VERIFIED (auth.getUser 102; server-side org via authorizeOrganizationContext 127-131 -> tenant-context.ts:66-84 membership) | evidence as cited.
2) ghl-batch-callback/index.ts | YES (312,318) | YES gate func=>false (9-11) -> 503 (298-308) | SERVICE-ONLY-TRUST (only header presence 321-327; never auth.getUser; trusts body user_id 330) | dead code behind gate.
3) ghl-webhook-trigger/index.ts | YES (100,106) but UNREACHABLE | YES unconditional 503 (88-96) returns before try | UNVERIFIED-CLIENT-ORG (webhook_key DB lookup->user_id 149-153, no org/signature; unreachable) | evidence as cited.
4) ghl-shadow-ingest/index.ts | NO (anon/publishable key 46-47,63) | fail-closed 503 when unconfigured (23-42,136-146); no always-503 gate | VERIFIED (requires ed25519 x-ghl-signature, handler.ts:228-246) | evidence as cited.
5) twilio-integration/index.ts | YES (46,55) | YES unconditional 503 (34-42) | VERIFIED-ish (auth.getUser 63) but dead code behind return | evidence as cited.
6) update-lead-info/index.ts | YES (88,89) | NO gate | UNVERIFIED-CLIENT-ORG (no auth at all; body phone/lead_id 77-78 updates any lead 92-100) | HIGH RISK.
7) bulk-lead-import/index.ts | YES (64,65) | NO gate | UNVERIFIED-CLIENT-ORG (trusts body.userId 97,136; no auth) | HIGH RISK.
8) airtable-sync/index.ts | YES (50,56) | YES gate func=>false (10-12) -> 503 (36-46) | SERVICE-ONLY-TRUST (no caller verification; dead code) | evidence as cited.
GATEWAY FACT: update-lead-info and bulk-lead-import are ABSENT from supabase/config.toml (fall back to platform default JWT verification); the other six have explicit verify_jwt lines.

**evidence**

- ghl-integration/index.ts:75-85 gate 503; :89/:94 service role; :102 auth.getUser; :127-131 authorizeOrganizationContext
- ghl-batch-callback/index.ts:9-11 gate func; :298-308 gate 503; :312/:318 service role; :321-327 header-presence only; :330 body user_id
- ghl-webhook-trigger/index.ts:88-96 unconditional 503; :100/:106 service role; :149-153 webhook_key lookup
- ghl-shadow-ingest/index.ts:46-47/:63 anon/publishable client; :23-42/:136-146 fail-closed 503; ghl-shadow-ingest/handler.ts:228-246 ed25519 signature required
- twilio-integration/index.ts:34-42 unconditional 503; :46/:55 service role; :63 auth.getUser
- update-lead-info/index.ts:88-89 service role; :77-78 phone/lead_id from body; :92-100 arbitrary-lead select; :136-159 update
- bulk-lead-import/index.ts:64-65 service role; :97/:136 body.userId trusted
- airtable-sync/index.ts:10-12 gate func; :36-46 gate 503; :50/:56 service role
- _shared/tenant-context.ts:66-84 authorizeOrganizationContext membership check
- supabase/config.toml explicit verify_jwt lines 140,146,149,153,384,389; update-lead-info/bulk-lead-import absent

**validation**

Read each function's index.ts directly (grep SUPABASE_SERVICE_ROLE_KEY/createClient/auth.getUser/503/disabled + targeted region reads). Verified the three cert-gate helper bodies all return false (ghl-integration:63-65, ghl-batch-callback:9-11, airtable-sync:10-12). Read _shared/tenant-context.ts to confirm server-side org derivation. Confirmed ed25519 signature enforcement in ghl-shadow-ingest/handler.ts. Cross-checked supabase/config.toml verify_jwt for all 8. Research-only; no secrets printed.

**open_questions**

- Is live deployed state identical to repo for update-lead-info/bulk-lead-import (gates added that repo lacks)? Not verifiable read-only.
- Is the platform default verify_jwt actually true/enforced on deployed functions for the two unlisted functions?
- Does update-lead-info get called by Retell with a JWT or anon key only? Determines real blast radius.

**what_i_did_not_check**

- Deployed/live function config vs repo (repo-only read).
- Other callers' auth paths and whether call-tracking-webhook re-verifies.
- Whether Supabase platform default verify_jwt is actually true on the deployed project for the two unlisted functions.
- RLS policies on leads (service role bypasses RLS).
- Full bodies of twilio-integration (1500+ lines) and ghl-integration (1000+ lines) beyond auth/gate regions.

**confidence**: high