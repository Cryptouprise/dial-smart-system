import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Calendar, 
  CheckCircle, 
  ExternalLink, 
  Key, 
  RefreshCw, 
  Settings,
  Zap,
  Info,
  Copy,
  Link2,
  Loader2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface CalendarConfig {
  calcom_api_key?: string;
  calcom_event_type_id?: string;
  google_calendar_enabled?: boolean;
  google_calendar_id?: string;
}

interface GoogleIntegration {
  connected: boolean;
  email?: string;
  calendarName?: string;
}

// Google Calendar One-Click Connect Component
const GoogleCalendarConnect: React.FC = () => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [integration, setIntegration] = useState<GoogleIntegration>({ connected: false });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkGoogleConnection();
    
    // Listen for popup callback
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'google-calendar-connected') {
        toast.success('Google Calendar connected successfully!');
        checkGoogleConnection();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const checkGoogleConnection = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('calendar_integrations')
        .select('*')
        .eq('user_id', user.id)
        .eq('provider', 'google')
        .maybeSingle();

      if (data) {
        setIntegration({
          connected: true,
          email: data.provider_account_email || undefined,
          calendarName: data.calendar_name || undefined
        });
      }
    } catch (error) {
      console.error('Error checking Google connection:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const connectGoogle = async () => {
    setIsConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke('calendar-integration', {
        body: { action: 'get_google_auth_url' }
      });

      if (error) throw error;
      
      if (data.error) {
        toast.error(data.error);
        return;
      }

      // Open OAuth popup
      const width = 500;
      const height = 600;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      
      window.open(
        data.authUrl,
        'google-oauth',
        `width=${width},height=${height},left=${left},top=${top}`
      );
    } catch (error: any) {
      console.error('Google connect error:', error);
      toast.error(error.message || 'Failed to start Google connection');
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnectGoogle = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase
        .from('calendar_integrations')
        .delete()
        .eq('user_id', user.id)
        .eq('provider', 'google');

      setIntegration({ connected: false });
      toast.success('Google Calendar disconnected');
    } catch (error) {
      toast.error('Failed to disconnect');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (integration.connected) {
    return (
      <Alert className="border-green-200 bg-green-50 dark:bg-green-950/20">
        <CheckCircle className="h-4 w-4 text-green-600" />
        <AlertDescription className="flex items-center justify-between">
          <div>
            <strong className="text-green-700 dark:text-green-400">Google Calendar Connected!</strong>
            <p className="text-sm text-muted-foreground mt-1">
              {integration.email} · {integration.calendarName}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={disconnectGoogle}>
            Disconnect
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
        <Info className="h-4 w-4" />
        <AlertDescription>
          <strong>One-Click Google Calendar Integration</strong>
          <p className="text-sm mt-1">
            Click the button below to securely connect your Google Calendar. 
            Your AI agent will be able to check availability and book appointments directly.
          </p>
        </AlertDescription>
      </Alert>

      <Button
        onClick={connectGoogle}
        disabled={isConnecting}
        className="w-full bg-white hover:bg-gray-50 text-gray-700 border shadow-sm"
        size="lg"
      >
        {isConnecting ? (
          <Loader2 className="h-5 w-5 mr-2 animate-spin" />
        ) : (
          <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
        )}
        {isConnecting ? 'Connecting...' : 'Connect Google Calendar'}
      </Button>
    </div>
  );
};

export const RetellCalendarSetup: React.FC = () => {
  const [config, setConfig] = useState<CalendarConfig>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  
  // Cal.com fields
  const [calApiKey, setCalApiKey] = useState('');
  const [calEventTypeId, setCalEventTypeId] = useState('');
  
  // Google Calendar fields
  const [googleEnabled, setGoogleEnabled] = useState(false);

  // Load existing config
  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('user_credentials')
        .select('credential_key, credential_value_encrypted')
        .eq('user_id', user.id)
        .in('service_name', ['calcom', 'google_calendar']);

      if (data) {
        const configData: CalendarConfig = {};
        data.forEach(cred => {
          if (cred.credential_key === 'calcom_api_key') {
            configData.calcom_api_key = cred.credential_value_encrypted ? '••••••••' : '';
          }
          if (cred.credential_key === 'calcom_event_type_id') {
            setCalEventTypeId(cred.credential_value_encrypted || '');
            configData.calcom_event_type_id = cred.credential_value_encrypted;
          }
          if (cred.credential_key === 'google_calendar_enabled') {
            setGoogleEnabled(cred.credential_value_encrypted === 'true');
            configData.google_calendar_enabled = cred.credential_value_encrypted === 'true';
          }
        });
        setConfig(configData);
      }
    } catch (error) {
      console.error('Failed to load calendar config:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveCalComConfig = async () => {
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Save API key - delete existing first, then insert
      if (calApiKey) {
        await supabase
          .from('user_credentials')
          .delete()
          .eq('user_id', user.id)
          .eq('service_name', 'calcom')
          .eq('credential_key', 'calcom_api_key');

        await supabase
          .from('user_credentials')
          .insert({
            user_id: user.id,
            service_name: 'calcom',
            credential_key: 'calcom_api_key',
            credential_value_encrypted: calApiKey,
          });
      }

      // Save Event Type ID
      if (calEventTypeId) {
        await supabase
          .from('user_credentials')
          .delete()
          .eq('user_id', user.id)
          .eq('service_name', 'calcom')
          .eq('credential_key', 'calcom_event_type_id');

        await supabase
          .from('user_credentials')
          .insert({
            user_id: user.id,
            service_name: 'calcom',
            credential_key: 'calcom_event_type_id',
            credential_value_encrypted: calEventTypeId,
          });
      }

      toast.success('Cal.com configuration saved!');
      setCalApiKey('');
      loadConfig();
    } catch (error: any) {
      console.error('Save error:', error);
      toast.error(error.message || 'Failed to save configuration');
    } finally {
      setIsSaving(false);
    }
  };

  const testCalComConnection = async () => {
    setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('calendar-integration', {
        body: { action: 'test_calcom' }
      });

      if (error) throw error;
      
      setTestResult('success');
      toast.success('Cal.com connection successful!');
    } catch (error: any) {
      setTestResult('error');
      toast.error('Cal.com connection failed: ' + (error.message || 'Unknown error'));
    }
  };

  const copyWebhookUrl = () => {
    const webhookUrl = `https://emonjusymdripmkvtttc.supabase.co/functions/v1/calendar-integration`;
    navigator.clipboard.writeText(webhookUrl);
    toast.success('Webhook URL copied to clipboard!');
  };

  const retellFunctionConfig = `{
  "name": "check_calendar_availability",
  "description": "Check available time slots for booking appointments",
  "url": "https://emonjusymdripmkvtttc.supabase.co/functions/v1/calendar-integration",
  "speak_during_execution": true,
  "speak_after_execution": true
}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Calendar Integration for Retell AI
        </CardTitle>
        <CardDescription>
          Enable your AI agent to check availability and book appointments
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Tabs defaultValue="calcom" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="calcom" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Cal.com (Recommended)
            </TabsTrigger>
            <TabsTrigger value="google" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Direct Google Calendar
            </TabsTrigger>
          </TabsList>

          {/* CAL.COM TAB */}
          <TabsContent value="calcom" className="space-y-6 mt-6">
            {/* Setup Steps */}
            <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4 space-y-4">
              <h4 className="font-semibold flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                Quick Setup Guide
              </h4>
              
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <Badge variant="outline" className="mt-0.5 shrink-0">1</Badge>
                  <div>
                    <p className="font-medium">Create Cal.com Account</p>
                    <p className="text-sm text-muted-foreground">
                      Sign up at{' '}
                      <a 
                        href="https://cal.com" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary hover:underline inline-flex items-center gap-1"
                      >
                        cal.com <ExternalLink className="h-3 w-3" />
                      </a>
                      {' '}and connect your Google Calendar
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Badge variant="outline" className="mt-0.5 shrink-0">2</Badge>
                  <div>
                    <p className="font-medium">Create Event Type</p>
                    <p className="text-sm text-muted-foreground">
                      Go to Event Types → New → Configure your meeting (15/30/60 min)
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Badge variant="outline" className="mt-0.5 shrink-0">3</Badge>
                  <div>
                    <p className="font-medium">Get Credentials</p>
                    <p className="text-sm text-muted-foreground">
                      Event Type ID: Check URL (e.g., /event-type/<strong>1427703</strong>)<br/>
                      API Key: Settings → Developer → API Keys
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Badge variant="outline" className="mt-0.5 shrink-0">4</Badge>
                  <div>
                    <p className="font-medium">Configure in Retell</p>
                    <p className="text-sm text-muted-foreground">
                      Add "Book Calendar" function in Retell dashboard with your credentials
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Configuration Form */}
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="cal-api-key">
                    Cal.com API Key
                    {config.calcom_api_key && (
                      <Badge variant="secondary" className="ml-2">Configured</Badge>
                    )}
                  </Label>
                  <Input
                    id="cal-api-key"
                    type="password"
                    placeholder="cal_live_..."
                    value={calApiKey}
                    onChange={(e) => setCalApiKey(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="event-type-id">
                    Event Type ID
                    {config.calcom_event_type_id && (
                      <Badge variant="secondary" className="ml-2">Configured</Badge>
                    )}
                  </Label>
                  <Input
                    id="event-type-id"
                    placeholder="1427703"
                    value={calEventTypeId}
                    onChange={(e) => setCalEventTypeId(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={saveCalComConfig}
                  disabled={isSaving || (!calApiKey && !calEventTypeId)}
                >
                  {isSaving ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle className="h-4 w-4 mr-2" />
                  )}
                  Save Configuration
                </Button>

                <Button
                  variant="outline"
                  onClick={testCalComConnection}
                  disabled={!config.calcom_api_key}
                >
                  Test Connection
                </Button>
              </div>

              {testResult && (
                <Alert className={testResult === 'success' ? 'border-green-500' : 'border-red-500'}>
                  <AlertDescription>
                    {testResult === 'success' 
                      ? '✅ Cal.com connection successful!' 
                      : '❌ Connection failed. Check your API key.'}
                  </AlertDescription>
                </Alert>
              )}
            </div>

            {/* Retell Configuration */}
            <div className="space-y-3 pt-4 border-t">
              <h4 className="font-semibold flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Add to Retell Agent
              </h4>
              <p className="text-sm text-muted-foreground">
                In your Retell AI dashboard, add a "Book Calendar" custom function with your Cal.com credentials.
              </p>
              <Button
                variant="outline"
                onClick={() => window.open('https://dashboard.retellai.com', '_blank')}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Open Retell Dashboard
              </Button>
            </div>
          </TabsContent>

          {/* GOOGLE CALENDAR TAB */}
          <TabsContent value="google" className="space-y-6 mt-6">
            <GoogleCalendarConnect />

            {/* Webhook URL for Retell */}
            <div className="space-y-3">
              <Label>Retell Custom Function URL</Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value="https://emonjusymdripmkvtttc.supabase.co/functions/v1/calendar-integration"
                  className="font-mono text-sm"
                />
                <Button variant="outline" size="icon" onClick={copyWebhookUrl}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Use this URL as the webhook endpoint for Retell custom functions
              </p>
            </div>

            {/* Function Configuration */}
            <div className="space-y-3">
              <Label>Retell Function Configuration</Label>
              <div className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto">
                <pre className="text-sm font-mono whitespace-pre-wrap">{retellFunctionConfig}</pre>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(retellFunctionConfig);
                  toast.success('Configuration copied!');
                }}
              >
                <Copy className="h-4 w-4 mr-2" />
                Copy Configuration
              </Button>
            </div>

            {/* Available Actions */}
            <div className="space-y-3">
              <h4 className="font-semibold">Available Actions</h4>
              <div className="grid gap-2">
                <div className="flex items-center gap-2 p-2 border rounded">
                  <Badge>get_available_slots</Badge>
                  <span className="text-sm text-muted-foreground">Get available time slots for a date range</span>
                </div>
                <div className="flex items-center gap-2 p-2 border rounded">
                  <Badge>book_appointment</Badge>
                  <span className="text-sm text-muted-foreground">Book an appointment at a specific time</span>
                </div>
                <div className="flex items-center gap-2 p-2 border rounded">
                  <Badge>cancel_appointment</Badge>
                  <span className="text-sm text-muted-foreground">Cancel an existing appointment</span>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default RetellCalendarSetup;
