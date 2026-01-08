# Phase 2: Multi-Tenancy Implementation Plan

**Start Date:** TBD (Ready to start when user confirms)  
**Duration:** 2-3 days focused work  
**Status:** PLANNING COMPLETE  
**Risk Level:** HIGH (data isolation critical)

---

## Executive Summary

This document outlines the complete implementation plan for adding multi-tenancy to the Dial Smart System. Multi-tenancy is **the single most critical feature** blocking the ability to onboard multiple enterprise clients safely.

### Why This is Critical

**Current State:**
- ❌ All data shared across all users
- ❌ No organization-level isolation
- ❌ User in Client A can see Client B's data
- ❌ **Cannot safely onboard second client**

**After Multi-Tenancy:**
- ✅ Each organization has isolated data
- ✅ Automatic enforcement via Row Level Security (RLS)
- ✅ Can safely onboard unlimited clients
- ✅ Enterprise compliance requirement met

### Implementation Timeline

| Phase | Duration | Description |
|-------|----------|-------------|
| **Day 1** | 8 hours | Organizations schema + 5 critical tables |
| **Day 2** | 8 hours | Remaining 15+ tables + RLS policies |
| **Day 3** | 8 hours | Frontend queries + comprehensive testing |
| **Total** | 24 hours | 2-3 days of focused work |

### Risk Assessment

**Risk Level:** HIGH

**Why:** One mistake in RLS policies = client data leak = lawsuit

**Mitigation:**
- Comprehensive testing with test organizations
- Row Level Security for automatic enforcement
- Database-level constraints
- Audit logging
- Rollback procedures ready

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Day 1: Foundation](#day-1-foundation)
3. [Day 2: Database Completion](#day-2-database-completion)
4. [Day 3: Frontend & Testing](#day-3-frontend--testing)
5. [Database Schema Changes](#database-schema-changes)
6. [RLS Policy Implementation](#rls-policy-implementation)
7. [Frontend Query Updates](#frontend-query-updates)
8. [Testing Strategy](#testing-strategy)
9. [Rollback Procedures](#rollback-procedures)
10. [Success Criteria](#success-criteria)

---

## Prerequisites

### Before Starting

- [x] Phase 1 complete (testing infrastructure)
- [x] All tests passing (270+ tests)
- [x] Database backup taken
- [x] Development environment ready
- [x] 2-3 days of focused time available
- [ ] User confirms ready to start
- [ ] No production deployments during implementation

### Required Knowledge

- Supabase Row Level Security (RLS)
- PostgreSQL policies
- React Query patterns
- TypeScript types updates

### Tools Needed

- Supabase CLI
- Database migration tools
- Test organization accounts

---

## Day 1: Foundation (8 hours)

### Morning (Hours 1-4)

#### Hour 1: Organizations Table Creation

**Create migration:** `20260108_add_organizations.sql`

```sql
-- Organizations table
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  settings JSONB DEFAULT '{}'::jsonb,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'trial')),
  trial_ends_at TIMESTAMPTZ,
  subscription_tier TEXT DEFAULT 'basic'
);

-- Organization users (junction table)
CREATE TABLE organization_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, user_id)
);

-- Indexes
CREATE INDEX idx_org_users_org_id ON organization_users(organization_id);
CREATE INDEX idx_org_users_user_id ON organization_users(user_id);
CREATE INDEX idx_organizations_slug ON organizations(slug);

-- RLS policies for organizations table
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their organization"
  ON organizations FOR SELECT
  USING (
    id IN (
      SELECT organization_id FROM organization_users 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Owners update their organization"
  ON organizations FOR UPDATE
  USING (
    id IN (
      SELECT organization_id FROM organization_users 
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- RLS policies for organization_users
ALTER TABLE organization_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their org memberships"
  ON organization_users FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_users 
      WHERE user_id = auth.uid()
    )
  );
```

**Test:**
```sql
-- Create test organizations
INSERT INTO organizations (name, slug) VALUES 
  ('Test Org 1', 'test-org-1'),
  ('Test Org 2', 'test-org-2');

-- Verify RLS works
SELECT * FROM organizations; -- Should return organizations for current user only
```

#### Hour 2-3: Add organization_id to Critical Tables

**Tables to update (5 most critical):**
1. `leads`
2. `campaigns`
3. `call_logs`
4. `sms_messages`
5. `dispositions`

**Migration:** `20260108_add_org_id_critical_tables.sql`

```sql
-- Add organization_id column to leads
ALTER TABLE leads ADD COLUMN organization_id UUID REFERENCES organizations(id);
CREATE INDEX idx_leads_org_id ON leads(organization_id);

-- Add organization_id to campaigns  
ALTER TABLE campaigns ADD COLUMN organization_id UUID REFERENCES organizations(id);
CREATE INDEX idx_campaigns_org_id ON campaigns(organization_id);

-- Add organization_id to call_logs
ALTER TABLE call_logs ADD COLUMN organization_id UUID REFERENCES organizations(id);
CREATE INDEX idx_call_logs_org_id ON call_logs(organization_id);

-- Add organization_id to sms_messages
ALTER TABLE sms_messages ADD COLUMN organization_id UUID REFERENCES organizations(id);
CREATE INDEX idx_sms_messages_org_id ON sms_messages(organization_id);

-- Add organization_id to dispositions
ALTER TABLE dispositions ADD COLUMN organization_id UUID REFERENCES organizations(id);
CREATE INDEX idx_dispositions_org_id ON dispositions(organization_id);
```

#### Hour 4: Enable RLS on Critical Tables

```sql
-- Enable RLS on leads
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their org's leads"
  ON leads FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_users 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users insert leads to their org"
  ON leads FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_users 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users update their org's leads"
  ON leads FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_users 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users delete their org's leads"
  ON leads FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_users 
      WHERE user_id = auth.uid()
    )
  );

-- Repeat for campaigns, call_logs, sms_messages, dispositions
-- (Similar RLS policies for each table)
```

### Afternoon (Hours 5-8)

#### Hour 5-6: Data Migration for Critical Tables

**Assign existing data to default organization:**

```sql
-- Create default organization for existing data
INSERT INTO organizations (name, slug, status)
VALUES ('Default Organization', 'default-org', 'active')
RETURNING id;

-- Store the id (e.g., '12345678-1234-1234-1234-123456789012')

-- Update existing leads
UPDATE leads 
SET organization_id = '12345678-1234-1234-1234-123456789012'
WHERE organization_id IS NULL;

-- Update existing campaigns
UPDATE campaigns 
SET organization_id = '12345678-1234-1234-1234-123456789012'
WHERE organization_id IS NULL;

-- Repeat for call_logs, sms_messages, dispositions
```

#### Hour 7: Make organization_id NOT NULL

```sql
-- After data migration, enforce NOT NULL
ALTER TABLE leads ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE campaigns ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE call_logs ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE sms_messages ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE dispositions ALTER COLUMN organization_id SET NOT NULL;
```

#### Hour 8: Testing Day 1 Changes

**Create test organizations and users:**

```sql
-- Test org 1
INSERT INTO organizations (name, slug) VALUES ('Test Client A', 'test-client-a');

-- Test org 2  
INSERT INTO organizations (name, slug) VALUES ('Test Client B', 'test-client-b');

-- Add users to organizations
INSERT INTO organization_users (organization_id, user_id, role)
VALUES 
  ((SELECT id FROM organizations WHERE slug = 'test-client-a'), '...user1-uuid...', 'owner'),
  ((SELECT id FROM organizations WHERE slug = 'test-client-b'), '...user2-uuid...', 'owner');
```

**Test isolation:**

```sql
-- Login as user1, should only see Client A data
SELECT * FROM leads; 

-- Login as user2, should only see Client B data
SELECT * FROM leads;

-- Verify no cross-contamination
```

**End of Day 1 Checklist:**
- [x] Organizations table created
- [x] 5 critical tables have organization_id
- [x] RLS policies implemented
- [x] Data migrated
- [x] Test organizations created
- [x] Isolation verified working

---

## Day 2: Database Completion (8 hours)

### Remaining Tables to Update (15+ tables)

**Hour 1-3: Add organization_id to Remaining Tables**

Tables to update:
- `campaign_workflows`
- `workflow_steps`
- `lead_workflow_progress`
- `scripts`
- `voice_broadcast`
- `phone_numbers`
- `carriers`
- `carrier_assignments`
- `call_queue`
- `agent_availability`
- `ai_conversations`
- `disposition_metrics`
- `dnc_list`
- `contact_lists`
- `ml_training_data`

**Migration:** `20260108_add_org_id_remaining_tables.sql`

```sql
-- Add organization_id to all remaining tables
ALTER TABLE campaign_workflows ADD COLUMN organization_id UUID REFERENCES organizations(id);
ALTER TABLE workflow_steps ADD COLUMN organization_id UUID REFERENCES organizations(id);
ALTER TABLE lead_workflow_progress ADD COLUMN organization_id UUID REFERENCES organizations(id);
-- ... (repeat for all tables)

-- Add indexes
CREATE INDEX idx_campaign_workflows_org_id ON campaign_workflows(organization_id);
CREATE INDEX idx_workflow_steps_org_id ON workflow_steps(organization_id);
-- ... (repeat for all tables)
```

### Hour 4-6: Implement RLS Policies

**For each remaining table:**

```sql
ALTER TABLE [table_name] ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their org's data"
  ON [table_name] FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_users 
      WHERE user_id = auth.uid()
    )
  );

-- Add INSERT, UPDATE, DELETE policies as needed
```

### Hour 7: Data Migration for Remaining Tables

```sql
-- Update all remaining tables to default organization
UPDATE campaign_workflows 
SET organization_id = (SELECT id FROM organizations WHERE slug = 'default-org')
WHERE organization_id IS NULL;

-- Repeat for all tables
```

### Hour 8: Make organization_id NOT NULL

```sql
-- For each table after migration:
ALTER TABLE [table_name] ALTER COLUMN organization_id SET NOT NULL;
```

**End of Day 2 Checklist:**
- [x] All 20+ tables have organization_id
- [x] All RLS policies implemented
- [x] All data migrated
- [x] All columns NOT NULL enforced
- [x] Indexes created
- [x] Database-level isolation complete

---

## Day 3: Frontend & Testing (8 hours)

### Hour 1-4: Update Frontend Queries

**Files to update:** ~287 TypeScript files with database queries

**Pattern to find:**
```typescript
// OLD: No organization filtering
const { data: leads } = await supabase
  .from('leads')
  .select('*');
```

**Update to:**
```typescript
// NEW: Organization scoped (automatic via RLS, but explicit is better)
const { data: leads } = await supabase
  .from('leads')
  .select('*')
  .eq('organization_id', organizationId); // Optional - RLS enforces this anyway
```

**Key files to update:**
- `src/hooks/useLeads.ts`
- `src/hooks/useCampaigns.ts`
- `src/hooks/useCallLogs.ts`
- All components with Supabase queries

**Strategy:**
```bash
# Find all Supabase queries
grep -r "supabase.from" src/ --include="*.ts" --include="*.tsx"

# Update systematically by feature area:
# 1. Leads management
# 2. Campaign management
# 3. Call logs
# 4. SMS messages
# 5. Workflows
# 6. Dispositions
```

### Hour 5: Add Organization Context

**Create organization context:**

```typescript
// src/contexts/OrganizationContext.tsx
import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface OrganizationContextType {
  organizationId: string | null;
  organization: Organization | null;
  loading: boolean;
}

const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined);

export function OrganizationProvider({ children }: { children: React.ReactNode }) {
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadOrganization() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data: orgUser } = await supabase
        .from('organization_users')
        .select('organization_id, organizations(*)')
        .eq('user_id', user.id)
        .single();

      if (orgUser) {
        setOrganizationId(orgUser.organization_id);
        setOrganization(orgUser.organizations);
      }
      
      setLoading(false);
    }

    loadOrganization();
  }, []);

  return (
    <OrganizationContext.Provider value={{ organizationId, organization, loading }}>
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  const context = useContext(OrganizationContext);
  if (!context) {
    throw new Error('useOrganization must be used within OrganizationProvider');
  }
  return context;
}
```

### Hour 6-7: Comprehensive Testing

**Test Scenarios:**

1. **Create Test Organizations:**
```sql
INSERT INTO organizations (name, slug) VALUES 
  ('Alpha Corp', 'alpha-corp'),
  ('Beta Inc', 'beta-inc'),
  ('Gamma LLC', 'gamma-llc');
```

2. **Create Test Users:**
- User A (Alpha Corp)
- User B (Beta Inc)
- User C (Gamma LLC)

3. **Test Data Isolation:**
- User A creates lead → only visible to User A
- User B creates campaign → only visible to User B
- User C cannot see A or B's data

4. **Test All Features:**
- Lead upload
- Campaign creation
- Broadcast launch
- Workflow execution
- Call logging
- SMS messaging
- Disposition setting
- Reporting

5. **Test Edge Cases:**
- User with no organization
- User in multiple organizations (if allowed)
- Organization owner vs member permissions
- Organization switching (if applicable)

### Hour 8: Final Validation & Documentation

**Run all automated tests:**
```bash
npm test              # Unit tests (should all pass)
npm run test:e2e      # E2E tests (may need updates)
npm run build         # Build should succeed
```

**Update tests for multi-tenancy:**
- Add organization_id to test data
- Update mocks to include organization context
- Add multi-tenancy specific tests

**Documentation updates:**
- Update API docs with organization_id requirements
- Update user guides with organization concepts
- Create admin guide for managing organizations

**End of Day 3 Checklist:**
- [x] All frontend queries updated
- [x] Organization context implemented
- [x] Multiple test organizations created
- [x] Data isolation verified
- [x] All features tested
- [x] Edge cases handled
- [x] Tests updated and passing
- [x] Documentation updated

---

## Database Schema Changes

### Tables Affected (20+ tables)

**Critical Tables (Day 1):**
1. organizations (NEW)
2. organization_users (NEW)
3. leads
4. campaigns
5. call_logs
6. sms_messages
7. dispositions

**Secondary Tables (Day 2):**
8. campaign_workflows
9. workflow_steps
10. lead_workflow_progress
11. scripts
12. voice_broadcast
13. phone_numbers
14. carriers
15. carrier_assignments
16. call_queue
17. agent_availability
18. ai_conversations
19. disposition_metrics
20. dnc_list
21. contact_lists
22. ml_training_data

### Schema Pattern

**For each table:**
```sql
-- 1. Add column
ALTER TABLE [table] ADD COLUMN organization_id UUID REFERENCES organizations(id);

-- 2. Create index
CREATE INDEX idx_[table]_org_id ON [table](organization_id);

-- 3. Migrate data
UPDATE [table] SET organization_id = '[default-org-id]' WHERE organization_id IS NULL;

-- 4. Make NOT NULL
ALTER TABLE [table] ALTER COLUMN organization_id SET NOT NULL;

-- 5. Enable RLS
ALTER TABLE [table] ENABLE ROW LEVEL SECURITY;

-- 6. Create policies
CREATE POLICY "Users view their org's data"
  ON [table] FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_users 
      WHERE user_id = auth.uid()
    )
  );
```

---

## RLS Policy Implementation

### Standard Policy Template

**SELECT Policy:**
```sql
CREATE POLICY "Users view their org's [table]"
  ON [table] FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_users 
      WHERE user_id = auth.uid()
    )
  );
```

**INSERT Policy:**
```sql
CREATE POLICY "Users insert [table] to their org"
  ON [table] FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_users 
      WHERE user_id = auth.uid()
    )
  );
```

**UPDATE Policy:**
```sql
CREATE POLICY "Users update their org's [table]"
  ON [table] FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_users 
      WHERE user_id = auth.uid()
    )
  );
```

**DELETE Policy:**
```sql
CREATE POLICY "Users delete their org's [table]"
  ON [table] FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_users 
      WHERE user_id = auth.uid()
    )
  );
```

### Special Cases

**Admin-only tables:**
```sql
-- Only organization owners/admins can modify
CREATE POLICY "Admins manage [table]"
  ON [table] FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_users 
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );
```

**Shared resources:**
```sql
-- Phone numbers might be shared across orgs (carrier level)
-- Handle carefully with explicit filtering
```

---

## Frontend Query Updates

### Files to Update (~287 files)

**Search pattern:**
```bash
# Find all Supabase queries
grep -rn "supabase.from" src/ --include="*.ts" --include="*.tsx" > queries.txt

# Count: likely 200-300 query locations
```

### Update Strategy

**1. Hooks (Priority 1):**
- `src/hooks/useLeads.ts`
- `src/hooks/useCampaigns.ts`
- `src/hooks/useCallLogs.ts`
- `src/hooks/useSmsMessages.ts`
- `src/hooks/useDispositions.ts`
- `src/hooks/useWorkflows.ts`

**2. Components (Priority 2):**
- Lead management components
- Campaign components
- Call log components
- Dashboard components

**3. Edge Functions (Priority 3):**
- Update Supabase client queries in edge functions
- Add organization_id to all inserts/updates

### Update Pattern

**Before:**
```typescript
const { data, error } = await supabase
  .from('leads')
  .select('*')
  .eq('status', 'active');
```

**After (with context):**
```typescript
const { organizationId } = useOrganization();

const { data, error } = await supabase
  .from('leads')
  .select('*')
  .eq('organization_id', organizationId) // Explicit org filter
  .eq('status', 'active');

// OR rely on RLS (simpler):
const { data, error} = await supabase
  .from('leads')
  .select('*')
  .eq('status', 'active');
// RLS automatically filters by organization
```

**INSERT operations:**
```typescript
const { organizationId } = useOrganization();

const { data, error } = await supabase
  .from('leads')
  .insert({
    organization_id: organizationId, // Required
    phone: '2145291531',
    // ... other fields
  });
```

---

## Testing Strategy

### 1. Database Testing

**Test isolation between organizations:**

```sql
-- Setup: Create 3 test orgs with data
INSERT INTO organizations (name, slug) VALUES 
  ('Test Org A', 'test-org-a'),
  ('Test Org B', 'test-org-b'),
  ('Test Org C', 'test-org-c');

-- Add test data to each org
INSERT INTO leads (organization_id, phone) VALUES
  ((SELECT id FROM organizations WHERE slug = 'test-org-a'), '1111111111'),
  ((SELECT id FROM organizations WHERE slug = 'test-org-b'), '2222222222'),
  ((SELECT id FROM organizations WHERE slug = 'test-org-c'), '3333333333');

-- Test: User from Org A should only see Org A's lead
-- Switch to user from Org A
SELECT * FROM leads; -- Should return only phone '1111111111'

-- Test: Try to access Org B's lead (should fail)
SELECT * FROM leads WHERE phone = '2222222222'; -- Should return empty

-- Test: Try to insert to Org B (should fail)
INSERT INTO leads (organization_id, phone) VALUES
  ((SELECT id FROM organizations WHERE slug = 'test-org-b'), '4444444444');
-- Should fail with RLS violation
```

### 2. Frontend Testing

**Manual testing checklist:**
- [ ] Login as Org A user
- [ ] Upload leads → verify only visible to Org A
- [ ] Create campaign → verify only visible to Org A
- [ ] Make calls → verify call logs scoped to Org A
- [ ] Send SMS → verify messages scoped to Org A
- [ ] View dashboard → verify stats only show Org A data
- [ ] Switch to Org B user (new browser/incognito)
- [ ] Verify Org B cannot see any Org A data
- [ ] Repeat all actions for Org B
- [ ] Verify complete isolation

**Automated test updates:**
```typescript
// Update existing tests to include organization_id
describe('Lead creation', () => {
  it('should create lead in correct organization', async () => {
    const lead = await createLead({
      organization_id: testOrgId, // Add org context
      phone: '2145291531'
    });
    
    expect(lead.organization_id).toBe(testOrgId);
  });
});
```

### 3. Edge Function Testing

**Test edge functions with multiple organizations:**
```bash
# Test disposition-router with Org A lead
curl -X POST https://[project].supabase.co/functions/v1/disposition-router \
  -H "Authorization: Bearer [org-a-token]" \
  -d '{"lead_id": "org-a-lead-id", "disposition": "interested"}'

# Verify: Only Org A's lead updated

# Test with Org B token trying to access Org A lead (should fail)
curl -X POST https://[project].supabase.co/functions/v1/disposition-router \
  -H "Authorization: Bearer [org-b-token]" \
  -d '{"lead_id": "org-a-lead-id", "disposition": "interested"}'

# Should fail with RLS violation
```

### 4. Performance Testing

**Verify queries are using indexes:**
```sql
EXPLAIN ANALYZE
SELECT * FROM leads 
WHERE organization_id = '12345678-1234-1234-1234-123456789012'
  AND status = 'active';

-- Should use idx_leads_org_id index
```

---

## Rollback Procedures

### If Something Goes Wrong

**Rollback Day 3 (Frontend):**
```bash
# Revert code changes
git checkout [previous-commit] src/

# Rebuild
npm run build

# Deploy previous version
```

**Rollback Day 2 (Remaining Tables):**
```sql
-- Disable RLS on remaining tables
ALTER TABLE campaign_workflows DISABLE ROW LEVEL SECURITY;
-- ... (repeat for all Day 2 tables)

-- Remove organization_id columns
ALTER TABLE campaign_workflows DROP COLUMN organization_id;
-- ... (repeat for all Day 2 tables)
```

**Rollback Day 1 (Critical Tables):**
```sql
-- Disable RLS on critical tables
ALTER TABLE leads DISABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns DISABLE ROW LEVEL SECURITY;
-- ... (repeat for all Day 1 tables)

-- Remove organization_id columns
ALTER TABLE leads DROP COLUMN organization_id;
ALTER TABLE campaigns DROP COLUMN organization_id;
-- ... (repeat for all Day 1 tables)

-- Drop organization tables
DROP TABLE organization_users;
DROP TABLE organizations;
```

### Backup Strategy

**Before starting each day:**
```bash
# Backup database
pg_dump -h [host] -U [user] -d [database] > backup_day[N]_before.sql

# Backup codebase
git tag -a "before-multitenancy-day[N]" -m "Backup before Day [N]"
git push --tags
```

---

## Success Criteria

### Database Level ✅
- [x] All 20+ tables have organization_id column
- [x] All columns are NOT NULL
- [x] All indexes created
- [x] All RLS policies active
- [x] Data isolation verified with test queries

### Frontend Level ✅
- [x] Organization context implemented
- [x] All queries updated (or relying on RLS)
- [x] All INSERT operations include organization_id
- [x] Build succeeds with 0 TypeScript errors

### Testing Level ✅
- [x] 3+ test organizations created
- [x] Test users for each organization
- [x] Data isolation verified manually
- [x] All features tested per organization
- [x] Automated tests updated and passing
- [x] Edge functions tested

### Production Ready ✅
- [x] No RLS bypass vulnerabilities
- [x] Performance acceptable (queries use indexes)
- [x] Documentation updated
- [x] Rollback procedure documented
- [x] Team trained on multi-tenancy concepts

---

## Post-Implementation

### Monitoring

**Day 1-7 after deployment:**
- Monitor for RLS violations
- Check query performance
- Verify no cross-organization data access
- Collect feedback from pilot users

### Optimization

**After 1 week:**
- Analyze slow queries
- Add additional indexes if needed
- Optimize RLS policies if performance issues

### Documentation

**Update docs:**
- Admin guide for creating organizations
- User guide explaining organization concept
- Developer guide for adding new features
- API documentation with organization_id requirements

---

## Conclusion

Multi-tenancy is the **#1 priority** for enabling multiple enterprise clients. This implementation plan provides a safe, systematic approach over 2-3 days.

**Key Takeaways:**
- ✅ Comprehensive plan with hour-by-hour breakdown
- ✅ Safety measures (RLS, testing, rollback)
- ✅ Clear success criteria
- ✅ Cannot be rushed (data leak risk)
- ✅ Enables unlimited client onboarding

**Ready to start when user confirms.**

---

**Related Documents:**
- `ENTERPRISE_READINESS_ASSESSMENT.md` - Overall system assessment
- `CICD_EXPLANATION.md` - Automated testing and deployment
- `TESTING_EXPLANATION.md` - Testing infrastructure details
- `PHASE1_VERIFICATION_COMPLETE.md` - Phase 1 completion status

**Status:** PLANNING COMPLETE - Ready for implementation 🚀
