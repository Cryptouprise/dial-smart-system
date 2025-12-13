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
  Link2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface CalendarConfig {
  calcom_api_key?: string;
  calcom_event_type_id?: string;
  google_calendar_enabled?: boolean;
  google_calendar_id?: string;
}

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
            <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
              <Info className="h-4 w-4" />
              <AlertDescription>
                <strong>Direct Google Calendar Integration</strong><br/>
                This connects Retell directly to your Google Calendar without Cal.com.
                Your AI agent will be able to check availability and book appointments.
              </AlertDescription>
            </Alert>

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

            {/* Setup Link */}
            <Alert>
              <Link2 className="h-4 w-4" />
              <AlertDescription>
                <strong>Setup Required:</strong> You need to configure Google Calendar OAuth in Supabase.
                <Button
                  variant="link"
                  className="p-0 h-auto ml-2"
                  onClick={() => window.open('https://supabase.com/dashboard/project/emonjusymdripmkvtttc/auth/providers', '_blank')}
                >
                  Configure OAuth <ExternalLink className="h-3 w-3 ml-1" />
                </Button>
              </AlertDescription>
            </Alert>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default RetellCalendarSetup;
