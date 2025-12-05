import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface ComplianceMetrics {
  abandonmentRate: number;
  callsToday: number;
  callsThisHour: number;
  complianceViolations: number;
  isWithinCallingHours: boolean;
  dncViolations: number;
}

interface ComplianceCheck {
  passed: boolean;
  violations: string[];
  warnings: string[];
}

export const useCampaignCompliance = (campaignId: string | null) => {
  const [metrics, setMetrics] = useState<ComplianceMetrics>({
    abandonmentRate: 0,
    callsToday: 0,
    callsThisHour: 0,
    complianceViolations: 0,
    isWithinCallingHours: true,
    dncViolations: 0
  });
  const [isMonitoring, setIsMonitoring] = useState(false);
  const { toast } = useToast();

  // Check if current time is within calling hours
  const checkCallingHours = useCallback(async (campaignId: string): Promise<boolean> => {
    try {
      const { data: campaign, error } = await supabase
        .from('campaigns')
        .select('calling_hours_start, calling_hours_end, timezone')
        .eq('id', campaignId)
        .single();

      if (error || !campaign) return false;

      const now = new Date();
      const currentTime = now.toLocaleTimeString('en-US', { 
        hour12: false, 
        timeZone: campaign.timezone 
      });
      
      const [currentHour, currentMinute] = currentTime.split(':').map(Number);
      const currentMinutes = currentHour * 60 + currentMinute;

      const [startHour, startMinute] = campaign.calling_hours_start.split(':').map(Number);
      const startMinutes = startHour * 60 + startMinute;

      const [endHour, endMinute] = campaign.calling_hours_end.split(':').map(Number);
      const endMinutes = endHour * 60 + endMinute;

      return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    } catch (error) {
      console.error('Error checking calling hours:', error);
      return false;
    }
  }, []);

  // Calculate abandonment rate
  const calculateAbandonmentRate = useCallback(async (campaignId: string): Promise<number> => {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const { data: calls, error } = await supabase
        .from('call_logs')
        .select('status, outcome')
        .eq('campaign_id', campaignId)
        .gte('created_at', today);

      if (error) throw error;

      const totalAnswered = calls?.filter(c => 
        c.status === 'completed' || c.status === 'answered'
      ).length || 0;

      const abandoned = calls?.filter(c => 
        c.outcome === 'abandoned' || c.status === 'abandoned'
      ).length || 0;

      if (totalAnswered === 0) return 0;
      return (abandoned / totalAnswered) * 100;
    } catch (error) {
      console.error('Error calculating abandonment rate:', error);
      return 0;
    }
  }, []);

  // Check for DNC violations
  const checkDNCCompliance = useCallback(async (campaignId: string): Promise<number> => {
    try {
      const { data: violations, error } = await supabase
        .from('call_logs')
        .select('id, phone_number')
        .eq('campaign_id', campaignId)
        .eq('outcome', 'dnc_violation');

      if (error) throw error;
      return violations?.length || 0;
    } catch (error) {
      console.error('Error checking DNC compliance:', error);
      return 0;
    }
  }, []);

  // Perform comprehensive compliance check
  const performComplianceCheck = useCallback(async (campaignId: string): Promise<ComplianceCheck> => {
    const violations: string[] = [];
    const warnings: string[] = [];

    // Check abandonment rate (FCC limit: 3%)
    const abandonmentRate = await calculateAbandonmentRate(campaignId);
    if (abandonmentRate > 3) {
      violations.push(`Abandonment rate ${abandonmentRate.toFixed(2)}% exceeds FCC limit of 3%`);
    } else if (abandonmentRate > 2.5) {
      warnings.push(`Abandonment rate ${abandonmentRate.toFixed(2)}% approaching FCC limit`);
    }

    // Check calling hours
    const withinHours = await checkCallingHours(campaignId);
    if (!withinHours) {
      violations.push('Current time is outside allowed calling hours');
    }

    // Check DNC violations
    const dncViolations = await checkDNCCompliance(campaignId);
    if (dncViolations > 0) {
      violations.push(`${dncViolations} DNC violations detected`);
    }

    // Check call volume limits
    const today = new Date().toISOString().split('T')[0];
    const { data: todayCalls } = await supabase
      .from('call_logs')
      .select('id', { count: 'exact' })
      .eq('campaign_id', campaignId)
      .gte('created_at', today);

    const callsToday = todayCalls?.length || 0;
    if (callsToday > 1000) {
      warnings.push(`High call volume today: ${callsToday} calls`);
    }

    return {
      passed: violations.length === 0,
      violations,
      warnings
    };
  }, [calculateAbandonmentRate, checkCallingHours, checkDNCCompliance]);

  // Auto-pause campaign on compliance violation
  const autoPauseCampaign = useCallback(async (campaignId: string, reason: string) => {
    try {
      const { error } = await supabase
        .from('campaigns')
        .update({ 
          status: 'paused',
          updated_at: new Date().toISOString()
        })
        .eq('id', campaignId);

      if (error) throw error;

      // Log compliance violation
      await supabase
        .from('compliance_violations')
        .insert({
          campaign_id: campaignId,
          violation_type: 'auto_pause',
          reason: reason,
          detected_at: new Date().toISOString()
        });

      toast({
        title: "Campaign Auto-Paused",
        description: reason,
        variant: "destructive"
      });

      return true;
    } catch (error) {
      console.error('Error auto-pausing campaign:', error);
      return false;
    }
  }, [toast]);

  // Monitor campaign compliance in real-time
  const startMonitoring = useCallback(async () => {
    if (!campaignId || isMonitoring) return;

    setIsMonitoring(true);

    const monitorInterval = setInterval(async () => {
      const check = await performComplianceCheck(campaignId);
      
      if (!check.passed) {
        // Auto-pause campaign on violation
        await autoPauseCampaign(campaignId, check.violations.join('; '));
        clearInterval(monitorInterval);
        setIsMonitoring(false);
      } else if (check.warnings.length > 0) {
        // Show warnings but don't pause
        toast({
          title: "Compliance Warning",
          description: check.warnings.join('; '),
          variant: "default"
        });
      }

      // Update metrics
      const abandonmentRate = await calculateAbandonmentRate(campaignId);
      const withinHours = await checkCallingHours(campaignId);
      const dncViolations = await checkDNCCompliance(campaignId);

      setMetrics({
        abandonmentRate,
        callsToday: 0, // TODO: Implement
        callsThisHour: 0, // TODO: Implement
        complianceViolations: check.violations.length,
        isWithinCallingHours: withinHours,
        dncViolations
      });
    }, 60000); // Check every minute

    return () => {
      clearInterval(monitorInterval);
      setIsMonitoring(false);
    };
  }, [campaignId, isMonitoring, performComplianceCheck, autoPauseCampaign, calculateAbandonmentRate, checkCallingHours, checkDNCCompliance, toast]);

  const stopMonitoring = useCallback(() => {
    setIsMonitoring(false);
  }, []);

  useEffect(() => {
    if (campaignId) {
      startMonitoring();
    }
    return () => {
      stopMonitoring();
    };
  }, [campaignId, startMonitoring, stopMonitoring]);

  return {
    metrics,
    isMonitoring,
    performComplianceCheck,
    autoPauseCampaign,
    startMonitoring,
    stopMonitoring
  };
};
