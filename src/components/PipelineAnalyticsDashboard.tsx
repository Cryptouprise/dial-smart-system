import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  CheckCircle,
  Clock,
  Activity,
  BarChart3
} from 'lucide-react';
import { usePipelineAnalytics } from '@/hooks/usePipelineAnalytics';

const PipelineAnalyticsDashboard: React.FC = () => {
  const { metrics, movements, isAnalyzing, analyzePipeline } = usePipelineAnalytics();

  if (isAnalyzing && !metrics) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <div className="text-center">
            <Activity className="h-12 w-12 animate-spin text-slate-400 mx-auto mb-4" />
            <p className="text-slate-600 dark:text-slate-400">Analyzing pipeline performance...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!metrics) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-slate-500">
          No pipeline data available. Add leads to your pipeline to see analytics.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">
              Total Leads
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-900 dark:text-slate-100">
              {metrics.totalLeads}
            </div>
            <div className="flex items-center gap-2 mt-2">
              {metrics.velocityTrend === 'increasing' && (
                <Badge variant="default" className="gap-1">
                  <TrendingUp className="h-3 w-3" />
                  Increasing
                </Badge>
              )}
              {metrics.velocityTrend === 'decreasing' && (
                <Badge variant="destructive" className="gap-1">
                  <TrendingDown className="h-3 w-3" />
                  Decreasing
                </Badge>
              )}
              {metrics.velocityTrend === 'stable' && (
                <Badge variant="secondary">Stable</Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">
              Conversion Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-900 dark:text-slate-100">
              {metrics.conversionRate}%
            </div>
            <Progress 
              value={metrics.conversionRate} 
              className="mt-2 h-2"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400 flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Avg Time in Pipeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-900 dark:text-slate-100">
              {metrics.averageTimeInPipeline} days
            </div>
            <p className="text-xs text-slate-500 mt-2">
              {metrics.averageTimeInPipeline < 7 ? 'Fast-moving' : 
               metrics.averageTimeInPipeline < 14 ? 'Normal pace' : 'Needs attention'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Bottlenecks Alert */}
      {metrics.bottlenecks.length > 0 && (
        <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950 dark:border-orange-800">
          <CardHeader>
            <CardTitle className="text-orange-900 dark:text-orange-100 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Pipeline Bottlenecks Detected ({metrics.bottlenecks.length})
            </CardTitle>
            <CardDescription className="text-orange-700 dark:text-orange-300">
              These stages need attention to improve pipeline flow
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {metrics.bottlenecks.map(bottleneck => (
              <div 
                key={bottleneck.stageId}
                className="p-4 bg-white dark:bg-slate-900 rounded-lg border border-orange-200 dark:border-orange-800"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h4 className="font-semibold text-slate-900 dark:text-slate-100">
                      {bottleneck.stageName}
                    </h4>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {bottleneck.leadsStuck} leads • {bottleneck.averageDwellTime} days avg
                    </p>
                  </div>
                  <Badge variant="destructive">Action Needed</Badge>
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-300 mt-2">
                  💡 {bottleneck.suggestedAction}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Stage Performance */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Stage Performance
              </CardTitle>
              <CardDescription>
                Detailed metrics for each pipeline stage
              </CardDescription>
            </div>
            <Button 
              onClick={() => analyzePipeline()} 
              variant="outline"
              size="sm"
              disabled={isAnalyzing}
            >
              {isAnalyzing ? 'Analyzing...' : 'Refresh'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {metrics.stageMetrics.map(stage => (
              <div 
                key={stage.stageId}
                className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h4 className="font-semibold text-slate-900 dark:text-slate-100">
                      {stage.stageName}
                    </h4>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {stage.leadCount} leads
                    </p>
                  </div>
                  {stage.conversionRate > 70 ? (
                    <Badge variant="default" className="gap-1">
                      <CheckCircle className="h-3 w-3" />
                      Performing Well
                    </Badge>
                  ) : stage.conversionRate > 40 ? (
                    <Badge variant="secondary">Average</Badge>
                  ) : (
                    <Badge variant="destructive">Needs Improvement</Badge>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-slate-500">Conversion Rate</span>
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      {stage.conversionRate}%
                    </div>
                    <Progress 
                      value={stage.conversionRate} 
                      className="mt-1 h-1"
                    />
                  </div>

                  <div>
                    <span className="text-slate-500">Avg Dwell Time</span>
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      {stage.averageDwellTime} days
                    </div>
                  </div>

                  <div>
                    <span className="text-slate-500">Drop-off Rate</span>
                    <div className={`font-semibold ${
                      stage.dropOffRate > 30 ? 'text-red-600' : 'text-green-600'
                    }`}>
                      {stage.dropOffRate}%
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent Movements */}
      {movements.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Lead Movements</CardTitle>
            <CardDescription>
              Last {movements.length} movements in the past 7 days
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {movements.slice(0, 10).map((movement, index) => (
                <div 
                  key={`${movement.leadId}-${index}`}
                  className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg text-sm"
                >
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="font-mono text-xs">
                      {movement.leadId.slice(0, 8)}
                    </Badge>
                    <span className="text-slate-600 dark:text-slate-400">
                      {movement.fromStage}
                    </span>
                    <span className="text-slate-400">→</span>
                    <span className="font-medium text-slate-900 dark:text-slate-100">
                      {movement.toStage}
                    </span>
                  </div>
                  <div className="text-slate-500 flex items-center gap-2">
                    <Clock className="h-3 w-3" />
                    {movement.dwellTime} days
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default PipelineAnalyticsDashboard;
