import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { format, formatDistanceToNow, isPast } from 'date-fns';
import { Phone, Clock, AlertTriangle, RefreshCw, User, X } from 'lucide-react';
import { useCallbacks, UnifiedCallback } from '@/hooks/useCallbacks';
import { QUEUE_CONTROL_LAUNCH_LOCK_MESSAGE } from '@/lib/launchSafety';

interface PendingCallbacksWidgetProps {
  onCallNow?: (leadId: string) => void;
}

export const PendingCallbacksWidget: React.FC<PendingCallbacksWidgetProps> = () => {
  const { callbacks, isLoading, overdueCount, upcomingCount, refresh } = useCallbacks();
  const { toast } = useToast();

  const handleCallNow = (_callback: UnifiedCallback) => {
    toast({
      title: 'Call Now is launch-locked',
      description: QUEUE_CONTROL_LAUNCH_LOCK_MESSAGE,
      variant: 'destructive',
    });
  };

  const handleCancelCallback = (_callback: UnifiedCallback) => {
    toast({
      title: 'Callback changes are launch-locked',
      description: QUEUE_CONTROL_LAUNCH_LOCK_MESSAGE,
      variant: 'destructive',
    });
  };

  if (callbacks.length === 0 && !isLoading) {
    return null;
  }

  return (
    <Card className="bg-card/90 backdrop-blur-sm border-orange-500/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Phone className="h-4 w-4 text-orange-500" />
              Pending Callbacks
            </CardTitle>
            {overdueCount > 0 && (
              <Badge variant="destructive" className="text-xs">
                {overdueCount} Overdue
              </Badge>
            )}
            {upcomingCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                {upcomingCount} Upcoming
              </Badge>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={refresh} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <ScrollArea className="h-[200px]">
          <div className="space-y-2">
            {callbacks.map((callback) => {
              const isOverdue = isPast(new Date(callback.scheduled_at));
              const name = [callback.first_name, callback.last_name].filter(Boolean).join(' ') || 'Unknown';
              
              return (
                <div
                  key={callback.id}
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    isOverdue 
                      ? 'bg-destructive/10 border-destructive/30' 
                      : 'bg-muted/50 border-border'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                      isOverdue ? 'bg-destructive/20' : 'bg-orange-500/20'
                    }`}>
                      {isOverdue ? (
                        <AlertTriangle className="h-4 w-4 text-destructive" />
                      ) : (
                        <User className="h-4 w-4 text-orange-500" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{name}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-mono">{callback.phone_number}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {isOverdue ? (
                            <span className="text-destructive">
                              {formatDistanceToNow(new Date(callback.scheduled_at), { addSuffix: true })}
                            </span>
                          ) : (
                            format(new Date(callback.scheduled_at), 'h:mm a')
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleCancelCallback(callback)}
                      className="text-muted-foreground hover:text-destructive"
                      title="Launch-locked until callback changes use a server-side safety check"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant={isOverdue ? "destructive" : "default"}
                      onClick={() => handleCallNow(callback)}
                      title="Launch-locked until Call Now uses a server-side safety check"
                    >
                      <Phone className="h-3 w-3 mr-1" />
                      Call Now
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default PendingCallbacksWidget;
