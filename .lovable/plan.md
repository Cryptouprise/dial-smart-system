
Goal: fix the exact Autonomous Agent bug you described so the campaign cards under Mission Briefing/open Overview do not send you to the marketing landing page when you click Edit.

What I confirmed
- The bug is real and reproducible from code:
  - `src/components/AutonomousAgentDashboard.tsx` still sends those buttons to `/?tab=campaigns` and `/?tab=campaigns&id=...`
  - `src/components/MissionBriefingWizard.tsx` also still builds links like `/?tab=campaigns`, `/?tab=pipelines`, and `/?tab=sms-conversations`
- Your app no longer uses `/` for the logged-in dashboard:
  - `src/App.tsx` serves the public landing page at `/`
  - the actual authenticated app lives at `/dashboard`
- The dashboard does not recognize `campaigns` as a valid tab:
  - `src/components/Dashboard.tsx` has `campaign-results`
  - there is no `case 'campaigns'`
- So right now those Edit buttons are pointing to the wrong route and, in some cases, the wrong tab name.

Implementation plan
1. Fix the Autonomous Agent campaign card links
- Update the “Your Campaigns” card in `src/components/AutonomousAgentDashboard.tsx`
- Change:
  - `/?tab=campaigns`
  - `/?tab=campaigns&id=...`
- To dashboard-safe URLs under `/dashboard`
- Point them to the real campaign tab (`campaign-results`) and preserve the selected campaign id in the query string

2. Fix the Mission Briefing success/edit links on that same screen
- Update `src/components/MissionBriefingWizard.tsx`
- Replace all legacy root links (`/?tab=...`) with `/dashboard?tab=...`
- Map old invalid tab names to real ones:
  - `campaigns` → `campaign-results`
  - `pipelines` → `pipeline`
  - `sms-conversations` → `sms`

3. Add defensive tab aliases in Dashboard
- Update `src/components/Dashboard.tsx`
- Add aliases so old links do not break again:
  - `campaigns` should render the same view as `campaign-results`
  - `pipelines` should render the same view as `pipeline`
- This is the safety net in case any older buttons or saved links still exist elsewhere

4. Improve campaign deep-link handling
- The `id` query param is currently being passed in links, but `CampaignResultsDashboard` does not read it
- Update `src/components/CampaignResultsDashboard.tsx` so if URL contains `id`, it preselects that campaign
- That makes the Edit button feel correct instead of just landing on the generic results page

5. Verify related pipeline navigation while touching this flow
- Since the same broken pattern appears in briefing quick links, also make sure pipeline navigation lands on the correct dashboard tab
- If appropriate, wire `Dashboard.tsx` to use `EnhancedPipelineKanban` instead of the legacy pipeline component so the campaign-aware pipeline UI is what opens from these links

Files to update
- `src/components/AutonomousAgentDashboard.tsx`
- `src/components/MissionBriefingWizard.tsx`
- `src/components/Dashboard.tsx`
- `src/components/CampaignResultsDashboard.tsx`
- Possibly `src/components/EnhancedPipelineKanban.tsx` if deep-link preselection is added there too

Why this will fix your issue
- Today the buttons send you to the public homepage path (`/`)
- After this change they will send you into the authenticated app path (`/dashboard`)
- And they will target real tab names the dashboard actually supports
- So clicking Edit from the campaign cards under Briefing will open the intended campaign management view instead of dumping you on the landing page

Technical notes
- Root cause is not the campaign data itself; it is stale hardcoded navigation
- The app’s routing architecture changed to:
  - public marketing site at `/`
  - authenticated dashboard at `/dashboard`
- The Autonomous Agent components were not fully updated to that new routing model
- `CampaignResultsDashboard` currently ignores URL `id`, so I’d include preselection support as part of the fix for a complete “Edit” experience
