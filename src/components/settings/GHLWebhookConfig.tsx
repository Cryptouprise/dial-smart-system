import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Copy, RefreshCw, CheckCircle, Webhook, ExternalLink, Play, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface GHLWebhookConfigProps {
  isConnected: boolean;
}

const SUPABASE_URL = "https://emonjusymdripmkvtttc.supabase.co";

export const GHLWebhookConfig: React.FC<GHLWebhookConfigProps> = ({ isConnected }) => {
  const { toast } = useToast();
  const [webhookKey, setWebhookKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const webhookUrl = `${SUPABASE_URL}/functions/v1/ghl-webhook-trigger`;

  useEffect(() => {
    if (isConnected) {
      loadWebhookKey();
    }
  }, [isConnected]);

  const loadWebhookKey = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('ghl_sync_settings')
        .select('broadcast_webhook_key')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Error loading webhook key:', error);
        return;
      }

      setWebhookKey(data?.broadcast_webhook_key || null);
    } catch (error) {
      console.error('Error loading webhook key:', error);
    }
  };

  const generateWebhookKey = async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Generate a new key using the database function
      const { data: keyData, error: keyError } = await supabase
        .rpc('generate_webhook_key');

      if (keyError) throw keyError;

      const newKey = keyData as string;

      // Upsert the key to ghl_sync_settings
      const { error: upsertError } = await supabase
        .from('ghl_sync_settings')
        .upsert({
          user_id: user.id,
          broadcast_webhook_key: newKey,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id',
        });

      if (upsertError) throw upsertError;

      setWebhookKey(newKey);
      setTestResult(null);
      
      toast({
        title: "Webhook Key Generated",
        description: "Your new webhook key has been created. Remember to update any existing GHL workflows.",
      });
    } catch (error: any) {
      console.error('Error generating webhook key:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to generate webhook key",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const testWebhook = async () => {
    if (!webhookKey) return;
    
    setIsTesting(true);
    setTestResult(null);
    
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'test',
          webhook_key: webhookKey,
        }),
      });

      const result = await response.json();
      
      if (response.ok && result.success) {
        setTestResult({ 
          success: true, 
          message: 'Webhook is working correctly!' 
        });
        toast({
          title: "Test Successful",
          description: "Your webhook endpoint is working correctly.",
        });
      } else {
        setTestResult({ 
          success: false, 
          message: result.error || 'Test failed' 
        });
        toast({
          title: "Test Failed",
          description: result.error || "Webhook test failed",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      setTestResult({ 
        success: false, 
        message: error.message || 'Network error' 
      });
      toast({
        title: "Test Failed",
        description: "Could not reach webhook endpoint",
        variant: "destructive",
      });
    } finally {
      setIsTesting(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
    toast({
      title: "Copied!",
      description: `${label} copied to clipboard`,
    });
  };

  const ghlJsonBody = webhookKey ? JSON.stringify({
    action: "add_to_broadcast",
    webhook_key: webhookKey,
    broadcast_id: "YOUR_BROADCAST_ID_HERE",
    phone: "{{contact.phone}}",
    name: "{{contact.firstName}} {{contact.lastName}}",
    ghl_contact_id: "{{contact.id}}",
    email: "{{contact.email}}"
  }, null, 2) : '';

  if (!isConnected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Webhook className="h-5 w-5" />
            Voice Broadcast Webhook
          </CardTitle>
          <CardDescription>
            Connect to GHL first to configure webhook integration
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Please connect your GHL account in the Connection tab before setting up webhooks.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Webhook className="h-5 w-5" />
          Voice Broadcast Webhook Integration
        </CardTitle>
        <CardDescription>
          Allow GHL workflows to add contacts to voice broadcasts and receive call outcomes
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Webhook URL */}
        <div className="space-y-2">
          <Label>Webhook URL</Label>
          <div className="flex gap-2">
            <Input 
              value={webhookUrl} 
              readOnly 
              className="font-mono text-sm"
            />
            <Button 
              variant="outline" 
              size="icon"
              onClick={() => copyToClipboard(webhookUrl, 'Webhook URL')}
            >
              {copied === 'Webhook URL' ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Use this URL in your GHL workflow HTTP Request step
          </p>
        </div>

        {/* Webhook Key */}
        <div className="space-y-2">
          <Label>Webhook Key</Label>
          <div className="flex gap-2">
            <Input 
              value={webhookKey || 'No key generated'} 
              readOnly 
              type={webhookKey ? "password" : "text"}
              className="font-mono text-sm"
            />
            {webhookKey && (
              <Button 
                variant="outline" 
                size="icon"
                onClick={() => copyToClipboard(webhookKey, 'Webhook Key')}
              >
                {copied === 'Webhook Key' ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            )}
            <Button 
              variant="outline"
              onClick={generateWebhookKey}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              {webhookKey ? 'Regenerate' : 'Generate'}
            </Button>
          </div>
          {webhookKey && (
            <p className="text-xs text-muted-foreground">
              Keep this key secret. Regenerating will invalidate the old key.
            </p>
          )}
        </div>

        {/* Test Button */}
        {webhookKey && (
          <div className="flex items-center gap-4">
            <Button 
              variant="secondary"
              onClick={testWebhook}
              disabled={isTesting}
            >
              <Play className={`h-4 w-4 mr-2 ${isTesting ? 'animate-pulse' : ''}`} />
              Test Webhook
            </Button>
            {testResult && (
              <Badge variant={testResult.success ? "default" : "destructive"}>
                {testResult.message}
              </Badge>
            )}
          </div>
        )}

        {/* GHL Configuration Template */}
        {webhookKey && (
          <div className="space-y-3 p-4 bg-muted rounded-lg">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">GHL Workflow Configuration</Label>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => copyToClipboard(ghlJsonBody, 'JSON Body')}
              >
                <Copy className="h-4 w-4 mr-2" />
                Copy JSON
              </Button>
            </div>
            
            <p className="text-sm text-muted-foreground">
              In your GHL workflow, add an HTTP Request step with these settings:
            </p>

            <div className="space-y-2 text-sm">
              <div className="flex gap-2">
                <Badge variant="outline">Method</Badge>
                <span className="font-mono">POST</span>
              </div>
              <div className="flex gap-2">
                <Badge variant="outline">URL</Badge>
                <span className="font-mono text-xs break-all">{webhookUrl}</span>
              </div>
              <div className="flex gap-2">
                <Badge variant="outline">Content-Type</Badge>
                <span className="font-mono">application/json</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Request Body (JSON)</Label>
              <pre className="bg-background p-3 rounded text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                {ghlJsonBody}
              </pre>
            </div>

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Replace <code className="bg-background px-1 rounded">YOUR_BROADCAST_ID_HERE</code> with 
                the actual broadcast ID. You can find it in the broadcast settings or URL.
              </AlertDescription>
            </Alert>
          </div>
        )}

        {/* Callback Fields Info */}
        <div className="space-y-2 p-4 border rounded-lg">
          <Label className="text-base font-semibold">Data Sent Back to GHL</Label>
          <p className="text-sm text-muted-foreground">
            After each call completes, we'll update your GHL contacts with:
          </p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">Tag</Badge>
              <span>broadcast_answered, broadcast_voicemail_left, etc.</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">Field</Badge>
              <span>last_broadcast_date</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">Field</Badge>
              <span>broadcast_outcome</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">Field</Badge>
              <span>broadcast_dtmf_pressed</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">Field</Badge>
              <span>broadcast_callback_requested</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">Note</Badge>
              <span>Activity note with call summary</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Make sure to create these custom fields in GHL first using the "Setup Broadcast Fields" button in the Field Mapping tab.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default GHLWebhookConfig;
