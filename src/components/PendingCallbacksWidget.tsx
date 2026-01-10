import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format, formatDistanceToNow, isPast } from 'date-fns';
import { Phone, Clock, AlertTriangle, RefreshCw, User, X } from 'lucide-react';
import { useCallbacks, UnifiedCallback } from '@/hooks/useCallbacks';

interface PendingCallbacksWidgetProps {
  onCallNow?: (leadId: string) => void;
}

export const PendingCallbacksWidget: React.FC<PendingCallbacksWidgetProps> = ({ onCallNow }) => {
  const { callbacks, isLoading, overdueCount, upcomingCount, refresh } = useCallbacks();
  const [isCallingLead, setIsCallingLead] = useState<string | null>(null);
  const [isCancellingLead, setIsCancellingLead] = useState<string | null>(null);
  const { toast } = useToast();

  const handleCallNow = async (callback: UnifiedCallback) => {
    setIsCallingLead(callback.id);
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
      await supabase
        .from('dialing_queues')
        .delete()
        .eq('lead_id', callback.lead_id);

      // Add to queue with immediate scheduling and high priority
      const { error: insertError } = await supabase
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

      if (insertError) throw insertError;

      // Trigger immediate dispatch
      const dispatchResponse = await supabase.functions.invoke('call-dispatcher', {
        body: { immediate: true }
      });

      if (dispatchResponse.error) {
        throw new Error(dispatchResponse.error.message || 'Dispatch failed');
      }

      if (dispatchResponse.data?.error) {
        throw new Error(dispatchResponse.data.error);
      }

      toast({
        title: "Call Initiated",
        description: `Calling ${callback.first_name || callback.phone_number} now...`,
      });

      if (onCallNow) {
        onCallNow(callback.lead_id);
      }

      setTimeout(refresh, 2000);
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

  const handleCancelCallback = async (callback: UnifiedCallback) => {
    setIsCancellingLead(callback.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // 1. Clear the callback on the lead
      const { error: leadError } = await supabase
        .from('leads')
        .update({
          next_callback_at: null,
          status: 'contacted',
          updated_at: new Date().toISOString()
        })
        .eq('id', callback.lead_id);

      if (leadError) throw leadError;

      // 2. Remove from dialing queue
      await supabase
        .from('dialing_queues')
        .delete()
        .eq('lead_id', callback.lead_id);

      // 3. Cancel scheduled follow-ups
      await supabase
        .from('scheduled_follow_ups')
        .update({ status: 'cancelled' })
        .eq('lead_id', callback.lead_id)
        .eq('status', 'pending');

      // 4. Resume any paused workflow for this lead
      await supabase
        .from('lead_workflow_progress')
        .update({ status: 'active' })
        .eq('lead_id', callback.lead_id)
        .eq('status', 'paused');

      toast({
        title: "Callback Cancelled",
        description: `${callback.first_name || callback.phone_number} removed from callbacks.`,
      });

      refresh();
    } catch (error: any) {
      console.error('Error cancelling callback:', error);
      toast({
        title: "Cancel Failed",
        description: error.message || "Failed to cancel callback",
        variant: "destructive"
      });
    } finally {
      setIsCancellingLead(null);
    }
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
                      disabled={isCancellingLead === callback.id}
                      className="text-muted-foreground hover:text-destructive"
                      title="Cancel callback"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant={isOverdue ? "destructive" : "default"}
                      onClick={() => handleCallNow(callback)}
                      disabled={isCallingLead === callback.id}
                    >
                      <Phone className="h-3 w-3 mr-1" />
                      {isCallingLead === callback.id ? 'Calling...' : 'Call Now'}
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
