# Script Optimizer Setup & Test Guide

## 🎯 What Your Script Optimizer Does

Your system **automatically analyzes 100% of your AI call transcripts** and provides:
- **Script Adherence Score** - How closely calls follow your intended script
- **Prioritized Improvements** - Critical/Important/Nice-to-have changes with examples
- **AI Voice Delivery Notes** - Tone, pacing, and emphasis guidance
- **One-Click Apply & Save** - Apply improvements and save directly to your Retell agent
- **Automatic Learning** - Tracks what works and continuously optimizes

**Cost**: ~$0.01 per 20 calls analyzed (vs $400 manually on Assistable!)

---

## ✅ Step 1: Verify Required API Keys

Your Script Optimizer needs 3 environment variables configured in Supabase:

| Variable | Purpose | Status |
|----------|---------|--------|
| `LOVABLE_API_KEY` | Powers the AI analysis (Gemini 2.5 Flash) | ⚠️ **MUST SET** |
| `RETELL_AI_API_KEY` | Loads/saves agent scripts from Retell | ⚠️ **MUST SET** |
| `SUPABASE_SERVICE_ROLE_KEY` | Database access (auto-configured) | ✅ Should exist |
| `SUPABASE_URL` | Your project URL (auto-configured) | ✅ Should exist |

---

## 🔧 Step 2: Set Up API Keys in Supabase

### 2.1 Navigate to Supabase Secrets

1. **Go to**: https://supabase.com/dashboard/project/emonjusymdripmkvtttc/settings/functions
2. **Look for**: "Edge Function Secrets" section
3. **Check which secrets are already set** (they'll be listed but values hidden)

### 2.2 Get Your LOVABLE_API_KEY

**Option A: If you have a Lovable account**
1. Go to: https://lovable.dev/dashboard
2. Navigate to: Settings → API Keys
3. Create a new API key or copy existing one
4. Add to Supabase secrets as `LOVABLE_API_KEY`

**Option B: Use Google Gemini directly (alternative)**
1. Go to: https://aistudio.google.com/apikey
2. Create a Gemini API key
3. Modify the edge function to use Gemini directly instead of Lovable gateway
   - Let me know if you want me to make this change

### 2.3 Get Your RETELL_AI_API_KEY

1. Go to: https://app.retellai.com/dashboard
2. Click on your profile/settings
3. Navigate to "API Keys" section
4. Copy your API key
5. Add to Supabase secrets as `RETELL_AI_API_KEY`

### 2.4 Add Secrets to Supabase

For each secret:
```bash
# In Supabase Dashboard > Project Settings > Edge Functions:
1. Click "Add new secret"
2. Name: LOVABLE_API_KEY (or RETELL_AI_API_KEY)
3. Value: [paste your API key]
4. Click "Save"
```

**Important**: After adding secrets, you may need to redeploy your edge functions for them to take effect.

---

## 🧪 Step 3: Test Your Setup

### 3.1 Quick Database Check

Open your Supabase SQL Editor and run:

```sql
-- Check for calls with transcripts
SELECT
  id,
  LEFT(transcript, 100) as transcript_preview,
  agent_name,
  created_at
FROM call_logs
WHERE transcript IS NOT NULL
  AND LENGTH(transcript) > 50
ORDER BY created_at DESC
LIMIT 10;
```

**Expected Result**:
- ✅ You see some calls with transcripts → Ready to analyze!
- ❌ No results → Make some test calls first

### 3.2 Check Retell Agent Configuration

```sql
-- Check for Retell agents
SELECT
  id,
  number,
  provider,
  retell_agent_id,
  status
FROM phone_numbers
WHERE retell_agent_id IS NOT NULL
LIMIT 10;
```

**Expected Result**:
- ✅ You see phone numbers with `retell_agent_id` → Agents are configured
- ❌ No retell_agent_id → Need to configure Retell agents on your phone numbers

### 3.3 Test Edge Function Directly

In Supabase SQL Editor or your browser console:

```javascript
// Test the analyze-call-transcript function
const response = await fetch('https://emonjusymdripmkvtttc.supabase.co/functions/v1/analyze-call-transcript', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_ANON_KEY_HERE',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    action: 'compare_to_script',
    script: 'Test script',
    transcripts: [{
      callId: 'test',
      transcript: 'Test transcript',
      sentiment: 'positive',
      outcome: 'interested',
      duration: 60
    }]
  })
});

const result = await response.json();
console.log(result);
```

**Expected Results**:
- ✅ Returns JSON with `script_adherence_score` and `improvements` → Working!
- ❌ Error about "LOVABLE_API_KEY not configured" → Check Step 2.2
- ❌ Error about "RETELL_AI_API_KEY" → Check Step 2.3
- ❌ 401 Unauthorized → Check your authorization header

---

## 🚀 Step 4: Use the Script Optimizer UI

Once secrets are configured:

### 4.1 Access the Transcript Analyzer

1. **Run your app**: `npm run dev`
2. **Navigate to**: Transcript Analyzer page (should be in your main menu)
3. **You'll see 4 tabs**:
   - Call History
   - Script Analysis ← **This is the main feature!**
   - Insights
   - Manual

### 4.2 Load & Analyze Your Agent Script

1. **Click**: "Script Analysis" tab
2. **Select**: Your Retell agent from dropdown
3. **Click**: "Import Script" button
   - This loads the current prompt from your Retell agent
4. **Click**: "Compare & Generate Improvements"
   - Analyzes up to 20 recent calls against your script
   - Takes 10-30 seconds depending on call volume

### 4.3 Review & Apply Improvements

You'll get back:

**Script Adherence Score** (0-100%)
- Shows how closely your calls follow the intended script

**Prioritized Improvements** with:
- 🔴 **Critical** - Must fix (losing conversions)
- 🟠 **Important** - Should fix (impacts quality)
- 🟢 **Nice-to-have** - Minor enhancements

Each improvement includes:
- **Section** - Which part of the script (opening, qualification, objection_handling, etc.)
- **Title** - Short description
- **Suggestion** - Detailed explanation
- **Example** - Exact script text to add/modify
- **AI Voice Notes** - Tone, pacing, emphasis guidance

**How to use**:
1. **Review** each improvement
2. **Click "Apply"** to add it to your script (editable)
3. **Edit** the script as needed
4. **Click "Save All to Agent"** to push changes back to Retell

### 4.4 Monitor Continuous Learning

Your system automatically:
- ✅ Analyzes every call transcript
- ✅ Extracts objections and pain points
- ✅ Tracks which scripts perform best
- ✅ Logs all improvements in `agent_improvement_history` table
- ✅ Provides insights on "Insights" tab

---

## 📊 Step 5: Check Analytics

### View Script Performance

```sql
-- See which scripts are performing best
SELECT
  script_id,
  script_name,
  total_calls,
  success_rate,
  avg_conversion_time_seconds,
  last_used_at
FROM script_performance_analytics
ORDER BY success_rate DESC;
```

### View Improvement History

```sql
-- See all script improvements you've made
SELECT
  created_at,
  agent_name,
  improvement_type,
  title,
  details
FROM agent_improvement_history
ORDER BY created_at DESC
LIMIT 20;
```

### View Common Objections

```sql
-- See top objections across all calls
SELECT
  unnest(objections) as objection,
  COUNT(*) as frequency
FROM ml_learning_data
WHERE objections IS NOT NULL
GROUP BY objection
ORDER BY frequency DESC
LIMIT 10;
```

---

## 🔍 Troubleshooting

### "LOVABLE_API_KEY not configured"
- Go to Supabase Dashboard → Edge Functions → Add the secret
- Redeploy edge functions after adding

### "Failed to load agent script"
- Verify `RETELL_AI_API_KEY` is set correctly
- Check that your Retell agent has an LLM configured
- Ensure the LLM has a `general_prompt` or `begin_message`

### "No calls with transcripts to compare"
- Make some test calls using your Retell agents
- Transcripts are automatically captured when using Retell
- Check `call_logs` table to verify transcripts exist

### Script changes not saving
- Verify you clicked "Save All to Agent" (not just Apply)
- Check browser console for errors
- Verify `RETELL_AI_API_KEY` has write permissions

### Edge function timeout
- Analyzing 20 calls takes ~10-30 seconds (normal)
- If it times out, reduce filter to fewer calls
- Check Supabase Edge Function logs for errors

---

## 💰 Cost Comparison

| Method | Cost per 20 calls | Features |
|--------|------------------|----------|
| **Your System** | ~$0.01 | Automated, 24/7, prioritized improvements, AI voice notes, auto-save |
| **Assistable Manual** | $400+ | Manual review, time-consuming, no automation |
| **Retell Analytics** | Included | Basic metrics only, no script optimization |

**Your system pays for itself after the first day of use.**

---

## 🎓 Advanced Usage

### A/B Test Scripts

1. Create two versions of your script
2. Configure different Retell agents with each version
3. Run campaigns with both
4. Use `script_performance_analytics` to compare success rates

### Automated Daily Reports

Set up a cron job to:
```sql
-- Create daily script performance summary
INSERT INTO script_performance_reports (date, best_script, worst_script, avg_adherence_score)
SELECT
  CURRENT_DATE,
  (SELECT script_name FROM script_performance_analytics ORDER BY success_rate DESC LIMIT 1),
  (SELECT script_name FROM script_performance_analytics ORDER BY success_rate ASC LIMIT 1),
  (SELECT AVG(script_adherence_score) FROM recent_analyses)
```

### Export Improvements for Team Review

```sql
-- Export last 30 days of improvements
COPY (
  SELECT
    created_at,
    agent_name,
    improvement_type,
    title,
    details
  FROM agent_improvement_history
  WHERE created_at > NOW() - INTERVAL '30 days'
  ORDER BY created_at DESC
) TO '/tmp/script_improvements.csv' WITH CSV HEADER;
```

---

## ✅ Setup Checklist

Use this checklist to verify your setup:

- [ ] LOVABLE_API_KEY added to Supabase secrets
- [ ] RETELL_AI_API_KEY added to Supabase secrets
- [ ] Edge functions redeployed (if needed)
- [ ] Database has calls with transcripts (run SQL check)
- [ ] Retell agents are configured on phone numbers
- [ ] Tested Script Analysis tab in UI
- [ ] Successfully loaded agent script
- [ ] Successfully compared transcripts to script
- [ ] Applied an improvement and saved to agent
- [ ] Verified improvement logged in `agent_improvement_history`

---

## 🆘 Need Help?

If you're stuck:

1. **Check Supabase Logs**: Dashboard → Edge Functions → Logs
2. **Check Browser Console**: F12 → Console tab
3. **Run SQL diagnostics**: Use the queries in Step 3
4. **Test API keys separately**: Verify each key works in its respective platform

**Common Issues**:
- API key has wrong format (copy/paste issue)
- Edge functions not redeployed after adding secrets
- RLS policies blocking queries (shouldn't happen with service role key)
- Retell agent doesn't have LLM configured

---

## 🎉 You're Ready!

Once you've completed the checklist, your Script Optimizer is ready to:
- ✅ Monitor 100% of your AI voice calls
- ✅ Provide prioritized, actionable improvements
- ✅ Save changes directly back to Retell
- ✅ Learn continuously from outcomes
- ✅ Save you hundreds of dollars in manual optimization

**Cost to analyze 1,000 calls**: ~$0.50
**Time saved**: Countless hours
**Value**: Priceless 🚀

---

**Last Updated**: January 2026
**Support**: Check CLAUDE.md for additional context
