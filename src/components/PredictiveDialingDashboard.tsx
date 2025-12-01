
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Phone, Users, Target, BarChart3, PlayCircle, PauseCircle, Brain, Settings, Activity } from 'lucide-react';
import { usePredictiveDialing } from '@/hooks/usePredictiveDialing';
import LeadManager from '@/components/LeadManager';
import CampaignManager from '@/components/CampaignManager';
import CallCenter from '@/components/CallCenter';
import DialingAnalytics from '@/components/DialingAnalytics';
import ConcurrencyMonitor from '@/components/ConcurrencyMonitor';
import PredictiveDialingEngine from '@/components/PredictiveDialingEngine';
import AdvancedDialerSettings from '@/components/AdvancedDialerSettings';
import DialingPerformanceDashboard from '@/components/DialingPerformanceDashboard';

const PredictiveDialingDashboard = () => {
  const { getCampaigns, getCallLogs, isLoading } = usePredictiveDialing();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [callLogs, setCallLogs] = useState<any[]>([]);
  const [stats, setStats] = useState({
    totalLeads: 0,
    activeCampaigns: 0,
    todayCalls: 0,
    connectRate: 0
  });

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    const campaignsData = await getCampaigns();
    const callLogsData = await getCallLogs();

    if (campaignsData) setCampaigns(campaignsData);
    if (callLogsData) {
      setCallLogs(callLogsData);
      
      // Calculate stats
      const today = new Date().toISOString().split('T')[0];
      const todayCalls = callLogsData.filter(call => 
        call.created_at.startsWith(today)
      );
      const answeredCalls = todayCalls.filter(call => 
        call.status === 'answered' || call.status === 'completed'
      );

      setStats({
        totalLeads: 0, // Will be updated when leads are loaded
        activeCampaigns: campaignsData?.filter(c => c.status === 'active').length || 0,
        todayCalls: todayCalls.length,
        connectRate: todayCalls.length > 0 ? Math.round((answeredCalls.length / todayCalls.length) * 100) : 0
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col space-y-2">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
          🎯 Predictive Dialing Center
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          Manage leads, campaigns, and outbound calling operations
        </p>
      </div>

      {/* Concurrency Monitor */}
      <ConcurrencyMonitor />

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400 flex items-center gap-2">
              <Users className="h-4 w-4" />
              Total Leads
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {stats.totalLeads.toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400 flex items-center gap-2">
              <Target className="h-4 w-4" />
              Active Campaigns
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {stats.activeCampaigns}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400 flex items-center gap-2">
              <Phone className="h-4 w-4" />
              Today's Calls
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {stats.todayCalls}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400 flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Connect Rate
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {stats.connectRate}%
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="call-center" className="space-y-6">
        <div className="w-full overflow-x-auto pb-2">
          <TabsList className="inline-flex h-auto bg-slate-100 dark:bg-slate-800 min-w-max w-full sm:w-auto">
            <TabsTrigger value="call-center" className="text-xs sm:text-sm px-2 sm:px-3 py-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 whitespace-nowrap">
              <PlayCircle className="h-4 w-4 mr-2" />
              Call Center
            </TabsTrigger>
            <TabsTrigger value="performance" className="text-xs sm:text-sm px-2 sm:px-3 py-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 whitespace-nowrap">
              <Activity className="h-4 w-4 mr-2" />
              Performance
            </TabsTrigger>
            <TabsTrigger value="ai-engine" className="text-xs sm:text-sm px-2 sm:px-3 py-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 whitespace-nowrap">
              <Brain className="h-4 w-4 mr-2" />
              AI Engine
            </TabsTrigger>
            <TabsTrigger value="advanced-settings" className="text-xs sm:text-sm px-2 sm:px-3 py-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 whitespace-nowrap">
              <Settings className="h-4 w-4 mr-2" />
              Advanced
            </TabsTrigger>
            <TabsTrigger value="campaigns" className="text-xs sm:text-sm px-2 sm:px-3 py-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 whitespace-nowrap">
              <Target className="h-4 w-4 mr-2" />
              Campaigns
            </TabsTrigger>
            <TabsTrigger value="leads" className="text-xs sm:text-sm px-2 sm:px-3 py-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 whitespace-nowrap">
              <Users className="h-4 w-4 mr-2" />
              Leads
            </TabsTrigger>
            <TabsTrigger value="analytics" className="text-xs sm:text-sm px-2 sm:px-3 py-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 whitespace-nowrap">
              <BarChart3 className="h-4 w-4 mr-2" />
              Analytics
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="call-center">
          <CallCenter onStatsUpdate={setStats} />
        </TabsContent>

        <TabsContent value="performance">
          <DialingPerformanceDashboard />
        </TabsContent>

        <TabsContent value="ai-engine">
          <PredictiveDialingEngine />
        </TabsContent>

        <TabsContent value="advanced-settings">
          <AdvancedDialerSettings />
        </TabsContent>

        <TabsContent value="campaigns">
          <CampaignManager onRefresh={loadDashboardData} />
        </TabsContent>

        <TabsContent value="leads">
          <LeadManager onStatsUpdate={(count) => setStats(prev => ({ ...prev, totalLeads: count }))} />
        </TabsContent>

        <TabsContent value="analytics">
          <DialingAnalytics />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PredictiveDialingDashboard;
