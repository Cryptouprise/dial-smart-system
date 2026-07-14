/**
 * Organization Context Provider
 * 
 * React context for managing organization state across the application.
 * Phase 2 Multi-Tenancy Support.
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getUserOrganizations, OrganizationWithRole } from '@/lib/organizationContext';
import { supabase } from '@/integrations/supabase/client';

interface OrganizationContextType {
  organizations: OrganizationWithRole[];
  currentOrganization: OrganizationWithRole | null;
  setCurrentOrganization: (org: OrganizationWithRole) => void;
  loading: boolean;
  refreshOrganizations: () => Promise<void>;
}

const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined);

interface OrganizationProviderProps {
  children: ReactNode;
}

export function OrganizationProvider({ children }: OrganizationProviderProps) {
  const [organizations, setOrganizations] = useState<OrganizationWithRole[]>([]);
  const [currentOrganization, setCurrentOrganization] = useState<OrganizationWithRole | null>(null);
  const [loading, setLoading] = useState(true);

  const loadOrganizations = React.useCallback(async () => {
    try {
      setLoading(true);
      const orgs = await getUserOrganizations();
      setOrganizations(orgs);
      const savedOrgId = localStorage.getItem('currentOrganizationId');
      if (savedOrgId && !orgs.some((org) => org.id === savedOrgId)) {
        localStorage.removeItem('currentOrganizationId');
      }

      setCurrentOrganization((current) => {
        const savedOrg = orgs.find((org) => org.id === savedOrgId);
        if (savedOrg) return savedOrg;

        const stillAuthorized = current && orgs.find((org) => org.id === current.id);
        if (stillAuthorized) return stillAuthorized;

        // A single membership is unambiguous. Multi-membership users must make
        // an explicit choice; silently choosing the first company is unsafe.
        return orgs.length === 1 ? orgs[0] : null;
      });
    } catch (error) {
      console.error('Error loading organizations:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Load organizations on mount
    loadOrganizations();

    // Subscribe to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        loadOrganizations();
      } else if (event === 'SIGNED_OUT') {
        setOrganizations([]);
        setCurrentOrganization(null);
        localStorage.removeItem('currentOrganizationId');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [loadOrganizations]);

  // Save current organization to localStorage when it changes
  useEffect(() => {
    if (currentOrganization) {
      localStorage.setItem('currentOrganizationId', currentOrganization.id);
    }
  }, [currentOrganization]);

  const handleSetCurrentOrganization = (org: OrganizationWithRole) => {
    const authorizedOrganization = organizations.find((candidate) => candidate.id === org.id);
    if (!authorizedOrganization) {
      throw new Error('Cannot select an organization outside the authenticated memberships');
    }
    setCurrentOrganization(authorizedOrganization);
  };

  const refreshOrganizations = async () => {
    await loadOrganizations();
  };

  return (
    <OrganizationContext.Provider
      value={{
        organizations,
        currentOrganization,
        setCurrentOrganization: handleSetCurrentOrganization,
        loading,
        refreshOrganizations
      }}
    >
      {children}
    </OrganizationContext.Provider>
  );
}

/**
 * Hook to use organization context
 * Must be used within OrganizationProvider
 */
export function useOrganizationContext() {
  const context = useContext(OrganizationContext);
  if (context === undefined) {
    throw new Error('useOrganizationContext must be used within OrganizationProvider');
  }
  return context;
}

/**
 * Hook to get current organization ID
 * Returns null if no organization is selected
 */
export function useCurrentOrganizationId(): string | null {
  const { currentOrganization } = useOrganizationContext();
  return currentOrganization?.id || null;
}

/**
 * Hook to check if user is admin in current organization
 */
export function useIsOrganizationAdmin(): boolean {
  const { currentOrganization } = useOrganizationContext();
  if (!currentOrganization?.user_role) return false;
  return ['owner', 'admin'].includes(currentOrganization.user_role);
}

/**
 * Hook to check if user has a specific role in current organization
 */
export function useHasOrganizationRole(minimumRole: 'member' | 'manager' | 'admin' | 'owner'): boolean {
  const { currentOrganization } = useOrganizationContext();
  if (!currentOrganization?.user_role) return false;

  const roleHierarchy: Record<string, number> = {
    member: 1,
    manager: 2,
    admin: 3,
    owner: 4
  };

  const userRoleLevel = roleHierarchy[currentOrganization.user_role] || 0;
  const requiredRoleLevel = roleHierarchy[minimumRole] || 0;

  return userRoleLevel >= requiredRoleLevel;
}
