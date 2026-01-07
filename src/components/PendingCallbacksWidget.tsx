import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format, formatDistanceToNow, isPast } from 'date-fns';
import { Phone, Clock, AlertTriangle, RefreshCw, User } from 'lucide-react';

interface PendingCallback {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone_number: string;
  next_callback_at: string;
  status: string;
}

interface PendingCallbacksWidgetProps {
  onCallNow?: (leadId: string) => void;
}

export const PendingCallbacksWidget: React.FC<PendingCallbacksWidgetProps> = ({ onCallNow }) => {
  const [callbacks, setCallbacks] = useState<PendingCallback[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCallingLead, setIsCallingLead] = useState<string | null>(null);
  const { toast } = useToast();

  const loadCallbacks = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('leads')
        .select('id, first_name, last_name, phone_number, next_callback_at, status')
        .eq('user_id', user.id)
        .eq('do_not_call', false)
        .not('next_callback_at', 'is', null)
        .lte('next_callback_at', new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()) // Next 24 hours
        .order('next_callback_at', { ascending: true })
        .limit(20);

      if (error) throw error;
      setCallbacks(data || []);
    } catch (error) {
      console.error('Error loading callbacks:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCallbacks();
    const interval = setInterval(loadCallbacks, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [loadCallbacks]);

  const handleCallNow = async (lead: PendingCallback) => {
    setIsCallingLead(lead.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Pre-check: Verify phone numbers with Retell IDs are available
      const { data: phoneNumbers, error: phoneError } = await supabase
        .from('phone_numbers')
        .select('number, retell_phone_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .not('retell_phone_id', 'is', null)
        .limit(1);

      if (phoneError || !phoneNumbers?.length) {
        toast({
          title: "No Phone Numbers Ready",
          description: "No phone numbers with Retell IDs available. Import numbers to Retell first.",
          variant: "destructive"
        });
        return;
      }

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

      // Delete ANY existing queue entry for this lead (regardless of status)
      // to avoid unique constraint violation on (campaign_id, lead_id)
      await supabase
        .from('dialing_queues')
        .delete()
        .eq('lead_id', lead.id);

      // Add to queue with immediate scheduling and high priority
      const { error: insertError } = await supabase
        .from('dialing_queues')
        .insert({
          campaign_id: campaign.id,
          lead_id: lead.id,
          phone_number: lead.phone_number,
          status: 'pending',
          scheduled_at: new Date().toISOString(),
          priority: 10, // Highest priority
          max_attempts: 3,
          attempts: 0
        });

      if (insertError) throw insertError;

      // Trigger immediate dispatch
      const dispatchResponse = await supabase.functions.invoke('call-dispatcher', {
        body: { immediate: true }
      });

      if (dispatchResponse.error) {
        throw new Error(dispatchResponse.error.message || 'Dispatch failed');
      }

      // Check if dispatch had issues
      if (dispatchResponse.data?.error) {
        throw new Error(dispatchResponse.data.error);
      }

      toast({
        title: "Call Initiated",
        description: `Calling ${lead.first_name || lead.phone_number} now...`,
      });

      if (onCallNow) {
        onCallNow(lead.id);
      }

      // Refresh list
      setTimeout(loadCallbacks, 2000);
    } catch (error: any) {
      console.error('Error triggering call:', error);
      toast({
        title: "Call Failed",
        description: error.message || "Failed to initiate call",
        variant: "destructive"
      });
    } finally {
      setIsCallingLead(null);
    }
  };

  const overdueCount = callbacks.filter(c => isPast(new Date(c.next_callback_at))).length;
  const upcomingCount = callbacks.length - overdueCount;

  if (callbacks.length === 0 && !isLoading) {
    return null; // Don't show widget if no callbacks
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
          <Button variant="ghost" size="sm" onClick={loadCallbacks} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <ScrollArea className="h-[200px]">
          <div className="space-y-2">
            {callbacks.map((callback) => {
              const isOverdue = isPast(new Date(callback.next_callback_at));
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
                              {formatDistanceToNow(new Date(callback.next_callback_at), { addSuffix: true })}
                            </span>
                          ) : (
                            format(new Date(callback.next_callback_at), 'h:mm a')
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={isOverdue ? "destructive" : "default"}
                    onClick={() => handleCallNow(callback)}
                    disabled={isCallingLead === callback.id}
                    className="shrink-0"
                  >
                    <Phone className="h-3 w-3 mr-1" />
                    {isCallingLead === callback.id ? 'Calling...' : 'Call Now'}
                  </Button>
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
