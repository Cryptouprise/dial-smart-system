# Test Campaign Configuration - January 18, 2026

## Campaign: Test 1.18

### Objectives
1. Validate press rate at 5K scale (does 1.14% hold?)
2. Test retry logic (max_attempts: 3)
3. Establish baseline metrics for scaling decisions

### Recommended Settings

```yaml
Campaign Name: Test 1.18
Total Leads: 5,000

# Pacing
calls_per_minute: 50
# At 50/min, 5K calls = 100 minutes = ~1.7 hours

# Retry Settings (NEW!)
max_attempts: 3
retry_delay_minutes: 60
# Calls will retry up to 3x, 1 hour apart

# AMD Settings
enable_amd: true
voicemail_action: play_message

# Calling Hours
calling_hours_start: 09:00
calling_hours_end: 20:00
timezone: America/Chicago  # Or your target timezone
bypass_calling_hours: false

# Message
audio_url: [Your audio file URL]
ivr_enabled: true
ivr_mode: dtmf
dtmf_actions: {
  "1": { "action": "transfer", "destination": "[transfer number]" },
  "2": { "action": "callback", "delay_minutes": 30 },
  "9": { "action": "dnc" }
}
```

### Phone Number Requirements

Current: 13 numbers
At 5K calls with 100 calls/number/day limit:
- Need: 50 numbers minimum
- Recommended: 75-100 numbers (buffer for failures)

**Action Required**: Buy ~60-90 more numbers before launch

### Pre-Launch Checklist

- [ ] Retry logic deployed (`supabase functions deploy call-tracking-webhook`)
- [ ] Sufficient phone numbers purchased (need ~50 more)
- [ ] Audio message uploaded and URL ready
- [ ] Transfer destination number configured
- [ ] Leads imported to campaign
- [ ] Calling hours set correctly for timezone
- [ ] Test call placed to verify audio quality

### Expected Results (Projections)

Based on Chase 1.15 baseline:

| Metric | Pessimistic (0.07%) | Expected (0.5%) | Optimistic (1%) |
|--------|---------------------|-----------------|-----------------|
| Calls | 5,000 | 5,000 | 5,000 |
| Answered | 825 (16.5%) | 825 (16.5%) | 825 (16.5%) |
| Presses | 3-4 | 25 | 50 |
| Cost | ~$22 | ~$22 | ~$22 |
| Cost/Press | $5.50-7.00 | $0.88 | $0.44 |

### With Retry Logic (3 attempts)

First attempt: 5,000 calls
- ~825 answered
- ~1,150 retry candidates (no_answer + busy + failed)

Second attempt (1 hr later): ~1,150 calls
- ~190 additional answered
- ~265 retry candidates

Third attempt (2 hrs later): ~265 calls
- ~44 additional answered

**Total Potential Answered: ~1,059 (21% effective answer rate)**

### Monitoring During Campaign

Watch for:
1. Error rate > 5% → Pause and investigate
2. Spam complaints → Check number health
3. Pacing violations → Should be fixed but verify
4. AMD accuracy → Spot check a few calls

### Post-Campaign Analysis

Run analyzer immediately after completion:
1. Calculate actual press rate
2. Compare answered rate to baseline
3. Check retry conversion rate
4. Update LEARNINGS.md
5. Decide on next test parameters

### Success Criteria

**Green Light to Scale (all must be true):**
- Press rate > 0.3%
- Error rate < 5%
- Cost/press < $5
- No major spam issues

**Yellow - Proceed with Caution:**
- Press rate 0.1-0.3%
- OR Error rate 5-10%
- OR Some spam flags

**Red - Pause and Investigate:**
- Press rate < 0.1%
- OR Error rate > 10%
- OR Multiple spam flags

### Next Steps After Test 1.18

If GREEN:
- Scale to 10K (Test 1.19)
- Buy more numbers (to 150 total)
- Maintain settings

If YELLOW:
- Stay at 5K for Test 1.19
- Adjust based on findings
- Investigate issues

If RED:
- Drop to 2.5K
- Full investigation
- Message/number audit

---

## Quick Reference: Create Campaign via UI

1. Navigate to Voice Broadcasts
2. Click "Create New Broadcast"
3. Fill in:
   - Name: `Test 1.18`
   - Select leads (5,000)
   - Upload audio
   - Configure IVR (1=transfer, 2=callback, 9=DNC)
   - Set pacing: 50 calls/min
   - Set max attempts: 3
   - Set retry delay: 60 min
   - Enable AMD
   - Set calling hours
4. Save as Draft
5. Review settings
6. **Wait for permission to launch**

---

*Config prepared: January 17, 2026*
*Launch date: January 18, 2026 (pending approval)*
