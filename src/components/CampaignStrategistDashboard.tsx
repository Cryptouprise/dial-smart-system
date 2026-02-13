import React, { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Target,
  TrendingUp,
  AlertTriangle,
  Lightbulb,
  Clock,
  Zap,
  BarChart3,
  RefreshCw,
  ChevronRight,
  Sparkles,
  Shield,
  Phone,
  MessageSquare,
  DollarSign,
  Eye,
  CheckCircle2,
  XCircle,
  Calendar,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format, formatDistanceToNow } from 'date-fns';

// ---- Types ----

interface BattlePlan {
  id: string;
  plan_date: string;
  total_phone_numbers: number;
  healthy_numbers: number;
  resting_numbers: number;
  estimated_budget_cents: number;
  callbacks_pending: number;
  hot_leads: number;
  engaged_leads: number;
  stalled_leads: number;
  fresh_leads: number;
  nurturing_leads: number;
  budget_for_callbacks_pct: number;
  budget_for_hot_pct: number;
  budget_for_engaged_pct: number;
  budget_for_cold_pct: number;
  budget_for_reactivation_pct: number;
  morning_pace: number;
  midday_pace: number;
  afternoon_pace: number;
  evening_pace: number;
  executive_summary: string;
  priority_order: string[];
  time_blocks: Array<{ hour: number; focus: string; pace: number; channel?: string }>;
  risk_factors: string[];
  expected_outcomes: Record<string, number>;
  plan_status: string;
  adherence_score: number | null;
  actual_outcomes: Record<string, number>;
  model_used: string;
  generation_time_ms: number;
  created_at: string;
}

interface Insight {
  id: string;
  insight_type: string;
  title: string;
  description: string;
  confidence: number;
  sample_size: number;
  effect_magnitude: number;
  recommended_action: string;
  status: string;
  auto_rule_created: boolean;
  dimensions: Record<string, any>;
  created_at: string;
}

interface Briefing {
  id: string;
  briefing_type: string;
  briefing_date: string;
  headline: string;
  executive_summary: string;
  wins: string[];
  concerns: string[];
  recommendations: string[];
  new_insights_count: number;
  action_items: Array<{ action: string; priority: string }>;
  created_at: string;
}

// ---- Component ----

const CampaignStrategistDashboard: React.FC = () => {
  const [plan, setPlan] = useState<BattlePlan | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [briefings, setBriefings] = useState<Briefing[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('plan');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];

      const client = supabase as any;
      const [planRes, insightsRes, briefingsRes] = await Promise.all([
        client.from('daily_battle_plans')
          .select('*')
          .eq('plan_date', today)
          .maybeSingle(),
        client.from('strategic_insights')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(20),
        client.from('strategic_briefings')
          .select('*')
          .order('briefing_date', { ascending: false })
          .limit(10),
      ]);

      if (planRes.data) setPlan(planRes.data as unknown as BattlePlan);
      if (insightsRes.data) setInsights(insightsRes.data as unknown as Insight[]);
      if (briefingsRes.data) setBriefings(briefingsRes.data as unknown as Briefing[]);
    } catch (err) {
      console.error('Error loading strategist data:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 60000);
    return () => clearInterval(interval);
  }, [loadData]);

  const getInsightIcon = (type: string) => {
    switch (type) {
      case 'timing_pattern': return <Clock className="h-4 w-4 text-blue-500" />;
      case 'source_channel_correlation': return <BarChart3 className="h-4 w-4 text-purple-500" />;
      case 'attempt_gap_pattern': return <RefreshCw className="h-4 w-4 text-orange-500" />;
      case 'sequence_pattern': return <MessageSquare className="h-4 w-4 text-green-500" />;
      case 'decay_pattern': return <TrendingUp className="h-4 w-4 text-red-500" />;
      case 'number_effectiveness': return <Phone className="h-4 w-4 text-indigo-500" />;
      case 'cost_efficiency': return <DollarSign className="h-4 w-4 text-emerald-500" />;
      case 'cross_campaign': return <Sparkles className="h-4 w-4 text-amber-500" />;
      default: return <Lightbulb className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getConfidenceBadge = (confidence: number) => {
    if (confidence >= 0.8) return <Badge className="bg-green-100 text-green-800 text-xs">High Confidence</Badge>;
    if (confidence >= 0.6) return <Badge className="bg-yellow-100 text-yellow-800 text-xs">Medium Confidence</Badge>;
    return <Badge className="bg-gray-100 text-gray-800 text-xs">Low Confidence</Badge>;
  };

  // ---- Render Battle Plan ----

  const renderBattlePlan = () => {
    if (!plan) {
      return (
        <Card>
          <CardContent className="py-12 text-center">
            <Target className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Battle Plan Yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Enable daily planning in Autonomous Agent settings. The AI will generate a plan each morning.
            </p>
          </CardContent>
        </Card>
      );
    }

    const totalLeads = plan.callbacks_pending + plan.hot_leads + plan.engaged_leads +
      plan.stalled_leads + plan.fresh_leads + plan.nurturing_leads;

    return (
      <div className="space-y-4">
        {/* Executive Summary */}
        <Card className="border-l-4 border-l-primary">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <Zap className="h-5 w-5 text-primary mt-1 shrink-0" />
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold">Today's Battle Plan</h3>
                  <Badge variant={plan.plan_status === 'active' ? 'default' : 'secondary'}>
                    {plan.plan_status}
                  </Badge>
                  {plan.adherence_score != null && (
                    <Badge variant="outline">{plan.adherence_score}% adherence</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{plan.executive_summary}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Resource Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="pt-3 pb-3">
              <p className="text-xs text-muted-foreground">Phone Numbers</p>
              <p className="text-xl font-bold">{plan.healthy_numbers}<span className="text-sm font-normal text-muted-foreground">/{plan.total_phone_numbers}</span></p>
              <p className="text-xs text-muted-foreground">{plan.resting_numbers} resting</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-3 pb-3">
              <p className="text-xs text-muted-foreground">Budget</p>
              <p className="text-xl font-bold">${(plan.estimated_budget_cents / 100).toFixed(0)}</p>
              <p className="text-xs text-muted-foreground">daily allocation</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-3 pb-3">
              <p className="text-xs text-muted-foreground">Total Leads</p>
              <p className="text-xl font-bold">{totalLeads}</p>
              <p className="text-xs text-muted-foreground">{plan.hot_leads} hot, {plan.callbacks_pending} callbacks</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-3 pb-3">
              <p className="text-xs text-muted-foreground">Expected</p>
              <p className="text-xl font-bold">{plan.expected_outcomes?.appointments || '?'}</p>
              <p className="text-xs text-muted-foreground">appointments target</p>
            </CardContent>
          </Card>
        </div>

        {/* Priority Order */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Priority Order</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {(plan.priority_order || []).map((p, i) => (
                <div key={p} className="flex items-center gap-1">
                  <Badge variant={i === 0 ? 'default' : 'outline'} className="capitalize">
                    #{i + 1} {p.replace(/_/g, ' ')}
                  </Badge>
                  {i < (plan.priority_order?.length || 0) - 1 && (
                    <ChevronRight className="h-3 w-3 text-muted-foreground" />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Budget Allocation */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Budget Allocation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              { label: 'Callbacks', pct: plan.budget_for_callbacks_pct, color: 'bg-red-500' },
              { label: 'Hot Leads', pct: plan.budget_for_hot_pct, color: 'bg-orange-500' },
              { label: 'Engaged', pct: plan.budget_for_engaged_pct, color: 'bg-yellow-500' },
              { label: 'Cold/Fresh', pct: plan.budget_for_cold_pct, color: 'bg-blue-500' },
              { label: 'Reactivation', pct: plan.budget_for_reactivation_pct, color: 'bg-purple-500' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3">
                <span className="text-xs w-24 text-muted-foreground">{item.label}</span>
                <div className="flex-1">
                  <Progress value={item.pct} className="h-2" />
                </div>
                <span className="text-xs font-medium w-10 text-right">{item.pct}%</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Time Blocks */}
        {plan.time_blocks && plan.time_blocks.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Time Blocks</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {plan.time_blocks.map((block, i) => (
                  <div key={i} className="flex items-center gap-3 p-2 rounded bg-muted/50 text-sm">
                    <span className="font-mono font-medium w-14">{block.hour}:00</span>
                    <span className="flex-1 text-muted-foreground">{block.focus}</span>
                    <div className="flex items-center gap-2">
                      {block.channel === 'sms' ? (
                        <MessageSquare className="h-3 w-3 text-green-500" />
                      ) : (
                        <Phone className="h-3 w-3 text-blue-500" />
                      )}
                      <span className="text-xs font-medium">{block.pace}/min</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Risk Factors */}
        {plan.risk_factors && plan.risk_factors.length > 0 && (
          <Card className="border-l-4 border-l-yellow-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                Risk Factors
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1">
                {plan.risk_factors.map((risk, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                    <span className="text-yellow-500 mt-1">-</span>
                    {risk}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  // ---- Render Insights ----

  const renderInsights = () => {
    if (insights.length === 0) {
      return (
        <Card>
          <CardContent className="py-12 text-center">
            <Sparkles className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Patterns Discovered Yet</h3>
            <p className="text-sm text-muted-foreground">
              The AI needs 100+ calls over 30 days to start detecting patterns. Enable strategic insights in settings.
            </p>
          </CardContent>
        </Card>
      );
    }

    return (
      <ScrollArea className="h-[600px]">
        <div className="space-y-3">
          {insights.map((insight) => (
            <Card key={insight.id} className={insight.status === 'applied' ? 'border-l-4 border-l-green-500' : ''}>
              <CardContent className="pt-4">
                <div className="flex items-start gap-3">
                  <div className="mt-1">{getInsightIcon(insight.insight_type)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-medium text-sm">{insight.title}</span>
                      {getConfidenceBadge(insight.confidence)}
                      {insight.auto_rule_created && (
                        <Badge variant="default" className="text-xs">
                          <Zap className="h-3 w-3 mr-1" />
                          Rule Created
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">{insight.description}</p>
                    {insight.recommended_action && (
                      <div className="flex items-start gap-2 p-2 rounded bg-primary/5 border border-primary/10">
                        <Lightbulb className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                        <p className="text-xs">{insight.recommended_action}</p>
                      </div>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span>{insight.sample_size} data points</span>
                      {insight.effect_magnitude > 1 && (
                        <span className="text-green-600">{insight.effect_magnitude.toFixed(1)}x effect</span>
                      )}
                      <span>{formatDistanceToNow(new Date(insight.created_at), { addSuffix: true })}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </ScrollArea>
    );
  };

  // ---- Render Briefings ----

  const renderBriefings = () => {
    if (briefings.length === 0) {
      return (
        <Card>
          <CardContent className="py-12 text-center">
            <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Briefings Yet</h3>
            <p className="text-sm text-muted-foreground">
              Briefings are generated daily when strategic insights are active.
            </p>
          </CardContent>
        </Card>
      );
    }

    return (
      <ScrollArea className="h-[600px]">
        <div className="space-y-4">
          {briefings.map((briefing) => (
            <Card key={briefing.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">{briefing.headline}</CardTitle>
                    <CardDescription>
                      {briefing.briefing_type === 'daily' ? 'Daily' : 'Weekly'} Briefing - {briefing.briefing_date}
                    </CardDescription>
                  </div>
                  <Badge variant="outline">{briefing.new_insights_count} insights</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm">{briefing.executive_summary}</p>

                {briefing.wins && briefing.wins.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-green-600 mb-1">Wins</p>
                    {briefing.wins.map((win, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                        <span>{win}</span>
                      </div>
                    ))}
                  </div>
                )}

                {briefing.concerns && briefing.concerns.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-yellow-600 mb-1">Concerns</p>
                    {briefing.concerns.map((concern, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <AlertTriangle className="h-3 w-3 text-yellow-500" />
                        <span>{concern}</span>
                      </div>
                    ))}
                  </div>
                )}

                {briefing.action_items && briefing.action_items.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-primary mb-1">Action Items</p>
                    {briefing.action_items.map((item, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <ChevronRight className="h-3 w-3 text-primary" />
                        <span>{item.action}</span>
                        <Badge variant={item.priority === 'high' ? 'destructive' : 'outline'} className="text-xs">
                          {item.priority}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </ScrollArea>
    );
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-32 bg-muted rounded" />
        <div className="grid grid-cols-4 gap-3">
          <div className="h-20 bg-muted rounded" />
          <div className="h-20 bg-muted rounded" />
          <div className="h-20 bg-muted rounded" />
          <div className="h-20 bg-muted rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Campaign Strategist
          </h3>
          <p className="text-sm text-muted-foreground">
            AI-generated battle plans, pattern discovery, and strategic briefings
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="plan" className="flex items-center gap-1">
            <Target className="h-3 w-3" />
            Battle Plan
          </TabsTrigger>
          <TabsTrigger value="insights" className="flex items-center gap-1">
            <Eye className="h-3 w-3" />
            Patterns ({insights.length})
          </TabsTrigger>
          <TabsTrigger value="briefings" className="flex items-center gap-1">
            <BarChart3 className="h-3 w-3" />
            Briefings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="plan" className="mt-4">
          {renderBattlePlan()}
        </TabsContent>

        <TabsContent value="insights" className="mt-4">
          {renderInsights()}
        </TabsContent>

        <TabsContent value="briefings" className="mt-4">
          {renderBriefings()}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CampaignStrategistDashboard;
