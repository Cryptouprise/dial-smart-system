import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useRetellAI } from '@/hooks/useRetellAI';
import { supabase } from '@/integrations/supabase/client';

export const useNumberSync = () => {
  const [isSyncing, setIsSyncing] = useState(false);
  const { toast } = useToast();
  const { listPhoneNumbers } = useRetellAI();

  // Normalize phone to last 10 digits for comparison
  const normalize = (phone: string) => phone.replace(/\D/g, '').slice(-10);

  const syncNumberStatus = async () => {
    setIsSyncing(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Get local numbers from database
      const { data: localNumbers, error: localError } = await supabase
        .from('phone_numbers')
        .select('*')
        .eq('user_id', user.id);

      if (localError) throw localError;

      // Get Retell numbers
      const retellNumbers = await listPhoneNumbers();

      if (!retellNumbers) {
        toast({
          title: 'Sync Failed',
          description: 'Could not fetch Retell AI numbers. Check your API credentials.',
          variant: 'destructive',
        });
        return null;
      }

      // Build lookup by normalized phone
      const retellByPhone: Record<string, any> = {};
      for (const rn of retellNumbers) {
        retellByPhone[normalize(rn.phone_number)] = rn;
      }

      let syncedCount = 0;
      let updatedCount = 0;
      let discrepancies = 0;

      for (const local of localNumbers || []) {
        const key = normalize(local.number);
        const retell = retellByPhone[key];

        if (retell) {
          syncedCount++;

          // If local doesn't have retell_phone_id yet, update it!
          if (!local.retell_phone_id) {
            const retellPhoneId = retell.phone_number_id || retell.phone_number || `retell_${local.number}`;
            const { error: updateError } = await supabase
              .from('phone_numbers')
              .update({ retell_phone_id: retellPhoneId })
              .eq('id', local.id);

            if (!updateError) {
              updatedCount++;
              console.log(`[Sync] Updated ${local.number} with retell_phone_id = ${retellPhoneId}`);
            } else {
              console.error(`[Sync] Failed to update ${local.number}:`, updateError);
            }
          }

          // Check agent assignment discrepancy
          if (local.status === 'active' && !retell.inbound_agent_id && !retell.outbound_agent_id) {
            discrepancies++;
            console.log(`Discrepancy: ${local.number} is active but has no Retell agent assigned`);
          }
        } else if (local.status === 'active' && local.retell_phone_id) {
          // We think it's in Retell but it isn't
          discrepancies++;
          console.log(`Discrepancy: ${local.number} has retell_phone_id but not found in Retell list`);
        }
      }

      // Update sync timestamp
      localStorage.setItem('last-sync-timestamp', new Date().toISOString());

      const syncResults = {
        timestamp: new Date().toISOString(),
        localNumbers: localNumbers?.length || 0,
        retellNumbers: retellNumbers.length,
        syncedNumbers: syncedCount,
        updatedNumbers: updatedCount,
        discrepancies,
      };

      localStorage.setItem('sync-results', JSON.stringify(syncResults));

      toast({
        title: 'Sync Complete',
        description: `Found ${syncedCount} matching numbers. Updated ${updatedCount} with Retell IDs.${discrepancies > 0 ? ` ${discrepancies} discrepancies.` : ''}`,
        variant: discrepancies > 0 ? 'destructive' : 'default',
      });

      return syncResults;
    } catch (error: any) {
      toast({
        title: 'Sync Error',
        description: error.message || 'Failed to sync number status',
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsSyncing(false);
    }
  };

  const getLastSyncInfo = () => {
    const lastSync = localStorage.getItem('last-sync-timestamp');
    const syncResults = localStorage.getItem('sync-results');

    return {
      lastSync: lastSync ? new Date(lastSync) : null,
      results: syncResults ? JSON.parse(syncResults) : null,
    };
  };

  return {
    syncNumberStatus,
    getLastSyncInfo,
    isSyncing,
  };
};
