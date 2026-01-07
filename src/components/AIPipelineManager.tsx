import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Brain, 
  TrendingUp, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  Phone, 
  MessageSquare,
  Mail,
  User,
  Target,
  Calendar,
  Activity,
  Settings,
  Zap,
  History,
  FileText,
  Play,
  Pause
} from 'lucide-react';
import { useAIPipelineManager, useCallTracking } from '@/hooks/useCallTracking';
import { useAutonomousAgent } from '@/hooks/useAutonomousAgent';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import ScriptManager from './ScriptManager';

const AIPipelineManager: React.FC = () => {
  const { 
    isAnalyzing, 
    analyzePipelineForRecommendations,
    getDailyActionPlan 
  } = useAIPipelineManager();
  const { getBatchCallStats } = useCallTracking();
  const {
    isExecuting,
    settings,
    decisions,
    updateSettings,
    executeRecommendation,
    loadDecisionHistory
  } = useAutonomousAgent();
  const { toast } = useToast();

  const [leads, setLeads] = useState<any[]>([]);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [dailyPlan, setDailyPlan] = useState<any>(null);
  const [callStats, setCallStats] = useState<Map<string, any>>(new Map());
  const [selectedLead, setSelectedLead] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState('recommendations');
  const [isLoadingPlan, setIsLoadingPlan] = useState(false);
  const [executingId, setExecutingId] = useState<string | null>(null);

  useEffect(() => {
    loadLeads();
  }, []);

  const loadLeads = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('user_id', user.id)
        .in('status', ['new', 'contacted', 'qualified'])
        .order('priority', { ascending: false })
        .limit(50);

      if (error) throw error;
      setLeads(data || []);

      // Load call stats for all leads
      if (data && data.length > 0) {
        const leadIds = data.map(l => l.id);
        const stats = await getBatchCallStats(leadIds);
        setCallStats(stats);
      }
    } catch (error) {
      console.error('Error loading leads:', error);
    }
  };

  const handleAnalyzePipeline = async () => {
    const recs = await analyzePipelineForRecommendations(leads);
    setRecommendations(recs);
    setActiveTab('recommendations'); // Switch to recommendations tab
    
    if (recs.length > 0) {
      toast({
        title: "Pipeline Analyzed",
        description: `Generated ${recs.length} recommendations - view them below`,
      });
    } else {
      toast({
        title: "No Recommendations",
        description: "All leads are on track or no actionable insights found",
      });
    }
  };

  const handleGetDailyPlan = async () => {
    setIsLoadingPlan(true);
    try {
      const plan = await getDailyActionPlan(leads);
      setDailyPlan(plan);
      setActiveTab('daily-plan'); // Switch to daily plan tab
      
      const totalActions = plan.highPriority.length + plan.callsToday.length + plan.followUps.length;
      toast({
        title: "Daily Action Plan Ready",
        description: `${plan.highPriority.length} high priority, ${totalActions} total actions`,
      });
    } finally {
      setIsLoadingPlan(false);
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'high':
        return <Badge className="bg-red-500">High Priority</Badge>;
      case 'medium':
        return <Badge className="bg-yellow-500">Medium Priority</Badge>;
      case 'low':
        return <Badge className="bg-blue-500">Low Priority</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  const getActionIcon = (actionType: string) => {
    switch (actionType) {
      case 'call': return <Phone className="h-4 w-4" />;
      case 'sms': return <MessageSquare className="h-4 w-4" />;
      case 'email': return <Mail className="h-4 w-4" />;
      case 'wait': return <Clock className="h-4 w-4" />;
      default: return <Activity className="h-4 w-4" />;
    }
  };

  const formatCallStats = (leadId: string) => {
    const stats = callStats.get(leadId);
    if (!stats || stats.totalCalls === 0) {
      return <span className="text-sm text-slate-500">No calls yet</span>;
    }

    return (
      <div className="text-sm">
        <span className="font-medium">{stats.totalCalls} calls</span>
        {stats.lastCallTime && (
          <span className="text-slate-500 ml-2">
            Last: {new Date(stats.lastCallTime).toLocaleDateString()}
          </span>
        )}
      </div>
    );
  };

  const LeadCallHistory = ({ leadId }: { leadId: string }) => {
    const stats = callStats.get(leadId);
    if (!stats) return null;

    return (
      <div className="space-y-2 p-4 bg-slate-50 dark:bg-slate-900 rounded-lg">
        <h4 className="font-semibold text-sm">Call History</h4>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-slate-500">Total Calls:</span>
            <div className="font-medium">{stats.totalCalls}</div>
          </div>
          <div>
            <span className="text-slate-500">Avg Duration:</span>
            <div className="font-medium">{Math.floor(stats.averageCallDuration / 60)}m {stats.averageCallDuration % 60}s</div>
          </div>
          <div>
            <span className="text-slate-500">Last Call:</span>
            <div className="font-medium">
              {stats.lastCallTime ? new Date(stats.lastCallTime).toLocaleString() : 'Never'}
            </div>
          </div>
          <div>
            <span className="text-slate-500">Total Duration:</span>
            <div className="font-medium">{Math.floor(stats.totalDuration / 60)}m</div>
          </div>
        </div>
        
        {Object.keys(stats.outcomes).length > 0 && (
          <div className="mt-3">
            <span className="text-slate-500 text-sm">Outcomes:</span>
            <div className="flex flex-wrap gap-2 mt-1">
              {Object.entries(stats.outcomes).map(([outcome, count]) => (
                <Badge key={outcome} variant="outline" className="text-xs">
                  {outcome}: {count as number}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {stats.callTimes.length > 0 && (
          <div className="mt-3">
            <span className="text-slate-500 text-sm">Recent Call Times:</span>
            <div className="text-xs text-slate-600 dark:text-slate-400 mt-1 space-y-1">
              {stats.callTimes.slice(0, 5).map((time: string, idx: number) => (
                <div key={idx}>• {new Date(time).toLocaleString()}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const handleExecuteAction = async (recommendation: any, leadId: string, leadName: string) => {
    setExecutingId(leadId);
    try {
      const success = await executeRecommendation({
        recommendation,
        leadId,
        leadName,
        isAutonomous: false
      });
      
      if (success) {
        toast({
          title: "Action Executed",
          description: `${recommendation.nextBestAction.type} action completed for ${leadName}`,
        });
      } else {
        toast({
          title: "Action Failed",
          description: `Could not complete ${recommendation.nextBestAction.type} for ${leadName}`,
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Execute action error:', error);
      toast({
        title: "Execution Error",
        description: "Something went wrong. Check console for details.",
        variant: "destructive"
      });
    } finally {
      setExecutingId(null);
      await loadDecisionHistory();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Brain className="h-6 w-6 text-purple-600" />
            AI Pipeline Manager
            {settings.enabled && (
              <Badge className="bg-green-500">
                <Zap className="h-3 w-3 mr-1" />
                Autonomous
              </Badge>
            )}
          </h2>
          <p className="text-slate-600 dark:text-slate-400">
            Your AI sales manager - getting leads across the finish line
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={showSettings ? "default" : "outline"}
            onClick={() => setShowSettings(!showSettings)}
          >
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Button>
          <Button onClick={handleAnalyzePipeline} disabled={isAnalyzing || leads.length === 0}>
            {isAnalyzing ? (
              <>
                <Brain className="h-4 w-4 mr-2 animate-pulse" />
                Analyzing...
              </>
            ) : (
              <>
                <Target className="h-4 w-4 mr-2" />
                Analyze Pipeline
              </>
            )}
          </Button>
          <Button onClick={handleGetDailyPlan} disabled={isLoadingPlan || leads.length === 0}>
            {isLoadingPlan ? (
              <>
                <Calendar className="h-4 w-4 mr-2 animate-pulse" />
                Generating...
              </>
            ) : (
              <>
                <Calendar className="h-4 w-4 mr-2" />
                Daily Action Plan
              </>
            )}
          </Button>
        </div>
      </div>

      {showSettings && (
        <Card className="border-purple-200 bg-purple-50 dark:bg-purple-900/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Autonomous Agent Settings
            </CardTitle>
            <CardDescription>
              Configure how the AI makes decisions and executes actions
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base">Autonomous Mode</Label>
                <div className="text-sm text-slate-500">
                  Allow AI to make decisions automatically
                </div>
              </div>
              <Switch
                checked={settings.enabled}
                onCheckedChange={(checked) => updateSettings({ enabled: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base">Auto-Execute Recommendations</Label>
                <div className="text-sm text-slate-500">
                  AI executes follow-up actions without approval
                </div>
              </div>
              <Switch
                checked={settings.auto_execute_recommendations}
                onCheckedChange={(checked) => updateSettings({ auto_execute_recommendations: checked })}
                disabled={!settings.enabled}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base">Auto-Approve Script Changes</Label>
                <div className="text-sm text-slate-500">
                  AI can update scripts based on performance data
                </div>
              </div>
              <Switch
                checked={settings.auto_approve_script_changes}
                onCheckedChange={(checked) => updateSettings({ auto_approve_script_changes: checked })}
                disabled={!settings.enabled}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base">Require Approval for High Priority</Label>
                <div className="text-sm text-slate-500">
                  Always require human approval for high-priority leads
                </div>
              </div>
              <Switch
                checked={settings.require_approval_for_high_priority}
                onCheckedChange={(checked) => updateSettings({ require_approval_for_high_priority: checked })}
                disabled={!settings.enabled}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base">Decision Tracking</Label>
                <div className="text-sm text-slate-500">
                  Track all AI decisions and outcomes
                </div>
              </div>
              <Switch
                checked={settings.decision_tracking_enabled}
                onCheckedChange={(checked) => updateSettings({ decision_tracking_enabled: checked })}
              />
            </div>

            <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded">
              <div className="text-sm font-medium">Daily Action Limit</div>
              <div className="text-xs text-slate-500 mb-2">
                Maximum autonomous actions per day: {settings.max_daily_autonomous_actions}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList>
          <TabsTrigger value="recommendations">AI Recommendations</TabsTrigger>
          <TabsTrigger value="daily-plan">Daily Action Plan</TabsTrigger>
          <TabsTrigger value="decisions">Decision History</TabsTrigger>
          <TabsTrigger value="scripts">Script Optimizer</TabsTrigger>
          <TabsTrigger value="lead-details">Lead Details</TabsTrigger>
        </TabsList>

        <TabsContent value="recommendations" className="space-y-4">
          {isAnalyzing && (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <div className="text-center">
                  <Brain className="h-12 w-12 animate-pulse text-purple-600 mx-auto mb-4" />
                  <p className="text-slate-600 dark:text-slate-400">Analyzing pipeline...</p>
                </div>
              </CardContent>
            </Card>
          )}

          {!isAnalyzing && recommendations.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <Brain className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                <p className="text-slate-600 dark:text-slate-400">
                  Click "Analyze Pipeline" to get AI-powered recommendations
                </p>
              </CardContent>
            </Card>
          )}

          {recommendations.map((rec) => (
            <Card key={rec.leadId} className="border-l-4" style={{
              borderLeftColor: rec.priority === 'high' ? '#ef4444' : rec.priority === 'medium' ? '#f59e0b' : '#3b82f6'
            }}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <User className="h-4 w-4" />
                      <CardTitle className="text-lg">{rec.leadName}</CardTitle>
                      {getPriorityBadge(rec.priority)}
                    </div>
                    <CardDescription className="text-base font-medium text-slate-900 dark:text-slate-100">
                      {rec.recommendation}
                    </CardDescription>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setSelectedLead(selectedLead === rec.leadId ? null : rec.leadId)}
                  >
                    {selectedLead === rec.leadId ? 'Hide Details' : 'View Details'}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    Reasoning:
                  </h4>
                  <ul className="space-y-1">
                    {rec.reasoning.map((reason: string, idx: number) => (
                      <li key={idx} className="text-sm text-slate-600 dark:text-slate-400 pl-4">
                        • {reason}
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    Suggested Actions:
                  </h4>
                  <ul className="space-y-1">
                    {rec.suggestedActions.map((action: string, idx: number) => (
                      <li key={idx} className="text-sm text-slate-600 dark:text-slate-400 pl-4">
                        • {action}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                  <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-purple-600" />
                    Next Best Action:
                  </h4>
                  <div className="flex items-center gap-3">
                    {getActionIcon(rec.nextBestAction.type)}
                    <div className="flex-1">
                      <div className="font-medium text-sm capitalize">{rec.nextBestAction.type}</div>
                      <div className="text-xs text-slate-600 dark:text-slate-400">
                        Timing: {rec.nextBestAction.timing}
                      </div>
                    </div>
                  </div>
                  {rec.nextBestAction.message && (
                    <p className="text-sm mt-2 text-slate-700 dark:text-slate-300">
                      {rec.nextBestAction.message}
                    </p>
                  )}
                </div>

                <div className="text-sm text-slate-500">
                  {formatCallStats(rec.leadId)}
                </div>

                {selectedLead === rec.leadId && (
                  <LeadCallHistory leadId={rec.leadId} />
                )}

                <div className="flex gap-2 mt-4">
                  <Button 
                    onClick={() => handleExecuteAction(rec, rec.leadId, rec.leadName)}
                    disabled={isExecuting || executingId === rec.leadId}
                    className="flex-1"
                  >
                    {executingId === rec.leadId ? (
                      <>
                        <Brain className="h-4 w-4 mr-2 animate-spin" />
                        Executing...
                      </>
                    ) : settings.auto_execute_recommendations && settings.enabled ? (
                      <>
                        <Zap className="h-4 w-4 mr-2" />
                        Execute (Auto)
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-2" />
                        Execute Action
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="decisions" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <History className="h-5 w-5" />
                    Decision History
                  </CardTitle>
                  <CardDescription>
                    Track all AI decisions and their outcomes
                  </CardDescription>
                </div>
                <Button onClick={() => loadDecisionHistory()} variant="outline" size="sm">
                  <Activity className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {decisions.length === 0 ? (
                <p className="text-center text-slate-500 py-8">
                  No decisions tracked yet. Execute recommendations to see history.
                </p>
              ) : (
                <div className="space-y-3">
                  {decisions.map((decision: any) => (
                    <div 
                      key={decision.id}
                      className="p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="font-medium">{decision.lead_name}</div>
                          <div className="text-xs text-slate-500">
                            {new Date(decision.timestamp || decision.created_at).toLocaleString()}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Badge variant={decision.approved_by === 'autonomous' ? 'default' : 'secondary'}>
                            {decision.approved_by === 'autonomous' ? 'Auto' : 'Manual'}
                          </Badge>
                          {decision.success !== null && (
                            <Badge variant={decision.success ? 'default' : 'destructive'}>
                              {decision.success ? 'Success' : 'Failed'}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="text-sm">
                        <div className="font-medium capitalize">{decision.decision_type} Action</div>
                        <div className="text-slate-600 dark:text-slate-400 mt-1">
                          {decision.action_taken}
                        </div>
                        {decision.reasoning && (
                          <div className="text-xs text-slate-500 mt-2">
                            Reasoning: {decision.reasoning}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="scripts" className="space-y-4">
          <ScriptManager />
        </TabsContent>

        <TabsContent value="daily-plan" className="space-y-4">
          {!dailyPlan && (
            <Card>
              <CardContent className="py-12 text-center">
                <Calendar className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                <p className="text-slate-600 dark:text-slate-400">
                  Click "Daily Action Plan" to get your prioritized tasks for today
                </p>
              </CardContent>
            </Card>
          )}

          {dailyPlan && (
            <>
              <Card className="border-red-200 bg-red-50 dark:bg-red-900/20">
                <CardHeader>
                  <CardTitle className="text-red-900 dark:text-red-100 flex items-center gap-2">
                    <AlertCircle className="h-5 w-5" />
                    High Priority ({dailyPlan.highPriority.length})
                  </CardTitle>
                  <CardDescription>Must handle today</CardDescription>
                </CardHeader>
                <CardContent>
                  {dailyPlan.highPriority.length === 0 ? (
                    <p className="text-sm text-slate-500">No high priority items</p>
                  ) : (
                    <div className="space-y-2">
                      {dailyPlan.highPriority.map((rec: any) => (
                        <div key={rec.leadId} className="p-3 bg-white dark:bg-slate-800 rounded border">
                          <div className="font-medium">{rec.leadName}</div>
                          <div className="text-sm text-slate-600 dark:text-slate-400">{rec.recommendation}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Phone className="h-5 w-5" />
                    Calls to Make Today ({dailyPlan.callsToday.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {dailyPlan.callsToday.length === 0 ? (
                    <p className="text-sm text-slate-500">No calls scheduled for today</p>
                  ) : (
                    <div className="space-y-2">
                      {dailyPlan.callsToday.map((rec: any) => (
                        <div key={rec.leadId} className="p-3 bg-slate-50 dark:bg-slate-900 rounded">
                          <div className="font-medium">{rec.leadName}</div>
                          <div className="text-sm text-slate-600 dark:text-slate-400">{rec.nextBestAction.message}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    Follow-ups ({dailyPlan.followUps.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {dailyPlan.followUps.length === 0 ? (
                    <p className="text-sm text-slate-500">No follow-ups due</p>
                  ) : (
                    <div className="space-y-2">
                      {dailyPlan.followUps.map((rec: any) => (
                        <div key={rec.leadId} className="p-3 bg-slate-50 dark:bg-slate-900 rounded">
                          <div className="font-medium">{rec.leadName}</div>
                          <div className="text-sm text-slate-600 dark:text-slate-400">
                            {rec.nextBestAction.timing}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="lead-details" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Lead Call Statistics</CardTitle>
              <CardDescription>
                Detailed call history and statistics for all leads
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {leads.map(lead => {
                  const stats = callStats.get(lead.id);
                  return (
                    <div key={lead.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="font-semibold">
                            {lead.first_name} {lead.last_name}
                          </h3>
                          <p className="text-sm text-slate-500">{lead.phone_number}</p>
                        </div>
                        <Badge variant={lead.status === 'qualified' ? 'default' : 'secondary'}>
                          {lead.status}
                        </Badge>
                      </div>
                      {stats && <LeadCallHistory leadId={lead.id} />}
                      {!stats && (
                        <p className="text-sm text-slate-500">No call history available</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AIPipelineManager;
