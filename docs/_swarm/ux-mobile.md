# ux-mobile

- status: completed
- tldr: Phone verdict: BARELY usable. SMS screen (w-80 two-pane, 0 responsive classes), Twilio 7-col table (no overflow), AgentEditDialog grid-cols-10 tabs all break; bottom nav covers content.

MOBILE slice (ux-mobile) DONE. VERDICT: the app is BARELY usable on a phone. A real mobile foundation exists (Tailwind default breakpoints, MobileBottomNav wired at App.tsx:109, safe-area/touch-target/pb-mobile-nav utilities in index.css, dialogs height+width safe via the w-full max-w-lg max-h-[85vh] primitive), but the core authenticated screens are desktop-first.

Concrete breaks:
1. src/components/AiSmsConversations.tsx (SMS = bottom-nav destination): two-pane w-80 (320px) list + flex-1 detail (line 1538), ZERO responsive classes in 1,856 lines; h-screen roots (736/1110).
2. src/components/TwilioNumbersOverview.tsx: 7-col <Table> (1002) wrapped only in rounded-md border (1001), no overflow-x-auto -> overflows.
3. src/components/AgentEditDialog.tsx (2,712 lines): grid-cols-10 tabs (1049), no fallback; max-w-5xl h-[85vh] (1033).
4. No authenticated page reserves bottom-nav space: .pb-mobile-nav defined (index.css:160) but NEVER used; only Demo.tsx:367 does pb-20 -> content behind the h-16 fixed nav.

Responsive-class counts (lines/sm/md/lg): AgentEditDialog 2712/2/0/0; CampaignManager 2179/0/1/4; AiSmsConversations 1856/0/0/0; MissionBriefingWizard 1837/0/2/0; CallSimulator 1779/0/3/0; TwilioNumbersOverview 1631/0/6/0; GHLFieldMappingTab 1351/0/1/0; AutonomousAgentDashboard 1273/19/3/5 (the only genuinely responsive one).
Screens that break: SMS Conversations (worst), Twilio Numbers table, Agent Edit dialog, and every screen whose content bottom sits under the fixed nav.
Correctly done: CallHistoryTable (overflow-x-auto wrapper, 630-631), Dashboard (overflow-x-auto 700px grid, mobile shadcn sidebar), public Navigation.tsx (Sheet menu), LeadDetailDialog.tsx:495 (w-[95vw] md:w-full - the pattern to copy).

FILES TOUCHED in repo: none (scratch scripts written to a temp dir, then deleted).

Validation: direct reads of docs map section 8, tailwind.config.ts, index.css, App.tsx, MobileBottomNav.tsx, ui/dialog.tsx + a PowerShell regex count pass over 11 components; greps for MobileBottomNav usage and pb-mobile-nav usage. Did NOT render on a device.

Follow-ups: render the SMS screen at 375px; audit Analytics/Settings/Install/call screens; decide whether to add pb-mobile-nav to authed pages. Confidence: medium.

## Artifact

**Findings**

VERDICT: BARELY usable on a phone. A genuine mobile foundation exists (Tailwind default breakpoints, a wired bottom nav, safe-area/touch-target utilities, height-capped dialogs), but the core authenticated screens are desktop-first and several primary screens visibly break. (1) Foundation: tailwind.config.ts defines NO custom screens (only container.screens 2xl:1400px) so Tailwind defaults apply - mobile-first is possible but underused. (2) MobileBottomNav is NOT orphaned: imported App.tsx:37, rendered App.tsx:109 for every non-public route, self-hiding on / and /demo (MobileBottomNav.tsx:9), md:hidden with safe-area-bottom (MobileBottomNav.tsx:21). (3) index.css has real mobile utilities: touch-target 44px (147-150), btn-mobile, pb-mobile-nav (160-162), safe-area-* (111-125), scroll-area-safe, and a global @media(max-width:640px) [role=dialog] max-h rule (176-180). (4) BREAK #1, worst: the SMS screen src/components/AiSmsConversations.tsx (a bottom-nav destination) is a two-pane layout - a fixed w-80 conversation list (line 1538) beside a flex-1 detail pane - with ZERO responsive classes in 1,856 lines (sm=0,md=0,lg=0); on a 375px phone the 320px list crushes the detail pane; root containers are h-screen (736, 1110). (5) BREAK #2: TwilioNumbersOverview.tsx renders a 7-col <Table> (1002) wrapped only in rounded-md border (1001) with NO overflow-x-auto anywhere -> the numbers table overflows on a phone. (6) BREAK #3: AgentEditDialog.tsx (2,712 lines, largest component) has only 2 responsive classes; DialogContent max-w-5xl h-[85vh] overflow-hidden (1033) and <TabsList grid w-full grid-cols-10> (1049) with no fallback -> 10 tabs crushed into a phone width. (7) BREAK #4: no authenticated page reserves space for the fixed bottom nav - .pb-mobile-nav is defined (index.css:160) but NEVER used (only the definition matches repo-wide); only public Demo.tsx:367 does pb-20 md:pb-0, so page bottoms and the SMS composer sit behind the h-16 fixed nav. (8) Responsive-class counts (8 largest components; lines/sm/md/lg): AgentEditDialog 2712/2/0/0; CampaignManager 2179/0/1/4; AiSmsConversations 1856/0/0/0; MissionBriefingWizard 1837/0/2/0; CallSimulator 1779/0/3/0; TwilioNumbersOverview 1631/0/6/0; GHLFieldMappingTab 1351/0/1/0; AutonomousAgentDashboard 1273/19/3/5 - only AutonomousAgentDashboard is genuinely responsive. (9) Dialogs are width- and height-safe: ui/dialog.tsx DialogContent base class is w-full max-w-lg p-6 max-h-[85vh] overflow-y-auto, so any max-w-* fills a phone and height is capped; the pattern to copy is LeadDetailDialog.tsx:495 (w-[95vw] md:w-full). (10) CallHistoryTable.tsx IS wrapped correctly (<div overflow-x-auto><Table> at 630-631) so its 12-col table scrolls rather than breaks; its filter row uses 6 fixed SelectTriggers w-[130-150px]. (11) Dashboard.tsx is mixed: mobile-aware shadcn sidebar (525-528) and a min-w-[700px] 7-col grid that IS inside overflow-x-auto (373-374), so it scrolls instead of breaking. (12) Public nav (Navigation.tsx) is properly mobile-aware (md:hidden Sheet trigger :44, hidden md:flex links :85/:109, SheetContent w-[280px] safe-area-left :49).

**evidence**

- src/App.tsx:37 (import) and src/App.tsx:107-113 (render inside PublicAwareAppChrome)
- src/components/MobileBottomNav.tsx:7-11 (nav items + hide on public), :21 (md:hidden fixed bottom-0 h-16 safe-area-bottom)
- tailwind.config.ts:13-20 (no screens override; container 2xl only)
- src/index.css:100-180 (overflow-x hidden on body, safe-area-*, touch-target 44px, btn-mobile, pb-mobile-nav definition, global mobile [role=dialog] max-h)
- src/components/AiSmsConversations.tsx:736 and :1110 (h-screen), :1536-1538 (flex-1 flex gap-4 + w-80 pane)
- src/components/TwilioNumbersOverview.tsx:1001-1002 (rounded-md border + <Table>, no overflow-x-auto)
- src/components/AgentEditDialog.tsx:1033 (max-w-5xl h-[85vh]), :1049 (grid-cols-10 tabs)
- src/components/LeadDetailDialog.tsx:495 (w-[95vw] md:w-full model)
- src/components/ui/dialog.tsx DialogContent base class (w-full max-w-lg max-h-[85vh] overflow-y-auto)
- src/components/CallHistoryTable.tsx:630-631 (overflow-x-auto + Table), :489-567 (fixed-width filters)
- src/components/Dashboard.tsx:373-374 (overflow-x-auto + min-w-[700px])
- src/pages/Demo.tsx:367 (pb-20 md:pb-0, the only real bottom-nav spacer)

**validation**

Read the required sources directly: docs map section 8 (review contract), tailwind.config.ts, src/index.css (2 reads), App.tsx wiring, MobileBottomNav.tsx, the shadcn dialog primitive, and 8-11 largest components. Counts produced by a PowerShell regex pass over each file (sm:/md:/lg:/xl:/hidden md:/md:grid-cols/overflow-x-auto/w-[NNNpx]/<Table/TableOpen). Verified MobileBottomNav wiring by grep (App.tsx only, not Dashboard.tsx) and verified pb-mobile-nav has no usage site. Verified the Twilio table has no overflow wrapper and the SMS pane is a bare w-80. No repo writes persisted (scratch scripts removed). Did NOT run the app or render on a real device.

**open_questions**

- Does the shadcn Sidebar (Dashboard.tsx:525) actually collapse to an off-canvas sheet under md, or does it eat horizontal space? Not verified by rendering.
- How does the SMS two-pane look at exactly 375px in practice - is the detail pane entirely hidden or just cramped? Needs a device/emulator render.
- Are there other top-level screens (Analytics, Settings, Install) with desktop-only layouts? Only Dashboard and SMS were sampled from the bottom-nav set.

**what_i_did_not_check**

- Did not render the app in a mobile viewport or on a device (no browser/emulator run); all layout claims are from code inspection.
- Did not audit all 161 .tsx components - only the 8 largest plus Dashboard, DashboardSidebar, CallHistoryTable, Navigation, LeadDetailDialog, and the dialog primitive.
- Did not inspect Analytics.tsx, Settings.tsx, InstallApp.tsx, or the call screens (CallWorkspace/CallSimulator) for responsive behaviour.
- Did not check touch-target actual application on buttons (only that the utility exists), nor iOS input-zoom / font-size behaviour.
- Did not verify the bottom-nav overlap visually.
- Did not check the PWA manifest / viewport meta tag for mobile scaling.

**confidence**: medium