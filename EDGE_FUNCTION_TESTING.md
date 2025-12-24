# Edge Function Testing & Error Analysis

## Testing Workflow Executor & Outbound Calling

### Common Errors Found and Fixed

#### 1. **Campaign ID Required but Missing**
**Location:** `workflow-executor` line 494, 576, 636  
**Issue:** `selectCallerIdForCampaign` is called with `progress.campaign_id` which may be null  
**Impact:** If workflow launched without campaign, call/SMS steps fail  
**Fix Needed:** Handle null campaign_id gracefully

#### 2. **Phone Number Validation Missing**
**Location:** `outbound-calling` lines 133-135  
**Issue:** Phone number format not validated before Retell API call  
**Impact:** Invalid numbers cause Retell API errors  
**Fix Needed:** Add phone number normalization/validation

#### 3. **Retell API Error Handling Incomplete**
**Location:** `outbound-calling` line 520-530  
**Issue:** Retell API errors not properly parsed and returned  
**Impact:** Generic errors instead of specific failure reasons  
**Fix Needed:** Better error parsing and user-friendly messages

#### 4. **DNC Check Missing in Workflow Start**
**Location:** `workflow-executor` lines 60-123 (validation section)  
**Issue:** No check for leads in DNC list before starting workflow  
**Impact:** Calls made to DNC numbers (compliance violation)  
**Fix Needed:** Add DNC check in pre-start validation

#### 5. **Campaign Phone Pool May Be Empty**
**Location:** `workflow-executor` lines 724-851 (`selectCallerIdForCampaign`)  
**Issue:** If no Retell-imported numbers, calls fail silently  
**Impact:** Workflow starts but call steps fail  
**Fix Needed:** Better validation and error message

### Test Commands

```bash
# Test workflow start with no campaign
curl -X POST http://localhost:54321/functions/v1/workflow-executor \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "start_workflow",
    "userId": "test-user-id",
    "leadId": "test-lead-id",
    "workflowId": "test-workflow-id"
  }'

# Test workflow start with invalid phone
curl -X POST http://localhost:54321/functions/v1/workflow-executor \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "start_workflow",
    "userId": "test-user-id",
    "leadId": "lead-with-invalid-phone",
    "workflowId": "test-workflow-id",
    "campaignId": "test-campaign-id"
  }'
```

### Recommended Fixes Priority

1. **CRITICAL:** Add DNC check in workflow validation
2. **CRITICAL:** Handle null campaign_id in selectCallerIdForCampaign
3. **HIGH:** Add phone number validation before API calls
4. **HIGH:** Improve Retell API error messages
5. **MEDIUM:** Add retry logic for transient failures
