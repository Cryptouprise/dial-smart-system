import { MessageSquare, MessageCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AnimatedCounter } from '@/components/ui/animated-counter';

export interface SmsReply {
  id: string;
  from: string;
  message: string;
  timestamp: Date;
  disposition: string;
}

interface DemoSmsRepliesPanelProps {
  replies: SmsReply[];
}

export const DemoSmsRepliesPanel = ({ replies }: DemoSmsRepliesPanelProps) => {
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  };

  return (
    <Card className="p-4 h-full glass-card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-primary" />
          Inbound SMS Replies
        </h3>
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-green-500/20 text-green-600 text-xs font-medium">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </span>
          <AnimatedCounter value={replies.length} duration={300} /> received
        </div>
      </div>
      
      <ScrollArea className="h-[200px] pr-2">
        {replies.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <MessageSquare className="h-8 w-8 text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">
              Waiting for lead responses...
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              SMS replies will appear here
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {replies.map((reply, index) => (
              <div
                key={reply.id}
                className="p-2.5 rounded-lg bg-muted/50 border border-border/50 animate-in slide-in-from-left-2 fade-in"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-sm">{reply.from}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {formatTime(reply.timestamp)}
                  </span>
                </div>
                <p className="text-sm text-foreground/80">{reply.message}</p>
                <div className="mt-1.5 flex items-center gap-1">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                    {reply.disposition === 'appointment' ? '🎉 Appointment' :
                     reply.disposition === 'hotLead' ? '🔥 Hot Lead' :
                     reply.disposition === 'followUp' ? '📅 Follow Up' :
                     reply.disposition === 'sendInfo' ? '📧 Send Info' :
                     reply.disposition}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
      
      <div className="mt-3 pt-3 border-t">
        <p className="text-xs text-muted-foreground text-center">
          💡 These represent automated responses from your outreach
        </p>
      </div>
    </Card>
  );
};

export default DemoSmsRepliesPanel;
