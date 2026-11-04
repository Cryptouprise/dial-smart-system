# What is the non-app mass of this repo, and is it load-bearing?

lane: repo-mass-truth  mode: council  reconciled by: manager:deepseek/deepseek-v4.1-flash over 3 reviewers
reviewers: deepseek/deepseek-v4.1-flash, qwen/qwen3.8-flash, google/gemini-3.8-flash
cost: $0.0361 (reviewers $0.0349 + manager $0.0011)
tokens: 15685 in / 2116 out
files: package.json, supabase/functions-live/README.md

---

## Reconciled answer

**certification/** — Deno config root for the `certify:*` pipeline. Only evidenced content is `certification/deno.json`, passed via `--config` in package.json:58–61, 67, 71, 72. Not referenced by `vite build` (line 11). No evidenced runtime import. Generated vs hand-written: **unresolved** — 504 of 505 files unseen.

**scripts/** — hand-written Node CLI drivers invoked by name (lines 14, 17, 19–21, 27–73). Used by `certify:*`/test/lint; not by `vite build`; not runtime.

**docs/**, **content/** — no reference in the supplied package.json or grep. Contents, generation, and consumers: **unknown**.

**public/** — no reference in supplied evidence. Vite static-root behavior is convention, not shown.

**mcp-server/** — nested npm package built/tested by `certify:mcp` (line 70). Not in root build. Product runtime dependence unproven; the root app depends on the npm package `@lovable.dev/mcp-js` (line 78), not this directory.

**NOT_CERTIFIED gates** — implemented in `supabase/functions/*.ts` and `_shared/*.ts` (grep hits, e.g. `call-dispatcher/index.ts:417`, `outbound-calling/index.ts:299`, `_shared/retell-provider-contract.ts:93`). `certification/` supplies only the Deno config those checks run under. README:9–10, 80 confirms the gates exist only on GitHub `main`, never live. **So: certification/ is not the apparatus that pins the gates.**

**Keep vs delete** — Keeping costs 275,299 lines (31.5%) / 505 files (18.4%) and preserves the Deno half of `certify:static` (line 73). Deleting breaks the `--config certification/deno.json` steps (58–61, 67, 71, 72) and therefore `certify:static`. No evidenced product/runtime consequence either way.

**App-only count** — **Not computable.** No per-directory counts for `src/`, `supabase/functions/`, `supabase/migrations/`. Ceiling: 874,081 − 518,984 = **355,097 lines = 40.6%**, and that remainder still contains `e2e/`, tests, root configs, and `supabase/functions-live/` snapshots. Shipped product is **< 40.6%, likely materially less**.

## Disagreements

1. **public/ runtime status.** R3 asserts "Yes" and "copied into dist by vite build." R1/R2 call it theory. Evidence favours R1/R2: no `vite.config` or asset references supplied.
2. **docs/ and content/ nature.** R3 asserts "hand-written." R1/R2 say unknown. Evidence favours unknown — nothing cited.
3. **mcp-server/ nature.** R3 asserts "hand-written standalone server." R1/R2 say unknown/likely. Unresolved.
4. **Shipped fraction.** R3 says "~40% to 45%," contradicting its own 40.6% ceiling. R2's 48.6% is an upper bound under a broader definition, not a shipped count. R1's ≤40.6% is the defensible one.
5. **certification/ generated vs hand-written.** R1 "not determinable," R2 "likely mixed," R3 "tooling config/test artifacts." Unresolved.

## Claims I reject

- **R3:** `public/` is a runtime dependency copied into `dist` — unsupported by cited evidence.
- **R3:** `docs/` and `content/` are hand-written — unsupported.
- **R3:** `mcp-server/` is a "hand-written standalone server" — plausible, unevidenced.
- **R3:** confidence "High" — unjustified given the unknowns it itself lists.
- **R3:** "~40% to 45%" shipped — internally inconsistent with its own arithmetic.
- **R2:** the 48.6% figure should not be read as a shipped-product fraction; it is a ceiling under a different definition.

## Not checked by any reviewer

- Contents of `certification/` beyond `deno.json` (504 files).
- Whether any `certification/` file asserts on `NOT_CERTIFIED` strings.
- `vite.config.*`.
- Line counts for `src/`, `supabase/functions/`, `supabase/migrations/`.
- Whether `content/` feeds the campaign-bundle validator.
- Whether `mcp-server/` is deployed anywhere.
- Whether "503" is accurate — grep shows 73 lines, possibly truncated.
- Build output / import graph.

## Confidence

**Medium.** Most valuable next check: per-directory line counts for `src/`, `supabase/functions/`, `supabase/migrations/`, plus a full listing of `certification/`.
