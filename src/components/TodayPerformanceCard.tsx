import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Phone, PhoneIncoming, Calendar, MessageSquare, TrendingUp, TrendingDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface TodayStats {
  totalCalls: number;
  connectedCalls: number;
  answerRate: number;
  appointments: number;
  smsSent: number;
  smsReceived: number;
  avgCallDuration: number;
}

const TodayPerformanceCard: React.FC = () => {
  const [stats, setStats] = useState<TodayStats>({
    totalCalls: 0,
    connectedCalls: 0,
    answerRate: 0,
    appointments: 0,
    smsSent: 0,
    smsReceived: 0,
    avgCallDuration: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadTodayStats = async () => {
      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayISO = today.toISOString();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Fetch today's call logs
        const { data: callLogs } = await supabase
          .from('call_logs')
          .select('status, duration_seconds, outcome')
          .eq('user_id', user.id)
          .gte('created_at', todayISO);

        // Fetch today's SMS
        const { data: smsLogs } = await supabase
          .from('sms_messages')
          .select('direction')
          .eq('user_id', user.id)
          .gte('created_at', todayISO);

        // Fetch today's appointments
        const { data: appointments } = await supabase
          .from('calendar_appointments')
          .select('id')
          .eq('user_id', user.id)
          .gte('created_at', todayISO);

        const calls = callLogs || [];
        const sms = smsLogs || [];
        const appts = appointments || [];

        const totalCalls = calls.length;
        const connectedCalls = calls.filter(c => 
          c.status === 'completed' || c.outcome === 'answered'
        ).length;
        const answerRate = totalCalls > 0 ? Math.round((connectedCalls / totalCalls) * 100) : 0;
        const avgDuration = calls.length > 0 
          ? Math.round(calls.reduce((sum, c) => sum + (c.duration_seconds || 0), 0) / calls.length)
          : 0;

        setStats({
          totalCalls,
          connectedCalls,
          answerRate,
          appointments: appts.length,
          smsSent: sms.filter(s => s.direction === 'outbound').length,
          smsReceived: sms.filter(s => s.direction === 'inbound').length,
          avgCallDuration: avgDuration,
        });
      } catch (error) {
        console.error('Error loading today stats:', error);
      } finally {
        setLoading(false);
      }
    };

    loadTodayStats();
  }, []);

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  if (loading) {
    return (
      <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Today's Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            <div className="h-8 bg-muted rounded w-1/3"></div>
            <div className="grid grid-cols-4 gap-4">
              {[1,2,3,4].map(i => (
                <div key={i} className="h-16 bg-muted rounded"></div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Today's Performance
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            Live
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Calls Made */}
          <div className="bg-background/60 rounded-lg p-3 space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Phone className="h-4 w-4" />
              <span className="text-xs font-medium">Calls</span>
            </div>
            <div className="text-2xl font-bold">{stats.totalCalls}</div>
            <p className="text-xs text-muted-foreground">
              {stats.connectedCalls} connected
            </p>
          </div>

          {/* Answer Rate */}
          <div className="bg-background/60 rounded-lg p-3 space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground">
              <PhoneIncoming className="h-4 w-4" />
              <span className="text-xs font-medium">Answer Rate</span>
            </div>
            <div className="text-2xl font-bold flex items-center gap-1">
              {stats.answerRate}%
              {stats.answerRate >= 30 ? (
                <TrendingUp className="h-4 w-4 text-green-500" />
              ) : stats.answerRate > 0 ? (
                <TrendingDown className="h-4 w-4 text-amber-500" />
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              Avg: {formatDuration(stats.avgCallDuration)}
            </p>
          </div>

          {/* Appointments */}
          <div className="bg-background/60 rounded-lg p-3 space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span className="text-xs font-medium">Appointments</span>
            </div>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {stats.appointments}
            </div>
            <p className="text-xs text-muted-foreground">
              Booked today
            </p>
          </div>

          {/* SMS Activity */}
          <div className="bg-background/60 rounded-lg p-3 space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground">
              <MessageSquare className="h-4 w-4" />
              <span className="text-xs font-medium">SMS</span>
            </div>
            <div className="text-2xl font-bold">{stats.smsSent + stats.smsReceived}</div>
            <p className="text-xs text-muted-foreground">
              {stats.smsSent} sent · {stats.smsReceived} received
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default TodayPerformanceCard;
