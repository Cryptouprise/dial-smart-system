import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Workflow, Play, Pause, CheckCircle, XCircle, RefreshCw, Loader2,
  TrendingUp, Clock, AlertTriangle
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface WorkflowStats {
  active: number;
  paused: number;
  completed: number;
  failed: number;
  total: number;
}

interface RecentActivity {
  id: string;
  lead_name: string;
  status: string;
  step_type: string;
  updated_at: string;
}

export function WorkflowHealthWidget() {
  const [stats, setStats] = useState<WorkflowStats>({
    active: 0,
    paused: 0,
    completed: 0,
    failed: 0,
    total: 0,
  });
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { toast } = useToast();

  const fetchStats = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get workflow progress counts by status
      const { data: progressData, error } = await supabase
        .from('lead_workflow_progress')
        .select('status, leads(first_name, last_name), workflow_steps(step_type), updated_at')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      // Calculate stats
      const newStats: WorkflowStats = {
        active: 0,
        paused: 0,
        completed: 0,
        failed: 0,
        total: progressData?.length || 0,
      };

      const activities: RecentActivity[] = [];

      for (const item of progressData || []) {
        switch (item.status) {
          case 'active':
            newStats.active++;
            break;
          case 'paused':
            newStats.paused++;
            break;
          case 'completed':
            newStats.completed++;
            break;
          case 'removed':
          case 'failed':
            newStats.failed++;
            break;
        }

        // Collect recent activity
        if (activities.length < 5) {
          const lead = item.leads as any;
          const step = item.workflow_steps as any;
          activities.push({
            id: `${item.status}-${activities.length}`,
            lead_name: lead ? `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || 'Unknown' : 'Unknown',
            status: item.status,
            step_type: step?.step_type || 'unknown',
            updated_at: item.updated_at,
          });
        }
      }

      setStats(newStats);
      setRecentActivity(activities);
    } catch (error) {
      console.error('Error fetching workflow stats:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStats();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('workflow-health')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'lead_workflow_progress',
        },
        () => {
          // Debounce refresh
          setTimeout(() => fetchStats(), 500);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchStats();
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <Play className="h-3 w-3 text-green-500" />;
      case 'paused':
        return <Pause className="h-3 w-3 text-yellow-500" />;
      case 'completed':
        return <CheckCircle className="h-3 w-3 text-blue-500" />;
      case 'removed':
      case 'failed':
        return <XCircle className="h-3 w-3 text-red-500" />;
      default:
        return <Clock className="h-3 w-3 text-muted-foreground" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20';
      case 'paused':
        return 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20';
      case 'completed':
        return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20';
      default:
        return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20';
    }
  };

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date();
    const then = new Date(timestamp);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return `${Math.floor(diffMins / 1440)}d ago`;
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Workflow className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Workflow Health</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <CardDescription>Real-time workflow status monitoring</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-2">
          <div className="text-center p-2 rounded-lg bg-green-500/10 border border-green-500/20">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.active}</div>
            <div className="text-xs text-muted-foreground">Active</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{stats.paused}</div>
            <div className="text-xs text-muted-foreground">Paused</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.completed}</div>
            <div className="text-xs text-muted-foreground">Done</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-red-500/10 border border-red-500/20">
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.failed}</div>
            <div className="text-xs text-muted-foreground">Failed</div>
          </div>
        </div>

        {/* Health Indicator */}
        {stats.active === 0 && stats.paused === 0 && stats.total > 0 && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 text-sm">
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
            <span className="text-muted-foreground">No active workflows running</span>
          </div>
        )}

        {stats.active > 0 && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-green-500/5 text-sm">
            <TrendingUp className="h-4 w-4 text-green-500" />
            <span className="text-green-600 dark:text-green-400">
              {stats.active} workflow{stats.active !== 1 ? 's' : ''} actively running
            </span>
          </div>
        )}

        {/* Recent Activity */}
        {recentActivity.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium text-muted-foreground">Recent Activity</div>
            <div className="space-y-1">
              {recentActivity.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-center justify-between p-2 rounded-md bg-muted/30 text-sm"
                >
                  <div className="flex items-center gap-2">
                    {getStatusIcon(activity.status)}
                    <span className="font-medium truncate max-w-[120px]">{activity.lead_name}</span>
                    <Badge variant="outline" className={`text-xs ${getStatusColor(activity.status)}`}>
                      {activity.status}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatTimeAgo(activity.updated_at)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {stats.total === 0 && (
          <div className="text-center py-4 text-muted-foreground text-sm">
            No workflow activity yet. Launch a campaign to get started.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
