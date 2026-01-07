# Phone Number Rotation Guide

## Overview

Phone number rotation is critical for maintaining high answer rates and avoiding spam flags. This guide covers how Dial Smart's rotation system works and how to optimize it.

---

## Why Rotation Matters

### The Problem
- Carriers flag numbers that make too many calls
- Spam labels dramatically reduce answer rates (from 30% to <5%)
- A single flagged number can hurt your entire campaign

### The Solution
Number rotation distributes calls across multiple numbers:
- Each number makes fewer daily calls
- Lower per-number volume = lower spam risk
- Automatic switching when numbers show issues

---

## How Rotation Works

### Round-Robin Distribution

```
Call 1 → Number A (area code 475)
Call 2 → Number B (area code 475)
Call 3 → Number C (area code 475)
Call 4 → Number A (area code 475)  ← cycles back
...
```

### Daily Limits

Each number has a `max_daily_calls` limit (default: 100):

```
Number A: 45/100 calls today ✅
Number B: 98/100 calls today ⚠️ (near limit)
Number C: 100/100 calls today ❌ (at limit, skipped)
```

When a number hits its limit:
1. Removed from rotation for the day
2. Resets at midnight (user's timezone)
3. Other numbers absorb the load

### Priority Weighting

Numbers can have priority scores:

```
Number A: priority 10 → Gets 50% of calls
Number B: priority 5  → Gets 25% of calls
Number C: priority 5  → Gets 25% of calls
```

Use higher priority for:
- Newer numbers (less spam history)
- Numbers with better answer rates
- Local area codes matching target market

---

## Setting Up Rotation

### Via Lady Jarvis (Recommended)

```
"Buy 20 numbers in area code 475 and add them to rotation"

"Enable rotation for all my 970 area code numbers with 75 calls per day max"

"Set number +14755550101 as high priority in rotation"
```

### Via UI

1. Go to **Phone Numbers** tab
2. Select numbers to configure
3. Toggle **"Include in Rotation"**
4. Set **Max Daily Calls** (50-150 recommended)
5. Optionally set priority (1-10)

### Via Database

```sql
UPDATE phone_numbers 
SET 
  rotation_enabled = true,
  max_daily_calls = 100,
  rotation_priority = 5
WHERE area_code = '475' AND user_id = 'your-user-id';
```

---

## Area Code Strategy

### Local Presence Matching

Match caller area code to lead's area code:

```
Lead in 475 area → Call from 475 number
Lead in 970 area → Call from 970 number
```

Benefits:
- 20-30% higher answer rates
- Appears local, not telemarketer
- Better trust with leads

### Area Code Pools

Create pools for each target market:

| Market | Area Codes | Numbers | Daily Capacity |
|--------|------------|---------|----------------|
| Connecticut | 475, 203 | 15 | 1,500 calls |
| Colorado | 970, 303 | 10 | 1,000 calls |
| Texas | 214, 972, 469 | 20 | 2,000 calls |

---

## Health Monitoring

### Spam Score Tracking

Numbers are monitored for spam indicators:

| Score | Status | Action |
|-------|--------|--------|
| 0-25% | Healthy ✅ | Normal rotation |
| 26-50% | Warning ⚠️ | Reduce calls, monitor |
| 51-75% | At Risk 🔶 | Rest for 24-48 hours |
| 76-100% | Flagged ❌ | Quarantine, consider deletion |

### Automatic Quarantine

When a number hits high spam scores:

1. **Removed from rotation** automatically
2. **Rested** for configurable period (default: 48 hours)
3. **Rechecked** after rest period
4. **Restored** if score improves, or **flagged for deletion**

### Manual Health Check

Ask Lady Jarvis:
```
"Check health of my phone numbers"
"Which numbers are flagged as spam?"
"Show me number usage for today"
```

---

## Capacity Planning

### Calculating Needs

**Formula:**
```
Numbers Needed = (Daily Call Volume) ÷ (Calls per Number)
```

**Examples:**
| Daily Calls | Calls/Number | Numbers Needed |
|-------------|--------------|----------------|
| 500 | 100 | 5 |
| 1,000 | 100 | 10 |
| 2,500 | 100 | 25 |
| 5,000 | 100 | 50 |

### Buffer Recommendation

Add 20-30% extra numbers for:
- Spam flag quarantines
- Daily limit headroom
- Peak volume days

```
For 2,500 calls/day:
- Minimum: 25 numbers
- Recommended: 30-35 numbers
- Safe buffer: 40 numbers
```

---

## Campaign Integration

### Assigning Numbers to Campaigns

Each campaign can have its own number pool:

1. Create campaign
2. Go to **Campaign Phone Pool** section
3. Select numbers to include
4. Set campaign-specific limits if needed

### Agent Assignment

For Retell AI agents:

1. Assign numbers to agent for **inbound** (callbacks)
2. Assign same or different numbers for **outbound** (dialing)
3. Numbers in agent pool are used for that agent's calls

```
"Assign all 475 numbers to my Solar agent for inbound and outbound"
```

---

## Best Practices

### ✅ Do

- Start with 20-30% more numbers than minimum needed
- Spread across 2-3 area codes if targeting multiple markets
- Monitor spam scores weekly
- Rest numbers that show warning signs
- Replace consistently flagged numbers

### ❌ Don't

- Use a single number for high volume
- Exceed 150 calls/day per number
- Ignore spam warnings
- Keep numbers that are consistently flagged
- Mix personal and business numbers

---

## Troubleshooting

### "All my numbers are at daily limit"

**Cause:** Not enough numbers for your volume
**Fix:** 
1. Add more numbers immediately
2. Reduce campaign pace temporarily
3. Increase max_daily_calls (risky)

### "Answer rates dropped suddenly"

**Cause:** Numbers likely got spam-flagged
**Fix:**
1. Check number health via LJ or dashboard
2. Quarantine flagged numbers
3. Purchase fresh numbers in affected area codes
4. Wait 48-72 hours before using quarantined numbers

### "Rotation isn't distributing evenly"

**Cause:** Priority weights or area code matching
**Fix:**
1. Check priority settings (reset to equal)
2. Verify local presence matching isn't limiting options
3. Ensure all numbers have `rotation_enabled = true`

### "New numbers getting flagged fast"

**Cause:** Warming issue or too aggressive volume
**Fix:**
1. Start new numbers at 25-50 calls/day
2. Gradually increase over 2 weeks
3. Mix with established numbers
4. Ensure caller ID name is set correctly

---

## Lady Jarvis Commands

### Setup & Configuration
```
"Buy 25 numbers in area code 475"
"Enable rotation for all my numbers"
"Set max 75 calls per day for 970 numbers"
```

### Monitoring
```
"How many numbers are in rotation?"
"What's the health of my number pool?"
"Show me which numbers are near their limit"
```

### Troubleshooting
```
"Which numbers are flagged as spam?"
"Quarantine number +14755550101"
"Delete all spam-flagged numbers and buy replacements"
```

### Optimization
```
"Increase priority for my newest numbers"
"Assign 475 numbers to Solar Campaign"
"How many more numbers do I need for 3000 calls/day?"
```

---

## Quick Reference

| Task | Action |
|------|--------|
| Check pool health | LJ: "Get number health" |
| Add to rotation | Toggle `rotation_enabled` |
| Set daily limit | Update `max_daily_calls` |
| Quarantine number | Set `status: 'quarantined'` |
| View usage | Dashboard → Phone Numbers |
| Buy numbers | LJ: "Buy X numbers in area code Y" |

---

## Summary

Effective number rotation is about:

1. **Volume distribution** - Spread calls across many numbers
2. **Health monitoring** - Watch for spam flags
3. **Proactive replacement** - Swap out bad numbers quickly
4. **Capacity planning** - Always have buffer numbers ready

Let Lady Jarvis manage the complexity - just tell her what you need!
