import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { PhoneOff, Zap, DollarSign, Loader2, Info, MessageSquare, PhoneForwarded } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface VoicemailDetectionSettingsProps {
  agentId: string;
  agentName: string;
  onSettingsChanged?: () => void;
}

interface VoicemailSettings {
  enabled: boolean;
  behavior: 'hangup' | 'leave_message';
  voicemail_message: string;
  detection_timeout_ms: number;
}

export const VoicemailDetectionSettings: React.FC<VoicemailDetectionSettingsProps> = ({
  agentId,
  agentName,
  onSettingsChanged
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [settings, setSettings] = useState<VoicemailSettings>({
    enabled: false,
    behavior: 'hangup',
    voicemail_message: '',
    detection_timeout_ms: 30000,
  });
  const { toast } = useToast();

  useEffect(() => {
    loadSettings();
  }, [agentId]);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('retell-agent-management', {
        body: { action: 'get_voicemail_settings', agentId }
      });

      if (error) throw error;

      if (data?.voicemail_detection) {
        const vm = data.voicemail_detection;
        setSettings({
          enabled: true,
          behavior: vm.voicemail_message ? 'leave_message' : 'hangup',
          voicemail_message: vm.voicemail_message || '',
          detection_timeout_ms: vm.voicemail_detection_timeout_ms || 30000,
        });
      } else {
        setSettings({
          enabled: false,
          behavior: 'hangup',
          voicemail_message: '',
          detection_timeout_ms: 30000,
        });
      }
    } catch (err: any) {
      console.error('Failed to load voicemail settings:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const saveSettings = async () => {
    setIsSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('retell-agent-management', {
        body: {
          action: 'update_voicemail_settings',
          agentId,
          voicemailDetection: settings,
        }
      });

      if (error) throw error;

      const behaviorMsg = settings.behavior === 'leave_message' 
        ? 'Agent will leave a message when voicemail is detected.'
        : 'Calls will hang up within 3-5 seconds when voicemail is detected.';

      toast({
        title: settings.enabled ? 'Voicemail Detection Enabled' : 'Voicemail Detection Disabled',
        description: settings.enabled ? behaviorMsg : 'Voicemail detection has been turned off.',
      });

      onSettingsChanged?.();
    } catch (err: any) {
      toast({
        title: 'Failed to Save',
        description: err.message || 'Could not update voicemail settings',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <PhoneOff className="h-5 w-5" />
              Voicemail Detection
            </CardTitle>
            <CardDescription>
              Automatically detect voicemails and take action
            </CardDescription>
          </div>
          <Badge variant={settings.enabled ? 'default' : 'outline'}>
            {settings.enabled ? 'Enabled' : 'Disabled'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Cost Savings Info */}
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-green-800 dark:text-green-300">Save ~$0.047 per voicemail</p>
              <p className="text-green-700 dark:text-green-400">
                Without detection: ~45 sec billed ($0.0525). With detection: ~5 sec billed ($0.006)
              </p>
            </div>
          </div>
        </div>

        {/* Enable Toggle */}
        <div className="flex items-center justify-between py-2">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-500" />
            <Label htmlFor="vm-enabled" className="font-medium">Enable Voicemail Detection</Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-4 w-4 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  Retell's built-in voicemail detection analyzes audio in real-time with sub-100ms latency. When voicemail is detected, it can hang up or leave a message.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Switch
            id="vm-enabled"
            checked={settings.enabled}
            onCheckedChange={(checked) => setSettings(s => ({ ...s, enabled: checked }))}
          />
        </div>

        {settings.enabled && (
          <>
            {/* Behavior Selection */}
            <div className="space-y-2">
              <Label>When Voicemail is Detected</Label>
              <Select
                value={settings.behavior}
                onValueChange={(value: 'hangup' | 'leave_message') => setSettings(s => ({ ...s, behavior: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hangup">
                    <div className="flex items-center gap-2">
                      <PhoneOff className="h-4 w-4" />
                      Hang up immediately (recommended)
                    </div>
                  </SelectItem>
                  <SelectItem value="leave_message">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      Leave a voicemail message
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Voicemail Message (only if leaving a message) */}
            {settings.behavior === 'leave_message' && (
              <div className="space-y-2">
                <Label>Voicemail Message</Label>
                <Textarea
                  value={settings.voicemail_message}
                  onChange={(e) => setSettings(s => ({ ...s, voicemail_message: e.target.value }))}
                  placeholder="Hi {{first_name}}, this is [Your Name] from [Company]. I'm calling about [reason]. Please call us back at [phone number]. Thanks!"
                  rows={4}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Use dynamic variables like {'{{first_name}}'}, {'{{company}}'}, etc. The agent will wait for the beep and leave this message.
                </p>
              </div>
            )}

            {/* How it works */}
            <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3 space-y-1">
              <p className="font-medium">How Retell Voicemail Detection Works:</p>
              <ol className="list-decimal list-inside space-y-1 text-xs">
                <li>Real-time audio analysis runs for the first 3 minutes of each call</li>
                <li>Detection latency is under 100ms when voicemail is identified</li>
                <li>
                  {settings.behavior === 'hangup' 
                    ? 'Call hangs up immediately (~3-5 seconds total), saving call minutes'
                    : 'Agent waits for the beep and leaves your configured message'
                  }
                </li>
                <li>Call outcome is recorded as "voicemail_reached" for tracking</li>
              </ol>
            </div>

            {/* Pro Tip for prompt-based detection */}
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <PhoneForwarded className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-amber-800 dark:text-amber-300">Pro Tip: Boost Detection with Prompt Instructions</p>
                  <p className="text-amber-700 dark:text-amber-400 text-xs mt-1">
                    For best results, also add voicemail detection instructions to your agent's prompt. Go to the LLM tab and use the "Quick Insert Snippets" to add the Voicemail Detection prompt.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}

        <Button
          onClick={saveSettings}
          disabled={isSaving}
          className="w-full"
        >
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            'Save Settings'
          )}
        </Button>
      </CardContent>
    </Card>
  );
};
