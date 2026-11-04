# ce-live-disposition-router

- status: completed
- tldr: LIVE disposition-router: verify_jwt=false (config:215), NO gate (699 lines, 0 cert strings), self-auth but body userId unbound; DNC/queue/pipeline/callback + direct sms-messaging (L544) all reachable.

DONE: Verified LIVE disposition-router (699 lines) config flag, certification-gate absence, self-auth behavior, reachability and privileged side effects.

TOUCHED: none (research only; read-only).

EVIDENCE: (a) supabase/config.toml:215 `verify_jwt = false` under [functions.disposition-router] (:212). (b) PowerShell Select-String on live file: CERTIFIED=>0, DISPOSITION_AUTOMATION=>0, isDispositionAutomationTenantCertified=>0; MAIN has gate @76-78/89/93/96 and imports sms-boundary @3. (c) live auth L134-158 (getUser L147; service-key bypass L148); body userId L160 unbound.

RESULT (strict worker report):
- (a) verify_jwt=false CONFIRMED at config.toml:215 (header :212).
- (b) NO gate in LIVE: 0 gate strings by authoritative scan; LIVE reaches service-role client @L132 ungated; pre-gate legacy code.
- (c) Handler self-auth (L134-158): 401 if header missing (L135-145); else getUser (L147); 401 only when authError && token!==serviceKey (L148). Anon key => getUser fails, not serviceKey => 401, so auth is NOT skipped for anon (medium confidence). BUT body `userId` (L160) is never bound to the authenticated user (LIVE has no authenticatedUserId), unlike MAIN L134; any valid app-user JWT can act as any userId.
- Reachable actions: health_check (L162), process_disposition (L182); else throw 'Unknown action' (L450).
- Privileged effects (exact LIVE cites): DNC writes dnc_list upsert L233-240/leads L242-245; transcript DNC L313-324; add_to_dnc L510-520. Call-queue removal lead_workflow_progress L252-256; dialing_queues L259-265; broadcast_queue L267-274; remove_all_campaigns/remove_from_campaign L472-485. Pipeline/stage moves pipeline_boards insert L690, lead_pipeline_positions upsert L363-373 and L490-499; reachability_events L385-394; disposition_metrics L404-433. Callback scheduling L558-565. Direct sms-messaging send_sms via supabase.functions.invoke at L544 (body L545-551); also workflow-executor L526, calendar-integration L583.
- Per-function row: | disposition-router | DISPOSITION_AUTOMATION_NOT_TENANT_CERTIFIED @93 (main) | v472 | NO | live 699 lines, 0 gate strings (PowerShell), no sms-boundary import, self-auth L134-158 w/ service-key bypass, body userId unbound L160, sms-messaging invoked directly L544 | 699 / 870 | main(gated) |

COULD_NOT: no empirical live HTTP probe; no RLS/caller inspection.
CONFIDENCE: high (a,b); medium (anon-401).
VALIDATION: PowerShell Select-String (LINES=699; CERTIFIED=>0; sms-messaging=>544; functions.invoke=>526,544,583; getUser=>147; sms-boundary=>0; deno.land=>1) + full 1-699 read + config.toml + MAIN 1-135. agentgrep false negatives detected and excluded.
BLOCKERS: none.

## Artifact

**Findings**

(a) verify_jwt = false CONFIRMED: supabase/config.toml:215 under [functions.disposition-router] (header :212); comment :213-214 calls it launch-quarantined 'before service-role construction'. Platform JWT gate is OFF for this function.

(b) NO certification gate in LIVE. Authoritative PowerShell Select-String over the 699-line live file: 'CERTIFIED' => 0, 'DISPOSITION_AUTOMATION' => 0, 'isDispositionAutomationTenantCertified' => 0. MAIN (870 lines) has helper isDispositionAutomationTenantCertified(){return false} @76-78, call @89, error_code 'DISPOSITION_AUTOMATION_NOT_TENANT_CERTIFIED' @93, status 503 @96, and imports _shared sms-boundary @3. LIVE reaches the service-role client at L132 with no gate and imports no sms-boundary. LIVE is the pre-gate, active legacy code.

(c) Handler auth exists but is weak, and the token is not bound to the body user. LIVE L134 reads the authorization header; L135-145 returns 401 'Missing authorization' if absent; L146 strips 'Bearer '; L147 calls supabaseAdmin.auth.getUser(token); L148 rejects with 401 only when (authError && token !== supabaseServiceKey). The only accepted non-user token is the exact service-role key. An anon/anon-key JWT has no `sub`, so getUser fails, authError is truthy, and anon !== serviceKey => 401, so auth is NOT skipped for the anon key (medium confidence: rests on GoTrue getUser semantics, not an observed probe).

(c-cont) THE REAL HOLE: LIVE reads userId from the REQUEST BODY at L160 and never binds it to the authenticated user (no authenticatedUserId anywhere; PowerShell confirms 0 hits). MAIN added that binding at its L134 ('userId does not match authenticated user'); LIVE did not. Any holder of a valid app-user JWT can pass an arbitrary userId and drive DNC/queue/pipeline/callback/SMS effects against another user's data. That is the material reachability finding, not anon.

(c-actions) Reachable actions (destructured L160): health_check (L162, read-only) and process_disposition (L182, all side effects); any other action throws 'Unknown action' (L450) -> 500 (L451-462).

DNC writes: dnc_list upsert L233-240 + leads.do_not_call/status='dnc' L242-245 (DNC dispositions, gated L229); transcript negative-sentiment dnc_list upsert L313-320 + leads update L321-324 (gated L308); executeAction 'add_to_dnc' dnc_list upsert L510-517 + leads.do_not_call L518-520 (invoked via L224-227 loop).

Call-queue removal: lead_workflow_progress -> 'removed' L252-256; dialing_queues -> 'removed' where status in (pending,scheduled,calling) and priority<2 L259-265; broadcast_queue -> 'completed' L267-274; leads.status update L277-280; executeAction 'remove_all_campaigns' L472-476 and 'remove_from_campaign' L480-485.

Pipeline/stage moves: ensurePipelineBoardLocal (L632) called L361; auto-CREATEs a board via insert into pipeline_boards L690; lead_pipeline_positions upsert (moves lead) L363-373; executeAction 'move_to_stage' lead_pipeline_positions upsert L490-499; reachability_events insert L385-394; disposition_metrics insert L404-433.

Callback scheduling: executeAction 'schedule_callback' L558-565 sets leads.next_callback_at = now + delayHours (default 24, L559) and status='callback' L561-564.

Direct sms-messaging send_sms: executeAction 'send_sms' L538-557; the invoke is supabase.functions.invoke('sms-messaging', {action:'send_sms', to, from, body: config.message, lead_id}) at L544 (body L545-551). No sms-boundary guard (module not imported). Also workflow-executor invoke L526 and calendar-integration invoke L583 (+ calendar_appointments insert L573-581). Pause-workflow (not remove) L286-290.

NOTE: agentgrep's index gave false NEGATIVES on this file (returned 0 for 'deno.land' although it is on line 1); all 0-hit conclusions were re-verified with PowerShell Select-String and only PowerShell results are used.

**evidence**

- supabase/config.toml:212 [functions.disposition-router]
- supabase/config.toml:215 verify_jwt = false
- supabase/functions-live/disposition-router/index.ts:1-699 (699 lines, PowerShell-verified)
- live index.ts:132 createClient(supabaseUrl, supabaseServiceKey) with no preceding gate
- live index.ts:134-158 self-auth (header presence + getUser + service-key bypass)
- live index.ts:147 supabaseAdmin.auth.getUser(token)
- live index.ts:148 if (authError && token !== supabaseServiceKey) -> 401
- live index.ts:160 body userId destructured and never bound to the authenticated user
- live index.ts:233-240 and 242-245 dnc_list upsert + leads dnc update
- live index.ts:259-265 dialing_queues removal; 267-274 broadcast_queue completion
- live index.ts:363-373 lead_pipeline_positions upsert; 690 pipeline_boards insert
- live index.ts:544 supabase.functions.invoke('sms-messaging', action send_sms)
- live index.ts:558-565 schedule_callback
- supabase/functions/disposition-router/index.ts:76-78,89,93,96 (MAIN gate) and :3 (MAIN sms-boundary import)
- docs/wholesale/audit/phase1/LIVE-VS-MAIN-GATES.md:25 and :51 (prior claim, now confirmed)

**validation**

Authoritative PowerShell Select-String scan of the 699-line live file (LINES=699; CERTIFIED=>0; DISPOSITION_AUTOMATION=>0; isDispositionAutomationTenantCertified=>0; deno.land=>1; sms-messaging=>544; functions.invoke=>526,544,583; getUser=>147; sms-boundary=>0), plus a full 1-699 read of the live file, a read of config.toml, and a read of MAIN lines 1-135. agentgrep false negatives detected and excluded.

**open_questions**

- Did not empirically probe the deployed function with the anon key; the anon-401 conclusion is inferred from GoTrue getUser semantics.
- Who still calls disposition-router in production, and with which token, is unconfirmed.
- Whether disposition_auto_actions rows exist (which would arm the send_sms auto-action) is unknown.
- Whether the deployed live version (gates doc says v472) byte-matches this functions-live snapshot is unconfirmed.

**edge_cases_considered**

- Non-Bearer or malformed auth header: token = authHeader.replace('Bearer ','') yields the raw header; getUser then fails and it is not the service key, so 401.
- Empty body userId: effects key on userId, so they would target a null/empty user rather than another tenant.
- transcript absent: negative-sentiment DNC block L294-328 is skipped.
- callId absent: no call_logs lookup; callEndedAt/campaignId stay null.
- dialing_queues priority>=2 (callbacks) preserved by the priority<2 filter at L265.

**what_i_did_not_check**

- No live HTTP probe of the deployed function (anon/user/service tokens); reachability rests on code reading.
- RLS policies on dnc_list, dialing_queues, lead_pipeline_positions, broadcast_queue, leads.
- Callers of disposition-router and which token each uses.
- Full LIVE-vs-MAIN diff; only gate/auth/invoke lines were compared.
- Deployed live version/hash vs this functions-live snapshot.
- Presence of disposition_auto_actions rows.

**confidence**: high