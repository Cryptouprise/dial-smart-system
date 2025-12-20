import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { 
  Phone, 
  PhoneCall, 
  PhoneOff, 
  PhoneIncoming,
  Activity,
  Clock,
  TrendingUp,
  Wifi,
  WifiOff
} from 'lucide-react';
import { useRealtimeCallStatus, LiveCall } from '@/hooks/useRealtimeCallStatus';

const LiveCallMonitor = () => {
  const { liveCalls, stats, isConnected, endCall, refreshCalls } = useRealtimeCallStatus();

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusIcon = (status: LiveCall['status']) => {
    switch (status) {
      case 'ringing':
        return <PhoneIncoming className="h-4 w-4 text-yellow-500 animate-pulse" />;
      case 'in_progress':
        return <PhoneCall className="h-4 w-4 text-green-500" />;
      case 'queued':
        return <Phone className="h-4 w-4 text-blue-500" />;
      default:
        return <PhoneOff className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: LiveCall['status']) => {
    switch (status) {
      case 'ringing':
        return { variant: 'secondary' as const, label: 'Ringing' };
      case 'in_progress':
        return { variant: 'default' as const, label: 'Connected' };
      case 'queued':
        return { variant: 'outline' as const, label: 'Queued' };
      default:
        return { variant: 'destructive' as const, label: status };
    }
  };

  return (
    <Card className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950 border-green-200 dark:border-green-800">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-xl font-bold flex items-center gap-2">
              <Activity className="h-5 w-5 text-green-600 dark:text-green-400" />
              Live Call Monitor
              {isConnected ? (
                <Badge variant="default" className="ml-2 bg-green-500">
                  <Wifi className="h-3 w-3 mr-1" />
                  Live
                </Badge>
              ) : (
                <Badge variant="destructive" className="ml-2">
                  <WifiOff className="h-3 w-3 mr-1" />
                  Disconnected
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Real-time call progress and status updates
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={refreshCalls}>
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border text-center">
            <Phone className="h-4 w-4 mx-auto mb-1 text-blue-500" />
            <p className="text-2xl font-bold">{stats.totalActive}</p>
            <p className="text-xs text-muted-foreground">Active</p>
          </div>
          <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border text-center">
            <PhoneIncoming className="h-4 w-4 mx-auto mb-1 text-yellow-500" />
            <p className="text-2xl font-bold">{stats.ringing}</p>
            <p className="text-xs text-muted-foreground">Ringing</p>
          </div>
          <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border text-center">
            <PhoneCall className="h-4 w-4 mx-auto mb-1 text-green-500" />
            <p className="text-2xl font-bold">{stats.inProgress}</p>
            <p className="text-xs text-muted-foreground">Connected</p>
          </div>
          <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border text-center">
            <TrendingUp className="h-4 w-4 mx-auto mb-1 text-purple-500" />
            <p className="text-2xl font-bold">{stats.completedToday}</p>
            <p className="text-xs text-muted-foreground">Today</p>
          </div>
          <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border text-center">
            <Activity className="h-4 w-4 mx-auto mb-1 text-indigo-500" />
            <p className="text-2xl font-bold">{stats.answerRateToday}%</p>
            <p className="text-xs text-muted-foreground">Answer Rate</p>
          </div>
          <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border text-center">
            <Clock className="h-4 w-4 mx-auto mb-1 text-orange-500" />
            <p className="text-2xl font-bold">{formatDuration(stats.avgDurationToday)}</p>
            <p className="text-xs text-muted-foreground">Avg Duration</p>
          </div>
        </div>

        {/* Active Calls List */}
        <div>
          <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
            Active Calls
            <Badge variant="outline">{liveCalls.length}</Badge>
          </h4>
          
          {liveCalls.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Phone className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No active calls</p>
              <p className="text-xs">Start dialing to see live call status</p>
            </div>
          ) : (
            <ScrollArea className="h-[300px]">
              <div className="space-y-2">
                {liveCalls.map((call) => {
                  const statusBadge = getStatusBadge(call.status);
                  const progressValue = call.status === 'ringing' ? 50 : 
                                        call.status === 'in_progress' ? 100 : 25;
                  
                  return (
                    <div
                      key={call.id}
                      className="p-3 bg-white dark:bg-slate-800 rounded-lg border"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(call.status)}
                          <div>
                            <p className="font-medium">{call.leadName}</p>
                            <p className="text-xs text-muted-foreground font-mono">
                              {call.phoneNumber}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={statusBadge.variant}>
                            {statusBadge.label}
                          </Badge>
                          <span className="text-sm font-mono font-bold">
                            {formatDuration(call.duration)}
                          </span>
                          {call.status === 'in_progress' && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => endCall(call.id)}
                            >
                              <PhoneOff className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Progress 
                          value={progressValue} 
                          className={`h-1 ${call.status === 'ringing' ? 'animate-pulse' : ''}`}
                        />
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{call.campaignName}</span>
                          <span>from: {call.callerId}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Connection Status */}
        {!isConnected && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
            <div className="flex items-center gap-2 text-yellow-800 dark:text-yellow-200">
              <WifiOff className="h-4 w-4" />
              <p className="text-sm font-medium">Real-time updates disconnected</p>
            </div>
            <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
              Click refresh to reconnect and see latest call status
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default LiveCallMonitor;
