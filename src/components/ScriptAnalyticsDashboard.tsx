import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  TrendingUp, TrendingDown, Clock, Phone, MessageSquare,
  AlertTriangle, CheckCircle2, BarChart3, Mic, PhoneIncoming,
  Timer, Target, Zap, RefreshCw, AlertCircle
} from 'lucide-react';
import { format } from 'date-fns';

interface OpenerAnalytics {
  id: string;
  agent_name: string;
  opener_text: string;
  total_uses: number;
  calls_answered: number;
  calls_engaged: number;
  calls_converted: number;
  answer_rate: number;
  engagement_rate: number;
  conversion_rate: number;
  effectiveness_score: number;
  avg_call_duration: number;
  first_used_at: string;
  last_used_at: string;
}

interface TimeWastedSummary {
  time_wasted_reason: string;
  call_count: number;
  total_seconds_wasted: number;
  avg_waste_score: number;
}

interface VoicemailPerformance {
  id: string;
  broadcast_id: string;
  voicemail_audio_url: string;
  voicemail_duration_seconds: number;
  total_voicemails_left: number;
  callbacks_received: number;
  callback_rate: number;
  callbacks_within_24h: number;
  callback_rate_24h: number;
  appointments_from_callbacks: number;
  appointment_conversion_rate: number;
  effectiveness_score: number;
  first_used_at: string;
  last_used_at: string;
}

const TIME_WASTED_LABELS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  vm_too_late: { label: 'VM After Long Ring', icon: <Clock className="h-4 w-4" />, color: 'text-red-500' },
  long_no_conversion: { label: 'Long Call, No Conversion', icon: <Timer className="h-4 w-4" />, color: 'text-orange-500' },
  quick_hangup: { label: 'Quick Hangup', icon: <Phone className="h-4 w-4" />, color: 'text-yellow-500' },
  short_no_outcome: { label: 'Short, No Outcome', icon: <AlertTriangle className="h-4 w-4" />, color: 'text-amber-500' },
  vm_message_too_long: { label: 'VM Too Long', icon: <Mic className="h-4 w-4" />, color: 'text-purple-500' },
  call_failed: { label: 'Call Failed', icon: <AlertCircle className="h-4 w-4" />, color: 'text-gray-500' },
};

const ScriptAnalyticsDashboard = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [openers, setOpeners] = useState<OpenerAnalytics[]>([]);
  const [timeWasted, setTimeWasted] = useState<TimeWastedSummary[]>([]);
  const [voicemails, setVoicemails] = useState<VoicemailPerformance[]>([]);
  const [totalTimeWastedMinutes, setTotalTimeWastedMinutes] = useState(0);
  const { toast } = useToast();

  const loadAnalytics = async () => {
    setIsLoading(true);
    try {
      // Load opener analytics (top openers view)
      const { data: openerData, error: openerError } = await supabase
        .from('top_openers')
        .select('*')
        .order('effectiveness_score', { ascending: false })
        .limit(20);

      if (openerError) {
        console.error('Error loading opener analytics:', openerError);
      } else {
        setOpeners(openerData || []);
      }

      // Load time wasted summary
      const { data: wastedData, error: wastedError } = await supabase
        .from('time_wasted_summary')
        .select('*')
        .order('total_seconds_wasted', { ascending: false });

      if (wastedError) {
        console.error('Error loading time wasted data:', wastedError);
      } else {
        setTimeWasted(wastedData || []);
        const total = (wastedData || []).reduce((acc, item) => acc + (item.total_seconds_wasted || 0), 0);
        setTotalTimeWastedMinutes(Math.round(total / 60));
      }

      // Load voicemail performance
      const { data: vmData, error: vmError } = await supabase
        .from('voicemail_performance')
        .select('*')
        .order('effectiveness_score', { ascending: false })
        .limit(10);

      if (vmError) {
        console.error('Error loading voicemail data:', vmError);
      } else {
        setVoicemails(vmData || []);
      }

    } catch (error) {
      console.error('Error loading analytics:', error);
      toast({
        title: "Error",
        description: "Failed to load script analytics",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, []);

  const getEffectivenessColor = (score: number) => {
    if (score >= 70) return 'bg-green-500';
    if (score >= 50) return 'bg-yellow-500';
    if (score >= 30) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Script Analytics</h2>
          <p className="text-muted-foreground">
            AI-powered insights into your call scripts and performance
          </p>
        </div>
        <Button onClick={loadAnalytics} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Top Opener Score</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {openers.length > 0 ? openers[0]?.effectiveness_score || 0 : 'N/A'}
            </div>
            <p className="text-xs text-muted-foreground">
              {openers.length > 0 ? `${openers.length} openers tracked` : 'No data yet'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Time Wasted</CardTitle>
            <Clock className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalTimeWastedMinutes} min</div>
            <p className="text-xs text-muted-foreground">
              {timeWasted.reduce((acc, t) => acc + t.call_count, 0)} calls with issues
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">VM Callback Rate</CardTitle>
            <PhoneIncoming className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {voicemails.length > 0
                ? `${Math.round(voicemails.reduce((acc, v) => acc + v.callback_rate, 0) / voicemails.length)}%`
                : 'N/A'
              }
            </div>
            <p className="text-xs text-muted-foreground">
              {voicemails.reduce((acc, v) => acc + v.callbacks_received, 0)} callbacks received
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Best Conversion</CardTitle>
            <Target className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {openers.length > 0
                ? `${Math.round(Math.max(...openers.map(o => o.conversion_rate)))}%`
                : 'N/A'
              }
            </div>
            <p className="text-xs text-muted-foreground">
              Best opener conversion rate
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="openers" className="space-y-4">
        <TabsList>
          <TabsTrigger value="openers" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Opener Effectiveness
          </TabsTrigger>
          <TabsTrigger value="timewasted" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Time Wasted
          </TabsTrigger>
          <TabsTrigger value="voicemails" className="flex items-center gap-2">
            <Mic className="h-4 w-4" />
            Voicemail Analytics
          </TabsTrigger>
        </TabsList>

        {/* Opener Effectiveness Tab */}
        <TabsContent value="openers">
          <Card>
            <CardHeader>
              <CardTitle>Opener Effectiveness Ranking</CardTitle>
              <CardDescription>
                Compare how different script openings perform across your calls
              </CardDescription>
            </CardHeader>
            <CardContent>
              {openers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No opener data yet. Run a campaign to start collecting insights.</p>
                </div>
              ) : (
                <ScrollArea className="h-[500px]">
                  <div className="space-y-4">
                    {openers.map((opener, index) => (
                      <Card key={opener.id} className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant="outline">#{index + 1}</Badge>
                              <span className="font-medium">{opener.agent_name}</span>
                              <Badge className={getEffectivenessColor(opener.effectiveness_score)}>
                                Score: {opener.effectiveness_score}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                              "{opener.opener_text.substring(0, 200)}..."
                            </p>
                            <div className="grid grid-cols-4 gap-4 text-sm">
                              <div>
                                <span className="text-muted-foreground">Uses:</span>
                                <span className="ml-1 font-medium">{opener.total_uses}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Answer Rate:</span>
                                <span className="ml-1 font-medium">{Math.round(opener.answer_rate)}%</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Engagement:</span>
                                <span className="ml-1 font-medium">{Math.round(opener.engagement_rate)}%</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Conversion:</span>
                                <span className="ml-1 font-medium text-green-600">{Math.round(opener.conversion_rate)}%</span>
                              </div>
                            </div>
                          </div>
                          <div className="w-24">
                            <div className="text-center mb-2">
                              <span className="text-2xl font-bold">{opener.effectiveness_score}</span>
                              <span className="text-xs text-muted-foreground block">/ 100</span>
                            </div>
                            <Progress value={opener.effectiveness_score} className="h-2" />
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Time Wasted Tab */}
        <TabsContent value="timewasted">
          <Card>
            <CardHeader>
              <CardTitle>Time Wasted Analysis</CardTitle>
              <CardDescription>
                Identify where your campaigns are losing time and how to fix it
              </CardDescription>
            </CardHeader>
            <CardContent>
              {timeWasted.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No time waste data yet. Run a campaign to start analyzing efficiency.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {timeWasted.map((item) => {
                    const config = TIME_WASTED_LABELS[item.time_wasted_reason] || {
                      label: item.time_wasted_reason,
                      icon: <AlertTriangle className="h-4 w-4" />,
                      color: 'text-gray-500'
                    };
                    const percentage = totalTimeWastedMinutes > 0
                      ? Math.round((item.total_seconds_wasted / 60 / totalTimeWastedMinutes) * 100)
                      : 0;

                    return (
                      <Card key={item.time_wasted_reason} className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg bg-muted ${config.color}`}>
                              {config.icon}
                            </div>
                            <div>
                              <p className="font-medium">{config.label}</p>
                              <p className="text-sm text-muted-foreground">
                                {item.call_count} calls affected
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold">
                              {formatDuration(item.total_seconds_wasted)}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {percentage}% of waste
                            </p>
                          </div>
                        </div>
                        <Progress value={percentage} className="mt-3 h-2" />
                        <div className="mt-2 text-xs text-muted-foreground">
                          <span className="font-medium">Fix:</span>{' '}
                          {item.time_wasted_reason === 'vm_too_late' && 'Reduce ring time or enable faster AMD detection'}
                          {item.time_wasted_reason === 'long_no_conversion' && 'Improve qualification questions early in the call'}
                          {item.time_wasted_reason === 'quick_hangup' && 'Test different openers to reduce immediate hangups'}
                          {item.time_wasted_reason === 'short_no_outcome' && 'Verify lead quality and phone numbers'}
                          {item.time_wasted_reason === 'vm_message_too_long' && 'Shorten your voicemail script to under 30 seconds'}
                          {item.time_wasted_reason === 'call_failed' && 'Check carrier connectivity and number reputation'}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Voicemail Analytics Tab */}
        <TabsContent value="voicemails">
          <Card>
            <CardHeader>
              <CardTitle>Voicemail Message Performance</CardTitle>
              <CardDescription>
                Track which voicemail messages generate callbacks and appointments
              </CardDescription>
            </CardHeader>
            <CardContent>
              {voicemails.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Mic className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No voicemail data yet. Leave some voicemails to start tracking.</p>
                </div>
              ) : (
                <ScrollArea className="h-[500px]">
                  <div className="space-y-4">
                    {voicemails.map((vm, index) => (
                      <Card key={vm.id} className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant="outline">#{index + 1}</Badge>
                              <Badge className={getEffectivenessColor(vm.effectiveness_score)}>
                                Score: {vm.effectiveness_score}
                              </Badge>
                              <span className="text-sm text-muted-foreground">
                                Duration: {formatDuration(vm.voicemail_duration_seconds)}
                              </span>
                            </div>
                            {vm.voicemail_audio_url && (
                              <p className="text-sm text-muted-foreground mb-3">
                                Audio: {vm.voicemail_audio_url.split('/').pop()?.substring(0, 40)}...
                              </p>
                            )}
                            <div className="grid grid-cols-4 gap-4 text-sm">
                              <div>
                                <span className="text-muted-foreground">VMs Left:</span>
                                <span className="ml-1 font-medium">{vm.total_voicemails_left}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Callbacks:</span>
                                <span className="ml-1 font-medium text-blue-600">{vm.callbacks_received}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Callback Rate:</span>
                                <span className="ml-1 font-medium">{Math.round(vm.callback_rate)}%</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Appointments:</span>
                                <span className="ml-1 font-medium text-green-600">{vm.appointments_from_callbacks}</span>
                              </div>
                            </div>
                            <div className="mt-2 flex items-center gap-4 text-sm">
                              <div className="flex items-center gap-1">
                                <Zap className="h-3 w-3 text-yellow-500" />
                                <span className="text-muted-foreground">Within 24h:</span>
                                <span className="font-medium">{vm.callbacks_within_24h}</span>
                                <span className="text-muted-foreground">({Math.round(vm.callback_rate_24h)}%)</span>
                              </div>
                            </div>
                          </div>
                          <div className="w-24">
                            <div className="text-center mb-2">
                              <span className="text-2xl font-bold">{vm.effectiveness_score}</span>
                              <span className="text-xs text-muted-foreground block">/ 100</span>
                            </div>
                            <Progress value={vm.effectiveness_score} className="h-2" />
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ScriptAnalyticsDashboard;
