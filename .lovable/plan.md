

# Quick-Add Leads + Relaunch Campaigns (Day 2+ Workflow)

## Problem

On day 2 or 3, a user comes back and needs to do one of three things:

1. **Load more leads** into an existing campaign (upload CSV or add by tag)
2. **Relaunch a paused/completed campaign** with the same or new leads
3. **Clone a campaign** to run the same agent/settings against a fresh batch

Today, loading leads requires bouncing between Leads tab and Campaign Manager. Relaunching requires manually changing status back to active and hoping leads are still queued. There's no clone button. The Autonomous Agent "Your Campaigns" cards only show Edit — no Play/Pause/Load Leads.

## Changes

### 1. Add quick actions to Autonomous Agent campaign cards
**File: `src/components/AutonomousAgentDashboard.tsx`**
- Currently each campaign card only has an "Edit" button
- Add three inline action buttons:
  - **Play/Pause** toggle — activate or pause the campaign directly from this view (calls the same `handleStatusChange` logic CampaignManager uses)
  - **Load Leads** — opens the QuickLeadLoader dialog (from change #3)
  - Keep **Edit** as-is
- Show the campaign status dot + provider badge (already done) so it's clear what state each campaign is in

### 2. Add "Load Leads" and "Clone" buttons to CampaignManager cards
**File: `src/components/CampaignManager.tsx`**
- Add a **Load Leads** button (Upload icon) next to Edit/Play/Pause/Delete on each campaign card
  - Opens QuickLeadLoader dialog for that campaign
- Add a **Clone** button (Copy icon) that duplicates the campaign with a new name (`{name} (Copy)`) in draft status
  - Same agent, provider, settings — just new leads needed
  - Quick way to run the same playbook against a fresh list

### 3. Create QuickLeadLoader component
**New file: `src/components/QuickLeadLoader.tsx`**
- Dialog with two tabs:
  - **Upload CSV** — file picker + tag input (auto-suggests the campaign's existing tag). Calls `lead-csv-import` edge function, then auto-assigns imported leads to the campaign via `campaign_leads` insert.
  - **Add by Tag** — type a tag, see count of matching unassigned leads, click "Add All" to bulk-assign to campaign
- Shows progress and success toast with count
- Reusable from both CampaignManager and AutonomousAgentDashboard

### 4. Add tag filter to CampaignLeadManager's "Add Leads" dialog
**File: `src/components/CampaignLeadManager.tsx`**
- Add a tag dropdown/search alongside the existing status filter in the "Add Leads" dialog
- Filter leads by tag so users can find their tagged batch instantly instead of scrolling

## User Flow After This Change

**Scenario A — Load more leads (day 2):**
1. Open Dashboard → Autonomous Agent (or Campaign Manager)
2. Find your running campaign → click **Load Leads**
3. Upload a CSV (auto-tagged) or type a tag name
4. See "247 leads matched" → click **Add All**
5. Campaign continues with fresh leads

**Scenario B — Relaunch a paused campaign:**
1. Open Autonomous Agent → see your paused campaign (yellow dot)
2. Click **Play** → campaign goes active immediately
3. If you need more leads, click **Load Leads** first

**Scenario C — Clone and rerun:**
1. Open Campaign Manager → find completed campaign
2. Click **Clone** → new draft campaign with same settings
3. Load leads → activate → running

## Files to Change
1. `src/components/QuickLeadLoader.tsx` (new)
2. `src/components/CampaignManager.tsx` (add Load Leads + Clone buttons)
3. `src/components/AutonomousAgentDashboard.tsx` (add Play/Pause + Load Leads buttons)
4. `src/components/CampaignLeadManager.tsx` (add tag filter to Add Leads dialog)

