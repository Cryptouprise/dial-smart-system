import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Phone, PhoneOff, Clock, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface CampaignCallActivityProps {
  campaignId: string;
}

export const CampaignCallActivity = ({ campaignId }: CampaignCallActivityProps) => {
  const { toast } = useToast();
  const [calls, setCalls] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    total: 0,
    completed: 0,
    failed: 0,
    inProgress: 0
  });

  useEffect(() => {
    loadCallActivity();
    
    // Set up real-time subscription for call updates
    const channel = supabase
      .channel(`campaign-calls-${campaignId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'call_logs',
          filter: `campaign_id=eq.${campaignId}`
        },
        () => {
          loadCallActivity();
        }
      )
      .subscribe();

    // Refresh every 10 seconds
    const interval = setInterval(loadCallActivity, 10000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [campaignId]);

  const loadCallActivity = async () => {
    try {
      const { data, error } = await supabase
        .from('call_logs')
        .select(`
          *,
          leads(first_name, last_name, phone_number)
        `)
        .eq('campaign_id', campaignId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      setCalls(data || []);

      // Calculate stats
      const completed = data?.filter(c => c.status === 'completed').length || 0;
      const failed = data?.filter(c => c.status === 'failed').length || 0;
      const inProgress = data?.filter(c => c.status === 'in-progress').length || 0;

      setStats({
        total: data?.length || 0,
        completed,
        failed,
        inProgress
      });

    } catch (error: any) {
      console.error('Error loading call activity:', error);
      toast({
        title: "Error",
        description: "Failed to load call activity",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      'completed': { variant: 'default', icon: CheckCircle, label: 'Completed' },
      'failed': { variant: 'destructive', icon: XCircle, label: 'Failed' },
      'in-progress': { variant: 'secondary', icon: Phone, label: 'In Progress' },
      'no-answer': { variant: 'outline', icon: PhoneOff, label: 'No Answer' }
    };

    const config = variants[status] || { variant: 'outline', icon: Clock, label: status };
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">Total Calls</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
            <p className="text-xs text-muted-foreground">Completed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
            <p className="text-xs text-muted-foreground">Failed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-blue-600">{stats.inProgress}</div>
            <p className="text-xs text-muted-foreground">In Progress</p>
          </CardContent>
        </Card>
      </div>

      {/* Call List */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Recent Calls</CardTitle>
              <CardDescription>Last 10 calls from this campaign</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={loadCallActivity}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {calls.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Phone className="h-12 w-12 mx-auto mb-2 opacity-20" />
              <p>No calls yet</p>
              <p className="text-sm">Start the campaign to begin making calls</p>
            </div>
          ) : (
            <div className="space-y-3">
              {calls.map((call) => (
                <div
                  key={call.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {call.leads?.first_name} {call.leads?.last_name}
                      </span>
                      {getStatusBadge(call.status)}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      <span className="font-mono">{call.phone_number}</span>
                      {call.duration_seconds && (
                        <span className="ml-3">
                          Duration: {Math.floor(call.duration_seconds / 60)}m {call.duration_seconds % 60}s
                        </span>
                      )}
                    </div>
                    {call.outcome && (
                      <div className="text-sm text-muted-foreground mt-1">
                        Outcome: {call.outcome}
                      </div>
                    )}
                  </div>
                  <div className="text-right text-sm text-muted-foreground">
                    {new Date(call.created_at).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
