# The defensible product strategy - reviewer google/gemini-3.8-flash

cost: $0.0145

---

### 1. The One Differentiator
"Dial Smart links door-to-door field knocks directly to instant, AI-assisted outbound phone follow-ups and live-coached callbacks in a single workspace."  
*(FACT: `src/packs/door_to_door/` 7,666 LOC in `docs/dial-smart-app-map.md:49-51`; `coach-suggest` / `coach-decide` in `docs/dial-smart-app-map.md:47-48`; `call-dispatcher` in `docs/dial-smart-app-map.md:60`)*

---

### 2. The First Paying Customer & Week-One Deliverable
* **Target Customer:** A regional residential field-sales team (e.g., solar or roofing; pack IDs include `solar_exit` and `door_to_door`, `src/lib/packs.ts:14`). *(THEORY)*
* **Week-One Sale:** The Door-to-Door field workspace (`components/Dashboard.tsx:515`, `src/packs/door_to_door/`) configured for canvassers to log territories, properties, and knocks, paired with outbound dialing for follow-up leads (`components/call/CallWorkspace.tsx:795`, `functions/outbound-calling`).
* **Operational Reality:** Payment must be handled off-platform in week one because live Stripe secrets are currently missing (`docs/dial-smart-app-map.md:138`).

---

### 3. What Must Be True for Month-One Renewal
1. **The doorstep-to-callback loop actually executes:** Door-to-door callbacks cannot sit dead in queues; `call-dispatcher/index.ts:19` must be certified (`isCallbackAutomationCertified()` currently returns `false`, `docs/dial-smart-app-map.md:139-140`).
2. **Telephony reliability:** Webhooks cannot fail on missed secrets (`voice-call-events` returns 503 when `WEBHOOK_SECRET_TELNYX` is unset, `docs/dial-smart-app-map.md:136`).
3. **Attributable closed revenue:** The customer must see at least one contract signed directly from an automated door-to-dial follow-up. *(THEORY)*

---

### 4. Three Things to STOP Building
1. **Autonomous "AI Managers" and Swarms:** Halt additions to `functions/ai-autonomous-engine` (5,645 LOC), `components/AutonomousAgentDashboard.tsx` (1,274 LOC), and `MissionBriefingWizard.tsx` (1,838 LOC) (`docs/dial-smart-app-map.md:71-74, 157`).
2. **Ad Management & Cold Email Expansion:** Drop requests to build native ad launching and email sequencing (`functions/email-sender`, `elite-email-release-*`, `docs/dial-smart-app-map.md:116-117, 153-155`).
3. **Web & Phone Scraping:** Stop building scrapers into the core backend (`functions/demo-scrape-website`, `docs/dial-smart-app-map.md:119-120, 154-155`).

---

### 5. Honest Failure Risk & Earliest Signal
* **Honest Risk:** Sprawl across 160,832 lines (`docs/dial-smart-app-map.md:25`), 110 edge functions (`docs/dial-smart-app-map.md:33`), and 3 telephony carriers (`docs/dial-smart-app-map.md:44-45`) dilutes attention while critical revenue pipes remain blocked (callbacks disabled at `call-dispatcher/index.ts:19`, missing Stripe secrets at `docs/dial-smart-app-map.md:138`, and unhandled 503s at `docs/dial-smart-app-map.md:136`).
* **Earliest Signal:** Within 48 hours of onboarding, a canvasser logs 20 doorstep callbacks in `d2d-app` (`components/Dashboard.tsx:515`), zero automated outbound calls fire due to `isCallbackAutomationCertified() === false` (`docs/dial-smart-app-map.md:139-140`), and the sales team reverts to their spreadsheets or native CRM. *(THEORY)*

---

### What Was Not Checked
* Did not inspect `supabase/functions/call-dispatcher/index.ts` directly to verify lines outside line 19.
* Did not inspect live Supabase environment keys, Stripe config, or Telnyx webhook secret configurations.
* Did not examine individual files in `src/packs/door_to_door/` or SQL migrations.

**Confidence:** High
