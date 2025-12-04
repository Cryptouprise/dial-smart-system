import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Bot, Volume2, Mic, FileText, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface ChatbotSettingsState {
  voiceEnabled: boolean;
  voiceId: string;
  autoSpeak: boolean;
  customReportInstructions: string;
  reportMetrics: string[];
  aiActionsEnabled: boolean;
}

const ELEVENLABS_VOICES = [
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah (Female)' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George (Male)' },
  { id: '9BWtsMINqrJLrRacOk9x', name: 'Aria (Female)' },
  { id: 'CwhRBWXzGAHq8TQ4Fs17', name: 'Roger (Male)' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura (Female)' },
  { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie (Male)' },
  { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte (Female)' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel (Male)' },
];

const REPORT_METRICS_OPTIONS = [
  { id: 'total_calls', label: 'Total Calls Made' },
  { id: 'connected_calls', label: 'Connected Calls' },
  { id: 'answer_rate', label: 'Answer Rate' },
  { id: 'appointments_set', label: 'Appointments Set' },
  { id: 'avg_call_duration', label: 'Average Call Duration' },
  { id: 'sms_sent', label: 'SMS Sent' },
  { id: 'sms_received', label: 'SMS Received' },
  { id: 'callbacks_scheduled', label: 'Callbacks Scheduled' },
  { id: 'dnc_added', label: 'DNC Numbers Added' },
  { id: 'wins', label: 'Daily Wins' },
  { id: 'improvements', label: 'Areas for Improvement' },
  { id: 'failures', label: 'Failures & Issues' },
  { id: 'recommendations', label: 'AI Recommendations' },
];

const ChatbotSettings: React.FC = () => {
  const [settings, setSettings] = useState<ChatbotSettingsState>({
    voiceEnabled: true,
    voiceId: 'EXAVITQu4vr4xnSDxMaL',
    autoSpeak: false,
    customReportInstructions: '',
    reportMetrics: ['total_calls', 'connected_calls', 'answer_rate', 'appointments_set', 'wins', 'improvements', 'recommendations'],
    aiActionsEnabled: true,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('ai_chatbot_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSettings({
          voiceEnabled: data.voice_enabled ?? true,
          voiceId: data.voice_id ?? 'EXAVITQu4vr4xnSDxMaL',
          autoSpeak: data.auto_speak ?? false,
          customReportInstructions: data.custom_report_instructions ?? '',
          reportMetrics: data.report_metrics ?? ['total_calls', 'connected_calls', 'answer_rate', 'appointments_set', 'wins', 'improvements', 'recommendations'],
          aiActionsEnabled: data.ai_actions_enabled ?? true,
        });
      }
    } catch (error) {
      console.error('Error loading chatbot settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('ai_chatbot_settings')
        .upsert({
          user_id: user.id,
          voice_enabled: settings.voiceEnabled,
          voice_id: settings.voiceId,
          auto_speak: settings.autoSpeak,
          custom_report_instructions: settings.customReportInstructions,
          report_metrics: settings.reportMetrics,
          ai_actions_enabled: settings.aiActionsEnabled,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      if (error) throw error;

      toast({
        title: 'Settings Saved',
        description: 'AI Assistant settings have been updated.',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save settings.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const toggleMetric = (metricId: string) => {
    setSettings(prev => ({
      ...prev,
      reportMetrics: prev.reportMetrics.includes(metricId)
        ? prev.reportMetrics.filter(m => m !== metricId)
        : [...prev.reportMetrics, metricId],
    }));
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Loading settings...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          AI Assistant Settings
        </CardTitle>
        <CardDescription>Configure voice, reports, and AI capabilities</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Voice Settings */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Volume2 className="h-4 w-4" />
            Voice Settings
          </h3>
          
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base font-medium">Enable Voice</Label>
              <p className="text-sm text-muted-foreground">Talk to the AI assistant using your microphone</p>
            </div>
            <Switch
              checked={settings.voiceEnabled}
              onCheckedChange={(checked) => setSettings(prev => ({ ...prev, voiceEnabled: checked }))}
            />
          </div>

          {settings.voiceEnabled && (
            <>
              <div className="space-y-2">
                <Label>AI Voice</Label>
                <Select
                  value={settings.voiceId}
                  onValueChange={(value) => setSettings(prev => ({ ...prev, voiceId: value }))}
                >
                  <SelectTrigger className="max-w-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ELEVENLABS_VOICES.map(voice => (
                      <SelectItem key={voice.id} value={voice.id}>
                        {voice.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Powered by ElevenLabs</p>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base font-medium">Auto-Speak Responses</Label>
                  <p className="text-sm text-muted-foreground">Automatically read AI responses aloud</p>
                </div>
                <Switch
                  checked={settings.autoSpeak}
                  onCheckedChange={(checked) => setSettings(prev => ({ ...prev, autoSpeak: checked }))}
                />
              </div>
            </>
          )}
        </div>

        {/* Report Settings */}
        <div className="space-y-4 pt-4 border-t">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Daily Report Configuration
          </h3>
          
          <div className="space-y-2">
            <Label>Custom Report Instructions</Label>
            <Textarea
              value={settings.customReportInstructions}
              onChange={(e) => setSettings(prev => ({ ...prev, customReportInstructions: e.target.value }))}
              placeholder="Add any custom instructions for your daily reports... e.g., 'Focus on conversion metrics', 'Compare to last week', 'Include top performing agents'"
              rows={3}
              className="max-w-md"
            />
            <p className="text-xs text-muted-foreground">
              These instructions will be included when generating your daily reports
            </p>
          </div>

          <div className="space-y-2">
            <Label>Report Metrics</Label>
            <p className="text-xs text-muted-foreground mb-2">Select what to include in your daily reports</p>
            <div className="grid grid-cols-2 gap-2 max-w-md">
              {REPORT_METRICS_OPTIONS.map(metric => (
                <div
                  key={metric.id}
                  onClick={() => toggleMetric(metric.id)}
                  className={`p-2 rounded-md border cursor-pointer text-sm transition-colors ${
                    settings.reportMetrics.includes(metric.id)
                      ? 'bg-primary/10 border-primary text-primary'
                      : 'bg-muted/50 hover:bg-muted'
                  }`}
                >
                  {metric.label}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* AI Actions Settings */}
        <div className="space-y-4 pt-4 border-t">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            AI Capabilities
          </h3>
          
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base font-medium">Enable AI Actions</Label>
              <p className="text-sm text-muted-foreground">Allow AI to perform actions like importing numbers, changing settings, etc.</p>
            </div>
            <Switch
              checked={settings.aiActionsEnabled}
              onCheckedChange={(checked) => setSettings(prev => ({ ...prev, aiActionsEnabled: checked }))}
            />
          </div>

          {settings.aiActionsEnabled && (
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-sm font-medium mb-2">Available AI Actions:</p>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• Import and purchase phone numbers</li>
                <li>• Generate and view reports</li>
                <li>• Update dialer and campaign settings</li>
                <li>• Manage leads and pipeline</li>
                <li>• Configure Retell AI agents</li>
                <li>• Access all dashboard features</li>
              </ul>
            </div>
          )}
        </div>

        <Button onClick={handleSaveSettings} disabled={isSaving} className="mt-4">
          {isSaving ? 'Saving...' : 'Save Settings'}
        </Button>
      </CardContent>
    </Card>
  );
};

export default ChatbotSettings;
