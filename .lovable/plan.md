

# Add Provider Identification (Retell vs Telnyx) Across All UI

## Problem
No visual distinction between Retell and Telnyx campaigns/agents anywhere in the UI. When running both simultaneously, there's no way to tell them apart.

## Changes

### 1. Create shared provider badge utility
**New file: `src/lib/providerUtils.ts`**
- Helper function that maps provider string to display label and badge color classes
- Retell AI → blue badge, Telnyx AI → green badge, Twilio → orange badge, Unknown → gray badge
- Reused by all components below

### 2. CampaignManager — Add provider badge to campaign cards
**File: `src/components/CampaignManager.tsx`**
- In the campaign card header (line ~1083 area, the badges row), add a provider badge showing "Retell AI" or "Telnyx AI" with distinct colors
- The `campaign.provider` field already exists in the data — just not displayed

### 3. CampaignManager — Campaign list table column
**File: `src/components/CampaignManager.tsx`**
- The agent badge currently shows agent name but not which provider it belongs to — add the provider label alongside or replace the plain agent badge with a provider-prefixed one

### 4. AutonomousAgentDashboard — Style provider in campaign cards
**File: `src/components/AutonomousAgentDashboard.tsx`**
- Line ~407: currently shows `{c.provider}` as plain text
- Replace with colored Badge component using the shared utility

### 5. CampaignResultsDashboard — Add provider to campaign selector
**File: `src/components/CampaignResultsDashboard.tsx`**
- Fetch `provider` column in the campaigns query
- Show provider badge next to each campaign name in the dropdown and in the selected campaign header

### 6. CampaignWizard — Already has provider selector (no change needed)
The wizard at step 2 already has a provider dropdown with Retell AI and Telnyx AI options — this is working correctly.

### 7. MissionBriefingWizard — Already has provider selector (no change needed)
The briefing wizard already has a buy-numbers provider selector — working correctly.

## Files to Change
1. `src/lib/providerUtils.ts` (new)
2. `src/components/CampaignManager.tsx`
3. `src/components/AutonomousAgentDashboard.tsx`
4. `src/components/CampaignResultsDashboard.tsx`

## Visual Result
Every campaign listing across the app will show a colored badge: **Retell AI** (blue) or **Telnyx AI** (green), making it instantly obvious which provider each campaign uses when they run side by side.

