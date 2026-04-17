

The user is making one targeted refinement to the plan: they want US (not Retell) to be the source of truth for transfer detection. They're worried about the same bug we already identified — Retell sometimes labels transferred calls as `completed` instead of `transferred` — and they want a belt-and-suspenders rule:

**Their explicit ask:**
> "Regardless of disposition, in this one scenario only — if the transfer tool was fired AND the transcript matches — remove them, regardless of what Retell says it is."

This is exactly what the existing planned hardening does in spirit, but I need to make it more explicit in the plan so they know:
1. The transfer-tool-fired signal is the PRIMARY trigger (not Retell's disconnection_reason)
2. The transcript match is the SECONDARY confirmation
3. Retell's own label is IGNORED when those two agree

Let me update the plan to call this out clearly. No new files, no scope expansion — just sharpening step #2 of the recovery pass with the user's exact rule.

---

## Refinement to Append to `.lovable/plan.md`

I'll add a new section right after the "What I'm Accepting From The PDF Audit" block:

---

## Refinement: WE Decide Transfers, Not Retell (User Directive)

You're right, and this matches the bug we already saw: Retell does not reliably label transferred calls as `transferred`. Sometimes it says `completed`. Sometimes it says `user_hangup`. We cannot trust their label as the source of truth.

**The new rule for transfer detection (this one scenario only):**

A call is treated as `transferred` when BOTH of these are true, regardless of what Retell's `disconnection_reason` or `call_status` says:

1. **The `transfer_call` tool was fired during the call** (Retell's tool-call event log shows it)
2. **The transcript contains a transfer signal** (e.g., "I'll transfer you now," "connecting you," "one moment please," or the agent confirms a transfer destination)

If both are true → mark as `transferred`, remove from queue, no re-dial. **Retell's label is ignored.**

If only one is true → fall back to Retell's label (conservative).

If neither is true → use Retell's label as-is.

**Why this works:**
- The tool-call event is hard evidence that Grace decided to transfer.
- The transcript signal confirms she actually said it (not just fired the tool by mistake).
- Together they're a stronger signal than any disconnection_reason Retell could give us.
- This is the "regardless of disposition" backup you asked for — it's the override that catches the cases where Retell mislabels.

**Implementation detail:**
This becomes the new logic inside `mapCallStatusToOutcome()` in `retell-call-webhook`. The function will receive three inputs: `disconnection_reason`, `transcript`, and `tool_calls` (or `call_analysis.custom_analysis_data.tools_used` — whichever Retell exposes in the webhook payload). The function returns `transferred` if the two-signal rule fires, otherwise falls back to current logic.

**What this does NOT do (intentionally):**
- Does not run our own AI disposition analysis on every call (that's the bigger "we read the transcript and make our own choice" project you mentioned for later today — separate task, separate pass).
- Does not change anything about how non-transfer dispositions are decided. Other dispositions still come from Retell + existing analyzers until we build our own.
- Does not affect Ringba payload, caller ID, or anything outside the transfer-classification step.

**One open question (does NOT block the fix):**
I need to confirm what field Retell's webhook actually exposes for "which tools were called during the call." Likely candidates: `call.tool_calls`, `call.call_analysis.custom_analysis_data`, or an event log on the call object. I'll grep the existing webhook code and Retell's docs as the first step in default mode. If the field doesn't exist in the webhook payload, the fallback is to detect transfer-tool firing from the transcript alone (e.g., agent says the trigger phrase + a destination number is mentioned) — slightly weaker but still better than trusting Retell's label.

---

## Updated File List for the Recovery Pass

- `.lovable/plan.md` — append the refinement section above (no edits to existing plan content)
- `supabase/functions/call-dispatcher/index.ts` — remove duplicate `campaignIds` (boot fix)
- `supabase/functions/retell-call-webhook/index.ts` — implement the two-signal transfer rule in `mapCallStatusToOutcome()`
- `supabase/functions/outbound-calling/index.ts` — calling-hours guard for `create_call`
- `CLAUDE.md` — log the recovery pass

## Updated Validation Plan

1. `call-dispatcher` boots cleanly (no `Identifier already declared` in logs)
2. One real campaign-path test call to your number
3. Confirm:
   - Transfer happens
   - In our logs, the call is classified as `transferred` via the two-signal rule (tool fired + transcript match), even if Retell says `completed`
   - Lead is removed from queue, no re-dial
4. After that passes, we tackle the bigger "WE own all dispositions by reading the transcript ourselves" project as a separate pass later today.

