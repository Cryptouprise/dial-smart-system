import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { computeHealthScore, getNextCheckDate } from '@/lib/monitoringScheduler';

interface HealthIssue {
  id: string;
  type: 'critical' | 'warning' | 'info';
  message: string;
  autoFixAvailable: boolean;
  fixApplied: boolean;
  detectedAt: Date;
}

interface HealthStatus {
  overall: 'healthy' | 'degraded' | 'critical';
  lastCheck: Date | null;
  healthScore: number;
  nextCheckAt: Date | null;
  issues: HealthIssue[];
  metrics: {
    activeCampaigns: number;
    errorRate: number;
    avgResponseTime: number;
    queuedCalls: number;
  };
}

const DEFAULT_STATUS: HealthStatus = {
  overall: 'healthy',
  lastCheck: null,
  healthScore: 100,
  nextCheckAt: null,
  issues: [],
  metrics: {
    activeCampaigns: 0,
    errorRate: 0,
    avgResponseTime: 0,
    queuedCalls: 0,
  },
};

export const useProactiveHealthMonitor = (enabled: boolean = true, intervalMs: number = 60000) => {
  const [status, setStatus] = useState<HealthStatus>(DEFAULT_STATUS);
  const [isChecking, setIsChecking] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const nextEligibleCheckRef = useRef<Date | null>(null);
  const { toast } = useToast();

  const checkHealth = useCallback(async () => {
    const now = new Date();

    if (nextEligibleCheckRef.current && now < nextEligibleCheckRef.current) {
      return;
    }

    if (isChecking) return;
    setIsChecking(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsChecking(false);
        return;
      }

      const issues: HealthIssue[] = [];
      
      // Check active campaigns
      const { data: activeCampaigns } = await supabase
        .from('campaigns')
        .select('id, name, status')
        .eq('user_id', user.id)
        .eq('status', 'active');

      // Check for campaigns without phone numbers
      if (activeCampaigns && activeCampaigns.length > 0) {
        const { data: phoneNumbers } = await supabase
          .from('phone_numbers')
          .select('id')
          .eq('user_id', user.id)
          .eq('status', 'active');

        if (!phoneNumbers || phoneNumbers.length === 0) {
          issues.push({
            id: 'no-phone-numbers',
            type: 'critical',
            message: 'Active campaigns but no phone numbers available',
            autoFixAvailable: false,
            fixApplied: false,
            detectedAt: new Date(),
          });
        }
      }

      // Check for high error rate in recent calls
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: recentCalls } = await supabase
        .from('call_logs')
        .select('id, status')
        .eq('user_id', user.id)
        .gte('created_at', oneHourAgo);

      if (recentCalls && recentCalls.length > 10) {
        const failedCalls = recentCalls.filter(c => c.status === 'failed').length;
        const errorRate = (failedCalls / recentCalls.length) * 100;
        
        if (errorRate > 20) {
          issues.push({
            id: 'high-error-rate',
            type: 'critical',
            message: `High call failure rate: ${errorRate.toFixed(1)}%`,
            autoFixAvailable: true,
            fixApplied: false,
            detectedAt: new Date(),
          });
        } else if (errorRate > 10) {
          issues.push({
            id: 'elevated-error-rate',
            type: 'warning',
            message: `Elevated call failure rate: ${errorRate.toFixed(1)}%`,
            autoFixAvailable: false,
            fixApplied: false,
            detectedAt: new Date(),
          });
        }
      }

      // Check for stalled broadcast queues
      const { data: stalledQueue } = await supabase
        .from('broadcast_queue')
        .select('id')
        .eq('status', 'pending')
        .lt('scheduled_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())
        .limit(1);

      if (stalledQueue && stalledQueue.length > 0) {
        issues.push({
          id: 'stalled-queue',
          type: 'warning',
          message: 'Broadcast queue has stalled items older than 30 minutes',
          autoFixAvailable: true,
          fixApplied: false,
          detectedAt: new Date(),
        });
      }

      // Check for unacknowledged critical alerts
      const { data: criticalAlerts } = await supabase
        .from('system_alerts')
        .select('id')
        .eq('user_id', user.id)
        .eq('severity', 'critical')
        .eq('acknowledged', false);

      if (criticalAlerts && criticalAlerts.length > 0) {
        issues.push({
          id: 'unack-critical-alerts',
          type: 'critical',
          message: `${criticalAlerts.length} unacknowledged critical alerts`,
          autoFixAvailable: false,
          fixApplied: false,
          detectedAt: new Date(),
        });
      }

      // Determine overall status
      const hasCritical = issues.some(i => i.type === 'critical');
      const hasWarning = issues.some(i => i.type === 'warning');
      
      const overall: HealthStatus['overall'] = hasCritical 
        ? 'critical' 
        : hasWarning 
          ? 'degraded' 
          : 'healthy';

      const healthScore = computeHealthScore(issues.map(issue => ({ type: issue.type })));
      const nextCheckAt = getNextCheckDate(healthScore, now);

      const newStatus: HealthStatus = {
        overall,
        lastCheck: now,
        healthScore,
        nextCheckAt,
        issues,
        metrics: {
          activeCampaigns: activeCampaigns?.length || 0,
          errorRate: recentCalls && recentCalls.length > 0 
            ? (recentCalls.filter(c => c.status === 'failed').length / recentCalls.length) * 100 
            : 0,
          avgResponseTime: 0,
          queuedCalls: 0,
        },
      };

      setStatus(newStatus);
      nextEligibleCheckRef.current = nextCheckAt;

      // Notify on status change to critical
      if (overall === 'critical' && status.overall !== 'critical') {
        toast({
          title: "System Health Alert",
          description: `${issues.filter(i => i.type === 'critical').length} critical issue(s) detected`,
          variant: "destructive",
        });
      }

    } catch (error) {
      console.error('Health check failed:', error);
    } finally {
      setIsChecking(false);
    }
  }, [isChecking, status.overall, toast]);

  const applyAutoFix = useCallback(async (issueId: string) => {
    const issue = status.issues.find(i => i.id === issueId);
    if (!issue || !issue.autoFixAvailable || issue.fixApplied) return false;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      switch (issueId) {
        case 'high-error-rate':
          // Auto-fix: Pause campaigns with high error rates
          await supabase
            .from('campaigns')
            .update({ status: 'paused' })
            .eq('user_id', user.id)
            .eq('status', 'active');
          
          toast({
            title: "Auto-Fix Applied",
            description: "Paused campaigns due to high error rate",
          });
          break;

        case 'stalled-queue':
          // Auto-fix: Reset stalled queue items
          await supabase
            .from('broadcast_queue')
            .update({ 
              scheduled_at: new Date().toISOString(),
              attempts: 0 
            })
            .eq('status', 'pending')
            .lt('scheduled_at', new Date(Date.now() - 30 * 60 * 1000).toISOString());
          
          toast({
            title: "Auto-Fix Applied",
            description: "Reset stalled broadcast queue items",
          });
          break;

        default:
          return false;
      }

      // Mark issue as fixed
      setStatus(prev => ({
        ...prev,
        issues: prev.issues.map(i => 
          i.id === issueId ? { ...i, fixApplied: true } : i
        ),
      }));

      return true;
    } catch (error) {
      console.error('Auto-fix failed:', error);
      toast({
        title: "Auto-Fix Failed",
        description: "Manual intervention required",
        variant: "destructive",
      });
      return false;
    }
  }, [status.issues, toast]);

  const applyAllAutoFixes = useCallback(async () => {
    const fixableIssues = status.issues.filter(i => i.autoFixAvailable && !i.fixApplied);
    let successCount = 0;

    for (const issue of fixableIssues) {
      const success = await applyAutoFix(issue.id);
      if (success) successCount++;
    }

    return successCount;
  }, [status.issues, applyAutoFix]);

  // Start/stop monitoring based on enabled state
  useEffect(() => {
    if (enabled) {
      // Initial check
      checkHealth();
      
      // Set up interval
      intervalRef.current = setInterval(checkHealth, intervalMs);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, intervalMs, checkHealth]);

  return {
    status,
    isChecking,
    checkHealth,
    applyAutoFix,
    applyAllAutoFixes,
  };
};
