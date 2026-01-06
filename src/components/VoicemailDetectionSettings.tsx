import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { PhoneOff, Zap, DollarSign, Loader2, Info, MessageSquare, PhoneForwarded, Phone, Settings2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface VoicemailDetectionSettingsProps {
  agentId: string;
  agentName: string;
  onSettingsChanged?: () => void;
}

interface VoicemailSettings {
  enabled: boolean;
  numberType: 'retell' | 'twilio_sip';
  provider: 'retell' | 'twilio_amd';
  behavior: 'hangup' | 'leave_message';
  voicemail_message: string;
  detection_timeout_ms: number;
  // Twilio AMD specific settings
  machine_detection_speech_threshold: number;
  machine_detection_speech_end_threshold: number;
  machine_detection_silence_timeout: number;
}

export const VoicemailDetectionSettings: React.FC<VoicemailDetectionSettingsProps> = ({
  agentId,
  agentName,
  onSettingsChanged
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [settings, setSettings] = useState<VoicemailSettings>({
    enabled: false,
    numberType: 'retell',
    provider: 'retell',
    behavior: 'hangup',
    voicemail_message: '',
    detection_timeout_ms: 30000,
    machine_detection_speech_threshold: 2500,
    machine_detection_speech_end_threshold: 1200,
    machine_detection_silence_timeout: 5000,
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
          numberType: vm.provider === 'twilio' ? 'twilio_sip' : 'retell',
          provider: vm.provider === 'twilio' ? 'twilio_amd' : 'retell',
          behavior: vm.voicemail_message ? 'leave_message' : 'hangup',
          voicemail_message: vm.voicemail_message || '',
          detection_timeout_ms: vm.voicemail_detection_timeout_ms || 30000,
          machine_detection_speech_threshold: vm.machine_detection_speech_threshold || 2500,
          machine_detection_speech_end_threshold: vm.machine_detection_speech_end_threshold || 1200,
          machine_detection_silence_timeout: vm.machine_detection_silence_timeout || 5000,
        });
      } else {
        setSettings({
          enabled: false,
          numberType: 'retell',
          provider: 'retell',
          behavior: 'hangup',
          voicemail_message: '',
          detection_timeout_ms: 30000,
          machine_detection_speech_threshold: 2500,
          machine_detection_speech_end_threshold: 1200,
          machine_detection_silence_timeout: 5000,
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

      let behaviorMsg = '';
      if (settings.provider === 'twilio_amd') {
        behaviorMsg = 'Using Twilio AMD for fast voicemail detection (2-3 seconds).';
      } else {
        behaviorMsg = settings.behavior === 'leave_message' 
          ? 'Agent will leave a message when voicemail is detected.'
          : 'Calls will hang up within 3-5 seconds when voicemail is detected.';
      }

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
                  Choose between Retell's built-in detection or Twilio AMD for SIP trunk users.
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
            {/* Phone Number Type Selection */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Phone className="h-4 w-4" />
                Phone Number Type
              </Label>
              <Select
                value={settings.numberType}
                onValueChange={(value: 'retell' | 'twilio_sip') => {
                  const newProvider = value === 'retell' ? 'retell' : settings.provider;
                  setSettings(s => ({ ...s, numberType: value, provider: newProvider }));
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="retell">
                    <div className="flex flex-col">
                      <span>Retell Number</span>
                      <span className="text-xs text-muted-foreground">Uses Retell's built-in detection</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="twilio_sip">
                    <div className="flex flex-col">
                      <span>Twilio SIP Trunk</span>
                      <span className="text-xs text-muted-foreground">Choose between Twilio AMD or Retell detection</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Detection Method - Only for Twilio SIP */}
            {settings.numberType === 'twilio_sip' && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Settings2 className="h-4 w-4" />
                  Detection Method
                </Label>
                <Select
                  value={settings.provider}
                  onValueChange={(value: 'retell' | 'twilio_amd') => setSettings(s => ({ ...s, provider: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="twilio_amd">
                      <div className="flex flex-col">
                        <span>Twilio AMD (Recommended)</span>
                        <span className="text-xs text-muted-foreground">Faster detection (2-3 sec), runs before audio reaches Retell</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="retell">
                      <div className="flex flex-col">
                        <span>Retell Built-in</span>
                        <span className="text-xs text-muted-foreground">Audio analysis with sub-100ms latency after detection</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Contextual Help */}
            <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
              {settings.numberType === 'retell' ? (
                <p>
                  <strong>Retell Numbers:</strong> Using Retell's built-in voicemail detection. This analyzes audio in real-time with sub-100ms latency and works with all Retell numbers.
                </p>
              ) : settings.provider === 'twilio_amd' ? (
                <p>
                  <strong>Twilio AMD:</strong> Using Twilio's Answering Machine Detection. This runs before audio reaches Retell and can detect voicemail in 2-3 seconds. Best for high-volume outbound campaigns.
                </p>
              ) : (
                <p>
                  <strong>Retell Detection with Twilio:</strong> Using Retell's built-in detection with your Twilio numbers. Detection happens after the call connects to Retell.
                </p>
              )}
            </div>

            {/* Behavior Selection - Only for Retell detection */}
            {settings.provider === 'retell' && (
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
            )}

            {/* Twilio AMD - Always hangs up */}
            {settings.provider === 'twilio_amd' && (
              <div className="text-sm p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <p className="text-blue-800 dark:text-blue-300">
                  <strong>Note:</strong> Twilio AMD detects voicemail before the call connects to Retell. When voicemail is detected, the call will hang up immediately to save costs.
                </p>
              </div>
            )}

            {/* Voicemail Message (only if leaving a message with Retell) */}
            {settings.provider === 'retell' && settings.behavior === 'leave_message' && (
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

            {/* Advanced Twilio AMD Settings */}
            {settings.provider === 'twilio_amd' && (
              <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-muted-foreground">
                    <Settings2 className="h-4 w-4" />
                    Advanced AMD Settings
                    <span className="ml-auto text-xs">{showAdvanced ? '▼' : '▶'}</span>
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-4 pt-4">
                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="speech-threshold" className="text-sm">
                        Speech Threshold (ms)
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <Info className="h-3 w-3 ml-1 inline text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              Max speech duration for a human greeting before considered a machine. Default: 2500ms
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </Label>
                      <Input
                        id="speech-threshold"
                        type="number"
                        value={settings.machine_detection_speech_threshold}
                        onChange={(e) => setSettings(s => ({ ...s, machine_detection_speech_threshold: parseInt(e.target.value) || 2500 }))}
                        min={1000}
                        max={5000}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="speech-end-threshold" className="text-sm">
                        Speech End Threshold (ms)
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <Info className="h-3 w-3 ml-1 inline text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              Silence duration to consider speech ended. Default: 1200ms
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </Label>
                      <Input
                        id="speech-end-threshold"
                        type="number"
                        value={settings.machine_detection_speech_end_threshold}
                        onChange={(e) => setSettings(s => ({ ...s, machine_detection_speech_end_threshold: parseInt(e.target.value) || 1200 }))}
                        min={500}
                        max={3000}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="silence-timeout" className="text-sm">
                        Silence Timeout (ms)
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <Info className="h-3 w-3 ml-1 inline text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              Initial silence before assuming machine. Default: 5000ms
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </Label>
                      <Input
                        id="silence-timeout"
                        type="number"
                        value={settings.machine_detection_silence_timeout}
                        onChange={(e) => setSettings(s => ({ ...s, machine_detection_silence_timeout: parseInt(e.target.value) || 5000 }))}
                        min={2000}
                        max={10000}
                      />
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* How it works - Retell */}
            {settings.provider === 'retell' && (
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
            )}

            {/* How it works - Twilio AMD */}
            {settings.provider === 'twilio_amd' && (
              <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3 space-y-1">
                <p className="font-medium">How Twilio AMD Works:</p>
                <ol className="list-decimal list-inside space-y-1 text-xs">
                  <li>Twilio analyzes the call BEFORE connecting to Retell</li>
                  <li>Detection happens in 2-3 seconds for most voicemails</li>
                  <li>If voicemail detected, call hangs up immediately (no Retell minutes used)</li>
                  <li>If human detected, call connects to Retell agent normally</li>
                  <li>You only pay for successful human connections</li>
                </ol>
              </div>
            )}

            {/* Pro Tip for prompt-based detection */}
            {settings.provider === 'retell' && (
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
            )}
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
