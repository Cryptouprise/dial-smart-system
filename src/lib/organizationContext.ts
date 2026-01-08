/**
 * Organization Context Helper
 * 
 * Utilities for working with multi-tenant organizations in the Dial Smart System.
 * Phase 2 Multi-Tenancy Support.
 */

import { supabase } from '@/integrations/supabase/client';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  settings?: Record<string, any>;
  subscription_tier: 'basic' | 'professional' | 'enterprise';
  subscription_status: 'active' | 'trial' | 'suspended' | 'cancelled';
  trial_ends_at?: string;
  max_users?: number;
  max_campaigns?: number;
  max_phone_numbers?: number;
  monthly_call_limit?: number;
  created_at: string;
  updated_at: string;
}

export interface OrganizationUser {
  id: string;
  organization_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'manager' | 'member';
  joined_at: string;
}

export interface OrganizationWithRole extends Organization {
  user_role?: 'owner' | 'admin' | 'manager' | 'member';
}

/**
 * Get all organizations the current user belongs to
 */
export async function getUserOrganizations(): Promise<OrganizationWithRole[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('organization_users')
    .select(`
      role,
      organization:organizations (
        id,
        name,
        slug,
        settings,
        subscription_tier,
        subscription_status,
        created_at,
        updated_at
      )
    `)
    .eq('user_id', user.id);

  if (error) {
    console.error('Error fetching user organizations:', error);
    return [];
  }

  return data?.map(item => ({
    ...item.organization,
    user_role: item.role
  })) || [];
}

/**
 * Get the user's current/default organization
 * Returns the first organization or null if user has no organizations
 */
export async function getCurrentOrganization(): Promise<OrganizationWithRole | null> {
  const orgs = await getUserOrganizations();
  return orgs[0] || null;
}

/**
 * Get a specific organization by ID
 */
export async function getOrganization(organizationId: string): Promise<Organization | null> {
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', organizationId)
    .single();

  if (error) {
    console.error('Error fetching organization:', error);
    return null;
  }

  return data;
}

/**
 * Check if user has a specific role in an organization
 */
export async function hasOrganizationRole(
  organizationId: string,
  role: 'owner' | 'admin' | 'manager' | 'member'
): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data, error } = await supabase
    .from('organization_users')
    .select('role')
    .eq('organization_id', organizationId)
    .eq('user_id', user.id)
    .single();

  if (error || !data) return false;

  // Check if user's role matches or exceeds required role
  const roleHierarchy = { member: 1, manager: 2, admin: 3, owner: 4 };
  return roleHierarchy[data.role] >= roleHierarchy[role];
}

/**
 * Check if user is an admin (owner or admin role) in an organization
 */
export async function isOrganizationAdmin(organizationId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data, error } = await supabase
    .from('organization_users')
    .select('role')
    .eq('organization_id', organizationId)
    .eq('user_id', user.id)
    .single();

  if (error || !data) return false;
  return data.role === 'owner' || data.role === 'admin';
}

/**
 * Get all members of an organization
 */
export async function getOrganizationMembers(organizationId: string) {
  const { data, error } = await supabase
    .from('organization_users')
    .select(`
      id,
      role,
      joined_at,
      user:user_id (
        id,
        email
      )
    `)
    .eq('organization_id', organizationId);

  if (error) {
    console.error('Error fetching organization members:', error);
    return [];
  }

  return data || [];
}

/**
 * Create a new organization
 * Only available to authenticated users
 */
export async function createOrganization(
  name: string,
  slug: string,
  settings?: Record<string, any>
): Promise<Organization | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated');

  // Create organization
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .insert({
      name,
      slug,
      settings: settings || {},
      subscription_tier: 'basic',
      subscription_status: 'trial'
    })
    .select()
    .single();

  if (orgError) {
    console.error('Error creating organization:', orgError);
    throw orgError;
  }

  // Add creator as owner
  const { error: userError } = await supabase
    .from('organization_users')
    .insert({
      organization_id: org.id,
      user_id: user.id,
      role: 'owner'
    });

  if (userError) {
    console.error('Error adding user to organization:', userError);
    // Rollback organization creation
    await supabase.from('organizations').delete().eq('id', org.id);
    throw userError;
  }

  return org;
}

/**
 * Add a user to an organization
 * Requires admin permissions
 */
export async function addUserToOrganization(
  organizationId: string,
  userId: string,
  role: 'member' | 'manager' | 'admin' = 'member'
): Promise<boolean> {
  // Check if current user is admin
  const isAdmin = await isOrganizationAdmin(organizationId);
  if (!isAdmin) {
    throw new Error('Insufficient permissions to add users');
  }

  const { error } = await supabase
    .from('organization_users')
    .insert({
      organization_id: organizationId,
      user_id: userId,
      role
    });

  if (error) {
    console.error('Error adding user to organization:', error);
    return false;
  }

  return true;
}

/**
 * Remove a user from an organization
 * Requires admin permissions
 */
export async function removeUserFromOrganization(
  organizationId: string,
  userId: string
): Promise<boolean> {
  // Check if current user is admin
  const isAdmin = await isOrganizationAdmin(organizationId);
  if (!isAdmin) {
    throw new Error('Insufficient permissions to remove users');
  }

  const { error } = await supabase
    .from('organization_users')
    .delete()
    .eq('organization_id', organizationId)
    .eq('user_id', userId);

  if (error) {
    console.error('Error removing user from organization:', error);
    return false;
  }

  return true;
}

/**
 * Update organization settings
 * Requires admin permissions
 */
export async function updateOrganization(
  organizationId: string,
  updates: Partial<Organization>
): Promise<boolean> {
  const isAdmin = await isOrganizationAdmin(organizationId);
  if (!isAdmin) {
    throw new Error('Insufficient permissions to update organization');
  }

  const { error } = await supabase
    .from('organizations')
    .update(updates)
    .eq('id', organizationId);

  if (error) {
    console.error('Error updating organization:', error);
    return false;
  }

  return true;
}

/**
 * React hook to get current organization context
 * Usage: const { organization, loading } = useOrganization();
 */
export function useOrganization() {
  const [organization, setOrganization] = React.useState<OrganizationWithRole | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    getCurrentOrganization().then(org => {
      setOrganization(org);
      setLoading(false);
    });
  }, []);

  return { organization, loading };
}

// Re-export for convenience
export { supabase };
