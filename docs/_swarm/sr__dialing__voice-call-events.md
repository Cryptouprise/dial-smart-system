# sr::dialing::voice-call-events

- status: completed
- tldr: voice-call-events: service-role yes; 503 gate only on missing secret (no isXCertified); Ed25519-signed caller, org from DB row.

Audited voice-call-events/index.ts. Row: C:/Users/charl/dial-smart-system/supabase/functions/voice-call-events/index.ts:229-231 | uses-service-role: YES | disabled: NO isXCertified(); instead separate hard gate at :217-220 (missing WEBHOOK_SECRET_TELNYX -> 503) | caller-verified: VERIFIED (Ed25519 signature, NOT user-auth) | evidence: :229 getenv SUPABASE_SERVICE_ROLE_KEY; :231 createClient(url,serviceRoleKey); :217-220 503 gate; :55-56 crypto.subtle.verify Ed25519; :221-225 401 on bad sig; org derived server-side from call_logs row :76/:128/:203, no client body org trusted. FACT.

## Artifact

**Findings**

voice-call-events/index.ts is a Telnyx webhook handler. (1) USES SERVICE ROLE: yes - line 229 reads Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), line 231 createClient(supabaseUrl, serviceRoleKey). (2) DISABLE GATE: no isXCertified(){return false} pattern exists; the equivalent hard gate is a missing-secret 503 at lines 217-220 (if !publicKey -> return json(...,503)). (3) CALLER VERIFICATION: no auth.getUser / Authorization Bearer / anon check. Verification is cryptographic Ed25519 webhook-signature validation (lines 40-60, 221-225). Organization is derived SERVER-SIDE from the matched call_logs row (organization_id selected at line 76 and used for all writes at lines 128, 187, 203), never from client body. No client-supplied org_id/organization_id/campaign_id is trusted.

**evidence**

- L229: const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
- L231: const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
- L217-220: if (!publicKey) { console.error(...); return json({ error: 'Telnyx webhook signature verification is not configured' }, 503); }
- L221-225: const valid = await verifyTelnyxSignature(...); if (!valid) { ... return json({ error: 'Invalid webhook signature' }, 401); }
- L55-56: crypto.subtle.importKey('raw', publicKeyBytes, { name: 'Ed25519' }...) / crypto.subtle.verify('Ed25519', ...)
- L76: const select = 'id, organization_id, user_id, status, answered_at';
- L128: .eq('organization_id', candidate.organization_id)
- L187: p_organization_id: callLog.organization_id,
- L203: .eq('organization_id', callLog.organization_id);

**validation**

Read full 252-line file; grepped for isXCertified (none), auth.getUser (none), Authorization (none), org_id/organization_id/campaign_id in request body (none - all from DB row).

**open_questions**

- Does WEBHOOK_SECRET_TELNYX env var holding the Telnyx public key get provisioned in this Supabase project, or is the 503 gate always tripped (endpoint effectively disabled)?

**what_i_did_not_check**

- the _shared/voice-provider.ts getProvider('telnyx').parseWebhookBody behavior and whether it validates the 'to' field against the row's own phone_number (spoof risk beyond signature)
- whether call_logs RLS or a DB-level constraint additionally scopes writes
- deployment env config for WEBHOOK_SECRET_TELNYX / SUPABASE_SERVICE_ROLE_KEY presence
- (none) sibling functions (telnyx-webhook) that share the same pattern

**confidence**: high