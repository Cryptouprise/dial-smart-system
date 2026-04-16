
The user wants to understand the transfer architecture AND get a test call placed to their phone (214-529-1531) so they can verify Grace's transfer + Ringba webhook works end-to-end.

Let me explain the architecture clearly, then propose a concrete test plan.

## How the transfer actually works (plain English)

1. **We dispatch the call** via our `outbound-calling` edge function → Retell API.
2. **Retell places the call** using one of OUR phone numbers (the caller ID from `phone_numbers` table) → rings the lead.
3. **Grace (Retell agent) talks** to the lead using the prompt, voice, and tools we configured.
4. **When Grace decides to transfer**, she fires the `transfer_call` tool. That tool has:
   - `transfer_destination.number` = where to send them (David / Ringba pool)
   - `transfer_option.show_transferee_as_caller` = true/false
5. **Right before the transfer connects**, Retell fires the **Ringba webhook tool** (separate tool) which sends lead tags + custom variables to Ringba's enrichment endpoint.
6. **Retell's carrier bridges** the original lead to David. The carrier decides what caller ID David sees:
   - If `show_transferee_as_caller = true` AND the carrier honors it → David sees the LEAD's number → Ringba matches the enrichment → tags appear.
   - If `show_transferee_as_caller = false` OR carrier strips it → David sees OUR Retell number → Ringba can't match → no tags.

**So our system's only job in the transfer is the toggle on the tool config.** Once Retell takes the call, it's Retell + carrier doing the work. We don't touch the audio.

## Test plan — call you at 214-529-1531

Step 1 — Verify config is correct before dialing
- Confirm `show_transferee_as_caller = true` on Grace's `transfer_call` tool (both top-level and nested in `transfer_option`).
- Confirm Grace's Ringba webhook tool is still attached and fires before transfer.
- Confirm the diagnostic log fix from last session is in place so we can SEE what setting was actually sent.

Step 2 — Add you as a test lead temporarily
- Insert a one-off lead with phone `+12145291531`, name "Charles Test", into a small test campaign (or reuse an existing test campaign).
- Make sure the lead has `do_not_call = false` and isn't on DNC.

Step 3 — Place ONE call
- Use the existing test-call orchestration (`src/lib/testCallUtils.ts`) or trigger via `outbound-calling` directly with your number.
- Grace calls you from one of our Retell numbers.
- You answer, say "transfer me" (or whatever Grace's transfer trigger phrase is).
- Grace fires Ringba webhook + transfers you to David at +19097376175.

Step 4 — Verify three things
- David picks up → confirms whether he sees YOUR number (214-529-1531) or our Retell number.
- Ringba dashboard → check if the call shows up with tags attached.
- Our edge function logs → confirm `transfer_option.show_transferee_as_caller = true` was actually sent.

Step 5 — Branch on result
- **David sees your number + Ringba has tags** → transfers work, system is cleared for relaunch.
- **David sees our Retell number** → carrier is stripping caller ID. Need to test other DIDs to find one the carrier honors (this is what the skill docs were saying, but you only need to do it ONCE, not for all 22).
- **Ringba has no tags** → webhook tool config issue, not a transfer issue. Separate fix.

## What I'll change in code (minimal, surgical)

1. **Re-verify** `show_transferee_as_caller = true` is saved on the transfer_call tool in the database (read-only check first).
2. **Fix the diagnostic logging bug** in `supabase/functions/outbound-calling/index.ts` lines 1086-1087 so it reads `tool.transfer_option?.show_transferee_as_caller` (the nested path) instead of the wrong top-level path. This was producing the misleading "NOT SET" logs that started this whole confusion.
3. **Add your number as a temporary test lead** via SQL.
4. **Place one test call** to you.

## What I will NOT do

- Won't touch any other agent settings.
- Won't change any rotation_enabled flags.
- Won't change any other campaign or lead.
- Won't deploy any other edge functions besides `outbound-calling` (for the log fix).
- Won't build the disposition-removal rule in this same pass — that's a separate task we'll do right after the transfer test passes.

## Files I'll touch

- `supabase/functions/outbound-calling/index.ts` — fix log lines 1086-1087 only
- One SQL insert for the test lead (cleanup after)
- One edge function call to dispatch your test call

## Success criteria

You answer your phone, say transfer, David's phone rings, David tells you what number he saw, Ringba shows or doesn't show tags. Three data points, one call, ~2 minutes of real work.

Approve this and I'll switch to default mode and run it.
