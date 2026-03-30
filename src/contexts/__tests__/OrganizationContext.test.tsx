import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import {
  OrganizationProvider,
  useOrganizationContext,
  useCurrentOrganizationId,
  useIsOrganizationAdmin,
  useHasOrganizationRole,
} from '../OrganizationContext';

// Mock getUserOrganizations
const mockGetUserOrganizations = vi.fn();
vi.mock('@/lib/organizationContext', () => ({
  getUserOrganizations: (...args: any[]) => mockGetUserOrganizations(...args),
}));

// Mock supabase auth
let authChangeCallback: ((event: string) => void) | null = null;
const mockUnsubscribe = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: any) => {
        authChangeCallback = cb;
        return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
      },
    },
  },
}));

const mockOrgs = [
  {
    id: 'org-1',
    name: 'Acme Corp',
    slug: 'acme',
    subscription_tier: 'enterprise' as const,
    subscription_status: 'active' as const,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    user_role: 'owner' as const,
  },
  {
    id: 'org-2',
    name: 'Beta Inc',
    slug: 'beta',
    subscription_tier: 'basic' as const,
    subscription_status: 'active' as const,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    user_role: 'member' as const,
  },
];

function wrapper({ children }: { children: React.ReactNode }) {
  return <OrganizationProvider>{children}</OrganizationProvider>;
}

describe('OrganizationContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    authChangeCallback = null;
    mockGetUserOrganizations.mockResolvedValue(mockOrgs);
  });

  describe('useOrganizationContext', () => {
    it('loads organizations on mount', async () => {
      const { result } = renderHook(() => useOrganizationContext(), { wrapper });

      expect(result.current.loading).toBe(true);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.organizations).toEqual(mockOrgs);
      expect(mockGetUserOrganizations).toHaveBeenCalled();
    });

    it('sets first organization as current by default', async () => {
      const { result } = renderHook(() => useOrganizationContext(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.currentOrganization).toEqual(mockOrgs[0]);
    });

    it('restores saved organization from localStorage', async () => {
      localStorage.setItem('currentOrganizationId', 'org-2');

      const { result } = renderHook(() => useOrganizationContext(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.currentOrganization?.id).toBe('org-2');
    });

    it('falls back to first org if saved org ID not found', async () => {
      localStorage.setItem('currentOrganizationId', 'nonexistent-org');

      const { result } = renderHook(() => useOrganizationContext(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.currentOrganization?.id).toBe('org-1');
    });

    it('allows switching current organization', async () => {
      const { result } = renderHook(() => useOrganizationContext(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      act(() => {
        result.current.setCurrentOrganization(mockOrgs[1]);
      });

      expect(result.current.currentOrganization?.id).toBe('org-2');
    });

    it('saves current org to localStorage on change', async () => {
      const { result } = renderHook(() => useOrganizationContext(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      act(() => {
        result.current.setCurrentOrganization(mockOrgs[1]);
      });

      await waitFor(() => {
        expect(localStorage.getItem('currentOrganizationId')).toBe('org-2');
      });
    });

    it('reloads organizations on SIGNED_IN event', async () => {
      const { result } = renderHook(() => useOrganizationContext(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      mockGetUserOrganizations.mockClear();

      act(() => {
        authChangeCallback?.('SIGNED_IN');
      });

      expect(mockGetUserOrganizations).toHaveBeenCalled();
    });

    it('clears organizations on SIGNED_OUT event', async () => {
      const { result } = renderHook(() => useOrganizationContext(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      act(() => {
        authChangeCallback?.('SIGNED_OUT');
      });

      expect(result.current.organizations).toEqual([]);
      expect(result.current.currentOrganization).toBeNull();
    });

    it('handles empty organizations list', async () => {
      mockGetUserOrganizations.mockResolvedValue([]);

      const { result } = renderHook(() => useOrganizationContext(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.organizations).toEqual([]);
      expect(result.current.currentOrganization).toBeNull();
    });

    it('handles getUserOrganizations error gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockGetUserOrganizations.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useOrganizationContext(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.organizations).toEqual([]);
      consoleSpy.mockRestore();
    });

    it('refreshOrganizations reloads data', async () => {
      const { result } = renderHook(() => useOrganizationContext(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      mockGetUserOrganizations.mockClear();

      await act(async () => {
        await result.current.refreshOrganizations();
      });

      expect(mockGetUserOrganizations).toHaveBeenCalled();
    });

    it('unsubscribes from auth on unmount', async () => {
      const { unmount } = renderHook(() => useOrganizationContext(), { wrapper });
      unmount();
      expect(mockUnsubscribe).toHaveBeenCalled();
    });

    it('throws when used outside provider', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(() => {
        renderHook(() => useOrganizationContext());
      }).toThrow('useOrganizationContext must be used within OrganizationProvider');
      spy.mockRestore();
    });
  });

  describe('useCurrentOrganizationId', () => {
    it('returns the current org id', async () => {
      const { result } = renderHook(() => useCurrentOrganizationId(), { wrapper });

      await waitFor(() => {
        expect(result.current).toBe('org-1');
      });
    });

    it('returns null when no org selected', async () => {
      mockGetUserOrganizations.mockResolvedValue([]);

      const { result } = renderHook(() => useCurrentOrganizationId(), { wrapper });

      await waitFor(() => {
        expect(result.current).toBeNull();
      });
    });
  });

  describe('useIsOrganizationAdmin', () => {
    it('returns true for owner role', async () => {
      const { result } = renderHook(() => useIsOrganizationAdmin(), { wrapper });

      await waitFor(() => {
        expect(result.current).toBe(true);
      });
    });

    it('returns true for admin role', async () => {
      mockGetUserOrganizations.mockResolvedValue([
        { ...mockOrgs[0], user_role: 'admin' },
      ]);

      const { result } = renderHook(() => useIsOrganizationAdmin(), { wrapper });

      await waitFor(() => {
        expect(result.current).toBe(true);
      });
    });

    it('returns false for member role', async () => {
      mockGetUserOrganizations.mockResolvedValue([
        { ...mockOrgs[0], user_role: 'member' },
      ]);

      const { result } = renderHook(() => useIsOrganizationAdmin(), { wrapper });

      await waitFor(() => {
        expect(result.current).toBe(false);
      });
    });

    it('returns false for manager role', async () => {
      mockGetUserOrganizations.mockResolvedValue([
        { ...mockOrgs[0], user_role: 'manager' },
      ]);

      const { result } = renderHook(() => useIsOrganizationAdmin(), { wrapper });

      await waitFor(() => {
        expect(result.current).toBe(false);
      });
    });
  });

  describe('useHasOrganizationRole', () => {
    it('owner has all roles', async () => {
      // Current org has owner role
      const { result: memberCheck } = renderHook(
        () => useHasOrganizationRole('member'),
        { wrapper }
      );
      const { result: managerCheck } = renderHook(
        () => useHasOrganizationRole('manager'),
        { wrapper }
      );
      const { result: adminCheck } = renderHook(
        () => useHasOrganizationRole('admin'),
        { wrapper }
      );
      const { result: ownerCheck } = renderHook(
        () => useHasOrganizationRole('owner'),
        { wrapper }
      );

      await waitFor(() => {
        expect(memberCheck.current).toBe(true);
        expect(managerCheck.current).toBe(true);
        expect(adminCheck.current).toBe(true);
        expect(ownerCheck.current).toBe(true);
      });
    });

    it('member only has member role', async () => {
      mockGetUserOrganizations.mockResolvedValue([
        { ...mockOrgs[0], user_role: 'member' },
      ]);

      const { result: memberCheck } = renderHook(
        () => useHasOrganizationRole('member'),
        { wrapper }
      );
      const { result: managerCheck } = renderHook(
        () => useHasOrganizationRole('manager'),
        { wrapper }
      );

      await waitFor(() => {
        expect(memberCheck.current).toBe(true);
        expect(managerCheck.current).toBe(false);
      });
    });

    it('manager has member and manager but not admin', async () => {
      mockGetUserOrganizations.mockResolvedValue([
        { ...mockOrgs[0], user_role: 'manager' },
      ]);

      const { result: memberCheck } = renderHook(
        () => useHasOrganizationRole('member'),
        { wrapper }
      );
      const { result: managerCheck } = renderHook(
        () => useHasOrganizationRole('manager'),
        { wrapper }
      );
      const { result: adminCheck } = renderHook(
        () => useHasOrganizationRole('admin'),
        { wrapper }
      );

      await waitFor(() => {
        expect(memberCheck.current).toBe(true);
        expect(managerCheck.current).toBe(true);
        expect(adminCheck.current).toBe(false);
      });
    });

    it('returns false when no org selected', async () => {
      mockGetUserOrganizations.mockResolvedValue([]);

      const { result } = renderHook(
        () => useHasOrganizationRole('member'),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current).toBe(false);
      });
    });
  });
});
