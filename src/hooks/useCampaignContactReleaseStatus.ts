import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { CampaignContactReleaseStatus } from '@/lib/campaignContactReleaseStatus';

export function useCampaignContactReleaseStatus(campaignId: string | undefined) {
  const [status, setStatus] = useState<CampaignContactReleaseStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!campaignId) {
      setStatus(null);
      setError('Campaign identifier is required.');
      return null;
    }

    setIsLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc(
        'get_campaign_contact_release_status' as any,
        { p_campaign_id: campaignId },
      );
      if (rpcError) throw rpcError;

      const nextStatus = data?.[0] ?? null;
      if (!nextStatus) {
        throw new Error('The server returned no campaign release status.');
      }
      setStatus(nextStatus);
      return nextStatus;
    } catch (caught) {
      setStatus(null);
      setError(caught instanceof Error ? caught.message : 'Unable to read campaign release status.');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { status, isLoading, error, refresh };
}
