import React, { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Play,
  Trash2,
  RefreshCw,
  Zap,
  Shield,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

interface QueueAction {
  id: string;
  action_type: string;
  action_params: Record<string, any>;
  priority: number;
  status: string;
  requires_approval: boolean;
  reasoning: string;
  source: string;
  result: any;
  error_message: string | null;
  created_at: string;
  approved_at: string | null;
  executed_at: string | null;
  expires_at: string | null;
}

const STATUS_CONFIG: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  pending: { color: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30', icon: <Clock className="h-3 w-3" />, label: 'Awaiting Approval' },
  approved: { color: 'bg-blue-500/10 text-blue-600 border-blue-500/30', icon: <Play className="h-3 w-3" />, label: 'Approved' },
  executing: { color: 'bg-purple-500/10 text-purple-600 border-purple-500/30', icon: <Zap className="h-3 w-3" />, label: 'Executing' },
  completed: { color: 'bg-green-500/10 text-green-600 border-green-500/30', icon: <CheckCircle2 className="h-3 w-3" />, label: 'Completed' },
  failed: { color: 'bg-red-500/10 text-red-600 border-red-500/30', icon: <XCircle className="h-3 w-3" />, label: 'Failed' },
  rejected: { color: 'bg-gray-500/10 text-gray-600 border-gray-500/30', icon: <XCircle className="h-3 w-3" />, label: 'Rejected' },
  expired: { color: 'bg-gray-500/10 text-gray-400 border-gray-500/20', icon: <Clock className="h-3 w-3" />, label: 'Expired' },
};

const ActionQueuePanel: React.FC = () => {
  const [actions, setActions] = useState<QueueAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const { toast } = useToast();

  const loadActions = useCallback(async () => {
    try {
      let query = (supabase as any)
        .from('ai_action_queue')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (filter !== 'all') {
        query = query.eq('status', filter);
      }

      const { data, error } = await query;
      if (error) throw error;
      setActions((data as QueueAction[]) || []);
    } catch (err: any) {
      console.error('Error loading action queue:', err);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    loadActions();
    // Poll every 30 seconds for updates
    const interval = setInterval(loadActions, 30000);
    return () => clearInterval(interval);
  }, [loadActions]);

  const handleApprove = async (actionId: string) => {
    const { error } = await (supabase as any)
      .from('ai_action_queue')
      .update({ status: 'approved', approved_at: new Date().toISOString() })
      .eq('id', actionId);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Action Approved', description: 'Will execute on next engine cycle (within 5 min).' });
      loadActions();
    }
  };

  const handleReject = async (actionId: string) => {
    const { error } = await (supabase as any)
      .from('ai_action_queue')
      .update({ status: 'rejected' })
      .eq('id', actionId);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Action Rejected' });
      loadActions();
    }
  };

  const handleApproveAll = async () => {
    const pendingIds = actions.filter(a => a.status === 'pending').map(a => a.id);
    if (pendingIds.length === 0) return;

    const { error } = await (supabase as any)
      .from('ai_action_queue')
      .update({ status: 'approved', approved_at: new Date().toISOString() })
      .in('id', pendingIds);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: `Approved ${pendingIds.length} actions` });
      loadActions();
    }
  };

  const pendingCount = actions.filter(a => a.status === 'pending').length;
  const completedToday = actions.filter(a =>
    a.status === 'completed' &&
    new Date(a.executed_at || a.created_at).toDateString() === new Date().toDateString()
  ).length;

  const formatActionType = (type: string) => type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  const getPriorityLabel = (p: number) =>
    p <= 2 ? 'Urgent' : p <= 4 ? 'High' : p <= 6 ? 'Normal' : 'Low';

  const getPriorityColor = (p: number) =>
    p <= 2 ? 'text-red-500' : p <= 4 ? 'text-orange-500' : p <= 6 ? 'text-blue-500' : 'text-gray-500';

  return (
    <div className="space-y-4">
      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3 flex items-center gap-2">
            <Clock className="h-5 w-5 text-yellow-500" />
            <div>
              <p className="text-2xl font-bold">{pendingCount}</p>
              <p className="text-xs text-muted-foreground">Awaiting Approval</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            <div>
              <p className="text-2xl font-bold">{completedToday}</p>
              <p className="text-xs text-muted-foreground">Executed Today</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-2">
            <XCircle className="h-5 w-5 text-red-500" />
            <div>
              <p className="text-2xl font-bold">{actions.filter(a => a.status === 'failed').length}</p>
              <p className="text-xs text-muted-foreground">Failed</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-500" />
            <div>
              <p className="text-2xl font-bold">{actions.length}</p>
              <p className="text-xs text-muted-foreground">Total Actions</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {['all', 'pending', 'approved', 'completed', 'failed'].map(f => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? 'default' : 'outline'}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
            </Button>
          ))}
        </div>
        <div className="flex-1" />
        {pendingCount > 0 && (
          <Button size="sm" onClick={handleApproveAll} className="bg-green-600 hover:bg-green-700">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Approve All ({pendingCount})
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={loadActions}>
          <RefreshCw className="h-3 w-3 mr-1" />
          Refresh
        </Button>
      </div>

      {/* Action List */}
      <ScrollArea className="h-[500px]">
        <div className="space-y-2">
          {loading ? (
            <Card><CardContent className="p-6 text-center text-muted-foreground">Loading actions...</CardContent></Card>
          ) : actions.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center">
                <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-muted-foreground">
                  {filter === 'all'
                    ? 'No actions yet. Enable autonomous mode and the engine will start making decisions.'
                    : `No ${filter} actions.`}
                </p>
              </CardContent>
            </Card>
          ) : (
            actions.map(action => {
              const statusCfg = STATUS_CONFIG[action.status] || STATUS_CONFIG.pending;
              return (
                <Card key={action.id} className="border-l-4" style={{ borderLeftColor: action.status === 'pending' ? '#eab308' : action.status === 'completed' ? '#22c55e' : action.status === 'failed' ? '#ef4444' : '#6b7280' }}>
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm">{formatActionType(action.action_type)}</span>
                          <Badge variant="outline" className={statusCfg.color}>
                            {statusCfg.icon}
                            <span className="ml-1">{statusCfg.label}</span>
                          </Badge>
                          <span className={`text-xs font-medium ${getPriorityColor(action.priority)}`}>
                            {getPriorityLabel(action.priority)}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">{action.reasoning}</p>
                        {action.action_params && Object.keys(action.action_params).length > 0 && (
                          <details className="mt-1">
                            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                              Parameters
                            </summary>
                            <pre className="text-xs mt-1 p-2 bg-muted rounded overflow-x-auto">
                              {JSON.stringify(action.action_params, null, 2)}
                            </pre>
                          </details>
                        )}
                        {action.error_message && (
                          <p className="text-xs text-red-500 mt-1">{action.error_message}</p>
                        )}
                        {action.result && (
                          <details className="mt-1">
                            <summary className="text-xs text-green-600 cursor-pointer">Result</summary>
                            <pre className="text-xs mt-1 p-2 bg-muted rounded overflow-x-auto">
                              {JSON.stringify(action.result, null, 2)}
                            </pre>
                          </details>
                        )}
                        <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                          <span>Source: {action.source}</span>
                          <span>{formatDistanceToNow(new Date(action.created_at), { addSuffix: true })}</span>
                        </div>
                      </div>
                      {action.status === 'pending' && (
                        <div className="flex gap-1 shrink-0">
                          <Button size="sm" variant="default" className="bg-green-600 hover:bg-green-700 h-7 px-2" onClick={() => handleApprove(action.id)}>
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Approve
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 px-2 text-red-500 hover:text-red-600" onClick={() => handleReject(action.id)}>
                            <XCircle className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default ActionQueuePanel;
