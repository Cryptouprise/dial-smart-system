# Phase 2 Multi-Tenancy - Frontend Integration Guide

## Overview

This guide explains how to integrate the multi-tenancy features into your React application.

## Quick Start

### 1. Wrap Your App with OrganizationProvider

In your `main.tsx` or `App.tsx`:

```tsx
import { OrganizationProvider } from '@/contexts/OrganizationContext';

function App() {
  return (
    <OrganizationProvider>
      {/* Your existing app structure */}
      <YourAppContent />
    </OrganizationProvider>
  );
}
```

### 2. Add Organization Selector to Navigation

```tsx
import { OrganizationSelector } from '@/components/OrganizationSelector';

function Navigation() {
  return (
    <nav>
      <OrganizationSelector />
      {/* Other navigation items */}
    </nav>
  );
}
```

### 3. Use Organization Context in Components

```tsx
import { useOrganizationContext, useCurrentOrganizationId } from '@/contexts/OrganizationContext';

function MyCampaignsList() {
  const { currentOrganization } = useOrganizationContext();
  const organizationId = useCurrentOrganizationId();

  // Fetch campaigns - RLS automatically filters by organization
  const { data: campaigns } = useQuery({
    queryKey: ['campaigns', organizationId],
    queryFn: async () => {
      const { data } = await supabase
        .from('campaigns')
        .select('*');
      return data;
    }
  });

  return (
    <div>
      <h2>Campaigns for {currentOrganization?.name}</h2>
      {/* Render campaigns */}
    </div>
  );
}
```

### 4. Creating New Records with Organization ID

```tsx
import { useCurrentOrganizationId } from '@/contexts/OrganizationContext';

function CreateCampaignForm() {
  const organizationId = useCurrentOrganizationId();

  const handleSubmit = async (formData) => {
    const { data, error } = await supabase
      .from('campaigns')
      .insert({
        ...formData,
        organization_id: organizationId, // Important!
        user_id: (await supabase.auth.getUser()).data.user?.id
      });
    
    // Handle response
  };

  return <form onSubmit={handleSubmit}>...</form>;
}
```

## Hooks Available

### useOrganizationContext()
Returns the full organization context:
```tsx
const {
  organizations,           // All organizations user belongs to
  currentOrganization,     // Currently selected organization
  setCurrentOrganization,  // Function to switch organizations
  loading,                 // Loading state
  refreshOrganizations     // Function to reload organizations
} = useOrganizationContext();
```

### useCurrentOrganizationId()
Returns just the current organization ID (or null):
```tsx
const orgId = useCurrentOrganizationId();
```

### useIsOrganizationAdmin()
Check if user is admin in current organization:
```tsx
const isAdmin = useIsOrganizationAdmin();

if (isAdmin) {
  // Show admin-only features
}
```

### useHasOrganizationRole(role)
Check if user has a specific role or higher:
```tsx
const canManage = useHasOrganizationRole('manager');

if (canManage) {
  // Show manager+ features
}
```

## Direct Functions (from organizationContext.ts)

### getUserOrganizations()
```tsx
import { getUserOrganizations } from '@/lib/organizationContext';

const orgs = await getUserOrganizations();
```

### getCurrentOrganization()
```tsx
import { getCurrentOrganization } from '@/lib/organizationContext';

const org = await getCurrentOrganization();
```

### isOrganizationAdmin(organizationId)
```tsx
import { isOrganizationAdmin } from '@/lib/organizationContext';

const isAdmin = await isOrganizationAdmin(orgId);
```

### createOrganization(name, slug, settings?)
```tsx
import { createOrganization } from '@/lib/organizationContext';

const newOrg = await createOrganization('Acme Corp', 'acme-corp', {
  timezone: 'America/New_York'
});
```

### addUserToOrganization(orgId, userId, role)
```tsx
import { addUserToOrganization } from '@/lib/organizationContext';

await addUserToOrganization(orgId, userId, 'member');
```

## Important Notes

### 1. All Queries Automatically Filter by Organization

Thanks to Row Level Security (RLS), you don't need to manually filter by organization_id in SELECT queries:

```tsx
// This automatically only returns data for current user's organizations
const { data } = await supabase.from('campaigns').select('*');
```

### 2. Always Include organization_id on INSERT

When creating new records, always include the organization_id:

```tsx
const orgId = useCurrentOrganizationId();

await supabase.from('campaigns').insert({
  name: 'New Campaign',
  organization_id: orgId,  // Required!
  user_id: userId
});
```

### 3. Organization Switching

When users switch organizations:
- The context updates automatically
- localStorage saves the preference
- All queries will now return data for the new organization (via RLS)

### 4. Error Handling

If a user tries to access data from another organization:
- RLS will block it at the database level
- The query will return empty results (not an error)
- No additional validation needed in your application code

## Example: Complete Feature with Multi-Tenancy

```tsx
import { useCurrentOrganizationId, useIsOrganizationAdmin } from '@/contexts/OrganizationContext';
import { supabase } from '@/integrations/supabase/client';

function CampaignManager() {
  const organizationId = useCurrentOrganizationId();
  const isAdmin = useIsOrganizationAdmin();
  const [campaigns, setCampaigns] = useState([]);

  useEffect(() => {
    loadCampaigns();
  }, [organizationId]);

  const loadCampaigns = async () => {
    // RLS automatically filters by organization
    const { data } = await supabase
      .from('campaigns')
      .select('*')
      .order('created_at', { ascending: false });
    
    setCampaigns(data || []);
  };

  const createCampaign = async (name: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    
    const { data, error } = await supabase
      .from('campaigns')
      .insert({
        name,
        organization_id: organizationId,
        user_id: user?.id
      })
      .select()
      .single();

    if (!error) {
      loadCampaigns();
    }
  };

  return (
    <div>
      <h1>Campaigns</h1>
      
      {isAdmin && (
        <button onClick={() => createCampaign('New Campaign')}>
          Create Campaign
        </button>
      )}

      <ul>
        {campaigns.map(campaign => (
          <li key={campaign.id}>{campaign.name}</li>
        ))}
      </ul>
    </div>
  );
}
```

## Testing Multi-Tenancy

### 1. Create Test Organizations

```tsx
import { createOrganization } from '@/lib/organizationContext';

// Create two test organizations
const org1 = await createOrganization('Test Org 1', 'test-org-1');
const org2 = await createOrganization('Test Org 2', 'test-org-2');
```

### 2. Test Data Isolation

1. Create data while in Org 1
2. Switch to Org 2 using OrganizationSelector
3. Verify Org 1's data is not visible
4. Create data in Org 2
5. Switch back to Org 1
6. Verify Org 2's data is not visible

## Migration from Single-Tenant

If you have existing components, update them:

### Before (Single-Tenant)
```tsx
const { data } = await supabase
  .from('campaigns')
  .select('*')
  .eq('user_id', userId);
```

### After (Multi-Tenant)
```tsx
const { data } = await supabase
  .from('campaigns')
  .select('*');
  // RLS handles organization filtering automatically
```

### For INSERTs
```tsx
// Before
await supabase.from('campaigns').insert({
  name: 'Campaign',
  user_id: userId
});

// After - add organization_id
const orgId = useCurrentOrganizationId();
await supabase.from('campaigns').insert({
  name: 'Campaign',
  user_id: userId,
  organization_id: orgId  // Add this
});
```

## Troubleshooting

### Issue: Users can't see any data after Phase 2

**Cause**: Data exists but user isn't in any organization.

**Solution**: 
```sql
-- Check user's organizations
SELECT * FROM organization_users WHERE user_id = 'user-uuid';

-- Add user to default organization if needed
INSERT INTO organization_users (organization_id, user_id, role)
VALUES (
  (SELECT id FROM organizations WHERE slug = 'default-org'),
  'user-uuid',
  'member'
);
```

### Issue: "organization_id cannot be null" error

**Cause**: Trying to create records without organization_id.

**Solution**: Always include organization_id in INSERTs:
```tsx
const orgId = useCurrentOrganizationId();
if (!orgId) throw new Error('No organization selected');

await supabase.from('table').insert({
  ...data,
  organization_id: orgId
});
```

### Issue: Organization selector not showing

**Cause**: OrganizationProvider not wrapping the app.

**Solution**: Ensure OrganizationProvider is at the root:
```tsx
<OrganizationProvider>
  <App />
</OrganizationProvider>
```

## Next Steps

1. ✅ Add OrganizationProvider to your app
2. ✅ Add OrganizationSelector to navigation
3. ✅ Update CREATE operations to include organization_id
4. ✅ Test with multiple organizations
5. ⏳ Build organization management UI (admin dashboard)
6. ⏳ Add organization settings page
7. ⏳ Implement user invitation system

## Support

For questions or issues:
1. Check browser console for errors
2. Verify user is in an organization: `SELECT * FROM organization_users WHERE user_id = auth.uid();`
3. Check RLS policies are working: Try to query another org's data
4. Review this guide and PHASE2_MULTITENANCY_COMPLETE.md

---

**Last Updated**: January 8, 2026
**Phase**: 2 - Multi-Tenancy
**Status**: Production Ready
