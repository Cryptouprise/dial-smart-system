# knownopen-item5-d2d-callback

- status: completed
- tldr: TRUE: d2d booking queues leads.next_callback_at + scheduled_follow_ups, but dispatcher callback automation is gated off and also needs a campaign_leads row it never gets.

VERDICT: TRUE — door-to-door doorstep booking queues a callback that cannot auto-fire while isCallbackAutomationCertified() returns false. Severity: medium-high (silent breakage of the flagship door->dialer continuum).

Chain: host.ts:738-783 syncDoorFollowUps -> enroll.ts:160-266 writes (a) leads.next_callback_at (:192,:225) and (b) a pending scheduled_follow_ups 'callback' row (:240-259). The only automated server consumer of that intent is call-dispatcher's past-due-callback block, gated off at index.ts:19-21 (returns false) and :640 ('if (isCallbackAutomationCertified())'), logging 'launch-disabled' at :636.

Compounding second gate: call-dispatcher/index.ts has 0 references to scheduled_follow_ups, and even the gated block requires a campaign_leads row with an active campaign (:699-707, 'if (!campaignLead) continue;') which enroll.ts never creates — so the door lead would be skipped there too. The rep still sees the follow-up in-app (human path alive); only the automatic dial is dead.

Evidence file:line in the artifact. FACT (static source read), not runtime-observed.

## Artifact

**Findings**

VERDICT: TRUE (with a compounding second gate). A door-to-door doorstep booking (status 'callback' or 'appointment') is carried by host.ts syncDoorFollowUps -> enroll.ts enrollDoorFollowUp, which writes TWO callback artifacts: (1) leads.next_callback_at = dueAt, and (2) a pending scheduled_follow_ups row (action_type 'callback'). The only automated, server-side consumer of that callback intent is call-dispatcher's past-due-callback automation, and the entire block is gated off: call-dispatcher/index.ts:19-21 isCallbackAutomationCertified() hardcodes 'return false', and :640 wraps the whole block in 'if (isCallbackAutomationCertified())', with :636 logging '[Dispatcher] Callback automation is launch-disabled'. So the callback can be queued but can never fire automatically. SECOND, COMPOUNDING GATE: call-dispatcher never reads scheduled_follow_ups at all (0 matches in the file), and even the gated callback block requires a matching campaign_leads row with an active campaign (:699-707, 'if (!campaignLead) continue;'); enroll.ts creates the lead but never creates a campaign_leads junction row, so the door-sourced lead would ALSO be skipped at :707 even if the certification gate were flipped. Net: the automatic door->dialer callback is dead at two points. NOT dead for a human: the rep still sees the due follow-up in the DoorBoss app (src/packs/door_to_door/app/scripts.js reminders/callbacks list) and can walk back/act manually; what cannot happen is the dialer auto-calling.

**evidence**

- supabase/functions/call-dispatcher/index.ts:19-21 - function isCallbackAutomationCertified(): boolean { return false; }
- supabase/functions/call-dispatcher/index.ts:636 - console.log('[Dispatcher] Callback automation is launch-disabled')
- supabase/functions/call-dispatcher/index.ts:640 - if (isCallbackAutomationCertified()) { ... } gates the entire past-due-callback block (reads leads.next_callback_at at :647-648)
- src/packs/door_to_door/host.ts:738-783 - syncDoorFollowUps() filters status 'callback' with callback_at / 'appointment' with appointment_at, then calls enrollDoorFollowUp (dueAt = knock.callback_at ?? knock.appointment_at at :779)
- src/packs/door_to_door/enroll.ts:192 and :225 - writes leads.next_callback_at = dueAt (update path and insert path)
- src/packs/door_to_door/enroll.ts:240-259 - cancels prior pending 'callback' scheduled_follow_ups then inserts a new pending row (action_type 'callback')
- findstr scheduled_follow_ups supabase/functions/call-dispatcher/index.ts -> 0 matches (dispatcher never consumes scheduled_follow_ups)
- supabase/functions/call-dispatcher/index.ts:699-707 - callback path requires campaign_leads with campaigns.status='active'; 'if (!campaignLead) continue;' — enroll.ts never inserts a campaign_leads row
- docs/dial-smart-app-map.md:139-140 - the claim under verification

**validation**

Read the gate definition and its single consumer at file:line; traced the full door booking -> queue chain (host.ts:738-783 -> enroll.ts:160-266); grepped the entire repo for scheduled_follow_ups and confirmed call-dispatcher/index.ts is absent from the consumer set; read the campaign_leads requirement inside the gated block. Repo tree at C:/Users/charl/dial-smart-system (src/ layout; note the machine root also has same-named files). Static source reading only — no live DB query, no execution.

**open_questions**

- Does any non-dispatcher server path (cron, other edge function) consume leads.next_callback_at to place calls? Grep showed only client hooks and the gated dispatcher block.
- Is the dispatched/live build actually the same source (the app-map carries a separate 'local dist/ is stale' item)?
- Counterfactual: with both gates opened (certification true AND a campaign_leads row), would the callback then dial correctly? Not verified end-to-end.

**what_i_did_not_check**

- Live Supabase DB (emonjusymdripmkvtttc): whether any door-sourced leads/campaign_leads rows exist today, or whether the callback block has ever executed in prod logs.
- Whether the published/live build matches this source, or local dist staleness affects which code runs.
- Whether a human rep working the DoorBoss in-app follow-up counts as the callback 'firing' (semantic boundary of the claim) — I treated 'fire' as automatic dialer/SMS, not human action.
- retell-call-webhook (functions and functions-live) also insert into scheduled_follow_ups — did not check whether that path changes the door booking's fate.
- No runtime reproduction; findings are static, from source, not observed behavior.

**confidence**: high