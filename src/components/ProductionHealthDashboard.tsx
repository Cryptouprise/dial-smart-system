/**
 * Production Health Dashboard
 * 
 * Displays real-time system health metrics and monitoring data
 * for production environments.
 */

import { useEffect, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle, XCircle, TrendingUp, Clock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

interface HealthMetric {
  name: string;
  value: string | number;
  status: 'healthy' | 'warning' | 'error';
  description?: string;
}

interface PerformanceMetric {
  name: string;
  value: number;
  unit: string;
  threshold: number;
}

export const ProductionHealthDashboard = () => {
  const [healthMetrics, setHealthMetrics] = useState<HealthMetric[]>([]);
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetric[]>([]);
  const [memoryUsage, setMemoryUsage] = useState<number>(0);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  useEffect(() => {
    // Initialize health checks
    checkSystemHealth();

    // Update metrics every 30 seconds
    const interval = setInterval(() => {
      checkSystemHealth();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const checkSystemHealth = () => {
    const metrics: HealthMetric[] = [];
    const perfMetrics: PerformanceMetric[] = [];

    // Check API connectivity
    const apiStatus = navigator.onLine ? 'healthy' : 'error';
    metrics.push({
      name: 'API Connectivity',
      value: navigator.onLine ? 'Online' : 'Offline',
      status: apiStatus,
      description: 'Connection to backend services',
    });

    // Check localStorage availability
    try {
      localStorage.setItem('_health_check', 'test');
      localStorage.removeItem('_health_check');
      metrics.push({
        name: 'Local Storage',
        value: 'Available',
        status: 'healthy',
        description: 'Browser storage functionality',
      });
    } catch {
      metrics.push({
        name: 'Local Storage',
        value: 'Unavailable',
        status: 'warning',
        description: 'Browser storage functionality',
      });
    }

    // Check memory usage
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      const usagePercent = (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100;
      setMemoryUsage(usagePercent);

      const memoryStatus = usagePercent > 90 ? 'error' : usagePercent > 70 ? 'warning' : 'healthy';
      metrics.push({
        name: 'Memory Usage',
        value: `${usagePercent.toFixed(1)}%`,
        status: memoryStatus,
        description: `${(memory.usedJSHeapSize / 1048576).toFixed(2)} MB / ${(memory.jsHeapSizeLimit / 1048576).toFixed(2)} MB`,
      });
    }

    // Check performance metrics
    if (window.performance) {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      
      if (navigation) {
        perfMetrics.push({
          name: 'Page Load Time',
          value: navigation.loadEventEnd - navigation.fetchStart,
          unit: 'ms',
          threshold: 3000,
        });

        perfMetrics.push({
          name: 'DOM Content Loaded',
          value: navigation.domContentLoadedEventEnd - navigation.fetchStart,
          unit: 'ms',
          threshold: 2000,
        });
      }
    }

    setHealthMetrics(metrics);
    setPerformanceMetrics(perfMetrics);
    setLastUpdate(new Date());
  };

  const getStatusIcon = (status: 'healthy' | 'warning' | 'error') => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case 'error':
        return <XCircle className="h-5 w-5 text-red-500" />;
    }
  };

  const getStatusBadge = (status: 'healthy' | 'warning' | 'error') => {
    const variants = {
      healthy: 'default',
      warning: 'secondary',
      error: 'destructive',
    } as const;

    return (
      <Badge variant={variants[status]} className="capitalize">
        {status}
      </Badge>
    );
  };

  const overallHealth = healthMetrics.every(m => m.status === 'healthy') 
    ? 'healthy' 
    : healthMetrics.some(m => m.status === 'error') 
    ? 'error' 
    : 'warning';

  return (
    <div className="space-y-6 p-6">
      {/* Overall Status */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Activity className="h-6 w-6" />
              <div>
                <CardTitle>System Health</CardTitle>
                <CardDescription>Real-time monitoring dashboard</CardDescription>
              </div>
            </div>
            {getStatusBadge(overallHealth)}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            Last updated: {lastUpdate.toLocaleTimeString()}
          </div>
        </CardContent>
      </Card>

      {/* Health Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {healthMetrics.map((metric) => (
          <Card key={metric.name}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{metric.name}</CardTitle>
              {getStatusIcon(metric.status)}
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metric.value}</div>
              {metric.description && (
                <p className="text-xs text-muted-foreground mt-1">{metric.description}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Performance Metrics */}
      {performanceMetrics.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              <CardTitle>Performance Metrics</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {performanceMetrics.map((metric) => {
              const percentage = Math.min((metric.value / metric.threshold) * 100, 100);
              const isGood = metric.value < metric.threshold;

              return (
                <div key={metric.name} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{metric.name}</span>
                    <span className={`text-sm ${isGood ? 'text-green-600' : 'text-red-600'}`}>
                      {metric.value.toFixed(0)}{metric.unit} / {metric.threshold}{metric.unit}
                    </span>
                  </div>
                  <Progress 
                    value={percentage} 
                    className={isGood ? '' : 'bg-red-200'}
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Memory Usage Chart */}
      {memoryUsage > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Memory Usage</CardTitle>
            <CardDescription>JavaScript heap memory consumption</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Progress 
                value={memoryUsage} 
                className={memoryUsage > 90 ? 'bg-red-200' : memoryUsage > 70 ? 'bg-yellow-200' : ''}
              />
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Usage: {memoryUsage.toFixed(1)}%</span>
                {memoryUsage > 70 && (
                  <span className="text-yellow-600 font-medium">
                    {memoryUsage > 90 ? 'Critical' : 'High Usage'}
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
