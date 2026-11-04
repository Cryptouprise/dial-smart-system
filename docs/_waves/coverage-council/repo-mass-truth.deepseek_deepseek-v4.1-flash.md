# What is the non-app mass of this repo, and is it load-bearing? - reviewer deepseek/deepseek-v4.1-flash

cost: $0.0009

---

## What each directory is, per the supplied evidence

**certification/ (275,299 lines / 505 files — 31.5% of the repo)**
- Confirmed role: it is the config root for the certification toolchain. Every `certify:*` script that runs Deno passes `--config certification/deno.json` (package.json:58, 59, 60, 61, 67, 71, 72). That is the only thing the excerpts show inside it.
- Used by: **`certify:*` pipeline, yes** (same lines). **Build, no** — `build` is plain `vite build` (package.json:11) and nothing in the shown build path references certification/.
- Runtime: **no** — no supplied excerpt shows shipped code importing it.
- Generated vs hand-written: **not determinable**. `deno.json` is a hand-authored config by nature, but I saw no listing of the other 504 files. THEORY (unverified): most of the 275k lines are certification test/harness code rather than config.

**scripts/ (105,148 lines)**
- Node driver scripts invoked by name from package.json — e.g. `scripts/check-eslint-baseline.mjs` (14), `scripts/check-edge-functions.mjs` (17), `scripts/run-vitest-shards.mjs` (21), and the entire `campaign:solar-exit:*` family (27–56).
- Used by: **`certify:*` and the test/lint scripts, yes** (`certify:static` chains many of them, package.json:73). **`vite build` itself, no** (11).
- Runtime: **no** — they are `node scripts/...` CLI entrypoints.
- Hand-written.

**docs/ (61,530 lines), content/ (15,397 lines)**
- **No supplied excerpt references either.** package.json has zero mention (whole 170 lines shown). I cannot state what they contain, whether they are generated, or whether any pipeline reads them. The `content/` name is consistent with the campaign-bundle material the `campaign:solar-exit:*` scripts validate (27–34), but that is THEORY, not evidenced.

**public/ (54,108 lines)**
- **No supplied excerpt references it.** THEORY: in a Vite project this is the static-asset root copied into `dist/` by `vite build` (11) — i.e. shipped-but-not-compiled, runtime-served as static files. I did not see vite.config, so I will not assert it.

**mcp-server/ (7,502 lines)**
- Confirmed: it is a nested npm package exercised by `certify:mcp` — `npm --prefix mcp-server ci && audit && run build && test` (package.json:70). So it is **built and tested by the certify pipeline**, not by the root `vite build` (11).
- Runtime dependence of the *product* on `mcp-server/`: **not shown**. The root app depends on the npm package `@lovable.dev/mcp-js` (package.json:78), which is an installed dependency, not this directory.
- Hand-written.

## Is certification/ what pins the NOT_CERTIFIED gates? — No.

- The gate code itself lives in the **shipped edge functions**, not in certification/. The supplied grep shows 73 matching lines under `supabase/functions/`, e.g. `supabase/functions/ai-assistant/index.ts:3007`, `supabase/functions/call-dispatcher/index.ts:417`, `supabase/functions/_shared/retell-provider-contract.ts:93–151`, `supabase/functions/outbound-calling/index.ts:299`. These are runtime `error_code`/`throw` returns in product source.
- `certification/` contributes only the Deno config those checks run under (package.json:58–61, 67, 71–72).
- Corroboration that the gates are a source-tree property rather than a deployed one: the 503 "certification gate" changes exist only on GitHub `main` and were never on live (supabase/functions-live/README.md:9–10, and :79–80 "the 503 `*_NOT_CERTIFIED` gates exist only on GitHub `main`, never on live").
- Caveat: I cannot rule out that some of certification/'s 504 unseen files *test* those gates. I only assert that the gates are not *implemented* there.

## Keeping vs deleting certification/

- **Keeping:** costs 31.5% of the repo (275,299/874,081) and 505 of 2,745 files (18.4%), but preserves the 8 `--config certification/deno.json` invocations (package.json:58, 59, 60, 61, 67, 71, 72 — 7 lines, 8–9 invocations), i.e. the whole Deno half of `certify:static` (73), which is the only mechanism in evidence that re-validates the shipped `supabase/functions/` code.
- **Deleting:** any `certify:*` Deno step loses its config and the pipeline in package.json:73 breaks. No shipped-product consequence is evidenced, because nothing in `vite build` (11) reads it.
- Net: it is release-gate infrastructure, not dead weight, but it is also not product.

## App-only line count and shipped fraction

**Not computable from the supplied evidence.** No per-directory figure was given for `src/`, `supabase/functions/`, or `supabase/migrations/`, so I will not invent one.

What can be bounded:
- Named non-product directories sum to 275,299 + 105,148 + 61,530 + 54,108 + 15,397 + 7,502 = **518,984 lines = 59.4%** of 874,081.
- Therefore *everything else* — `src`, `supabase/`, `e2e`, tests, root config — is **≤ 355,097 lines = ≤ 40.6%**, and strictly less than that, since that remainder also contains `e2e/`, `tests/`, root `.mjs` files, and the `supabase/functions-live/` snapshots.
- One known inflation inside that remainder: `supabase/functions-live/` is a duplicate, read-only snapshot of deployed code, explicitly not the editable source ("Do not edit files here; edit `supabase/functions/<slug>/`", README.md:10–11).

**Honest bottom line: shipped product is at most ~40% of the repo and probably materially less; ~59% is certification, scripts, docs, static assets, content, and the MCP server.** If you want the real app-only number, you need a per-directory count for `src/`, `supabase/functions/`, and `supabase/migrations/`.

## What I did NOT check
- Actual contents/listing of `certification/` (all but `deno.json`), `scripts/` (beyond named files), `docs/`, `content/`, `public/`, `mcp-server/`.
- `vite.config.*`, so `public/` → `dist/` is unflagged THEORY.
- Whether `content/` feeds the `campaign:solar-exit:*` bundle validator.
- Whether any file in `certification/` asserts on the `*_NOT_CERTIFIED` strings.
- Whether the "503" gate count is accurate; the supplied grep excerpt shows 73 matching lines and may be truncated.
- Runtime bundle composition (no build output or import graph supplied).

Confidence: **medium** — high on the certification/deno.json ↔ `certify:*` coupling, the `mcp-server` build/test coupling, the gate locations, and the arithmetic; low on docs/content/public contents and on any generated-vs-hand-written call.
