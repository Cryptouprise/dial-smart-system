
import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import { CalendarDays, Phone, Target, TrendingUp } from 'lucide-react';
import { usePredictiveDialing } from '@/hooks/usePredictiveDialing';

const DialingAnalytics = () => {
  const { getCallLogs, getCampaigns, isLoading } = usePredictiveDialing();
  const [callLogs, setCallLogs] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState({
    totalCalls: 0,
    answeredCalls: 0,
    connectRate: 0,
    avgDuration: 0,
    conversions: 0,
    conversionRate: 0
  });

  const loadAnalyticsData = useCallback(async () => {
    const [callLogsData, campaignsData] = await Promise.all([
      getCallLogs(),
      getCampaigns()
    ]);

    if (callLogsData) {
      setCallLogs(callLogsData);
      calculateAnalytics(callLogsData);
    }
    
    if (campaignsData) setCampaigns(campaignsData);
  }, [getCallLogs, getCampaigns]);

  useEffect(() => {
    loadAnalyticsData();
  }, [loadAnalyticsData]);

  const calculateAnalytics = (logs: any[]) => {
    const totalCalls = logs.length;
    const answeredCalls = logs.filter(log => 
      log.status === 'answered' || log.status === 'completed'
    ).length;
    const connectRate = totalCalls > 0 ? Math.round((answeredCalls / totalCalls) * 100) : 0;
    
    const completedCalls = logs.filter(log => log.status === 'completed');
    const avgDuration = completedCalls.length > 0 
      ? Math.round(completedCalls.reduce((sum, log) => sum + log.duration_seconds, 0) / completedCalls.length)
      : 0;

    const conversions = logs.filter(log => log.outcome === 'converted').length;
    const conversionRate = answeredCalls > 0 ? Math.round((conversions / answeredCalls) * 100) : 0;

    setAnalytics({
      totalCalls,
      answeredCalls,
      connectRate,
      avgDuration,
      conversions,
      conversionRate
    });
  };

  const getCallsByDate = () => {
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - i);
      return date.toISOString().split('T')[0];
    }).reverse();

    return last7Days.map(date => ({
      date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      calls: callLogs.filter(log => log.created_at.startsWith(date)).length,
      answered: callLogs.filter(log => 
        log.created_at.startsWith(date) && 
        (log.status === 'answered' || log.status === 'completed')
      ).length
    }));
  };

  const getOutcomeDistribution = () => {
    const outcomes = ['interested', 'not_interested', 'callback', 'converted', 'do_not_call'];
    const colors = ['#10b981', '#ef4444', '#f59e0b', '#8b5cf6', '#6b7280'];
    
    return outcomes.map((outcome, index) => ({
      name: outcome.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
      value: callLogs.filter(log => log.outcome === outcome).length,
      color: colors[index]
    })).filter(item => item.value > 0);
  };

  const callsByDateData = getCallsByDate();
  const outcomeData = getOutcomeDistribution();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Dialing Analytics
        </h2>
        <p className="text-slate-600 dark:text-slate-400">
          Track performance metrics and call outcomes
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400 flex items-center gap-2">
              <Phone className="h-4 w-4" />
              Total Calls
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {analytics.totalCalls}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {analytics.answeredCalls} answered
            </p>
          </CardContent>
        </Card>

        <Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400 flex items-center gap-2">
              <Target className="h-4 w-4" />
              Connect Rate
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {analytics.connectRate}%
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Answer rate
            </p>
          </CardContent>
        </Card>

        <Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400 flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              Avg Duration
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {Math.floor(analytics.avgDuration / 60)}:{(analytics.avgDuration % 60).toString().padStart(2, '0')}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Minutes
            </p>
          </CardContent>
        </Card>

        <Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Conversion Rate
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {analytics.conversionRate}%
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {analytics.conversions} conversions
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Calls Over Time */}
        <Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Calls Over Time</CardTitle>
            <CardDescription>Daily call volume and answer rates</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={callsByDateData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="calls" fill="#3b82f6" name="Total Calls" />
                <Bar dataKey="answered" fill="#10b981" name="Answered" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Call Outcomes */}
        <Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Call Outcomes</CardTitle>
            <CardDescription>Distribution of call results</CardDescription>
          </CardHeader>
          <CardContent>
            {outcomeData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={outcomeData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {outcomeData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-slate-500 dark:text-slate-400">
                No outcome data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Campaign Performance */}
      <Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm">
        <CardHeader>
          <CardTitle>Campaign Performance</CardTitle>
          <CardDescription>Metrics by campaign</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="text-left py-2">Campaign</th>
                  <th className="text-right py-2">Calls</th>
                  <th className="text-right py-2">Connect Rate</th>
                  <th className="text-right py-2">Conversions</th>
                  <th className="text-right py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((campaign) => {
                  const campaignCalls = callLogs.filter(log => log.campaign_id === campaign.id);
                  const answered = campaignCalls.filter(log => 
                    log.status === 'answered' || log.status === 'completed'
                  ).length;
                  const conversions = campaignCalls.filter(log => log.outcome === 'converted').length;
                  const connectRate = campaignCalls.length > 0 
                    ? Math.round((answered / campaignCalls.length) * 100) 
                    : 0;

                  return (
                    <tr key={campaign.id} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="py-2">{campaign.name}</td>
                      <td className="text-right py-2">{campaignCalls.length}</td>
                      <td className="text-right py-2">{connectRate}%</td>
                      <td className="text-right py-2">{conversions}</td>
                      <td className="text-right py-2">
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          campaign.status === 'active' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {campaign.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            
            {campaigns.length === 0 && (
              <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                No campaigns found
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DialingAnalytics;
