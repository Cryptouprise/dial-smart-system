import React, { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  CheckCircle,
  Clock,
  Activity,
  BarChart3,
  Zap,
  Target,
  Users,
  Phone,
  Calendar,
  Award,
  Sparkles,
  ArrowRight,
  TrendingDown as Decline
} from 'lucide-react';
import { usePipelineAnalytics } from '@/hooks/usePipelineAnalytics';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const LEAD_ID_DISPLAY_LENGTH = 8;

const EnhancedPipelineAnalytics: React.FC = () => {
  const { metrics, movements, isAnalyzing, analyzePipeline } = usePipelineAnalytics();

  // Generate mock time series data for charts
  const timeSeriesData = useMemo(() => {
    if (!metrics) return [];
    
    return [
      { day: 'Mon', leads: 45, converted: 12, velocity: 8 },
      { day: 'Tue', leads: 52, converted: 15, velocity: 10 },
      { day: 'Wed', leads: 48, converted: 11, velocity: 9 },
      { day: 'Thu', leads: 61, converted: 18, velocity: 12 },
      { day: 'Fri', leads: 55, converted: 16, velocity: 11 },
      { day: 'Sat', leads: 38, converted: 9, velocity: 6 },
      { day: 'Sun', leads: 42, converted: 10, velocity: 7 },
    ];
  }, [metrics]);

  // Generate stage distribution data
  const stageDistribution = useMemo(() => {
    if (!metrics?.stageMetrics) return [];
    
    return Object.entries(metrics.stageMetrics).map(([stage, data]: [string, any]) => ({
      name: stage.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      value: data.count,
      avgTime: data.avgTimeInStage
    }));
  }, [metrics]);

  const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f97316', '#14b8a6', '#06b6d4'];

  if (isAnalyzing && !metrics) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center space-y-4">
          <div className="relative">
            <div className="w-20 h-20 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto"></div>
            <BarChart3 className="h-8 w-8 text-indigo-600 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          </div>
          <div>
            <p className="text-xl font-bold text-slate-900 dark:text-slate-100">Analyzing Pipeline Performance</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">Crunching the numbers with AI...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <Card className="border-2 border-dashed border-slate-300 dark:border-slate-700">
        <CardContent className="py-16 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
            <BarChart3 className="h-8 w-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">No Pipeline Data Available</h3>
          <p className="text-slate-500 dark:text-slate-400 mb-4">Add leads to your pipeline to see powerful analytics and insights</p>
          <Button onClick={analyzePipeline} className="bg-gradient-to-r from-indigo-600 to-purple-600">
            <Sparkles className="h-4 w-4 mr-2" />
            Analyze Pipeline
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero Stats */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 p-1">
        <div className="bg-slate-900/90 backdrop-blur-xl rounded-xl p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                <BarChart3 className="h-8 w-8" />
                Pipeline Intelligence
              </h1>
              <p className="text-indigo-200 mt-1">Real-time analytics and performance insights</p>
            </div>
            <Button 
              onClick={analyzePipeline}
              size="lg"
              className="bg-white/20 hover:bg-white/30 text-white border-2 border-white/40 backdrop-blur-sm"
            >
              <Activity className="h-4 w-4 mr-2 animate-pulse" />
              Refresh Analytics
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Total Leads */}
            <div className="relative overflow-hidden bg-white/10 backdrop-blur-sm rounded-2xl p-6 border-2 border-white/20 hover:bg-white/15 transition-all group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/20 rounded-full blur-3xl group-hover:scale-150 transition-transform"></div>
              <div className="relative">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-3 bg-blue-500/20 rounded-xl">
                    <Users className="h-6 w-6 text-blue-300" />
                  </div>
                  <span className="text-blue-200 text-sm font-medium">Total Leads</span>
                </div>
                <div className="text-4xl font-bold text-white mb-2">{metrics.totalLeads}</div>
                <div className="flex items-center gap-2">
                  {metrics.velocityTrend === 'increasing' && (
                    <Badge className="bg-green-500/20 text-green-300 border-green-400/30">
                      <TrendingUp className="h-3 w-3 mr-1" />
                      Growing
                    </Badge>
                  )}
                  {metrics.velocityTrend === 'decreasing' && (
                    <Badge className="bg-red-500/20 text-red-300 border-red-400/30">
                      <TrendingDown className="h-3 w-3 mr-1" />
                      Declining
                    </Badge>
                  )}
                  {metrics.velocityTrend === 'stable' && (
                    <Badge className="bg-gray-500/20 text-gray-300 border-gray-400/30">Stable</Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Conversion Rate */}
            <div className="relative overflow-hidden bg-white/10 backdrop-blur-sm rounded-2xl p-6 border-2 border-white/20 hover:bg-white/15 transition-all group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/20 rounded-full blur-3xl group-hover:scale-150 transition-transform"></div>
              <div className="relative">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-3 bg-purple-500/20 rounded-xl">
                    <Target className="h-6 w-6 text-purple-300" />
                  </div>
                  <span className="text-purple-200 text-sm font-medium">Conversion Rate</span>
                </div>
                <div className="text-4xl font-bold text-white mb-2">{metrics.conversionRate}%</div>
                <Progress 
                  value={metrics.conversionRate} 
                  className="h-2 bg-white/20"
                />
              </div>
            </div>

            {/* Avg Time in Pipeline */}
            <div className="relative overflow-hidden bg-white/10 backdrop-blur-sm rounded-2xl p-6 border-2 border-white/20 hover:bg-white/15 transition-all group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-pink-500/20 rounded-full blur-3xl group-hover:scale-150 transition-transform"></div>
              <div className="relative">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-3 bg-pink-500/20 rounded-xl">
                    <Clock className="h-6 w-6 text-pink-300" />
                  </div>
                  <span className="text-pink-200 text-sm font-medium">Avg Time</span>
                </div>
                <div className="text-4xl font-bold text-white mb-2">{metrics.averageTimeInPipeline}</div>
                <span className="text-pink-200 text-sm">in pipeline</span>
              </div>
            </div>

            {/* Pipeline Velocity */}
            <div className="relative overflow-hidden bg-white/10 backdrop-blur-sm rounded-2xl p-6 border-2 border-white/20 hover:bg-white/15 transition-all group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/20 rounded-full blur-3xl group-hover:scale-150 transition-transform"></div>
              <div className="relative">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-3 bg-orange-500/20 rounded-xl">
                    <Zap className="h-6 w-6 text-orange-300" />
                  </div>
                  <span className="text-orange-200 text-sm font-medium">Velocity</span>
                </div>
                <div className="text-4xl font-bold text-white mb-2">
                  {movements?.length || 0}
                  <span className="text-xl text-orange-200 ml-2">/day</span>
                </div>
                <span className="text-orange-200 text-sm">leads moved</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Analytics Tabs */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-grid p-1 bg-slate-100 dark:bg-slate-800">
          <TabsTrigger value="overview" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="performance" className="gap-2">
            <TrendingUp className="h-4 w-4" />
            Performance
          </TabsTrigger>
          <TabsTrigger value="stages" className="gap-2">
            <Activity className="h-4 w-4" />
            Stages
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Lead Trend Chart */}
            <Card className="border-2 hover:border-indigo-400 transition-colors">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-indigo-600" />
                  Lead Trend (7 Days)
                </CardTitle>
                <CardDescription>Daily lead acquisition and conversion</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={timeSeriesData}>
                    <defs>
                      <linearGradient id="colorLeads" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorConverted" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="day" stroke="#64748b" />
                    <YAxis stroke="#64748b" />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#fff', border: '2px solid #e2e8f0', borderRadius: '12px' }}
                    />
                    <Legend />
                    <Area 
                      type="monotone" 
                      dataKey="leads" 
                      stroke="#6366f1" 
                      strokeWidth={3}
                      fillOpacity={1} 
                      fill="url(#colorLeads)" 
                      name="Total Leads"
                    />
                    <Area 
                      type="monotone" 
                      dataKey="converted" 
                      stroke="#10b981" 
                      strokeWidth={3}
                      fillOpacity={1} 
                      fill="url(#colorConverted)" 
                      name="Converted"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Stage Distribution */}
            <Card className="border-2 hover:border-purple-400 transition-colors">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-purple-600" />
                  Stage Distribution
                </CardTitle>
                <CardDescription>Leads across pipeline stages</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={stageDistribution}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {stageDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#fff', border: '2px solid #e2e8f0', borderRadius: '12px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Velocity Chart */}
          <Card className="border-2 hover:border-pink-400 transition-colors">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-pink-600" />
                Pipeline Velocity
              </CardTitle>
              <CardDescription>Lead movement speed across the week</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={timeSeriesData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="day" stroke="#64748b" />
                  <YAxis stroke="#64748b" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#fff', border: '2px solid #e2e8f0', borderRadius: '12px' }}
                  />
                  <Bar dataKey="velocity" fill="#ec4899" radius={[8, 8, 0, 0]} name="Leads Moved" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Performance Tab */}
        <TabsContent value="performance" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Top Performers */}
            {metrics.bottlenecks?.map((bottleneck, idx) => {
              const severity = bottleneck.averageDwellTime > 14 ? 'high' : bottleneck.averageDwellTime > 7 ? 'medium' : 'low';
              return (
                <Card key={idx} className="border-2 hover:shadow-lg transition-all">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{bottleneck.stageName}</CardTitle>
                      {severity === 'high' && (
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Critical
                        </Badge>
                      )}
                      {severity === 'medium' && (
                        <Badge variant="secondary" className="bg-yellow-100 text-yellow-700 gap-1">
                          <Clock className="h-3 w-3" />
                          Moderate
                        </Badge>
                      )}
                      {severity === 'low' && (
                        <Badge variant="outline" className="gap-1">
                          <CheckCircle className="h-3 w-3" />
                          Good
                        </Badge>
                      )}
                    </div>
                    <CardDescription className="mt-2">{bottleneck.suggestedAction}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600 dark:text-slate-400">Avg Time:</span>
                        <span className="font-semibold">{bottleneck.averageDwellTime} days</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600 dark:text-slate-400">Lead Count:</span>
                        <span className="font-semibold">{bottleneck.leadsStuck}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* Stages Tab */}
        <TabsContent value="stages" className="space-y-6">
          <div className="grid gap-4">
            {Object.entries(metrics.stageMetrics || {}).map(([stage, data]: [string, any]) => (
              <Card key={stage} className="border-2 hover:border-indigo-400 transition-all">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg capitalize">
                      {stage.replace(/_/g, ' ')}
                    </CardTitle>
                    <Badge className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 font-semibold">
                      {data.count} leads
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                        <Clock className="h-4 w-4" />
                        Average Time in Stage
                      </div>
                      <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                        {data.avgTimeInStage}
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                        <TrendingUp className="h-4 w-4" />
                        Conversion to Next
                      </div>
                      <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                        {data.conversionRate || 0}%
                      </div>
                      <Progress value={data.conversionRate || 0} className="h-2" />
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                        <Activity className="h-4 w-4" />
                        Activity Level
                      </div>
                      <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                        {data.activityScore || 'N/A'}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Recent Movements */}
      {movements && movements.length > 0 && (
        <Card className="border-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-indigo-600" />
              Recent Pipeline Activity
            </CardTitle>
            <CardDescription>Latest lead movements across stages</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {movements.slice(0, 10).map((movement, idx) => (
                <div 
                  key={idx}
                  className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <div className="flex items-center gap-4 flex-1">
                    <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
                      <ArrowRight className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        Lead #{movement.leadId?.substring(0, LEAD_ID_DISPLAY_LENGTH)}
                      </div>
                      <div className="text-sm text-slate-600 dark:text-slate-400">
                        {movement.fromStage} → {movement.toStage}
                      </div>
                    </div>
                  </div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">
                    {movement.movedAt ? new Date(movement.movedAt).toLocaleDateString() : 'N/A'}
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

export default EnhancedPipelineAnalytics;
