import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Brain, TrendingUp, AlertCircle, CheckCircle, Activity } from 'lucide-react';
import { usePredictiveDialingAlgorithm } from '@/hooks/usePredictiveDialingAlgorithm';

const PredictiveDialingEngine = () => {
  const { metrics, calculatePredictiveMetrics, learnFromHistory } = usePredictiveDialingAlgorithm();
  
  const [params, setParams] = useState({
    avgCallDuration: 180, // 3 minutes
    avgAnswerRate: 40,
    avgAgentWrapTime: 30,
    availableAgents: 5,
    targetAbandonmentRate: 3
  });

  const [historicalInsights, setHistoricalInsights] = useState<any>(null);

  useEffect(() => {
    calculatePredictiveMetrics(params);
    loadInsights();
  }, [params]);

  const loadInsights = async () => {
    const insights = await learnFromHistory();
    setHistoricalInsights(insights);
  };

  const handleParamChange = (key: string, value: number) => {
    setParams({ ...params, [key]: value });
  };

  return (
    <div className="space-y-6">
      <Card className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950 dark:to-pink-950 border-purple-200 dark:border-purple-800">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Brain className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            AI Predictive Dialing Engine
          </CardTitle>
          <CardDescription className="text-slate-600 dark:text-slate-400">
            Advanced algorithms for optimal call distribution and efficiency
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Configuration Panel */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="avgCallDuration">Avg Call Duration (sec)</Label>
              <Input
                id="avgCallDuration"
                type="number"
                value={params.avgCallDuration}
                onChange={(e) => handleParamChange('avgCallDuration', parseInt(e.target.value) || 0)}
                min={0}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="avgAnswerRate">Answer Rate (%)</Label>
              <Input
                id="avgAnswerRate"
                type="number"
                value={params.avgAnswerRate}
                onChange={(e) => handleParamChange('avgAnswerRate', parseInt(e.target.value) || 0)}
                min={0}
                max={100}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="avgAgentWrapTime">Wrap Time (sec)</Label>
              <Input
                id="avgAgentWrapTime"
                type="number"
                value={params.avgAgentWrapTime}
                onChange={(e) => handleParamChange('avgAgentWrapTime', parseInt(e.target.value) || 0)}
                min={0}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="availableAgents">Available Agents</Label>
              <Input
                id="availableAgents"
                type="number"
                value={params.availableAgents}
                onChange={(e) => handleParamChange('availableAgents', parseInt(e.target.value) || 0)}
                min={0}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="targetAbandonmentRate">Target Abandonment (%)</Label>
              <Input
                id="targetAbandonmentRate"
                type="number"
                value={params.targetAbandonmentRate}
                onChange={(e) => handleParamChange('targetAbandonmentRate', parseInt(e.target.value) || 0)}
                min={0}
                max={100}
                step={0.1}
              />
            </div>
          </div>

          {/* Metrics Display */}
          {metrics && (
            <div className="space-y-4">
              {/* Recommendation Banner */}
              <div className={`p-4 rounded-lg border ${
                metrics.recommendation.includes('⚠️') 
                  ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800' 
                  : metrics.recommendation.includes('⚡')
                  ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                  : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
              }`}>
                <div className="flex items-center gap-2">
                  {metrics.recommendation.includes('⚠️') && <AlertCircle className="h-5 w-5 text-yellow-600" />}
                  {metrics.recommendation.includes('⚡') && <Activity className="h-5 w-5 text-blue-600" />}
                  {metrics.recommendation.includes('✅') && <CheckCircle className="h-5 w-5 text-green-600" />}
                  <p className="font-medium text-slate-900 dark:text-slate-100">
                    {metrics.recommendation}
                  </p>
                </div>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="bg-white dark:bg-slate-800">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">
                      Dialing Ratio
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">
                      {metrics.dialingRatio}:1
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Calls per agent
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-white dark:bg-slate-800">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">
                      Optimal Concurrency
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                      {metrics.optimalConcurrency}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Simultaneous calls
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-white dark:bg-slate-800">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">
                      Predicted Answers
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-green-600 dark:text-green-400">
                      {metrics.predictedAnswers}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Expected connections
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-white dark:bg-slate-800">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">
                      Est. Abandonments
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className={`text-3xl font-bold ${
                      metrics.estimatedAbandonments > params.targetAbandonmentRate 
                        ? 'text-red-600 dark:text-red-400' 
                        : 'text-green-600 dark:text-green-400'
                    }`}>
                      {metrics.estimatedAbandonments}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Dropped calls
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Algorithm Insights */}
              <Card className="bg-white dark:bg-slate-800">
                <CardHeader>
                  <CardTitle className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Algorithm Insights
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/50 rounded">
                    <span className="text-sm text-slate-700 dark:text-slate-300">
                      Dialing Strategy
                    </span>
                    <Badge variant={metrics.dialingRatio > 2.5 ? "default" : "secondary"}>
                      {metrics.dialingRatio > 2.5 ? "Aggressive" : metrics.dialingRatio > 1.5 ? "Moderate" : "Conservative"}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/50 rounded">
                    <span className="text-sm text-slate-700 dark:text-slate-300">
                      Efficiency Score
                    </span>
                    <Badge variant="default">
                      {Math.round((params.availableAgents / Math.max(1, metrics.optimalConcurrency)) * 100)}%
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/50 rounded">
                    <span className="text-sm text-slate-700 dark:text-slate-300">
                      Compliance Status
                    </span>
                    <Badge variant={metrics.estimatedAbandonments <= params.targetAbandonmentRate ? "default" : "destructive"}>
                      {metrics.estimatedAbandonments <= params.targetAbandonmentRate ? "✓ Compliant" : "⚠️ Risk"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              {/* Historical Performance */}
              {historicalInsights && (
                <Card className="bg-white dark:bg-slate-800">
                  <CardHeader>
                    <CardTitle className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      Historical Performance
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-600 dark:text-slate-400">Avg Answer Rate:</span>
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {historicalInsights.avgAnswerRate?.toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-600 dark:text-slate-400">Avg Abandonment:</span>
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {historicalInsights.avgAbandonmentRate?.toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-600 dark:text-slate-400">Total Calls:</span>
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {historicalInsights.totalCalls?.toLocaleString()}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Documentation Card */}
      <Card className="bg-white dark:bg-slate-800">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-slate-900 dark:text-slate-100">
            About the Algorithm
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-600 dark:text-slate-400 space-y-2">
          <p>
            Our predictive dialing algorithm is based on industry-leading approaches from VICIdial, Caller.io, and Call.io:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li><strong>Dialing Ratio:</strong> Calculated using (1 + abandon_rate) / answer_rate formula</li>
            <li><strong>Adaptive Pacing:</strong> Automatically adjusts based on agent availability</li>
            <li><strong>Abandonment Control:</strong> Ensures compliance with FCC regulations (typically 3%)</li>
            <li><strong>Agent Utilization:</strong> Targets 85% efficiency for optimal performance</li>
            <li><strong>Historical Learning:</strong> Improves accuracy over time using past performance data</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
};

export default PredictiveDialingEngine;
