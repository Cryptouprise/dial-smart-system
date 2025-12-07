import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bot, MessageSquare, Phone, ArrowRight, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';

interface RecentActivity {
  id: string;
  type: 'decision' | 'followup';
  decision_type?: string;
  action_type?: string;
  description: string;
  created_at: string;
  success?: boolean;
}

const AgentActivityWidget = () => {
  const [activities, setActivities] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRecentActivity();
  }, []);

  const loadRecentActivity = async () => {
    const [decisionsResult, followUpsResult] = await Promise.all([
      supabase
        .from('agent_decisions')
        .select('id, decision_type, action_taken, created_at, success')
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('scheduled_follow_ups')
        .select('id, action_type, scheduled_at, status, created_at')
        .eq('status', 'pending')
        .order('scheduled_at', { ascending: true })
        .limit(3)
    ]);

    const combined: RecentActivity[] = [];

    if (decisionsResult.data) {
      decisionsResult.data.forEach(d => {
        combined.push({
          id: d.id,
          type: 'decision',
          decision_type: d.decision_type,
          description: d.action_taken || d.decision_type,
          created_at: d.created_at,
          success: d.success
        });
      });
    }

    if (followUpsResult.data) {
      followUpsResult.data.forEach(f => {
        combined.push({
          id: f.id,
          type: 'followup',
          action_type: f.action_type,
          description: `${f.action_type === 'ai_call' ? 'Call' : 'SMS'} scheduled`,
          created_at: f.scheduled_at
        });
      });
    }

    // Sort by date
    combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setActivities(combined.slice(0, 6));
    setLoading(false);
  };

  const getIcon = (activity: RecentActivity) => {
    if (activity.type === 'followup') {
      return activity.action_type === 'ai_call' 
        ? <Phone className="h-3 w-3 text-blue-500" />
        : <MessageSquare className="h-3 w-3 text-green-500" />;
    }
    
    switch (activity.decision_type) {
      case 'sms_disposition':
        return <MessageSquare className="h-3 w-3 text-green-500" />;
      case 'call_disposition':
        return <Phone className="h-3 w-3 text-blue-500" />;
      case 'create_pipeline_stage':
        return <ArrowRight className="h-3 w-3 text-orange-500" />;
      default:
        return <Bot className="h-3 w-3 text-purple-500" />;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Bot className="h-4 w-4" />
            AI Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center py-4">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border-slate-200 dark:border-slate-700">
      <CardHeader className="pb-2 px-3 pt-3">
        <CardTitle className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400 flex items-center gap-2">
          <Bot className="h-4 w-4 text-purple-500" />
          AI Agent Activity
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        {activities.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-2">No recent activity</p>
        ) : (
          <div className="space-y-2">
            {activities.map((activity) => (
              <div 
                key={activity.id} 
                className="flex items-center gap-2 text-xs p-1.5 rounded bg-muted/50"
              >
                {getIcon(activity)}
                <span className="flex-1 truncate text-slate-700 dark:text-slate-300">
                  {activity.description}
                </span>
                {activity.type === 'followup' && (
                  <Badge variant="outline" className="text-[10px] px-1 py-0">
                    <Clock className="h-2 w-2 mr-0.5" />
                    Soon
                  </Badge>
                )}
                <span className="text-muted-foreground text-[10px] whitespace-nowrap">
                  {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AgentActivityWidget;
