import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganizationContext } from '@/contexts/OrganizationContext';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

interface BillingPausedProps {
  /**
   * Re-check standing (useOrgStanding().refresh). Called when the tab regains focus so a user who just
   * paid in the Stripe tab is let back in without a reload, and by the "I've updated my payment" link.
   */
  onRecheck?: () => void;
}

/**
 * Full-screen lock shown when the current organization is not in good standing.
 * "Resume" opens the Stripe Customer Portal (or Checkout when the org has no Stripe customer yet)
 * in a new tab via the billing-portal edge function.
 */
export const BillingPaused: React.FC<BillingPausedProps> = ({ onRecheck }) => {
  const { signOut } = useAuth();
  const { currentOrganization } = useOrganizationContext();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!onRecheck) return;
    const handleFocus = () => onRecheck();
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [onRecheck]);

  const handleResume = async () => {
    if (!currentOrganization) return;
    setBusy(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('billing-portal', {
        body: { organization_id: currentOrganization.id },
      });
      if (fnError) throw fnError;
      // billing-portal answers with successResponse(): { success, data: { url, mode }, timestamp }
      const payload = data as { success?: boolean; data?: { url?: string }; error?: string } | null;
      const url = payload?.data?.url;
      if (!url) throw new Error(payload?.error ?? 'No billing URL returned');
      const opened = window.open(url, '_blank', 'noopener,noreferrer');
      if (!opened) {
        // Popup blocked: navigate in place instead.
        window.location.assign(url);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open billing');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <h1 className="text-2xl font-semibold">Your workspace is paused</h1>
        <p className="text-muted-foreground">
          {currentOrganization?.name ? `${currentOrganization.name}'s` : 'Your'} subscription is not in good
          standing. Update your payment method to restore access to your data and tools.
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-col gap-3">
          <Button onClick={handleResume} disabled={busy || !currentOrganization}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Resume'}
          </Button>
          {onRecheck && (
            <button
              type="button"
              onClick={onRecheck}
              className="text-sm text-muted-foreground underline"
            >
              I&apos;ve updated my payment, check again
            </button>
          )}
          <button
            type="button"
            onClick={() => { void signOut(); }}
            className="text-sm text-muted-foreground underline"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
};

export default BillingPaused;
