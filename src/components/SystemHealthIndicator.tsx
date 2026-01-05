import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Activity, AlertTriangle, CheckCircle, XCircle, RefreshCw, 
  Bell, Clock, Zap 
} from 'lucide-react';
import { useSystemHealth } from '@/hooks/useLiveCampaignStats';
import { cn } from '@/lib/utils';

interface SystemHealthIndicatorProps {
  compact?: boolean;
  className?: string;
}

export const SystemHealthIndicator: React.FC<SystemHealthIndicatorProps> = ({ 
  compact = false,
  className 
}) => {
  const { health, isChecking, runHealthCheck } = useSystemHealth();

  if (!health) {
    return (
      <Card className={cn("border border-border/50", className)}>
        <CardContent className={compact ? "py-2 px-3" : "py-4"}>
          <div className="flex items-center gap-2 text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading health...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Derive status from healthy boolean and metrics
  const status = health.healthy 
    ? 'healthy' 
    : (health.stuckCalls > 5 || health.unacknowledgedAlerts > 3) 
      ? 'critical' 
      : 'warning';

  const statusConfig = {
    healthy: {
      color: 'bg-green-500',
      textColor: 'text-green-600',
      borderColor: 'border-green-500/30',
      bgColor: 'bg-green-50 dark:bg-green-950/20',
      Icon: CheckCircle,
      label: 'Healthy'
    },
    warning: {
      color: 'bg-amber-500',
      textColor: 'text-amber-600',
      borderColor: 'border-amber-500/30',
      bgColor: 'bg-amber-50 dark:bg-amber-950/20',
      Icon: AlertTriangle,
      label: 'Warning'
    },
    critical: {
      color: 'bg-red-500',
      textColor: 'text-red-600',
      borderColor: 'border-red-500/30',
      bgColor: 'bg-red-50 dark:bg-red-950/20',
      Icon: XCircle,
      label: 'Critical'
    }
  };

  const config = statusConfig[status];
  const Icon = config.Icon;

  if (compact) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <div className={cn("w-2 h-2 rounded-full", config.color, status !== 'healthy' && 'animate-pulse')} />
        <span className={cn("text-sm font-medium", config.textColor)}>
          {config.label}
        </span>
        {health.stuckCalls > 0 && (
          <Badge variant="outline" className="text-xs">
            <Clock className="h-3 w-3 mr-1" />
            {health.stuckCalls}
          </Badge>
        )}
        {health.unacknowledgedAlerts > 0 && (
          <Badge variant="outline" className="text-xs text-red-600">
            <Bell className="h-3 w-3 mr-1" />
            {health.unacknowledgedAlerts}
          </Badge>
        )}
      </div>
    );
  }

  return (
    <Card className={cn("border-2", config.borderColor, config.bgColor, className)}>
      <CardContent className="py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center",
              config.color + "/20"
            )}>
              <Icon className={cn("h-5 w-5", config.textColor)} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">System Health</span>
                <Badge variant="outline" className={config.textColor}>
                  {config.label}
                </Badge>
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                {health.stuckCalls > 0 && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {health.stuckCalls} stuck calls
                  </span>
                )}
                {health.unacknowledgedAlerts > 0 && (
                  <span className="flex items-center gap-1 text-red-600">
                    <Bell className="h-3 w-3" />
                    {health.unacknowledgedAlerts} alerts
                  </span>
                )}
                {health.stuckCalls === 0 && health.unacknowledgedAlerts === 0 && (
                  <span className="flex items-center gap-1">
                    <Zap className="h-3 w-3" />
                    All systems operational
                  </span>
                )}
              </div>
            </div>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={runHealthCheck} 
            disabled={isChecking}
          >
            <RefreshCw className={cn("h-4 w-4", isChecking && "animate-spin")} />
          </Button>
        </div>
        
        {health.issues && health.issues.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border/50">
            <p className="text-sm text-muted-foreground">
              <AlertTriangle className="h-3 w-3 inline mr-1" />
              {health.issues.slice(0, 2).join(' • ')}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SystemHealthIndicator;
