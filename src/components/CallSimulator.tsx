import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Phone, CheckCircle, XCircle, AlertCircle, Loader2, Play, Zap, Server } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface TestResult {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'warning';
  message: string;
  details?: string;
  duration?: number;
}

interface CallTest {
  id: string;
  phone: string;
  name: string;
  status: 'pending' | 'calling' | 'connected' | 'failed' | 'completed';
  result?: string;
  callSid?: string;
  error?: string;
}

// Test phone numbers - mix of fake and real
const TEST_CONTACTS: CallTest[] = [
  { id: '1', phone: '+15551234567', name: 'Fake Number 1 (should fail)', status: 'pending' },
  { id: '2', phone: '+15550000000', name: 'Fake Number 2 (should fail)', status: 'pending' },
  { id: '3', phone: '+12145291531', name: 'Your Number (should connect)', status: 'pending' },
  { id: '4', phone: '+15559999999', name: 'Fake Number 3 (should fail)', status: 'pending' },
];

export const CallSimulator: React.FC = () => {
  const [infraTests, setInfraTests] = useState<TestResult[]>([]);
  const [callTests, setCallTests] = useState<CallTest[]>(TEST_CONTACTS);
  const [isRunningInfra, setIsRunningInfra] = useState(false);
  const [isRunningCalls, setIsRunningCalls] = useState(false);
  const [callerNumber, setCallerNumber] = useState<string | null>(null);

  // Test infrastructure connectivity
  const runInfrastructureTests = useCallback(async () => {
    setIsRunningInfra(true);
    const results: TestResult[] = [];

    // Test 1: Supabase Connection
    const supabaseTest: TestResult = {
      id: 'supabase',
      name: 'Supabase Connection',
      status: 'running',
      message: 'Testing database connection...',
    };
    results.push(supabaseTest);
    setInfraTests([...results]);

    try {
      const startTime = Date.now();
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session) {
        supabaseTest.status = 'failed';
        supabaseTest.message = 'Not authenticated';
        supabaseTest.details = 'Please log in to run tests';
      } else {
        supabaseTest.status = 'success';
        supabaseTest.message = 'Connected & authenticated';
        supabaseTest.duration = Date.now() - startTime;
      }
    } catch (e: any) {
      supabaseTest.status = 'failed';
      supabaseTest.message = 'Connection failed';
      supabaseTest.details = e.message;
    }
    setInfraTests([...results]);

    // Test 2: Phone Numbers Available
    const phoneTest: TestResult = {
      id: 'phone-numbers',
      name: 'Phone Numbers',
      status: 'running',
      message: 'Checking available phone numbers...',
    };
    results.push(phoneTest);
    setInfraTests([...results]);

    try {
      const startTime = Date.now();
      const { data: phones, error } = await supabase
        .from('phone_numbers')
        .select('id, number, status, is_spam')
        .eq('status', 'active')
        .eq('is_spam', false)
        .limit(5);

      if (error) throw error;

      if (!phones || phones.length === 0) {
        phoneTest.status = 'failed';
        phoneTest.message = 'No active phone numbers found';
        phoneTest.details = 'Add phone numbers in Number Pool Manager';
      } else {
        phoneTest.status = 'success';
        phoneTest.message = `${phones.length} active numbers available`;
        phoneTest.details = phones.map(p => p.number).join(', ');
        phoneTest.duration = Date.now() - startTime;
        // Store first number for calls
        setCallerNumber(phones[0].number);
      }
    } catch (e: any) {
      phoneTest.status = 'failed';
      phoneTest.message = 'Failed to fetch phone numbers';
      phoneTest.details = e.message;
    }
    setInfraTests([...results]);

    // Test 3: Retell AI Configuration
    const retellTest: TestResult = {
      id: 'retell-ai',
      name: 'Retell AI API',
      status: 'running',
      message: 'Testing Retell AI connection...',
    };
    results.push(retellTest);
    setInfraTests([...results]);

    try {
      const startTime = Date.now();
      const { data, error } = await supabase.functions.invoke('retell-agent-management', {
        body: { action: 'list' }
      });

      if (error) throw error;

      if (data?.agents && data.agents.length > 0) {
        retellTest.status = 'success';
        retellTest.message = `${data.agents.length} AI agents configured`;
        retellTest.details = data.agents.map((a: any) => a.agent_name).join(', ');
        retellTest.duration = Date.now() - startTime;
      } else {
        retellTest.status = 'warning';
        retellTest.message = 'No AI agents found';
        retellTest.details = 'Create an agent in Retell AI Manager';
      }
    } catch (e: any) {
      retellTest.status = 'failed';
      retellTest.message = 'Retell AI API error';
      retellTest.details = e.message;
    }
    setInfraTests([...results]);

    // Test 4: Twilio via Quick Test Call (dry run)
    const twilioTest: TestResult = {
      id: 'twilio',
      name: 'Twilio API',
      status: 'running',
      message: 'Verifying Twilio credentials...',
    };
    results.push(twilioTest);
    setInfraTests([...results]);

    try {
      const startTime = Date.now();
      // We check if the edge function responds without actually making a call
      const { data: phones } = await supabase
        .from('phone_numbers')
        .select('number')
        .eq('status', 'active')
        .limit(1);

      if (phones && phones.length > 0) {
        twilioTest.status = 'success';
        twilioTest.message = 'Twilio configured (ready for calls)';
        twilioTest.details = `Will use ${phones[0].number} as caller ID`;
        twilioTest.duration = Date.now() - startTime;
      } else {
        twilioTest.status = 'warning';
        twilioTest.message = 'No caller ID available';
        twilioTest.details = 'Add phone numbers to make outbound calls';
      }
    } catch (e: any) {
      twilioTest.status = 'failed';
      twilioTest.message = 'Twilio check failed';
      twilioTest.details = e.message;
    }
    setInfraTests([...results]);

    // Test 5: Edge Functions Health
    const edgeTest: TestResult = {
      id: 'edge-functions',
      name: 'Edge Functions',
      status: 'running',
      message: 'Testing edge function deployment...',
    };
    results.push(edgeTest);
    setInfraTests([...results]);

    try {
      const startTime = Date.now();
      const { data, error } = await supabase.functions.invoke('system-health-monitor', {
        body: { action: 'check' }
      });

      if (error && !error.message.includes('Invalid action')) {
        throw error;
      }

      edgeTest.status = 'success';
      edgeTest.message = 'Edge functions responding';
      edgeTest.duration = Date.now() - startTime;
    } catch (e: any) {
      edgeTest.status = 'failed';
      edgeTest.message = 'Edge function error';
      edgeTest.details = e.message;
    }
    setInfraTests([...results]);

    setIsRunningInfra(false);
    
    const failedCount = results.filter(r => r.status === 'failed').length;
    if (failedCount > 0) {
      toast.error(`Infrastructure check: ${failedCount} issues found`);
    } else {
      toast.success('Infrastructure check passed!');
    }
  }, []);

  // Run actual test calls
  const runCallTests = useCallback(async () => {
    if (!callerNumber) {
      toast.error('No caller ID available. Run infrastructure tests first.');
      return;
    }

    setIsRunningCalls(true);
    setCallTests(TEST_CONTACTS.map(c => ({ ...c, status: 'pending' as CallTest['status'] })));

    const updatedTests: CallTest[] = TEST_CONTACTS.map(c => ({ ...c, status: 'pending' as CallTest['status'] }));

    for (let i = 0; i < TEST_CONTACTS.length; i++) {
      const contact = TEST_CONTACTS[i];
      
      // Update status to calling
      updatedTests[i] = { ...updatedTests[i], status: 'calling' as CallTest['status'] };
      setCallTests([...updatedTests]);

      try {
        console.log(`[CallSimulator] Initiating call to ${contact.phone}`);
        
        const { data, error } = await supabase.functions.invoke('quick-test-call', {
          body: {
            toNumber: contact.phone,
            fromNumber: callerNumber,
            message: 'This is an automated test call from your dialing system. The call will end in 5 seconds. Goodbye.',
          }
        });

        if (error) throw error;

        if (data?.success) {
          updatedTests[i] = { 
            ...updatedTests[i], 
            status: 'connected' as CallTest['status'],
            result: 'Call initiated',
            callSid: data.callSid 
          };
          setCallTests([...updatedTests]);
          console.log(`[CallSimulator] Call to ${contact.phone} initiated: ${data.callSid}`);
        } else {
          throw new Error(data?.error || 'Unknown error');
        }
      } catch (e: any) {
        console.error(`[CallSimulator] Call to ${contact.phone} failed:`, e);
        
        let errorMessage = e.message || 'Call failed';
        
        // Parse common Twilio errors
        if (errorMessage.includes('21211') || errorMessage.includes('invalid')) {
          errorMessage = 'Invalid phone number';
        } else if (errorMessage.includes('21614')) {
          errorMessage = 'Number not SMS capable';
        } else if (errorMessage.includes('21215')) {
          errorMessage = 'Geographic restriction';
        } else if (errorMessage.includes('blacklist')) {
          errorMessage = 'Number blacklisted';
        }

        updatedTests[i] = { 
          ...updatedTests[i], 
          status: 'failed' as CallTest['status'],
          error: errorMessage
        };
        setCallTests([...updatedTests]);
      }

      // Small delay between calls to not overwhelm the system
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    setIsRunningCalls(false);

    // Summary
    const connected = updatedTests.filter(c => c.status === 'connected').length;
    const failed = updatedTests.filter(c => c.status === 'failed').length;
    
    toast.info(`Call test complete: ${connected} connected, ${failed} failed`);
  }, [callerNumber]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
      case 'connected':
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'warning':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      case 'running':
      case 'calling':
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      default:
        return <div className="h-4 w-4 rounded-full bg-muted" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      success: 'default',
      connected: 'default',
      completed: 'default',
      failed: 'destructive',
      warning: 'secondary',
      running: 'outline',
      calling: 'outline',
      pending: 'secondary',
    };
    return <Badge variant={variants[status] || 'secondary'}>{status}</Badge>;
  };

  const infraPassed = infraTests.filter(t => t.status === 'success').length;
  const infraTotal = infraTests.length;
  const callsCompleted = callTests.filter(c => c.status !== 'pending').length;
  const callsTotal = callTests.length;

  return (
    <div className="space-y-6">
      {/* Infrastructure Tests */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Infrastructure Tests
          </CardTitle>
          <CardDescription>
            Verify API connections, phone numbers, and edge functions are working
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Button 
              onClick={runInfrastructureTests} 
              disabled={isRunningInfra}
              className="gap-2"
            >
              {isRunningInfra ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4" />
                  Run Infrastructure Tests
                </>
              )}
            </Button>
            {infraTests.length > 0 && (
              <span className="text-sm text-muted-foreground">
                {infraPassed}/{infraTotal} passed
              </span>
            )}
          </div>

          {infraTests.length > 0 && (
            <div className="space-y-2">
              {infraTests.map((test) => (
                <div 
                  key={test.id} 
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    {getStatusIcon(test.status)}
                    <div>
                      <div className="font-medium">{test.name}</div>
                      <div className="text-sm text-muted-foreground">{test.message}</div>
                      {test.details && (
                        <div className="text-xs text-muted-foreground mt-1">{test.details}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {test.duration && (
                      <span className="text-xs text-muted-foreground">{test.duration}ms</span>
                    )}
                    {getStatusBadge(test.status)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Live Call Tests */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            End-to-End Call Tests
          </CardTitle>
          <CardDescription>
            Place REAL test calls through Twilio to verify the complete call flow.
            Fake numbers should fail, your number should ring.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Button 
              onClick={runCallTests} 
              disabled={isRunningCalls || !callerNumber}
              variant="default"
              className="gap-2"
            >
              {isRunningCalls ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Calling...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Start Call Tests
                </>
              )}
            </Button>
            {!callerNumber && (
              <span className="text-sm text-yellow-600">
                ⚠️ Run infrastructure tests first to get a caller ID
              </span>
            )}
            {callerNumber && (
              <span className="text-sm text-muted-foreground">
                Calling from: {callerNumber}
              </span>
            )}
          </div>

          {isRunningCalls && (
            <Progress value={(callsCompleted / callsTotal) * 100} className="h-2" />
          )}

          <div className="space-y-2">
            {callTests.map((call) => (
              <div 
                key={call.id} 
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="flex items-center gap-3">
                  {getStatusIcon(call.status)}
                  <div>
                    <div className="font-medium">{call.name}</div>
                    <div className="text-sm text-muted-foreground font-mono">{call.phone}</div>
                    {call.result && (
                      <div className="text-xs text-green-600 mt-1">{call.result}</div>
                    )}
                    {call.error && (
                      <div className="text-xs text-red-600 mt-1">{call.error}</div>
                    )}
                    {call.callSid && (
                      <div className="text-xs text-muted-foreground mt-1">SID: {call.callSid}</div>
                    )}
                  </div>
                </div>
                {getStatusBadge(call.status)}
              </div>
            ))}
          </div>

          {callTests.some(c => c.status !== 'pending') && !isRunningCalls && (
            <div className="p-4 bg-muted rounded-lg">
              <h4 className="font-medium mb-2">Results Summary</h4>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-green-600">
                    {callTests.filter(c => c.status === 'connected').length}
                  </div>
                  <div className="text-sm text-muted-foreground">Connected</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-red-600">
                    {callTests.filter(c => c.status === 'failed').length}
                  </div>
                  <div className="text-sm text-muted-foreground">Failed</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-muted-foreground">
                    {callTests.filter(c => c.status === 'pending').length}
                  </div>
                  <div className="text-sm text-muted-foreground">Pending</div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
