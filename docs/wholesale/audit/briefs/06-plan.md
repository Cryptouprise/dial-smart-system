# JOB 06 - Draft the build plan (lane: flash)
## GOAL (from the CEO, Charles)
One app (Dial Smart, React + Supabase, built with Lovable) sold to many companies. At sign-up a company picks one or more
INDUSTRY PACKS (Solar Exit, Wholesale Real Estate, later Mortgage, Law Firm...) and can turn on more later in the same account.
Every company gets the shared core: logins + team roles, contacts, a dialer where their PEOPLE dial from the browser
(Telnyx WebRTC) AND the AI caller dials (Retell Grace / Telnyx AI), texting, phone numbers, Do Not Call, billing with an
automatic access lock when unpaid. Keep it simple: the app is already overbuilt; hide what a pack doesn't use. No clone.
## WHAT WE KNOW (the audit reports in the material are the facts; the live DB has ONE organization, 3,298 leads,
40 numbers; the July 2026 hardening migrations in the repo were never applied to the live DB; sms tables are per-user;
inbound SMS falls back to "most recent user"; no browser-calling code exists; Telnyx voice/SMS code paths exist)
## TASK
Write the plan a senior engineer will execute this week. Be concrete and short.
1. Phases in build order (max 6). For each: goal in one line, exact changes (tables, edge functions, pages), how we
   prove it works (a test a person can run), and a size (S/M/L).
2. The "pack" mechanism: how a pack is stored (table/columns), how the UI shows/hides screens per pack, how a pack adds
   its own fields, pipeline stages and scripts. Prefer the simplest design that works.
3. Telnyx browser phone: the pieces (credential/token endpoint, connection, call control webhook, recording, logging to
   call_logs), what Telnyx account setup is needed, and per-company number + caller ID rules.
4. Multi-company finishing list: every gap from the audit that must close before a second paying company is onboarded,
   ranked by risk.
5. What NOT to build now.
## OUTPUT FORMAT
Markdown, these headings only: ### Phases ### Packs ### Telnyx browser phone ### Before company #2 ### Not now.
Under 900 words. Cite audit facts as (report:section). Mark anything you are guessing as GUESS.
