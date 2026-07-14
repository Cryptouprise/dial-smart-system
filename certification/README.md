# Certification foundation

These gates make failures visible; they do not claim the dialer is production-certified.

## Pull-request and main-branch gates

- `npm run lint:errors` rejects every ESLint error; the transitional ceiling is now zero. It does not disable rules, and warnings remain visible in the full `npm run lint` report.
- `npm audit --omit=dev` rejects any known vulnerability in the production dependency tree.
- `npm run certify:mcp` performs a clean, script-disabled install of the separate MCP package, rejects all production and development dependency advisories, then requires its TypeScript build and complete unit suite to pass. This certifies the package contract only; the external API and SMS server flags remain launch-disabled.
- `npm run typecheck` checks both frontend TypeScript projects without emitting files.
- `npm run check:migrations` rejects new or expanded duplicate migration versions. Five exact legacy collision groups are recorded as debt; all new migrations require a unique 14-digit UTC timestamp.
- `npm test` assigns test files to four deterministic shards and runs every file in a fresh process, one worker at a time. Any assertion failure, unhandled rejection, worker crash, signal, or OOM fails the command. Per-file process isolation prevents legacy DOM/module retention from accumulating into a later OOM.
- `npm run typecheck:edge:changed -- <base-ref>` Deno-checks every changed function. A `_shared` change checks all function entry points.
- `npm run test:e2e:smoke` verifies the auth surface and protected-route boundary on the same `127.0.0.1:8080` endpoint Vite serves. `npm run test:e2e` remains the full legacy browser suite.

Scheduled and manually dispatched CI runs execute `npm run typecheck:edge`, the full edge inventory.

## Full local commands

```sh
npm ci
npm run certify:static
npm run typecheck:edge
npx playwright install chromium
npm run test:e2e:smoke
```

`typecheck:edge` requires Deno 2.x. Remote modules are cached by Deno after the first run.

## Fresh database and schema/type drift gate

Run the same isolated certification used by CI:

```sh
node --test scripts/certify-fresh-database.test.mjs
node scripts/certify-fresh-database.mjs
```

The certification script requires a running Docker engine. It uses the exact Supabase CLI and Postgres major versions pinned in `certification/database-certification.json`; when no global CLI is installed, it downloads that exact CLI version through `npx`.

The gate does not use the linked project or production credentials. It strips remote Supabase credentials from child processes, clones `config.toml` and every migration into an OS temporary directory, assigns a random local project ID and unused local database port, and deletes the containers and volume on exit. It then:

1. rebuilds every migration from zero and requires one migration-ledger row per SQL file;
2. executes every isolated `supabase/tests/*.sql` database contract;
3. fails on database lint errors;
4. generates public-schema TypeScript types in memory and compares them byte-for-byte (after line-ending normalization) with `src/integrations/supabase/types.ts`;
5. resets and repeats the full replay and SQL contracts; and
6. requires the two generated type sets and full public-schema dumps to be identical.

No remote URL, linked-project flag, project ID, seed data, or production mutation is accepted by this path. A red gate is a release blocker; do not bypass it by raising a baseline or generating types from an unreplayed remote schema.

## Offline database-recovery candidate

The production schema export and repository migration history are not equivalent. The separate recovery compiler inventories that divergence and can construct a hash-locked candidate for a brand-new disposable database without connecting to Supabase or executing SQL:

```sh
npm run certify:database-recovery:test
npm run certify:database-recovery:plan
```

The plan command intentionally exits nonzero with `REMOTE_LEDGER_REQUIRED` when no external ledger is supplied. An authenticated read-only 145-row capture and its two-source provenance record now exist under workspace `outputs`; pass `../../outputs/dial-smart-remote-ledger-2026-07-13.json` with `--remote-ledger` for the pinned dry run. The exact evidence contract and explicit, non-overwriting emission command are documented in `certification/database-recovery/README.md`. Emitting a candidate is not staging certification, does not repair production history, and never authorizes applying the baseline to the existing project. The original fresh-database gate stays red until a clean canonical lineage has been proved independently.

## Global automation scheduler gate

`automation-scheduler` is a global, paid-effect worker and never accepts an anon
or ordinary user JWT. Direct internal runs require the exact service-role bearer.
Cron runs require the `AUTOMATION_SCHEDULER_CRON_TOKEN` Edge secret to match the
`dial_smart_automation_scheduler_cron_token` Vault secret sent in
`X-DialSmart-Automation-Cron-Token`. The migration leaves the cron unscheduled;
after staging verification, a service-role operator may explicitly call
`configure_automation_scheduler_cron(true)`.

## Debt policy

Baselines are one-way ratchets, not waivers. A pull request may reduce legacy debt. Raising a baseline requires an explicit engineering decision and must never be used to turn a red product path green.
