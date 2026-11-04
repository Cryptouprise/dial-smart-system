# ce-wh-ghlshadow

- status: completed
- tldr: ghl-shadow-ingest: CORS absent, in-func Ed25519 raw-body guard @handler.ts:243, auth_kind=ed25519, anon_reachable=no, side effect=Vault-token-gated SECURITY DEFINER db RPC write

AUDIT ghl-shadow-ingest (RESEARCH ONLY, read-only). Result line:
ghl-shadow-ingest | cors_wildcard=absent | in_func_auth=yes@handler.ts:229,243 | auth_kind=ed25519 | anon_reachable=no | priv_side_effect=other(db-rpc-write) | note="if (!signature.valid || signature.scheme !== \"x-ghl-signature-ed25519\") return 401 INVALID_GHL_ED25519_SIGNATURE"

EVIDENCE
supabase/functions/ghl-shadow-ingest/handler.ts:229  if (modernSignature === null) {
supabase/functions/ghl-shadow-ingest/handler.ts:243  if (!signature.valid || signature.scheme !== "x-ghl-signature-ed25519") {
supabase/functions/_shared/ghl-webhook-signature.ts:100  return crypto.subtle.verify({ name: "Ed25519" }, key, signatureBytes, ownedBytes(input.rawBody));
supabase/functions/ghl-shadow-ingest/index.ts:63  const supabase = createClient(projectUrl, publishableKey, {
supabase/functions/ghl-shadow-ingest/index.ts:95  const { data, error } = await supabase.rpc("record_ghl_shadow_ingest_receipt",
supabase/migrations/20260713074000_ghl_shadow_ingest_lane.sql:483  PERFORM public.assert_ghl_shadow_ingest_rpc_token(p_rpc_token);
supabase/migrations/20260713074000_ghl_shadow_ingest_lane.sql:413  IF actual_sha256 IS DISTINCT FROM expected_sha256 THEN
supabase/config.toml:146  verify_jwt = false
supabase/functions/_shared/utils.ts:12  'Access-Control-Allow-Origin': '*',(corsHeaders; NOT imported here)

Notes: CORS wildcard ABSENT - regex grep of the function dir for cors/origin/_shared/utils returned 0 matches; responses carry only Content-Type/Cache-Control/X-Content-Type-Options; no OPTIONS branch (405 on non-POST at handler.ts:192). Ed25519 guard runs before all store calls. DB side effect is a Vault-token-gated SECURITY DEFINER RPC write via the anon/publishable client only - no service-role key, no paid provider call, no control-plane mutation.

## Artifact

**Findings**

CORS: NO wildcard. Access-Control-Allow-Origin '*' exists only in _shared/utils.ts:12 corsHeaders, which ghl-shadow-ingest never imports (regex grep of function dir for cors|Cors|CORS|origin|_shared/utils => 0 matches). Responses set only Content-Type/Cache-Control/X-Content-Type-Options (index.ts:35-39, handler.ts:64-68,181-184); no OPTIONS branch (non-POST => 405 handler.ts:192). cors_wildcard=ABSENT. In-function auth: REAL rejection. handler.ts:229 returns 401 GHL_ED25519_SIGNATURE_REQUIRED when x-ghl-signature is null; handler.ts:243 returns 401 INVALID_GHL_ED25519_SIGNATURE when !valid or scheme!=='x-ghl-signature-ed25519'. Verifier ghl-webhook-signature.ts:80-106 does crypto.subtle.verify Ed25519 over the exact rawBody with a pinned SPKI fingerprint (ghl-webhook-signature.ts:89-92). Not verify_jwt. auth_kind=ed25519. anon_reachable=NO: the guard (handler.ts:243) runs before ALL store calls (getEnabledContract@287, commitReceipt@387, commitMalformedSignedReceipt@136). Even without the guard the DB client is publishable/anon only (index.ts:46-47,63) and its only powers are two SECURITY DEFINER RPCs each gated by p_rpc_token (index.ts:76-82,95-113), which call assert_ghl_shadow_ingest_rpc_token (migration 20260713074000:429,483) comparing sha256(p_rpc_token) to Vault secret dial_smart_ghl_shadow_ingest_rpc_token_sha256 (migration:400-415, raise 42501); tables are REVOKE'd from anon (migration:660-665). priv_side_effect=other: db write via anon-key client invoking a Vault-token-gated SECURITY DEFINER RPC (record_ghl_shadow_ingest_receipt, index.ts:95-113) writing held/quarantined receipts. No service-role key, no paid-provider call, no control-plane mutation, no outbound fetch.

**evidence**

- supabase/functions/ghl-shadow-ingest/handler.ts:229  if (modernSignature === null) {
- supabase/functions/ghl-shadow-ingest/handler.ts:243  if (!signature.valid || signature.scheme !== "x-ghl-signature-ed25519") {
- supabase/functions/ghl-shadow-ingest/handler.ts:246  error_code: "INVALID_GHL_ED25519_SIGNATURE",
- supabase/functions/_shared/ghl-webhook-signature.ts:100  return crypto.subtle.verify({ name: "Ed25519" }, key, signatureBytes, ownedBytes(input.rawBody));
- supabase/functions/ghl-shadow-ingest/index.ts:63  const supabase = createClient(projectUrl, publishableKey, {
- supabase/functions/ghl-shadow-ingest/index.ts:95  const { data, error } = await supabase.rpc("record_ghl_shadow_ingest_receipt",
- supabase/migrations/20260713074000_ghl_shadow_ingest_lane.sql:483  PERFORM public.assert_ghl_shadow_ingest_rpc_token(p_rpc_token);
- supabase/config.toml:146  verify_jwt = false
- supabase/functions/_shared/utils.ts:12  'Access-Control-Allow-Origin': '*',  (corsHeaders; NOT imported by ghl-shadow-ingest)

**validation**

Read full text of index.ts (147 lines), handler.ts (398 lines), ghl-webhook-signature.ts (204 lines), utils.ts:1-30, config.toml:138-151, migration 20260713074000 (token assert 361-417, receipt RPC 444-495, grants 660-686). Corroborated CORS absence with a scoped regex grep over the function dir (0 matches) and a repo-wide agentgrep for Access-Control-Allow-Origin (97 files matched; ghl-shadow-ingest not among them).

**open_questions**

- Do certification/recovery-lineage-* migration snapshots match supabase/migrations/20260713074000 for the token-gate body?
- Is the deployed runtime's anon/publishable env present so buildRuntime succeeds, or does it 503 GHL_SHADOW_INGEST_DISABLED (index.ts:145)?

**edge_cases_considered**

- Malformed-but-signed bodies still commit a receipt: commitMalformedSignedReceipt (handler.ts:130-172) is only invoked AFTER the Ed25519 guard (handler.ts:257,268).
- Legacy X-WH-Signature RSA is passed to the verifier but its scheme is rejected at handler.ts:243, so legacy-only deliveries are never certified/persisted.
- No OPTIONS/preflight handling: non-POST (incl. OPTIONS) returns 405 (handler.ts:192-198), reinforcing no CORS surface.
- Anon CAN call the two RPCs directly (migration:683-686 GRANT ... TO anon) but both are Vault-token-gated, so a direct anon call fails 42501.

**what_i_did_not_check**

- Did not run handler.test.ts or the SQL contract tests (supabase/tests/ghl_shadow_ingest_contract.sql).
- Did not exhaustively read the full body of record_ghl_shadow_ingest_receipt beyond the token assert, input validation, and commit-status contract used by index.ts:117-126.
- Did not inspect v10-v24 certification/recovery-lineage migration copies for drift from supabase/migrations/20260713074000.
- Did not verify at runtime whether SUPABASE_ANON_KEY vs SUPABASE_PUBLISHABLE_KEY is set in the deployed project (index.ts:46-47).

**confidence**: high