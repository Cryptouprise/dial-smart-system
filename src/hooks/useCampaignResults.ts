import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface CampaignMetrics {
  totalCalls: number;
  connectedCalls: number;
  connectionRate: number;
  avgDuration: number;
  appointmentsSet: number;
  voicemailsLeft: number;
  smsSent: number;
  smsReplied: number;
  dispositions: Record<string, number>;
  leadStatuses: Record<string, number>;
  callsByHour: { hour: number; count: number; connected: number }[];
  callsByDay: { date: string; count: number; connected: number }[];
  callStatuses: Record<string, number>; // Raw status breakdown for debugging
}

export const useCampaignResults = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [metrics, setMetrics] = useState<CampaignMetrics | null>(null);

  const fetchCampaignResults = useCallback(async (campaignId: string, dateRange?: { start: Date; end: Date }) => {
    setIsLoading(true);
    try {
      // Get call logs for campaign
      let callQuery = supabase
        .from('call_logs')
        .select('*')
        .eq('campaign_id', campaignId);

      if (dateRange) {
        callQuery = callQuery
          .gte('created_at', dateRange.start.toISOString())
          .lte('created_at', dateRange.end.toISOString());
      }

      const { data: callLogs, error: callError } = await callQuery;
      if (callError) throw callError;

      // Get campaign leads with their statuses
      const { data: campaignLeads } = await supabase
        .from('campaign_leads')
        .select('lead_id')
        .eq('campaign_id', campaignId);

      const leadIds = (campaignLeads || []).map(cl => cl.lead_id).filter(Boolean);
      
      let leads: any[] = [];
      if (leadIds.length > 0) {
        const { data: leadsData } = await supabase
          .from('leads')
          .select('id, status')
          .in('id', leadIds);
        leads = leadsData || [];
      }

      // Get SMS for campaign leads
      let smsCount = 0;
      let smsReplies = 0;
      if (leadIds.length > 0) {
        const { data: smsData } = await supabase
          .from('sms_messages')
          .select('direction')
          .in('lead_id', leadIds);

        smsCount = (smsData || []).filter(s => s.direction === 'outbound').length;
        smsReplies = (smsData || []).filter(s => s.direction === 'inbound').length;
      }

      // Calculate metrics - improved connected detection
      const calls = callLogs || [];
      const totalCalls = calls.length;
      
      // Count connected calls more accurately - check multiple indicators
      const connectedCalls = calls.filter(c => 
        c.status === 'completed' || 
        c.status === 'answered' || 
        c.status === 'in-progress' ||
        c.duration_seconds > 0 ||
        c.answered_at !== null ||
        c.outcome === 'completed' ||
        c.outcome === 'Interested' ||
        c.outcome === 'Appointment Set' ||
        c.outcome === 'Callback Requested' ||
        c.outcome === 'Left Voicemail' ||
        c.outcome === 'Contacted'
      ).length;
      
      const connectionRate = totalCalls > 0 ? (connectedCalls / totalCalls) * 100 : 0;
      
      const durations = calls.filter(c => c.duration_seconds > 0).map(c => c.duration_seconds);
      const avgDuration = durations.length > 0 
        ? durations.reduce((a, b) => a + b, 0) / durations.length 
        : 0;

      // Count dispositions and raw statuses
      const dispositions: Record<string, number> = {};
      const callStatuses: Record<string, number> = {};
      calls.forEach(c => {
        const outcome = c.outcome || 'No Outcome';
        dispositions[outcome] = (dispositions[outcome] || 0) + 1;
        
        const status = c.status || 'unknown';
        callStatuses[status] = (callStatuses[status] || 0) + 1;
      });

      const appointmentsSet = dispositions['Appointment Set'] || dispositions['appointment_set'] || 0;
      const voicemailsLeft = dispositions['Voicemail'] || dispositions['voicemail'] || dispositions['Left Voicemail'] || 0;

      // Count lead statuses
      const leadStatuses: Record<string, number> = {};
      leads.forEach(l => {
        const status = l.status || 'new';
        leadStatuses[status] = (leadStatuses[status] || 0) + 1;
      });

      // Calls by hour - use connected logic
      const isConnected = (c: any) => 
        c.status === 'completed' || 
        c.status === 'answered' || 
        c.status === 'in-progress' ||
        c.duration_seconds > 0 ||
        c.answered_at !== null;
        
      const callsByHour: { hour: number; count: number; connected: number }[] = [];
      for (let i = 0; i < 24; i++) {
        const hourCalls = calls.filter(c => new Date(c.created_at).getHours() === i);
        callsByHour.push({
          hour: i,
          count: hourCalls.length,
          connected: hourCalls.filter(isConnected).length
        });
      }

      // Calls by day (last 7 days)
      const callsByDay: { date: string; count: number; connected: number }[] = [];
      const today = new Date();
      for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        
        const dayCalls = calls.filter(c => c.created_at.startsWith(dateStr));
        callsByDay.push({
          date: dateStr,
          count: dayCalls.length,
          connected: dayCalls.filter(isConnected).length
        });
      }

      const result: CampaignMetrics = {
        totalCalls,
        connectedCalls,
        connectionRate,
        avgDuration,
        appointmentsSet,
        voicemailsLeft,
        smsSent: smsCount,
        smsReplied: smsReplies,
        dispositions,
        leadStatuses,
        callsByHour,
        callsByDay,
        callStatuses
      };

      setMetrics(result);
      return result;
    } catch (error) {
      console.error('Error fetching campaign results:', error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { fetchCampaignResults, metrics, isLoading };
};
