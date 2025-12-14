import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RotateCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useSearchParams } from 'react-router-dom';
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
import AIWorkflowGenerator from '@/components/AIWorkflowGenerator';
import ReachabilityDashboard from '@/components/ReachabilityDashboard';
import CampaignResultsDashboard from '@/components/CampaignResultsDashboard';
import LiveCampaignMonitor from '@/components/LiveCampaignMonitor';
import WorkflowABTesting from '@/components/WorkflowABTesting';
import VoiceBroadcastManager from '@/components/VoiceBroadcastManager';
import AIErrorPanel from '@/components/AIErrorPanel';
import DashboardSidebar from '@/components/DashboardSidebar';
import QuickStartCards from '@/components/QuickStartCards';
import TodayPerformanceCard from '@/components/TodayPerformanceCard';
import { BudgetManager } from '@/components/BudgetManager';
import { OnboardingWizard } from '@/components/ai-configuration/OnboardingWizard';
import { AISetupAssistant } from '@/components/ai-configuration/AISetupAssistant';
import { CalendarIntegrationManager } from '@/components/CalendarIntegrationManager';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { supabase } from '@/integrations/supabase/client';
import { useSimpleMode } from '@/hooks/useSimpleMode';

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

// Create a global event for opening AI chat with a prompt
export const openAIChatWithPrompt = (prompt: string) => {
  window.dispatchEvent(new CustomEvent('open-ai-chat', { detail: { prompt } }));
};

const Dashboard = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'overview');
  const [numbers, setNumbers] = useState<PhoneNumber[]>([]);
  const { toast } = useToast();
  const { isSimpleMode, onModeChange } = useSimpleMode();

  // Auto-redirect to Dashboard when switching to Simple Mode if on a hidden tab
  useEffect(() => {
    const unsubscribe = onModeChange((isSimple) => {
      if (isSimple) {
        const simpleTabs = ['overview', 'broadcast', 'predictive', 'sms', 'campaign-results', 'calendar'];
        if (!simpleTabs.includes(activeTab)) {
          setActiveTab('overview');
          setSearchParams({ tab: 'overview' });
          toast({
            title: 'Switched to Simple Mode',
            description: 'Redirected to Dashboard',
          });
        }
      }
    });
    return unsubscribe;
  }, [activeTab, onModeChange, setSearchParams, toast]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  const loadNumbers = async () => {
    try {
      const { data, error } = await supabase
        .from('phone_numbers')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const formattedNumbers: PhoneNumber[] = (data || []).map(num => {
        let provider: 'twilio' | 'retell' | 'telnyx' | 'unknown' = 'unknown';
        if (num.retell_phone_id) {
          provider = 'retell';
        } else if (num.carrier_name?.toLowerCase().includes('telnyx')) {
          provider = 'telnyx';
        } else {
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

  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <TabErrorBoundary tabName="Overview">
            <div className="space-y-4 lg:space-y-6">
              {/* Today's Performance - Always visible for quick stats */}
              <TodayPerformanceCard />
              
              {/* Quick Start Cards - AI Guided Setup */}
              <QuickStartCards onOpenAIChat={openAIChatWithPrompt} />
              
              {/* System Health - Only on Overview */}
              <SystemHealthDashboard />
              
              {/* Quick Stats */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
                <Card className="bg-card/80 backdrop-blur-sm">
                  <CardHeader className="pb-2 px-4 pt-4">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Total Numbers
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 px-4 pb-4">
                    <div className="text-2xl font-bold">{numbers.length}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {numbers.filter(n => n.status === 'active').length} active
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-card/80 backdrop-blur-sm">
                  <CardHeader className="pb-2 px-4 pt-4">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Daily Calls
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 px-4 pb-4">
                    <div className="text-2xl font-bold">
                      {numbers.reduce((sum, n) => sum + n.dailyCalls, 0)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Avg: {Math.round(numbers.reduce((sum, n) => sum + n.dailyCalls, 0) / Math.max(numbers.length, 1))}
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-card/80 backdrop-blur-sm">
                  <CardHeader className="pb-2 px-4 pt-4">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Quarantined
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 px-4 pb-4">
                    <div className="text-2xl font-bold">
                      {numbers.filter(n => n.status === 'quarantined').length}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {Math.round((numbers.filter(n => n.status === 'quarantined').length / Math.max(numbers.length, 1)) * 100)}% of total
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-card/80 backdrop-blur-sm">
                  <CardHeader className="pb-2 px-4 pt-4">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Area Codes
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 px-4 pb-4">
                    <div className="text-2xl font-bold">
                      {new Set(numbers.map(n => {
                        const cleaned = n.phoneNumber?.replace(/\D/g, '') || '';
                        return cleaned.length >= 4 ? cleaned.slice(cleaned.startsWith('1') ? 1 : 0, cleaned.startsWith('1') ? 4 : 3) : '';
                      }).filter(Boolean)).size}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Geographic spread</p>
                  </CardContent>
                </Card>
              </div>

              <AgentActivityWidget />
              <PhoneNumberPurchasing />

              {/* Numbers Table */}
              <Card className="bg-card/90 backdrop-blur-sm">
                <CardHeader className="px-4 py-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Phone Numbers ({numbers.length})</CardTitle>
                    <Button onClick={refreshNumbers} variant="outline" size="sm">
                      <RotateCw className="h-4 w-4 mr-2" />
                      Refresh
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="px-4">
                  <div className="overflow-x-auto">
                    <div className="min-w-[700px]">
                      <div className="grid grid-cols-7 gap-4 text-sm font-medium text-muted-foreground pb-3 border-b">
                        <div>Phone Number</div>
                        <div>Provider</div>
                        <div>Status</div>
                        <div>Daily Calls</div>
                        <div>Spam Score</div>
                        <div>Added</div>
                        <div>Actions</div>
                      </div>
                      <div className="space-y-2 mt-3">
                        {numbers.map((number) => (
                          <div key={number.id} className="grid grid-cols-7 gap-4 items-center py-2 px-2 rounded-lg hover:bg-muted/50 transition-colors">
                            <div className="font-mono text-sm truncate">{number.phoneNumber}</div>
                            <div>
                              <Badge className={`text-xs ${
                                number.provider === 'retell' 
                                  ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' 
                                  : number.provider === 'telnyx'
                                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                                  : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                              }`}>
                                {number.provider === 'retell' ? 'Retell AI' : number.provider === 'telnyx' ? 'Telnyx' : 'Twilio'}
                              </Badge>
                            </div>
                            <div>
                              <Badge variant={number.status === 'active' ? 'default' : number.status === 'quarantined' ? 'destructive' : 'secondary'}>
                                {number.status}
                              </Badge>
                            </div>
                            <div className="text-sm">{number.dailyCalls}</div>
                            <div>
                              <Badge variant={number.spamScore > 70 ? 'destructive' : number.spamScore > 40 ? 'secondary' : 'default'}>
                                {number.spamScore}
                              </Badge>
                            </div>
                            <div className="text-xs text-muted-foreground">{number.dateAdded}</div>
                            <div className="flex gap-1">
                              <Button size="sm" variant="outline" onClick={() => handleTestCall(number.phoneNumber)} className="text-xs h-7 px-2">
                                Test
                              </Button>
                              {number.status === 'quarantined' && (
                                <Button size="sm" variant="outline" onClick={() => handleReleaseFromQuarantine(number.phoneNumber)} className="text-xs h-7 px-2 text-green-600 border-green-300 hover:bg-green-50">
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
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      No phone numbers found. Purchase some numbers to get started.
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabErrorBoundary>
        );
      case 'pipeline':
        return <TabErrorBoundary tabName="Pipeline"><PipelineKanban /></TabErrorBoundary>;
      case 'predictive':
        return <TabErrorBoundary tabName="Predictive Dialing"><PredictiveDialingDashboard /></TabErrorBoundary>;
      case 'retell':
        return <TabErrorBoundary tabName="Retell AI"><RetellAIManager /></TabErrorBoundary>;
      case 'workflows':
        return <TabErrorBoundary tabName="Workflows"><WorkflowBuilder /></TabErrorBoundary>;
      case 'lead-upload':
        return <TabErrorBoundary tabName="Lead Upload"><LeadUpload /></TabErrorBoundary>;
      case 'analytics':
        return <TabErrorBoundary tabName="Analytics"><CallAnalytics numbers={numbers} /></TabErrorBoundary>;
      case 'ai-engine':
        return <TabErrorBoundary tabName="AI Engine"><AIDecisionEngine numbers={numbers} onRefreshNumbers={refreshNumbers} /></TabErrorBoundary>;
      case 'rotation':
        return <TabErrorBoundary tabName="Rotation"><NumberRotationManager numbers={numbers} onRefreshNumbers={refreshNumbers} /></TabErrorBoundary>;
      case 'spam':
        return <TabErrorBoundary tabName="Spam Detection"><SpamDetectionManager /></TabErrorBoundary>;
      case 'sms':
        return <TabErrorBoundary tabName="SMS"><SmsMessaging /></TabErrorBoundary>;
      case 'reports':
        return <TabErrorBoundary tabName="Reports"><DailyReports /></TabErrorBoundary>;
      case 'automation':
        return <TabErrorBoundary tabName="Automation"><CampaignAutomation /></TabErrorBoundary>;
      case 'dispositions':
        return <TabErrorBoundary tabName="Dispositions"><DispositionAutomationManager /></TabErrorBoundary>;
      case 'ai-manager':
        return <TabErrorBoundary tabName="AI Manager"><AIPipelineManager /></TabErrorBoundary>;
      case 'follow-ups':
        return <TabErrorBoundary tabName="Follow-ups"><FollowUpScheduler /></TabErrorBoundary>;
      case 'agent-activity':
        return <TabErrorBoundary tabName="Agent Activity"><AgentActivityDashboard /></TabErrorBoundary>;
      case 'ai-workflows':
        return <TabErrorBoundary tabName="AI Workflows"><AIWorkflowGenerator /></TabErrorBoundary>;
      case 'reachability':
        return <TabErrorBoundary tabName="Reachability"><ReachabilityDashboard /></TabErrorBoundary>;
      case 'campaign-results':
        return <TabErrorBoundary tabName="Campaign Results"><CampaignResultsDashboard /></TabErrorBoundary>;
      case 'live-monitor':
        return <TabErrorBoundary tabName="Live Monitor"><LiveCampaignMonitor /></TabErrorBoundary>;
      case 'ab-testing':
        return <TabErrorBoundary tabName="A/B Testing"><WorkflowABTesting /></TabErrorBoundary>;
      case 'broadcast':
        return <TabErrorBoundary tabName="Voice Broadcasting"><VoiceBroadcastManager /></TabErrorBoundary>;
      case 'ai-errors':
        return <TabErrorBoundary tabName="AI Error Handler"><AIErrorPanel /></TabErrorBoundary>;
      case 'budget':
        return <TabErrorBoundary tabName="Budget Manager"><BudgetManager /></TabErrorBoundary>;
      case 'onboarding':
        return <TabErrorBoundary tabName="Setup Wizard"><OnboardingWizard onComplete={() => handleTabChange('overview')} onSkip={() => handleTabChange('overview')} /></TabErrorBoundary>;
      case 'ai-setup':
        return <TabErrorBoundary tabName="AI Setup"><AISetupAssistant /></TabErrorBoundary>;
      case 'calendar':
        return <TabErrorBoundary tabName="Calendar"><CalendarIntegrationManager /></TabErrorBoundary>;
      default:
        return <div className="text-muted-foreground">Select a section from the sidebar</div>;
    }
  };

  return (
    <SidebarProvider defaultOpen={true}>
      <div className="min-h-screen flex w-full bg-gradient-to-br from-background to-muted/30">
        <DashboardSidebar activeTab={activeTab} onTabChange={handleTabChange} />
        <SidebarInset className="flex-1">
          <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background/95 backdrop-blur px-4 lg:px-6">
            <SidebarTrigger className="lg:hidden" />
            <div className="flex-1">
              <h1 className="text-lg font-semibold">📞 Smart Dialer Dashboard</h1>
            </div>
          </header>
          <main className="flex-1 p-4 lg:p-6 overflow-x-hidden">
            <div className="max-w-full overflow-hidden">
              {renderContent()}
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};

export default Dashboard;
