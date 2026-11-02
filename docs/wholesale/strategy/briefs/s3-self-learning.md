# S3. A self-learning system: what it learns, from what, and how it is kept honest

Read 00-common.md (attached) first.

TASK: Design the learning loops for the machine. Candidates: lead scoring and decay (who to call first), best time/channel per segment,
script and opener variants, objection handling (coach few-shot from accepted/corrected proposals, see coach_proposals in the material),
offer price modelling (what offers get accepted), buyer matching for disposition, list-source ROI (which lists produce contracts per $),
and operator coaching (rep performance). For each loop: the signal (which event in the material records it, FACT, or what must be added,
IDEA), the model or heuristic (start with the simplest that works: counts, Bayesian rates, bandits; say when an LLM is warranted), the
update cadence, guardrails against drift and feedback loops (e.g. the scorer starving segments it never calls), the holdout/A-B design,
and the first metric that proves the loop works.

OUTPUT FORMAT (markdown):
1. `## Learning loops` : one subsection per loop: Signal | Store (table, FACT/IDEA) | Model | Cadence | Guardrail | Proof metric | Effort S/M/L.
2. `## Data model additions` : the minimal tables/columns to add in Supabase (names, key columns, who writes them), referencing what exists.
3. `## First three experiments` : exact hypothesis, split, sample size reasoning, duration, decision rule.
4. `## What NOT to automate yet` : loops where the data is too thin or the risk too high, and the threshold to revisit.
5. `## Assumptions`.
Max 2,500 words. Label every claim FACT (path:line) / INDUSTRY (confidence) / IDEA.
