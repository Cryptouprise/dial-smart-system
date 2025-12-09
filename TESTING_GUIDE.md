# Testing Guide: Production Readiness Verification

This guide helps verify that all merged features are working correctly in production.

## ✅ What Was Merged

1. **PR #7**: Retell AI comprehensive API (types, services, hooks)
2. **PR #8**: Twilio Pro features (SIP trunking, A2P 10DLC)
3. **PR #2**: Final working Retell integration (CRITICAL - custom fields mapping)

## 🎯 Critical Feature: Custom Fields in Agent Prompts

### How It Works

The system now automatically passes ALL lead data to Retell AI agents as `dynamic_variables`:

**Standard Variables Available:**
- `{{first_name}}` - Lead's first name
- `{{last_name}}` - Lead's last name  
- `{{full_name}}` - Full name (first + last)
- `{{contact_name}}` - Full name or "there" as fallback
- `{{email}}` - Email address
- `{{phone}}` - Phone number
- `{{company}}` - Company name
- `{{status}}` - Lead status
- `{{priority}}` - Priority level
- `{{lead_source}}` - Where the lead came from
- `{{tags}}` - Comma-separated tags
- `{{notes}}` - Lead notes
- `{{timezone}}` - Lead's timezone
- `{{preferred_contact_time}}` - Best time to contact

**Custom Fields:**
Any field in `leads.custom_fields` (JSONB) is automatically available as `{{custom_fieldname}}`.

**Example:**
If `leads.custom_fields` contains:
```json
{
  "budget": "50000",
  "industry": "Healthcare",
  "decision_maker": "Yes",
  "current_solution": "Competitor XYZ"
}
```

Your agent prompt can use:
```
You are calling {{contact_name}} from {{company}} in the {{custom_industry}} industry.

Their budget is {{custom_budget}} and they are currently using {{custom_current_solution}}.

They are {{#if custom_decision_maker}}the decision maker{{else}}not the decision maker{{/if}}.

Priority: {{priority}} | Status: {{status}}
```

## 🧪 Testing Checklist

### 1. Phone Number Buying
```bash
# Test searching for numbers
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/twilio-advanced-management \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "search_numbers",
    "areaCode": "415"
  }'

# Test buying a number
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/twilio-advanced-management \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "buy_number",
    "phoneNumber": "+14155551234",
    "voiceUrl": "https://YOUR_PROJECT.supabase.co/functions/v1/twilio-termination-proxy",
    "friendlyName": "Test Number"
  }'
```

### 2. Agent Creation with Custom Field References
```bash
# Create an LLM with custom field references
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/retell-llm-management \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "create",
    "generalPrompt": "You are a sales assistant calling {{contact_name}} from {{company}}. Their budget is {{custom_budget}} and they work in {{custom_industry}}. Be professional and mention these details naturally.",
    "beginMessage": "Hi {{first_name}}, this is Sarah calling about your inquiry regarding our {{custom_industry}} solutions.",
    "model": "gpt-4o"
  }'

# Create an agent with the LLM
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/retell-agent-management \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "create",
    "agentName": "Sales Agent - Custom Fields Test",
    "llmId": "LLM_ID_FROM_ABOVE",
    "voiceId": "11labs-Adrian"
  }'
```

### 3. Outbound Call with Custom Fields
```bash
# Create a lead with custom fields first (via Supabase dashboard or API)
# INSERT INTO leads (user_id, first_name, last_name, company, custom_fields) 
# VALUES ('YOUR_USER_ID', 'John', 'Doe', 'Acme Corp', 
#   '{"budget": "100k", "industry": "Technology", "decision_maker": "Yes"}');

# Make an outbound call
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/outbound-calling \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "create_call",
    "phoneNumber": "+14155555678",
    "callerId": "+14155551234",
    "agentId": "AGENT_ID_FROM_ABOVE",
    "leadId": "LEAD_ID_WITH_CUSTOM_FIELDS"
  }'
```

### 4. Verify Dynamic Variables Are Passed
Check the Supabase logs for `outbound-calling` function. You should see:
```
[Outbound Calling] Initiating Retell AI call with payload: {
  "from_number": "+14155551234",
  "to_number": "+14155555678",
  "override_agent_id": "agent_xxx",
  "metadata": { ... },
  "dynamic_variables": {
    "first_name": "John",
    "last_name": "Doe",
    "contact_name": "John Doe",
    "company": "Acme Corp",
    "custom_budget": "100k",
    "custom_industry": "Technology",
    "custom_decision_maker": "Yes"
  }
}
```

### 5. Integration Test Script
```bash
# Set environment variables
export SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
export SUPABASE_ANON_KEY="your_anon_key"
export SUPABASE_ACCESS_TOKEN="your_jwt_token"
export TEST_TO_NUMBER="+14155555678"
export TEST_FROM_NUMBER="+14155551234"

# Run the integration test
node scripts/integration/test-outbound-call.js
```

## 🔍 Verification Points

### ✅ Custom Fields Working Correctly
1. **Lead has custom fields** in database
2. **Agent prompt references** custom fields with `{{custom_fieldname}}`
3. **Outbound call logs** show dynamic_variables in payload
4. **Agent speaks** the custom field values during the call
5. **Call transcript** shows agent used the correct data

### ✅ Phone Number Operations
1. **Search** returns available numbers
2. **Buy** successfully purchases number
3. **Number appears** in database with `twilio_sid` and `provider='twilio'`
4. **Bulk buy** can purchase multiple numbers
5. **Release** can delete numbers

### ✅ Agent Creation
1. **LLM creation** succeeds with custom prompts
2. **Agent creation** succeeds with LLM ID
3. **Agent can be listed** and retrieved
4. **Agent can be updated** with new settings

## 🐛 Common Issues & Solutions

### Issue: "Agent doesn't say custom field values"
**Solution:** 
- Verify lead has `custom_fields` populated in database
- Check outbound-calling logs to confirm `dynamic_variables` are in the payload
- Ensure agent prompt uses correct syntax: `{{custom_fieldname}}` not `{{fieldname}}`

### Issue: "Phone number purchase fails"
**Solution:**
- Verify `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` are set correctly
- Check Twilio account has sufficient balance
- Ensure phone number is available and in correct format (+E.164)

### Issue: "Authentication errors"
**Solution:**
- Check JWT token is valid and not expired
- Ensure `Authorization: Bearer TOKEN` header is present
- Verify user has proper permissions in database

### Issue: "Custom fields not appearing in dynamic_variables"
**Solution:**
- Check `custom_fields` column is JSONB type
- Ensure custom_fields is valid JSON
- Verify lead ID is correct and lead exists
- Check outbound-calling function logs for lead data retrieval

## 📋 Deployment Steps

1. **Set Environment Variables:**
```bash
supabase secrets set TWILIO_ACCOUNT_SID=ACxxxx
supabase secrets set TWILIO_AUTH_TOKEN=xxxxx
supabase secrets set RETELL_AI_API_KEY=key_xxxxx
```

2. **Deploy Edge Functions:**
```bash
supabase functions deploy outbound-calling
supabase functions deploy twilio-advanced-management
supabase functions deploy twilio-outbound-call
supabase functions deploy twilio-termination-proxy
supabase functions deploy retell-llm-management
supabase functions deploy retell-agent-management
supabase functions deploy retell-phone-management
```

3. **Run Database Migrations:**
```bash
supabase db push
```

4. **Test with Integration Script:**
```bash
node scripts/integration/test-outbound-call.js
```

## 🚀 Production Ready Criteria

- [x] Build passes without errors
- [x] All Edge Functions deployed
- [x] Environment variables configured
- [x] Database migrations applied
- [x] Custom fields mapping implemented
- [x] Dynamic variables accessible in prompts
- [x] Phone number buying/testing works
- [ ] Integration test passes with custom fields
- [ ] Manual test call successfully uses custom field data
- [ ] Agent correctly pronounces custom field names

Once all criteria are met, the system is **production ready**! 🎉
