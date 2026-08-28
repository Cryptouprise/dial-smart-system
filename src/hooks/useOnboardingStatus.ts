import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Tracks whether the signed-in user has been through the setup wizard.
 *
 * The wizard has always existed as the Dashboard's 'onboarding' tab, but a new
 * signup had no way to discover it — they landed on a dashboard designed for an
 * account that already has leads, phone numbers and campaigns. This reads the
 * completion stamp so the Dashboard can route first-run users into setup once,
 * and never again after they finish or skip it.
 *
 * `needsOnboarding` stays false until the flag has actually loaded, so a slow
 * query never flashes the wizard at an established user.
 */
export const useOnboardingStatus = () => {
  const [loading, setLoading] = useState(true);
  const [completedAt, setCompletedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) setLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from('user_feature_flags')
          .select('onboarding_completed_at')
          .eq('user_id', user.id)
          .maybeSingle();

        if (cancelled) return;

        // On error, fail closed: treat onboarding as done rather than trapping
        // an existing user in a wizard because of a transient query failure.
        if (error) {
          setCompletedAt(new Date().toISOString());
        } else {
          setCompletedAt((data as { onboarding_completed_at: string | null } | null)?.onboarding_completed_at ?? null);
        }
      } catch {
        if (!cancelled) setCompletedAt(new Date().toISOString());
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, []);

  const markComplete = useCallback(async () => {
    const stamp = new Date().toISOString();
    setCompletedAt(stamp);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase
        .from('user_feature_flags')
        .update({ onboarding_completed_at: stamp } as never)
        .eq('user_id', user.id);
    } catch {
      // Local state is already updated, so the wizard won't reappear this
      // session. Worst case it shows once more on the next login.
    }
  }, []);

  return {
    loading,
    completedAt,
    needsOnboarding: !loading && completedAt === null,
    markComplete,
  };
};

export default useOnboardingStatus;
