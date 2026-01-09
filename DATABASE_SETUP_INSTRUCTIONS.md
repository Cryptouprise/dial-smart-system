# Database Setup Instructions

## Overview
This guide walks you through verifying and setting up all required database tables, functions, and policies for the Dial Smart System multi-tenant enterprise features.

## Prerequisites
- Access to your Supabase Dashboard
- Database credentials with admin privileges
- The migration file: `supabase/migrations/20260110_verify_and_fix_all_tables.sql`

## Step-by-Step Instructions

### Step 1: Access Supabase Dashboard
1. Log in to your Supabase project at [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Select your project from the projects list
3. Navigate to the **SQL Editor** from the left sidebar

### Step 2: Run the Verification Migration

1. In the SQL Editor, click **New Query** to create a new query
2. Copy the entire contents of the migration file:
   ```
   supabase/migrations/20260110_verify_and_fix_all_tables.sql
   ```
3. Paste the SQL into the query editor
4. Click the **Run** button (or press Ctrl+Enter / Cmd+Enter) to execute the migration

**Note:** This migration is **idempotent** - it's safe to run multiple times without causing errors or data duplication.

### Step 3: Verify the Migration

After running the migration, verify that everything is set up correctly by running this query:

```sql
SELECT * FROM public.enterprise_status_v;
```

#### Expected Results
You should see output similar to:

| total_organizations | total_org_users | total_errors | unresolved_errors | default_org_name | status |
|---------------------|-----------------|--------------|-------------------|------------------|--------|
| 1 (or more) | 1 (or more) | 0 (or more) | 0 (or more) | Default Organization | Enterprise tables verified and ready |

### Step 4: Verify Individual Components

Run these queries to verify each component:

#### 1. Check Organizations Table
```sql
SELECT id, name, slug, subscription_tier, subscription_status 
FROM public.organizations;
```
✅ **Success:** Should return at least one row with slug='default-org'

#### 2. Check Organization Users Mapping
```sql
SELECT ou.role, u.email, o.name as organization_name
FROM public.organization_users ou
JOIN auth.users u ON u.id = ou.user_id
JOIN public.organizations o ON o.id = ou.organization_id;
```
✅ **Success:** Should return all existing users mapped to 'Default Organization'

#### 3. Check Edge Function Errors Table
```sql
SELECT COUNT(*) as table_exists 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name = 'edge_function_errors';
```
✅ **Success:** Should return `table_exists = 1`

#### 4. Test Helper Functions
```sql
-- Test user_in_organization (replace with your org UUID)
SELECT public.user_in_organization(
  (SELECT id FROM public.organizations WHERE slug = 'default-org')
) as is_member;

-- Test get_user_org_role
SELECT public.get_user_org_role(
  (SELECT id FROM public.organizations WHERE slug = 'default-org')
) as my_role;

-- Test is_org_admin
SELECT public.is_org_admin(
  (SELECT id FROM public.organizations WHERE slug = 'default-org')
) as is_admin;
```
✅ **Success:** Functions should return appropriate boolean/text values without errors

### Step 5: Verify Row Level Security (RLS)

Test that RLS policies are working correctly:

```sql
-- This should return only organizations you're a member of
SELECT * FROM public.organizations;

-- This should return only members of your organizations
SELECT * FROM public.organization_users;

-- This should return only errors you have access to
SELECT * FROM public.edge_function_errors;
```

✅ **Success:** Queries run without permission errors

## Success Criteria Checklist

After completing the setup, verify all of the following:

- [ ] `SELECT * FROM enterprise_status_v;` returns valid data
- [ ] Organizations table exists with at least 1 row (default-org)
- [ ] All existing users are mapped to default-org as 'owner'
- [ ] Edge function errors table exists and is accessible
- [ ] Helper functions work correctly:
  - [ ] `get_user_organizations(UUID)` 
  - [ ] `user_in_organization(UUID)` with two params
  - [ ] `user_in_organization(UUID)` with one param (uses auth.uid())
  - [ ] `get_user_org_role(UUID, UUID)` with two params
  - [ ] `get_user_org_role(UUID)` with one param (uses auth.uid())
  - [ ] `is_org_admin(UUID, UUID)` with two params
  - [ ] `is_org_admin(UUID)` with one param (uses auth.uid())
- [ ] RLS policies allow viewing own organization data
- [ ] RLS policies allow admins to update organizations
- [ ] RLS policies allow authenticated users to create organizations
- [ ] No SQL errors when querying tables

## Troubleshooting

### Issue: "relation already exists" errors
**Solution:** This is expected if tables already exist. The migration uses `IF NOT EXISTS` to handle this gracefully. As long as the migration completes, you're good.

### Issue: "permission denied" when querying tables
**Solution:** Verify you're logged in as an authenticated user. RLS policies require authentication. If testing with service role, use the service role key.

### Issue: "function does not exist"
**Solution:** Re-run the migration. Functions are created with `CREATE OR REPLACE`, so re-running is safe.

### Issue: No users in organization_users table
**Solution:** Make sure you have users in `auth.users` table before running the migration. The migration only maps existing users.

## What This Migration Does

This comprehensive migration:

1. ✅ Creates or verifies the **organizations** table
2. ✅ Creates or verifies the **organization_users** junction table
3. ✅ Creates or verifies the **edge_function_errors** logging table
4. ✅ Creates/updates all helper functions for multi-tenancy
5. ✅ Adds function overloads that use `auth.uid()` automatically
6. ✅ Drops and recreates all RLS policies to ensure they're up to date
7. ✅ Creates a 'Default Organization' if it doesn't exist
8. ✅ Maps all existing users to the default organization as 'owner'
9. ✅ Creates an `enterprise_status_v` view for easy verification

## Next Steps

After successful verification:

1. **Test Frontend Integration:** Ensure your frontend can access organization data
2. **Create Additional Organizations:** Use the UI or SQL to create new organizations
3. **Invite Users:** Add users to organizations using the organization management features
4. **Monitor Errors:** Check `edge_function_errors` table regularly for system health

## Support

If you encounter issues not covered in the troubleshooting section:
1. Check the Supabase logs for detailed error messages
2. Verify your Supabase project plan supports the features used (RLS, auth, etc.)
3. Ensure your database has the latest Supabase extensions installed

---

**Migration File:** `supabase/migrations/20260110_verify_and_fix_all_tables.sql`  
**Version:** 1.0  
**Last Updated:** January 10, 2026
