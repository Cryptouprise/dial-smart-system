# int-crm-messaging

- status: completed
- tldr: GHL=deep code but disabled; Airtable=stub; Slack+Zapier=real read-only observer adapters, disabled, not stubs

LANE COMPLETE: integration depth judged for GoHighLevel, Airtable, Slack, Zapier in C:/Users/charl/dial-smart-system. Note: real paths are src/ and supabase/functions/. CROSS-CUTTING FACT: every GHL edge function is launch-disabled by a returns-false certification gate, so code depth != runtime status.

| Integration | Verdict | Proof (file:line) |
|---|---|---|
| GoHighLevel | integrated-deeply (CODE) BUT runtime DISABLED | Real GHL REST client baseUrl services.leadconnectorhq.com ghl-integration/index.ts:137 + 29 real fetch() calls (:150,171,217,263,289,342,403,629,653,668,685,756,772-793,836,853,883,930,944,973,997,1045,1087); 17-action union :21-37; batch-callback PUT contacts :225-236; front-end wired (useGoHighLevel.ts:112-206, MissionBriefingWizard.tsx:554 invokes it). OFF: isGhlMultiAccountSyncCertified()=>false :63-65 -> 503 :75-85; webhook-trigger unconditional 503 :88-96; batch-callback gate :298; shadow-ingest env-gated 503 :141-146 |
| Airtable | stub (disabled forwarder) | airtable-sync/index.ts isAirtableSyncCertified()=>false :10-13; hard 503 :36-46; rest is dead code; NO airtable API client; merely forwards to call-tracking-webhook :78 |
| Slack | shallow (real read-only observer, OFF) | slack-webhook/handler.ts real HMAC verify :405-419, parses only /dial-smart :433-440, ephemeral reply only; NO chat.postMessage; all authority false :170-180; disabled 503 :77-86/:357. NOT a notification stub |
| Zapier | shallow (real read-only observer, OFF) | zapier-observer/handler.ts Bearer API-key auth :360, read-only allowlist :35-42; comment says "no provider, CRM, queue, AI-model, or callback I/O" :317-320; disabled 503 :119-126/:326. NOT a notification stub |

BOTTOM LINE: only GoHighLevel has a real outbound client (deep) and it is disabled; Airtable is a disabled stub; Slack and Zapier are real but shallow read-only launch-disabled observer adapters (not notification stubs) that make no outbound calls to their named SaaS.

## Artifact

**Findings**

4-row verdict on real integration depth in C:/Users/charl/dial-smart-system. Verdict labels: integrated-deeply | shallow | stub. NOTE: paths in the lane differ from reality; files live under src/ and supabase/functions/, not components//functions/. Key cross-cutting fact: EVERY GHL edge function is launch-disabled by a returns-false certification gate, so code depth (deep) diverges from runtime status (disabled).

ROW 1 GoHighLevel = integrated-deeply (CODE), runtime DISABLED/GATED. Real GHL REST client: baseUrl 'https://services.leadconnectorhq.com' at supabase/functions/ghl-integration/index.ts:137, with 29 real fetch() calls (:150 get location, :171 calendars, :217/:403/:1087 contacts list, :263/:289 customFields, :342/:1045 contacts/search, :629/:756 contact detail, :653/:668/:685/:772-793/:836 opportunities search+create, :853 pipelines, :883/:944 calendar events, :930 test calendar, :973 tags, :997 workflows). 17-action request union at :21-37. Four edge functions: ghl-integration(1224L), ghl-webhook-trigger(424L), ghl-batch-callback(617L), ghl-shadow-ingest(handler 398L + index 148L). ghl-batch-callback writes contact custom fields via PUT https://services.leadconnectorhq.com/contacts/{id} (:225-236) and maps call outcomes to tags (OUTCOME_TO_TAG :19-27). Front-end + DB wiring is real: src/hooks/useGoHighLevel.ts reads/writes GHL apiKey/locationId/webhookKey in table user_credentials (:112-206); src/components/GoHighLevelManager.tsx renders the whole connect/sync/mapping UI and consumes the hook (:12); GHLFieldMappingTab.tsx maps system fields<->GHL custom fields; MissionBriefingWizard.tsx:554 and GHLBroadcastFieldMapping.tsx:155/:251 actually invoke('ghl-integration'); GHLWebhookConfig.tsx:28 renders the ghl-webhook-trigger URL. DISABLED proof: ghl-integration isGhlMultiAccountSyncCertified()=>false (:63-65) then hard 503 (:75-85); ghl-webhook-trigger returns unconditional 503 before its handler (:88-96, nothing above it consults a variable); ghl-batch-callback isGhlBatchCallbackCertified()=>false (:9-11) checked at serve gate (:298); ghl-shadow-ingest only runs if SUPABASE_URL/anon + GHL_SHADOW_INGEST_RPC_TOKEN + identifier HMAC key are all set, else 503 (:52-57,:141-146). ghl-shadow-ingest is a genuinely implemented observe-only lane calling two SECURITY DEFINER RPCs (get_ghl_shadow_ingest_contract :76, record_ghl_shadow_ingest_receipt :95) writing only held/quarantined receipts (:114-126).

ROW 2 Airtable = stub (disabled forwarder). supabase/functions/airtable-sync/index.ts: isAirtableSyncCertified()=>false (:10-13); serve() returns hard 503 disabled immediately (:36-46); everything below (:48-123) is unreachable dead code. There is NO Airtable API client anywhere (no api.airtable.com / airtable.com fetch). The (dead) body does not talk to Airtable at all, it just forwards each record to another internal function via supabase.functions.invoke('call-tracking-webhook') (:78). So: not a notification stub in the Slack sense, it is a permanently-disabled record forwarder with zero Airtable egress.

ROW 3 Slack = shallow (real read-only observer adapter, launch-disabled). supabase/functions/slack-webhook/handler.ts is NOT a notification stub: it does real Slack HMAC request authentication (verifySlackRequestSignature :405-419, reads x-slack-request-timestamp/x-slack-signature, imports _shared/slack-request-auth.ts), enforces strict application/x-www-form-urlencoded (:88-92,:368-375), parses ONLY the exact /dial-smart slash command (:17,:433-440), and returns an ephemeral slash response (:53-63). BUT it makes NO Slack Web API calls (no chat.postMessage/chat.update/postMessage anywhere), it is read-only observer authority with all capabilities hard-false (contact/launch/queue_mutation/crm_write/spend = false, :170-180), and it is disabled: slackObserverDisabledResponse 503 (:77-86) gated on deps.enabled (:357). => real hardened adapter, shallow (no outbound Slack actions) and OFF.

ROW 4 Zapier = shallow (real read-only observer adapter, launch-disabled). supabase/functions/zapier-observer/handler.ts is NOT a notification stub: real Bearer API-key auth (extractZapierApiKeyCredential :360, _shared zapier auth.ts), bounded-body/JSON guards (:147-223), a 6-command read-only allowlist (:35-42), signature/hash of raw payload (:435), and a strict result normalizer. BUT there are NO Zapier API calls at all, and the file's own comment states it 'has no provider, CRM, queue, AI-model, or callback I/O' (:317-320). Disabled: zapierObserverDisabledResponse 503 (:119-126) gated on deps.enabled (:326). => real hardened adapter, shallow and OFF. (Shared base handleApiKeyObserverRequest also serves channel 'mcp' for a future MCP transport.)

BOTTOM LINE: Only GoHighLevel has a real outbound integration client (deep), and it is runtime-disabled. Airtable is a disabled stub/forwarder. Slack and Zapier are real but shallow, read-only, launch-disabled observer adapters, NOT notification stubs, and neither makes outbound calls to its named SaaS. No lane-named file is a genuine notification-only stub, but only GHL is even close to a live integration.

**evidence**

- supabase/functions/ghl-integration/index.ts:63-65 isGhlMultiAccountSyncCertified()=>false
- supabase/functions/ghl-integration/index.ts:75-85 hard 503 GHL_MULTI_ACCOUNT_SYNC_NOT_CERTIFIED
- supabase/functions/ghl-integration/index.ts:137 baseUrl='https://services.leadconnectorhq.com'
- supabase/functions/ghl-integration/index.ts:150,171,217,263,289,342,403,408,629,653,668,685,756,772,784,793,836,853,883,930,944,973,997,1045,1087,1094 29 real GHL fetch() calls
- supabase/functions/ghl-batch-callback/index.ts:9-11 cert fn =>false; :298 gate; :225-236 real PUT to leadconnectorhq contacts
- supabase/functions/ghl-webhook-trigger/index.ts:88-96 unconditional 503 disabled before handler
- supabase/functions/ghl-shadow-ingest/index.ts:52-57 runtime env gate; :141-146 503 GHL_SHADOW_INGEST_DISABLED; :76,:95 SECURITY DEFINER RPCs
- supabase/functions/airtable-sync/index.ts:10-13 cert fn =>false; :36-46 hard 503; :78 only forwards to call-tracking-webhook via functions.invoke; no airtable API client
- supabase/functions/slack-webhook/handler.ts:405-419 real Slack HMAC verify; :424-440 /dial-smart only; :77-86,:357 disabled 503; :170-180 all authority false; no chat.postMessage
- supabase/functions/zapier-observer/handler.ts:317-320 comment 'no provider, CRM, queue, AI-model, or callback I/O'; :119-126,:326 disabled 503; :35-42 read-only allowlist
- src/hooks/useGoHighLevel.ts:112-206 credential store in user_credentials table
- src/components/MissionBriefingWizard.tsx:554 and settings/GHLBroadcastFieldMapping.tsx:155,251 invoke('ghl-integration')
- src/components/settings/GHLWebhookConfig.tsx:28 webhook URL = SUPABASE_URL/functions/v1/ghl-webhook-trigger

**validation**

Read every listed file directly (slack-webhook/handler.ts 493L full, zapier-observer/handler.ts 481L full, airtable-sync/index.ts 124L full; ghl-integration/index.ts head 130L + full-repo regex grep of fetch() endpoints returning 29 hits; ghl-shadow-ingest/index.ts 148L full; ghl-batch-callback gate grep confirming :298 call to a :9-11 returns-false fn; ghl-webhook-trigger head 120L). Cross-checked front-end call sites via repo-wide functions.invoke grep (345 hits, ghl-integration invoked from MissionBriefingWizard/GHLBroadcastFieldMapping). Confirmed all four GHL edge functions carry launch-disabling cert gates; confirmed airtable/slack/zapier make no outbound calls to their named SaaS.

**open_questions**

- Is any of this actually DEPLOYED/enabled in the live Supabase project (the gates are source-level; a live probe was out of scope / no credentials used)?
- Do the SQL/RPC implementations behind ghl-shadow-ingest (get_ghl_shadow_ingest_contract, record_ghl_shadow_ingest_receipt) and the _shared/control-plane observer runtime actually exist and certify, or are they also placeholders?
- Because useGoHighLevel.ts stores the GHL apiKey base64-encoded (btoa/atob, :133,:173) in user_credentials, is there real at-rest encryption or is this plaintext-with-encoding? Security-relevant, not depth-relevant.

**what_i_did_not_check**

- Live runtime/deployment state of each edge function (no Supabase project probe; verdicts are source-level).
- The SQL side: certification/*/migrations ghl_shadow_ingest_lane + reconciliation_export bodies, and whether the two RPCs are actually present/certified in the live DB.
- The _shared/control-plane runtime (observer-runtime.ts, registry.ts, authorization.ts) internals that slack/zapier submit to (I confirmed the adapters' I/O boundary but not the downstream executor's realness).
- Other GHL-adjacent files not in the lane (GHLBroadcastFieldMapping.tsx, GHLWebhookConfig.tsx bodies, scripts/ship/_*ghl* probes, campaigns/solar-exit/ghl-mapping.json) beyond call-site confirmation.
- mcp-observer and teams observer adapters that share the same control-plane base.
- Whether any OTHER (non-lane) code path calls these functions that I did not grep for, e.g. direct URL fetch to /functions/v1 rather than supabase.functions.invoke.

**confidence**: high