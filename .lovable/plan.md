

# Plan: Calendar Tool Visibility + Push per Assistant

## The Problem

The screenshot shows the Telnyx portal's "Add Webhook Tool" dialog. You can see where tools are configured — but our app gives zero feedback about whether the `book_appointment` tool is actually present on each assistant. The sync logic tries to push it, but failures are silent. Your test call booked nothing because the tool likely wasn't there.

## What I'll Build

### 1. Per-Assistant Calendar Tool Status Badge

On each assistant card, add a visual indicator next to the existing tool count:
- **"📅 Calendar"** (green) — `book_appointment` found in the assistant's tools array
- **"❌ No Calendar Tool"** (red) — missing, with a "Push" button

The check is local (tools array already synced from Telnyx), so it's instant — no extra API call.

### 2. One-Click "Push Calendar Tool" Button

When a tool is missing, show a button that calls the existing `provision_calendar_tools` logic but targeted to a single assistant. This will:
- Fetch current tools from Telnyx API
- Append `book_appointment` webhook tool if missing
- Push back to Telnyx via `POST /v2/ai/assistants/{id}`
- Update local DB
- Refresh the UI

### 3. New `push_calendar_tool` Action (Single Assistant)

Add a targeted action to the edge function that provisions the calendar tool for ONE specific assistant (the existing `provision_calendar_tools` does ALL assistants — we need a surgical version).

### 4. Telnyx Portal Deep Link

Add a small external link icon on each assistant card that opens:
`https://portal.telnyx.com/#/ai/assistants/edit/assistant-{telnyx_id}?tab=agent`

So you can quickly jump to the Telnyx portal to verify tools visually.

## Technical Changes

### `supabase/functions/telnyx-ai-assistant/index.ts`
- Add `push_calendar_tool` action: takes `assistant_id`, fetches tools from Telnyx, pushes calendar tool if missing, updates local DB

### `src/components/TelnyxAIManager.tsx`
- In assistant card metadata row (line ~788): check `a.tools` for `book_appointment`, show green badge or red "Push" button
- Add `handlePushCalendarTool(assistant)` function
- Add Telnyx portal deep link icon next to the Edit button

