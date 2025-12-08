import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Plus, Phone, AlertTriangle, TrendingUp, Users, Clock, Shield, RotateCw, Database, Zap, Brain, Settings, Link, Workflow, Target, MessageSquare, FileText, Calendar, Bot, Upload } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useSearchParams } from 'react-router-dom';
import Navigation from '@/components/Navigation';
import CallAnalytics from '@/components/CallAnalytics';
import NumberRotationManager from '@/components/NumberRotationManager';
import SpamDetectionManager from '@/components/SpamDetectionManager';
import AIDecisionEngine from '@/components/AIDecisionEngine';
import SystemHealthDashboard from '@/components/SystemHealthDashboard';
import PredictiveDialingDashboard from '@/components/PredictiveDialingDashboard';
import RetellAIManager from '@/components/RetellAIManager';
import PipelineKanban from '@/components/PipelineKanban';
import PhoneNumberPurchasing from '@/components/PhoneNumberPurchasing';
import SmsMessaging from '@/components/SmsMessaging';
import TabErrorBoundary from '@/components/TabErrorBoundary';
import DailyReports from '@/components/DailyReports';
import CampaignAutomation from '@/components/CampaignAutomation';
import DispositionAutomationManager from '@/components/DispositionAutomationManager';
import AIPipelineManager from '@/components/AIPipelineManager';
import FollowUpScheduler from '@/components/FollowUpScheduler';
import AgentActivityDashboard from '@/components/AgentActivityDashboard';
import AgentActivityWidget from '@/components/AgentActivityWidget';
import WorkflowBuilder from '@/components/WorkflowBuilder';
import LeadUpload from '@/components/LeadUpload';
import { supabase } from '@/integrations/supabase/client';

interface PhoneNumber {
  id: string;
  phoneNumber: string;
  status: 'active' | 'quarantined' | 'inactive';
  dailyCalls: number;
  spamScore: number;
  dateAdded: string;
  provider: 'twilio' | 'retell' | 'telnyx' | 'unknown';
  retellPhoneId?: string;
}

interface SystemHealth {
  apiStatus: 'online' | 'offline';
  databaseStatus: 'online' | 'offline';
  lastBackup: string;
}

const Dashboard = () => {
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get('tab') || 'overview';
  
  const [numbers, setNumbers] = useState<PhoneNumber[]>([]);
  const [areaCode, setAreaCode] = useState('');
  const [quantity, setQuantity] = useState('10');
  const [autoImport, setAutoImport] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const loadNumbers = async () => {
    try {
      const { data, error } = await supabase
        .from('phone_numbers')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const formattedNumbers: PhoneNumber[] = (data || []).map(num => {
        // Determine provider based on retell_phone_id or other indicators
        let provider: 'twilio' | 'retell' | 'telnyx' | 'unknown' = 'unknown';
        if (num.retell_phone_id) {
          provider = 'retell';
        } else if (num.carrier_name?.toLowerCase().includes('telnyx')) {
          provider = 'telnyx';
        } else {
          // Default to Twilio for imported numbers without retell_phone_id
          provider = 'twilio';
        }
        
        return {
          id: num.id,
          phoneNumber: num.number,
          status: num.status as 'active' | 'quarantined' | 'inactive',
          dailyCalls: num.daily_calls,
          spamScore: num.is_spam ? 100 : 0,
          dateAdded: new Date(num.created_at).toISOString().split('T')[0],
          provider,
          retellPhoneId: num.retell_phone_id || undefined,
        };
      });

      setNumbers(formattedNumbers);
    } catch (error) {
      console.error('Error loading numbers:', error);
      toast({
        title: 'Error Loading Numbers',
        description: 'Failed to load phone numbers from database',
        variant: 'destructive'
      });
    }
  };

  useEffect(() => {
    loadNumbers();
  }, []);

  const handleBuyNumbers = async () => {
    setIsLoading(true);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setIsLoading(false);
    toast({
      title: 'Numbers Purchased!',
      description: `Successfully purchased ${quantity} numbers with area code ${areaCode}.`,
    });
  };

  const handleTestCall = (phoneNumber: string) => {
    toast({
      title: 'Test Call Initiated',
      description: `Calling ${phoneNumber}...`,
    });
  };

  const handleReleaseFromQuarantine = (phoneNumber: string) => {
    setNumbers(numbers.map(n => n.phoneNumber === phoneNumber ? { ...n, status: 'active' } : n));
    toast({
      title: 'Number Released',
      description: `${phoneNumber} has been released from quarantine.`,
    });
  };

  const refreshNumbers = async () => {
    await loadNumbers();
    toast({
      title: 'Numbers Refreshed',
      description: 'Phone numbers have been refreshed.',
    });
  };

  return (
    <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="container mx-auto px-2 sm:px-4 lg:px-6 py-3 sm:py-4 lg:py-6 space-y-3 sm:space-y-4 lg:space-y-6 max-w-7xl">
        {/* Header */}
        <div className="flex flex-col space-y-1 sm:space-y-2">
          <h1 className="text-xl sm:text-2xl lg:text-3xl xl:text-4xl font-bold text-slate-900 dark:text-slate-100">
            📞 Smart Dialer Dashboard
          </h1>
          <p className="text-xs sm:text-sm lg:text-base text-slate-600 dark:text-slate-400">
            Manage your phone numbers and calling campaigns
          </p>
        </div>

        <Tabs defaultValue={defaultTab} className="w-full">
          <div className="w-full overflow-x-auto pb-2">
          <TabsList className="inline-flex h-auto bg-slate-100 dark:bg-slate-800 min-w-max w-full sm:w-auto flex-wrap">
              {/* Overview */}
              <TabsTrigger value="overview" className="text-xs sm:text-sm px-2 sm:px-3 py-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 whitespace-nowrap">
                Overview
              </TabsTrigger>
              {/* Phone & Messaging */}
              <TabsTrigger value="predictive" className="text-xs sm:text-sm px-2 sm:px-3 py-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 whitespace-nowrap">
                <Target className="h-4 w-4 mr-1" />
                Dialing
              </TabsTrigger>
              <TabsTrigger value="analytics" className="text-xs sm:text-sm px-2 sm:px-3 py-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 whitespace-nowrap">
                Analytics
              </TabsTrigger>
              <TabsTrigger value="rotation" className="text-xs sm:text-sm px-2 sm:px-3 py-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 whitespace-nowrap">
                Rotation
              </TabsTrigger>
              <TabsTrigger value="spam" className="text-xs sm:text-sm px-2 sm:px-3 py-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 whitespace-nowrap">
                Spam
              </TabsTrigger>
              <TabsTrigger value="sms" className="text-xs sm:text-sm px-2 sm:px-3 py-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 whitespace-nowrap">
                <MessageSquare className="h-4 w-4 mr-1" />
                SMS
              </TabsTrigger>
              {/* Leads & Pipeline */}
              <TabsTrigger value="pipeline" className="text-xs sm:text-sm px-2 sm:px-3 py-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 whitespace-nowrap">
                <Workflow className="h-4 w-4 mr-1" />
                Pipeline
              </TabsTrigger>
              <TabsTrigger value="lead-upload" className="text-xs sm:text-sm px-2 sm:px-3 py-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 whitespace-nowrap">
                <Upload className="h-4 w-4 mr-1" />
                Lead Upload
              </TabsTrigger>
              <TabsTrigger value="dispositions" className="text-xs sm:text-sm px-2 sm:px-3 py-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 whitespace-nowrap">
                <Zap className="h-4 w-4 mr-1" />
                Dispositions
              </TabsTrigger>
              <TabsTrigger value="follow-ups" className="text-xs sm:text-sm px-2 sm:px-3 py-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 whitespace-nowrap">
                <Clock className="h-4 w-4 mr-1" />
                Follow-ups
              </TabsTrigger>
              {/* AI & Automation */}
              <TabsTrigger value="retell" className="text-xs sm:text-sm px-2 sm:px-3 py-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 whitespace-nowrap">
                <Settings className="h-4 w-4 mr-1" />
                Retell AI
              </TabsTrigger>
              <TabsTrigger value="workflows" className="text-xs sm:text-sm px-2 sm:px-3 py-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 whitespace-nowrap">
                <Zap className="h-4 w-4 mr-1" />
                Workflows
              </TabsTrigger>
              <TabsTrigger value="ai-engine" className="text-xs sm:text-sm px-2 sm:px-3 py-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 whitespace-nowrap">
                AI Engine
              </TabsTrigger>
              <TabsTrigger value="automation" className="text-xs sm:text-sm px-2 sm:px-3 py-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 whitespace-nowrap">
                <Calendar className="h-4 w-4 mr-1" />
                Automation
              </TabsTrigger>
              <TabsTrigger value="ai-manager" className="text-xs sm:text-sm px-2 sm:px-3 py-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 whitespace-nowrap">
                <Brain className="h-4 w-4 mr-1" />
                AI Manager
              </TabsTrigger>
              <TabsTrigger value="agent-activity" className="text-xs sm:text-sm px-2 sm:px-3 py-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 whitespace-nowrap">
                <Bot className="h-4 w-4 mr-1" />
                Agent Activity
              </TabsTrigger>
              {/* Reports */}
              <TabsTrigger value="reports" className="text-xs sm:text-sm px-2 sm:px-3 py-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 whitespace-nowrap">
                <FileText className="h-4 w-4 mr-1" />
                Reports
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview" className="space-y-3 sm:space-y-4 lg:space-y-6">
            <TabErrorBoundary tabName="Overview">
              {/* Quick Stats */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 lg:gap-4">
                <Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border-slate-200 dark:border-slate-700">
                  <CardHeader className="pb-1 sm:pb-2 px-2 sm:px-4 pt-2 sm:pt-4">
                    <CardTitle className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400">
                      Total Numbers
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 px-2 sm:px-4 pb-2 sm:pb-4">
                    <div className="text-lg sm:text-xl lg:text-2xl font-bold text-slate-900 dark:text-slate-100">
                      {numbers.length}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {numbers.filter(n => n.status === 'active').length} active
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border-slate-200 dark:border-slate-700">
                  <CardHeader className="pb-1 sm:pb-2 px-2 sm:px-4 pt-2 sm:pt-4">
                    <CardTitle className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400">
                      Daily Calls
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 px-2 sm:px-4 pb-2 sm:pb-4">
                    <div className="text-lg sm:text-xl lg:text-2xl font-bold text-slate-900 dark:text-slate-100">
                      {numbers.reduce((sum, n) => sum + n.dailyCalls, 0)}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Avg: {Math.round(numbers.reduce((sum, n) => sum + n.dailyCalls, 0) / Math.max(numbers.length, 1))}
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border-slate-200 dark:border-slate-700">
                  <CardHeader className="pb-1 sm:pb-2 px-2 sm:px-4 pt-2 sm:pt-4">
                    <CardTitle className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400">
                      Quarantined
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 px-2 sm:px-4 pb-2 sm:pb-4">
                    <div className="text-lg sm:text-xl lg:text-2xl font-bold text-slate-900 dark:text-slate-100">
                      {numbers.filter(n => n.status === 'quarantined').length}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {Math.round((numbers.filter(n => n.status === 'quarantined').length / Math.max(numbers.length, 1)) * 100)}% of total
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border-slate-200 dark:border-slate-700">
                  <CardHeader className="pb-1 sm:pb-2 px-2 sm:px-4 pt-2 sm:pt-4">
                    <CardTitle className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400">
                      Area Codes
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 px-2 sm:px-4 pb-2 sm:pb-4">
                    <div className="text-lg sm:text-xl lg:text-2xl font-bold text-slate-900 dark:text-slate-100">
                      {new Set(numbers.map(n => {
                        const cleaned = n.phoneNumber?.replace(/\D/g, '') || '';
                        return cleaned.length >= 4 ? cleaned.slice(cleaned.startsWith('1') ? 1 : 0, cleaned.startsWith('1') ? 4 : 3) : '';
                      }).filter(Boolean)).size}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Geographic spread
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* AI Activity Widget on Overview */}
              <AgentActivityWidget />

              {/* Number Management Component */}
              <PhoneNumberPurchasing />

              {/* Numbers Table */}
              <Card className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border-slate-200 dark:border-slate-700">
                <CardHeader className="px-3 sm:px-6 py-3 sm:py-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0">
                    <CardTitle className="text-slate-900 dark:text-slate-100 text-sm sm:text-base lg:text-lg">
                      Phone Numbers ({numbers.length})
                    </CardTitle>
                    <Button 
                      onClick={refreshNumbers}
                      variant="outline"
                      size="sm"
                      className="border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs sm:text-sm h-7 sm:h-8"
                    >
                      <RotateCw className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                      Refresh
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="px-3 sm:px-6">
                  <div className="overflow-x-auto">
                    <div className="min-w-[700px]">
                      <div className="grid grid-cols-7 gap-2 sm:gap-3 lg:gap-4 text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400 pb-2 sm:pb-3 border-b border-slate-200 dark:border-slate-700">
                        <div>Phone Number</div>
                        <div>Provider</div>
                        <div>Status</div>
                        <div>Daily Calls</div>
                        <div>Spam Score</div>
                        <div>Added</div>
                        <div>Actions</div>
                      </div>
                      <div className="space-y-1 sm:space-y-2 mt-2 sm:mt-3">
                        {numbers.map((number) => (
                          <div key={number.id} className="grid grid-cols-7 gap-2 sm:gap-3 lg:gap-4 items-center py-1.5 sm:py-2 px-1 sm:px-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                            <div className="font-mono text-xs sm:text-sm text-slate-900 dark:text-slate-100 truncate">
                              {number.phoneNumber}
                            </div>
                            <div>
                              <Badge 
                                className={`text-xs px-1.5 py-0.5 font-medium ${
                                  number.provider === 'retell' 
                                    ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' 
                                    : number.provider === 'telnyx'
                                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                                    : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                                }`}
                              >
                                {number.provider === 'retell' ? 'Retell AI' : 
                                 number.provider === 'telnyx' ? 'Telnyx' : 'Twilio'}
                              </Badge>
                            </div>
                            <div>
                              <Badge 
                                variant={number.status === 'active' ? 'default' : 
                                       number.status === 'quarantined' ? 'destructive' : 'secondary'}
                                className="text-xs px-1 py-0.5"
                              >
                                {number.status}
                              </Badge>
                            </div>
                            <div className="text-xs sm:text-sm text-slate-700 dark:text-slate-300">
                              {number.dailyCalls}
                            </div>
                            <div>
                              <Badge 
                                variant={number.spamScore > 70 ? 'destructive' : 
                                       number.spamScore > 40 ? 'secondary' : 'default'}
                                className="text-xs px-1 py-0.5"
                              >
                                {number.spamScore}
                              </Badge>
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                              {number.dateAdded}
                            </div>
                            <div className="flex flex-col sm:flex-row gap-1">
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => handleTestCall(number.phoneNumber)}
                                className="text-xs border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 h-6 sm:h-7 px-1 sm:px-2"
                              >
                                Test
                              </Button>
                              {number.status === 'quarantined' && (
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  onClick={() => handleReleaseFromQuarantine(number.phoneNumber)}
                                  className="text-xs border-green-300 dark:border-green-600 text-green-700 dark:text-green-300 hover:bg-green-50 dark:hover:bg-green-900/20 h-6 sm:h-7 px-1 sm:px-2"
                                >
                                  Release
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  {numbers.length === 0 && (
                    <div className="text-center py-6 sm:py-8 text-slate-500 dark:text-slate-400 text-xs sm:text-sm">
                      No phone numbers found. Purchase some numbers to get started.
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabErrorBoundary>
          </TabsContent>

          <TabsContent value="pipeline" className="space-y-6">
            <TabErrorBoundary tabName="Pipeline">
              <PipelineKanban />
            </TabErrorBoundary>
          </TabsContent>

          <TabsContent value="predictive">
            <TabErrorBoundary tabName="Predictive Dialing">
              <PredictiveDialingDashboard />
            </TabErrorBoundary>
          </TabsContent>

          <TabsContent value="retell">
            <TabErrorBoundary tabName="Retell AI">
              <RetellAIManager />
            </TabErrorBoundary>
          </TabsContent>

          <TabsContent value="workflows">
            <TabErrorBoundary tabName="Workflows">
              <WorkflowBuilder />
            </TabErrorBoundary>
          </TabsContent>

          <TabsContent value="lead-upload">
            <TabErrorBoundary tabName="Lead Upload">
              <LeadUpload />
            </TabErrorBoundary>
          </TabsContent>


          <TabsContent value="analytics">
            <TabErrorBoundary tabName="Analytics">
              <CallAnalytics numbers={numbers} />
            </TabErrorBoundary>
          </TabsContent>

          <TabsContent value="ai-engine">
            <TabErrorBoundary tabName="AI Engine">
              <AIDecisionEngine numbers={numbers} onRefreshNumbers={refreshNumbers} />
            </TabErrorBoundary>
          </TabsContent>


          <TabsContent value="rotation">
            <TabErrorBoundary tabName="Rotation">
              <NumberRotationManager numbers={numbers} onRefreshNumbers={refreshNumbers} />
            </TabErrorBoundary>
          </TabsContent>

          <TabsContent value="spam">
            <TabErrorBoundary tabName="Spam Detection">
              <SpamDetectionManager />
            </TabErrorBoundary>
          </TabsContent>

          <TabsContent value="sms">
            <TabErrorBoundary tabName="SMS">
              <SmsMessaging />
            </TabErrorBoundary>
          </TabsContent>

          <TabsContent value="reports">
            <TabErrorBoundary tabName="Reports">
              <DailyReports />
            </TabErrorBoundary>
          </TabsContent>

          <TabsContent value="automation">
            <TabErrorBoundary tabName="Automation">
              <CampaignAutomation />
            </TabErrorBoundary>
          </TabsContent>

          <TabsContent value="dispositions">
            <TabErrorBoundary tabName="Dispositions">
              <DispositionAutomationManager />
            </TabErrorBoundary>
          </TabsContent>

          <TabsContent value="ai-manager">
            <TabErrorBoundary tabName="AI Manager">
              <AIPipelineManager />
            </TabErrorBoundary>
          </TabsContent>

          <TabsContent value="follow-ups">
            <TabErrorBoundary tabName="Follow-ups">
              <FollowUpScheduler />
            </TabErrorBoundary>
          </TabsContent>

          <TabsContent value="agent-activity">
            <TabErrorBoundary tabName="Agent Activity">
              <AgentActivityDashboard />
            </TabErrorBoundary>
          </TabsContent>
        </Tabs>

        {/* System Health */}
        <SystemHealthDashboard />
      </div>
    </div>
  );
};

export default Dashboard;