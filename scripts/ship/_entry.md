## 2026-11-03 - Door to Door: a doorstep follow-up now enrolls a Dial Smart lead + a queued callback (jcode)

- **Tier:** 4 - the new host bridge writes to `leads` and `scheduled_follow_ups` at runtime.
- **What:** `src/packs/door_to_door/enroll.ts` (new) + `host.ts` wired. A booked doorstep outcome
  (`status` callback/appointment, or any knock carrying a follow-up time) now creates or updates the
  Dial Smart lead for that house and queues exactly one pending `callback` row in
  `scheduled_follow_ups`. Hard gate: the rep's "OK to text them" consent is required; do-not-contact
  houses and unusable numbers are skipped. Nothing is ever sent - the row is a queue entry for the
  dialer to work later.
- **Writes at runtime:** `leads` (insert, or update of an existing row matched on phone), then
  `scheduled_follow_ups` (cancel that lead's prior pending callback, then insert one).
  `organization_id` comes from `default_organization_for_user` - the same helper Dial Smart's own
  RLS policies use - so the writes pass the tenant policies as the signed-in rep.
- **Verification:** `python scripts\ship\_check.py both` -> tsc exit 0, eslint exit 0 (the same 3
  pre-existing `Dashboard.tsx` warnings); `vitest run src/packs/door_to_door` -> 30/30 pass, of which
  8 are new tests on this bridge: consent refusal, do-not-contact refusal, no-phone refusal, new-lead
  queue shape, existing-lead match across phone shapes, no stacked callbacks, cancel-before-insert
  order, and failure reported rather than thrown.
- **Not yet live:** the commit and push happen with this entry. Going live still needs **one manual
  Publish click by Charles** in Lovable - pushing alone does not deploy.
- Result: pending
