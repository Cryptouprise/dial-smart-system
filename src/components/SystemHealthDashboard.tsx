
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle, AlertTriangle, Clock, Database, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import GuardianStatusWidget from '@/components/GuardianStatusWidget';

interface SystemHealth {
  overall_status: 'healthy' | 'degraded' | 'critical';
  services: Array<{
    service: string;
    status: 'online' | 'offline' | 'degraded';
    response_time: number;
    error?: string;
  }>;
  checked_at: string;
}

const SystemHealthDashboard = () => {
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const runHealthCheck = async () => {
    setIsLoading(true);
    try {
      console.log('Running system health check...');
      
      const { data, error } = await supabase.functions.invoke('system-health-monitor', {
        method: 'POST'
      });

      if (error) throw error;

      setSystemHealth(data);
      
      toast({
        title: "Health Check Complete",
        description: `System status: ${data.overall_status}`,
        variant: data.overall_status === 'critical' ? 'destructive' : 'default'
      });
      
    } catch (error) {
      console.error('Health check failed:', error);
      toast({
        title: "Health Check Failed",
        description: "Unable to complete system health check",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadRecentHealthData = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('system-health-monitor', {
        method: 'GET'
      });

      if (error) throw error;

      if (data.current_status) {
        // Transform current status data to match SystemHealth interface
        const services = Object.entries(data.current_status).map(([service, log]: [string, any]) => ({
          service,
          status: log.status,
          response_time: log.response_time_ms || 0,
          error: log.error_message
        }));

        const overallStatus = services.every(s => s.status === 'online') 
          ? 'healthy' 
          : services.some(s => s.status === 'offline') 
          ? 'critical' 
          : 'degraded';

        setSystemHealth({
          overall_status: overallStatus,
          services,
          checked_at: data.recent_logs[0]?.created_at || new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('Failed to load health data:', error);
    }
  };

  useEffect(() => {
    loadRecentHealthData();
    
    // Auto-refresh every 5 minutes
    const interval = setInterval(loadRecentHealthData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'online':
      case 'healthy':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'degraded':
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
      case 'offline':
      case 'critical':
        return <AlertTriangle className="h-4 w-4 text-red-600" />;
      default:
        return <Clock className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online':
      case 'healthy':
        return 'default';
      case 'degraded':
        return 'secondary';
      case 'offline':
      case 'critical':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  return (
    <Card className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border-slate-200 dark:border-slate-700">
      <CardHeader className="px-3 sm:px-6 py-3 sm:py-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-slate-100 text-sm sm:text-base lg:text-lg">
              <Database className="h-4 w-4 sm:h-5 sm:w-5" />
              System Health
            </CardTitle>
            <CardDescription className="text-slate-600 dark:text-slate-400 text-xs sm:text-sm">
              Real-time system status and monitoring
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={runHealthCheck}
            disabled={isLoading}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            {isLoading ? 'Checking...' : 'Check Now'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-3 sm:px-6">
        {systemHealth ? (
          <div className="space-y-4">
            {/* Overall Status */}
            <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg border">
              <div className="flex items-center gap-2">
                {getStatusIcon(systemHealth.overall_status)}
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Overall Status
                </span>
              </div>
              <Badge variant={getStatusColor(systemHealth.overall_status)} className="text-xs">
                {systemHealth.overall_status.toUpperCase()}
              </Badge>
            </div>

            {/* Individual Services */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {systemHealth.services.map((service) => (
                <div 
                  key={service.service}
                  className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {getStatusIcon(service.status)}
                    <span className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 truncate">
                      {service.service.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </span>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant={getStatusColor(service.status)} className="text-xs">
                      {service.status}
                    </Badge>
                    {service.response_time && (
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {service.response_time}ms
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Last Check Time */}
            <div className="text-center">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Last checked: {new Date(systemHealth.checked_at).toLocaleString()}
              </span>
            </div>

            {/* Guardian Error Shield */}
            <div className="mt-4">
              <GuardianStatusWidget />
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              Click "Check Now" to run system health check
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SystemHealthDashboard;
