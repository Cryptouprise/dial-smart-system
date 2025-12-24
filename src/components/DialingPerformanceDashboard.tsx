import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { 
  TrendingUp, 
  TrendingDown, 
  Target, 
  Phone, 
  Clock, 
  Users,
  Activity,
  Zap,
  AlertTriangle
} from 'lucide-react';
import { usePredictiveDialingAlgorithm } from '@/hooks/usePredictiveDialingAlgorithm';
import { useConcurrencyManager } from '@/hooks/useConcurrencyManager';

const DialingPerformanceDashboard = () => {
  const { historicalData, learnFromHistory } = usePredictiveDialingAlgorithm();
  const { activeCalls, calculateDialingRate } = useConcurrencyManager();
  
  const [realTimeMetrics, setRealTimeMetrics] = useState({
    currentConcurrency: 0,
    utilizationRate: 0,
    answerRate: 0,
    abandonmentRate: 0,
    avgWaitTime: 0,
    callsPerMinute: 0
  });

  const [performanceScore, setPerformanceScore] = useState(0);
  const [chartData, setChartData] = useState<any[]>([]);

  const loadMetrics = useCallback(async () => {
    const dialingRate = await calculateDialingRate();
    const insights = await learnFromHistory();
    
    // Calculate real-time metrics
    const metrics = {
      currentConcurrency: dialingRate.currentConcurrency,
      utilizationRate: dialingRate.utilizationRate,
      answerRate: insights?.avgAnswerRate || 0,
      abandonmentRate: insights?.avgAbandonmentRate || 0,
      avgWaitTime: 0, // Would come from call logs
      callsPerMinute: dialingRate.recommendedRate
    };
    
    setRealTimeMetrics(metrics);
    
    // Calculate performance score (0-100)
    const score = calculatePerformanceScore(metrics);
    setPerformanceScore(score);
    
    // Prepare chart data from historical stats
    if (historicalData && historicalData.length > 0) {
      const last10 = historicalData.slice(0, 10).reverse().map((stat, index) => ({
        time: new Date(stat.timestamp).toLocaleTimeString('en-US', { 
          hour: 'numeric', 
          minute: '2-digit' 
        }),
        answerRate: stat.answer_rate || 0,
        abandonmentRate: stat.abandonment_rate || 0,
        concurrent: stat.concurrent_calls || 0
      }));
      setChartData(last10);
    }
  }, [calculateDialingRate, learnFromHistory, historicalData]);

  useEffect(() => {
    loadMetrics();
    
    // Update metrics every 5 seconds
    const interval = setInterval(() => {
      loadMetrics();
    }, 5000);
    
    return () => clearInterval(interval);
  }, [loadMetrics]);

  const calculatePerformanceScore = (metrics: any): number => {
    let score = 0;
    
    // Answer rate component (40 points max)
    score += Math.min((metrics.answerRate / 50) * 40, 40);
    
    // Abandonment rate component (30 points max, inverse - lower is better)
    score += Math.max(0, 30 - (metrics.abandonmentRate * 10));
    
    // Utilization component (30 points max)
    const idealUtilization = 80; // 80% is ideal
    const utilizationDiff = Math.abs(idealUtilization - metrics.utilizationRate);
    score += Math.max(0, 30 - utilizationDiff / 3);
    
    return Math.round(Math.min(100, Math.max(0, score)));
  };

  const getPerformanceColor = (score: number) => {
    if (score >= 80) return 'text-green-600 dark:text-green-400';
    if (score >= 60) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getPerformanceBadge = (score: number) => {
    if (score >= 80) return { variant: 'default' as const, label: 'Excellent' };
    if (score >= 60) return { variant: 'secondary' as const, label: 'Good' };
    return { variant: 'destructive' as const, label: 'Needs Improvement' };
  };

  return (
    <div className="space-y-6">
      {/* Performance Score Card */}
      <Card className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950 dark:to-purple-950 border-indigo-200 dark:border-indigo-800">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Dialing Performance Score
          </CardTitle>
          <CardDescription className="text-slate-600 dark:text-slate-400">
            Real-time efficiency and effectiveness metrics
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <div className={`text-6xl font-bold ${getPerformanceColor(performanceScore)}`}>
                {performanceScore}
              </div>
              <div>
                <Badge {...getPerformanceBadge(performanceScore)}>
                  {getPerformanceBadge(performanceScore).label}
                </Badge>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  Out of 100
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {performanceScore >= 80 && (
                <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                  <TrendingUp className="h-5 w-5" />
                  <span className="text-sm font-medium">Performing Above Target</span>
                </div>
              )}
              {performanceScore < 60 && (
                <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
                  <AlertTriangle className="h-5 w-5" />
                  <span className="text-sm font-medium">Performance Below Target</span>
                </div>
              )}
            </div>
          </div>
          <Progress value={performanceScore} className="h-3" />
        </CardContent>
      </Card>

      {/* Real-Time Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="bg-white dark:bg-slate-800">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <CardTitle className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Active Calls
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {realTimeMetrics.currentConcurrency}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-slate-800">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-green-600 dark:text-green-400" />
              <CardTitle className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Answer Rate
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {realTimeMetrics.answerRate.toFixed(1)}%
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-slate-800">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
              <CardTitle className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Abandonment
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${
              realTimeMetrics.abandonmentRate > 3 
                ? 'text-red-600 dark:text-red-400' 
                : 'text-green-600 dark:text-green-400'
            }`}>
              {realTimeMetrics.abandonmentRate.toFixed(1)}%
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-slate-800">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              <CardTitle className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Utilization
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {realTimeMetrics.utilizationRate}%
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-slate-800">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
              <CardTitle className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Calls/Min
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {realTimeMetrics.callsPerMinute}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-slate-800">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              <CardTitle className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Avg Wait
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {realTimeMetrics.avgWaitTime}s
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Performance Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Answer Rate Trend */}
        <Card className="bg-white dark:bg-slate-800">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Answer Rate Trend
            </CardTitle>
            <CardDescription className="text-slate-600 dark:text-slate-400">
              Last 10 intervals
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis 
                  dataKey="time" 
                  stroke="#64748b"
                  style={{ fontSize: '12px' }}
                />
                <YAxis 
                  stroke="#64748b"
                  style={{ fontSize: '12px' }}
                />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px'
                  }}
                />
                <Area 
                  type="monotone" 
                  dataKey="answerRate" 
                  stroke="#10b981" 
                  fill="#d1fae5"
                  name="Answer Rate %"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Concurrent Calls & Abandonment */}
        <Card className="bg-white dark:bg-slate-800">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Concurrent Calls & Abandonment
            </CardTitle>
            <CardDescription className="text-slate-600 dark:text-slate-400">
              Performance correlation
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis 
                  dataKey="time" 
                  stroke="#64748b"
                  style={{ fontSize: '12px' }}
                />
                <YAxis 
                  stroke="#64748b"
                  style={{ fontSize: '12px' }}
                />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px'
                  }}
                />
                <Line 
                  type="monotone" 
                  dataKey="concurrent" 
                  stroke="#3b82f6" 
                  strokeWidth={2}
                  name="Concurrent Calls"
                />
                <Line 
                  type="monotone" 
                  dataKey="abandonmentRate" 
                  stroke="#ef4444" 
                  strokeWidth={2}
                  name="Abandonment %"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Performance Insights */}
      <Card className="bg-white dark:bg-slate-800">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Performance Insights & Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {realTimeMetrics.answerRate < 30 && (
            <div className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-900 dark:text-red-100">
                  Low Answer Rate Detected
                </p>
                <p className="text-xs text-red-700 dark:text-red-300 mt-1">
                  Consider adjusting call timing, improving lead quality, or enabling local presence dialing.
                </p>
              </div>
            </div>
          )}

          {realTimeMetrics.abandonmentRate > 3 && (
            <div className="flex items-start gap-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-yellow-900 dark:text-yellow-100">
                  High Abandonment Rate
                </p>
                <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
                  Reduce dialing ratio or increase agent count to maintain FCC compliance (target &lt;3%).
                </p>
              </div>
            </div>
          )}

          {realTimeMetrics.utilizationRate < 50 && (
            <div className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <TrendingUp className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                  Low System Utilization
                </p>
                <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                  Increase concurrent call limit or dialing rate to improve efficiency and throughput.
                </p>
              </div>
            </div>
          )}

          {performanceScore >= 80 && (
            <div className="flex items-start gap-3 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <Target className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-green-900 dark:text-green-100">
                  Excellent Performance
                </p>
                <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                  System is performing optimally. Maintain current settings and monitor for consistency.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default DialingPerformanceDashboard;
