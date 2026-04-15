import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Human-indicating dispositions (the lead actually talked to us)
const HUMAN_DISPOSITIONS = new Set([
  'Follow Up', 'follow_up',
  'Not Interested', 'not_interested',
  'DNC', 'dnc', 'do_not_call',
  'Callback', 'callback', 'callback_requested', 'Callback Requested',
  'Already Has Solar', 'already_has_solar',
  'Potential Prospect', 'potential_prospect',
  'Appointment Booked', 'appointment_booked', 'appointment_set',
  'Interested', 'interested',
  'Wrong Number', 'wrong_number',
  'Transferred', 'transferred',
  'Contacted', 'contacted',
  'Dial Tree Workflow', 'dial_tree_workflow',
]);

const VOICEMAIL_OUTCOMES = new Set([
  'Voicemail', 'voicemail', 'Left Voicemail', 'left_voicemail',
]);

export interface CampaignMetrics {
  totalCalls: number;
  // Legacy "connected" (reached = any audio/VM)
  connectedCalls: number;
  connectionRate: number;
  // NEW: Honest metrics
  humanConversations: number;
  humanConversationRate: number;
  voicemailsReached: number;
  retryableCalls: number;
  neverConnected: number;
  // Existing
  avgDuration: number;
  appointmentsSet: number;
  voicemailsLeft: number;
  smsSent: number;
  smsReplied: number;
  dispositions: Record<string, number>;
  leadStatuses: Record<string, number>;
  callsByHour: { hour: number; count: number; connected: number; humans: number }[];
  callsByDay: { date: string; count: number; connected: number; humans: number }[];
  callStatuses: Record<string, number>;
}

function isHumanConversation(c: any): boolean {
  const disp = c.auto_disposition || '';
  const outcome = c.outcome || '';
  // Must have a human-indicating disposition or outcome AND meaningful duration
  return (HUMAN_DISPOSITIONS.has(disp) || HUMAN_DISPOSITIONS.has(outcome)) && (c.duration_seconds || 0) > 15;
}

function isVoicemail(c: any): boolean {
  const disp = c.auto_disposition || '';
  const outcome = c.outcome || '';
  return VOICEMAIL_OUTCOMES.has(disp) || VOICEMAIL_OUTCOMES.has(outcome);
}

function isRetryable(c: any): boolean {
  // Failed calls (never connected) or no-answer with no human disposition
  const status = c.status || '';
  const outcome = c.outcome || '';
  const disp = c.auto_disposition || '';
  if (status === 'failed' || status === 'error') return true;
  if (outcome === 'no_answer' || outcome === 'no-answer' || status === 'no-answer' || status === 'no_answer') {
    return !HUMAN_DISPOSITIONS.has(disp);
  }
  if (outcome === 'busy') return true;
  return false;
}

function isReached(c: any): boolean {
  return c.status === 'completed' || c.status === 'answered' || c.status === 'in-progress' ||
    (c.duration_seconds || 0) > 0 || c.answered_at !== null;
}

export const useCampaignResults = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [metrics, setMetrics] = useState<CampaignMetrics | null>(null);

  const fetchCampaignResults = useCallback(async (campaignId: string, dateRange?: { start: Date; end: Date }) => {
    setIsLoading(true);
    try {
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

      const calls = callLogs || [];
      const totalCalls = calls.length;
      
      // Reached = any audio (includes VM) — the old "connected" number
      const connectedCalls = calls.filter(isReached).length;
      const connectionRate = totalCalls > 0 ? (connectedCalls / totalCalls) * 100 : 0;
      
      // NEW: Honest breakdown
      const humanConversations = calls.filter(isHumanConversation).length;
      const humanConversationRate = totalCalls > 0 ? (humanConversations / totalCalls) * 100 : 0;
      const voicemailsReached = calls.filter(isVoicemail).length;
      const retryableCalls = calls.filter(isRetryable).length;
      const neverConnected = calls.filter(c => {
        const s = c.status || '';
        return s === 'failed' || s === 'error' || (!c.retell_call_id && !c.telnyx_call_control_id && (c.duration_seconds || 0) === 0);
      }).length;
      
      const durations = calls.filter(c => c.duration_seconds > 0).map(c => c.duration_seconds);
      const avgDuration = durations.length > 0 
        ? durations.reduce((a: number, b: number) => a + b, 0) / durations.length 
        : 0;

      const dispositions: Record<string, number> = {};
      const callStatuses: Record<string, number> = {};
      calls.forEach(c => {
        const outcome = c.auto_disposition || c.outcome || 'No Outcome';
        dispositions[outcome] = (dispositions[outcome] || 0) + 1;
        const status = c.status || 'unknown';
        callStatuses[status] = (callStatuses[status] || 0) + 1;
      });

      const appointmentsSet = dispositions['Appointment Booked'] || dispositions['appointment_booked'] || dispositions['Appointment Set'] || dispositions['appointment_set'] || 0;
      const voicemailsLeft = dispositions['Voicemail'] || dispositions['voicemail'] || dispositions['Left Voicemail'] || 0;

      const leadStatuses: Record<string, number> = {};
      leads.forEach(l => {
        const status = l.status || 'new';
        leadStatuses[status] = (leadStatuses[status] || 0) + 1;
      });

      const callsByHour: { hour: number; count: number; connected: number; humans: number }[] = [];
      for (let i = 0; i < 24; i++) {
        const hourCalls = calls.filter(c => new Date(c.created_at).getHours() === i);
        callsByHour.push({
          hour: i,
          count: hourCalls.length,
          connected: hourCalls.filter(isReached).length,
          humans: hourCalls.filter(isHumanConversation).length,
        });
      }

      const callsByDay: { date: string; count: number; connected: number; humans: number }[] = [];
      const today = new Date();
      for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        const dayCalls = calls.filter(c => c.created_at.startsWith(dateStr));
        callsByDay.push({
          date: dateStr,
          count: dayCalls.length,
          connected: dayCalls.filter(isReached).length,
          humans: dayCalls.filter(isHumanConversation).length,
        });
      }

      const result: CampaignMetrics = {
        totalCalls,
        connectedCalls,
        connectionRate,
        humanConversations,
        humanConversationRate,
        voicemailsReached,
        retryableCalls,
        neverConnected,
        avgDuration,
        appointmentsSet,
        voicemailsLeft,
        smsSent: smsCount,
        smsReplied: smsReplies,
        dispositions,
        leadStatuses,
        callsByHour,
        callsByDay,
        callStatuses,
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
