# functions-live — LIVE deployed edge function snapshots

**Pulled:** 2026-10-29
**Project:** emonjusymdripmkvtttc (Dial Smart System)
**Source:** `mcp__supabase__get_edge_function` (Supabase MCP), written verbatim, no edits.

These are **read-only snapshots of the code actually deployed to Supabase** at pull time.
They exist so fixes are built on live behavior, not on GitHub `main` (which carries unreleased
503 "certification gate" changes that live does NOT have). Do not edit files here; edit
`supabase/functions/<slug>/` and re-snapshot after deploys.

File layout mirrors the `files[].name` paths returned by the API. Single-file functions came back as
`<slug>/index.ts`; bundled functions came back as `functions/<slug>/index.ts` + `functions/_shared/*`
and are kept under `<slug>/functions/...` exactly as returned.

All successful functions report the same live `updated_at` = 1782929711947 (2026-07-01 18:15:11 UTC),
i.e. the last bulk deploy.

| slug | result | files / lines | live version | notes |
|---|---|---|---|---|
| twilio-sms-webhook | OK (Management API body, ESZIP extracted by Fable) | twilio-sms-webhook/index.ts: 1598 | v532 | verify_jwt=false |
| sms-messaging | OK (Management API) | sms-messaging/index.ts: 470 | v525 | verify_jwt=FALSE -> unauthenticated get_available_numbers leak |
| ai-sms-processor | OK (Management API) | ai-sms-processor/index.ts: 980 | v524 | verify_jwt=true |
| disposition-router | OK | index.ts: 753 | v472 | updated 2026-07-01 18:15 UTC |
| outbound-calling | OK | index.ts: 1373 | v600 | updated 2026-07-01 18:15 UTC |
| telnyx-webhook | OK | index.ts: 758 | v520 | updated 2026-07-01 18:15 UTC |
| call-dispatcher | OK | functions/call-dispatcher/index.ts: 1944; functions/_shared/alerting.ts: 163; functions/_shared/manager-notify.ts: 109 | v610 | updated 2026-07-01 18:15 UTC |
| retell-call-webhook | OK | functions/retell-call-webhook/index.ts: 2485; functions/_shared/manager-notify.ts: 109 | v453 | updated 2026-07-01 18:15 UTC |
| workflow-executor | OK | index.ts: 1302 | v476 | updated 2026-07-01 18:15 UTC |
| pipeline-management | OK (Management API) | pipeline-management/index.ts: 149 | v564 | verify_jwt=true |
| api-gateway | OK (Management API) | functions/api-gateway/index.ts: 1267 + _shared/api-auth.ts 130 + _shared/utils.ts 431 | v35 | verify_jwt=false |
| stripe-webhook | OK | index.ts: 240 | v119 | updated 2026-07-01 18:15 UTC |

12 of 12 succeeded (5 via GET /v1/projects/{ref}/functions/{slug}/body, ESZIP2.3 parsed, user files only). The 5 failures were consistent server-side errors from both Supabase MCP
servers for those specific slugs (other slugs fetched fine in the same minute), so the failure is
tied to those functions' bundles, not to connectivity. Alternative pull paths: Supabase CLI
`supabase functions download <slug> --project-ref emonjusymdripmkvtttc`, or the Management API
`GET /v1/projects/emonjusymdripmkvtttc/functions/<slug>/body`.


## 10/29 correction (Fable)
The four inline-transcribed snapshots (disposition-router, telnyx-webhook, workflow-executor, stripe-webhook) DIFFERED from the live bytes; all four were re-pulled via the Management API `/functions/{slug}/body` (ESZIP2.3) and replaced with exact bytes. Exact live line counts: disposition-router 698, telnyx-webhook 580, workflow-executor 1156, stripe-webhook 205. Every file in this folder is now byte-exact.
