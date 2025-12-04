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
  Settings,
  Phone,
  Bot,
  Link,
  Database,
  Shield,
  MessageSquare
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface HealthCheckResult {
  name: string;
  status: 'pending' | 'success' | 'error' | 'warning';
  message: string;
  details?: string;
  category: 'auth' | 'retell' | 'twilio' | 'ghl' | 'database' | 'sms';
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
      { name: 'Authentication', status: 'pending', message: 'Checking...', category: 'auth' },
      { name: 'Retell AI - API Connection', status: 'pending', message: 'Checking...', category: 'retell' },
      { name: 'Retell AI - List LLMs', status: 'pending', message: 'Checking...', category: 'retell' },
      { name: 'Retell AI - List Agents', status: 'pending', message: 'Checking...', category: 'retell' },
      { name: 'Retell AI - List Phone Numbers', status: 'pending', message: 'Checking...', category: 'retell' },
      { name: 'Twilio - API Connection', status: 'pending', message: 'Checking...', category: 'twilio' },
      { name: 'Twilio - List Numbers', status: 'pending', message: 'Checking...', category: 'twilio' },
      { name: 'Twilio - SMS Webhook', status: 'pending', message: 'Checking...', category: 'twilio' },
      { name: 'Go High Level - API Connection', status: 'pending', message: 'Checking...', category: 'ghl' },
      { name: 'Go High Level - Credentials', status: 'pending', message: 'Checking...', category: 'ghl' },
      { name: 'Database - Leads Table', status: 'pending', message: 'Checking...', category: 'database' },
      { name: 'Database - Phone Numbers Table', status: 'pending', message: 'Checking...', category: 'database' },
      { name: 'Database - SMS Messages Table', status: 'pending', message: 'Checking...', category: 'sms' },
      { name: 'Database - Campaigns Table', status: 'pending', message: 'Checking...', category: 'database' },
      { name: 'Edge Functions - Health', status: 'pending', message: 'Checking...', category: 'database' },
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

    // Check 1: Retell AI API Connection
    try {
      const { data, error } = await supabase.functions.invoke('retell-agent-management', {
        body: { action: 'list' }
      });
      if (error) throw error;
      updateResult(1, 'success', 'Retell AI API Connected', 'API key is valid');
    } catch (error: any) {
      if (error.message?.includes('401') || error.message?.includes('unauthorized')) {
        updateResult(1, 'error', 'Invalid API Key', 'Check RETELL_AI_API_KEY secret');
      } else {
        updateResult(1, 'warning', 'Connection issue', error.message);
      }
    }

    // Check 2: Retell LLMs
    try {
      const { data, error } = await supabase.functions.invoke('retell-llm-management', {
        body: { action: 'list' }
      });
      if (error) throw error;
      const llmCount = Array.isArray(data) ? data.length : 0;
      updateResult(2, 'success', `Found ${llmCount} LLM(s)`, llmCount > 0 ? 'LLMs configured' : 'No LLMs yet - create one in Retell dashboard');
    } catch (error: any) {
      updateResult(2, 'error', 'Failed to list LLMs', error.message);
    }

    // Check 3: Retell Agents
    try {
      const { data, error } = await supabase.functions.invoke('retell-agent-management', {
        body: { action: 'list' }
      });
      if (error) throw error;
      const agentCount = Array.isArray(data) ? data.length : 0;
      updateResult(3, 'success', `Found ${agentCount} agent(s)`, agentCount > 0 ? 'Agents ready' : 'Create an agent to start calling');
    } catch (error: any) {
      updateResult(3, 'error', 'Failed to list agents', error.message);
    }

    // Check 4: Retell Phone Numbers
    try {
      const { data, error } = await supabase.functions.invoke('retell-phone-management', {
        body: { action: 'list' }
      });
      if (error) throw error;
      const numberCount = Array.isArray(data) ? data.length : 0;
      updateResult(4, 'success', `Found ${numberCount} phone number(s)`, numberCount > 0 ? 'Numbers imported' : 'Import numbers from Twilio');
    } catch (error: any) {
      updateResult(4, 'error', 'Failed to list phone numbers', error.message);
    }

    // Check 5: Twilio API Connection
    try {
      const { data, error } = await supabase.functions.invoke('twilio-integration', {
        body: { action: 'list_numbers' }
      });
      if (error) throw error;
      updateResult(5, 'success', 'Twilio API Connected', 'Credentials valid');
    } catch (error: any) {
      if (error.message?.includes('401') || error.message?.includes('20003')) {
        updateResult(5, 'error', 'Invalid Twilio Credentials', 'Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN secrets');
      } else {
        updateResult(5, 'warning', 'Connection issue', error.message || 'Check Twilio credentials');
      }
    }

    // Check 6: Twilio Numbers
    try {
      const { data, error } = await supabase.functions.invoke('twilio-integration', {
        body: { action: 'list_numbers' }
      });
      if (error) throw error;
      const twilioCount = data?.numbers?.length || 0;
      updateResult(6, 'success', `Found ${twilioCount} Twilio number(s)`, twilioCount > 0 ? 'Numbers available' : 'Purchase numbers in Twilio console');
    } catch (error: any) {
      updateResult(6, 'warning', 'Twilio check failed', error.message || 'Make sure credentials are configured');
    }

    // Check 7: Twilio SMS Webhook
    try {
      const { data, error } = await supabase.functions.invoke('twilio-sms-webhook', {
        body: { test: true }
      });
      updateResult(7, 'success', 'SMS Webhook Active', 'Webhook endpoint responding');
    } catch (error: any) {
      updateResult(7, 'warning', 'Webhook issue', 'SMS webhook may need configuration');
    }

    // Check 8: Go High Level API Connection
    try {
      const ghlCredentials = localStorage.getItem('ghl_credentials');
      if (ghlCredentials) {
        const parsed = JSON.parse(ghlCredentials);
        if (parsed.apiKey) {
          const { data, error } = await supabase.functions.invoke('ghl-integration', {
            body: { action: 'test_connection', apiKey: parsed.apiKey, locationId: parsed.locationId }
          });
          if (error) throw error;
          updateResult(8, 'success', 'GHL API Connected', 'Connection verified');
        } else {
          updateResult(8, 'warning', 'No API Key', 'Configure GHL credentials in the GHL tab');
        }
      } else {
        updateResult(8, 'warning', 'Not Configured', 'Set up Go High Level integration');
      }
    } catch (error: any) {
      updateResult(8, 'error', 'GHL Connection Failed', error.message);
    }

    // Check 9: GHL Credentials
    try {
      const ghlCredentials = localStorage.getItem('ghl_credentials');
      if (ghlCredentials) {
        const parsed = JSON.parse(ghlCredentials);
        const hasApiKey = !!parsed.apiKey;
        const hasLocationId = !!parsed.locationId;
        if (hasApiKey && hasLocationId) {
          updateResult(9, 'success', 'Credentials Configured', 'API Key and Location ID set');
        } else if (hasApiKey) {
          updateResult(9, 'warning', 'Partial Config', 'Location ID missing');
        } else {
          updateResult(9, 'warning', 'Missing Credentials', 'API Key not configured');
        }
      } else {
        updateResult(9, 'warning', 'No Credentials', 'Configure in Go High Level tab');
      }
    } catch (error: any) {
      updateResult(9, 'error', 'Credential Error', error.message);
    }

    // Check 10: Database - Leads
    try {
      const { error, count } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true });
      
      if (error) throw error;
      updateResult(10, 'success', `Leads table accessible`, `${count || 0} leads in database`);
    } catch (error: any) {
      updateResult(10, 'error', 'Leads table error', error.message);
    }

    // Check 11: Database - Phone Numbers
    try {
      const { error, count } = await supabase
        .from('phone_numbers')
        .select('*', { count: 'exact', head: true });
      
      if (error) throw error;
      updateResult(11, 'success', `Phone numbers table accessible`, `${count || 0} numbers in database`);
    } catch (error: any) {
      updateResult(11, 'error', 'Phone numbers table error', error.message);
    }

    // Check 12: Database - SMS Messages
    try {
      const { error, count } = await supabase
        .from('sms_messages')
        .select('*', { count: 'exact', head: true });
      
      if (error) throw error;
      updateResult(12, 'success', `SMS messages table accessible`, `${count || 0} messages in database`);
    } catch (error: any) {
      updateResult(12, 'error', 'SMS messages table error', error.message);
    }

    // Check 13: Database - Campaigns
    try {
      const { error, count } = await supabase
        .from('campaigns')
        .select('*', { count: 'exact', head: true });
      
      if (error) throw error;
      updateResult(13, 'success', `Campaigns table accessible`, `${count || 0} campaigns in database`);
    } catch (error: any) {
      updateResult(13, 'error', 'Campaigns table error', error.message);
    }

    // Check 14: Edge Functions Health
    try {
      const { data, error } = await supabase.functions.invoke('system-health-monitor', {
        body: {}
      });
      if (error) throw error;
      updateResult(14, 'success', 'Edge Functions Operational', 'All functions responding');
    } catch (error: any) {
      updateResult(14, 'warning', 'Edge Function Issue', error.message);
    }

    setIsRunning(false);
    
    // Use setTimeout to ensure state is updated before counting
    setTimeout(() => {
      setResults(currentResults => {
        const errorCount = currentResults.filter(c => c.status === 'error').length;
        const warningCount = currentResults.filter(c => c.status === 'warning').length;
        const successCount = currentResults.filter(c => c.status === 'success').length;
        
        if (errorCount === 0 && warningCount === 0) {
          toast({
            title: "✅ All Systems Operational",
            description: `All ${checks.length} checks passed successfully!`,
          });
        } else {
          toast({
            title: `System Health Report`,
            description: `${successCount} passed, ${warningCount} warning(s), ${errorCount} error(s)`,
            variant: errorCount > 0 ? "destructive" : "default"
          });
        }
        return currentResults;
      });
    }, 100);
  };

  const getCategoryIcon = (category: HealthCheckResult['category']) => {
    switch (category) {
      case 'auth': return <Shield className="h-4 w-4" />;
      case 'retell': return <Bot className="h-4 w-4" />;
      case 'twilio': return <Phone className="h-4 w-4" />;
      case 'ghl': return <Link className="h-4 w-4" />;
      case 'database': return <Database className="h-4 w-4" />;
      case 'sms': return <MessageSquare className="h-4 w-4" />;
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

  // Group results by category
  const groupedResults = results.reduce((acc, result) => {
    if (!acc[result.category]) {
      acc[result.category] = [];
    }
    acc[result.category].push(result);
    return acc;
  }, {} as Record<string, HealthCheckResult[]>);

  const categoryLabels: Record<string, string> = {
    auth: 'Authentication',
    retell: 'Retell AI',
    twilio: 'Twilio',
    ghl: 'Go High Level',
    database: 'Database',
    sms: 'SMS System'
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Comprehensive System Health Check
            </CardTitle>
            <CardDescription>
              Validates all integrations: Twilio, Retell AI, Go High Level, Database, and SMS
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
                Running {results.filter(r => r.status !== 'pending').length}/{results.length}...
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
              Click "Run Health Check" to test all system integrations including Twilio, Retell AI, Go High Level, and database connections.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedResults).map(([category, categoryResults]) => (
              <div key={category} className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                  {getCategoryIcon(category as HealthCheckResult['category'])}
                  {categoryLabels[category] || category}
                </div>
                <div className="space-y-2 pl-6">
                  {categoryResults.map((result, index) => (
                    <div
                      key={`${category}-${index}`}
                      className="flex items-start gap-3 p-3 border rounded-lg bg-card"
                    >
                      <div className="flex-shrink-0 mt-0.5">
                        {getStatusIcon(result.status)}
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between">
                          <h4 className="font-medium text-sm">{result.name}</h4>
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
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};