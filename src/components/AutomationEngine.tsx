
import React, { useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useRetellAI } from '@/hooks/useRetellAI';

interface AutomationEngineProps {
  numbers: any[];
  onRefreshNumbers: () => void;
}

const AutomationEngine = ({ numbers, onRefreshNumbers }: AutomationEngineProps) => {
  const { toast } = useToast();
  const { importPhoneNumber, deletePhoneNumber, updatePhoneNumber } = useRetellAI();
  const [automationSettings, setAutomationSettings] = useState({
    autoImportOnPurchase: false,
    autoRemoveQuarantined: false,
    autoAssignAgent: false,
    defaultAgentId: '',
    terminationUri: '',
    rotationEnabled: false,
    rotationInterval: '24',
    activePoolSize: '5'
  });

  useEffect(() => {
    // Load automation settings
    const savedSettings = localStorage.getItem('automation-settings');
    if (savedSettings) {
      setAutomationSettings(JSON.parse(savedSettings));
    }
  }, []);

  // Auto-import newly purchased numbers
  useEffect(() => {
    if (!automationSettings.autoImportOnPurchase || !automationSettings.terminationUri) return;

    const checkForNewNumbers = () => {
      const importedNumbers = JSON.parse(localStorage.getItem('imported-numbers') || '[]');
      const newNumbers = numbers.filter(n => 
        n.status === 'active' && 
        !importedNumbers.includes(n.id) &&
        new Date(n.created_at) > new Date(Date.now() - 5 * 60 * 1000) // Created in last 5 minutes
      );

      newNumbers.forEach(async (number) => {
        console.log('Auto-importing new number:', number.number);
        const success = await importPhoneNumber(number.number, automationSettings.terminationUri);
        
        if (success && automationSettings.autoAssignAgent && automationSettings.defaultAgentId) {
          await updatePhoneNumber(number.number, automationSettings.defaultAgentId);
        }

        if (success) {
          const updatedImported = [...importedNumbers, number.id];
          localStorage.setItem('imported-numbers', JSON.stringify(updatedImported));
          
          toast({
            title: "Auto-Import Complete",
            description: `${number.number} automatically imported to Retell AI`,
          });
        }
      });
    };

    const interval = setInterval(checkForNewNumbers, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, [numbers, automationSettings, importPhoneNumber, updatePhoneNumber, toast]);

  // Auto-remove quarantined numbers from Retell
  useEffect(() => {
    if (!automationSettings.autoRemoveQuarantined) return;

    const checkQuarantinedNumbers = () => {
      const quarantinedNumbers = numbers.filter(n => n.status === 'quarantined');
      const removedNumbers = JSON.parse(localStorage.getItem('removed-quarantined') || '[]');

      quarantinedNumbers.forEach(async (number) => {
        if (!removedNumbers.includes(number.id)) {
          console.log('Auto-removing quarantined number:', number.number);
          const success = await deletePhoneNumber(number.number);
          
          if (success) {
            const updatedRemoved = [...removedNumbers, number.id];
            localStorage.setItem('removed-quarantined', JSON.stringify(updatedRemoved));
            
            toast({
              title: "Auto-Removal Complete",
              description: `${number.number} removed from Retell AI due to quarantine`,
            });
          }
        }
      });
    };

    const interval = setInterval(checkQuarantinedNumbers, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [numbers, automationSettings, deletePhoneNumber, toast]);

  // Automatic rotation scheduler
  useEffect(() => {
    if (!automationSettings.rotationEnabled) return;

    const executeRotation = async () => {
      console.log('Executing automatic rotation...');
      
      // Get current Retell numbers (mock for now)
      const activeNumbers = numbers.filter(n => n.status === 'active');
      const highVolumeNumbers = activeNumbers.filter(n => n.daily_calls > 40);
      
      if (highVolumeNumbers.length > 0) {
        // Remove high volume numbers and replace with fresh ones
        for (const number of highVolumeNumbers.slice(0, 2)) {
          await deletePhoneNumber(number.number);
          
          // Find replacement number
          const replacement = activeNumbers.find(n => 
            n.daily_calls < 10 && 
            !highVolumeNumbers.includes(n)
          );
          
          if (replacement && automationSettings.terminationUri) {
            await importPhoneNumber(replacement.number, automationSettings.terminationUri);
            
            if (automationSettings.defaultAgentId) {
              await updatePhoneNumber(replacement.number, automationSettings.defaultAgentId);
            }
          }
        }
        
        toast({
          title: "Automatic Rotation Complete",
          description: `Rotated ${highVolumeNumbers.length} high-volume numbers`,
        });

        // Log rotation event
        const rotationEvent = {
          type: 'automatic',
          numbersAdded: [],
          numbersRemoved: highVolumeNumbers.map(n => n.number),
          reason: `Scheduled rotation (${automationSettings.rotationInterval}h interval)`,
          agentId: automationSettings.defaultAgentId
        };
        
        const history = JSON.parse(localStorage.getItem('rotation-history') || '[]');
        localStorage.setItem('rotation-history', JSON.stringify([rotationEvent, ...history]));
      }
    };

    const intervalHours = parseInt(automationSettings.rotationInterval);
    const interval = setInterval(executeRotation, intervalHours * 60 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, [automationSettings, numbers, importPhoneNumber, deletePhoneNumber, updatePhoneNumber, toast]);

  // This component doesn't render anything - it's just the automation engine
  return null;
};

export default AutomationEngine;
