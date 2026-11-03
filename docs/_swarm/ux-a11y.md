# ux-a11y

- status: completed
- tldr: A11y measured: ~80% of interactive elements labeled; 34+ icon-only buttons unlabeled, 62% of inputs lack a name source; dialogs are shadcn-Radix consistent.

ACCESSIBILITY slice (node ux-a11y) DONE. Read docs/dial-smart-app-map.md section 8 first. All numbers are real grep/regex counts over the repo; nothing written to the repo.

RAW COUNTS (all src/, 292 .tsx): <Button=901, <Input=334, <Dialog=394, <DialogContent=70, aria-label=24, role==17, sr-only=14, tabIndex=1, onKeyDown=16, onKeyPress=0, aria-hidden=6, aria-live=9, aria-modal=0, autoFocus=2, lucide-react imports=215, htmlFor=153, <Badge=610, <img=2, alt==2.

SAMPLED 6 (CampaignManager, VoiceBroadcastManager, AiSmsConversations, CallHistoryTable, MissionBriefingWizard, EnhancedLeadManager): 135 button pairs, 6 icon-only (textless), 0 of those with aria-label/sr-only -> 6 unlabeled icon-only in the sample.

ICON-ONLY UNLABELED (all src/components): 40 textless <Button>; 0 use aria-label; 0 use sr-only; 6 have only title=; ~34 have NO accessible name at all. No aria-label culture exists on any icon button.

INPUTS: 341 <Input>; aria-label=0, id=82, placeholder=76, any-name-source=130 -> 211/341 (62%) inputs have no id/aria-label/placeholder.

FOCUS/KEYBOARD: none beyond primitives (tabIndex=1, onKeyDown=16, Escape handler=3).

DIALOGS: consistent. 42/292 files import @/components/ui/dialog which is stock shadcn Radix (focus trap + Esc + role/dialog free). Exactly ONE hand-rolled modal: src/components/ai-configuration/ConfigurationStepRenderer.tsx:55.

COVERAGE ESTIMATE: ~80% of interactive elements carry a real accessible name; buttons ~96% named, inputs only ~38%, icon-only buttons the clear failure class.

Validation: PowerShell regex counts + a Button-pair parser cross-checked against a naive line count (900 vs 901). No repo writes.
Blockers/follow-ups: (1) Checkbox/Select/Switch families not measured; (2) color-only status badges not isolated; (3) no runtime axe/Playwright scan run.

## Artifact

**Findings**

ACCESSIBILITY slice on C:/Users/charl/dial-smart-system. Real grep counts, no writes to repo. docs/dial-smart-app-map.md section 8 read (research-only: cite evidence, mark FACT/THEORY, list gaps).

1) RAW COUNTS (all src/, 292 .tsx files): <Button=901, <Input=334, <Dialog=394, <DialogContent=70, aria-label=24, role==17, sr-only=14, tabIndex=1, onKeyDown=16, onKeyPress=0, aria-hidden=6, aria-live=9, aria-describedby=2, aria-expanded=5, aria-modal=0, autoFocus=2, lucide-react imports=215, htmlFor=153, <Badge=610, <img=2, alt==2, color-bg classes=652.

2) SAMPLED 6 (CampaignManager 2179, VoiceBroadcastManager 3053, AiSmsConversations 1856, CallHistoryTable 1079, MissionBriefingWizard 1837, EnhancedLeadManager 1047 lines): ButtonPairs=135, icon-only(textless)=6, labeled via aria/sr-only=0, UNLABELED_ICONONLY=6. Per-file: CampaignManager Btn41 Input10 Dialog16 aria0 role2; VoiceBroadcast Btn34 Input14 Dialog26 aria2; AiSmsConvos Btn14 Input9 Dialog13 aria0 onKeyDown1; CallHistoryTable Btn13 Input1 Dialog5 onKeyDown1; MissionBriefingWizard Btn12 Input22 Dialog0 onKeyDown1; EnhancedLeadMgr Btn21 Input4 Dialog18 aria1.

3) ICON-ONLY UNLABELED (all src/components): 40 textless <Button>; 0 use aria-label, 0 use sr-only, 6 have only a title= attr, ~34 have NO accessible name at all. Examples: AIAssistantChat.tsx (close), CallHistoryTable.tsx (Eye row button), DispositionAutomationManager.tsx (<Button><Edit/></Button>), IntelligentPacingPanel.tsx (<Settings/>), LeadScoringSettings.tsx (<Button size=icon><Plus/></Button>), Navigation.tsx (mobile Menu), RetellCalendarSetup.tsx (Copy), SmartRetryPanel.tsx (<Settings/>), EnhancedPipelineKanban.tsx (<MoreHorizontal/>), 6 demo/* Back buttons. FACT.

4) INPUT LABELING: 341 <Input>; aria-label=0, id=(htmlFor target)=82, placeholder=76, any-name-source=130 -> 211/341 (62%) inputs have NO id, NO aria-label, NO placeholder = no reliable accessible name. FACT.

5) FOCUS/KEYBOARD: essentially none beyond primitives. tabIndex=1 in all src, onKeyDown=16, onKeyPress=0, explicit Escape handler=3, aria-modal=0, autoFocus=2. No custom focus management. FACT.

6) DIALOG CONSISTENCY: consistent. 42 of 292 tsx files import @/components/ui/dialog; ui/dialog.tsx is stock shadcn Radix (DialogPrimitive) -> focus trap, Esc, focus restore, role=dialog, aria-modal all free from Radix; DialogContent ships <span className="sr-only">Close</span> (dialog.tsx:47). Only ONE genuine hand-rolled modal: src/components/ai-configuration/ConfigurationStepRenderer.tsx:55 <div className="fixed inset-0 bg-black/50 ... z-50"> -> no focus trap/Esc/role. Other fixed-inset-0 hits are decorative (LandingPage.tsx:160-162, LegalBeta.tsx:59-60 pointer-events-none) or shadcn primitives. FACT.

7) IMAGES/ICONS: <img>=2, alt==2 (both tagged). 215 lucide-react import lines vs only 6 aria-hidden -> most decorative icons not marked aria-hidden (THEORY: lucide default svg has no role/aria-hidden so mostly inert but not declared). FACT counts.

8) COVERAGE ESTIMATE: Buttons ~96% named (860 text + 6 title = 866/900). Icon-only buttons are the failure class (40 textless, ~34 fully unlabeled, ~3.8% of buttons). Inputs weakest: only ~38% (130/341) have any name source. Blended (866+130)/(900+341)=996/1241 ~= 80%. ESTIMATE: roughly 80% of interactive elements carry a real accessible name; deficit concentrated in icon-only buttons (0 aria-label on any icon button) and in inputs relying on placeholder/adjacency. Visible-text buttons and shadcn dialogs are in good shape.

**evidence**

- docs/dial-smart-app-map.md:159-175 section 8 review contract
- src/components/ui/dialog.tsx:1-52 stock shadcn Radix Dialog; :47 sr-only Close
- src/components/ai-configuration/ConfigurationStepRenderer.tsx:55 raw modal div
- src/pages/LandingPage.tsx:160-162 fixed inset-0 decorative pointer-events-none
- src/components/CallHistoryTable.tsx icon-only Button<Eye/> unlabeled
- src/components/LeadScoringSettings.tsx Button size=icon <Plus/> unlabeled
- cmd: PowerShell regex counts over src .tsx (Button/Input/Dialog/aria-*/role/tabIndex/onKeyDown/sr-only)
- cmd: PowerShell button-block parser (textless vs labeled vs title-only)

**validation**

Counts produced by PowerShell regex Matches over file contents (raw, not line-based), then cross-checked a naive <Button line-count (901) against a full-button-pair parser (900 pairs) - 1 diff explained by a self-closing/dynamic button. Icon-only classification validated by sampling and printing the matched <Button...>...</Button> blocks (36 unlabeled printed with filenames). Dialog primitive validated by reading ui/dialog.tsx source (Radix). No repo writes; scratch script kept outside repo. cmd evidence: powershell -Command "[regex]::Matches(...)" over Get-ChildItem -Recurse -Filter *.tsx src.

**open_questions**

- How many <Checkbox>/<Select>/<Switch>/icon-only <a> elements are unlabeled? Not counted.
- Are the 82 id'd inputs actually matched by an htmlFor (vs orphan ids)? Only counted id presence.
- Do any custom onClick backdrop divs (69 'backdrop' hits) act as modals lacking Esc? Not individually inspected.
- Do demo/* and ai-configuration flows matter for the shipped product or are they dev-only?

**what_i_did_not_check**

- Checkbox/Select/Switch/Combobox/RadioGroup and other interactive control families (only Button and Input measured).
- Whether the 211 unlabeled inputs are wrapped in a <label> that provides implicit association (shadcn Label is not implicit; unverified).
- Color-only status signaling (Badge with bg-red/green and no text) - only measured the color-class count (652) and Badge count (610); did not identify text-less status badges.
- Screen-reader live-region correctness and form error announcement (aria-live=9 exists, not audited for correctness).
- Tab order / focus-visible verification in a running browser (no runtime a11y scan such as axe was run).
- Whether third-party rendered widgets (Retell/Telnyx/Stripe embeds) pass or fail accessibility.

**confidence**: medium