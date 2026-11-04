# What is the non-app mass of this repo, and is it load-bearing? - reviewer qwen/qwen3.8-flash

cost: $0.0090

---

## Bottom line

**Fact:** `certification/` is **not** the code that returns the `*_NOT_CERTIFIED` gates. The supplied grep shows those gate strings in `supabase/functions/*.ts` and `supabase/functions/_shared/*.ts`, e.g.:

- `supabase/functions/ai-assistant/index.ts:3007` — `AI_ASSISTANT_SMS_EGRESS_NOT_CERTIFIED`
- `supabase/functions/call-dispatcher/index.ts:417` — `FORCE_DISPATCH_NOT_CERTIFIED`
- `supabase/functions/outbound-calling/index.ts:299` — `PROVIDER_EGRESS_NOT_CERTIFIED`
- `supabase/functions/_shared/retell-provider-contract.ts:93` — `RETELL_AGENT_NOT_CERTIFIED`

**Fact:** `certification/` is referenced by the `certify:*` pipeline as a Deno config path:

- `package.json:58` — `certify:elite-email-mailgun-events` uses `--config certification/deno.json`
- `package.json:59-61` — release-registration/preparation/status use `certification/deno.json`
- `package.json:67` — `certify:campaign-contact-release` uses `certification/deno.json`
- `package.json:71` — `certify:control-plane` uses `certification/deno.json`
- `package.json:72` — `certify:elite-solar-preflight` uses `certification/deno.json`
- `package.json:73` — `certify:static` invokes those commands

**Fact:** the live Supabase snapshot README says the 503 certification gates are **not live**:

- `supabase/functions-live/README.md:9-10` — GitHub `main` carries unreleased 503 “certification gate” changes that live does **not** have
- `supabase/functions-live/README.md:80` — “the 503 `*_NOT_CERTIFIED` gates exist only on GitHub `main`, never on live”

So: `certification/` is best understood as a **certification/typecheck/test harness directory**, not the runtime gate apparatus. The gates themselves are in edge-function source.

---

## Directory-by-directory

| Directory | What the evidence supports | Generated / hand-written? | Used by `build`? | Used by `certify:*`? | Runtime product dependency? |
|---|---|---|---|---|---|
| `certification/` — 275,299 lines / 505 files | A certification harness/config area. Direct evidence: `package.json:58-61,67,71-72` use `certification/deno.json` for Deno `fmt`, `lint`, `check`, and `test` commands. | **Unknown from supplied evidence.** Likely mixed: hand-written Deno config plus possibly generated lockfiles, because commands use `--frozen`. That is **theory**. | **No direct evidence.** Root build is `vite build` at `package.json:11`. | **Yes.** At least seven `certify:*` commands explicitly reference `certification/deno.json`; `certify:static` runs them at `package.json:73`. | **No evidence.** It appears to be tooling/CI, not shipped app runtime. |
| `scripts/` — 105,148 lines | Automation, checks, tests, campaign certification, and `certify:*` helpers. Direct evidence: many npm scripts run `node scripts/*.mjs`, e.g. `package.json:14,17,19-21,27-40,45-73`. | **Likely hand-written**, but generated artifacts cannot be excluded from supplied evidence. | **No direct evidence.** `build` is `vite build` at `package.json:11`. | **Yes.** `certify:*` uses many scripts: `certify:contact-egress-surfaces` `package.json:35`; `certify:provider-administration-surfaces` `package.json:36`; `certify:database-recovery:test` `package.json:68`; `certify:static` `package.json:73`. | **No evidence.** Development/certification tooling, not app runtime. |
| `docs/` — 61,530 lines | Documentation or generated docs. No direct reference in supplied `package.json`. | **Unknown.** Could be hand-written, generated, or mixed. | **No evidence.** | **No evidence.** | **No evidence.** |
| `public/` — 54,108 lines | Likely Vite static assets, because the project is Vite/React: `package.json:10-12`. But no supplied evidence shows its contents or imports. | **Unknown.** Static assets can be hand-written or generated. | **Theory only:** Vite commonly copies `public/` into build output, but supplied evidence does not show `vite.config` or asset references. | **No evidence.** | **Possible runtime dependency**, but not verified from supplied evidence. |
| `content/` — 15,397 lines | Unknown content directory. No direct reference in supplied evidence. | **Unknown.** | **No evidence.** | **No evidence.** | **Possible runtime dependency**, but not verified. |
| `mcp-server/` — 7,502 lines | A separate MCP server package. Direct evidence: `package.json:70` — `certify:mcp` runs `npm --prefix mcp-server ci`, `audit`, `build`, and `test`. | **Unknown.** Likely hand-written server source, but not shown. | **No direct evidence.** Root `build` is `vite build` at `package.json:11`. | **Yes.** `certify:mcp` at `package.json:70`, included in `certify:static` at `package.json:73`. | **No evidence.** The root app has `@lovable.dev/mcp-js` as a dependency at `package.json:78`, but that is not proof the shipped app depends on the `mcp-server/` directory at runtime. |

---

## Does `certification/` pin the 503 `NOT_CERTIFIED` gates?

**No, not as runtime code.**

**Fact:** the `NOT_CERTIFIED` gate strings are in `supabase/functions` source, not in the supplied `certification/` evidence. The only supplied `certification/` role is as a Deno config used by `certify:*` commands.

**More precise answer:** `certification/` may **pin the certification environment** for edge-function checks/tests, but the supplied evidence does not show that it contains or controls the runtime 503 gates.

**Fact from README:** the live product does not currently depend on those gates:

- `supabase/functions-live/README.md:9-10`
- `supabase/functions-live/README.md:80`

So if the repo is deployed as-is from `main`, the gates are in source; if live is the current product, live does not have them.

---

## Cost of keeping vs deleting `certification/`

### Keeping it

**Known cost:** it is large.

- 275,299 lines / 874,081 total = **31.5% of repo lines**
- 505 files / 2,745 total = **18.4% of repo files**

**Runtime cost:** no evidence of runtime cost.

**CI/maintenance cost:** likely, because `certify:static` invokes Deno checks that use it:

- `package.json:73`

But exact CI time is not supplied.

### Deleting it

**Known breakage:** at least these commands would fail because they reference `certification/deno.json`:

- `package.json:58`
- `package.json:59`
- `package.json:60`
- `package.json:61`
- `package.json:67`
- `package.json:71`
- `package.json:72`

And `certify:static` would fail because it invokes those commands:

- `package.json:73`

**Runtime product cost:** no evidence that deleting `certification/` changes runtime product behavior.

**Release-assurance cost:** potentially high. It appears to be part of the certification pipeline. Deleting it without replacing the Deno config/checks would remove or break edge-function certification checks.

**If it contains generated lockfiles or test fixtures:** deleting it may hurt reproducibility, but that is **not shown by supplied evidence**.

---

## Honest app-only line count: `src` + `supabase/functions` + `migrations`

**Fact:** the supplied evidence gives total repo lines and the six named directory line counts, but it does **not** give line counts for:

- `src/`
- `supabase/functions/`
- `migrations/`

Therefore: **I cannot give a verified exact app-only line count from the supplied evidence.** Any exact number would be fabricated.

The only defensible number is an **upper bound**.

### Upper bound

Sum of the six listed directories:

- `certification/`: 275,299
- `scripts/`: 105,148
- `docs/`: 61,530
- `public/`: 54,108
- `content/`: 15,397
- `mcp-server/`: 7,502

Total listed: **518,984 lines**

Repo total: **874,081 lines**

Remaining outside those six directories:

**874,081 - 518,984 = 355,097 lines**

So:

- Strict app-only line count: **unknown**
- Strict app-only upper bound: **≤ 355,097 lines**
- Strict app-only upper-bound fraction: **≤ 355,097 / 874,081 = 40.6%**

This upper bound is not “shipped product” yet, because the remaining lines include other non-listed directories/files, including at least `supabase/functions-live/` snapshots, which the README documents as live edge-function copies rather than app source.

### If you include `public/` and `content/` as runtime assets

If “shipped product” includes runtime static/content assets, then the maximum outside the clearly tooling/docs/server package directories is:

- total minus `certification/`, `scripts/`, `docs/`, `mcp-server/`
- 874,081 - (275,299 + 105,148 + 61,530 + 7,502)
- = **424,602 lines**
- = **48.6%**

But this is still an **upper bound**, not a verified shipped-product line count.

---

## What I did not check

I did not inspect:

- contents of `certification/`
- contents of `src/`
- contents of `migrations/`
- full `supabase/functions/` tree line counts
- `vite.config.*`
- whether `public/` or `content/` are imported by app code
- whether `mcp-server/` is deployed as part of the product runtime
- exact CI duration or runtime behavior of the 503 gates beyond the supplied grep/README evidence

Confidence: low overall — high for the cited `package.json`/grep/README facts, low for the exact app-only line count and shipped-product fraction.
