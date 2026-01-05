import React, { useState, useEffect, useCallback } from 'react';
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
  Calendar,
  X,
  Play
} from 'lucide-react';
import { format, formatDistanceToNow, isPast } from 'date-fns';

interface CallbackEntry {
  id: string;
  lead_id: string;
  scheduled_at: string;
  priority: number;
  status: string;
  phone_number: string;
  campaign_id: string;
  source: 'dialing_queue' | 'scheduled_follow_up';
  lead?: {
    first_name: string | null;
    last_name: string | null;
    phone_number: string;
    notes: string | null;
  };
}

export const CallbackMonitorWidget = () => {
  const [callbacks, setCallbacks] = useState<CallbackEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const loadCallbacks = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch from dialing_queues where priority >= 2 (callbacks have priority 2)
      const { data: queueCallbacks, error: queueError } = await supabase
        .from('dialing_queues')
        .select(`
          id, lead_id, scheduled_at, priority, status, phone_number, campaign_id,
          leads (first_name, last_name, phone_number, notes)
        `)
        .eq('status', 'pending')
        .gte('priority', 2)
        .order('scheduled_at', { ascending: true });

      if (queueError) {
        console.error('Error fetching queue callbacks:', queueError);
      }

      // Fetch from scheduled_follow_ups with action_type containing 'call'
      const { data: followUpCallbacks, error: followUpError } = await supabase
        .from('scheduled_follow_ups')
        .select(`
          id, lead_id, scheduled_at, status, action_type,
          leads (first_name, last_name, phone_number, notes)
        `)
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .ilike('action_type', '%call%')
        .order('scheduled_at', { ascending: true });

      if (followUpError) {
        console.error('Error fetching follow-up callbacks:', followUpError);
      }

      // Combine and deduplicate by lead_id, preferring dialing_queue entries
      const combined: CallbackEntry[] = [];
      const seenLeadIds = new Set<string>();

      // Add queue callbacks first (higher priority source)
      for (const qc of queueCallbacks || []) {
        if (!seenLeadIds.has(qc.lead_id)) {
          seenLeadIds.add(qc.lead_id);
          combined.push({
            id: qc.id,
            lead_id: qc.lead_id,
            scheduled_at: qc.scheduled_at,
            priority: qc.priority,
            status: qc.status,
            phone_number: qc.phone_number,
            campaign_id: qc.campaign_id,
            source: 'dialing_queue',
            lead: qc.leads as any
          });
        }
      }

      // Add follow-up callbacks that aren't already in the list
      for (const fc of followUpCallbacks || []) {
        if (!seenLeadIds.has(fc.lead_id)) {
          seenLeadIds.add(fc.lead_id);
          combined.push({
            id: fc.id,
            lead_id: fc.lead_id,
            scheduled_at: fc.scheduled_at,
            priority: 1,
            status: fc.status,
            phone_number: (fc.leads as any)?.phone_number || '',
            campaign_id: '',
            source: 'scheduled_follow_up',
            lead: fc.leads as any
          });
        }
      }

      // Sort by scheduled_at
      combined.sort((a, b) => 
        new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
      );

      setCallbacks(combined);
    } catch (error) {
      console.error('Error loading callbacks:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCallbacks();
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadCallbacks, 30000);
    return () => clearInterval(interval);
  }, [loadCallbacks]);

  const handleCancelCallback = async (callback: CallbackEntry) => {
    try {
      if (callback.source === 'dialing_queue') {
        await supabase
          .from('dialing_queues')
          .update({ status: 'cancelled', updated_at: new Date().toISOString() })
          .eq('id', callback.id);
      } else {
        await supabase
          .from('scheduled_follow_ups')
          .update({ status: 'cancelled' })
          .eq('id', callback.id);
      }

      toast({
        title: "Callback Cancelled",
        description: `Callback for ${callback.lead?.first_name || 'lead'} has been cancelled`,
      });

      loadCallbacks();
    } catch (error) {
      console.error('Error cancelling callback:', error);
      toast({
        title: "Error",
        description: "Failed to cancel callback",
        variant: "destructive"
      });
    }
  };

  const handleCallNow = async (callback: CallbackEntry) => {
    try {
      // Update scheduled_at to now to trigger immediate call
      if (callback.source === 'dialing_queue') {
        await supabase
          .from('dialing_queues')
          .update({ 
            scheduled_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', callback.id);
      }

      toast({
        title: "Call Queued",
        description: `Call to ${callback.lead?.first_name || 'lead'} has been moved to immediate queue`,
      });

      loadCallbacks();
    } catch (error) {
      console.error('Error triggering call:', error);
      toast({
        title: "Error",
        description: "Failed to queue call",
        variant: "destructive"
      });
    }
  };

  const getTimeDisplay = (scheduledAt: string) => {
    const date = new Date(scheduledAt);
    const isOverdue = isPast(date);
    
    if (isOverdue) {
      return {
        text: 'Overdue',
        color: 'text-destructive',
        subtext: format(date, 'h:mm a')
      };
    }
    
    return {
      text: formatDistanceToNow(date, { addSuffix: false }),
      color: 'text-primary',
      subtext: format(date, 'h:mm a')
    };
  };

  const getLeadName = (lead: CallbackEntry['lead']) => {
    if (!lead) return 'Unknown';
    const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ');
    return name || 'Unknown';
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

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Scheduled Callbacks
            <Badge variant="secondary">{callbacks.length}</Badge>
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={loadCallbacks} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[400px]">
          <div className="divide-y">
            {callbacks.map(callback => {
              const timeDisplay = getTimeDisplay(callback.scheduled_at);
              const leadName = getLeadName(callback.lead);
              
              return (
                <div 
                  key={callback.id} 
                  className="p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <User className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{leadName}</span>
                          <Badge 
                            variant={callback.source === 'dialing_queue' ? 'default' : 'secondary'}
                            className="text-xs"
                          >
                            {callback.source === 'dialing_queue' ? 'Requested' : 'Scheduled'}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Phone className="h-3 w-3" />
                          <span>{callback.phone_number || callback.lead?.phone_number}</span>
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
                  
                  {callback.lead?.notes && (
                    <p className="mt-2 text-sm text-muted-foreground line-clamp-2 ml-13">
                      {callback.lead.notes.slice(-200)}
                    </p>
                  )}
                  
                  <div className="flex items-center gap-2 mt-3 ml-13">
                    <Button 
                      size="sm" 
                      variant="default"
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
