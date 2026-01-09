/**
 * System Testing Hub
 * 
 * Consolidated monitoring and testing dashboard for enterprise operations.
 * Displays health checks, production metrics, and system status.
 */

import React from 'react';
import { Activity, Shield, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SystemHealthCheck } from '@/components/SystemHealthCheck';
import { ProductionHealthDashboard } from '@/components/ProductionHealthDashboard';
import { LadyJarvisMonitor } from '@/components/LadyJarvisMonitor';
import Navigation from '@/components/Navigation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuth } from '@/contexts/AuthContext';

const SystemTestingHub = () => {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">System Testing Hub</h1>
          <p className="text-muted-foreground">
            Comprehensive monitoring, health checks, and system diagnostics
          </p>
        </div>

        {/* What's New Section */}
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>What's New - Enterprise Features</AlertTitle>
          <AlertDescription>
            <ul className="list-disc list-inside space-y-1 mt-2">
              <li>Multi-tenancy support with organization management</li>
              <li>Real-time production health monitoring</li>
              <li>Comprehensive system health checks across all integrations</li>
              <li>Lady Jarvis autonomous monitoring system</li>
              <li>Edge function error tracking and resolution</li>
            </ul>
          </AlertDescription>
        </Alert>

        {/* Admin Status */}
        {user && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Admin Status
              </CardTitle>
              <CardDescription>Current user and permissions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Email:</span>
                  <span className="text-sm text-muted-foreground">{user.email}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">User ID:</span>
                  <span className="text-sm text-muted-foreground font-mono">{user.id}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Auth Provider:</span>
                  <span className="text-sm text-muted-foreground">
                    {user.app_metadata?.provider || 'Email'}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Production Health Dashboard */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Activity className="h-6 w-6" />
            <h2 className="text-2xl font-bold">Production Health Metrics</h2>
          </div>
          <ProductionHealthDashboard />
        </div>

        {/* Lady Jarvis Monitor */}
        <div>
          <LadyJarvisMonitor />
        </div>

        {/* System Health Check */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Shield className="h-6 w-6" />
            <h2 className="text-2xl font-bold">Integration Health Checks</h2>
          </div>
          <SystemHealthCheck />
        </div>

        {/* Edge Function Errors Section - Placeholder */}
        <Card>
          <CardHeader>
            <CardTitle>Edge Function Errors</CardTitle>
            <CardDescription>
              Recent errors from edge functions (requires edge_function_errors table)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert>
              <AlertDescription>
                Edge function error tracking is configured. Errors will appear here once the 
                edge_function_errors table is created via migration.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SystemTestingHub;
