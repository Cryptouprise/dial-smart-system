# ce-wh-telnyx

- status: completed
- tldr: telnyx-webhook: cors=yes@16, ed25519 auth@218, launch-quarantined (L185) -> anon_reachable=no, post-guard=service-role-db-write

Audited telnyx-webhook. FUNC | cors_wildcard=yes@16 | in_func_auth=yes@218 | auth_kind=ed25519 | anon_reachable=no | priv_side_effect=service-role-db-write | note=quarantine gate L185 (!isTelnyxWebhookLifecycleCertified() -> 503 before body/env) makes the Ed25519 reject at L218 unreachable. Key: function is launch-quarantined and inert; if quarantine ever removed, Ed25519 (L120-170/L217-223) + mandatory-secret 503 (L209-214) still gate service-role DB writes (L249/255/454).

## Artifact

**Findings**

telnyx-webhook (supabase/functions/telnyx-webhook/index.ts) is launch-quarantined and inert. (1) CORS: Access-Control-Allow-Origin '*' inline at L15-16 (own corsHeaders const, not _shared/utils.ts). (2) In-function auth: Ed25519 verification exists (verifyTelnyxSignature L120-170, called L217, rejects 401 at L218-223) plus a mandatory-secret reject 503 at L209-214; BUT both are UNREACHABLE because isTelnyxWebhookLifecycleCertified() hardcodes return false (L172-174) and the early-return at L185-195 emits 503 TELNYX_WEBHOOK_LIFECYCLE_NOT_CERTIFIED BEFORE any body read or env access. (3) auth_kind=ed25519. (4) anon_reachable=no: quarantine returns 503 before body/env, so no privileged effect is reachable even with only the anon key. (5) priv_side_effect that WOULD be reached past the guards = service-role-db-write: supabaseAdmin built from SUPABASE_SERVICE_ROLE_KEY (L249, L255) writing broadcast_queue, voice_broadcasts, leads, sms_messages (e.g. L454-457); no paid-provider call in this file.

**evidence**

- supabase/functions/telnyx-webhook/index.ts:16 'Access-Control-Allow-Origin': '*',
- supabase/functions/telnyx-webhook/index.ts:172-173 function isTelnyxWebhookLifecycleCertified(): boolean { return false; }
- supabase/functions/telnyx-webhook/index.ts:185-190 if (!isTelnyxWebhookLifecycleCertified()) { return 503 error_code:'TELNYX_WEBHOOK_LIFECYCLE_NOT_CERTIFIED'
- supabase/functions/telnyx-webhook/index.ts:218-223 if (!signatureValid) { ... status: 401 'Invalid webhook signature' }
- supabase/functions/telnyx-webhook/index.ts:158 crypto.subtle.verify('Ed25519', cryptoKey, signatureBytes, payloadBytes)
- supabase/functions/telnyx-webhook/index.ts:209-214 if (!webhookSecret) { ... 503 'signature verification is not configured' }
- supabase/functions/telnyx-webhook/index.ts:249,255 serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'); supabaseAdmin = createClient(url, serviceRoleKey)
- supabase/functions/telnyx-webhook/index.ts:454-457 .from('broadcast_queue').update(queueUpdate).eq('id', queueItem.id)

**validation**

Read full index.ts (784 lines) plus _shared/telnyx.ts and _shared/utils.ts. Confirmed no import of _shared in index.ts (only std/http serve + esm.sh supabase-js L12-13). grep of config.toml for 'functions'/'verify_jwt'/'telnyx-webhook' returned 0 matches (file may be absent) - verify_jwt not determinable from repo, but irrelevant since quarantine gate precedes everything.

**open_questions**

- Does a live/deployed config.toml set verify_jwt for telnyx-webhook (deployment plane vs repo)?
- Is isTelnyxWebhookLifecycleCertified() ever patched at build/deploy time, or is the false literal the shipped state?

**what_i_did_not_check**

- Deployed Supabase function config / verify_jwt on the live project (emonjusymdripmkvtttc) - repo read-only, no network calls
- Whether any deployment pipeline rewrites the isTelnyxWebhookLifecycleCertified() literal
- RLS/table-level permissions on broadcast_queue/leads/sms_messages that could further constrain the service-role writes

**confidence**: high