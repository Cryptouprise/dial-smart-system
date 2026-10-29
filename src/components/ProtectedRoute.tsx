import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganizationContext } from '@/contexts/OrganizationContext';
import { useOrgStanding } from '@/hooks/useOrgStanding';
import { BillingPaused } from '@/components/BillingPaused';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const FullScreenLoader: React.FC = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="text-center">
      <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
      <p className="mt-4 text-muted-foreground">Loading...</p>
    </div>
  </div>
);

/**
 * Auth gate (unchanged) + P6 billing lock.
 *
 * After auth passes: if the current organization is not in good standing, render BillingPaused instead
 * of the page. Rules (see useOrgStanding):
 * - no current organization        -> nothing to lock, render children
 * - platform operator              -> never locked, render children
 * - standing RPC error             -> fail open, render children (RLS still enforces server-side)
 * - standing false                 -> BillingPaused
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, loading } = useAuth();
  const { currentOrganization, loading: orgLoading } = useOrganizationContext();
  const standing = useOrgStanding(user ? currentOrganization?.id ?? null : null);

  if (loading) {
    return <FullScreenLoader />;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Wait for the membership load before deciding; the first paint must not flash the paused screen.
  if (orgLoading) {
    return <FullScreenLoader />;
  }

  if (currentOrganization) {
    // One RPC round-trip on the first visit per org (then cached 60 s). Showing the loader here avoids
    // rendering the app for a paused org and then swapping it out.
    if (standing.loading) {
      return <FullScreenLoader />;
    }
    if (!standing.ok) {
      return <BillingPaused onRecheck={standing.refresh} />;
    }
  }

  return <>{children}</>;
};
