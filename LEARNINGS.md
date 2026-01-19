# Voice Broadcast Learnings

This file is automatically updated after each campaign to track what works, what doesn't, and continuously improve performance.

## Current Best Settings

```yaml
calls_per_minute: 50
max_attempts: 3
retry_delay_minutes: 60
enable_amd: true
voicemail_action: play_message
best_calling_hours: TBD (need more data)
best_area_codes: TBD (need more data)
```

## Campaign History

| Date | Campaign | Calls | Answered | Presses | Press Rate | Cost | Cost/Press | Key Learning |
|------|----------|-------|----------|---------|------------|------|------------|--------------|
| 1/17 | Chase 1.15 | 176 | 29 (16.5%) | 2 | 1.14% | ~$0.80 | $0.40 | Baseline test, AMD working, no retries |
| 1/18 | Test 1.18 | TBD | TBD | TBD | TBD | TBD | TBD | First scaled test with retry logic |

## Key Metrics to Track

### Primary (Revenue Impact)
- **Press Rate**: % of calls that result in DTMF press (target: >0.5%)
- **Cost Per Press**: Total spend / presses (target: <$5)
- **Answer Rate**: % of calls answered by human (baseline: 16.5%)

### Secondary (Optimization)
- **Voicemail Rate**: % hitting voicemail (baseline: 81%)
- **Callback Rate**: % of voicemails that call back
- **Retry Conversion**: % of no_answer/busy that convert on retry
- **Time-of-Day Performance**: Which hours get best press rates
- **Area Code Performance**: Which regions perform best

### Health Metrics
- **Spam Flag Rate**: % of numbers getting flagged
- **Error Rate**: % of calls failing
- **Concurrent Utilization**: Are we hitting limits?

## What Works

### Confirmed
- AMD (Answering Machine Detection) - 81% accuracy identifying voicemail
- DTMF capture - Working correctly
- Phone rotation - 13 numbers distributing calls evenly
- Call pacing fix - Now respects calls_per_minute setting

### Hypothesis (Need More Data)
- Retry logic should recover 20-30% of no_answer/busy
- Morning calls (9-11am) may have higher answer rates
- Local presence matching may improve answer rates

## What Doesn't Work

### Confirmed
- Single attempt campaigns - Lose 23% potential contacts (no_answer/busy/failed)
- max_attempts=1 - No retry means no second chances

### Hypothesis (Need More Data)
- Late evening calls (after 7pm) may have lower engagement
- Certain area codes may have higher spam block rates

## Experiments to Run

### Next Up
1. **Retry Impact Test**: Compare max_attempts=1 vs max_attempts=3
2. **Time of Day Test**: Morning (9-12) vs Afternoon (1-5) vs Evening (5-8)
3. **Message Length Test**: Short (15s) vs Medium (30s) vs Long (45s)

### Future
4. **Local Presence Test**: Match caller ID area code to lead area code
5. **Day of Week Test**: Weekday vs Weekend performance
6. **Script Variation Test**: Different opening hooks

## Daily Corrections Log

### January 18, 2026
- [ ] Retry logic deployed
- [ ] Test campaign launched
- [ ] Results analyzed
- [ ] Learnings documented

### January 17, 2026
- [x] Call pacing fix deployed (v361)
- [x] Analyzed Chase 1.15 campaign
- [x] Identified retry logic gap
- [x] Wrote retry logic fix (pending deploy)
- [x] Documented baseline metrics

## Performance Benchmarks

### Industry Standard (Voice Broadcast)
| Metric | Low | Average | Good | Great |
|--------|-----|---------|------|-------|
| Answer Rate | 5% | 12% | 18% | 25%+ |
| Press Rate | 0.03% | 0.07% | 0.15% | 0.5%+ |
| Voicemail Callback | 1% | 3% | 5% | 10%+ |
| Cost/Press | $10+ | $6-7 | $4-5 | <$3 |

### Our Current Performance
| Metric | Value | vs Industry |
|--------|-------|-------------|
| Answer Rate | 16.5% | Good |
| Press Rate | 1.14% | Great (need to validate at scale) |
| Voicemail Callback | TBD | - |
| Cost/Press | $0.40 | Great (small sample) |

## Phone Number Health

| Number | Daily Calls | Spam Score | Status | Notes |
|--------|-------------|------------|--------|-------|
| Track after each campaign... | | | | |

## Scaling Milestones

- [ ] 1K calls/day - Baseline validated
- [ ] 5K calls/day - First scale test
- [ ] 10K calls/day - Tier 1 achieved
- [ ] 25K calls/day - Tier 2 achieved
- [ ] 50K calls/day - Tier 3 achieved

---

*Last Updated: January 17, 2026*
*Next Review: After Test 1.18 campaign*
