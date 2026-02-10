import React, { useEffect, useState, lazy, Suspense, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Brain,
  Zap,
  Target,
  TrendingUp,
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  BarChart3,
  Settings,
  Play,
  Pause,
  RefreshCw,
  Lightbulb,
  Phone,
  MessageSquare,
  Calendar,
  FileBarChart,
  Bot,
  Workflow,
  Users,
  Shield
} from 'lucide-react';
import ScriptAnalyticsDashboard from '@/components/ScriptAnalyticsDashboard';
import { useAutonomousAgent, AgentDecision } from '@/hooks/useAutonomousAgent';
import { useAutonomousGoals, GoalProgress } from '@/hooks/useAutonomousGoals';
import { useAutonomousPrioritization } from '@/hooks/useAutonomousPrioritization';
import { useAutonomousCampaignOptimizer } from '@/hooks/useAutonomousCampaignOptimizer';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format, formatDistanceToNow } from 'date-fns';

// Phone number type for AI Engine
interface PhoneNumber {
  id: string;
  number: string;
  status: string;
  daily_calls: number;
  area_code: string;
  is_spam: boolean;
  spam_score: number;
  last_used: string | null;
}

// Lazy load the merged components
const AIDecisionEngine = lazy(() => import('@/components/AIDecisionEngine'));
const AIPipelineManager = lazy(() => import('@/components/AIPipelineManager'));
const AgentActivityDashboard = lazy(() => import('@/components/AgentActivityDashboard'));
const ActionQueuePanel = lazy(() => import('@/components/ActionQueuePanel'));

// Loading fallback for lazy components
const TabLoader = () => (
  <div className="space-y-4 p-4">
    <Skeleton className="h-8 w-1/3" />
    <Skeleton className="h-4 w-1/2" />
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
      <Skeleton className="h-32" />
      <Skeleton className="h-32" />
    </div>
  </div>
);

const AutonomousAgentDashboard: React.FC = () => {
  const {
    settings,
    updateSettings,
    decisions,
    isExecuting,
    loadDecisionHistory
  } = useAutonomousAgent();

  const {
    currentGoal,
    progress,
    updateGoalTargets,
    getAdaptiveRecommendation
  } = useAutonomousGoals();

  const {
    priorityScores,
    isCalculating,
    runPrioritization,
    startPrioritizationLoop,
    settings: prioritizationSettings,
    updateSettings: updatePrioritizationSettings
  } = useAutonomousPrioritization();

  const {
    metrics,
    recentActions,
    startOptimizer,
    forceOptimize,
    settings: optimizerSettings,
    updateSettings: updateOptimizerSettings
  } = useAutonomousCampaignOptimizer();

  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('overview');
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);
  const recommendation = getAdaptiveRecommendation();

  // Load phone numbers for AI Engine tab
  const loadPhoneNumbers = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('phone_numbers')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Normalize DB rows into the shape the AI Engine expects.
      // (Some environments store spam score as external_spam_score instead of spam_score.)
      const normalized: PhoneNumber[] = (data || []).map((row: any) => ({
        id: row.id,
        number: row.number,
        status: row.status ?? 'unknown',
        daily_calls: row.daily_calls ?? 0,
        area_code: row.area_code ?? '',
        is_spam: row.is_spam ?? false,
        spam_score: row.spam_score ?? row.external_spam_score ?? 0,
        last_used: row.last_used ?? row.last_used_at ?? null,
      }));

      setPhoneNumbers(normalized);
    } catch (error) {
      console.error('Error loading phone numbers:', error);
    }
  }, []);

  const refreshPhoneNumbers = useCallback(async () => {
    await loadPhoneNumbers();
    toast({
      title: 'Numbers Refreshed',
      description: 'Phone numbers have been refreshed.',
    });
  }, [loadPhoneNumbers, toast]);

  useEffect(() => {
    loadDecisionHistory(100);
  }, [loadDecisionHistory]);

  // Load phone numbers when AI Engine tab is selected
  useEffect(() => {
    if (activeTab === 'ai-engine' && phoneNumbers.length === 0) {
      loadPhoneNumbers();
    }
  }, [activeTab, phoneNumbers.length, loadPhoneNumbers]);

  const renderGoalProgress = (label: string, data: GoalProgress['calls'] | undefined, icon: React.ReactNode) => {
    if (!data) return null;
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {icon}
            <span className="text-sm font-medium">{label}</span>
          </div>
          <span className="text-sm text-muted-foreground">
            {data.current} / {data.target}
          </span>
        </div>
        <Progress value={data.percentage} className="h-2" />
      </div>
    );
  };

  const getDecisionIcon = (type: AgentDecision['decision_type']) => {
    switch (type) {
      case 'call': return <Phone className="h-4 w-4 text-blue-500" />;
      case 'sms': return <MessageSquare className="h-4 w-4 text-green-500" />;
      case 'email': return <MessageSquare className="h-4 w-4 text-purple-500" />;
      case 'wait': return <Clock className="h-4 w-4 text-yellow-500" />;
      default: return <Activity className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with Master Toggle */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="h-6 w-6 text-primary" />
            Autonomous Agent
          </h2>
          <p className="text-muted-foreground">
            AI-powered lead management running 24/7
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Autonomous Mode</span>
            <Switch 
              checked={settings.enabled} 
              onCheckedChange={(enabled) => updateSettings({ enabled })}
            />
          </div>
          {settings.enabled && (
            <Badge variant="default" className="animate-pulse">
              <Zap className="h-3 w-3 mr-1" />
              Active
            </Badge>
          )}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Today's Actions</p>
                <p className="text-2xl font-bold">
                  {decisions.filter(d => d.timestamp.startsWith(new Date().toISOString().split('T')[0])).length}
                </p>
              </div>
              <Activity className="h-8 w-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Success Rate</p>
                <p className="text-2xl font-bold">
                  {decisions.length > 0 
                    ? Math.round((decisions.filter(d => d.success).length / decisions.length) * 100)
                    : 0}%
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Goal Progress</p>
                <p className="text-2xl font-bold">{progress?.overallProgress || 0}%</p>
              </div>
              <Target className="h-8 w-8 text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Leads Prioritized</p>
                <p className="text-2xl font-bold">{priorityScores.length}</p>
              </div>
              <BarChart3 className="h-8 w-8 text-purple-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Adaptive Recommendation */}
      {recommendation && settings.enabled && (
        <Card className={`border-l-4 ${
          recommendation.urgency === 'high' ? 'border-l-red-500 bg-red-500/5' :
          recommendation.urgency === 'medium' ? 'border-l-yellow-500 bg-yellow-500/5' :
          'border-l-green-500 bg-green-500/5'
        }`}>
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <Lightbulb className={`h-5 w-5 mt-0.5 ${
                recommendation.urgency === 'high' ? 'text-red-500' :
                recommendation.urgency === 'medium' ? 'text-yellow-500' :
                'text-green-500'
              }`} />
              <div className="flex-1">
                <p className="font-medium">{recommendation.message}</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {recommendation.suggestedActions.map((action, i) => (
                    <Badge key={i} variant="outline">
                      {action.replace(/_/g, ' ')}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4 lg:grid-cols-9 gap-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="decisions">Decisions</TabsTrigger>
          <TabsTrigger value="ai-engine" className="flex items-center gap-1">
            <Lightbulb className="h-3 w-3" />
            <span className="hidden sm:inline">AI Engine</span>
          </TabsTrigger>
          <TabsTrigger value="pipeline" className="flex items-center gap-1">
            <Workflow className="h-3 w-3" />
            <span className="hidden sm:inline">Pipeline</span>
          </TabsTrigger>
          <TabsTrigger value="activity" className="flex items-center gap-1">
            <Bot className="h-3 w-3" />
            <span className="hidden sm:inline">Activity</span>
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-1">
            <FileBarChart className="h-3 w-3" />
            <span className="hidden sm:inline">Analytics</span>
          </TabsTrigger>
          <TabsTrigger value="action-queue" className="flex items-center gap-1">
            <Shield className="h-3 w-3" />
            <span className="hidden sm:inline">Actions</span>
          </TabsTrigger>
          <TabsTrigger value="goals">Goals</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid lg:grid-cols-2 gap-4">
            {/* Goal Progress Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Daily Goals
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {renderGoalProgress('Appointments', progress?.appointments, <Calendar className="h-4 w-4" />)}
                {renderGoalProgress('Calls', progress?.calls, <Phone className="h-4 w-4" />)}
                {renderGoalProgress('Conversations', progress?.conversations, <MessageSquare className="h-4 w-4" />)}
                
                <div className="pt-2 flex items-center justify-between text-sm">
                  <span className={progress?.onTrack ? 'text-green-600' : 'text-yellow-600'}>
                    {progress?.onTrack ? '✓ On Track' : '⚠ Behind Schedule'}
                  </span>
                  {progress?.estimatedCompletion && (
                    <span className="text-muted-foreground">
                      Est. completion: {progress.estimatedCompletion}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Campaign Metrics Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Campaign Health
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm">Answer Rate</span>
                  <div className="flex items-center gap-2">
                    <Progress value={metrics?.currentAnswerRate || 0} className="w-24 h-2" />
                    <span className="text-sm font-medium">{metrics?.currentAnswerRate || 0}%</span>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Current Pacing</span>
                  <span className="font-medium">{metrics?.currentPacing || 0} calls/min</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Spam Risk</span>
                  <Badge variant={
                    metrics?.spamRiskLevel === 'high' ? 'destructive' :
                    metrics?.spamRiskLevel === 'medium' ? 'secondary' : 'default'
                  }>
                    {metrics?.spamRiskLevel || 'unknown'}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Optimal Hours</span>
                  <span className="text-sm text-muted-foreground">
                    {metrics?.optimalCallingHours.start} - {metrics?.optimalCallingHours.end}
                  </span>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full mt-2"
                  onClick={forceOptimize}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Optimize Now
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Top Priority Leads */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Top Priority Leads
                </CardTitle>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={runPrioritization}
                  disabled={isCalculating}
                >
                  {isCalculating ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Re-Score
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {priorityScores.slice(0, 5).map((score, index) => (
                  <div key={score.leadId} className="flex items-center justify-between p-2 rounded bg-muted/50">
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-bold text-muted-foreground">#{index + 1}</span>
                      <div>
                        <p className="font-medium text-sm">Lead {score.leadId.slice(0, 8)}</p>
                        <p className="text-xs text-muted-foreground">
                          Best time: {score.bestContactTime || 'Any'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-primary">{score.priorityScore}</p>
                      <p className="text-xs text-muted-foreground">Priority Score</p>
                    </div>
                  </div>
                ))}
                {priorityScores.length === 0 && (
                  <p className="text-center text-muted-foreground py-4">
                    No leads scored yet. Click Re-Score to analyze.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="decisions" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Decision History</CardTitle>
              <CardDescription>
                All autonomous decisions made by the AI agent
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <div className="space-y-3">
                  {decisions.map((decision) => (
                    <div 
                      key={decision.id} 
                      className="flex items-start gap-3 p-3 rounded-lg border"
                    >
                      <div className="mt-1">
                        {getDecisionIcon(decision.decision_type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{decision.lead_name || 'Unknown Lead'}</span>
                          <Badge variant={decision.approved_by === 'autonomous' ? 'default' : 'secondary'}>
                            {decision.approved_by === 'autonomous' ? 'Auto' : 'Manual'}
                          </Badge>
                          {decision.success !== undefined && (
                            decision.success ? (
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-500" />
                            )
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                          {decision.reasoning}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDistanceToNow(new Date(decision.timestamp), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  ))}
                  {decisions.length === 0 && (
                    <p className="text-center text-muted-foreground py-8">
                      No decisions recorded yet
                    </p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileBarChart className="h-5 w-5" />
                Script & Performance Analytics
              </CardTitle>
              <CardDescription>
                Analyze opener effectiveness, time wasted patterns, and voicemail callback performance
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScriptAnalyticsDashboard />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="action-queue" className="mt-4">
          <Suspense fallback={<TabLoader />}>
            <ActionQueuePanel />
          </Suspense>
        </TabsContent>

        <TabsContent value="goals" className="mt-4">
          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Set Daily Goals</CardTitle>
                <CardDescription>
                  Adjust targets for today
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <label className="text-sm font-medium">Appointments Target</label>
                    <span className="text-sm text-muted-foreground">{currentGoal?.appointmentsTarget || 5}</span>
                  </div>
                  <Slider
                    value={[currentGoal?.appointmentsTarget || 5]}
                    min={1}
                    max={20}
                    step={1}
                    onValueChange={([value]) => updateGoalTargets({ appointmentsTarget: value })}
                  />
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <label className="text-sm font-medium">Calls Target</label>
                    <span className="text-sm text-muted-foreground">{currentGoal?.callsTarget || 100}</span>
                  </div>
                  <Slider
                    value={[currentGoal?.callsTarget || 100]}
                    min={10}
                    max={500}
                    step={10}
                    onValueChange={([value]) => updateGoalTargets({ callsTarget: value })}
                  />
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <label className="text-sm font-medium">Conversations Target</label>
                    <span className="text-sm text-muted-foreground">{currentGoal?.conversationsTarget || 20}</span>
                  </div>
                  <Slider
                    value={[currentGoal?.conversationsTarget || 20]}
                    min={5}
                    max={100}
                    step={5}
                    onValueChange={([value]) => updateGoalTargets({ conversationsTarget: value })}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Today's Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="text-center py-4">
                    <div className="text-5xl font-bold text-primary">
                      {progress?.overallProgress || 0}%
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">Overall Progress</p>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-2xl font-bold">{progress?.appointments.current || 0}</p>
                      <p className="text-xs text-muted-foreground">Appointments</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{progress?.calls.current || 0}</p>
                      <p className="text-xs text-muted-foreground">Calls</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{progress?.conversations.current || 0}</p>
                      <p className="text-xs text-muted-foreground">Conversations</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Autonomous Behavior
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Auto-Execute Recommendations</p>
                    <p className="text-sm text-muted-foreground">Automatically act on AI recommendations</p>
                  </div>
                  <Switch 
                    checked={settings.auto_execute_recommendations}
                    onCheckedChange={(checked) => updateSettings({ auto_execute_recommendations: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Require Approval for High Priority</p>
                    <p className="text-sm text-muted-foreground">Pause for important decisions</p>
                  </div>
                  <Switch 
                    checked={settings.require_approval_for_high_priority}
                    onCheckedChange={(checked) => updateSettings({ require_approval_for_high_priority: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Decision Tracking</p>
                    <p className="text-sm text-muted-foreground">Log all autonomous decisions</p>
                  </div>
                  <Switch 
                    checked={settings.decision_tracking_enabled}
                    onCheckedChange={(checked) => updateSettings({ decision_tracking_enabled: checked })}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between">
                    <p className="font-medium">Max Daily Actions</p>
                    <span className="text-sm text-muted-foreground">{settings.max_daily_autonomous_actions}</span>
                  </div>
                  <Slider
                    value={[settings.max_daily_autonomous_actions]}
                    min={10}
                    max={200}
                    step={10}
                    onValueChange={([value]) => updateSettings({ max_daily_autonomous_actions: value })}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Optimization Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Auto-Adjust Pacing</p>
                    <p className="text-sm text-muted-foreground">Optimize dial rate based on answer rate</p>
                  </div>
                  <Switch 
                    checked={optimizerSettings.autoAdjustPacing}
                    onCheckedChange={(checked) => updateOptimizerSettings({ autoAdjustPacing: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Auto-Rotate Numbers</p>
                    <p className="text-sm text-muted-foreground">Quarantine flagged numbers automatically</p>
                  </div>
                  <Switch 
                    checked={optimizerSettings.autoRotateNumbers}
                    onCheckedChange={(checked) => updateOptimizerSettings({ autoRotateNumbers: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Auto-Prioritize Leads</p>
                    <p className="text-sm text-muted-foreground">Re-score leads every 15 minutes</p>
                  </div>
                  <Switch 
                    checked={prioritizationSettings.enabled}
                    onCheckedChange={(enabled) => updatePrioritizationSettings({ enabled })}
                  />
                </div>

                <div className="pt-4 flex gap-2">
                  <Button 
                    variant="outline" 
                    className="flex-1"
                    onClick={startPrioritizationLoop}
                  >
                    <Play className="h-4 w-4 mr-2" />
                    Start All
                  </Button>
                  <Button 
                    variant="outline"
                    className="flex-1"
                    onClick={startOptimizer}
                  >
                    <Activity className="h-4 w-4 mr-2" />
                    Start Optimizer
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* AI Engine Tab - Number pool recommendations */}
        <TabsContent value="ai-engine" className="mt-4">
          <Suspense fallback={<TabLoader />}>
            <AIDecisionEngine numbers={phoneNumbers} onRefreshNumbers={refreshPhoneNumbers} />
          </Suspense>
        </TabsContent>

        {/* Pipeline Manager Tab - Lead nurturing AI */}
        <TabsContent value="pipeline" className="mt-4">
          <Suspense fallback={<TabLoader />}>
            <AIPipelineManager />
          </Suspense>
        </TabsContent>

        {/* Agent Activity Tab - Performance monitoring */}
        <TabsContent value="activity" className="mt-4">
          <Suspense fallback={<TabLoader />}>
            <AgentActivityDashboard />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AutonomousAgentDashboard;
