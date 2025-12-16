import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface BroadcastReadinessCheck {
  id: string;
  label: string;
  status: 'pass' | 'fail' | 'warning' | 'loading';
  message: string;
  critical: boolean;
  fixAction?: string;
}

export interface BroadcastReadinessResult {
  checks: BroadcastReadinessCheck[];
  isReady: boolean;
  criticalFailures: number;
  warnings: number;
  blockingReasons: string[];
}

export const useBroadcastReadiness = () => {
  const [isChecking, setIsChecking] = useState(false);

  const checkBroadcastReadiness = useCallback(async (broadcastId: string): Promise<BroadcastReadinessResult> => {
    setIsChecking(true);
    const checks: BroadcastReadinessCheck[] = [];
    const blockingReasons: string[] = [];

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return {
          checks: [{ id: 'auth', label: 'Authentication', status: 'fail', message: 'Not authenticated', critical: true }],
          isReady: false,
          criticalFailures: 1,
          warnings: 0,
          blockingReasons: ['Not authenticated']
        };
      }

      // 1. Get broadcast details
      const { data: broadcast, error: broadcastError } = await supabase
        .from('voice_broadcasts')
        .select('*')
        .eq('id', broadcastId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (broadcastError || !broadcast) {
        return {
          checks: [{ id: 'broadcast', label: 'Broadcast exists', status: 'fail', message: 'Broadcast not found', critical: true }],
          isReady: false,
          criticalFailures: 1,
          warnings: 0,
          blockingReasons: ['Broadcast not found']
        };
      }

      // Check: Broadcast has name
      checks.push({
        id: 'broadcast_name',
        label: 'Broadcast name',
        status: broadcast.name ? 'pass' : 'fail',
        message: broadcast.name || 'No name set',
        critical: true
      });
      if (!broadcast.name) blockingReasons.push('Broadcast needs a name');

      // Check: Message text exists
      checks.push({
        id: 'message_text',
        label: 'Message script',
        status: broadcast.message_text ? 'pass' : 'fail',
        message: broadcast.message_text ? `${broadcast.message_text.slice(0, 50)}...` : 'No message script',
        critical: true
      });
      if (!broadcast.message_text) blockingReasons.push('No message script written');

      // Check: Audio generated (for non-AI modes)
      if (broadcast.ivr_mode !== 'ai_conversational') {
        checks.push({
          id: 'audio_generated',
          label: 'Audio generated',
          status: broadcast.audio_url ? 'pass' : 'fail',
          message: broadcast.audio_url ? 'Audio ready' : 'Click "Generate Audio" to create voice message',
          critical: true,
          fixAction: 'generate_audio'
        });
        if (!broadcast.audio_url) blockingReasons.push('Audio not generated - click Generate Audio button');
      }

      // Check: Queue has leads
      const { count: queueCount } = await supabase
        .from('broadcast_queue')
        .select('*', { count: 'exact', head: true })
        .eq('broadcast_id', broadcastId);

      const { count: pendingCount } = await supabase
        .from('broadcast_queue')
        .select('*', { count: 'exact', head: true })
        .eq('broadcast_id', broadcastId)
        .eq('status', 'pending');

      checks.push({
        id: 'leads_in_queue',
        label: 'Leads in queue',
        status: (queueCount || 0) > 0 ? 'pass' : 'fail',
        message: queueCount ? `${queueCount} total (${pendingCount || 0} pending)` : 'No leads added',
        critical: true,
        fixAction: 'add_leads'
      });
      if (!queueCount || queueCount === 0) blockingReasons.push('No leads in broadcast queue - add leads first');

      // Check: Phone numbers available
      const { data: phoneNumbers } = await supabase
        .from('phone_numbers')
        .select('id, number, status, is_spam, retell_phone_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .eq('is_spam', false);

      const availableNumbers = phoneNumbers?.filter(p => !p.retell_phone_id) || [];
      
      checks.push({
        id: 'phone_numbers',
        label: 'Phone numbers available',
        status: availableNumbers.length > 0 ? 'pass' : 'fail',
        message: availableNumbers.length > 0 
          ? `${availableNumbers.length} number(s) ready for calls` 
          : 'No phone numbers available (Retell numbers excluded for broadcasts)',
        critical: true
      });
      if (availableNumbers.length === 0) blockingReasons.push('No phone numbers available for broadcasts');

      // Check: Provider credentials (can't verify from frontend, just show as info)
      checks.push({
        id: 'provider_credentials',
        label: 'Provider credentials',
        status: 'warning',
        message: 'Verify Twilio/Telnyx credentials are set in Supabase secrets',
        critical: false
      });

      // Check: Calling hours
      const bypassHours = broadcast.bypass_calling_hours === true;
      if (!bypassHours) {
        const timezone = broadcast.timezone || 'America/New_York';
        const startTime = broadcast.calling_hours_start || '09:00';
        const endTime = broadcast.calling_hours_end || '17:00';
        
        // Get current time in broadcast timezone
        const now = new Date();
        const options: Intl.DateTimeFormatOptions = {
          timeZone: timezone,
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        };
        const currentTimeStr = now.toLocaleTimeString('en-US', options);
        const [currentHour, currentMinute] = currentTimeStr.split(':').map(Number);
        const currentMinutes = currentHour * 60 + currentMinute;
        
        const [startHour, startMin] = startTime.split(':').map(Number);
        const [endHour, endMin] = endTime.split(':').map(Number);
        const startMinutes = startHour * 60 + startMin;
        const endMinutes = endHour * 60 + endMin;
        
        const withinHours = currentMinutes >= startMinutes && currentMinutes <= endMinutes;
        
        checks.push({
          id: 'calling_hours',
          label: 'Calling hours',
          status: withinHours ? 'pass' : 'warning',
          message: withinHours 
            ? `Within calling hours (${startTime} - ${endTime} ${timezone})`
            : `Outside calling hours. Current: ${currentTimeStr} ${timezone}. Hours: ${startTime} - ${endTime}`,
          critical: false
        });
      } else {
        checks.push({
          id: 'calling_hours',
          label: 'Calling hours',
          status: 'pass',
          message: 'Bypass enabled - can call anytime',
          critical: false
        });
      }

      // Check: Transfer number (if DTMF transfer enabled)
      const dtmfActions = Array.isArray(broadcast.dtmf_actions) ? broadcast.dtmf_actions : [];
      const transferAction = dtmfActions.find((a: unknown) => {
        const action = a as { action?: string; transfer_to?: string };
        return action.action === 'transfer';
      }) as { action?: string; transfer_to?: string } | undefined;
      
      if (transferAction && broadcast.ivr_enabled) {
        const hasTransferNumber = !!transferAction.transfer_to;
        checks.push({
          id: 'transfer_number',
          label: 'Transfer number configured',
          status: hasTransferNumber ? 'pass' : 'warning',
          message: hasTransferNumber 
            ? `Transfer to: ${transferAction.transfer_to}` 
            : 'Press 1 transfer enabled but no number set',
          critical: false
        });
      }

      // Check: Stuck calls (items in 'calling' status for too long)
      const { count: stuckCount } = await supabase
        .from('broadcast_queue')
        .select('*', { count: 'exact', head: true })
        .eq('broadcast_id', broadcastId)
        .eq('status', 'calling');

      if (stuckCount && stuckCount > 0) {
        checks.push({
          id: 'stuck_calls',
          label: 'Stuck calls detected',
          status: 'warning',
          message: `${stuckCount} call(s) stuck in "calling" status. Consider resetting queue.`,
          critical: false,
          fixAction: 'reset_queue'
        });
      }

      // Calculate results
      const criticalFailures = checks.filter(c => c.critical && c.status === 'fail').length;
      const warnings = checks.filter(c => c.status === 'warning').length;
      const isReady = criticalFailures === 0;

      return {
        checks,
        isReady,
        criticalFailures,
        warnings,
        blockingReasons
      };

    } catch (error: any) {
      console.error('Error checking broadcast readiness:', error);
      return {
        checks: [{ id: 'error', label: 'System check', status: 'fail', message: error.message, critical: true }],
        isReady: false,
        criticalFailures: 1,
        warnings: 0,
        blockingReasons: [error.message]
      };
    } finally {
      setIsChecking(false);
    }
  }, []);

  return { checkBroadcastReadiness, isChecking };
};
