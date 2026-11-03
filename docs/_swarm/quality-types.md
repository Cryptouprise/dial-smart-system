# quality-types

- status: completed
- tldr: 654 files scanned; ': any'=1560, 'as any'=413, 'any[]/any>'=354, LooseClient=2, ts-ignore=0, as-unknown-as=41

quality-types DONE. Repo C:/Users/charl/dial-smart-system, 654 .ts/.tsx files scanned across src/ + supabase/functions/. Exact grep counts: ': any' = 1560; 'as any' = 413; 'any[]|any>' = 354; 'LooseClient' = 2 (both src/packs/door_to_door/host.ts, def line 82, cast line 97); '@ts-ignore' = 0; '@ts-expect-error' = 0; 'as unknown as' = 41. Concentration is Deno Supabase Edge Functions, top file ai-autonomous-engine/index.ts (175). Research only, no writes.

## Artifact

**Findings**

TYPE-SAFETY COUNT for C:/Users/charl/dial-smart-system across src/ + supabase/functions/ (*.ts,*.tsx only). TOTAL FILES SCANNED = 654. Exact counts (FACT, PowerShell Select-String -AllMatches match counts): (1) ': any' annotations, pattern ': any\b' = 1560. (2) 'as any' casts, pattern '\bas any\b' = 413. (3) any[]/any> generic uses, pattern 'any\[\]|any>' = 354. (4) 'LooseClient' = 2 occurrences, BOTH in src/packs/door_to_door/host.ts: definition 'interface LooseClient {' at line 82, and use 'const db = supabase as unknown as LooseClient;' at line 97. It is a hand-written structural interface (LooseQuery/LooseTable/LooseClient, ~lines 40-95) that is NOT actually the supabase-js generated type; it exists in the door_to_door pack host to work around generated Supabase types. (5) '@ts-ignore' = 0 and '@ts-expect-error' = 0. (6) 'as unknown as' double casts, pattern 'as unknown as' = 41. CONCENTRATION (top-10 files by ': any' + 'as any' combined): supabase/functions/ai-autonomous-engine/index.ts 149+26=175; workflow-executor/index.ts 78+0=78; ai-assistant/index.ts 68+0=68; ai-brain/index.ts 63+0=63; call-dispatcher/index.ts 42+18=60; src/hooks/__tests__/usePredictiveDialing.test.ts 30+25=55; telnyx-ai-assistant/index.ts 40+4=44; calendar-integration/index.ts 27+11=38; retell-call-webhook/index.ts 35+3=38; call-tracking-webhook/index.ts 29+7=36. Any-type in practice is dominated by Deno Supabase Edge Functions (supabase/functions/*/index.ts), not the React app. any[]>any generic concentrates in ai-autonomous-engine/index.ts (14), calendar-integration/index.ts (14), src/components/TelnyxAIManager.tsx (10), call-dispatcher/index.ts (9), VoiceBroadcastManager.tsx (8).

**evidence**

- TOTAL_TS_TSX_FILES=654 (Get-ChildItem -Path src,supabase/functions -Recurse -File -Include *.ts,*.tsx)
- P1_colon_any=1560 [pattern ': any\b']
- P2_as_any=413 [pattern '\bas any\b']
- P3_any_generic=354 [pattern 'any\[\]|any>']
- P4_LooseClient=2 [pattern 'LooseClient'] -> src/packs/door_to_door/host.ts:82 'interface LooseClient {' ; src/packs/door_to_door/host.ts:97 'const db = supabase as unknown as LooseClient;'
- P5_ts_ignore=0 ; P5b_ts_expect_error=0
- P6_as_unknown_as=41 [pattern 'as unknown as']
- Top-10 table produced by per-file loop (src/ + supabase/functions/, *.ts/*.tsx)

**validation**

Two independent methods agree: Select-String -AllMatches match-count totals equal the per-file loop sums. LooseClient confirmed by file read of host.ts lines 70-105 (definition + cast visible). Counts are integer, not estimated. Scope restricted to *.ts/*.tsx; .js/.d.ts/.sql excluded.

**open_questions**

- ': any\b' and 'as any' counts include matches inside comments/strings (Select-String is not AST-aware); true code-site counts may be slightly lower.
- 'any>|any[]' can in theory false-positive on JSX/HTML text like '</any>'; not inspected line-by-line.
- Whether tsconfig has strict/noImplicitAny on (would change interpretation of the 1560 ': any' sites) not verified.
- Whether this repo's Supabase DB types are generated (types.ts) and how many files import them vs bypass them via LooseClient-style casts not fully mapped (only the single LooseClient workaround found).

**what_i_did_not_check**

- Did not AST-parse; comment/string false positives in P1/P2/P3 not removed.
- Did not scan non-ts files (.js, .jsx, .d.ts, .sql) - none were implied by src/supabase path except .d.ts generated types.
- Did not verify tsconfig strict flags or run tsc to cross-check.
- Did not enumerate 'Row'/'LooseRow' or other local loose-type aliases that may hide further any-usage.
- Did not check git history or which of the 41 'as unknown as' sites are the LooseClient cast specifically.

**confidence**: high