# S1. The most automated wholesale real-estate machine that can run inside Dial Smart

Read 00-common.md (attached) first.

TASK: Design the end-to-end flow of a wholesale real-estate acquisition business as "automated as humanly possible" on top of what the
material shows exists (Dial Smart tables/functions, Grace AI caller, browser phone + live coach, texting, pipelines, dispositions,
workflows, DNC). Cover: list sourcing (permits, code violations, foreclosure/pre-foreclosure, probate, tax delinquency, absentee, vacancy,
driving-for-dollars), scoring and decay, skip trace, DNC/litigator scrub, multi-channel outreach sequencing (AI call, human call with
coach, text, mail), appointment/offer, offer math and sending (Accept/Counter link), contract, disposition/assignment to buyers,
closing follow-through, and the data loop back into scoring. For EVERY step state: trigger, actor (automation / AI / human), data in,
data out, the Dial Smart object it lives in (FACT from material or IDEA), the failure mode and the guard.

OUTPUT FORMAT (markdown):
1. `## Flow table` : one row per step, columns: Step | Trigger | Actor | Data in -> out | Lives in (Dial Smart object) | Failure mode | Guard | Label.
2. `## Top 10 automations by leverage` : ranked list; each with estimated $ impact per month for a one-market shop (state assumptions),
   build effort (S/M/L), and what in the material it reuses.
3. `## Human touchpoints that must stay human` : the few decisions a person makes, and why.
4. `## Gaps in the current build` : what the material shows is missing for this flow (cite), ordered by how much automation it unlocks.
5. `## Assumptions` : numbered.
Max 2,500 words. Label every claim FACT (path:line) / INDUSTRY (confidence) / IDEA.
