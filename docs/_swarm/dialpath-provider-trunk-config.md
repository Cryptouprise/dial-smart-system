# dialpath-provider-trunk-config

- status: completed
- tldr: CONFIRMED: provider-management, twilio-integration, remove-trunk all unconditionally 503 before auth. No trunk/provider creation possible; no Telnyx connection-create endpoint exists.

Provider/trunk configuration is fully dead at the source level. CONFIRMED seed: provider-management/index.ts:48-50 isProviderConfigurationTenantCertified() returns hardcoded false; :58-63 unconditional 503 PROVIDER_CONFIGURATION_NOT_TENANT_CERTIFIED before any action/auth. ADDED: twilio-integration/index.ts:34-42 has the same unconditional early-return (PROVIDER_ADMIN_NOT_CERTIFIED) BEFORE auth and all handlers, killing create_sip_trunk/list_sip_trunks/add_phone_to_trunk/remove_phone_from_trunk/delete_sip_trunk/import_number/sync_all/A2P+webhook config. remove-trunk/index.ts:14-22 unconditional 503 CONTROL_PLANE_NOT_CERTIFIED. SipTrunkManager + useMultiCarrierProvider call only these dead endpoints for every provider/trunk operation. No Telnyx connection-creation function exists anywhere; Telnyx connection id is a single global env var (TELNYX_SIP_CONNECTION_ID, _shared/telnyx.ts:53-57). Only remaining working path: direct DB insert into sip_trunk_configs (RLS user_id policies, migration 20251212001827:47-57) storing a config pointing at no real resource.

## Artifact

**Findings**

1) CONFIRMED seed: provider-management/index.ts:48-50 isProviderConfigurationTenantCertified() is exactly `return false;`; :58-63 return an unconditional 503 PROVIDER_CONFIGURATION_NOT_TENANT_CERTIFIED before auth and before the action switch, so all actions (list_providers, add_provider, update_provider, delete_provider, test_connection, list_numbers, import_number, import_all_numbers, sync_numbers) are dead. 2) NEW CRITICAL: twilio-integration/index.ts:34-42 is an unconditional 503 (PROVIDER_ADMIN_NOT_CERTIFIED) placed before auth (:57) and before ALL handlers; create_sip_trunk :1066, list_sip_trunks :1442, add_phone_to_trunk :1339, remove_phone_from_trunk :1402, delete_sip_trunk :1485, list_trunk_phone_numbers :1292, import_number :138, sync_all :282, and webhook/A2P config are all unreachable. 3) NEW HIGH: remove-trunk/index.ts:14-22 unconditional 503 CONTROL_PLANE_NOT_CERTIFIED; the removal logic :24-132 is unreachable. 4) SipTrunkManager calls ONLY twilio-integration for real trunk operations (create/list/add/remove/delete); all dead. Its save/delete/setDefault/import paths write directly to the sip_trunk_configs table via the anon client. 5) useMultiCarrierProvider calls ONLY provider-management for every method; all dead; no other consumer found in src. 6) TELNYX: no edge function creates a Telnyx connection anywhere; the connection id is a single global env var TELNYX_SIP_CONNECTION_ID (_shared/telnyx.ts:53-57). SipTrunkManager's telnyx path just stores a hand-typed string. telnyx-ai-assistant:79-81 is also hardcoded false. 7) ANSWER: a fresh org cannot create a Telnyx or Twilio trunk; the only surviving path is a direct INSERT into sip_trunk_configs (RLS allows it per migration :47-49) that stores a config pointing at no provisioned resource. 8) PATTERN: ~52 edge functions carry a NOT_CERTIFIED-style 503 lockdown; sampled 7 all return false. 9) Death line: provider-management/index.ts:58 for provider config and twilio-integration/index.ts:34 for trunk config.

**evidence**

- supabase/functions/provider-management/index.ts:48-50 (return false), :58-63 (503 return), :103 switch never reached
- supabase/functions/twilio-integration/index.ts:34-42 (unconditional 503 before auth :57; handlers :1066+ unreachable)
- supabase/functions/remove-trunk/index.ts:14-22 (unconditional 503)
- src/components/SipTrunkManager.tsx:229,289,306,343,372,394,418,472 (twilio-integration calls) and :100-122,:124-177,:179-195,:197-223,:448-461,:495-531 (direct DB writes)
- src/hooks/useMultiCarrierProvider.ts:58,89,130,168,207,248,283,324 (provider-management calls)
- supabase/functions/_shared/telnyx.ts:53-57 (TELNYX_SIP_CONNECTION_ID global env var)
- supabase/functions/telnyx-ai-assistant/index.ts:79-81 (return false)
- supabase/functions/budget-tracker/index.ts:21-23 and supabase/functions/call-dispatcher/index.ts:15-25 (all return false)
- supabase/migrations/20251212001827_947a57c5-1a0d-4b65-8aa7-0e7069329694.sql:2-57 (table + 4 user_id RLS policies)

**validation**

Static read of every cited file/function; grep-verified frontend callers and absence of any Telnyx connection-create code. No runtime/live calls performed (research-only node).

**open_questions**

- Does the DEPLOYED Supabase bundle match this source revision?
- Does any service-role / Hermes / agent-os path provision trunks outside these edge functions?

**edge_cases_considered**

- supabase.functions.invoke treats non-2xx as an error, so the 503 surfaces to the UI as a thrown error (catch -> 'Error' toast), not as data.error; that makes deleteTrunkFromTwilio's data.error 404-fallback (:477-483) unreachable and leaves the DB row behind on failure.
- CORS OPTIONS still returns 200, so buttons render as enabled then fail at runtime.
- sip_trunk_configs RLS keys on user_id, not organization_id (no org scoping in that table).

**what_i_did_not_check**

- No live probe of the Supabase URL, so source-vs-deployment match is UNVERIFIED.
- Did not enumerate the return value of all ~52 NOT_CERTIFIED gates (sampled 7).
- Did not fully read voice-broadcast-engine, NumberRotationManager, TwilioNumbersOverview, SystemHealthCheck, useTwilioIntegration (they also call the dead twilio-integration but their own gates are unverified).
- Did not verify existence of phone_providers/provider_numbers tables or org-vs-user multi-tenancy.
- Did not read src/services/providers/* adapters beyond noting twilioAdapter is a stub.
- Did not check RLS on phone_numbers/voice_broadcasts used by the direct DB paths.
- Did not inspect Hermes/agent-os or any cron for a trunk-provisioning bypass.

**confidence**: high