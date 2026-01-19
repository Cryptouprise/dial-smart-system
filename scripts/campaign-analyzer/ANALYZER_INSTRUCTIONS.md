# Campaign Analyzer Agent Instructions

## Purpose
Analyze voice broadcast campaigns after completion to extract learnings and generate recommendations.

## When to Run
- After every campaign completes
- User says "analyze campaign [name]" or "how did [campaign] do"

## Analysis Process

### Step 1: Get Campaign Overview
```sql
SELECT name, status, total_leads, calls_made, calls_answered, max_attempts
FROM voice_broadcasts WHERE name = '[CAMPAIGN_NAME]';
```

### Step 2: Calculate Core Metrics
Run via Supabase MCP:
1. Status breakdown (answered, voicemail, no_answer, busy, failed)
2. AMD results (human vs machine detection)
3. DTMF presses (the money metric!)
4. Retry analysis (if max_attempts > 1)

### Step 3: Deep Analysis
1. **Time of Day**: Which hours performed best?
2. **Area Codes**: Which regions had highest answer/press rates?
3. **Duration**: Longer calls = more engaged?
4. **Errors**: What failed and why?
5. **Pacing**: Did we respect calls_per_minute?

### Step 4: Generate Report

Output format:
```
## Campaign Analysis: [NAME]

### Quick Stats
| Metric | Value | vs Baseline | Status |
|--------|-------|-------------|--------|
| Total Calls | X | - | - |
| Answer Rate | X% | 16.5% | Better/Worse |
| Press Rate | X% | 1.14% | Better/Worse |
| Cost/Press | $X | $0.40 | Better/Worse |

### What Worked
- [List positives]

### What Didn't Work
- [List issues]

### Recommendations
1. [Specific action]
2. [Specific action]
3. [Specific action]

### Update LEARNINGS.md
[Row to add to campaign history table]
```

### Step 5: Generate Corrections
Based on analysis, suggest:
- Pacing adjustments
- Time-of-day targeting
- Area code focus/exclusion
- Message changes
- Retry settings

## Key Thresholds

### Answer Rate
- < 10%: Problem - check number health
- 10-15%: Below average
- 15-20%: Good (baseline: 16.5%)
- > 20%: Great

### Press Rate
- < 0.05%: Problem - check message/IVR
- 0.05-0.1%: Industry average
- 0.1-0.5%: Good
- > 0.5%: Great (baseline: 1.14%)

### Cost Per Press
- > $10: Problem
- $5-10: Needs improvement
- $3-5: Good
- < $3: Great

### Error Rate
- > 10%: Problem - investigate immediately
- 5-10%: Needs attention
- < 5%: Acceptable

## Automatic Corrections

If analysis shows:

| Issue | Auto-Correction |
|-------|-----------------|
| Error rate > 10% | Reduce calls_per_minute by 25% |
| Answer rate < 10% | Check spam scores, consider new numbers |
| Press rate < 0.05% | Flag message for review |
| Pacing exceeded | Already fixed in v361, verify |
| No retries happening | Verify retry logic deployed |

## SQL Queries Reference

See `analyze-campaign.sql` for all queries.

Quick MCP commands:
```
-- Get campaign ID
SELECT id FROM voice_broadcasts WHERE name = '[NAME]';

-- Full analysis
-- Run each section of analyze-campaign.sql
```

## After Analysis

1. Update LEARNINGS.md with new row in campaign history
2. Update "What Works" / "What Doesn't Work" sections
3. Check off items in Daily Corrections Log
4. Note any experiments to run next
