import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { PhoneOff, Zap, Clock, DollarSign, Loader2, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface VoicemailDetectionSettingsProps {
  agentId: string;
  agentName: string;
  onSettingsChanged?: () => void;
}

interface VoicemailSettings {
  enabled: boolean;
  provider: 'twilio' | 'retell';
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
    provider: 'twilio',
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
        setSettings({
          enabled: true,
          provider: data.voicemail_detection.provider || 'twilio',
          detection_timeout_ms: data.voicemail_detection.voicemail_detection_timeout_ms || 30000,
        });
      } else {
        setSettings({
          enabled: false,
          provider: 'twilio',
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

      toast({
        title: settings.enabled ? 'Swift Hang-Up Enabled' : 'Voicemail Detection Disabled',
        description: settings.enabled
          ? 'Calls will now hang up within 3-5 seconds when voicemail is detected, saving you money.'
          : 'Voicemail detection has been turned off.',
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
              Swift Voicemail Hang-Up
            </CardTitle>
            <CardDescription>
              Automatically detect and hang up on voicemails in 3-5 seconds
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
            <Label htmlFor="vm-enabled" className="font-medium">Enable Swift Detection</Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-4 w-4 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  Uses Twilio's Answering Machine Detection (AMD) to detect voicemail within 3-5 seconds and immediately hang up, saving call minutes.
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
            {/* Detection Provider */}
            <div className="space-y-2">
              <Label>Detection Provider</Label>
              <Select
                value={settings.provider}
                onValueChange={(value: 'twilio' | 'retell') => setSettings(s => ({ ...s, provider: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="twilio">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Twilio AMD (Recommended - 3-5s detection)
                    </div>
                  </SelectItem>
                  <SelectItem value="retell">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Retell Built-in
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* How it works */}
            <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3 space-y-1">
              <p className="font-medium">How it works:</p>
              <ol className="list-decimal list-inside space-y-1 text-xs">
                <li>Call connects to recipient</li>
                <li>AMD listens for voicemail greeting patterns (&lt;100ms latency)</li>
                <li>If voicemail detected, call hangs up immediately (~3-5s total)</li>
                <li>Lead stays in workflow for retry</li>
              </ol>
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
