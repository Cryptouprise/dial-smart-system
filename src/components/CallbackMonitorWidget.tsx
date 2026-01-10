import React, { useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { 
  Phone, 
  Clock, 
  RefreshCw, 
  User, 
  X,
  Play,
  AlertTriangle
} from 'lucide-react';
import { format, formatDistanceToNow, isPast } from 'date-fns';
import { useCallbacks, UnifiedCallback } from '@/hooks/useCallbacks';

interface CallbackMonitorWidgetProps {
  onOverdueCountChange?: (count: number) => void;
}

export const CallbackMonitorWidget: React.FC<CallbackMonitorWidgetProps> = ({ 
  onOverdueCountChange 
}) => {
  const { callbacks, isLoading, overdueCount, refresh } = useCallbacks();
  const { toast } = useToast();

  // Report overdue count to parent
  useEffect(() => {
    onOverdueCountChange?.(overdueCount);
  }, [overdueCount, onOverdueCountChange]);

  const handleCancelCallback = async (callback: UnifiedCallback) => {
    try {
      // Clear from all sources
      if (callback.source === 'lead') {
        await supabase
          .from('leads')
          .update({ next_callback_at: null, updated_at: new Date().toISOString() })
          .eq('id', callback.lead_id);
      }
      
      if (callback.source === 'dialing_queue' || callback.source === 'lead') {
        await supabase
          .from('dialing_queues')
          .delete()
          .eq('lead_id', callback.lead_id);
      }
      
      if (callback.source === 'scheduled_follow_up') {
        await supabase
          .from('scheduled_follow_ups')
          .update({ status: 'cancelled' })
          .eq('id', callback.id);
      }

      toast({
        title: "Callback Cancelled",
        description: `Callback for ${callback.first_name || 'lead'} has been cancelled`,
      });

      refresh();
    } catch (error) {
      console.error('Error cancelling callback:', error);
      toast({
        title: "Error",
        description: "Failed to cancel callback",
        variant: "destructive"
      });
    }
  };

  const handleCallNow = async (callback: UnifiedCallback) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Find an active campaign
      const { data: campaign } = await supabase
        .from('campaigns')
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();

      if (!campaign) {
        toast({
          title: "No Active Campaign",
          description: "Please start a campaign first to make calls.",
          variant: "destructive"
        });
        return;
      }

      // Delete existing queue entry
      await supabase
        .from('dialing_queues')
        .delete()
        .eq('lead_id', callback.lead_id);

      // Add with immediate scheduling
      await supabase
        .from('dialing_queues')
        .insert({
          campaign_id: campaign.id,
          lead_id: callback.lead_id,
          phone_number: callback.phone_number,
          status: 'pending',
          scheduled_at: new Date().toISOString(),
          priority: 10,
          max_attempts: 3,
          attempts: 0
        });

      // Trigger dispatcher
      await supabase.functions.invoke('call-dispatcher', {
        body: { immediate: true }
      });

      toast({
        title: "Call Initiated",
        description: `Call to ${callback.first_name || 'lead'} has been queued`,
      });

      refresh();
    } catch (error) {
      console.error('Error triggering call:', error);
      toast({
        title: "Error",
        description: "Failed to queue call",
        variant: "destructive"
      });
    }
  };

  const isOverdue = (scheduledAt: string) => isPast(new Date(scheduledAt));

  const getTimeDisplay = (scheduledAt: string) => {
    const date = new Date(scheduledAt);
    const overdue = isOverdue(scheduledAt);
    
    if (overdue) {
      return {
        text: formatDistanceToNow(date, { addSuffix: false }) + ' overdue',
        color: 'text-destructive',
        subtext: format(date, 'h:mm a')
      };
    }
    
    return {
      text: 'in ' + formatDistanceToNow(date, { addSuffix: false }),
      color: 'text-primary',
      subtext: format(date, 'h:mm a')
    };
  };

  const getLeadName = (callback: UnifiedCallback) => {
    const name = [callback.first_name, callback.last_name].filter(Boolean).join(' ');
    return name || 'Unknown';
  };

  const getLastCallNote = (notes: string | null): string | null => {
    if (!notes) return null;
    
    const callLogMatch = notes.match(/━━━━━━━━━━━━━━━━━━━━━━━━━━[\s\S]*?(?=━━━━━━━━━━━━━━━━━━━━━━━━━━|$)/g);
    if (callLogMatch && callLogMatch.length > 0) {
      const lastLog = callLogMatch[callLogMatch.length - 1];
      const summaryMatch = lastLog.match(/Summary: (.+)/);
      if (summaryMatch) {
        return summaryMatch[1].slice(0, 100);
      }
    }
    
    return notes.slice(-100);
  };

  if (callbacks.length === 0 && !isLoading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Phone className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Pending Callbacks</h3>
          <p className="text-muted-foreground">
            When leads request callbacks, they'll appear here with countdown timers.
          </p>
        </CardContent>
      </Card>
    );
  }

  const overdueCallbacks = callbacks.filter(cb => isOverdue(cb.scheduled_at));

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Scheduled Callbacks
            <Badge variant="secondary">{callbacks.length}</Badge>
            {overdueCallbacks.length > 0 && (
              <Badge variant="destructive" className="animate-pulse">
                <AlertTriangle className="h-3 w-3 mr-1" />
                {overdueCallbacks.length} Overdue
              </Badge>
            )}
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={refresh} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[400px]">
          <div className="divide-y">
            {callbacks.map(callback => {
              const timeDisplay = getTimeDisplay(callback.scheduled_at);
              const leadName = getLeadName(callback);
              const overdue = isOverdue(callback.scheduled_at);
              const lastNote = getLastCallNote(callback.notes || null);
              
              return (
                <div 
                  key={callback.id} 
                  className={`p-4 hover:bg-muted/50 transition-colors ${
                    overdue ? 'bg-destructive/5 border-l-4 border-l-destructive' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${
                        overdue ? 'bg-destructive/10' : 'bg-primary/10'
                      }`}>
                        {overdue ? (
                          <AlertTriangle className="h-5 w-5 text-destructive" />
                        ) : (
                          <User className="h-5 w-5 text-primary" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{leadName}</span>
                          <Badge 
                            variant={callback.source === 'lead' ? 'outline' : callback.source === 'dialing_queue' ? 'default' : 'secondary'}
                            className="text-xs"
                          >
                            {callback.source === 'lead' ? 'Callback' : callback.source === 'dialing_queue' ? 'Requested' : 'Scheduled'}
                          </Badge>
                          {overdue && (
                            <Badge variant="destructive" className="text-xs">
                              OVERDUE
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Phone className="h-3 w-3" />
                          <span>{callback.phone_number}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-right shrink-0">
                      <div className={`font-semibold ${timeDisplay.color}`}>
                        {timeDisplay.text}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                        <Clock className="h-3 w-3" />
                        {timeDisplay.subtext}
                      </div>
                    </div>
                  </div>
                  
                  {lastNote && (
                    <div className="mt-2 ml-13 p-2 rounded bg-muted/50">
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium">Last call: </span>
                        {lastNote}
                      </p>
                    </div>
                  )}
                  
                  <div className="flex items-center gap-2 mt-3 ml-13">
                    <Button 
                      size="sm" 
                      variant={overdue ? "destructive" : "default"}
                      onClick={() => handleCallNow(callback)}
                    >
                      <Play className="h-3 w-3 mr-1" />
                      Call Now
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => handleCancelCallback(callback)}
                    >
                      <X className="h-3 w-3 mr-1" />
                      Cancel
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

export default CallbackMonitorWidget;
