# S2. Checks and balances: a control system that keeps the machine predictable and safe

Read 00-common.md (attached) first.

TASK: Design the control layer for an automated wholesale RE machine run by a small team with AI callers, human browser calling, texting
and offer automation. Cover: compliance gates (TCPA consent/time windows, DNC scrub incl. litigator lists, state wholesaling/licensing
rules, texting 10DLC registration, caller-ID attestation STIR/SHAKEN, recording consent), quality gates (lead quality, duplicate/stale
data, bad skip traces, AI call quality), spend caps (data, skip trace, minutes, texting), human-in-the-loop checkpoints (what needs a
tap, what needs a signature), kill switches, audit trail, alerting thresholds, and a daily/weekly review rhythm. Make it predictable:
define the handful of numbers a manager watches and the thresholds that trigger action.

OUTPUT FORMAT (markdown):
1. `## Control matrix` : rows = risks; columns: Risk | Where it enters | Preventive control | Detective control | Owner (automation/AI/human) | Dial Smart object (FACT/IDEA) | Severity.
2. `## Gates in order` : the ordered list of gates a lead passes from "on a list" to "contract", each with pass/fail rule.
3. `## Kill switches and caps` : exact switches (per company, per campaign, per channel) and default caps with reasoning.
4. `## Weekly review` : the 7 numbers, their healthy ranges, and the action when out of range.
5. `## Legal flags` : VERIFY-WITH-ATTORNEY items, each as a question with what hinges on it (Tennessee first, then national).
6. `## Assumptions`.
Max 2,500 words. Label every claim FACT (path:line) / INDUSTRY (confidence) / IDEA.
