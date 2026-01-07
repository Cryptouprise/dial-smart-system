# Dialing & Pacing System Guide

## Overview

Dial Smart uses an intelligent pacing system that automatically manages call volume, timing, and number rotation. **You do NOT need drip mode** like in GoHighLevel - the system handles pacing automatically.

---

## How Dialing Pace Works

### Call Dispatcher (Regular Campaigns)

The `call-dispatcher` edge function processes calls in cycles:

| Setting | Default | Description |
|---------|---------|-------------|
| **Cycle Interval** | 30 seconds | How often the dispatcher runs |
| **Calls per Cycle** | 5 | Max calls to initiate per cycle |
| **Max Concurrent** | 20 | Maximum simultaneous active calls |
| **Result** | ~10 calls/min | Sustainable pace that prevents system overload |

### Voice Broadcasts

Voice broadcasts use a higher throughput setting:

| Setting | Default | Description |
|---------|---------|-------------|
| **calls_per_minute** | 50 | Target calls per minute |
| **MAX_CONCURRENT_CALLS** | 20 | Hard limit on simultaneous calls |
| **Batch Processing** | Yes | Processes in batches with delays |

---

## Why No Drip Mode Needed

In GoHighLevel, you manually configure:
```
Drip Mode → 3 calls every 6 seconds
```

**In Dial Smart, this is automatic because:**

1. **Smart Dispatcher**: The call-dispatcher runs on a fixed 30-second cycle, automatically spacing calls
2. **Concurrency Limits**: Never exceeds MAX_CONCURRENT_CALLS (20)
3. **Intelligent Pacing**: Auto-adjusts based on answer rates and abandonment
4. **Number Rotation**: Cycles through numbers to prevent spam flagging
5. **Queue Management**: Prioritizes leads, handles retries, respects calling hours

---

## Intelligent Pacing System

The `useIntelligentPacing` hook provides real-time optimization:

### Metrics Tracked
- **Answer Rate**: % of calls answered
- **Abandonment Rate**: % of calls abandoned (too slow to connect)
- **Average Wait Time**: How long leads wait before agent connection
- **Concurrency Usage**: Current vs max simultaneous calls

### Auto-Adjustment Logic

```
IF answer_rate < 20%:
  → Slow down pace (leads not answering)
  → Switch calling times
  → Check for spam issues

IF abandonment_rate > 5%:
  → Reduce concurrent calls
  → System is overwhelming leads

IF concurrency_usage > 80%:
  → At capacity, maintain current pace
  → Queue additional leads for next cycle
```

### Recommendations Generated

The pacing system provides actionable insights:
- "Low answer rate detected - consider calling during different hours"
- "High abandonment - reduce calls per minute"
- "Spam flags detected on 3 numbers - rotating to healthy numbers"

---

## Number Rotation System

Number rotation prevents spam flagging and improves answer rates:

### How It Works

1. **Pool Management**: Numbers are grouped by area code
2. **Usage Tracking**: Each number tracks daily call count
3. **Daily Limits**: Default 100 calls/day per number
4. **Round-Robin**: Calls distribute evenly across pool
5. **Health Monitoring**: Spam-flagged numbers are quarantined

### Configuration Options

| Setting | Default | Adjustable |
|---------|---------|------------|
| **rotation_enabled** | true | Per number |
| **max_daily_calls** | 100 | Per number |
| **rotation_priority** | 0 | Higher = more calls |
| **quarantine_threshold** | 50% spam score | System-wide |

### Example Setup

For 2,500 calls/day capacity:
```
25 numbers × 100 calls/day = 2,500 daily capacity
```

---

## Campaign Pacing Settings

### Per-Campaign Configuration

Each campaign can customize:

```typescript
{
  calls_per_minute: 5,        // Target pace
  max_attempts: 3,            // Max tries per lead
  retry_delay_minutes: 60,    // Wait between retries
  calling_hours_start: "09:00",
  calling_hours_end: "17:00",
  timezone: "America/New_York",
  max_calls_per_day: 500      // Daily limit for campaign
}
```

### Calling Hours Compliance

The system automatically:
- Respects campaign calling hours
- Adjusts for lead timezone when available
- Pauses outside business hours
- Resumes next business day

---

## Tuning Performance

### For Higher Volume

If you need more calls/day:

1. **Add more numbers**: Each number = +100 calls/day capacity
2. **Increase max_daily_calls**: Up to 150-200 for aggressive campaigns
3. **Extend calling hours**: Longer windows = more opportunities
4. **Reduce retry delays**: Faster follow-up on no-answers

### For Better Answer Rates

If answer rates are low:

1. **Match area codes**: Local presence improves 20-30%
2. **Optimize timing**: Test different hours
3. **Check number health**: Rotate out spam-flagged numbers
4. **Reduce pace**: Slower calling can improve quality

### For Compliance

Stay TCPA compliant:

1. **Respect DNC**: System auto-checks do-not-call list
2. **Honor opt-outs**: Immediate removal from campaigns
3. **Document consent**: Track lead source and consent
4. **Limit retries**: 3 attempts max is industry standard

---

## Monitoring Pacing

### Dashboard Metrics

The Predictive Dialing Dashboard shows:
- Current calls in progress
- Calls per minute (actual vs target)
- Answer rate trends
- Number pool health
- Queue depth

### Lady Jarvis Commands

```
"How's the dialing pace for Solar Campaign?"
"What's our current answer rate?"
"Are any numbers flagged as spam?"
"Increase calling pace to 10 per minute"
"Pause all calling for 30 minutes"
```

---

## Troubleshooting

### "Calls aren't going out fast enough"

1. Check concurrent call limit (are you at 20?)
2. Verify calling hours are active
3. Ensure phone numbers are available
4. Check for API rate limits

### "Too many abandoned calls"

1. Reduce calls_per_minute
2. Check average wait time
3. Ensure agents/AI are ready to handle calls

### "Low answer rates"

1. Check number spam scores
2. Try different area codes
3. Adjust calling times
4. Review lead data quality

### "Numbers getting flagged as spam"

1. Reduce daily calls per number
2. Enable stricter rotation
3. Rest flagged numbers for 24-48 hours
4. Purchase fresh numbers in affected area codes

---

## Quick Reference

### Recommended Settings by Volume

| Daily Volume | Numbers Needed | Calls/Number | Pace |
|-------------|----------------|--------------|------|
| 500 calls | 10 | 50/day | 5/min |
| 1,000 calls | 15 | 70/day | 8/min |
| 2,500 calls | 25 | 100/day | 15/min |
| 5,000 calls | 50 | 100/day | 25/min |

### Key Edge Functions

| Function | Purpose |
|----------|---------|
| `call-dispatcher` | Manages outbound call queue |
| `predictive-dialing-engine` | ML-based pacing optimization |
| `enhanced-rotation-manager` | Number pool management |
| `voice-broadcast-queue` | High-volume broadcast engine |

---

## Summary

**Don't configure drip mode.** Dial Smart's intelligent pacing system handles everything:

✅ Automatic call spacing
✅ Concurrency management  
✅ Number rotation
✅ Answer rate optimization
✅ Compliance enforcement
✅ Real-time adjustments

Just set your goals, add your numbers, and let the system optimize.
