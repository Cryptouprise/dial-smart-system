/**
 * Organization Context Helper
 * 
 * Utilities for working with multi-tenant organizations in the Dial Smart System.
 * Phase 2 Multi-Tenancy Support.
 * 
 * NOTE: These tables (organizations, organization_users) need to be created via migration
 * before this functionality will work. For now, we stub the functions to prevent build errors.
 */

import { useEffect, useState } from 'react';

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
  try {
    // Dynamic import to avoid circular dependency
    const { supabase } = await import('@/integrations/supabase/client');
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    // Try to query organizations - will fail gracefully if table doesn't exist
    // NOTE: Using any type to avoid TypeScript errors until tables are created via migration
    const { data, error } = await (supabase as any)
      .from('organization_users')
      .select(`
        role,
        organizations (
          id, name, slug, subscription_tier, subscription_status,
          settings, created_at, updated_at
        )
      `)
      .eq('user_id', user.id);

    if (error) {
      // Table doesn't exist yet - return empty (migration not run)
      console.log('[OrganizationContext] organizations table not yet created or error:', error.message);
      return [];
    }

    return (data || []).map((item: any) => ({
      ...item.organizations,
      user_role: item.role
    }));
  } catch (err) {
    console.error('[OrganizationContext] Error loading organizations:', err);
    return [];
  }
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
 * NOTE: Stubbed until organizations table is created
 */
export async function getOrganization(_organizationId: string): Promise<Organization | null> {
  // TODO: Implement when organizations table is created via migration
  console.log('[OrganizationContext] organizations table not yet created');
  return null;
}

/**
 * Check if user has a specific role in an organization
 * NOTE: Stubbed until organizations table is created
 */
export async function hasOrganizationRole(
  _organizationId: string,
  _role: 'owner' | 'admin' | 'manager' | 'member'
): Promise<boolean> {
  // TODO: Implement when organizations table is created via migration
  return false;
}

/**
 * Check if user is an admin (owner or admin role) in an organization
 * NOTE: Stubbed until organizations table is created
 */
export async function isOrganizationAdmin(_organizationId: string): Promise<boolean> {
  // TODO: Implement when organizations table is created via migration
  return false;
}

/**
 * Get all members of an organization
 * NOTE: Stubbed until organizations table is created
 */
export async function getOrganizationMembers(_organizationId: string) {
  // TODO: Implement when organizations table is created via migration
  return [];
}

/**
 * Create a new organization
 * NOTE: Stubbed until organizations table is created
 */
export async function createOrganization(
  _name: string,
  _slug: string,
  _settings?: Record<string, any>
): Promise<Organization | null> {
  // TODO: Implement when organizations table is created via migration
  throw new Error('Organizations table not yet created. Please run the multi-tenancy migration first.');
}

/**
 * Add a user to an organization
 * NOTE: Stubbed until organizations table is created
 */
export async function addUserToOrganization(
  _organizationId: string,
  _userId: string,
  _role: 'member' | 'manager' | 'admin' = 'member'
): Promise<boolean> {
  // TODO: Implement when organizations table is created via migration
  return false;
}

/**
 * Remove a user from an organization
 * NOTE: Stubbed until organizations table is created
 */
export async function removeUserFromOrganization(
  _organizationId: string,
  _userId: string
): Promise<boolean> {
  // TODO: Implement when organizations table is created via migration
  return false;
}

/**
 * Update organization settings
 * NOTE: Stubbed until organizations table is created
 */
export async function updateOrganization(
  _organizationId: string,
  _updates: Partial<Organization>
): Promise<boolean> {
  // TODO: Implement when organizations table is created via migration
  return false;
}

/**
 * React hook to get current organization context
 * Usage: const { organization, loading } = useOrganization();
 */
export function useOrganization() {
  const [organization, setOrganization] = useState<OrganizationWithRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCurrentOrganization().then(org => {
      setOrganization(org);
      setLoading(false);
    });
  }, []);

  return { organization, loading };
}
