

# Agent Tool Builder: Full Tool Parity with Provider Portals

## Problem

Right now, tools configured on your Retell or Telnyx agents (transfers, webhooks, hangups, etc.) are invisible or read-only in our platform. You have to go to each provider's portal to add/edit tools. There's no way to:

1. **See** what tools are on an agent from our UI (Retell shows nothing, Telnyx shows read-only badges)
2. **Create** new tools (webhook, transfer, hangup, etc.) without leaving the platform
3. **Sync** tools so what's on the provider matches what our platform expects
4. **Verify** that webhook URLs point to the right endpoints

## What We'll Build

### 1. Tool Builder UI (new component)
**New file: `src/components/AgentToolBuilder.tsx`**

A reusable tool management panel that works for both Retell and Telnyx agents. Supports creating, editing, deleting, and syncing tools.

**Tool types supported:**
- **Webhook** — URL, method (GET/POST), headers, parameters, description, async toggle (Telnyx)
- **Transfer** — Phone number(s), warm/cold, description
- **Hangup** — Trigger conditions, description
- **Handoff** — Target assistant ID, voice mode (Telnyx)
- **Send Message** — SMS during call (Telnyx)
- **DTMF** — Send tones (Telnyx)
- **MCP Server** — URL, description (both)
- **Retrieval/Knowledge Base** — Connect KB (Telnyx)

Each tool type gets a form with the relevant fields. The builder knows which tool types are available per provider (Retell supports webhook + transfer; Telnyx supports all 10 types).

### 2. Sync tools from provider
**Files: `AgentToolBuilder.tsx` + edge functions**

- **Pull from provider**: "Sync Tools" button fetches live tool config from Retell (via `get_llm` → `general_tools`) or Telnyx (via `get_assistant` → `tools`) and displays them
- **Push to provider**: When you create/edit a tool in our UI, it pushes the update to the provider API:
  - Retell: `PATCH /update-retell-llm/{llm_id}` with updated `general_tools` array
  - Telnyx: `POST /ai/assistants/{id}` with updated `tools` array
- Visual diff: Shows which tools exist on provider vs locally, highlights mismatches

### 3. Integrate into both agent editors
- **Retell (`AgentEditDialog.tsx`)**: Replace the current MCP-only tab with a full "Tools" tab showing all `general_tools` from the LLM, with add/edit/delete capability
- **Telnyx (`TelnyxAssistantEditor.tsx`)**: Replace the read-only tool badges + "Manage in Portal" link with the full Tool Builder, inline in the Integrations tab

### 4. Webhook URL validation
- When a webhook tool is displayed, auto-check if the URL points to our Supabase edge functions
- Show green check if it matches our endpoints, yellow warning if it points elsewhere, red if URL is broken
- "Auto-fix" button to update webhook URLs to point to the correct platform endpoints (e.g., `calendar-integration`, `call-tracking-webhook`)

### 5. Edge function updates
**Files: `retell-agent-management/index.ts`, `telnyx-ai-assistant/index.ts`**

- Add `update_tools` action to Retell edge function — fetches current LLM `general_tools`, merges changes, pushes back
- Add `update_tools` action to Telnyx edge function — updates the tools array on the assistant
- Add `delete_tool` action to both — removes a tool by name from the array and pushes

## User Flow

1. Open Agent Editor (Retell or Telnyx) → go to **Tools** tab
2. See all tools currently configured on the provider (synced live)
3. Click **Add Tool** → pick type (Webhook, Transfer, Hangup, etc.)
4. Fill in the form (URL, phone number, description, parameters)
5. Click **Save** → tool is pushed to the provider API immediately
6. Webhook URLs auto-validated with status indicators
7. Edit or delete any existing tool inline

## Files to Create/Change

1. `src/components/AgentToolBuilder.tsx` (new — tool management UI)
2. `src/components/AgentEditDialog.tsx` (replace MCP tab with full Tools tab using AgentToolBuilder)
3. `src/components/TelnyxAssistantEditor.tsx` (replace read-only tools section with AgentToolBuilder)
4. `supabase/functions/retell-agent-management/index.ts` (add `update_tools` and `delete_tool` actions)
5. `supabase/functions/telnyx-ai-assistant/index.ts` (add `update_tools` and `delete_tool` actions)

