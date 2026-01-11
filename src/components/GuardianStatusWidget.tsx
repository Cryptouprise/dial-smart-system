import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Shield, CheckCircle, AlertCircle, Zap, Eye, Wrench, MessageSquare } from 'lucide-react';
import { useAIErrors } from '@/contexts/AIErrorContext';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

interface DbStats {
  open: number;
  resolved: number;
  dismissed: number;
  lastActivity: Date | null;
  lastResolution: string | null;
}

const GuardianStatusWidget: React.FC = () => {
  const { errors, settings } = useAIErrors();
  const [dbStats, setDbStats] = useState<DbStats>({
    open: 0,
    resolved: 0,
    dismissed: 0,
    lastActivity: null,
    lastResolution: null,
  });

  // Fetch persistent stats from database
  useEffect(() => {
    const fetchDbStats = async () => {
      try {
        // Get counts by status
        const { data: alerts } = await supabase
          .from('guardian_alerts')
          .select('status, resolved_at, resolution, detected_at')
          .order('detected_at', { ascending: false })
          .limit(100);

        if (alerts) {
          const open = alerts.filter(a => a.status === 'open').length;
          const resolved = alerts.filter(a => a.status === 'resolved').length;
          const dismissed = alerts.filter(a => a.status === 'dismissed').length;

          // Find most recent activity
          const mostRecent = alerts[0];
          const lastResolved = alerts.find(a => a.status === 'resolved');

          setDbStats({
            open,
            resolved,
            dismissed,
            lastActivity: mostRecent ? new Date(mostRecent.detected_at) : null,
            lastResolution: lastResolved?.resolution || null,
          });
        }
      } catch (err) {
        console.log('[Guardian] Could not fetch db stats:', err);
      }
    };

    fetchDbStats();

    // Refresh every 30 seconds
    const interval = setInterval(fetchDbStats, 30000);
    return () => clearInterval(interval);
  }, []);

  // Combine React state counts with DB counts
  const pendingCount = errors.filter(e => e.status === 'pending').length + dbStats.open;
  const actuallyFixed = errors.filter(e => e.status === 'fixed' && e.actualChange);
  const fixedCount = actuallyFixed.length + dbStats.resolved;
  const suggestionsOnly = errors.filter(e => e.status === 'fixed' && !e.actualChange);
  const failedCount = errors.filter(e => e.status === 'failed').length;
  const needsManualCount = errors.filter(e => e.status === 'needs_manual').length;

  // Get last activity from either React state or DB
  const lastError = errors[0];
  const lastActivityDate = lastError?.timestamp || dbStats.lastActivity;
  const lastActivity = lastActivityDate
    ? formatDistanceToNow(lastActivityDate, { addSuffix: true })
    : 'No recent activity';

  const handleViewDetails = () => {
    window.location.href = '/?tab=ai-errors';
  };

  return (
    <Card className="bg-card/80 backdrop-blur-sm border-primary/20">
      <CardHeader className="pb-2 px-4 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <CardTitle className="text-sm font-medium">Guardian</CardTitle>
          </div>
          <Badge
            variant={settings.enabled ? "default" : "secondary"}
            className={settings.enabled ? "bg-green-500/20 text-green-600 border-green-500/30" : ""}
          >
            {settings.enabled ? (
              <><CheckCircle className="h-3 w-3 mr-1" /> Active</>
            ) : (
              'Disabled'
            )}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0 px-4 pb-4 space-y-3">
        {/* Updated Grid: Open, Fixed, Suggested, Needs Manual, Failed */}
        <div className="grid grid-cols-5 gap-1 text-center">
          <div className="p-1.5 rounded-lg bg-muted/50">
            <div className="text-lg font-bold text-yellow-500">{pendingCount}</div>
            <div className="text-[9px] text-muted-foreground">Open</div>
          </div>
          <div className="p-1.5 rounded-lg bg-muted/50">
            <div className="flex items-center justify-center gap-0.5">
              <Wrench className="h-3 w-3 text-green-500" />
              <span className="text-lg font-bold text-green-500">{fixedCount}</span>
            </div>
            <div className="text-[9px] text-muted-foreground">Fixed</div>
          </div>
          <div className="p-1.5 rounded-lg bg-muted/50">
            <div className="flex items-center justify-center gap-0.5">
              <MessageSquare className="h-3 w-3 text-blue-500" />
              <span className="text-lg font-bold text-blue-500">{suggestionsOnly.length}</span>
            </div>
            <div className="text-[9px] text-muted-foreground">Suggested</div>
          </div>
          <div className="p-1.5 rounded-lg bg-muted/50">
            <div className="text-lg font-bold text-amber-500">{needsManualCount}</div>
            <div className="text-[9px] text-muted-foreground">Manual</div>
          </div>
          <div className="p-1.5 rounded-lg bg-muted/50">
            <div className="text-lg font-bold text-red-500">{failedCount}</div>
            <div className="text-[9px] text-muted-foreground">Failed</div>
          </div>
        </div>

        {/* Recent Fixes Summary - from DB */}
        {fixedCount > 0 && (
          <div className="text-xs bg-green-50 dark:bg-green-900/20 p-2 rounded border border-green-200 dark:border-green-800">
            <span className="font-medium text-green-700 dark:text-green-400">
              ✓ {fixedCount} issue(s) fixed
            </span>
            {dbStats.lastResolution && (
              <p className="text-green-600 dark:text-green-500 mt-1 truncate">
                Last: {dbStats.lastResolution}
              </p>
            )}
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Zap className="h-3 w-3" />
            {settings.autoFixMode ? 'Auto-fix ON' : 'Manual mode'}
          </div>
          <div>{lastActivity}</div>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={handleViewDetails}
        >
          <Eye className="h-3 w-3 mr-1" />
          View Details
        </Button>
      </CardContent>
    </Card>
  );
};

export default GuardianStatusWidget;
