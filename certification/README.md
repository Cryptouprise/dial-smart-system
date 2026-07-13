# Certification foundation

These gates make failures visible; they do not claim the dialer is production-certified.

## Pull-request and main-branch gates

- `npm run lint:errors` rejects fatal ESLint failures or any increase above the recorded 114-error legacy ceiling. It does not disable rules. `npm run lint` still reports the complete error and warning debt.
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

## Schema/type drift gate

Start a disposable local Supabase stack and rebuild all migrations, then run:

```sh
supabase start
npm run check:schema-types
```

The command generates TypeScript types from the rebuilt local database in memory and compares them with `src/integrations/supabase/types.ts`. A mismatch fails without overwriting source. This gate should move into required CI after the legacy migration chain can rebuild cleanly from zero.

## Debt policy

Baselines are one-way ratchets, not waivers. A pull request may reduce legacy debt. Raising a baseline requires an explicit engineering decision and must never be used to turn a red product path green.
