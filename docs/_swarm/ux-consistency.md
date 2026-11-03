# ux-consistency

- status: completed
- tldr: 8 large components share a PARTIAL design language: primitives/spacing/dialog consistent, but loading (0/8 Skeleton) and empty states (6 hand-rolled variants) diverge.

UX-CONSISTENCY audit of C:/Users/charl/dial-smart-system COMPLETE. Read app-map section 8 first (research-only contract). Sampled all 8 required large components + src/components/ui/ (51 primitives). VERDICT: one PARTIAL design language, not one coherent one.

TABLE (8 components x 6 dimensions):
- CampaignManager.tsx: ui/*=YES(11) | space-y-4 x4 | variant 34/41 (5 inline color) | ui/dialog+alert-dialog | empty=CardContent text-center py-8 | loading=text "Loading agents..." (0 spinner)
- VoiceBroadcastManager.tsx: YES(15) | space-y-4 x13 | 28/34 (1 inline red) | ui/dialog+alert-dialog | py-12 text-center+icon+h3 | Loader2 spinner, no text
- MissionBriefingWizard.tsx: YES(11) | space-y-4 x10 | 9/12 | NONE (inline wizard) | inline "No X agents found" | Loader2 + "Loading created resources..."
- AiSmsConversations.tsx: YES(11) | space-y-4 x7 | 11/14 | ui/dialog | text-center py-8 muted | Loader2 h-8 + "Loading..."
- EnhancedLeadManager.tsx: YES(10) | space-y-4 x5 | 14/21 | ui/dialog+alert-dialog | tabs-based | RefreshCw spin only
- AgentEditDialog.tsx: YES(15) | space-y-4 x29 | 19/24 | ui/dialog | n/a (modal) | Loader2 + "Loading script/voices/numbers..."
- CallHistoryTable.tsx: YES(9) | space-y-4 x3 | 12/13 | ui/dialog | TableCell text-center py-12 | ternary text+spinner
- EnhancedSpamDashboard.tsx: YES(7) | space-y-4 x8 | 4/5 | NONE (dashboard) | Alert blocks | Loader2 + "Syncing.../Scanning..."

COUNTS: ui/dialog 6/8 vs custom overlay divs 0/8 (2 need no modal). <Skeleton> 0/8 vs literal "Loading..." 4/8 (CM/AiSms/AED/MBW); animate-spin in 7/8 (all but CampaignManager).

5 WORST DIVERGENCES (file:line): (1) loading: no Skeleton anywhere (it is used in 8 OTHER files) CM:1558 text vs ESD:374 spinner vs AiSms:1174 h-8 spinner vs AED:1337; (2) empty states hand-rolled 6 ways CM:2088/VBM:1496/VBM:2490/VBM:2003/AiSms:1554/CHT:703 with py-4/8/12; (3) inline color bypasses variant CM:1807 (default repainted green), CM:1541, VBM:2842; (4) destructive-action styling split CM:1635 variant=destructive vs VBM:2842 inline red; (5) two stat-tile designs in ONE file VBM:646-662 chips vs VBM:2688 Card.

GOOD: primitives consistently imported, space-y-4 near-universal, zero rogue overlay divs.
DID NOT CHECK: the other ~153 components' divergence rate; dark mode; responsive; runtime rendering. No repo writes; scripts ran from %TEMP%.

## Artifact

**Findings**

VERDICT: the 8 large components share a PARTIAL design language. POSITIVE: all 8 import shadcn primitives from '@/components/ui/*'; the variant prop is used on ~80% of Buttons; spacing is almost universally space-y-4 with zero arbitrary p-[...]; and there are ZERO hand-rolled modal overlay divs. NEGATIVE: LOADING and EMPTY STATES have no shared convention, and ad-hoc inline color classes bypass the Button variant system in 5 places.

D1 primitives: 8/8 import '@/components/ui/*'; hand-rolled overlay divs 0/8. FACT.
D2 spacing: space-y-4 dominant in every file (CM x4, VBM x13, MBW x10, AiSms x7, ELM x5, AED x29, CHT x3, ESD x8); arbitrary p-[...] 0/8; only one p-6 across all 8 (MBW). FACT.
D3 buttons: variant prop on CM 34/41, VBM 28/34, MBW 9/12, AiSms 11/14, ELM 14/21, AED 19/24, CHT 12/13, ESD 4/5, but 5 inline-color overrides bypass it. FACT.
D4 dialog: ui/dialog imported in 6/8 (CM, VBM, AiSms, ELM, AED, CHT); MBW is an inline full-page wizard, ESD a dashboard with no modal; custom overlays 0/8; confirms use ui/alert-dialog in CM/VBM/ELM. FACT.
D5 empty states: no shared EmptyState component exists in src; each file hand-rolls empty markup with py-4/py-8/py-12 and different structure. FACT.
D6 loading: <Skeleton> 0/8, yet Skeleton exists and is used in 8 OTHER files. Loading is always a Lucide Loader2 spinner or bare text, with varying size and wording. FACT.

COUNTS: ui/dialog 6/8 vs custom overlay divs 0/8 (2/8 need no modal). <Skeleton> 0/8 vs literal 'Loading...' string 4/8 (CM, AiSms, AED, MBW); animate-spin spinner present in 7/8 (all except CampaignManager, which uses pure text).

5 WORST DIVERGENCES: (1) loading treatment (no Skeleton, four spinners/text styles) CM:1558/ESD:374/AiSms:1174/AED:1337; (2) empty states hand-rolled 6 ways CM:2088, VBM:1496, VBM:2490, AiSms:1554, CHT:703, VBM:2003; (3) inline button colors bypassing variants CM:1807, CM:1541, VBM:2842; (4) destructive-action styling split CM:1635 variant=destructive vs VBM:2842 inline red; (5) two stat-tile designs in one file VBM:646-662 vs VBM:2688.

**evidence**

- CampaignManager.tsx:3-15 imports card/button/input/textarea/badge/select/dialog/popover/command/alert-dialog from ui
- VoiceBroadcastManager.tsx:2-36 imports 15 ui primitives incl dialog/table/progress/slider/tooltip
- MissionBriefingWizard.tsx:2-12 imports 11 ui primitives, NO dialog
- AiSmsConversations.tsx:16-35 imports card/button/.../dialog/scroll-area/avatar/tabs
- EnhancedLeadManager.tsx:2-10 imports incl dialog + alert-dialog
- AgentEditDialog.tsx:2-20 imports 15 ui primitives incl dialog/collapsible
- CallHistoryTable.tsx:9-44 imports incl dialog (line 40), calendar, checkbox, scroll-area, tabs
- EnhancedSpamDashboard.tsx:2-7 imports card/button/badge/tabs/progress/alert, NO dialog
- DIVERGENCE-1 (loading): CampaignManager.tsx has 0 'Loader2' and 0 'animate-spin'; renders text 'Loading agents...' and placeholder 'Loading numbers...'; vs EnhancedSpamDashboard.tsx:374 '<Loader2 className="h-4 w-4 mr-2 animate-spin" /> Syncing...' and :391 'Scanning...'; vs AiSmsConversations.tsx:1174 '<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />' (h-8, larger); vs AgentEditDialog.tsx:1337-1338 'Loading script...'. Same 'load a list' action, four treatments.
- DIVERGENCE-2 (empty states): CampaignManager.tsx:2086-2088 '<CardContent className="text-center py-8">' 'No campaigns created yet'; VoiceBroadcastManager.tsx:1494-1496 '<CardContent className="py-12 text-center">' + icon + h3 'No Broadcasts Yet'; VoiceBroadcastManager.tsx:2490-2491 'text-center py-4 text-muted-foreground text-sm'; AiSmsConversations.tsx:1552-1554 'text-center py-8 text-muted-foreground' 'No conversations yet'; CallHistoryTable.tsx:702-703 '<TableCell colSpan={12} className="text-center py-12 text-muted-foreground">' 'No calls found'; VoiceBroadcastManager.tsx:2001-2003 'py-12 text-center' 'No leads found'. Padding/structure differ every time.
- DIVERGENCE-3 (inline color bypasses variant): CampaignManager.tsx:1805-1807 '<Button variant="default" size="sm" className="w-full bg-green-600 hover:bg-green-700">'; CampaignManager.tsx:1541 '<Button size="sm" variant="outline" className="text-green-600 border-green-600 hover:bg-green-50">'; CampaignManager.tsx:1573/1992/2033 blue/green outline overrides; VoiceBroadcastManager.tsx:2842 '<AlertDialogAction ... className="bg-red-600 hover:bg-red-700">'.
- DIVERGENCE-4 (destructive confirm inconsistency): CampaignManager.tsx:1635 uses '<Button size="sm" variant="destructive">' for deletion, but VoiceBroadcastManager.tsx:2842 styles its emergency-stop AlertDialogAction with inline red classes; same intent, two styling paths.
- DIVERGENCE-5 (two stat-tile implementations in ONE file): VoiceBroadcastManager.tsx:646-662 hand-rolls live-stat chips with 7 hardcoded color families; the same file at :2644-2704 renders results stats as '<Card className="p-3 text-center bg-green-50 dark:bg-green-950/20">'.
- Skeleton repo-wide: script scan of src/**/*.tsx found <Skeleton> in 8 files (ui/sidebar.tsx, Dashboard.tsx, AdminSettings.tsx, AutonomousAgentDashboard.tsx, LeadScoringSettings.tsx, PackSettings.tsx, pages/McpConsent.tsx, App.tsx) while 0/8 sampled components use it.

**validation**

Read section 8 of docs/dial-smart-app-map.md (research-only contract, cite file:line, FACT/THEORY). Enumerated src/components/ui/ (51 primitives; skeleton.tsx exists, no empty-state/spinner primitive). Confirmed all 8 required files exist and are large (42k-152k bytes). Ran three multiline-aware PowerShell scans producing per-file counts of <Button, variant=, inline bg-/text-white Button classes, <Skeleton, ui/dialog import, animate-spin, and fixed inset-0 overlays, cross-checked against raw findstr line listings. Read specific divergence regions directly (CM:1541/1805-1810, VBM:2842, ESD:360-430). Did NOT write to the repo; scripts went to %TEMP% only.

**open_questions**

- Do the ~153 unsampled components share the same inline-color/empty-state divergence rate, or are these 8 outliers?
- Is an EmptyState + shared Loading/Loader component the intended fix, or does the team prefer per-feature markup? No design-doc reference found.
- Does inline green/red Button styling exist because the Tailwind theme lacks success/destructive-outline variants, or is it author habit?

**edge_cases_considered**

- MissionBriefingWizard and EnhancedSpamDashboard have no modal at all (inline wizard / dashboard) rather than a broken dialog, so their 0/8 dialog count is NOT a divergence bug
- AgentEditDialog.tsx:2508 'absolute inset-0' is a hidden file-input click-target, NOT a hand-rolled modal overlay, so the 0/8 overlay count stands

**what_i_did_not_check**

- Did not read all 8 files exhaustively; sampled imports + targeted regions + scripted counts.
- Did not audit the other ~153 components for inline-button / empty-state divergence rate (only Skeleton usage counted repo-wide).
- Did not verify dark-mode consistency (only spot-noted bg-*-50 dark:bg-*-950/20 patterns in VBM).
- Did not check responsive/mobile behavior of any component.
- Regex button counts may miss exotic multiline formatting; treated as strong signal, not exact truth.
- Did not run the app or inspect rendered output; all conclusions are static code reads.

**confidence**: high