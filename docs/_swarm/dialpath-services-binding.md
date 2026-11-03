# dialpath-services-binding

- status: completed
- tldr: provider-layer from-number binding: in-scope services/* are stubs; live binding lives in edge functions; Retell requires retell_phone_id, Telnyx binding unverified

dialpath-services-binding COMPLETE (confidence high). Q: How does an outbound call resolve its from-number at the provider layer, and is per-number provider binding REQUIRED? A: The in-scope module src/services/providers/* is DEAD SCAFFOLDING — all three adapters return 'not implemented' (telnyxAdapter.ts:57-70, twilioAdapter.ts:52-65, retellAdapter.ts:49-60) and ProviderNumber (types.ts:22-33) has no binding fields. The live path is supabase edge functions. Binding requirements: RETELL = REQUIRED (phone_numbers.retell_phone_id must be non-null, outbound-calling/index.ts:490, plus a live GET /get-phone-number 404 check :1422-1445; agent bound per-call via override_agent_id, not per-number). TELNYX = implicit/unverified (POST /v2/ai/assistants/{id}/calls with from only, :1259-1263; no connection_id/OVP checked; only guard provider==='telnyx' :493). TWILIO = callerId into TwiML <Dial callerId>, account-owned required, no code check. Fields read off the row before egress (outbound-calling/index.ts:462): id, number, user_id, organization_id, status, provider, retell_phone_id, rotation_enabled, is_spam, quarantine_until (+ daily_calls/max_daily_calls in the dispatcher). NO connection_id column exists; Telnyx connection_id is env TELNYX_SIP_CONNECTION_ID (telnyx.ts:53-57) used only for browser telephony_credentials.

## Artifact

**Findings**

HIGH: src/services/providers/* is DEAD SCAFFOLDING — telnyxAdapter.ts:57-70, twilioAdapter.ts:52-65, retellAdapter.ts:49-60 all return success:false 'not implemented'; createProviderAdapter().createCall() always fails, so from-number resolution does NOT occur at this layer. HIGH: ProviderNumber (types.ts:22-33) has NO binding fields (no connection_id, trunk_sid, retell_phone_id, voice_url, sip credentials) — the live path is the supabase edge functions. voice-provider.ts:65-73 StartOutboundContext takes a raw already-resolved `from` and delegates to telnyx.ts/twilio.ts; binding is decided upstream (dispatcher/outbound-calling). RETELL per-number binding REQUIRED: outbound-calling/index.ts:490 rejects callerId with null phone_numbers.retell_phone_id; :1422-1445 live GET https://api.retellai.com/get-phone-number/{from} aborts on 404; from_number=canonicalCallerId (retell-provider-contract.ts:212); agent per-call via override_agent_id (retell-provider-contract.ts:214-216) so per-number AGENT binding NOT required. TELNYX binding IMPLICIT/UNVERIFIED: outbound-calling/index.ts:1259-1263 POST /v2/ai/assistants/{id}/calls {assistant_id, from, to}; TeXML fallback 1241-1245 {From,To,AIAssistantId}; no connection_id/OVP sent or checked, only guard ownedCaller.provider==='telnyx' (:493). TWILIO: callerId flows into TwiML <Dial callerId=...> from twilio-voice-twiml (twilio.ts:15-17); requires account-owned/verified callerId, no code-side check in the AI path. TELNYX connection_id is NOT per-number: env TELNYX_SIP_CONNECTION_ID (telnyx.ts:53-57), only for browser telephony_credentials (telnyx.ts:108-113); no connection_id column on phone_numbers (baseline DDL 4680-4717). phone_numbers fields read before egress (outbound-calling/index.ts:462): id, number, user_id, organization_id, status, provider, retell_phone_id, rotation_enabled, is_spam, quarantine_until; dispatcher adds daily_calls, max_daily_calls and filters rotation_enabled=true + retell_phone_id not null (call-dispatcher:1172,1201); campaign_phone_pools membership enforced when a pool exists (outbound-calling:497-508). Unused-by-call-path columns: twilio_sid, sip_trunk_config, sip_trunk_provider, sip_trunk_config_id, capabilities. Enum mismatch: provider-router.ts allows 'assistable' but phone_numbers.provider CHECK (baseline:4719) allows only twilio|telnyx|retell_native|other.

**evidence**

- src/services/providers/types.ts:22-33
- src/services/providers/telnyxAdapter.ts:57-70
- src/services/providers/twilioAdapter.ts:52-65
- src/services/providers/retellAdapter.ts:49-60
- supabase/functions/_shared/voice-provider.ts:65-73
- supabase/functions/outbound-calling/index.ts:462,490-495,1259-1263,1422-1445
- supabase/functions/_shared/retell-provider-contract.ts:211-217
- supabase/functions/_shared/telnyx.ts:53-57,108-113
- supabase/functions/_shared/twilio.ts:15-17
- supabase/functions/call-dispatcher/index.ts:1172,1201
- baseline phone_numbers DDL 4680-4717

**validation**

Read all 6 files under src/services/providers plus both _shared files (voice-provider.ts, retell-provider-contract.ts); traced the live path in supabase/functions/outbound-calling/index.ts, call-dispatcher/index.ts, _shared/telnyx.ts, _shared/twilio.ts, _shared/provider-router.ts, and the phone_numbers DDL. Every binding claim cited to file:line.

**open_questions**

- Does Telnyx AI Assistants Calls require from on a connection/outbound voice profile and fail closed? (external)
- Does twilio-voice-twiml validate callerId ownership?
- Is src/services/providers/* referenced anywhere or orphaned?

**edge_cases_considered**

- assistable provider routable but no phone_numbers.provider value
- campaign_phone_pools scoping
- non-campaign calls restricted to owned destinations
- per-call agent override avoids shared-number mutation

**what_i_did_not_check**

- inbound number resolution (outbound only in scope)
- staging duplicate voice-provider.ts copies
- whether src/services/providers stubs are imported in the React app
- live production phone_numbers column superset
- assistable binding path
- sms from-number resolution

**confidence**: high