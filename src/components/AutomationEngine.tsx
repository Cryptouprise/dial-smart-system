import React, { useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useRetellAI } from '@/hooks/useRetellAI';
import { supabase } from '@/integrations/supabase/client';

interface AutomationEngineProps {
  numbers: any[];
  onRefreshNumbers: () => void;
}

const AutomationEngine = ({ numbers, onRefreshNumbers }: AutomationEngineProps) => {
  const { toast } = useToast();
  const { importPhoneNumber, deletePhoneNumber, updatePhoneNumber, listPhoneNumbers } = useRetellAI();
  const [automationSettings, setAutomationSettings] = useState({
    enabled: true,
    rotation_interval_hours: 24,
    high_volume_threshold: 50,
    auto_import_enabled: false,
    auto_remove_quarantined: false,
    defaultAgentId: '',
    terminationUri: ''
  });

  useEffect(() => {
    loadSettingsFromDatabase();
  }, []);

  const loadSettingsFromDatabase = async () => {
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) return;

      const response = await fetch(
        `https://emonjusymdripmkvtttc.supabase.co/functions/v1/enhanced-rotation-manager?action=settings`,
        {
          headers: {
            'Authorization': `Bearer ${session.session.access_token}`,
            'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtb25qdXN5bWRyaXBta3Z0dHRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg3MzYyNDcsImV4cCI6MjA2NDMxMjI0N30.NPmcCmeJwR_vNymUZp73G9PqbsiPJ7KSTA9x8xG6Soc'
          }
        }
      );

      const result = await response.json();

      if (result?.settings) {
        setAutomationSettings(prev => ({
          ...prev,
          ...result.settings,
          // Keep localStorage values for UI-only settings
          defaultAgentId: localStorage.getItem('defaultAgentId') || '',
          terminationUri: localStorage.getItem('terminationUri') || ''
        }));
      }
    } catch (error) {
      console.error('Failed to load settings from database:', error);
      // Fallback to localStorage
      const savedSettings = localStorage.getItem('automation-settings');
      if (savedSettings) {
        setAutomationSettings(JSON.parse(savedSettings));
      }
    }
  };

  // Auto-import newly purchased numbers
  useEffect(() => {
    if (!automationSettings.auto_import_enabled || !automationSettings.terminationUri) return;

    const checkForNewNumbers = async () => {
      const importedNumbers = JSON.parse(localStorage.getItem('imported-numbers') || '[]');
      const newNumbers = numbers.filter(n => 
        n.status === 'active' && 
        !importedNumbers.includes(n.id) &&
        new Date(n.created_at) > new Date(Date.now() - 5 * 60 * 1000) // Created in last 5 minutes
      );

      for (const number of newNumbers) {
        console.log('Auto-importing new number:', number.number);
        const success = await importPhoneNumber(number.number, automationSettings.terminationUri);
        
        if (success && automationSettings.defaultAgentId) {
          await updatePhoneNumber(number.number, automationSettings.defaultAgentId);
        }

        if (success) {
          const updatedImported = [...importedNumbers, number.id];
          localStorage.setItem('imported-numbers', JSON.stringify(updatedImported));
          
          // Log to database
          await supabase.functions.invoke('enhanced-rotation-manager', {
            method: 'POST',
            body: {
              action: 'log_event',
              event: {
                action_type: 'import',
                phone_number: number.number,
                reason: 'Auto-import on purchase',
                metadata: { trigger: 'automatic', agent_id: automationSettings.defaultAgentId }
              }
            }
          });
          
          toast({
            title: "Auto-Import Complete",
            description: `${number.number} automatically imported to Retell AI`,
          });
        }
      }
    };

    const interval = setInterval(checkForNewNumbers, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, [numbers, automationSettings, importPhoneNumber, updatePhoneNumber, toast]);

  // Auto-remove quarantined numbers from Retell
  useEffect(() => {
    if (!automationSettings.auto_remove_quarantined) return;

    const checkQuarantinedNumbers = async () => {
      const quarantinedNumbers = numbers.filter(n => n.status === 'quarantined');
      const removedNumbers = JSON.parse(localStorage.getItem('removed-quarantined') || '[]');

      for (const number of quarantinedNumbers) {
        if (!removedNumbers.includes(number.id)) {
          console.log('Auto-removing quarantined number:', number.number);
          const success = await deletePhoneNumber(number.number);
          
          if (success) {
            const updatedRemoved = [...removedNumbers, number.id];
            localStorage.setItem('removed-quarantined', JSON.stringify(updatedRemoved));
            
            // Log to database
            await supabase.functions.invoke('enhanced-rotation-manager', {
              method: 'POST',
              body: {
                action: 'log_event',
                event: {
                  action_type: 'remove',
                  phone_number: number.number,
                  reason: 'Auto-removal due to quarantine',
                  metadata: { trigger: 'automatic', previous_status: 'quarantined' }
                }
              }
            });
            
            toast({
              title: "Auto-Removal Complete",
              description: `${number.number} removed from Retell AI due to quarantine`,
            });
          }
        }
      }
    };

    const interval = setInterval(checkQuarantinedNumbers, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [numbers, automationSettings, deletePhoneNumber, toast]);

  // Automatic rotation scheduler - Enhanced with database backend
  useEffect(() => {
    if (!automationSettings.enabled) return;

    const executeRotation = async () => {
      console.log('Executing automatic rotation via backend...');
      
      try {
        const response = await supabase.functions.invoke('enhanced-rotation-manager', {
          method: 'POST',
          body: {
            action: 'execute_rotation'
          }
        });

        if (response.data?.success) {
          const rotatedCount = response.data.rotated_count;
          
          if (rotatedCount > 0) {
            toast({
              title: "Automatic Rotation Complete",
              description: `Rotated ${rotatedCount} high-volume numbers`,
            });

            // Refresh numbers to show updated status
            onRefreshNumbers();
          }
        }
      } catch (error) {
        console.error('Backend rotation execution error:', error);
        
        // Fallback to original rotation logic
        await executeFallbackRotation();
      }
    };

    const executeFallbackRotation = async () => {
      try {
        const retellNumbers = await listPhoneNumbers();
        if (!retellNumbers) return;

        const activeNumbers = numbers.filter(n => n.status === 'active');
        const highVolumeNumbers = activeNumbers.filter(n => n.daily_calls > automationSettings.high_volume_threshold);
        
        if (highVolumeNumbers.length > 0) {
          let rotatedCount = 0;
          
          for (const number of highVolumeNumbers.slice(0, 2)) {
            const isInRetell = retellNumbers.find(r => r.phone_number === number.number);
            
            if (isInRetell) {
              await deletePhoneNumber(number.number);
              rotatedCount++;
              
              const replacement = activeNumbers.find(n => 
                n.daily_calls < 10 && 
                !highVolumeNumbers.includes(n) &&
                !retellNumbers.find(r => r.phone_number === n.number)
              );
              
              if (replacement && automationSettings.terminationUri) {
                await importPhoneNumber(replacement.number, automationSettings.terminationUri);
                
                if (automationSettings.defaultAgentId) {
                  await updatePhoneNumber(replacement.number, automationSettings.defaultAgentId);
                }
                
                console.log(`Rotated ${number.number} -> ${replacement.number}`);
              }
            }
          }
          
          if (rotatedCount > 0) {
            toast({
              title: "Automatic Rotation Complete",
              description: `Rotated ${rotatedCount} high-volume numbers`,
            });

            onRefreshNumbers();
          }
        }
      } catch (error) {
        console.error('Fallback rotation execution error:', error);
      }
    };

    const intervalHours = automationSettings.rotation_interval_hours;
    const interval = setInterval(executeRotation, intervalHours * 60 * 60 * 1000);
    
    // Also run once on startup if enabled
    setTimeout(executeRotation, 5000);
    
    return () => clearInterval(interval);
  }, [automationSettings, numbers, importPhoneNumber, deletePhoneNumber, updatePhoneNumber, listPhoneNumbers, toast, onRefreshNumbers]);

  return null;
};

export default AutomationEngine;
