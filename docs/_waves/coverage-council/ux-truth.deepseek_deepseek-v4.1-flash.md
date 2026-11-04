# Does this behave like one product, and is it accessible? - reviewer deepseek/deepseek-v4.1-flash

cost: $0.0106

---

## Ranked worst UX problems

**1. Active navigation state is invisible to assistive tech, and alias tabs break it entirely.**
`isActive={activeTab === item.value}` with styling only (`DashboardSidebar.tsx:390-394`) — no `aria-current`, no `role`. Worse, `Dashboard.tsx` accepts alias tab values (`'pipelines'` at :439, `'dialer'` at :442, `'campaigns'` at :477) that never equal any sidebar `value`, so a bookmarked `?tab=pipelines` renders Pipeline content with **no highlighted nav item**. The user cannot tell where they are.

**2. The phone-number "table" is a div grid with no table semantics.**
`Dashboard.tsx:375-386` — header row and data rows are `div.grid-cols-7`. No `role="table"/"row"/"cell"`, no `<th>`. Screen readers get an undifferentiated stream of text. It is also `min-w-[700px]` inside `overflow-x-auto` (:373-374), so on mobile it is a horizontal-scroll pane.

**3. Icon-only sidebar-collapse button has no accessible name.**
`DashboardSidebar.tsx:262-269` — `<Button size="icon">` wrapping only `<PanelLeftClose />`. No `aria-label`. The supplied grep of `src/components` shows `aria-label="Toggle Sidebar"` exists in `ui/sidebar.tsx:299`, so the primitive is labelled but this custom duplicate is not.

**4. Buttons that exist only to fail.**
`Dashboard.tsx:412-414` renders a per-row button labelled "Call Testing Locked" that fires a destructive toast (:195-201); :416-418 does the same for "Release Locked". These are status labels rendered as enabled buttons, repeated on every row. They look actionable and always error.

**5. Provider `unknown` is displayed as "Twilio".**
`Dashboard.tsx:396` — the ternary falls through to `'Twilio'` for any provider that is not `retell` or `telnyx`, including `'unknown'` (set at :161/:169). The badge at :389-397 also paints that fallback red (`bg-red-100 text-red-800`), encoding a normal provider as an error state.

**6. Three overlapping setup entry points, and the wizard is just a tab.**
`DashboardSidebar.tsx:98-99` lists "Setup Wizard" and "AI Setup" adjacently; `Dashboard.tsx:281` adds `QuickStartCards` ("AI Guided Setup") on Overview. `OnboardingWizard` is mounted as a tab (`Dashboard.tsx:489-490`) with `onComplete`/`onSkip` both routing to `overview` — no route, no modal, no guard against navigating away mid-flow.

**7. Browser Back does not change the tab.**
`activeTab` is seeded from `searchParams` once (`Dashboard.tsx:111`); the only effect that reads params is the simple-mode guard (:120-129). `handleTabChange` writes params (:131-134) but nothing reads them back, so Back/Forward silently does nothing.

**8. Primary navigation is hidden on first load.**
`SidebarProvider defaultOpen={false}` (`Dashboard.tsx:523`) with `collapsible="icon"` (`DashboardSidebar.tsx:255`) — desktop users land on an icon rail. There are also two controls for the same action: the header `SidebarTrigger` (`Dashboard.tsx:528`) and the sidebar's own button (`DashboardSidebar.tsx:262-269`).

**9. Nav icons are heavily duplicated, killing scannability.**
`Zap` on Command Center / Dispositions / Workflows (`DashboardSidebar.tsx:94, 122, 134`); `Calendar` on Appointments / Automation (:121, :135); `BarChart3` on Campaign Results / Call Analytics (:146, :148); `Activity` on Live Monitor / System Health (:150, :163); `Sparkles` on AI Setup / AI Workflows (:99, :136).

**10. User-facing copy is internal compliance jargon.**
Empty state: "add certified provider-binding evidence in Release Evidence before any phone activity" (`Dashboard.tsx:426-430`); toast bodies are raw constants `CONTACT_EGRESS_LAUNCH_LOCK_MESSAGE` / `QUARANTINE_RELEASE_LAUNCH_LOCK_MESSAGE` (:195-209). The header is `📞 Smart Dialer` (:530) while the sidebar brand is `Smart Dialer` (:260) — and neither matches the product names given.

**11. Design-token drift.**
Hardcoded palette utilities bypass the token system: `bg-green-600 hover:bg-green-700` (`ActionQueuePanel.tsx:214, 288`), `text-red-500` (:291). `Dashboard.tsx:416` uses `text-amber-700 border-amber-300 hover:bg-amber-50` with **no dark-mode variant**, while the badges at :391-394 do have `dark:` variants. Card opacity is inconsistent within one screen: `bg-card/80` (:291, :307, :323, :339) vs `bg-card/90` (:362). Grid gaps mix `gap-3 lg:gap-4` (:290) and `gap-4` (:357).

**12. Loading and mobile handling.**
`TabLoader` (`Dashboard.tsx:81-91`) has no `aria-busy`/`aria-live`, so lazy tab loads are silent to AT. Mobile sidebar auto-close is imperative `window.innerWidth < 768` duplicated three times (`DashboardSidebar.tsx:249, 302, 316`) — it will not react to resize or orientation change. The mode toggle (:273-290) conveys state via icon + label with no `aria-pressed`/`role="switch"`. The footer hint advertises `⌘B` (:332-334), Mac-only.

**13. THEORY — collapsible group headers may not be keyboard-operable.**
`CollapsibleTrigger asChild` wraps `SidebarGroupLabel` (`DashboardSidebar.tsx:372-381`). If that primitive renders a `div` (shadcn convention), the group headers are unfocusable and lack `aria-expanded`. I could not confirm the rendered element — `ui/sidebar.tsx` is only present as grep hits (:726). Note the codebase does this correctly elsewhere (`CampaignManager.tsx:1039, 1125`; `GHLFieldMappingTab.tsx:150, 232, 308`), which makes the sidebar the outlier.

**14. THEORY — `overflow-hidden` clipping.**
`Dashboard.tsx:533-534` puts `overflow-x-hidden` on `<main>` and `overflow-hidden` on the content wrapper. Ancestor overflow clipping commonly truncates focus rings and absolutely-positioned popovers/selects. Not verified against rendered DOM.

## Coherent product, or a collection of screens?

**A coherent shell wrapped around a collection of screens.**

The shell is genuinely unified: every one of the ~40 tabs is wrapped identically in `TabErrorBoundary` + `Suspense` (`Dashboard.tsx:234-519`), pack gating is centralised (:223-232), and the shared `Card`/`Badge`/`Button`/`Sidebar` primitives are used consistently. That is real coherence.

The contents are not. Evidence: a single 285-line `switch` with 40+ cases and three alias pairs (:439, :442, :477); three competing setup entry points; `aria-*` coverage that is near-zero in the two files that define the shell (the supplied grep of `src/components` shows no `aria-` hits in `Dashboard.tsx` or `DashboardSidebar.tsx`) while other components do it correctly; ad-hoc colour utilities alongside tokens; a hardcoded `'20+ tabs'` badge (`DashboardSidebar.tsx:288`) next to a dynamically computed `simpleModeTabCount` (:245); and a dead-end `default` case that renders "Select a section from the sidebar" with no recovery (`Dashboard.tsx:517-518`). Each screen was clearly built to its own standard.

## What I did NOT check

No CSS/Tailwind token files, so no contrast ratios were computed — the `text-xs text-muted-foreground` pattern (`Dashboard.tsx:293, 301, 317, 333, 352, 410`) is flagged as a risk, not a measured failure. No rendered DOM, no screen-reader run, no keyboard tab-order trace, no focus-trap verification in dialogs, no mobile viewport testing, no resize behaviour. The bodies of `OnboardingWizard`, `AISetupAssistant`, `QuickStartCards`, `CommandCenter`, and `DoorToDoorApp` were not supplied, so wizard step counts, validation, and progress indication are unassessed. The `onClick` grep was truncated, so I make no completeness claim about it. The `aria-` grep appears complete for `src/components` and is treated as such.

**Confidence: medium** — the shell-level findings are directly citable and solid; the two THEORY items and all contrast claims are unverified.
