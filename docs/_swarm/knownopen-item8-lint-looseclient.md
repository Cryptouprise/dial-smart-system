# knownopen-item8-lint-looseclient

- status: completed
- tldr: Claim (8): (a) glob noise real but from scripts/*.test.mjs not test-harness/ (PARTIAL); (b) LooseClient workaround TRUE (host.ts:82-97).

Claim (8) verified. Part (a) 'test-harness vitest glob noise': PARTIALLY TRUE - mechanism FACT but label imprecise. eslint config exists (eslint.config.js; package.json:13 lint='eslint .') with no vitest/lint suppression; real cause is vitest's default include sweeping in 36 scripts/*.test.mjs because vitest.config.ts:25-32 excludes everything but scripts/ and sets no include override (documented at scripts/ship/_checkpoint_d2d_port.md:73-77). The literal test-harness/ dir holds no *.test.mjs. Severity LOW. Part (b) 'generated Supabase types worked around via LooseClient': TRUE (FACT). LooseClient defined src/packs/door_to_door/host.ts:82-95, cast at :97 'supabase as unknown as LooseClient'; types.ts independently confirmed to carry only d2d_knocks/properties/territories (3 of 10 expected d2d objects), missing the six workspace tables + d2d_company_members(). Severity LOW-MEDIUM.

## Artifact

**Findings**

Claim (8) from docs/dial-smart-app-map.md:144 has two parts. PART (a) 'test-harness vitest glob noise': the underlying mechanism is REAL (FACT) but the map's label is IMPRECISE. eslint config exists (eslint.config.js:1-32; package.json:13 lint='eslint .', :14 lint:errors). eslint's `files` is only `**/*.{ts,tsx}` (eslint.config.js:11) so .mjs scripts are never linted, and its only ignores are dist/coverage/playwright-report/test-results (eslint.config.js:8) - there is NO vitest-related suppression or vitest ignore in the lint config. The actual noise is a VITEST include/exclude gap, not a bug in test-harness/: vitest.config.ts:25-32 sets test.exclude (node_modules, dist, e2e, supabase/functions, mcp-server, .{idea,git,cache,output,temp}) but never excludes scripts/, and there is NO test.include override, so vitest's default include sweeps in 36 standalone `scripts/*.test.mjs` CLI scripts (counted: 36). Documented verbatim at scripts/ship/_checkpoint_d2d_port.md:73-77 ('36 failed files ... all scripts/*.test.mjs ... swept in by vitest's default include ... vitest.config.ts:25-32 sets test.exclude but never excludes scripts/, and there is no include override ... a one-line exclude entry fixes it'). NOTE: the directory literally named `test-harness/` contains .py/.sh/.json/.jsonl, no *.test.mjs, so 'test-harness' in the map is a misnomer for the scripts/ test files. Verdict (a): PARTIALLY TRUE - mechanism FACT, description imprecise. Severity: LOW (cosmetic/tooling; real suite is green - '929/929 real tests pass' per same doc line 76). PART (b) 'generated Supabase types worked around via LooseClient': TRUE (FACT, fully). LooseClient is defined at src/packs/door_to_door/host.ts:82-95 and used at :97 `const db = supabase as unknown as LooseClient`. The header doc (:41-54) states src/integrations/supabase/types.ts is generated from the local migration stack and was last generated when only 20261102234500_door_to_door_core.sql existed, so it lacks the six tables from 20261103020000_door_to_door_workspace.sql and the d2d_company_members() function, and that hand-editing a generated file would be overwritten by `npm run check:schema-types`. VERIFIED independently: grep of types.ts finds ONLY d2d_knocks (:2430), d2d_properties (:2511), d2d_territories (:2634) - exactly the 3 core-run tables - and none of settings/positions/messages/appointments/api_keys/webhooks/company_members. No other LooseClient use in src/ (only host.ts plus .bak copies under scripts/ship/). Severity: LOW-MEDIUM (a contained, documented type-safety escape hatch; real fix needs the local Supabase stack).

**evidence**

- docs/dial-smart-app-map.md:144 - 'Lint debt: test-harness vitest glob noise; generated Supabase types worked around via `LooseClient`'
- eslint.config.js:8 - ignores: ["dist","coverage","playwright-report","test-results"] (no vitest/scripts ignore)
- eslint.config.js:11 - files: ["**/*.{ts,tsx}"] (so .mjs scripts unlinted)
- package.json:13 - "lint": "eslint ."
- vitest.config.ts:25-32 - exclude list omits scripts/; no include override anywhere in file
- scripts/ship/_checkpoint_d2d_port.md:73-77 - 36 'failed files' are scripts/*.test.mjs swept by vitest default include; exclude never covers scripts/
- count command output: dir scripts\*.test.mjs -> 36
- src/packs/door_to_door/host.ts:82-95 - interface LooseClient { ... }
- src/packs/door_to_door/host.ts:97 - const db = supabase as unknown as LooseClient;
- src/packs/door_to_door/host.ts:41-54 - doc: types.ts generated from local migration stack, overwritten by npm run check:schema-types
- types.ts grep (findstr /n d2d): :2430 d2d_knocks, :2511 d2d_properties, :2634 d2d_territories ONLY

**validation**

Read eslint.config.js, vitest.config.ts, package.json, host.ts (1-55 and 50-119) directly. Counted scripts/*.test.mjs = 36 via dir. Confirmed absence of scripts/ in vitest exclude and of any include override. Independently confirmed types.ts d2d coverage via findstr (3 of 10 expected d2d objects present). Cross-checked the checkpoint doc that names the same 36-file mechanism. eslint 'lint' and 'lint:errors' scripts confirmed present. No live processes run.

**open_questions**

- Is the map's 'test-harness' wording meant to refer to scripts/*.test.mjs or the actual test-harness/ directory? Evidence points to scripts/*.test.mjs.
- Should the one-line exclude:['**/scripts/**'] be applied to vitest.config.ts (checkpoint calls it a shared config other agents depend on, left untouched)?

**what_i_did_not_check**

- Did not execute `npm run lint` or `npx vitest run` to observe the 36-file output live; relied on config + file count + the prior checkpoint doc.
- Did not search for alternate lint configs beyond eslint glob find (only eslint.config.js exists; no .eslintrc* surfaced).
- Did not run `npm run check:schema-types` to confirm it regenerates/overwrites types.ts.
- Did not inspect scripts/ship/*.bak copies for behaviour, only that they duplicate LooseClient.
- Did not verify whether any CI workflow enforces `npm run lint` / `npm test` or ignores the 36-file noise.

**confidence**: high