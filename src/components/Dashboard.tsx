import React, { useState, useEffect, lazy, Suspense } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RotateCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useSearchParams } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';

// Eagerly loaded - needed for Overview tab (most common entry point)
import TabErrorBoundary from '@/components/TabErrorBoundary';
import DashboardSidebar from '@/components/DashboardSidebar';
import QuickStartCards from '@/components/QuickStartCards';
import TodayPerformanceCard from '@/components/TodayPerformanceCard';
import QuickLaunchButton from '@/components/QuickLaunchButton';
import SystemHealthIndicator from '@/components/SystemHealthIndicator';
import SystemHealthDashboard from '@/components/SystemHealthDashboard';
import PhoneNumberPurchasing from '@/components/PhoneNumberPurchasing';
import AgentActivityWidget from '@/components/AgentActivityWidget';
import PendingCallbacksWidget from '@/components/PendingCallbacksWidget';
import GuardianStatusWidget from '@/components/GuardianStatusWidget';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { supabase } from '@/integrations/supabase/client';
import { useSimpleMode } from '@/hooks/useSimpleMode';
import { useDemoMode } from '@/contexts/DemoModeContext';
import { DEMO_PHONE_NUMBERS } from '@/data/demo/demoPhoneNumbers';
import { AnimatedCounter } from '@/components/ui/animated-counter';

// Lazy-loaded tab components - only loaded when user navigates to them
const CallAnalytics = lazy(() => import('@/components/CallAnalytics'));
const NumberRotationManager = lazy(() => import('@/components/NumberRotationManager'));
const SpamDetectionManager = lazy(() => import('@/components/SpamDetectionManager'));
const AIDecisionEngine = lazy(() => import('@/components/AIDecisionEngine'));
const PredictiveDialingDashboard = lazy(() => import('@/components/PredictiveDialingDashboard'));
const RetellAIManager = lazy(() => import('@/components/RetellAIManager'));
const PipelineKanban = lazy(() => import('@/components/PipelineKanban'));
const SmsMessaging = lazy(() => import('@/components/SmsMessaging'));
const DailyReports = lazy(() => import('@/components/DailyReports'));
const CampaignAutomation = lazy(() => import('@/components/CampaignAutomation'));
const DispositionAutomationManager = lazy(() => import('@/components/DispositionAutomationManager'));
const AIPipelineManager = lazy(() => import('@/components/AIPipelineManager'));
const FollowUpScheduler = lazy(() => import('@/components/FollowUpScheduler'));
const AgentActivityDashboard = lazy(() => import('@/components/AgentActivityDashboard'));
const WorkflowBuilder = lazy(() => import('@/components/WorkflowBuilder'));
const LeadUpload = lazy(() => import('@/components/LeadUpload'));
const EnhancedLeadManager = lazy(() => import('@/components/EnhancedLeadManager'));
const AIWorkflowGenerator = lazy(() => import('@/components/AIWorkflowGenerator'));
const ReachabilityDashboard = lazy(() => import('@/components/ReachabilityDashboard'));
const CampaignResultsDashboard = lazy(() => import('@/components/CampaignResultsDashboard'));
const LiveCampaignMonitor = lazy(() => import('@/components/LiveCampaignMonitor'));
const WorkflowABTesting = lazy(() => import('@/components/WorkflowABTesting'));
const VoiceBroadcastManager = lazy(() => import('@/components/VoiceBroadcastManager'));
const AIErrorPanel = lazy(() => import('@/components/AIErrorPanel'));
const BudgetManager = lazy(() => import('@/components/BudgetManager').then(m => ({ default: m.BudgetManager })));
const OnboardingWizard = lazy(() => import('@/components/ai-configuration/OnboardingWizard').then(m => ({ default: m.OnboardingWizard })));
const AISetupAssistant = lazy(() => import('@/components/ai-configuration/AISetupAssistant').then(m => ({ default: m.AISetupAssistant })));
const CalendarIntegrationManager = lazy(() => import('@/components/CalendarIntegrationManager').then(m => ({ default: m.CalendarIntegrationManager })));
const AutonomousAgentDashboard = lazy(() => import('@/components/AutonomousAgentDashboard'));

// Loading component for lazy-loaded tabs
const TabLoader = () => (
  <div className="space-y-4 p-4">
    <Skeleton className="h-8 w-1/3" />
    <Skeleton className="h-4 w-1/2" />
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
      <Skeleton className="h-32" />
      <Skeleton className="h-32" />
    </div>
    <Skeleton className="h-64 mt-4" />
  </div>
);

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
  const { isDemoMode } = useDemoMode();

  // Auto-redirect to Dashboard when switching to Simple Mode if on a hidden tab
  useEffect(() => {
    const unsubscribe = onModeChange((isSimple) => {
      if (isSimple) {
        const simpleTabs = ['overview', 'broadcast', 'predictive', 'sms', 'campaign-results', 'calendar', 'leads'];
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
    // Use demo data if in demo mode
    if (isDemoMode) {
      const demoNumbers: PhoneNumber[] = DEMO_PHONE_NUMBERS.map(num => ({
        id: num.id,
        phoneNumber: num.number,
        status: num.status as 'active' | 'quarantined' | 'inactive',
        dailyCalls: num.daily_calls,
        spamScore: num.is_spam ? 100 : 0,
        dateAdded: new Date().toISOString().split('T')[0],
        provider: num.provider as 'twilio' | 'retell' | 'telnyx' | 'unknown',
      }));
      setNumbers(demoNumbers);
      return;
    }

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
  }, [isDemoMode]);

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
              {/* System Health Indicator - Always visible at top */}
              <SystemHealthIndicator compact />
              
              {/* Today's Performance - Always visible for quick stats */}
              <TodayPerformanceCard />
              
              {/* Quick Launch - One-Click Campaign Start */}
              <QuickLaunchButton />
              
              {/* Quick Start Cards - AI Guided Setup */}
              <QuickStartCards onOpenAIChat={openAIChatWithPrompt} />
              
              {/* Pending Callbacks - Prominent alerts for overdue callbacks */}
              <PendingCallbacksWidget />
              
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
                    <div className="text-2xl font-bold">
                      <AnimatedCounter value={numbers.length} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      <AnimatedCounter value={numbers.filter(n => n.status === 'active').length} /> active
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
                      <AnimatedCounter value={numbers.reduce((sum, n) => sum + n.dailyCalls, 0)} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Avg: <AnimatedCounter value={Math.round(numbers.reduce((sum, n) => sum + n.dailyCalls, 0) / Math.max(numbers.length, 1))} />
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
                      <AnimatedCounter value={numbers.filter(n => n.status === 'quarantined').length} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      <AnimatedCounter value={Math.round((numbers.filter(n => n.status === 'quarantined').length / Math.max(numbers.length, 1)) * 100)} suffix="%" /> of total
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
                      <AnimatedCounter value={new Set(numbers.map(n => {
                        const cleaned = n.phoneNumber?.replace(/\D/g, '') || '';
                        return cleaned.length >= 4 ? cleaned.slice(cleaned.startsWith('1') ? 1 : 0, cleaned.startsWith('1') ? 4 : 3) : '';
                      }).filter(Boolean)).size} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Geographic spread</p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <AgentActivityWidget />
                <GuardianStatusWidget />
              </div>
              <PhoneNumberPurchasing />

              {/* Numbers Table */}
              <Card id="phone-numbers" className="bg-card/90 backdrop-blur-sm">
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
      case 'leads':
        return <TabErrorBoundary tabName="Leads"><Suspense fallback={<TabLoader />}><EnhancedLeadManager /></Suspense></TabErrorBoundary>;
      case 'pipeline':
        return <TabErrorBoundary tabName="Pipeline"><Suspense fallback={<TabLoader />}><PipelineKanban /></Suspense></TabErrorBoundary>;
      case 'predictive':
        return <TabErrorBoundary tabName="Predictive Dialing"><Suspense fallback={<TabLoader />}><PredictiveDialingDashboard /></Suspense></TabErrorBoundary>;
      case 'retell':
        return <TabErrorBoundary tabName="Retell AI"><Suspense fallback={<TabLoader />}><RetellAIManager /></Suspense></TabErrorBoundary>;
      case 'workflows':
        return <TabErrorBoundary tabName="Workflows"><Suspense fallback={<TabLoader />}><WorkflowBuilder /></Suspense></TabErrorBoundary>;
      case 'lead-upload':
        return <TabErrorBoundary tabName="Lead Upload"><Suspense fallback={<TabLoader />}><LeadUpload /></Suspense></TabErrorBoundary>;
      case 'analytics':
        return <TabErrorBoundary tabName="Analytics"><Suspense fallback={<TabLoader />}><CallAnalytics numbers={numbers} /></Suspense></TabErrorBoundary>;
      case 'ai-engine':
        return <TabErrorBoundary tabName="AI Engine"><Suspense fallback={<TabLoader />}><AIDecisionEngine numbers={numbers} onRefreshNumbers={refreshNumbers} /></Suspense></TabErrorBoundary>;
      case 'rotation':
        return <TabErrorBoundary tabName="Rotation"><Suspense fallback={<TabLoader />}><NumberRotationManager numbers={numbers} onRefreshNumbers={refreshNumbers} /></Suspense></TabErrorBoundary>;
      case 'spam':
        return <TabErrorBoundary tabName="Spam Detection"><Suspense fallback={<TabLoader />}><SpamDetectionManager /></Suspense></TabErrorBoundary>;
      case 'sms':
        return <TabErrorBoundary tabName="SMS"><Suspense fallback={<TabLoader />}><SmsMessaging /></Suspense></TabErrorBoundary>;
      case 'reports':
        return <TabErrorBoundary tabName="Reports"><Suspense fallback={<TabLoader />}><DailyReports /></Suspense></TabErrorBoundary>;
      case 'automation':
        return <TabErrorBoundary tabName="Automation"><Suspense fallback={<TabLoader />}><CampaignAutomation /></Suspense></TabErrorBoundary>;
      case 'dispositions':
        return <TabErrorBoundary tabName="Dispositions"><Suspense fallback={<TabLoader />}><DispositionAutomationManager /></Suspense></TabErrorBoundary>;
      case 'ai-manager':
        return <TabErrorBoundary tabName="AI Manager"><Suspense fallback={<TabLoader />}><AIPipelineManager /></Suspense></TabErrorBoundary>;
      case 'follow-ups':
        return <TabErrorBoundary tabName="Follow-ups"><Suspense fallback={<TabLoader />}><FollowUpScheduler /></Suspense></TabErrorBoundary>;
      case 'agent-activity':
        return <TabErrorBoundary tabName="Agent Activity"><Suspense fallback={<TabLoader />}><AgentActivityDashboard /></Suspense></TabErrorBoundary>;
      case 'ai-workflows':
        return <TabErrorBoundary tabName="AI Workflows"><Suspense fallback={<TabLoader />}><AIWorkflowGenerator /></Suspense></TabErrorBoundary>;
      case 'reachability':
        return <TabErrorBoundary tabName="Reachability"><Suspense fallback={<TabLoader />}><ReachabilityDashboard /></Suspense></TabErrorBoundary>;
      case 'campaign-results':
        return <TabErrorBoundary tabName="Campaign Results"><Suspense fallback={<TabLoader />}><CampaignResultsDashboard /></Suspense></TabErrorBoundary>;
      case 'live-monitor':
        return <TabErrorBoundary tabName="Live Monitor"><Suspense fallback={<TabLoader />}><LiveCampaignMonitor /></Suspense></TabErrorBoundary>;
      case 'ab-testing':
        return <TabErrorBoundary tabName="A/B Testing"><Suspense fallback={<TabLoader />}><WorkflowABTesting /></Suspense></TabErrorBoundary>;
      case 'broadcast':
        return <TabErrorBoundary tabName="Voice Broadcasting"><Suspense fallback={<TabLoader />}><VoiceBroadcastManager /></Suspense></TabErrorBoundary>;
      case 'ai-errors':
        return <TabErrorBoundary tabName="Guardian"><Suspense fallback={<TabLoader />}><AIErrorPanel /></Suspense></TabErrorBoundary>;
      case 'budget':
        return <TabErrorBoundary tabName="Budget Manager"><Suspense fallback={<TabLoader />}><BudgetManager /></Suspense></TabErrorBoundary>;
      case 'onboarding':
        return <TabErrorBoundary tabName="Setup Wizard"><Suspense fallback={<TabLoader />}><OnboardingWizard onComplete={() => handleTabChange('overview')} onSkip={() => handleTabChange('overview')} /></Suspense></TabErrorBoundary>;
      case 'ai-setup':
        return <TabErrorBoundary tabName="AI Setup"><Suspense fallback={<TabLoader />}><AISetupAssistant /></Suspense></TabErrorBoundary>;
      case 'calendar':
        return <TabErrorBoundary tabName="Calendar"><Suspense fallback={<TabLoader />}><CalendarIntegrationManager /></Suspense></TabErrorBoundary>;
      case 'autonomous-agent':
        return <TabErrorBoundary tabName="Autonomous Agent"><Suspense fallback={<TabLoader />}><AutonomousAgentDashboard /></Suspense></TabErrorBoundary>;
      default:
        return <div className="text-muted-foreground">Select a section from the sidebar</div>;
    }
  };

  return (
    <SidebarProvider defaultOpen={false}>
      <div className="min-h-screen flex w-full bg-gradient-to-br from-background to-muted/30">
        <DashboardSidebar activeTab={activeTab} onTabChange={handleTabChange} />
        <SidebarInset className="flex-1 min-w-0">
          <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/95 backdrop-blur px-3 sm:px-4 lg:px-6">
            <SidebarTrigger className="shrink-0" />
            <div className="flex-1 min-w-0">
              <h1 className="text-base sm:text-lg font-semibold truncate">📞 Smart Dialer</h1>
            </div>
          </header>
          <main className="flex-1 p-3 sm:p-4 lg:p-6 overflow-x-hidden">
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
