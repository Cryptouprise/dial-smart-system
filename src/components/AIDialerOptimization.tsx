import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Brain, 
  TrendingUp, 
  Clock, 
  Target, 
  Sparkles,
  BarChart3,
  Lightbulb,
  RefreshCw
} from 'lucide-react';
import { useAIOptimizedDialer } from '@/hooks/useAIOptimizedDialer';
import { usePredictiveDialing } from '@/hooks/usePredictiveDialing';

interface AIDialerOptimizationProps {
  campaignId?: string;
}

export const AIDialerOptimization = ({ campaignId }: AIDialerOptimizationProps) => {
  const { 
    calculateOptimalRate, 
    getInsights, 
    prioritizeLeads,
    isLoading 
  } = useAIOptimizedDialer();
  
  const { getCampaigns } = usePredictiveDialing();

  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<string | undefined>(campaignId);
  const [optimalRate, setOptimalRate] = useState<any>(null);
  const [insights, setInsights] = useState<any>(null);
  const [prioritizedLeads, setPrioritizedLeads] = useState<any[]>([]);

  useEffect(() => {
    loadCampaigns();
  }, []);

  useEffect(() => {
    if (selectedCampaign) {
      loadOptimizations();
    }
  }, [selectedCampaign]);

  const loadCampaigns = async () => {
    const data = await getCampaigns();
    if (data) {
      setCampaigns(data);
      if (!selectedCampaign && data.length > 0) {
        setSelectedCampaign(data[0].id);
      }
    }
  };

  const loadOptimizations = async () => {
    if (!selectedCampaign) return;

    // Load all optimizations in parallel
    const [rateResult, insightsResult, leadsResult] = await Promise.all([
      calculateOptimalRate(selectedCampaign),
      getInsights(selectedCampaign),
      prioritizeLeads(selectedCampaign)
    ]);

    if (rateResult) setOptimalRate(rateResult);
    if (insightsResult) setInsights(insightsResult);
    if (leadsResult) setPrioritizedLeads(leadsResult);
  };

  const getConfidenceBadge = (confidence: string) => {
    const colors = {
      high: 'bg-green-500',
      medium: 'bg-yellow-500',
      low: 'bg-orange-500'
    };
    return (
      <Badge className={colors[confidence as keyof typeof colors] || 'bg-gray-500'}>
        {confidence} confidence
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold flex items-center gap-2">
            <Brain className="h-8 w-8 text-purple-500" />
            AI-Optimized Predictive Dialer
          </h2>
          <p className="text-muted-foreground">
            Machine learning-powered optimization for maximum pick-up rates
          </p>
        </div>
        <Button onClick={loadOptimizations} disabled={isLoading || !selectedCampaign}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh Analysis
        </Button>
      </div>

      {/* Campaign Selector */}
      <Card>
        <CardHeader>
          <CardTitle>Select Campaign</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {campaigns.map((campaign) => (
              <Button
                key={campaign.id}
                variant={selectedCampaign === campaign.id ? "default" : "outline"}
                onClick={() => setSelectedCampaign(campaign.id)}
              >
                {campaign.name}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {selectedCampaign && (
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">
              <Sparkles className="h-4 w-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="timing">
              <Clock className="h-4 w-4 mr-2" />
              Timing Insights
            </TabsTrigger>
            <TabsTrigger value="leads">
              <Target className="h-4 w-4 mr-2" />
              Lead Prioritization
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            {/* Optimal Dialing Rate */}
            {optimalRate && (
              <Card className="border-purple-200 dark:border-purple-800">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-purple-500" />
                    Optimal Dialing Rate
                  </CardTitle>
                  <CardDescription>
                    AI-calculated rate for best results
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-4xl font-bold text-purple-600 dark:text-purple-400">
                        {optimalRate.optimal_calls_per_minute}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        calls per minute
                      </div>
                    </div>
                    {getConfidenceBadge(optimalRate.confidence)}
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                    <div>
                      <div className="text-sm text-muted-foreground">Answer Rate</div>
                      <div className="text-2xl font-semibold">
                        {(optimalRate.answer_rate * 100).toFixed(1)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Avg Call Duration</div>
                      <div className="text-2xl font-semibold">
                        {Math.round(optimalRate.avg_call_duration / 60)}m
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t">
                    <p className="text-sm text-muted-foreground">
                      {optimalRate.recommendation}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Summary Stats */}
            {insights && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Campaign Performance
                  </CardTitle>
                  <CardDescription>
                    Overall metrics and data quality: {getConfidenceBadge(insights.summary.data_quality)}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <div className="text-sm text-muted-foreground">Total Calls</div>
                      <div className="text-2xl font-bold">
                        {insights.summary.total_calls.toLocaleString()}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="text-sm text-muted-foreground">Answered</div>
                      <div className="text-2xl font-bold text-green-600">
                        {insights.summary.answered_calls.toLocaleString()}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="text-sm text-muted-foreground">Answer Rate</div>
                      <div className="text-2xl font-bold text-blue-600">
                        {insights.summary.answer_rate}%
                      </div>
                      <Progress 
                        value={parseFloat(insights.summary.answer_rate)} 
                        className="h-2"
                      />
                    </div>
                  </div>

                  {/* AI Recommendations */}
                  <div className="mt-6 pt-6 border-t space-y-3">
                    <div className="flex items-center gap-2 font-medium">
                      <Lightbulb className="h-5 w-5 text-yellow-500" />
                      AI Recommendations
                    </div>
                    {insights.recommendations.map((rec: string, index: number) => (
                      <div key={index} className="flex items-start gap-2 text-sm">
                        <div className="rounded-full bg-purple-100 dark:bg-purple-900 p-1 mt-0.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-purple-600" />
                        </div>
                        <p className="flex-1">{rec}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="timing" className="space-y-4">
            {insights?.timing_insights && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>Best Hours to Call</CardTitle>
                    <CardDescription>
                      Peak performance hours based on historical data
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {insights.timing_insights.best_hours.map((hourData: any, index: number) => (
                        <div key={hourData.hour} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex items-center gap-3">
                            <Badge variant={index === 0 ? "default" : "secondary"}>
                              #{index + 1}
                            </Badge>
                            <div>
                              <div className="font-medium">
                                {hourData.hour}:00 - {hourData.hour + 1}:00
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {hourData.callVolume} calls made
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xl font-bold text-green-600">
                              {hourData.answerRate.toFixed(1)}%
                            </div>
                            <div className="text-xs text-muted-foreground">
                              answer rate
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Best Days to Call</CardTitle>
                    <CardDescription>
                      Most successful days of the week
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {insights.timing_insights.best_days.map((dayData: any, index: number) => (
                        <div key={dayData.day} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex items-center gap-3">
                            <Badge variant={index === 0 ? "default" : "secondary"}>
                              #{index + 1}
                            </Badge>
                            <div>
                              <div className="font-medium">{dayData.day}</div>
                              <div className="text-sm text-muted-foreground">
                                {dayData.callVolume} calls made
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xl font-bold text-green-600">
                              {dayData.answerRate.toFixed(1)}%
                            </div>
                            <div className="text-xs text-muted-foreground">
                              answer rate
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          <TabsContent value="leads" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>AI-Prioritized Leads</CardTitle>
                <CardDescription>
                  Leads ranked by predicted success probability
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {prioritizedLeads.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No leads to prioritize. Add leads to the campaign to see AI recommendations.
                    </p>
                  ) : (
                    prioritizedLeads.slice(0, 10).map((lead, index) => (
                      <div key={lead.leadId} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <Badge variant={index < 3 ? "default" : "outline"}>
                            #{index + 1}
                          </Badge>
                          <div>
                            <div className="font-mono text-sm">{lead.leadId}</div>
                            <div className="text-xs text-muted-foreground">
                              {lead.factors.callAttemptCount} previous attempts
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold">
                            {(lead.score * 100).toFixed(0)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            success score
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {!selectedCampaign && campaigns.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Brain className="h-16 w-16 text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">No Campaigns Yet</p>
            <p className="text-sm text-muted-foreground text-center">
              Create a campaign to start using AI-powered optimization
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
