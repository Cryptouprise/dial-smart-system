

# Campaign Edit: Full Provider + Agent Visibility

## Problem
1. **Edit dialog is either/or** — when you hit the pencil icon, the provider dropdown forces Retell OR Telnyx. Switching clears the agent. You can't see what's configured on the other side or set both.
2. **No agent search** — the agent dropdown is a flat list with no search/filter. With many agents, finding the right one is painful.

## Changes

### 1. Show BOTH providers in edit dialog (not either/or)
**File: `src/components/CampaignManager.tsx`**
- Replace the single "Voice AI Provider" dropdown with a clear two-section layout:
  - **Retell AI Agent** section — always visible, shows the Retell agent dropdown (or "None selected")
  - **Telnyx AI Assistant** section — always visible, shows the Telnyx assistant dropdown (or "None selected")
- Add a "Primary Provider" toggle (Retell / Telnyx) that determines which provider is used for outbound calls — but both agent selectors remain visible so you can see and configure both
- When saving, the `provider` field maps to whichever is set as primary
- This way you can see at a glance: "This campaign uses Retell agent X, and if I switch to Telnyx it'll use assistant Y" — both are always configured and visible

### 2. Add searchable agent dropdowns
**File: `src/components/CampaignManager.tsx`**
- Replace the basic `<Select>` for both Retell agents and Telnyx assistants with a searchable combobox pattern (using the existing `Command`/`Popover` components from shadcn)
- Type to filter agents by name
- Still shows phone status icons (green phone / no phone) for Retell agents

### 3. Show agent config summary in edit dialog
**File: `src/components/CampaignManager.tsx`**
- Below each agent selector, show a mini info card with key details of the selected agent:
  - Retell: agent name, voice, LLM model, phone number
  - Telnyx: assistant name, model, voice
- Add a "View/Edit Agent" link button that opens the respective agent editor (AgentEditDialog for Retell, TelnyxAssistantEditor for Telnyx) directly from the campaign edit — so agent settings are accessible ("sacred") from this tab

### 4. Campaign card: show both agents when configured
**File: `src/components/CampaignManager.tsx`**
- In the campaign card badges row (lines 1114-1167), if BOTH a retell agent_id AND telnyx_assistant_id are set, show both agent badges (with their respective provider color) so it's clear the campaign has both configured

## Files to Change
1. `src/components/CampaignManager.tsx` (edit dialog rework + searchable dropdowns + agent info cards + card badges)

## Result
- Hit the pencil icon → see BOTH Retell and Telnyx agents side by side, always visible
- Search/filter agents by name instead of scrolling
- See agent details and jump to agent editor directly from the campaign edit
- Campaign cards show both configured agents when applicable

