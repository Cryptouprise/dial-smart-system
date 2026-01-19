# Voice Broadcast Playbook

## Trigger Phrases

When user says any of these, run the corresponding playbook:

---

## "Let's get started on our test campaign" (or similar)

### Pre-Launch Playbook

**Step 1: Check Phone Numbers**
```sql
SELECT
  COUNT(*) as total,
  SUM(CASE WHEN rotation_enabled = true AND status = 'active' THEN 1 ELSE 0 END) as available
FROM phone_numbers;
```
- If available < 50: Ask "Need more numbers. What area code? (e.g., 832, 713, 214)"
- If available >= 50: "Phone numbers: Ready ({available} available)"

**Step 2: Deploy Retry Logic**
- Try: `supabase functions deploy call-tracking-webhook --project-ref emonjusymdripmkvtttc`
- If auth error: "Run `supabase login` first, then say 'continue setup'"
- If success: "Retry logic: Deployed"

**Step 3: Verify System Health**
```sql
SELECT COUNT(*) FROM phone_numbers WHERE is_spam = true;
```
- Check for spam-flagged numbers
- Report any issues

**Step 4: Summary**
```
## Pre-Launch Checklist

| Item | Status |
|------|--------|
| Phone Numbers | X available |
| Retry Logic | Deployed/Pending |
| Spam Flags | X numbers |

## Ready for You:
1. Create campaign "Test [DATE]" in the app
2. Import your leads (recommend: 5,000)
3. Settings: 50 calls/min, max_attempts=3, retry_delay=60
4. Say "I'm launching" when ready
```

---

## "Buy X numbers" or "I need more numbers"

**Number Purchase Playbook**

1. Ask for area code if not specified
2. Search available numbers via Twilio MCP
3. Confirm quantity and cost
4. Purchase on approval
5. Verify numbers added to phone_numbers table

---

## "I'm launching" or "Starting the campaign"

**Launch Confirmation Playbook**

1. Final status check
2. Confirm settings look right
3. "Go for launch. I'll monitor. Say 'status' anytime."

---

## "Status" or "How's it going?"

**Live Monitoring Playbook**

```sql
SELECT
  COUNT(*) as total_calls,
  SUM(CASE WHEN status = 'answered' THEN 1 ELSE 0 END) as answered,
  SUM(CASE WHEN status IN ('pending', 'calling') THEN 1 ELSE 0 END) as remaining,
  SUM(CASE WHEN dtmf_pressed IS NOT NULL THEN 1 ELSE 0 END) as presses,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as errors
FROM broadcast_queue
WHERE broadcast_id = (
  SELECT id FROM voice_broadcasts
  WHERE status = 'active'
  ORDER BY created_at DESC LIMIT 1
);
```

Report:
```
## Live Status
- Calls: X made, X remaining
- Answered: X (Y%)
- Presses: X (Y%)
- Errors: X (Y%) [GREEN/YELLOW/RED]
```

---

## "Analyze [campaign]" or "How did it do?"

**Post-Campaign Analysis Playbook**

1. Run all queries from analyze-campaign.sql
2. Generate full report
3. Determine GREEN/YELLOW/RED status
4. Update LEARNINGS.md
5. Provide recommendations for next test

---

## "What's next?" or "Next steps"

**Scaling Decision Playbook**

Based on last campaign results:
- GREEN: "Scale 50% tomorrow. Buy X more numbers."
- YELLOW: "Same scale, adjust [specific thing]"
- RED: "Pause. Investigate [issue]."

---

## Daily Loop Summary

```
Morning:   "Let's get started" → Pre-launch check
           "I'm launching" → Confirmation
During:    "Status" → Live monitoring
After:     "Analyze [name]" → Full analysis
           "What's next?" → Scaling decision
```
