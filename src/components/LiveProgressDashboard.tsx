import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { 
  Phone, PhoneOff, PhoneForwarded, Clock, TrendingUp, 
  AlertTriangle, RefreshCw, Users, Zap, Target
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface LiveStats {
  total: number;
  pending: number;
  calling: number;
  completed: number;
  failed: number;
  answered: number;
  transferred: number;
  callbacks: number;
  dnc: number;
}

interface LiveProgressDashboardProps {
  broadcastId?: string;
  campaignId?: string;
  onRefresh?: () => void;
}

export const LiveProgressDashboard: React.FC<LiveProgressDashboardProps> = ({
  broadcastId,
  campaignId,
  onRefresh
}) => {
  const [stats, setStats] = useState<LiveStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [elapsedMinutes, setElapsedMinutes] = useState(0);

  const loadStats = async () => {
    if (!broadcastId && !campaignId) return;
    
    setIsLoading(true);
    try {
      if (broadcastId) {
        // Voice broadcast stats from broadcast_queue
        const { data, error } = await supabase
          .from('broadcast_queue')
          .select('status')
          .eq('broadcast_id', broadcastId);

        if (error) throw error;

        const total = data?.length || 0;
        const statusCounts = data?.reduce((acc, item) => {
          acc[item.status] = (acc[item.status] || 0) + 1;
          return acc;
        }, {} as Record<string, number>) || {};

        setStats({
          total,
          pending: statusCounts['pending'] || 0,
          calling: statusCounts['calling'] || 0,
          completed: statusCounts['completed'] || 0,
          failed: statusCounts['failed'] || 0,
          answered: statusCounts['answered'] || 0,
          transferred: statusCounts['transferred'] || 0,
          callbacks: statusCounts['callback'] || 0,
          dnc: statusCounts['dnc'] || 0,
        });
      } else if (campaignId) {
        // Campaign stats from dialing_queues
        const { data, error } = await supabase
          .from('dialing_queues')
          .select('status')
          .eq('campaign_id', campaignId);

        if (error) throw error;

        const total = data?.length || 0;
        const statusCounts = data?.reduce((acc, item) => {
          acc[item.status] = (acc[item.status] || 0) + 1;
          return acc;
        }, {} as Record<string, number>) || {};

        setStats({
          total,
          pending: statusCounts['pending'] || 0,
          calling: statusCounts['in_progress'] || 0,
          completed: statusCounts['completed'] || 0,
          failed: statusCounts['failed'] || 0,
          answered: statusCounts['answered'] || 0,
          transferred: statusCounts['transferred'] || 0,
          callbacks: statusCounts['callback'] || 0,
          dnc: statusCounts['dnc'] || 0,
        });
      }

      if (!startTime) {
        setStartTime(new Date());
      }
    } catch (error) {
      console.error('Error loading live stats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Update elapsed time every minute
  useEffect(() => {
    if (!startTime) return;
    
    const interval = setInterval(() => {
      const now = new Date();
      setElapsedMinutes(Math.floor((now.getTime() - startTime.getTime()) / 60000));
    }, 60000);

    return () => clearInterval(interval);
  }, [startTime]);

  // Auto-refresh stats every 5 seconds
  useEffect(() => {
    loadStats();
    
    const interval = setInterval(loadStats, 5000);
    return () => clearInterval(interval);
  }, [broadcastId, campaignId]);

  if (!stats) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-6 text-center">
          <RefreshCw className="h-6 w-6 mx-auto text-muted-foreground animate-spin" />
          <p className="text-sm text-muted-foreground mt-2">Loading stats...</p>
        </CardContent>
      </Card>
    );
  }

  const progress = stats.total > 0 
    ? Math.round(((stats.completed + stats.answered + stats.failed + stats.transferred + stats.dnc) / stats.total) * 100) 
    : 0;
  
  const successRate = (stats.completed + stats.answered + stats.transferred) > 0
    ? Math.round((stats.answered + stats.transferred) / (stats.completed + stats.answered + stats.failed + stats.transferred) * 100)
    : 0;
  
  const errorRate = (stats.completed + stats.answered + stats.failed) > 0
    ? Math.round(stats.failed / (stats.completed + stats.answered + stats.failed + stats.transferred) * 100)
    : 0;

  const estimatedRemaining = stats.calling > 0 && elapsedMinutes > 0
    ? Math.ceil(stats.pending / (stats.calling * 60 / elapsedMinutes))
    : 0;

  return (
    <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 via-transparent to-primary/5">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary animate-pulse" />
            Live Progress
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              <Clock className="h-3 w-3 mr-1" />
              {elapsedMinutes}m elapsed
            </Badge>
            <Button variant="ghost" size="sm" onClick={() => { loadStats(); onRefresh?.(); }} disabled={isLoading}>
              <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress Bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span>Overall Progress</span>
            <span className="font-medium">{progress}%</span>
          </div>
          <Progress value={progress} className="h-3" />
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
          <div className="text-center p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <Phone className="h-4 w-4 mx-auto text-blue-600 mb-1" />
            <div className="text-xl font-bold text-blue-600">{stats.calling}</div>
            <div className="text-xs text-muted-foreground">Calling</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-slate-500/10 border border-slate-500/20">
            <Users className="h-4 w-4 mx-auto text-slate-600 mb-1" />
            <div className="text-xl font-bold">{stats.pending}</div>
            <div className="text-xs text-muted-foreground">Pending</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-green-500/10 border border-green-500/20">
            <Target className="h-4 w-4 mx-auto text-green-600 mb-1" />
            <div className="text-xl font-bold text-green-600">{stats.answered}</div>
            <div className="text-xs text-muted-foreground">Answered</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-purple-500/10 border border-purple-500/20">
            <PhoneForwarded className="h-4 w-4 mx-auto text-purple-600 mb-1" />
            <div className="text-xl font-bold text-purple-600">{stats.transferred}</div>
            <div className="text-xs text-muted-foreground">Transfers</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-red-500/10 border border-red-500/20">
            <PhoneOff className="h-4 w-4 mx-auto text-red-600 mb-1" />
            <div className="text-xl font-bold text-red-600">{stats.failed}</div>
            <div className="text-xs text-muted-foreground">Failed</div>
          </div>
        </div>

        {/* Metrics Row */}
        <div className="flex items-center justify-between text-sm pt-2 border-t">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <TrendingUp className="h-4 w-4 text-green-600" />
              <span>Success: <strong className="text-green-600">{successRate}%</strong></span>
            </div>
            <div className="flex items-center gap-1">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <span>Errors: <strong className={errorRate > 10 ? 'text-red-600' : 'text-muted-foreground'}>{errorRate}%</strong></span>
            </div>
          </div>
          {estimatedRemaining > 0 && (
            <span className="text-muted-foreground">
              ~{estimatedRemaining}m remaining
            </span>
          )}
        </div>

        {/* Warnings */}
        {errorRate > 20 && (
          <div className="flex items-center gap-2 p-2 bg-red-500/10 border border-red-500/20 rounded-lg text-red-600 text-sm">
            <AlertTriangle className="h-4 w-4" />
            High error rate detected. Check phone number health.
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default LiveProgressDashboard;