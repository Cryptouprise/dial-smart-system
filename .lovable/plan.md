

## Problem: Tags and Caller ID Not Working on Platform-Launched Calls

### Root Cause

When you launch a call from the Retell portal, Retell uses the **phone number's pre-configured outbound agent** — which includes all LLM tool configurations like "Send Enrichment", "Ring RANGBA Tool", and `show_transferee_as_caller: true`.

When your app launches a call via `outbound-calling`, it sends this to Retell's `create-phone-call` API:

```text
{
  from_number,
  to_number,
  agent_id,
  retell_llm_dynamic_variables,
  metadata
}
```

That's it. **No `override_agent_config`** is sent. The call uses whatever agent config is stored on Retell's side for that `agent_id`. So in theory, the tools (Send Enrichment, Ring RANGBA, transfer with `show_transferee_as_caller`) should work identically.

**But here's the catch**: your app calls `PATCH /update-phone-number` to assign the agent to the `from_number` before dialing. If that PATCH changes the phone number's outbound agent assignment and the new agent has a **different LLM** or **different tool configuration** than what you tested in the portal, the tools won't fire the same way.

The most likely causes are:

1. **The agent's LLM has drifted** — The agent_id your campaign uses may point to an LLM whose tools were overwritten or partially synced (the exact issue we fixed with payload preservation). The tools exist in the JSON but may have lost critical nested settings like `show_transferee_as_caller` or webhook URLs for enrichment/RANGBA during a previous save from the platform UI.

2. **Dynamic variables are missing keys the tools expect** — Tools like "Send Enrichment" and "Ring RANGBA" likely reference dynamic variables (lead phone, name, etc.) by specific key names. If the tool's webhook URL or parameters use variable names that don't match what `outbound-calling` injects, the tool fires but sends empty/wrong data.

3. **No `override_agent_config`** — If you need per-call tool behavior that differs from the stored agent config, the app would need to send `override_agent_config` in the create-phone-call payload. Currently it doesn't.

### Fix Plan

#### Step 1: Diagnose — Log the live LLM tool config during calls

Add diagnostic logging to `outbound-calling` that fetches the agent's current LLM config right before placing the call, and logs the transfer tool's `show_transferee_as_caller` field and any webhook tool URLs (enrichment/RANGBA). This tells us definitively whether the stored config is correct or corrupted.

**File**: `supabase/functions/outbound-calling/index.ts`

#### Step 2: Fix — Send `override_agent_config` with transfer settings

If the agent's stored config is correct but Retell isn't honoring it on API-created calls, add `override_agent_config` to the create-phone-call payload to explicitly set `show_transferee_as_caller: true` on all transfer tools. This forces the behavior regardless of what's stored.

**File**: `supabase/functions/outbound-calling/index.ts`

#### Step 3: Verify webhook tool URLs

Check that the enrichment and RANGBA tools have their webhook URLs intact in the agent's LLM config. If a previous save from the platform UI stripped these URLs (the empty-string URL stripping logic), the tools would exist but point nowhere.

**File**: `supabase/functions/retell-agent-management/index.ts` (logging during sync)

#### Step 4: Deploy and test

Deploy `outbound-calling` with the diagnostic logging, make one test call from the platform, and check the logs to see exactly what tool config Retell has for the agent. Then we'll know if it's a config corruption issue or a Retell API behavioral difference.

### Why Portal Works But API Doesn't — Summary

The Retell portal uses the **phone number's assigned agent** when you click "Call" in their UI. Your app uses `create-phone-call` with an `agent_id` parameter — same agent, but Retell may handle tool execution slightly differently for API-created calls vs portal-created calls, OR the agent's LLM tools were corrupted by a previous save from your platform's tool builder (before the payload preservation fix).

