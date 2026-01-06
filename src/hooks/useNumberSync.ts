import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useRetellAI } from '@/hooks/useRetellAI';
import { supabase } from '@/integrations/supabase/client';

export const useNumberSync = () => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const { toast } = useToast();
  const { listPhoneNumbers } = useRetellAI();

  // Normalize phone to last 10 digits for comparison
  const normalize = (phone: string) => phone.replace(/\D/g, '').slice(-10);

  // Extract area code from phone number
  const extractAreaCode = (phone: string): string => {
    const digits = phone.replace(/\D/g, '');
    // If it starts with 1 (US country code), skip it
    if (digits.length === 11 && digits.startsWith('1')) {
      return digits.substring(1, 4);
    }
    // Otherwise take first 3 digits
    return digits.substring(0, 3);
  };

  // Format phone number to E.164 format
  const formatE164 = (phone: string): string => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) {
      return `+1${digits}`;
    }
    if (digits.length === 11 && digits.startsWith('1')) {
      return `+${digits}`;
    }
    // Already formatted or international
    if (phone.startsWith('+')) {
      return phone;
    }
    return `+${digits}`;
  };

  // Import ALL numbers from Retell that don't exist locally
  const importAllFromRetell = async () => {
    setIsImporting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Get Retell numbers
      const retellNumbers = await listPhoneNumbers();
      if (!retellNumbers || retellNumbers.length === 0) {
        toast({
          title: 'No Numbers Found',
          description: 'Could not find any phone numbers in your Retell account.',
          variant: 'destructive',
        });
        return null;
      }

      // Get local numbers from database
      const { data: localNumbers, error: localError } = await supabase
        .from('phone_numbers')
        .select('number')
        .eq('user_id', user.id);

      if (localError) throw localError;

      // Build set of normalized local numbers for fast lookup
      const localSet = new Set((localNumbers || []).map(n => normalize(n.number)));

      let importedCount = 0;
      let skippedCount = 0;
      const imported: string[] = [];

      for (const rn of retellNumbers) {
        const normalized = normalize(rn.phone_number);
        
        if (localSet.has(normalized)) {
          skippedCount++;
          continue;
        }

        // Import this number to local database
        const formattedNumber = formatE164(rn.phone_number);
        const areaCode = extractAreaCode(rn.phone_number);
        const retellPhoneId = (rn as any).phone_number_id || rn.phone_number;

        const { error: insertError } = await supabase
          .from('phone_numbers')
          .insert({
            user_id: user.id,
            number: formattedNumber,
            area_code: areaCode,
            provider: 'retell',
            status: 'active',
            purpose: 'general_rotation',
            retell_phone_id: retellPhoneId,
            daily_calls: 0,
            external_spam_score: 0,
            is_spam: false
          });

        if (!insertError) {
          importedCount++;
          imported.push(formattedNumber);
          console.log(`[ImportAll] Imported ${formattedNumber} with retell_phone_id = ${retellPhoneId}`);
        } else {
          console.error(`[ImportAll] Failed to import ${formattedNumber}:`, insertError);
        }
      }

      const results = {
        timestamp: new Date().toISOString(),
        retellTotal: retellNumbers.length,
        imported: importedCount,
        skipped: skippedCount,
        importedNumbers: imported
      };

      localStorage.setItem('import-results', JSON.stringify(results));

      toast({
        title: importedCount > 0 ? 'Import Complete' : 'No New Numbers',
        description: importedCount > 0 
          ? `Imported ${importedCount} new numbers from Retell. ${skippedCount} already existed.`
          : `All ${retellNumbers.length} Retell numbers already exist in your database.`,
        variant: 'default',
      });

      return results;
    } catch (error: any) {
      toast({
        title: 'Import Error',
        description: error.message || 'Failed to import numbers from Retell',
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsImporting(false);
    }
  };

  // Two-way sync: Import new + Update existing
  const fullSync = async () => {
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

      // Build set of local numbers
      const localSet = new Set((localNumbers || []).map(n => normalize(n.number)));

      let syncedCount = 0;
      let updatedCount = 0;
      let importedCount = 0;
      let discrepancies = 0;

      // Step 1: Update existing local numbers with Retell data
      for (const local of localNumbers || []) {
        const key = normalize(local.number);
        const retell = retellByPhone[key];

        if (retell) {
          syncedCount++;

          // If local doesn't have retell_phone_id yet, update it
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

      // Step 2: Import new numbers from Retell that don't exist locally
      for (const rn of retellNumbers) {
        const normalized = normalize(rn.phone_number);
        
        if (!localSet.has(normalized)) {
          // This Retell number doesn't exist locally - import it
          const formattedNumber = formatE164(rn.phone_number);
          const areaCode = extractAreaCode(rn.phone_number);
          const retellPhoneId = (rn as any).phone_number_id || rn.phone_number;

          const { error: insertError } = await supabase
            .from('phone_numbers')
            .insert({
              user_id: user.id,
              number: formattedNumber,
              area_code: areaCode,
              provider: 'retell',
              status: 'active',
              purpose: 'general_rotation',
              retell_phone_id: retellPhoneId,
              daily_calls: 0,
              external_spam_score: 0,
              is_spam: false
            });

          if (!insertError) {
            importedCount++;
            console.log(`[Sync] Imported new number ${formattedNumber} from Retell`);
          } else {
            console.error(`[Sync] Failed to import ${formattedNumber}:`, insertError);
          }
        }
      }

      // Update sync timestamp
      localStorage.setItem('last-sync-timestamp', new Date().toISOString());

      const syncResults = {
        timestamp: new Date().toISOString(),
        localNumbers: (localNumbers?.length || 0) + importedCount,
        retellNumbers: retellNumbers.length,
        syncedNumbers: syncedCount,
        updatedNumbers: updatedCount,
        importedNumbers: importedCount,
        discrepancies,
      };

      localStorage.setItem('sync-results', JSON.stringify(syncResults));

      const messages: string[] = [];
      if (importedCount > 0) messages.push(`Imported ${importedCount} new`);
      if (updatedCount > 0) messages.push(`Updated ${updatedCount}`);
      if (syncedCount > 0 && importedCount === 0 && updatedCount === 0) messages.push(`${syncedCount} already synced`);
      if (discrepancies > 0) messages.push(`${discrepancies} need attention`);

      toast({
        title: 'Full Sync Complete',
        description: messages.join('. ') + '.',
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

  // Original sync that only updates existing (kept for backward compatibility)
  const syncNumberStatus = async () => {
    // Now just calls fullSync for better UX
    return fullSync();
  };

  const getLastSyncInfo = () => {
    const lastSync = localStorage.getItem('last-sync-timestamp');
    const syncResults = localStorage.getItem('sync-results');
    const importResults = localStorage.getItem('import-results');

    return {
      lastSync: lastSync ? new Date(lastSync) : null,
      results: syncResults ? JSON.parse(syncResults) : null,
      importResults: importResults ? JSON.parse(importResults) : null,
    };
  };

  return {
    syncNumberStatus,
    fullSync,
    importAllFromRetell,
    getLastSyncInfo,
    isSyncing,
    isImporting,
  };
};
