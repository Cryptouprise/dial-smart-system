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
        .select('id, number, status, is_spam, retell_phone_id, quarantine_until')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .eq('is_spam', false);

      // Filter out quarantined and Retell-only numbers for voice broadcasts
      const now = new Date();
      const availableNumbers = phoneNumbers?.filter(p => {
        if (p.retell_phone_id && broadcast.ivr_mode !== 'ai_conversational') return false;
        if (p.quarantine_until && new Date(p.quarantine_until) > now) return false;
        return true;
      }) || [];
      
      const quarantinedCount = phoneNumbers?.filter(p => p.quarantine_until && new Date(p.quarantine_until) > now).length || 0;
      
      // Check for low phone count warning (high volume needs more numbers)
      const hasLowPhoneCount = availableNumbers.length > 0 && availableNumbers.length < 3;
      
      checks.push({
        id: 'phone_numbers',
        label: 'Phone numbers available',
        status: availableNumbers.length === 0 ? 'fail' : hasLowPhoneCount ? 'warning' : 'pass',
        message: availableNumbers.length === 0 
          ? 'No phone numbers available for broadcasts'
          : hasLowPhoneCount
            ? `Only ${availableNumbers.length} number(s) - add more for better pickup rates with high volume`
            : `${availableNumbers.length} number(s) ready${quarantinedCount > 0 ? ` (${quarantinedCount} quarantined)` : ''}`,
        critical: availableNumbers.length === 0
      });
      if (availableNumbers.length === 0) blockingReasons.push('No phone numbers available for broadcasts');

      // Check: Spam-flagged numbers warning
      const spamNumbers = phoneNumbers?.filter(p => p.is_spam).length || 0;
      if (spamNumbers > 0) {
        checks.push({
          id: 'spam_numbers',
          label: 'Spam-flagged numbers',
          status: 'warning',
          message: `${spamNumbers} number(s) flagged as spam and excluded from use`,
          critical: false
        });
      }

      // Check: Calling hours
      const bypassHours = broadcast.bypass_calling_hours === true;
      if (!bypassHours) {
        const timezone = broadcast.timezone || 'America/New_York';
        const startTime = broadcast.calling_hours_start || '09:00';
        const endTime = broadcast.calling_hours_end || '17:00';
        
        // Get current time in broadcast timezone
        const nowDate = new Date();
        const options: Intl.DateTimeFormatOptions = {
          timeZone: timezone,
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        };
        const currentTimeStr = nowDate.toLocaleTimeString('en-US', options);
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
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { count: stuckCount } = await supabase
        .from('broadcast_queue')
        .select('*', { count: 'exact', head: true })
        .eq('broadcast_id', broadcastId)
        .eq('status', 'calling')
        .lt('updated_at', fiveMinutesAgo);

      if (stuckCount && stuckCount > 0) {
        checks.push({
          id: 'stuck_calls',
          label: 'Stuck calls detected',
          status: 'warning',
          message: `${stuckCount} call(s) stuck in "calling" status for >5 min. Will be auto-reset on start.`,
          critical: false,
          fixAction: 'reset_queue'
        });
      }

      // Check: Recent error rate
      const { data: recentQueue } = await supabase
        .from('broadcast_queue')
        .select('status')
        .eq('broadcast_id', broadcastId)
        .in('status', ['completed', 'answered', 'transferred', 'failed', 'dnc'])
        .order('updated_at', { ascending: false })
        .limit(50);

      if (recentQueue && recentQueue.length >= 10) {
        const recentFailed = recentQueue.filter(q => q.status === 'failed').length;
        const errorRate = (recentFailed / recentQueue.length) * 100;
        
        if (errorRate >= 25) {
          checks.push({
            id: 'error_rate',
            label: 'Recent error rate',
            status: 'warning',
            message: `${errorRate.toFixed(1)}% of recent calls failed. Check configuration.`,
            critical: false
          });
        }
      }

      // Check: Max attempts setting
      const maxAttempts = broadcast.max_attempts || 1;
      checks.push({
        id: 'max_attempts',
        label: 'Retry configuration',
        status: maxAttempts > 1 ? 'pass' : 'warning',
        message: maxAttempts > 1 
          ? `Will retry failed calls up to ${maxAttempts} times`
          : 'No retries configured. Consider setting max_attempts > 1 for better reach.',
        critical: false
      });

      // Check: Calls per minute setting
      const callsPerMinute = broadcast.calls_per_minute || 50;
      checks.push({
        id: 'call_rate',
        label: 'Call rate',
        status: callsPerMinute <= 100 ? 'pass' : 'warning',
        message: `${callsPerMinute} calls/minute${callsPerMinute > 100 ? ' (high rate may trigger rate limits)' : ''}`,
        critical: false
      });

      // Check: Unacknowledged system alerts
      const { count: alertCount } = await supabase
        .from('system_alerts')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('related_id', broadcastId)
        .eq('acknowledged', false)
        .in('severity', ['error', 'critical']);

      if (alertCount && alertCount > 0) {
        checks.push({
          id: 'system_alerts',
          label: 'Unresolved alerts',
          status: 'warning',
          message: `${alertCount} unacknowledged alert(s) for this broadcast`,
          critical: false
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

  // Run a test batch of calls
  const runTestBatch = useCallback(async (broadcastId: string, testSize: number = 10): Promise<{
    success: boolean;
    message: string;
    dispatched?: number;
    errors?: string[];
  }> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        return { success: false, message: 'Not authenticated' };
      }

      // First run readiness check
      const readiness = await checkBroadcastReadiness(broadcastId);
      if (!readiness.isReady) {
        return { 
          success: false, 
          message: `Cannot run test: ${readiness.blockingReasons.join(', ')}` 
        };
      }

      // Temporarily limit the batch size for testing
      const response = await supabase.functions.invoke('voice-broadcast-engine', {
        body: { 
          action: 'start', 
          broadcastId,
          // Engine will respect calls_per_minute from broadcast settings
        }
      });

      if (response.error) {
        return { 
          success: false, 
          message: response.error.message || 'Test failed' 
        };
      }

      return {
        success: true,
        message: `Test batch started: ${response.data?.dispatched || 0} calls dispatched`,
        dispatched: response.data?.dispatched,
        errors: response.data?.errors
      };

    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }, [checkBroadcastReadiness]);

  // Emergency stop function
  const emergencyStop = useCallback(async (broadcastId: string): Promise<{
    success: boolean;
    message: string;
  }> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        return { success: false, message: 'Not authenticated' };
      }

      const response = await supabase.functions.invoke('voice-broadcast-engine', {
        body: { action: 'stop', broadcastId }
      });

      if (response.error) {
        return { success: false, message: response.error.message || 'Stop failed' };
      }

      // Also create a system alert about the emergency stop
      await supabase.from('system_alerts').insert({
        user_id: session.user.id,
        alert_type: 'emergency_stop',
        severity: 'info',
        title: 'Campaign Emergency Stop',
        message: 'Campaign was manually stopped by user',
        related_id: broadcastId,
        related_type: 'broadcast',
      });

      return { success: true, message: 'Broadcast stopped successfully' };

    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }, []);

  return { 
    checkBroadcastReadiness, 
    runTestBatch,
    emergencyStop,
    isChecking 
  };
};
