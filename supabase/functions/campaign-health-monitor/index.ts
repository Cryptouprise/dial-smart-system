import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface HealthCheckResult {
  healthy: boolean;
  issues: string[];
  metrics: {
    activeBroadcasts: number;
    stuckCalls: number;
    errorRate: number;
    completionRate: number;
    avgCallDuration: number;
  };
  alerts: Array<{
    type: string;
    severity: string;
    message: string;
    broadcastId?: string;
  }>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const authHeader = req.headers.get('Authorization');
    let userId: string | null = null;

    // Allow both authenticated and scheduled (cron) calls
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (!authError && user) {
        userId = user.id;
      }
    }

    const { action = 'check', broadcastId, userId: targetUserId } = await req.json().catch(() => ({}));

    console.log(`[Health Monitor] Action: ${action}, userId: ${userId || targetUserId || 'all'}`);

    const result: HealthCheckResult = {
      healthy: true,
      issues: [],
      metrics: {
        activeBroadcasts: 0,
        stuckCalls: 0,
        errorRate: 0,
        completionRate: 0,
        avgCallDuration: 0,
      },
      alerts: [],
    };

    // 1. Check for active broadcasts
    let broadcastQuery = supabase
      .from('voice_broadcasts')
      .select('id, name, user_id, status, calls_made, created_at')
      .eq('status', 'active');

    if (userId || targetUserId) {
      broadcastQuery = broadcastQuery.eq('user_id', userId || targetUserId);
    }

    const { data: activeBroadcasts, error: broadcastError } = await broadcastQuery;
    if (broadcastError) throw broadcastError;

    result.metrics.activeBroadcasts = activeBroadcasts?.length || 0;

    // 2. Check for stuck calls (calling status > 5 minutes old)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    
    const { data: stuckCalls, error: stuckError } = await supabase
      .from('broadcast_queue')
      .select('id, broadcast_id, phone_number, updated_at')
      .eq('status', 'calling')
      .lt('updated_at', fiveMinutesAgo);

    if (stuckError) throw stuckError;

    result.metrics.stuckCalls = stuckCalls?.length || 0;

    if (result.metrics.stuckCalls > 0) {
      result.healthy = false;
      result.issues.push(`${result.metrics.stuckCalls} calls stuck in 'calling' status for >5 minutes`);
      
      // Group by broadcast and create alerts
      const stuckByBroadcast = new Map<string, number>();
      for (const call of stuckCalls || []) {
        stuckByBroadcast.set(call.broadcast_id, (stuckByBroadcast.get(call.broadcast_id) || 0) + 1);
      }

      for (const [bId, count] of stuckByBroadcast) {
        result.alerts.push({
          type: 'stuck_calls',
          severity: count > 10 ? 'critical' : 'warning',
          message: `${count} calls stuck in broadcast`,
          broadcastId: bId,
        });

        // Auto-reset stuck calls
        if (action === 'auto_fix') {
          await supabase
            .from('broadcast_queue')
            .update({ status: 'pending' })
            .eq('broadcast_id', bId)
            .eq('status', 'calling')
            .lt('updated_at', fiveMinutesAgo);

          console.log(`[Health Monitor] Auto-reset ${count} stuck calls for broadcast ${bId}`);
        }
      }
    }

    // 3. Check error rates per active broadcast
    for (const broadcast of activeBroadcasts || []) {
      const { data: queueStats } = await supabase
        .from('broadcast_queue')
        .select('status')
        .eq('broadcast_id', broadcast.id);

      if (queueStats && queueStats.length > 0) {
        const total = queueStats.length;
        const failed = queueStats.filter(q => q.status === 'failed').length;
        const completed = queueStats.filter(q => ['completed', 'answered', 'transferred'].includes(q.status)).length;
        
        const errorRate = total > 0 ? (failed / total) * 100 : 0;
        const completionRate = total > 0 ? (completed / total) * 100 : 0;

        // High error rate alert (>25%)
        if (errorRate > 25) {
          result.healthy = false;
          result.issues.push(`Broadcast "${broadcast.name}" has ${errorRate.toFixed(1)}% error rate`);
          result.alerts.push({
            type: 'high_error_rate',
            severity: errorRate > 50 ? 'critical' : 'error',
            message: `${errorRate.toFixed(1)}% of calls failed`,
            broadcastId: broadcast.id,
          });

          // Auto-pause if critical
          if (action === 'auto_fix' && errorRate > 50) {
            await supabase
              .from('voice_broadcasts')
              .update({ 
                status: 'paused',
                last_error: `Auto-paused due to ${errorRate.toFixed(1)}% error rate`,
                last_error_at: new Date().toISOString()
              })
              .eq('id', broadcast.id);

            console.log(`[Health Monitor] Auto-paused broadcast ${broadcast.id} due to high error rate`);

            result.alerts.push({
              type: 'auto_paused',
              severity: 'warning',
              message: 'Broadcast auto-paused due to high error rate',
              broadcastId: broadcast.id,
            });
          }
        }

        // Update overall metrics with the last broadcast stats
        result.metrics.errorRate = errorRate;
        result.metrics.completionRate = completionRate;
      }
    }

    // 4. Check for broadcasts running too long without progress
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    
    for (const broadcast of activeBroadcasts || []) {
      const { count: pendingCount } = await supabase
        .from('broadcast_queue')
        .select('*', { count: 'exact', head: true })
        .eq('broadcast_id', broadcast.id)
        .eq('status', 'pending');

      const { count: callingCount } = await supabase
        .from('broadcast_queue')
        .select('*', { count: 'exact', head: true })
        .eq('broadcast_id', broadcast.id)
        .eq('status', 'calling');

      // If there are pending calls but none calling for a while, something might be wrong
      if ((pendingCount || 0) > 0 && (callingCount || 0) === 0) {
        const { data: recentActivity } = await supabase
          .from('broadcast_queue')
          .select('updated_at')
          .eq('broadcast_id', broadcast.id)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (recentActivity && new Date(recentActivity.updated_at) < new Date(thirtyMinutesAgo)) {
          result.issues.push(`Broadcast "${broadcast.name}" has ${pendingCount} pending calls but no activity for 30+ minutes`);
          result.alerts.push({
            type: 'stalled_broadcast',
            severity: 'warning',
            message: `No activity for 30+ minutes with ${pendingCount} pending calls`,
            broadcastId: broadcast.id,
          });
        }
      }
    }

    // 5. Store alerts in database for dashboard visibility
    for (const alert of result.alerts) {
      const alertUserId = activeBroadcasts?.find(b => b.id === alert.broadcastId)?.user_id || userId || targetUserId;
      
      if (alertUserId) {
        // Check if similar alert already exists in last hour
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { data: existingAlert } = await supabase
          .from('system_alerts')
          .select('id')
          .eq('user_id', alertUserId)
          .eq('alert_type', alert.type)
          .eq('related_id', alert.broadcastId || '')
          .eq('acknowledged', false)
          .gt('created_at', oneHourAgo)
          .maybeSingle();

        if (!existingAlert) {
          await supabase.from('system_alerts').insert({
            user_id: alertUserId,
            alert_type: alert.type,
            severity: alert.severity,
            title: `Campaign Alert: ${alert.type.replace(/_/g, ' ').toUpperCase()}`,
            message: alert.message,
            related_id: alert.broadcastId,
            related_type: 'broadcast',
            metadata: { broadcastId: alert.broadcastId },
          });
        }
      }
    }

    // 6. Calculate average call duration
    const { data: durationData } = await supabase
      .from('broadcast_queue')
      .select('call_duration_seconds')
      .not('call_duration_seconds', 'is', null)
      .gt('call_duration_seconds', 0)
      .order('updated_at', { ascending: false })
      .limit(100);

    if (durationData && durationData.length > 0) {
      const totalDuration = durationData.reduce((sum, d) => sum + (d.call_duration_seconds || 0), 0);
      result.metrics.avgCallDuration = Math.round(totalDuration / durationData.length);
    }

    console.log(`[Health Monitor] Complete - Healthy: ${result.healthy}, Issues: ${result.issues.length}, Alerts: ${result.alerts.length}`);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[Health Monitor] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message, healthy: false }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
