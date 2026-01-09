/**
 * Lady Jarvis Monitor Component
 * 
 * Displays the health status of the Lady Jarvis autonomous monitoring system.
 * Shows last health check, current score, next scheduled check, and issues.
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Brain, 
  CheckCircle, 
  AlertTriangle, 
  XCircle, 
  Clock, 
  PlayCircle,
  Loader2,
  Info
} from 'lucide-react';
import { computeHealthScore, getNextCheckDate, MonitoringIssue } from '@/lib/monitoringScheduler';

interface HealthCheckData {
  lastCheck: Date | null;
  healthScore: number;
  nextCheck: Date | null;
  issues: MonitoringIssue[];
}

export const LadyJarvisMonitor = () => {
  const [healthData, setHealthData] = useState<HealthCheckData>({
    lastCheck: null,
    healthScore: 100,
    nextCheck: null,
    issues: []
  });
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    // Load health data from localStorage
    loadHealthData();
  }, []);

  const loadHealthData = () => {
    try {
      const stored = localStorage.getItem('lady_jarvis_health');
      if (stored) {
        const parsed = JSON.parse(stored);
        setHealthData({
          lastCheck: parsed.lastCheck ? new Date(parsed.lastCheck) : null,
          healthScore: parsed.healthScore || 100,
          nextCheck: parsed.nextCheck ? new Date(parsed.nextCheck) : null,
          issues: parsed.issues || []
        });
      } else {
        // Initialize with next check date
        const nextCheck = getNextCheckDate(100);
        setHealthData(prev => ({ ...prev, nextCheck }));
      }
    } catch (error) {
      console.error('Error loading Lady Jarvis health data:', error);
    }
  };

  const runHealthCheck = async () => {
    setIsRunning(true);
    
    try {
      // Simulate health check (in production, this would call actual monitoring)
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Example: collect mock issues
      const mockIssues: MonitoringIssue[] = [];
      
      // Calculate health score based on issues
      const score = computeHealthScore(mockIssues);
      const now = new Date();
      const nextCheck = getNextCheckDate(score, now);
      
      const newHealthData: HealthCheckData = {
        lastCheck: now,
        healthScore: score,
        nextCheck,
        issues: mockIssues
      };
      
      setHealthData(newHealthData);
      
      // Save to localStorage
      localStorage.setItem('lady_jarvis_health', JSON.stringify({
        lastCheck: now.toISOString(),
        healthScore: score,
        nextCheck: nextCheck.toISOString(),
        issues: mockIssues
      }));
      
    } catch (error) {
      console.error('Error running health check:', error);
    } finally {
      setIsRunning(false);
    }
  };

  const getHealthStatusColor = (score: number) => {
    if (score >= 90) return 'text-green-600';
    if (score >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getHealthStatusBadge = (score: number) => {
    if (score >= 90) return <Badge variant="default">Healthy</Badge>;
    if (score >= 70) return <Badge variant="secondary">Warning</Badge>;
    return <Badge variant="destructive">Critical</Badge>;
  };

  const formatDateTime = (date: Date | null) => {
    if (!date) return 'Never';
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getIssueIcon = (type: string) => {
    switch (type) {
      case 'critical':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'info':
        return <Info className="h-4 w-4 text-blue-500" />;
      default:
        return <CheckCircle className="h-4 w-4 text-green-500" />;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Brain className="h-6 w-6 text-primary" />
            <div>
              <CardTitle>Lady Jarvis Monitoring</CardTitle>
              <CardDescription>Autonomous system health monitoring</CardDescription>
            </div>
          </div>
          <Button
            onClick={runHealthCheck}
            disabled={isRunning}
            variant="outline"
          >
            {isRunning ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Running...
              </>
            ) : (
              <>
                <PlayCircle className="h-4 w-4 mr-2" />
                Run Check Now
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Health Score */}
        <div className="flex items-center justify-between p-4 border rounded-lg">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Current Health Score</p>
            <p className={`text-3xl font-bold ${getHealthStatusColor(healthData.healthScore)}`}>
              {healthData.healthScore}/100
            </p>
          </div>
          {getHealthStatusBadge(healthData.healthScore)}
        </div>

        {/* Timestamps */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 border rounded-lg">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
              <CheckCircle className="h-4 w-4" />
              Last Health Check
            </div>
            <p className="text-sm font-medium">
              {formatDateTime(healthData.lastCheck)}
            </p>
          </div>
          <div className="p-4 border rounded-lg">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
              <Clock className="h-4 w-4" />
              Next Scheduled Check
            </div>
            <p className="text-sm font-medium">
              {formatDateTime(healthData.nextCheck)}
            </p>
          </div>
        </div>

        {/* Issues List */}
        {healthData.issues.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-semibold">Current Issues</p>
            <div className="space-y-2">
              {healthData.issues.map((issue, index) => (
                <div
                  key={index}
                  className="flex items-start gap-3 p-3 border rounded-lg bg-card"
                >
                  {getIssueIcon(issue.type)}
                  <div className="flex-1">
                    <p className="text-sm font-medium capitalize">{issue.type}</p>
                    <p className="text-xs text-muted-foreground">
                      Issue details would appear here
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              All systems operational. No issues detected.
            </AlertDescription>
          </Alert>
        )}

        {/* Information */}
        <div className="text-xs text-muted-foreground">
          <p>
            Lady Jarvis automatically monitors system health and adjusts check frequency
            based on the current health score. Healthy systems are checked less frequently.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
