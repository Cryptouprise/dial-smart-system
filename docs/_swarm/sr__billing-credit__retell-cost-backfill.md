# sr::billing-credit::retell-cost-backfill

- status: completed
- tldr: retell-cost-backfill: service-role YES, hardcoded disabled (503) YES, caller-verified NO (presence-only bearer). Intent service-only, impl unverified-client.

AUDIT COMPLETE — supabase/functions/retell-cost-backfill/index.ts (180 lines, read-only).

DELIVERABLE: path:line | uses-service-role | disabled | caller-verified | evidence
supabase/functions/retell-cost-backfill/index.ts:37 | YES | YES (hardcoded false gate -> 503) | NO (presence-only bearer) | L33-34 auth, L20-29 gate/503, L37/L46 service role

1) USES SERVICE ROLE — FACT: :37 `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!`; :46 `createClient(supabaseUrl, serviceKey)`; executes cross-tenant SELECT (:54-60) + UPDATE (:107-139) on call_logs.
2) HARDCODED DISABLE GATE + 503 — FACT: :8-10 `isRetellCostBackfillCertified()` returns hardcoded false; :20 gate returns status 503, error_code RETELL_COST_BACKFILL_NOT_CERTIFIED (:21-29). Permanently disabled as shipped.
3) CALLER VERIFICATION — FACT: only check is :33-34, presence of Authorization header, value never validated (no JWT verify, no auth.getUser, no service-key compare, no shared secret/scheduler sig). CORS wildcard (:4). Comment :17-19 admits "accepts any bearer".
CLASSIFICATION: intent SERVICE-ONLY-TRUST (admin/cron) but implementation UNVERIFIED-CLIENT-ORG. Currently NO browser caller can trigger it (gate runs before auth, always 503); if the gate is ever flipped true, any bearer holder could run a cross-tenant backfill.

Validation: full file read; grep of markers with line numbers; all claims file:line; no secrets printed; nothing executed/modified.
Blockers/follow-ups: verify Supabase platform verify_jwt config for this function (outside index.ts); confirm whether route gets removed or re-certified with a scheduler secret.

## Artifact

**Findings**

(1) USES SERVICE ROLE: FACT. index.ts:37 reads `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!` and :46 `createClient(supabaseUrl, serviceKey)` builds the client with service-role authority, used to SELECT cross-tenant rows from call_logs (:54-60) and UPDATE retell_cost_cents/cost_breakdown/token_usage (:107-139). (2) HARDCODED DISABLE GATE + 503: FACT. :8-10 `function isRetellCostBackfillCertified(): boolean { return false; }` is a hardcoded false with no env/DB/config read. :20 short-circuits before any auth or work and returns status 503 with error_code RETELL_COST_BACKFILL_NOT_CERTIFIED (:21-29). As shipped the endpoint is permanently disabled. (3) CALLER VERIFICATION: FACT. The only auth check is :33-34: reads Authorization header and `if (!authHeader) throw new Error('Missing auth')` — verifies PRESENCE only, never the value: no JWT verify, no auth.getUser, no comparison to service key, no shared secret, no scheduler signature. Comment :17-19 states intent: 'this global maintenance route accepts any bearer, enumerates cross-tenant calls with service-role authority'. CORS is wide open (`Access-Control-Allow-Origin: *`, :4). CLASSIFICATION: intent = SERVICE-ONLY-TRUST (admin/cron); implemented = UNVERIFIED-CLIENT-ORG (presence-only bearer). Because the disable gate (:20) runs FIRST, an arbitrary browser caller currently CANNOT trigger a backfill (always 503). If isRetellCostBackfillCertified() is ever flipped true, ANY caller sending any non-empty Authorization header could trigger a full cross-tenant cost backfill and consume the Retell API. DELIVERABLE: supabase/functions/retell-cost-backfill/index.ts:37 | uses-service-role=YES | disabled=YES (hardcoded false gate -> 503) | caller-verified=NO (presence-only bearer) | evidence L33-34 (auth), L20-29 (gate/503), L37/L46 (service role).

**evidence**

- supabase/functions/retell-cost-backfill/index.ts:8-10 hardcoded `return false`
- supabase/functions/retell-cost-backfill/index.ts:20-29 disable gate returns 503
- supabase/functions/retell-cost-backfill/index.ts:33-34 presence-only Authorization check
- supabase/functions/retell-cost-backfill/index.ts:37 SUPABASE_SERVICE_ROLE_KEY env
- supabase/functions/retell-cost-backfill/index.ts:46 createClient(supabaseUrl, serviceKey)
- supabase/functions/retell-cost-backfill/index.ts:17-19 comment acknowledging accepts-any-bearer intent
- supabase/functions/retell-cost-backfill/index.ts:4 wildcard CORS origin

**validation**

Read the full file (180 lines) with the native read tool; grepped key markers with line numbers via findstr /N. Every claim is a direct file:line citation. No secret values printed (only env var NAMES). Read-only; nothing executed or modified.

**open_questions**

- Is Supabase platform-level JWT verification (verify_jwt in supabase/config.toml) enabled for this function, adding a real gate not visible in index.ts?
- Is the route slated for removal or re-certification with a scheduler secret?

**edge_cases_considered**

- Gate flipped to true in future -> becomes unauthenticated service-role write path
- OPTIONS preflight returns 200 'ok' before the gate, so CORS behavior differs from the disabled 503
- 404 from Retell is skipped rather than failed

**what_i_did_not_check**

- Supabase platform edge-function config (supabase/config.toml verify_jwt) that could add auth outside index.ts
- Whether call_logs has tenant columns/RLS (irrelevant to the service key, which bypasses RLS)
- Whether any cron or dashboard currently invokes this route by URL

**confidence**: high