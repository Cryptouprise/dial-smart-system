
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useRetellAI } from '@/hooks/useRetellAI';
import { supabase } from '@/integrations/supabase/client';

export const useNumberSync = () => {
  const [isSyncing, setIsSyncing] = useState(false);
  const { toast } = useToast();
  const { listPhoneNumbers } = useRetellAI();

  const syncNumberStatus = async () => {
    setIsSyncing(true);
    
    try {
      // Get local numbers from database
      const { data: localNumbers, error: localError } = await supabase
        .from('phone_numbers')
        .select('*');

      if (localError) throw localError;

      // Get Retell numbers
      const retellNumbers = await listPhoneNumbers();
      
      if (!retellNumbers) {
        toast({
          title: "Sync Failed",
          description: "Could not fetch Retell AI numbers. Check your API credentials.",
          variant: "destructive"
        });
        return;
      }

      let syncedCount = 0;
      let discrepancies = 0;

      // Check each local number against Retell status
      for (const localNumber of localNumbers || []) {
        const retellNumber = retellNumbers.find(r => r.phone_number === localNumber.number);
        
        if (retellNumber) {
          // Number exists in both systems - check for discrepancies
          const hasDiscrepancy = localNumber.status === 'active' && !retellNumber.inbound_agent_id;
          
          if (hasDiscrepancy) {
            discrepancies++;
            console.log(`Discrepancy found: ${localNumber.number} is active locally but has no agent in Retell`);
          }
          
          syncedCount++;
        } else if (localNumber.status === 'active') {
          // Local number is active but not in Retell - potential issue
          discrepancies++;
          console.log(`Discrepancy found: ${localNumber.number} is active locally but not found in Retell AI`);
        }
      }

      // Update sync timestamp
      localStorage.setItem('last-sync-timestamp', new Date().toISOString());
      
      // Store sync results
      const syncResults = {
        timestamp: new Date().toISOString(),
        localNumbers: localNumbers?.length || 0,
        retellNumbers: retellNumbers.length,
        syncedNumbers: syncedCount,
        discrepancies
      };
      
      localStorage.setItem('sync-results', JSON.stringify(syncResults));

      toast({
        title: "Sync Complete",
        description: `Synced ${syncedCount} numbers. ${discrepancies} discrepancies found.`,
        variant: discrepancies > 0 ? "destructive" : "default"
      });

      return syncResults;
      
    } catch (error: any) {
      toast({
        title: "Sync Error",
        description: error.message || "Failed to sync number status",
        variant: "destructive"
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
      results: syncResults ? JSON.parse(syncResults) : null
    };
  };

  return {
    syncNumberStatus,
    getLastSyncInfo,
    isSyncing
  };
};
