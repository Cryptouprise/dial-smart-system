# sr::billing-credit::ringba-enrich-proxy

- status: completed
- tldr: ringba-enrich-proxy: service-role=YES, disabled=NO (no 503), caller-verified=NO (unverified client). Dead-but-enabled.

AUDIT COMPLETE: supabase/functions/ringba-enrich-proxy/index.ts (dial-smart-system).

DELIVERABLE: index.ts:83-85 | uses-service-role=YES | disabled=NO | caller-verified=NO (UNVERIFIED-CLIENT) | evidence line 84-85: const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!; const supabase = createClient(supabaseUrl, serviceKey);

(1) service role: YES — reads SUPABASE_SERVICE_ROLE_KEY (index.ts:84), builds service-role client (85), reads leads PII (89-94).
(2) disable gate + 503: NONE — no gate, no 503 anywhere in the 183-line file; only OPTIONS 200 (24-26), success JSON (167-175), 500 (178-181). Repo grep: 503 in 106 other functions, absent here.
(3) caller verification: NOT verified — no JWT/auth.getUser/shared-secret; `apikey` only in CORS headers (18). Any caller = UNVERIFIED-CLIENT triggering service-role read + outbound fetch.

Ringba discontinued company-wide; function posts to display.ringba.com/enrich (21,160,163) but is NOT code-disabled, so it is dead-but-enabled (existing callers e.g. test-harness JSON:47 would still fire). Effective disable is the dead upstream, not code.

RESIDUAL RISK (THEORY): unauthenticated service-role PII read (email/address/phone), no rate limiting. Recommend delete or code-disable (410/503).

No secrets printed. Node completed with high confidence.

## Artifact

**Findings**

DELIVERABLE: supabase/functions/ringba-enrich-proxy/index.ts:83-85 | uses-service-role=YES | disabled=NO | caller-verified=NO (UNVERIFIED-CLIENT) | evidence line 84-85: const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!; const supabase = createClient(supabaseUrl, serviceKey);. FACT (1) uses-service-role=YES: reads SUPABASE_SERVICE_ROLE_KEY and builds a service-role client (index.ts:84-85) used to read the leads table (index.ts:89-94: first_name,last_name,email,address,city,state,zip_code,phone_number,custom_fields). FACT (2) disabled=NO: no hardcoded disable gate and no 503 anywhere; only responses are OPTIONS 200 (24-26), success JSON (167-175), 500 on error (178-181). Repo grep: `503` appears in 106 other functions but NOT this one. FACT (3) caller-verified=NO -> UNVERIFIED-CLIENT: no JWT/Authorization parsing, no auth.getUser(), no shared-secret/api-key comparison; sole `apikey` mention is CORS allow-headers (line 18), not verification. Any caller reaching the URL triggers a service-role PII read + outbound Ringba fetch. Not VERIFIED (no JWT) and not SERVICE-ONLY-TRUST (needs a verified service caller). FACT Ringba is discontinued company-wide; RINGBA_BASE='https://display.ringba.com/enrich' (21,160,163). Function is NOT code-disabled (no gate) so it is dead-but-enabled: existing callers (e.g. test-harness JSON:47) would still invoke it and fire at the retired Ringba endpoint; the dead upstream, not code, is the effective disable. THEORY: unauthenticated service-role read (lead email/address/phone) is the material residual risk; no rate limiting present.

**evidence**

- supabase/functions/ringba-enrich-proxy/index.ts:84 - const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
- supabase/functions/ringba-enrich-proxy/index.ts:85 - const supabase = createClient(supabaseUrl, serviceKey);
- supabase/functions/ringba-enrich-proxy/index.ts:89-94 - service-role read: supabase.from('leads').select('first_name,last_name,email,address,city,state,zip_code,phone_number,custom_fields').in('phone_number', variants)
- supabase/functions/ringba-enrich-proxy/index.ts:18 - 'apikey' listed only in CORS Access-Control-Allow-Headers (not verification)
- supabase/functions/ringba-enrich-proxy/index.ts:23-183 - no JWT/auth/user check; only OPTIONS 200 (24-26), success JSON (167-175), 500 (178-181); no 503
- supabase/functions/ringba-enrich-proxy/index.ts:21,160,163 - RINGBA_BASE = 'https://display.ringba.com/enrich'
- scripts/test-harness/_build_grace_test_llm.json:47 - existing caller URL .../functions/v1/ringba-enrich-proxy?phone={{phone}}&lead_id={{lead_id}}

**validation**

Read the entire 183-line file in one read (no truncation). Cross-checked with repo grep: `503` present in 106 other functions but absent here; `ringba-enrich-proxy` found only in docs/_swarm registry files and scripts/test-harness/_build_grace_test_llm.json:47. No secret values printed (env var name cited only).

**open_questions**

- Should this function be deleted or code-disabled (return 410/503) now that Ringba is discontinued, to close the unauthenticated service-role read surface?
- Is the function still deployed/reachable on the live Supabase project (emonjusymdripmkvtttc)?
- Are there live Retell/GHL configs still pointing at this endpoint beyond the test-harness file?

**what_i_did_not_check**

- Did not query live Supabase to confirm the function is currently deployed/active (research-only, no live calls).
- Did not inspect `leads` RLS policies to confirm the service-role client bypasses row security.
- Did not enumerate every caller (Retell tool configs / GHL workflows) that may still invoke this URL; only the one test-harness reference was found via grep.
- Did not check for an indirect global Ringba kill-switch / feature flag elsewhere in the repo.

**confidence**: high