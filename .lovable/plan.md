
# Fix: Link Lady Jarvis Agent to Phone Number in Retell

## The Problem

You got a "solar agent" instead of Lady Jarvis because:

1. The `setup-lady-jarvis` function created a new Lady Jarvis agent (`agent_b6fe1afb3185d05441093ca788`) and LLM
2. It updated your local database (`demo_agent_config`) with the new IDs
3. It updated the LLM prompt before each call
4. **BUT** it never told Retell to use Lady Jarvis for outbound calls from `+14752429282`

In Retell's system, each phone number has an `outbound_agent_id` property. Your phone is still pointing to your original solar agent.

---

## The Fix

Add a Retell API call to update the phone number's `outbound_agent_id`:

```
PATCH https://api.retellai.com/update-phone-number/{phone_number}
{
  "outbound_agent_id": "agent_b6fe1afb3185d05441093ca788"
}
```

---

## Implementation Changes

### File: `supabase/functions/setup-lady-jarvis/index.ts`

Add Step 3.5 after creating the agent - update Retell phone number assignment:

```typescript
// Step 3.5: Link agent to phone number in Retell
console.log('🔗 Linking Lady Jarvis to phone number in Retell...');

const phoneUpdateResponse = await fetch(
  `https://api.retellai.com/update-phone-number/${encodeURIComponent(LADY_JARVIS_DEMO_PHONE)}`,
  {
    method: 'PATCH',
    headers: retellHeaders,
    body: JSON.stringify({
      outbound_agent_id: agentId,
      inbound_agent_id: agentId, // Also handle inbound if someone calls back
      nickname: 'Lady Jarvis Demo Line',
    }),
  }
);

if (!phoneUpdateResponse.ok) {
  const errorText = await phoneUpdateResponse.text();
  console.error('Failed to link agent to phone:', errorText);
  // Don't throw - agent was created, just phone link failed
  console.warn('⚠️ Agent created but phone link failed - may need manual assignment');
} else {
  console.log('✅ Lady Jarvis linked to phone number for outbound calls');
}
```

---

## Why This Happens

Retell has two levels of agent assignment:

| Level | What it controls | Current state |
|-------|-----------------|---------------|
| Phone Number → `outbound_agent_id` | Which agent answers when you call FROM this number | Still your solar agent |
| API call → `agent_id` parameter | Overrides phone-level agent (sometimes) | Lady Jarvis |

The safest approach is to update the phone number's `outbound_agent_id` to ensure Lady Jarvis is always used.

---

## After Implementation

1. Deploy the updated `setup-lady-jarvis` function
2. Run it once to update the phone number in Retell
3. Test a new demo call - you should hear Lady Jarvis

---

## Optional: Quick Manual Fix

If you want to fix this immediately without code changes:
- Go to your Retell dashboard
- Navigate to Phone Numbers
- Find `+14752429282`
- Change the outbound agent to "Lady Jarvis Demo" (`agent_b6fe1afb3185d05441093ca788`)

This would instantly fix the issue while we deploy the code fix.
