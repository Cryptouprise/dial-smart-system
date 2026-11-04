# What is the non-app mass of this repo, and is it load-bearing? - reviewer google/gemini-3.8-flash

cost: $0.0250

---

### Directory Analysis

| Directory | Lines / Files | Nature | Used by Build / Certify Pipeline? | Runtime Dependency? |
|---|---|---|---|---|
| **`certification/`** | 275,299 / 505 | Tooling config / test artifacts (supplies `deno.json`) | **Certify only**: Referenced via `--config certification/deno.json` in `certify:*` scripts (`package.json:58-72`). Not used by `vite build`. | **No**: Not imported by browser client or deployed edge functions. |
| **`scripts/`** | 105,148 | Hand-written Node / MJS tooling | **Certify & Test**: Heavily invoked in `package.json` (`certify:*`, `test`, `campaign:*`, `lint:errors`). Not used by `vite build`. | **No**. |
| **`docs/`** | 61,530 | Hand-written documentation | Neither. | **No**. |
| **`public/`** | 54,108 | Hand-written / static assets | **Build**: Copied into `dist` by `vite build` (`package.json:11`). | **Yes**: Static web client assets (icons, manifest, etc.). |
| **`content/`** | 15,397 | Content / templates | Not in `package.json` scripts; build usage depends on `src/` imports. | **THEORY**: Runtime-dependent only if imported by `src/`. |
| **`mcp-server/`** | 7,502 | Hand-written standalone server | **Certify only**: Tested in `npm run certify:mcp` (`package.json:70`). Not in `vite build`. | **No**: Out-of-band MCP server tooling. |

---

### Does `certification/` Pin the 503 `NOT_CERTIFIED` Gates?

* **FACT**: **No.** The `*_NOT_CERTIFIED` gates are hardcoded checks and error returns embedded directly inside edge function code under `supabase/functions/` (e.g., `supabase/functions/advanced-spam-detection/index.ts:33`, `call-dispatcher/index.ts:1666`, `outbound-calling/index.ts:299`, `_shared/retell-provider-contract.ts:93`).
* **FACT**: Live Supabase functions do not even have these gates; they exist strictly on GitHub `main` (`supabase/functions-live/README.md:9-10,80`).
* **Cost of keeping `certification/`**: 275,299 lines (31.5% of the repository) of overhead and Deno test/lint artifacts.
* **Cost of deleting `certification/`**: Breaks CI/certification scripts that pass `--config certification/deno.json` (`package.json:58-72`, including `certify:static`). It does **not** lift or affect the 503 gates in production edge functions.

---

### App-Only Line Count & Shipped Fraction

* **Known non-app total**: The six directories above account for **518,984 lines** (59.4% of the repo).
* **Maximum app ceiling**: The remainder of the repository is **355,097 lines** (~40.6%).
* **FACT**: Exact line-by-line totals for `src/`, `supabase/functions/`, and `migrations/` were not provided in the supplied excerpts.
* **Shipped fraction**: Shipped product (`src/` + active `supabase/functions/` + `migrations/` + `public/`) represents **at most ~40% to 45%** of the repo (and less once root configs, `e2e/`, and `supabase/functions-live/` snapshots are subtracted).

---

### Explicitly Not Checked
* The exact internal file structure and contents of `certification/`, `docs/`, and `content/`.
* Exact line counts of `src/`, `supabase/migrations/`, and root configuration files.

Confidence: High.
