# Error Handling & Robustness Audit

## Current Error Handling Status

### ✅ Good Error Handling Found

#### 1. **workflow-executor** (57 error references)
- ✅ Top-level try-catch wraps all actions
- ✅ Step-level error handling (doesn't fail entire workflow)
- ✅ Returns structured errors: `{ success: false, error: message }`
- ✅ Logs errors with context: `[Workflow] Call step error:`
- ⚠️ **IMPROVEMENT NEEDED:** Some errors only log, don't update database status

#### 2. **outbound-calling** (37 error references)
- ✅ Phone validation with clear error messages
- ✅ Retell API error parsing
- ✅ Fallback to database when Retell API fails
- ✅ Updates call_logs.status to 'failed' on errors
- ⚠️ **IMPROVEMENT NEEDED:** Should retry transient Retell errors

#### 3. **ai-sms-processor** (39 error references)
- ✅ Comprehensive error handling for AI generation
- ✅ Twilio error handling
- ✅ Graceful degradation when features unavailable
- ⚠️ **IMPROVEMENT NEEDED:** Should log failed SMS attempts to database

### ⚠️ Weak Error Handling Found

#### 1. **disposition-router** (9 error references)
- ⚠️ Single top-level try-catch only
- ⚠️ Errors in executeAction() can fail silently
- ⚠️ No retry logic for failed actions
- ⚠️ Doesn't track which actions succeeded/failed

#### 2. **analyze-call-transcript** (19 error references)
- ⚠️ If AI analysis fails, entire function fails
- ⚠️ No fallback disposition
- ⚠️ Doesn't handle malformed AI responses well

#### 3. **automation-scheduler** (20 error references)
- ⚠️ Failures in one rule don't stop others (good)
- ⚠️ But errors aren't tracked in database
- ⚠️ No alerting when automation consistently fails

---

## Critical Improvements Needed

### 1. **Database Error Logging**

**Problem:** Errors logged to console but not persisted  
**Impact:** Can't track recurring issues, no alerting

**Solution:** Create `edge_function_errors` table

```sql
CREATE TABLE edge_function_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name text NOT NULL,
  action text,
  user_id uuid,
  lead_id uuid,
  campaign_id uuid,
  workflow_id uuid,
  error_message text NOT NULL,
  error_stack text,
  request_payload jsonb,
  severity text CHECK (severity IN ('error', 'warning', 'critical')),
  resolved boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_errors_function ON edge_function_errors(function_name, created_at DESC);
CREATE INDEX idx_errors_unresolved ON edge_function_errors(resolved, severity) WHERE resolved = false;
```

### 2. **Retry Logic for Transient Failures**

**Problem:** Network errors, rate limits fail immediately  
**Impact:** Workflows fail for temporary issues

**Solution:** Implement exponential backoff retry

```typescript
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      const isLastAttempt = attempt === maxRetries - 1;
      const isRetryable = error.message?.includes('rate limit') ||
                         error.message?.includes('timeout') ||
                         error.message?.includes('network');
      
      if (isLastAttempt || !isRetryable) {
        throw error;
      }
      
      const delay = baseDelay * Math.pow(2, attempt);
      console.log(`[Retry] Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Max retries exceeded');
}
```

### 3. **Workflow Step Failure Handling**

**Problem:** Failed step stops entire workflow  
**Impact:** One error prevents all subsequent steps

**Solution:** Add failure strategies

```typescript
// In workflow_steps table, add:
failure_strategy: 'stop' | 'skip' | 'retry' | 'continue'
max_retries: number
retry_delay_minutes: number

// In executeStep():
if (stepResult.success === false) {
  const strategy = step.failure_strategy || 'stop';
  
  switch (strategy) {
    case 'skip':
      await moveToNextStep(supabase, progress, step);
      return { ...stepResult, action: 'step_skipped_on_error' };
    
    case 'retry':
      const retryCount = step.retry_count || 0;
      if (retryCount < (step.max_retries || 3)) {
        await supabase
          .from('lead_workflow_progress')
          .update({ 
            next_action_at: calculateRetryTime(step),
            retry_count: retryCount + 1
          })
          .eq('id', progress.id);
        return { ...stepResult, action: 'scheduled_retry' };
      }
      break;
    
    case 'continue':
      await moveToNextStep(supabase, progress, step);
      return { ...stepResult, action: 'continued_despite_error' };
    
    case 'stop':
    default:
      await supabase
        .from('lead_workflow_progress')
        .update({ 
          status: 'failed',
          failure_reason: stepResult.error
        })
        .eq('id', progress.id);
      return stepResult;
  }
}
```

### 4. **Graceful Degradation for AI Failures**

**Problem:** If AI analysis fails, call data is lost  
**Impact:** Can't track outcomes

**Solution:** Fallback dispositions

```typescript
// In analyze-call-transcript:
try {
  const aiAnalysis = await analyzeWithAI(transcript);
  // ... process normally
} catch (aiError) {
  console.error('[Analyze Transcript] AI analysis failed:', aiError);
  
  // Fallback: Set generic disposition based on call duration
  const fallbackAnalysis = {
    disposition: callDuration > 30 ? 'Connected - Manual Review Needed' : 'No Answer',
    confidence: 0.3,
    reasoning: 'AI analysis failed, auto-classified by duration',
    key_points: ['AI analysis unavailable'],
    sentiment: 'neutral',
    ai_analysis_failed: true
  };
  
  await supabaseAdmin
    .from('call_logs')
    .update({
      ai_analysis: fallbackAnalysis,
      auto_disposition: fallbackAnalysis.disposition,
      confidence_score: fallbackAnalysis.confidence,
      ai_analysis_error: aiError.message
    })
    .eq('id', callId);
}
```

### 5. **Circuit Breaker for External APIs**

**Problem:** If Retell/Twilio down, all calls fail  
**Impact:** Cascading failures

**Solution:** Circuit breaker pattern

```typescript
class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  
  constructor(
    private threshold: number = 5,
    private timeout: number = 60000 // 1 minute
  ) {}
  
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker open - service unavailable');
      }
    }
    
    try {
      const result = await fn();
      if (this.state === 'half-open') {
        this.state = 'closed';
        this.failures = 0;
      }
      return result;
    } catch (error) {
      this.failures++;
      this.lastFailureTime = Date.now();
      
      if (this.failures >= this.threshold) {
        this.state = 'open';
        console.error('[Circuit Breaker] OPENED - too many failures');
      }
      throw error;
    }
  }
}

const retellCircuitBreaker = new CircuitBreaker(5, 60000);
```

### 6. **Disposition Auto-Action Error Tracking**

**Problem:** executeAction() failures are silent  
**Impact:** Actions fail without notice

**Solution:** Track action results

```typescript
// In disposition-router executeAction():
async function executeAction(supabase: any, leadId: string, userId: string, autoAction: any) {
  const startTime = Date.now();
  let success = true;
  let errorMessage = null;
  
  try {
    switch (autoAction.action_type) {
      // ... existing cases
    }
  } catch (error: any) {
    success = false;
    errorMessage = error.message;
    console.error(`[Disposition Router] Action ${autoAction.action_type} failed:`, error);
  }
  
  // Track action execution
  await supabase.from('disposition_action_executions').insert({
    user_id: userId,
    lead_id: leadId,
    action_id: autoAction.id,
    action_type: autoAction.action_type,
    success,
    error_message: errorMessage,
    execution_time_ms: Date.now() - startTime,
    executed_at: new Date().toISOString()
  });
  
  return { success, error: errorMessage };
}
```

---

## Smoothness Improvements

### 1. **Workflow Step Status Tracking**

Add `step_status` to `lead_workflow_progress`:
- `pending` - Not started yet
- `executing` - Currently running
- `completed` - Successfully finished
- `failed` - Error occurred
- `skipped` - Skipped due to condition
- `retrying` - Scheduled for retry

### 2. **Health Check Endpoints**

```typescript
// Add to automation-scheduler:
if (action === 'health_check') {
  const health = {
    workflow_executor: await checkWorkflowHealth(),
    retell_api: await checkRetellHealth(),
    twilio_api: await checkTwilioHealth(),
    database: await checkDatabaseHealth(),
    last_successful_run: await getLastSuccessfulRun()
  };
  
  return new Response(JSON.stringify(health), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
```

### 3. **Rate Limiting Protection**

```typescript
// Add rate limit tracking
const rateLimiters = new Map<string, { count: number, resetAt: number }>();

function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const limiter = rateLimiters.get(key);
  
  if (!limiter || now > limiter.resetAt) {
    rateLimiters.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  
  if (limiter.count >= maxRequests) {
    console.warn(`[Rate Limit] ${key} exceeded ${maxRequests} requests`);
    return false;
  }
  
  limiter.count++;
  return true;
}
```

### 4. **Idempotency Keys**

```typescript
// For critical operations, add idempotency
async function createCallWithIdempotency(
  supabase: any,
  callData: any,
  idempotencyKey: string
) {
  // Check if already processed
  const { data: existing } = await supabase
    .from('call_logs')
    .select('id, retell_call_id')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();
  
  if (existing) {
    console.log('[Idempotency] Call already created:', existing.id);
    return existing;
  }
  
  // Create with idempotency key
  const { data, error } = await supabase
    .from('call_logs')
    .insert({ ...callData, idempotency_key: idempotencyKey })
    .select()
    .maybeSingle();
  
  return data;
}
```

---

## Autonomy Improvements

### 1. **Self-Healing Workflows**

```typescript
// Add to automation-scheduler:
async function healFailedWorkflows(supabase: any) {
  // Find workflows stuck in 'executing' status for >15 minutes
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  
  const { data: stuckWorkflows } = await supabase
    .from('lead_workflow_progress')
    .select('*')
    .eq('step_status', 'executing')
    .lt('updated_at', fifteenMinutesAgo);
  
  for (const workflow of stuckWorkflows || []) {
    console.log(`[Self-Heal] Resetting stuck workflow ${workflow.id}`);
    
    await supabase
      .from('lead_workflow_progress')
      .update({
        step_status: 'pending',
        next_action_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', workflow.id);
  }
}
```

### 2. **Automatic Error Recovery**

```typescript
// Detect patterns and auto-fix
async function detectAndFixIssues(supabase: any, userId: string) {
  // Check for common issues
  const issues = [];
  
  // Issue 1: No Retell phone numbers
  const { data: retellPhones } = await supabase
    .from('phone_numbers')
    .select('id')
    .eq('user_id', userId)
    .not('retell_phone_id', 'is', null)
    .limit(1);
  
  if (!retellPhones || retellPhones.length === 0) {
    issues.push({
      type: 'no_retell_phones',
      severity: 'critical',
      message: 'No Retell-imported phone numbers. Calls will fail.',
      fix: 'Import at least one phone number to Retell'
    });
  }
  
  // Issue 2: No active agent
  const { data: agents } = await supabase
    .from('campaigns')
    .select('agent_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .not('agent_id', 'is', null)
    .limit(1);
  
  if (!agents || agents.length === 0) {
    issues.push({
      type: 'no_active_agent',
      severity: 'critical',
      message: 'No active campaigns with AI agent configured',
      fix: 'Configure agent_id in at least one active campaign'
    });
  }
  
  return issues;
}
```

### 3. **Smart Retry Scheduling**

Instead of fixed retry delays, use intelligent scheduling:
- Failed during business hours → retry in 1 hour
- Failed after hours → retry next morning 9am
- Failed due to rate limit → retry after reset time
- Failed 3+ times → escalate to manual review

---

## Implementation Priority

### Immediate (Critical for Campaign Launch)
1. ✅ Add retry logic to Retell API calls (outbound-calling)
2. ✅ Add error logging to database (edge_function_errors table)
3. ✅ Implement fallback disposition in analyze-call-transcript
4. ✅ Add failure tracking to disposition auto-actions

### High Priority (Smooth Operation)
5. Add workflow step failure strategies
6. Implement circuit breaker for external APIs
7. Add health check endpoints
8. Create self-healing for stuck workflows

### Medium Priority (Long-term Robustness)
9. Add rate limiting protection
10. Implement idempotency keys
11. Add automatic error recovery
12. Create error monitoring dashboard

---

## Testing Recommendations

### Error Scenario Tests

1. **Retell API Down**
   - Test: Mock Retell 503 error
   - Expected: Retry 3 times, then fail gracefully with error logged

2. **Invalid Phone Number**
   - Test: Start workflow with lead that has invalid phone
   - Expected: Pre-start validation blocks, clear error message

3. **AI Analysis Fails**
   - Test: Mock AI API timeout
   - Expected: Fallback disposition set, call still tracked

4. **Disposition Action Fails**
   - Test: start_workflow action with invalid workflow_id
   - Expected: Other actions still execute, failure tracked

5. **Concurrent Workflow Starts**
   - Test: Start same workflow twice for same lead
   - Expected: Deduplication prevents double-start

---

## Summary

**Current State:**
- Good error handling in workflow-executor, outbound-calling
- Weak error handling in disposition-router, analyze-call-transcript
- No persistent error logging
- No retry logic for transient failures

**After Improvements:**
- Comprehensive error logging to database
- Retry logic with exponential backoff
- Circuit breakers for external APIs
- Graceful degradation with fallbacks
- Self-healing for stuck workflows
- Health monitoring endpoints

**Result: Production-ready error handling that prevents campaign disruptions**
