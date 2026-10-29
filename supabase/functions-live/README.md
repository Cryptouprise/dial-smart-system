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
| twilio-sms-webhook | FAILED | - | unknown | MCP error -32603 (internal error) on 3 attempts via mcp__supabase and 1 via claude.ai Supabase connector |
| sms-messaging | FAILED | - | unknown | same -32603 error, 4 attempts total |
| ai-sms-processor | FAILED | - | unknown | same -32603 error, 4 attempts total |
| disposition-router | OK | index.ts: 753 | v472 | updated 2026-07-01 18:15 UTC |
| outbound-calling | OK | index.ts: 1373 | v600 | updated 2026-07-01 18:15 UTC |
| telnyx-webhook | OK | index.ts: 758 | v520 | updated 2026-07-01 18:15 UTC |
| call-dispatcher | OK | functions/call-dispatcher/index.ts: 1944; functions/_shared/alerting.ts: 163; functions/_shared/manager-notify.ts: 109 | v610 | updated 2026-07-01 18:15 UTC |
| retell-call-webhook | OK | functions/retell-call-webhook/index.ts: 2485; functions/_shared/manager-notify.ts: 109 | v453 | updated 2026-07-01 18:15 UTC |
| workflow-executor | OK | index.ts: 1302 | v476 | updated 2026-07-01 18:15 UTC |
| pipeline-management | FAILED | - | unknown | same -32603 error, 4 attempts total |
| api-gateway | FAILED | - | unknown | same -32603 error, 4 attempts total |
| stripe-webhook | OK | index.ts: 240 | v119 | updated 2026-07-01 18:15 UTC |

7 of 12 succeeded. The 5 failures were consistent server-side errors from both Supabase MCP
servers for those specific slugs (other slugs fetched fine in the same minute), so the failure is
tied to those functions' bundles, not to connectivity. Alternative pull paths: Supabase CLI
`supabase functions download <slug> --project-ref emonjusymdripmkvtttc`, or the Management API
`GET /v1/projects/emonjusymdripmkvtttc/functions/<slug>/body`.
