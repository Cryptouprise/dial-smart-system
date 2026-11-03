# arch-c-registry

- status: completed
- tldr: No central capability registry. 110 dirs (109 functions+_shared). Only partial config.toml (90) + human app-map doc. Scattered.

arch-c-registry complete. VERDICT: dial-smart-system has NO single source of truth for 'what capability exists' — capabilities are scattered. FACT: 110 dirs under supabase/functions/ (109 deployable functions + _shared). NO functions.json/capabilities.json/registry.json/capability-map.json exists anywhere (repo-wide json search, only unrelated manifests). Three adjacent-but-partial registries: supabase/config.toml has 90 [functions.X] blocks (verify_jwt only; 19 of 109 dirs absent — all 90 match real dirs, 0 phantom); _shared/control-plane/registry.ts COMMAND_REGISTRY enumerates operator control-plane commands (not edge functions); src/lib/packs.ts PACK_IDS enumerates 3 industry packs. Only human-readable near-full inventory is docs/dial-smart-app-map.md section 4 (lines 53-125), a curated 2026-11-03 review brief that self-declares non-exhaustive. Filesystem is the de-facto authority.

## Artifact

**Findings**

No single machine-readable source of truth enumerating 'what capability exists' in dial-smart-system. There is NO functions.json / capabilities.json / registry.json / capability-map.json anywhere in the repo (only unrelated manifests: .lovable/mcp/manifest.json, campaigns/*/manifest.json, node_modules). Three partial/adjacent registries exist, none authoritative for edge functions: (1) supabase/config.toml carries a PARTIAL [functions.X] list (90 entries) but only for verify_jwt tuning, 19 of 109 function dirs are absent from it; (2) supabase/functions/_shared/control-plane/registry.ts has COMMAND_REGISTRY, a real code registry but it enumerates operator CONTROL-PLANE COMMANDS (R0-R3 risk), not edge functions; (3) src/lib/packs.ts has PACK_IDS, a registry of 3 industry packs, not functions. The only human-readable full-ish capability inventory is docs/dial-smart-app-map.md section 4 ('Capability inventory, by the code that implements it'), a curated review brief written 2026-11-03 that self-describes as non-exhaustive ('sample the rest'). The actual authoritative enumeration is the filesystem: 110 directories under supabase/functions/ (109 deployable + _shared). Verdict: capabilities are SCATTERED, not centralized.

**evidence**

- supabase/functions/ -> 110 directories total (Get-ChildItem -Directory .Count = 110)
- 109 deployable function dirs + _shared (dirs=109 computed excluding _shared)
- supabase/config.toml:1-449 -> 90 [functions.X] blocks, all 90 match real dirs, 0 phantom entries
- 19 function dirs absent from config.toml: assistable-make-call, billing-portal, bulk-lead-import, coach-decide, coach-suggest, credit-management, demo-funnel-track, law-firm-beta-submit, ringba-enrich-proxy, teams-observer, twilio-voice-status, twilio-voice-transcription, twilio-voice-twiml, update-lead-info, voice-call, voice-call-action, voice-call-events, voice-token, zapier-observer
- supabase/functions/_shared/control-plane/registry.ts:22 -> export const COMMAND_REGISTRY (operator commands, not edge functions)
- src/lib/packs.ts:14 -> export const PACK_IDS = ['solar_exit','wholesale_re','door_to_door']
- docs/dial-smart-app-map.md:53-125 -> section 4 capability inventory (human doc); :169-171 explicitly instructs reviewers to 'Read selectively ... sample the rest'
- docs/wholesale/audit/out/02-api.md -> audit doc referencing only 7 supabase/functions paths
- Repo-wide json search for functions.json/capabilities.json/registry.json/capability-map.json/manifest.json -> no capability registry found

**validation**

Ran PowerShell enumerations: (a) counted 110 dirs under supabase/functions and listed all names; (b) counted 90 [functions.*] blocks in config.toml and diffed against dirs -> 0 phantom, 19 missing; (c) repo-wide Get-ChildItem -Include on registry-like json names -> none. Cross-checked docs/dial-smart-app-map.md line 33 which independently states '110 edge functions' matching the filesystem count.

**open_questions**

- Does the live/published Supabase project expose a function list that differs from local (e.g. undeployed or remotely-added functions)?
- Is capability discovery performed at runtime anywhere (automation-scheduler / dashboard routing / src/lib/dashboard tabs) rather than via a static registry?
- Should docs/dial-smart-app-map.md be promoted to an authoritative capability map or kept as an ephemeral review brief?

**what_i_did_not_check**

- Did not read every docs/*.md file exhaustively (searched for function-name enumeration and registry terms only)
- Did not read .lovable/mcp/manifest.json contents in detail (path/size suggests Lovable tooling config, not app capabilities)
- Did not inspect src/lib/*.ts (50 files) one-by-one for a non-obviously-named registry
- Did not query the live Supabase project for the deployed function list
- Did not verify whether supabase/functions/_shared/control-plane COMMAND_REGISTRY is the only in-code registry of its kind vs other partial maps in src/

**confidence**: high