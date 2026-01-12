import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Activity, Phone, PhoneOff, AlertCircle, CheckCircle, 
  Loader2, Zap, Clock, Search, RefreshCw, Trash2,
  PhoneIncoming, PhoneCall, XCircle, Wifi, WifiOff
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface ActivityEvent {
  id: string;
  type: 'dispatch' | 'call_started' | 'call_ringing' | 'call_answered' | 'call_ended' | 'call_failed' | 'searching' | 'no_leads' | 'error' | 'cleanup';
  message: string;
  details?: string;
  timestamp: Date;
  leadName?: string;
  phoneNumber?: string;
}

interface DispatcherActivityFeedProps {
  campaignId?: string;
  isActive: boolean;
}

export function DispatcherActivityFeed({ campaignId, isActive }: DispatcherActivityFeedProps) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [lastDispatchTime, setLastDispatchTime] = useState<Date | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Add event to feed
  const addEvent = (event: Omit<ActivityEvent, 'id' | 'timestamp'>) => {
    const newEvent: ActivityEvent = {
      ...event,
      id: crypto.randomUUID(),
      timestamp: new Date(),
    };
    setEvents(prev => [newEvent, ...prev].slice(0, 50)); // Keep last 50 events
  };

  // Set up real-time subscriptions for call_logs and dialing_queues
  useEffect(() => {
    if (!isActive) {
      setIsConnected(false);
      return;
    }

    // Initial "watching" event
    addEvent({
      type: 'searching',
      message: 'Dispatcher activated',
      details: 'Watching for calls to dispatch...',
    });

    setIsConnected(true);

    // Subscribe to call_logs changes
    const callLogsChannel = supabase
      .channel('dispatcher-call-logs')
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'call_logs',
          ...(campaignId ? { filter: `campaign_id=eq.${campaignId}` } : {})
        },
        (payload) => {
          const record = payload.new as any;
          
          if (payload.eventType === 'INSERT') {
            addEvent({
              type: 'call_started',
              message: `Call initiated`,
              details: `Calling ${record.phone_number}`,
              phoneNumber: record.phone_number,
            });
          } else if (payload.eventType === 'UPDATE') {
            const status = record.status;
            if (status === 'ringing') {
              addEvent({
                type: 'call_ringing',
                message: 'Call ringing',
                details: record.phone_number,
                phoneNumber: record.phone_number,
              });
            } else if (status === 'answered' || status === 'in_progress') {
              addEvent({
                type: 'call_answered',
                message: 'Call connected!',
                details: `${record.phone_number} - ${record.outcome || 'In progress'}`,
                phoneNumber: record.phone_number,
              });
            } else if (status === 'completed' || status === 'ended') {
              addEvent({
                type: 'call_ended',
                message: 'Call completed',
                details: `Duration: ${record.duration_seconds || 0}s - ${record.outcome || 'No outcome'}`,
                phoneNumber: record.phone_number,
              });
            } else if (status === 'failed' || status === 'no_answer') {
              addEvent({
                type: 'call_failed',
                message: status === 'failed' ? 'Call failed' : 'No answer',
                details: record.phone_number,
                phoneNumber: record.phone_number,
              });
            }
          }
        }
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    // Subscribe to dialing_queues changes
    const queueChannel = supabase
      .channel('dispatcher-queue')
      .on(
        'postgres_changes',
        { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'dialing_queues',
          ...(campaignId ? { filter: `campaign_id=eq.${campaignId}` } : {})
        },
        (payload) => {
          const record = payload.new as any;
          if (record.status === 'calling') {
            addEvent({
              type: 'dispatch',
              message: 'Lead picked for calling',
              details: record.phone_number,
              phoneNumber: record.phone_number,
            });
            setLastDispatchTime(new Date());
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(callLogsChannel);
      supabase.removeChannel(queueChannel);
      setIsConnected(false);
    };
  }, [isActive, campaignId]);

  const getEventIcon = (type: ActivityEvent['type']) => {
    switch (type) {
      case 'dispatch':
        return <Zap className="h-4 w-4 text-yellow-500" />;
      case 'call_started':
        return <Phone className="h-4 w-4 text-blue-500" />;
      case 'call_ringing':
        return <PhoneIncoming className="h-4 w-4 text-yellow-500 animate-pulse" />;
      case 'call_answered':
        return <PhoneCall className="h-4 w-4 text-green-500" />;
      case 'call_ended':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'call_failed':
        return <XCircle className="h-4 w-4 text-destructive" />;
      case 'searching':
        return <Search className="h-4 w-4 text-muted-foreground" />;
      case 'no_leads':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      case 'cleanup':
        return <Trash2 className="h-4 w-4 text-muted-foreground" />;
      default:
        return <Activity className="h-4 w-4" />;
    }
  };

  const getEventColor = (type: ActivityEvent['type']) => {
    switch (type) {
      case 'call_answered':
      case 'call_ended':
        return 'border-l-green-500 bg-green-500/5';
      case 'call_started':
      case 'call_ringing':
        return 'border-l-blue-500 bg-blue-500/5';
      case 'call_failed':
      case 'error':
        return 'border-l-destructive bg-destructive/5';
      case 'dispatch':
        return 'border-l-yellow-500 bg-yellow-500/5';
      default:
        return 'border-l-muted-foreground bg-muted/30';
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const clearEvents = () => {
    setEvents([]);
    if (isActive) {
      addEvent({
        type: 'searching',
        message: 'Feed cleared',
        details: 'Watching for new activity...',
      });
    }
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Live Dispatcher Activity
            {isConnected ? (
              <Badge variant="default" className="bg-green-500 text-xs">
                <Wifi className="h-3 w-3 mr-1" />
                Live
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-xs">
                <WifiOff className="h-3 w-3 mr-1" />
                {isActive ? 'Connecting...' : 'Inactive'}
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            {lastDispatchTime && (
              <span className="text-xs text-muted-foreground">
                Last dispatch: {formatTime(lastDispatchTime)}
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={clearEvents}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!isActive ? (
          <div className="text-center py-8 text-muted-foreground">
            <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Start a dialing session to see live activity</p>
            <p className="text-xs mt-1">Real-time updates will appear here</p>
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
            <p className="text-sm">Waiting for dispatcher activity...</p>
            <p className="text-xs mt-1">Calls will appear here when dispatched</p>
          </div>
        ) : (
          <ScrollArea className="h-[300px]">
            <div ref={scrollRef} className="space-y-2">
              {events.map((event) => (
                <div
                  key={event.id}
                  className={`flex items-start gap-3 p-2 rounded-lg border-l-2 ${getEventColor(event.type)}`}
                >
                  <div className="mt-0.5">
                    {getEventIcon(event.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium truncate">{event.message}</p>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatTime(event.timestamp)}
                      </span>
                    </div>
                    {event.details && (
                      <p className="text-xs text-muted-foreground truncate font-mono">
                        {event.details}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
