# Does this behave like one product, and is it accessible?

lane: ux-truth  mode: council  reconciled by: manager:deepseek/deepseek-v4.1-flash over 3 reviewers
reviewers: deepseek/deepseek-v4.1-flash, qwen/qwen3.8-flash, google/gemini-3.8-flash
cost: $0.0470 (reviewers $0.0367 + manager $0.0103)
tokens: 22192 in / 6000 out
files: src/components/Dashboard.tsx, src/components/DashboardSidebar.tsx

---

**Reconciled answer**

Worst UX problems, ranked:

1. **Navigation architecture and orientation.** 40+ case switch (`Dashboard.tsx:234-519`); 6 groups/40+ items (`DashboardSidebar.tsx:89-169`); tabs and routes mixed (`DashboardSidebar.tsx:361-367` with `:97,161,164`); alias tabs absent from sidebar (`Dashboard.tsx:439,442,477`); active state class-only/no `aria-current` (`DashboardSidebar.tsx:390-394`); dead-end default (`Dashboard.tsx:517-518`). Browser Back ignored: `activeTab` seeded once (`Dashboard.tsx:111`), only param read is simple-mode guard (`:120-129`), writes but no read (`:131-134`).

2. **Misleading locked controls.** “Call Testing Locked”/“Release Locked” buttons (`Dashboard.tsx:412-418`) only fire destructive toasts (`:195-209`); no `disabled`/`aria-disabled` visible. Jargon empty state (`:426-430`).

3. **Shell semantics.** No `aria-` hits in `Dashboard.tsx`/`DashboardSidebar.tsx` grep; icon-only collapse (`DashboardSidebar.tsx:262-269`); `TabLoader` no `aria-busy`/live (`Dashboard.tsx:81-91`); phone table is div grid with no table semantics (`Dashboard.tsx:375-386`).

4. **Mobile/responsive.** `min-w-[700px]` in `overflow-x-auto` (`Dashboard.tsx:373-374`); `h-7` table buttons (`:412,416`), `h-8` sidebar controls (`DashboardSidebar.tsx:262-277`); imperative `window.innerWidth` auto-close duplicated (`:249,302,316`); `overflow-hidden` on main/wrapper risks clipping (`Dashboard.tsx:533-534`, theory).

5. **Wizard/setup fragmentation.** Setup Wizard + AI Setup sidebar items (`DashboardSidebar.tsx:98-99`); `QuickStartCards` on Overview (`Dashboard.tsx:281`); wizard is
