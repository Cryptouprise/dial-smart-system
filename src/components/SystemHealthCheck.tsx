import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  CheckCircle, 
  XCircle, 
  Loader2, 
  PlayCircle,
  AlertTriangle,
  Settings
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface HealthCheckResult {
  name: string;
  status: 'pending' | 'success' | 'error' | 'warning';
  message: string;
  details?: string;
}

export const SystemHealthCheck = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<HealthCheckResult[]>([]);
  const { toast } = useToast();

  const updateResult = (index: number, status: HealthCheckResult['status'], message: string, details?: string) => {
    setResults(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], status, message, details };
      return updated;
    });
  };

  const runHealthCheck = async () => {
    setIsRunning(true);
    
    const checks: HealthCheckResult[] = [
      { name: 'Authentication', status: 'pending', message: 'Checking...' },
      { name: 'Retell AI - List LLMs', status: 'pending', message: 'Checking...' },
      { name: 'Retell AI - List Agents', status: 'pending', message: 'Checking...' },
      { name: 'Retell AI - List Phone Numbers', status: 'pending', message: 'Checking...' },
      { name: 'Twilio - List Numbers', status: 'pending', message: 'Checking...' },
      { name: 'Database - Leads Table', status: 'pending', message: 'Checking...' },
      { name: 'Database - Phone Numbers Table', status: 'pending', message: 'Checking...' },
    ];
    
    setResults(checks);

    // Check 0: Authentication
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) throw error;
      if (session) {
        updateResult(0, 'success', 'Authenticated', `User: ${session.user.email}`);
      } else {
        updateResult(0, 'error', 'Not authenticated', 'Please sign in first');
        setIsRunning(false);
        return;
      }
    } catch (error: any) {
      updateResult(0, 'error', 'Auth check failed', error.message);
      setIsRunning(false);
      return;
    }

    // Check 1: Retell LLMs
    try {
      const { data, error } = await supabase.functions.invoke('retell-llm-management', {
        body: { action: 'list' }
      });
      if (error) throw error;
      const llmCount = Array.isArray(data) ? data.length : 0;
      updateResult(1, 'success', `Found ${llmCount} LLM(s)`, JSON.stringify(data).substring(0, 100));
    } catch (error: any) {
      updateResult(1, 'error', 'Failed to list LLMs', error.message);
    }

    // Check 2: Retell Agents
    try {
      const { data, error } = await supabase.functions.invoke('retell-agent-management', {
        body: { action: 'list' }
      });
      if (error) throw error;
      const agentCount = Array.isArray(data) ? data.length : 0;
      updateResult(2, 'success', `Found ${agentCount} agent(s)`, JSON.stringify(data).substring(0, 100));
    } catch (error: any) {
      updateResult(2, 'error', 'Failed to list agents', error.message);
    }

    // Check 3: Retell Phone Numbers
    try {
      const { data, error } = await supabase.functions.invoke('retell-phone-management', {
        body: { action: 'list' }
      });
      if (error) throw error;
      const numberCount = Array.isArray(data) ? data.length : 0;
      updateResult(3, 'success', `Found ${numberCount} phone number(s)`, JSON.stringify(data).substring(0, 100));
    } catch (error: any) {
      updateResult(3, 'error', 'Failed to list phone numbers', error.message);
    }

    // Check 4: Twilio Numbers
    try {
      const { data, error } = await supabase.functions.invoke('twilio-integration', {
        body: { action: 'list_numbers' }
      });
      if (error) throw error;
      const twilioCount = data?.numbers?.length || 0;
      updateResult(4, 'success', `Found ${twilioCount} Twilio number(s)`, twilioCount > 0 ? 'Ready to import' : 'No numbers found');
    } catch (error: any) {
      updateResult(4, 'warning', 'Twilio check failed', error.message || 'Make sure credentials are configured');
    }

    // Check 5: Database - Leads
    try {
      const { data, error, count } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true });
      
      if (error) throw error;
      updateResult(5, 'success', `Leads table accessible`, `${count || 0} leads in database`);
    } catch (error: any) {
      updateResult(5, 'error', 'Leads table error', error.message);
    }

    // Check 6: Database - Phone Numbers
    try {
      const { data, error, count } = await supabase
        .from('phone_numbers')
        .select('*', { count: 'exact', head: true });
      
      if (error) throw error;
      updateResult(6, 'success', `Phone numbers table accessible`, `${count || 0} numbers in database`);
    } catch (error: any) {
      updateResult(6, 'error', 'Phone numbers table error', error.message);
    }

    setIsRunning(false);
    
    const failedChecks = checks.filter(c => c.status === 'error').length;
    const warningChecks = checks.filter(c => c.status === 'warning').length;
    
    if (failedChecks === 0 && warningChecks === 0) {
      toast({
        title: "✅ All Systems Operational",
        description: "All checks passed successfully!",
      });
    } else {
      toast({
        title: `⚠️ Found ${failedChecks} error(s) and ${warningChecks} warning(s)`,
        description: "Review the details below",
        variant: "destructive"
      });
    }
  };

  const getStatusIcon = (status: HealthCheckResult['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'error':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case 'pending':
        return <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />;
    }
  };

  const getStatusBadge = (status: HealthCheckResult['status']) => {
    const variants = {
      success: 'default' as const,
      error: 'destructive' as const,
      warning: 'secondary' as const,
      pending: 'outline' as const,
    };
    return <Badge variant={variants[status]}>{status.toUpperCase()}</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              System Health Check
            </CardTitle>
            <CardDescription>
              Verify all integrations and systems are working correctly
            </CardDescription>
          </div>
          <Button
            onClick={runHealthCheck}
            disabled={isRunning}
            size="lg"
          >
            {isRunning ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Running Tests...
              </>
            ) : (
              <>
                <PlayCircle className="h-4 w-4 mr-2" />
                Run Health Check
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {results.length === 0 ? (
          <Alert>
            <AlertDescription>
              Click "Run Health Check" to test all system integrations and identify any issues.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-3">
            {results.map((result, index) => (
              <div
                key={index}
                className="flex items-start gap-3 p-4 border rounded-lg"
              >
                <div className="flex-shrink-0 mt-0.5">
                  {getStatusIcon(result.status)}
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-sm">{result.name}</h4>
                    {getStatusBadge(result.status)}
                  </div>
                  <p className="text-sm text-muted-foreground">{result.message}</p>
                  {result.details && (
                    <p className="text-xs text-muted-foreground font-mono bg-muted p-2 rounded mt-2">
                      {result.details}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
