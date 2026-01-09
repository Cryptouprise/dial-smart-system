/**
 * System Testing Hub
 * 
 * Consolidated monitoring and testing dashboard for enterprise operations.
 * Displays health checks, production metrics, and system status.
 */

import React, { useEffect, useState } from 'react';
import { Activity, Shield, AlertCircle, Building2, CheckCircle, XCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SystemHealthCheck } from '@/components/SystemHealthCheck';
import { ProductionHealthDashboard } from '@/components/ProductionHealthDashboard';
import { LadyJarvisMonitor } from '@/components/LadyJarvisMonitor';
import Navigation from '@/components/Navigation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

interface UserRole {
  role: string;
  created_at: string;
}

interface Organization {
  id: string;
  name: string;
  slug: string;
  subscription_tier: string;
  role: string;
}

interface EdgeFunctionError {
  id: string;
  function_name: string;
  error_message: string;
  severity: string;
  created_at: string;
  resolved_at: string | null;
}

const SystemTestingHub = () => {
  const { user } = useAuth();
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [edgeFunctionErrors, setEdgeFunctionErrors] = useState<EdgeFunctionError[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchUserData();
    }
  }, [user]);

  const fetchUserData = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Fetch user roles
      const { data: rolesData } = await supabase
        .from('user_roles')
        .select('role, created_at')
        .eq('user_id', user.id);
      
      if (rolesData) {
        setUserRoles(rolesData);
      }

      // Fetch organizations (using any to bypass type checking until types are regenerated)
      const { data: orgsData } = await (supabase as any)
        .from('organization_users')
        .select(`
          role,
          organizations (
            id, name, slug, subscription_tier
          )
        `)
        .eq('user_id', user.id);
      
      if (orgsData) {
        setOrganizations(orgsData.map((item: any) => ({
          ...item.organizations,
          role: item.role
        })));
      }

      // Fetch recent edge function errors
      const { data: errorsData } = await (supabase as any)
        .from('edge_function_errors')
        .select('id, function_name, error_message, severity, created_at, resolved_at')
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (errorsData) {
        setEdgeFunctionErrors(errorsData);
      }
    } catch (err) {
      console.error('Error fetching user data:', err);
    } finally {
      setLoading(false);
    }
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'admin':
      case 'owner':
        return 'default';
      case 'manager':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'error':
        return 'text-destructive';
      case 'warning':
        return 'text-yellow-500';
      default:
        return 'text-muted-foreground';
    }
  };

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

        <div className="grid gap-6 md:grid-cols-2">
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
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Email:</span>
                    <span className="text-sm text-muted-foreground">{user.email}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">User ID:</span>
                    <span className="text-sm text-muted-foreground font-mono text-xs">{user.id.slice(0, 8)}...</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Roles:</span>
                    <div className="flex gap-1">
                      {loading ? (
                        <span className="text-sm text-muted-foreground">Loading...</span>
                      ) : userRoles.length > 0 ? (
                        userRoles.map((role, i) => (
                          <Badge key={i} variant={getRoleBadgeVariant(role.role)}>
                            {role.role}
                          </Badge>
                        ))
                      ) : (
                        <Badge variant="outline">member</Badge>
                      )}
                    </div>
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

          {/* Organizations */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Organizations
              </CardTitle>
              <CardDescription>Multi-tenancy membership</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <span className="text-sm text-muted-foreground">Loading...</span>
              ) : organizations.length > 0 ? (
                <div className="space-y-3">
                  {organizations.map((org) => (
                    <div key={org.id} className="flex justify-between items-center p-2 rounded-md bg-muted/50">
                      <div>
                        <p className="font-medium text-sm">{org.name}</p>
                        <p className="text-xs text-muted-foreground">{org.slug}</p>
                      </div>
                      <div className="flex gap-2">
                        <Badge variant={getRoleBadgeVariant(org.role)}>{org.role}</Badge>
                        <Badge variant="outline">{org.subscription_tier}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Alert>
                  <AlertDescription>
                    No organizations found. Create one to enable multi-tenancy.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Edge Function Errors */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Edge Function Errors
            </CardTitle>
            <CardDescription>
              Recent errors from edge functions for debugging
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <span className="text-sm text-muted-foreground">Loading...</span>
            ) : edgeFunctionErrors.length > 0 ? (
              <div className="space-y-2">
                {edgeFunctionErrors.map((error) => (
                  <div 
                    key={error.id} 
                    className="flex items-start gap-3 p-3 rounded-md bg-muted/50 border"
                  >
                    {error.resolved_at ? (
                      <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                    ) : (
                      <XCircle className={`h-4 w-4 mt-0.5 ${getSeverityColor(error.severity)}`} />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {error.function_name}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(error.created_at), 'MMM d, HH:mm')}
                        </span>
                      </div>
                      <p className="text-sm mt-1 truncate">{error.error_message}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="h-4 w-4" />
                <span className="text-sm">No recent errors - system is healthy!</span>
              </div>
            )}
          </CardContent>
        </Card>

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
      </div>
    </div>
  );
};

export default SystemTestingHub;
