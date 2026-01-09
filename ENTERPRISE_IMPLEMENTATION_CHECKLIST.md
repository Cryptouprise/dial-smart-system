# ✅ ENTERPRISE IMPLEMENTATION CHECKLIST
## Dial Smart System - Step-by-Step Action Plan

**Start Date:** _______________  
**Target Completion:** 2-4 weeks  
**Daily Time Commitment:** ________ hours/day

---

## 🎯 PHASE 1: CRITICAL ENTERPRISE FIXES (Week 1-2)

### Day 1-2: Testing Infrastructure Setup

#### Install Testing Frameworks
- [ ] Install Vitest: `npm install -D vitest @vitest/ui`
- [ ] Install React Testing Library: `npm install -D @testing-library/react @testing-library/jest-dom @testing-library/user-event`
- [ ] Install Playwright: `npm install -D @playwright/test`
- [ ] Create `vitest.config.ts` with React configuration
- [ ] Create `playwright.config.ts` with test settings
- [ ] Add test scripts to `package.json`:
  ```json
  "test": "vitest",
  "test:ui": "vitest --ui",
  "test:coverage": "vitest --coverage",
  "test:e2e": "playwright test"
  ```
- [ ] Create `src/test-utils.tsx` with custom render function
- [ ] Create `.github/workflows/test.yml` for CI/CD

**Estimated Time:** 4-6 hours

---

#### Write Critical Path Unit Tests

**File: `src/lib/__tests__/phoneUtils.test.ts`**
- [ ] Test phone number normalization
- [ ] Test validation for US/Canada numbers
- [ ] Test validation for international numbers
- [ ] Test formatting functions

**File: `src/services/__tests__/carrierRouter.test.ts`**
- [ ] Test carrier selection logic
- [ ] Test local presence matching
- [ ] Test capability filtering
- [ ] Test STIR/SHAKEN preference

**File: `src/hooks/__tests__/usePredictiveDialing.test.ts`**
- [ ] Test dialing ratio calculation
- [ ] Test abandonment rate monitoring
- [ ] Test pacing adjustments
- [ ] Test FCC compliance checks

**File: `src/hooks/__tests__/useLeadPrioritization.test.ts`**
- [ ] Test priority score calculation
- [ ] Test factor weighting
- [ ] Test callback boost
- [ ] Test edge cases (no data, invalid data)

**Estimated Time:** 8-12 hours

---

#### Write Integration Tests for Edge Functions

**File: `supabase/functions/__tests__/workflow-executor.test.ts`**
- [ ] Test workflow step execution
- [ ] Test deduplication logic
- [ ] Test max attempts tracking
- [ ] Test step transitions

**File: `supabase/functions/__tests__/disposition-router.test.ts`**
- [ ] Test disposition processing
- [ ] Test pipeline stage movement
- [ ] Test campaign removal triggers
- [ ] Test callback scheduling

**File: `supabase/functions/__tests__/ai-sms-processor.test.ts`**
- [ ] Test incoming SMS processing
- [ ] Test AI response generation
- [ ] Test deduplication
- [ ] Test conversation context

**Estimated Time:** 6-8 hours

---

#### Set Up CI/CD Pipeline

**File: `.github/workflows/ci.yml`**
- [ ] Add lint job (runs ESLint)
- [ ] Add test job (runs Vitest with coverage)
- [ ] Add build job (ensures build succeeds)
- [ ] Add E2E test job (runs Playwright)
- [ ] Configure to run on PR and push to main
- [ ] Set coverage threshold (70%+)
- [ ] Block merge if tests fail

**File: `.github/workflows/deploy.yml`**
- [ ] Add deployment workflow
- [ ] Run tests before deploy
- [ ] Deploy to staging first
- [ ] Run smoke tests on staging
- [ ] Deploy to production if tests pass

**Estimated Time:** 2-4 hours

**✅ CHECKPOINT:** Tests are running and coverage is 70%+

---

### Day 3-5: Multi-Tenancy Architecture

#### Create Organizations Table

**File: `supabase/migrations/[timestamp]_add_organizations.sql`**
```sql
-- Create organizations table
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  settings JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT true
);

-- Create organization_users junction table
CREATE TABLE organization_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'manager', 'agent', 'viewer')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, user_id)
);

-- Enable RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_users ENABLE ROW LEVEL SECURITY;

-- RLS Policies for organizations
CREATE POLICY "Users can view their organizations"
  ON organizations FOR SELECT
  USING (
    id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = auth.uid()
    )
  );

-- RLS Policies for organization_users
CREATE POLICY "Users can view their organization memberships"
  ON organization_users FOR SELECT
  USING (user_id = auth.uid());
```

- [ ] Create migration file
- [ ] Test migration locally
- [ ] Add indexes for performance
- [ ] Create helper functions for org context

**Estimated Time:** 2-3 hours

---

#### Add Organization ID to All Tables

**File: `supabase/migrations/[timestamp]_add_org_id_to_tables.sql`**
```sql
-- Add organization_id to all main tables
ALTER TABLE leads ADD COLUMN organization_id UUID REFERENCES organizations(id);
ALTER TABLE campaigns ADD COLUMN organization_id UUID REFERENCES organizations(id);
ALTER TABLE agents ADD COLUMN organization_id UUID REFERENCES organizations(id);
ALTER TABLE phone_numbers ADD COLUMN organization_id UUID REFERENCES organizations(id);
ALTER TABLE call_logs ADD COLUMN organization_id UUID REFERENCES organizations(id);
ALTER TABLE sms_messages ADD COLUMN organization_id UUID REFERENCES organizations(id);
ALTER TABLE campaign_workflows ADD COLUMN organization_id UUID REFERENCES organizations(id);
ALTER TABLE pipeline_stages ADD COLUMN organization_id UUID REFERENCES organizations(id);
ALTER TABLE dispositions ADD COLUMN organization_id UUID REFERENCES organizations(id);
ALTER TABLE ai_sms_settings ADD COLUMN organization_id UUID REFERENCES organizations(id);

-- Add NOT NULL constraint after backfilling data
-- ALTER TABLE leads ALTER COLUMN organization_id SET NOT NULL;
-- (Repeat for all tables)

-- Add indexes for performance
CREATE INDEX idx_leads_org_id ON leads(organization_id);
CREATE INDEX idx_campaigns_org_id ON campaigns(organization_id);
-- (Repeat for all tables)
```

Tasks:
- [ ] Create migration file
- [ ] Test migration with sample data
- [ ] Backfill existing data with default org
- [ ] Add NOT NULL constraints
- [ ] Create indexes

**Estimated Time:** 3-4 hours

---

#### Implement Row Level Security Policies

**File: `supabase/migrations/[timestamp]_add_rls_policies.sql`**

For each table, add RLS policies:
```sql
-- Enable RLS
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- SELECT policy
CREATE POLICY "Users can view their org's leads"
  ON leads FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = auth.uid()
    )
  );

-- INSERT policy
CREATE POLICY "Users can insert leads in their org"
  ON leads FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin', 'manager')
    )
  );

-- UPDATE policy
CREATE POLICY "Users can update their org's leads"
  ON leads FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin', 'manager', 'agent')
    )
  );

-- DELETE policy
CREATE POLICY "Users can delete their org's leads"
  ON leads FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );
```

- [ ] Create RLS policies for: leads
- [ ] Create RLS policies for: campaigns
- [ ] Create RLS policies for: agents
- [ ] Create RLS policies for: phone_numbers
- [ ] Create RLS policies for: call_logs
- [ ] Create RLS policies for: sms_messages
- [ ] Create RLS policies for: campaign_workflows
- [ ] Create RLS policies for: pipeline_stages
- [ ] Create RLS policies for: dispositions
- [ ] Test policies thoroughly

**Estimated Time:** 4-5 hours

---

#### Update Application Code for Multi-Tenancy

**File: `src/contexts/OrganizationContext.tsx`**
- [ ] Create OrganizationContext
- [ ] Store selected organization in context
- [ ] Provide helper functions: `useOrganization()`
- [ ] Load user's organizations on mount
- [ ] Handle organization switching

**File: `src/components/OrganizationSelector.tsx`**
- [ ] Create organization dropdown component
- [ ] Show current organization
- [ ] Allow switching between orgs
- [ ] Handle "no organization" state

**File: `src/lib/supabase.ts`**
- [ ] Update query helper functions to include org_id
- [ ] Add `withOrgFilter` helper function
- [ ] Update all queries to filter by org_id

**Update All Components:**
- [ ] Update Lead components to filter by org
- [ ] Update Campaign components to filter by org
- [ ] Update Agent components to filter by org
- [ ] Update Phone Number components to filter by org
- [ ] Update Analytics components to filter by org

**Estimated Time:** 6-8 hours

---

#### Test Multi-Tenant Data Isolation

**Create Test Organizations:**
- [ ] Create test organization A
- [ ] Create test organization B
- [ ] Create test users for each org

**Test Data Isolation:**
- [ ] Create leads in Org A
- [ ] Verify Org B cannot see Org A's leads
- [ ] Create campaigns in Org B
- [ ] Verify Org A cannot see Org B's campaigns
- [ ] Test cross-org queries (should fail)
- [ ] Test RLS policies with different roles

**Test Edge Functions:**
- [ ] Verify edge functions filter by org_id
- [ ] Test workflow-executor with multi-org data
- [ ] Test disposition-router with multi-org data
- [ ] Test ai-sms-processor with multi-org data

**Estimated Time:** 3-4 hours

**✅ CHECKPOINT:** Multi-tenancy is working and data isolation is verified

---

### Day 6: Workflow Auto-Reply Integration

#### Update AI SMS Processor

**File: `supabase/functions/ai-sms-processor/index.ts`**

Current code (around lines 86-196):
```typescript
// Current: Only checks global AI settings
const { data: aiSettings } = await supabase
  .from('ai_sms_settings')
  .select('*')
  .single();
```

Update to:
```typescript
// NEW: Check for workflow-specific settings first
const { data: workflowProgress } = await supabase
  .from('lead_workflow_progress')
  .select(`
    *,
    campaign_workflow:campaign_workflows(
      id,
      auto_reply_settings
    )
  `)
  .eq('lead_id', lead.id)
  .eq('status', 'active')
  .single();

let aiSettings;
if (workflowProgress?.campaign_workflow?.auto_reply_settings?.enabled) {
  // Use workflow-specific AI settings
  aiSettings = workflowProgress.campaign_workflow.auto_reply_settings;
  console.log('Using workflow-specific AI settings:', aiSettings);
} else {
  // Fall back to global AI settings
  const { data: globalSettings } = await supabase
    .from('ai_sms_settings')
    .select('*')
    .single();
  aiSettings = globalSettings;
  console.log('Using global AI settings');
}
```

- [ ] Update ai-sms-processor.ts with new logic
- [ ] Add logging for which settings are used
- [ ] Handle cases where no workflow exists
- [ ] Handle cases where workflow has auto_reply disabled

**Estimated Time:** 2-3 hours

---

#### Test Workflow-Specific AI Responses

**Test Case 1: Workflow with custom AI instructions**
- [ ] Create workflow with auto_reply enabled
- [ ] Set custom AI instructions (e.g., "You are a solar expert")
- [ ] Add lead to workflow
- [ ] Send test SMS from lead's number
- [ ] Verify response uses workflow instructions

**Test Case 2: Workflow with auto_reply disabled**
- [ ] Create workflow with auto_reply disabled
- [ ] Add lead to workflow
- [ ] Send test SMS from lead's number
- [ ] Verify system falls back to global settings

**Test Case 3: Lead not in any workflow**
- [ ] Send SMS from lead not in workflow
- [ ] Verify system uses global AI settings

**Estimated Time:** 1-2 hours

**✅ CHECKPOINT:** Workflow auto-reply is working correctly

---

### Day 7: Disposition Metrics & Monitoring

#### Create Disposition Metrics Table

**File: `supabase/migrations/[timestamp]_create_disposition_metrics.sql`**
```sql
CREATE TABLE disposition_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) NOT NULL,
  disposition_id UUID REFERENCES dispositions(id),
  lead_id UUID REFERENCES leads(id) NOT NULL,
  call_id UUID REFERENCES call_logs(id),
  
  -- Who set the disposition
  set_by TEXT NOT NULL CHECK (set_by IN ('ai', 'manual', 'system')),
  user_id UUID REFERENCES auth.users(id),
  
  -- AI confidence (if applicable)
  confidence_score DECIMAL(3,2),
  
  -- Timing metrics
  time_to_disposition_seconds INTEGER,
  
  -- Status transitions
  previous_status TEXT,
  new_status TEXT,
  
  -- Pipeline transitions
  previous_pipeline_stage_id UUID REFERENCES pipeline_stages(id),
  new_pipeline_stage_id UUID REFERENCES pipeline_stages(id),
  
  -- Additional context
  metadata JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_disposition_metrics_org ON disposition_metrics(organization_id);
CREATE INDEX idx_disposition_metrics_lead ON disposition_metrics(lead_id);
CREATE INDEX idx_disposition_metrics_created ON disposition_metrics(created_at);
CREATE INDEX idx_disposition_metrics_set_by ON disposition_metrics(set_by);

-- Enable RLS
ALTER TABLE disposition_metrics ENABLE ROW LEVEL SECURITY;

-- RLS Policy
CREATE POLICY "Users can view their org's metrics"
  ON disposition_metrics FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = auth.uid()
    )
  );
```

- [ ] Create migration file
- [ ] Run migration
- [ ] Test table creation
- [ ] Verify indexes

**Estimated Time:** 1-2 hours

---

#### Update Disposition Router

**File: `supabase/functions/disposition-router/index.ts`**

Add after processing disposition (around line 186):
```typescript
// Log disposition metrics
const callEndTime = callLog.ended_at ? new Date(callLog.ended_at) : new Date();
const timeToDisposition = Math.floor(
  (Date.now() - callEndTime.getTime()) / 1000
);

await supabase.from('disposition_metrics').insert({
  organization_id: lead.organization_id,
  disposition_id: disposition.id,
  lead_id: lead.id,
  call_id: callLog.id,
  set_by: isAI ? 'ai' : 'manual',
  user_id: isAI ? null : req.user?.id,
  confidence_score: isAI ? confidence : null,
  time_to_disposition_seconds: timeToDisposition,
  previous_status: lead.status,
  new_status: newStatus,
  previous_pipeline_stage_id: lead.pipeline_stage_id,
  new_pipeline_stage_id: newPipelineStageId,
  metadata: {
    disposition_name: disposition.name,
    sentiment: disposition.sentiment
  }
});
```

- [ ] Update disposition-router.ts
- [ ] Calculate time-to-disposition
- [ ] Log all transitions
- [ ] Handle errors gracefully

**Estimated Time:** 2-3 hours

---

#### Build Disposition Analytics Dashboard

**File: `src/components/DispositionAnalytics.tsx`**
- [ ] Create new component
- [ ] Fetch disposition metrics
- [ ] Display charts:
  - [ ] Dispositions over time
  - [ ] AI vs Manual breakdown
  - [ ] Average time-to-disposition
  - [ ] Pipeline stage transitions
  - [ ] AI confidence distribution
- [ ] Add filters: date range, set_by, disposition type
- [ ] Add export functionality

**File: `src/pages/Analytics.tsx`**
- [ ] Add DispositionAnalytics to analytics page
- [ ] Create new tab or section

**Estimated Time:** 3-4 hours

**✅ CHECKPOINT:** Disposition metrics are being tracked and visualized

---

### Day 8: Security & Monitoring

#### Fix Security Vulnerabilities

**Update Dependencies:**
```bash
# Backup package-lock.json
cp package-lock.json package-lock.json.backup

# Update Vite to v7 (breaking change)
npm install -D vite@^7.0.0

# Update other affected dependencies
npm install -D @vitejs/plugin-react-swc@latest lovable-tagger@latest

# Test build
npm run build

# Test dev server
npm run dev

# Run tests
npm test
```

- [ ] Back up package-lock.json
- [ ] Update Vite to v7.x
- [ ] Fix breaking changes (check Vite migration guide)
- [ ] Test build process
- [ ] Test dev server
- [ ] Run all tests
- [ ] Run npm audit (should show 0 vulnerabilities)

**Estimated Time:** 2-4 hours

---

#### Set Up Error Monitoring

**Install Sentry:**
```bash
npm install @sentry/react @sentry/tracing
```

**File: `src/lib/sentry.ts`**
```typescript
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  integrations: [
    new Sentry.BrowserTracing(),
    new Sentry.Replay()
  ],
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});

export default Sentry;
```

**File: `src/main.tsx`**
- [ ] Import Sentry
- [ ] Initialize before React app
- [ ] Wrap app in Sentry.ErrorBoundary

**File: `supabase/functions/_shared/sentry.ts`**
- [ ] Create Sentry helper for edge functions
- [ ] Wrap edge function handlers

- [ ] Sign up for Sentry account
- [ ] Get DSN key
- [ ] Add VITE_SENTRY_DSN to .env
- [ ] Initialize Sentry in frontend
- [ ] Initialize Sentry in edge functions
- [ ] Test error reporting
- [ ] Set up alerts for critical errors

**Estimated Time:** 2-3 hours

---

#### Set Up Uptime Monitoring

**Options:**
- UptimeRobot (free tier)
- Pingdom
- Better Uptime
- StatusCake

**Monitors to Create:**
- [ ] Main app URL (https://your-domain.com)
- [ ] Health check endpoint
- [ ] Critical edge functions:
  - [ ] /functions/v1/workflow-executor
  - [ ] /functions/v1/outbound-calling
  - [ ] /functions/v1/ai-sms-processor
- [ ] Database connectivity

**Alerts:**
- [ ] Email alerts for downtime
- [ ] SMS alerts for critical issues (optional)
- [ ] Slack/Discord webhook (optional)

**Estimated Time:** 1-2 hours

**✅ CHECKPOINT:** Security vulnerabilities fixed, monitoring operational

---

### Day 9-10: Documentation & Testing

#### Document Backup & Recovery

**File: `docs/BACKUP_RECOVERY.md`**
- [ ] Document Supabase backup settings
- [ ] Document point-in-time recovery process
- [ ] Create step-by-step recovery runbook
- [ ] Document RTO/RPO targets
- [ ] Create contact list for emergencies
- [ ] Document edge function deployment rollback

**Estimated Time:** 3-4 hours

---

#### Test Backup Restore

- [ ] Create test Supabase project
- [ ] Restore latest backup to test project
- [ ] Verify data integrity
- [ ] Test application against restored database
- [ ] Document any issues or gotchas
- [ ] Update runbook with learnings

**Estimated Time:** 2-3 hours

---

#### End-to-End Testing

**Create E2E Test Suite:**

**File: `tests/e2e/onboarding-flow.spec.ts`**
- [ ] Test user registration
- [ ] Test organization creation
- [ ] Test first login

**File: `tests/e2e/lead-workflow.spec.ts`**
- [ ] Test lead upload
- [ ] Test lead assignment to campaign
- [ ] Test workflow execution
- [ ] Test disposition application

**File: `tests/e2e/multi-tenant.spec.ts`**
- [ ] Test data isolation between orgs
- [ ] Test org switching
- [ ] Test role-based permissions

**Estimated Time:** 4-6 hours

**✅ CHECKPOINT:** Phase 1 Complete! System is Enterprise-ready for first client

---

## 🎯 PHASE 2: HIGH-PRIORITY IMPROVEMENTS (Week 3-4)

### Day 11: Lead Upload → Workflow Integration

**File: `src/components/LeadUpload.tsx`**

Add after successful upload:
```typescript
// Add workflow selector
const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
const [launchWorkflow, setLaunchWorkflow] = useState(false);

// After leads are imported:
if (launchWorkflow && selectedWorkflowId) {
  const { data: workflow } = await supabase
    .from('campaign_workflows')
    .select('*')
    .eq('id', selectedWorkflowId)
    .single();
  
  // Launch each imported lead into workflow
  for (const lead of importedLeads) {
    await supabase.functions.invoke('workflow-executor', {
      body: {
        action: 'start_workflow',
        workflow_id: selectedWorkflowId,
        lead_id: lead.id
      }
    });
  }
  
  toast.success(`${importedLeads.length} leads launched into workflow!`);
}
```

- [ ] Add workflow dropdown to upload form
- [ ] Add "Launch into workflow" checkbox
- [ ] Implement bulk workflow launch
- [ ] Add progress indicator
- [ ] Handle errors gracefully
- [ ] Test with various CSV files

**Estimated Time:** 4-6 hours

---

### Day 12: SMS Deduplication Enhancement

**File: `supabase/functions/workflow-executor/index.ts`**

Update deduplication logic (lines 554-573, 614-633):
```typescript
// OLD: 5-minute window
const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

// NEW: 24-hour window with conversation awareness
const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

// Check if lead has replied recently (indicates active conversation)
const { data: recentReplies } = await supabase
  .from('sms_messages')
  .select('*')
  .eq('phone_number', lead.phone)
  .eq('direction', 'inbound')
  .gte('created_at', twentyFourHoursAgo.toISOString())
  .order('created_at', { ascending: false })
  .limit(1);

if (recentReplies && recentReplies.length > 0) {
  const lastReplyTime = new Date(recentReplies[0].created_at);
  const timeSinceReply = Date.now() - lastReplyTime.getTime();
  
  // If lead replied in last 4 hours, skip automated SMS
  if (timeSinceReply < 4 * 60 * 60 * 1000) {
    console.log('Lead replied recently, skipping automated SMS to avoid spam');
    return { skipped: true, reason: 'recent_reply' };
  }
}

// Check for recent outbound SMS
const { data: recentSMS } = await supabase
  .from('sms_messages')
  .select('*')
  .eq('phone_number', lead.phone)
  .eq('direction', 'outbound')
  .gte('created_at', twentyFourHoursAgo.toISOString())
  .order('created_at', { ascending: false })
  .limit(1);

if (recentSMS && recentSMS.length > 0) {
  console.log('SMS sent to lead in last 24 hours, skipping to avoid spam');
  return { skipped: true, reason: 'recent_sms' };
}
```

- [ ] Update deduplication window to 24 hours
- [ ] Add conversation awareness logic
- [ ] Add configurable override for urgent messages
- [ ] Test with various scenarios
- [ ] Update documentation

**Estimated Time:** 2-3 hours

---

### Day 13-14: Unified Metrics Dashboard

**File: `src/pages/Dashboard.tsx`**

Create comprehensive metrics dashboard:
```typescript
// Metrics to display:
- Leads uploaded (by source, by date)
- Leads in workflows (active, completed, removed)
- Calls made (connected, voicemail, no answer)
- Dispositions set (by type, by AI vs manual)
- Pipeline movements (by stage, by automation vs manual)
- SMS sent/received (by workflow, by lead engagement)
- Cost tracking (calls, SMS, AI usage)
- ROI metrics (cost per lead, cost per appointment)
```

Components to create:
- [ ] `MetricsOverview.tsx` - High-level KPIs
- [ ] `LeadMetrics.tsx` - Lead-specific metrics
- [ ] `CallMetrics.tsx` - Call analytics
- [ ] `SMSMetrics.tsx` - SMS analytics
- [ ] `DispositionMetrics.tsx` - Disposition trends
- [ ] `PipelineMetrics.tsx` - Pipeline movement
- [ ] `CostMetrics.tsx` - Cost tracking
- [ ] `ROIMetrics.tsx` - ROI calculations

Features:
- [ ] Date range selector
- [ ] Organization filter (multi-tenant)
- [ ] Campaign filter
- [ ] Export to CSV
- [ ] Scheduled reports (email)
- [ ] Real-time updates

**Estimated Time:** 8-12 hours

---

### Day 15: Workflow Pre-Start Validation

**File: `supabase/functions/workflow-executor/index.ts`**

Enhance validation function (lines 74-123):
```typescript
async function validateWorkflowStart(workflow, lead, supabase) {
  const errors = [];
  
  // Existing validations...
  
  // NEW: Check if lead is in DNC list
  const { data: dncEntry } = await supabase
    .from('dnc_list')
    .select('*')
    .eq('phone_number', lead.phone)
    .single();
  
  if (dncEntry) {
    errors.push({
      field: 'lead',
      message: 'Lead is on Do Not Call list',
      code: 'DNC_VIOLATION',
      severity: 'critical'
    });
  }
  
  // NEW: Check phone number capabilities
  const { data: phoneNumber } = await supabase
    .from('phone_numbers')
    .select('*')
    .eq('phone_number', workflow.caller_id)
    .single();
  
  if (!phoneNumber) {
    errors.push({
      field: 'caller_id',
      message: 'Caller ID not found in phone number pool',
      code: 'CALLER_ID_MISSING',
      severity: 'critical'
    });
  } else {
    // Check capabilities for workflow steps
    const hasSMSSteps = workflow.steps.some(s => s.type === 'sms');
    if (hasSMSSteps && !phoneNumber.capabilities?.includes('sms')) {
      errors.push({
        field: 'phone_number',
        message: 'Phone number does not support SMS',
        code: 'SMS_NOT_SUPPORTED',
        severity: 'critical'
      });
    }
  }
  
  // NEW: Check for active lead blocks
  const { data: leadBlock } = await supabase
    .from('lead_blocks')
    .select('*')
    .eq('lead_id', lead.id)
    .eq('is_active', true)
    .single();
  
  if (leadBlock) {
    errors.push({
      field: 'lead',
      message: `Lead is blocked: ${leadBlock.reason}`,
      code: 'LEAD_BLOCKED',
      severity: 'high'
    });
  }
  
  return errors;
}
```

- [ ] Add DNC check
- [ ] Add phone capability check
- [ ] Add lead block check
- [ ] Return detailed validation errors
- [ ] Add error codes for each type
- [ ] Update UI to show validation errors

**Estimated Time:** 3-4 hours

---

### Day 16: Pipeline Stage Validation

**File: `supabase/functions/disposition-router/index.ts`**

Enhance stage movement logic (lines 159-186):
```typescript
// Look up pipeline stage
const { data: pipelineStage, error: stageError } = await supabase
  .from('pipeline_stages')
  .select('*')
  .eq('name', disposition.pipeline_stage)
  .eq('organization_id', lead.organization_id)
  .single();

if (stageError || !pipelineStage) {
  console.error('Pipeline stage not found:', disposition.pipeline_stage);
  
  // Option 1: Auto-create stage if configured
  if (disposition.auto_create_stage) {
    const { data: newStage } = await supabase
      .from('pipeline_stages')
      .insert({
        name: disposition.pipeline_stage,
        organization_id: lead.organization_id,
        order: 99,
        created_by: 'system'
      })
      .select()
      .single();
    
    if (newStage) {
      console.log('Auto-created pipeline stage:', newStage.name);
      pipelineStage = newStage;
    }
  } else {
    // Return error for admin to fix
    return {
      success: false,
      error: 'PIPELINE_STAGE_NOT_FOUND',
      message: `Pipeline stage "${disposition.pipeline_stage}" does not exist. Please create it in Settings > Pipeline.`,
      disposition: disposition.name,
      required_action: 'create_pipeline_stage'
    };
  }
}

// Move lead to stage
if (pipelineStage) {
  await supabase
    .from('leads')
    .update({ 
      pipeline_stage_id: pipelineStage.id,
      updated_at: new Date().toISOString()
    })
    .eq('id', lead.id);
  
  console.log(`Moved lead to pipeline stage: ${pipelineStage.name}`);
}
```

- [ ] Add stage lookup with error handling
- [ ] Add auto-create option
- [ ] Return actionable errors
- [ ] Add validation in disposition creation UI
- [ ] Test stage movement thoroughly

**Estimated Time:** 2-3 hours

**✅ CHECKPOINT:** Phase 2 Complete! System is polished and ready for scale

---

## 🎯 PHASE 3: NICE-TO-HAVE FEATURES (Week 5-8+)

### Bundle Size Optimization

**File: `vite.config.ts`**
```typescript
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-ui': ['@radix-ui/*', 'lucide-react'],
          'vendor-data': ['@tanstack/react-query', '@supabase/supabase-js'],
          'vendor-charts': ['recharts'],
        }
      }
    },
    chunkSizeWarningLimit: 600
  }
});
```

- [ ] Implement route-based code splitting
- [ ] Add React.lazy for heavy components
- [ ] Configure manual chunks
- [ ] Test bundle sizes
- [ ] Target: <800KB main bundle

**Estimated Time:** 6-8 hours

---

### Structured Logging

**Install Winston or Pino:**
```bash
npm install winston
```

**File: `src/lib/logger.ts`**
```typescript
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

export default logger;
```

- [ ] Replace console.log with logger.info
- [ ] Replace console.error with logger.error
- [ ] Add context to log messages
- [ ] Configure log levels by environment

**Estimated Time:** 8-12 hours (608 console.log statements to replace)

---

### Type Safety Improvements

- [ ] Replace 'any' types with proper interfaces
- [ ] Add strict null checks
- [ ] Improve type inference
- [ ] Add JSDoc comments for complex types

**Estimated Time:** 12-16 hours

---

## ✅ FINAL CHECKLIST

### Pre-Launch Checklist
- [ ] All Phase 1 tasks completed
- [ ] Test coverage ≥ 70%
- [ ] Multi-tenant data isolation verified
- [ ] Security vulnerabilities fixed (npm audit clean)
- [ ] Error monitoring operational
- [ ] Backup/recovery documented and tested
- [ ] Build succeeds without errors
- [ ] ESLint passes with no errors
- [ ] Load testing completed
- [ ] Documentation up to date

### Launch Day Checklist
- [ ] Create first client organization
- [ ] Import initial test leads
- [ ] Set up test campaign
- [ ] Execute test workflow
- [ ] Monitor error rates
- [ ] Monitor performance metrics
- [ ] Verify billing/usage tracking

### Post-Launch Checklist
- [ ] Daily monitoring for first week
- [ ] Weekly check-ins with first client
- [ ] Collect feedback and prioritize improvements
- [ ] Begin Phase 2 if not completed

---

## 📊 TRACKING PROGRESS

### Daily Standup Questions
1. What did I complete yesterday?
2. What am I working on today?
3. What blockers do I have?
4. Am I on track with the timeline?

### Weekly Review Questions
1. How many Phase 1 tasks completed?
2. What took longer than estimated?
3. What went faster than estimated?
4. Do I need to adjust the timeline?
5. What help do I need?

---

## 🎯 SUCCESS METRICS

Track these metrics to measure progress:

- [ ] Test coverage: ____%
- [ ] Build time: ____ seconds
- [ ] Bundle size: ____ KB
- [ ] API response time (p95): ____ ms
- [ ] Error rate: ____%
- [ ] Security vulnerabilities: ____
- [ ] npm audit issues: ____
- [ ] Multi-tenant tests passing: ____/%
- [ ] E2E tests passing: ____/%

---

## 📞 SUPPORT & ESCALATION

### Getting Stuck?
1. Check existing documentation
2. Review similar code in the codebase
3. Ask in developer community (Discord, forums)
4. Create GitHub issue with reproduction steps
5. Hire contractor for specific task

### Time Management
- Use Pomodoro technique (25min work, 5min break)
- Block calendar for deep work
- Set realistic daily goals
- Celebrate small wins

---

**Good luck! You got this! 🚀**

Remember: The system is already 85-90% done. You're just adding the finishing touches to make it Enterprise-grade.
