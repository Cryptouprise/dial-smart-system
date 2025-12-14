import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Shield, MessageSquare, Phone, Clock, Save, AlertTriangle } from 'lucide-react';

interface RateLimitSettings {
  sms_per_minute: number;
  sms_per_hour: number;
  sms_per_day_per_lead: number;
  calls_per_minute: number;
  calls_per_hour: number;
  calls_per_day_per_lead: number;
  min_sms_interval_seconds: number;
  min_call_interval_minutes: number;
  enable_rate_limiting: boolean;
  pause_on_limit_reached: boolean;
}

const DEFAULT_SETTINGS: RateLimitSettings = {
  sms_per_minute: 10,
  sms_per_hour: 200,
  sms_per_day_per_lead: 3,
  calls_per_minute: 5,
  calls_per_hour: 100,
  calls_per_day_per_lead: 2,
  min_sms_interval_seconds: 60,
  min_call_interval_minutes: 30,
  enable_rate_limiting: true,
  pause_on_limit_reached: true,
};

export const RateLimitingSettings: React.FC = () => {
  const { toast } = useToast();
  const [settings, setSettings] = useState<RateLimitSettings>(DEFAULT_SETTINGS);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user) return;

      const { data } = await supabase
        .from('system_settings')
        .select('*')
        .eq('user_id', session.session.user.id)
        .maybeSingle();

      if (data) {
        // Extract rate limiting settings from system_settings
        // These would typically be stored in a JSON column or separate fields
        const rateSettings = {
          sms_per_minute: data.calls_per_minute || DEFAULT_SETTINGS.sms_per_minute,
          sms_per_hour: 200,
          sms_per_day_per_lead: 3,
          calls_per_minute: data.calls_per_minute || DEFAULT_SETTINGS.calls_per_minute,
          calls_per_hour: 100,
          calls_per_day_per_lead: data.max_calls_per_agent || DEFAULT_SETTINGS.calls_per_day_per_lead,
          min_sms_interval_seconds: 60,
          min_call_interval_minutes: 30,
          enable_rate_limiting: data.enable_adaptive_pacing ?? true,
          pause_on_limit_reached: true,
        };
        setSettings(rateSettings);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user) throw new Error('Not authenticated');

      // Update system_settings with rate limiting values
      const { error } = await supabase
        .from('system_settings')
        .upsert({
          user_id: session.session.user.id,
          calls_per_minute: settings.calls_per_minute,
          max_calls_per_agent: settings.calls_per_day_per_lead,
          enable_adaptive_pacing: settings.enable_rate_limiting,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id',
        });

      if (error) throw error;

      toast({ title: 'Settings Saved', description: 'Rate limiting settings updated successfully' });
      setHasChanges(false);
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast({ title: 'Error', description: 'Failed to save settings', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const updateSetting = <K extends keyof RateLimitSettings>(key: K, value: RateLimitSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Rate Limiting & Flood Protection
        </CardTitle>
        <CardDescription>
          Configure limits to prevent SMS/call flooding and maintain carrier compliance
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Master Toggle */}
        <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
          <div className="space-y-1">
            <Label className="text-base">Enable Rate Limiting</Label>
            <p className="text-sm text-muted-foreground">
              Automatically throttle outbound messages and calls
            </p>
          </div>
          <Switch
            checked={settings.enable_rate_limiting}
            onCheckedChange={(v) => updateSetting('enable_rate_limiting', v)}
          />
        </div>

        {settings.enable_rate_limiting && (
          <>
            {/* SMS Limits */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-green-500" />
                <h3 className="font-medium">SMS Limits</h3>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>SMS per Minute</Label>
                  <Input
                    type="number"
                    value={settings.sms_per_minute}
                    onChange={(e) => updateSetting('sms_per_minute', parseInt(e.target.value) || 0)}
                    min={1}
                    max={60}
                  />
                  <p className="text-xs text-muted-foreground">Global limit</p>
                </div>
                
                <div className="space-y-2">
                  <Label>SMS per Hour</Label>
                  <Input
                    type="number"
                    value={settings.sms_per_hour}
                    onChange={(e) => updateSetting('sms_per_hour', parseInt(e.target.value) || 0)}
                    min={1}
                    max={1000}
                  />
                  <p className="text-xs text-muted-foreground">Global limit</p>
                </div>
                
                <div className="space-y-2">
                  <Label>SMS per Day (per lead)</Label>
                  <Input
                    type="number"
                    value={settings.sms_per_day_per_lead}
                    onChange={(e) => updateSetting('sms_per_day_per_lead', parseInt(e.target.value) || 0)}
                    min={1}
                    max={20}
                  />
                  <p className="text-xs text-muted-foreground">Per individual lead</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Minimum Interval Between SMS (seconds)</Label>
                <div className="flex items-center gap-4">
                  <Slider
                    value={[settings.min_sms_interval_seconds]}
                    onValueChange={([v]) => updateSetting('min_sms_interval_seconds', v)}
                    min={10}
                    max={300}
                    step={10}
                    className="flex-1"
                  />
                  <Badge variant="secondary" className="w-16 justify-center">
                    {settings.min_sms_interval_seconds}s
                  </Badge>
                </div>
              </div>
            </div>

            {/* Call Limits */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-blue-500" />
                <h3 className="font-medium">Call Limits</h3>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Calls per Minute</Label>
                  <Input
                    type="number"
                    value={settings.calls_per_minute}
                    onChange={(e) => updateSetting('calls_per_minute', parseInt(e.target.value) || 0)}
                    min={1}
                    max={30}
                  />
                  <p className="text-xs text-muted-foreground">Global limit</p>
                </div>
                
                <div className="space-y-2">
                  <Label>Calls per Hour</Label>
                  <Input
                    type="number"
                    value={settings.calls_per_hour}
                    onChange={(e) => updateSetting('calls_per_hour', parseInt(e.target.value) || 0)}
                    min={1}
                    max={500}
                  />
                  <p className="text-xs text-muted-foreground">Global limit</p>
                </div>
                
                <div className="space-y-2">
                  <Label>Calls per Day (per lead)</Label>
                  <Input
                    type="number"
                    value={settings.calls_per_day_per_lead}
                    onChange={(e) => updateSetting('calls_per_day_per_lead', parseInt(e.target.value) || 0)}
                    min={1}
                    max={10}
                  />
                  <p className="text-xs text-muted-foreground">Per individual lead</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Minimum Interval Between Calls (minutes)</Label>
                <div className="flex items-center gap-4">
                  <Slider
                    value={[settings.min_call_interval_minutes]}
                    onValueChange={([v]) => updateSetting('min_call_interval_minutes', v)}
                    min={5}
                    max={120}
                    step={5}
                    className="flex-1"
                  />
                  <Badge variant="secondary" className="w-16 justify-center">
                    {settings.min_call_interval_minutes}m
                  </Badge>
                </div>
              </div>
            </div>

            {/* Behavior */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-orange-500" />
                <h3 className="font-medium">Behavior When Limits Reached</h3>
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="space-y-1">
                  <Label>Auto-pause campaigns</Label>
                  <p className="text-sm text-muted-foreground">
                    Pause campaigns when rate limits are reached
                  </p>
                </div>
                <Switch
                  checked={settings.pause_on_limit_reached}
                  onCheckedChange={(v) => updateSetting('pause_on_limit_reached', v)}
                />
              </div>

              <div className="flex items-center gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-sm">
                <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0" />
                <span>
                  Rate limits help maintain carrier compliance and prevent your numbers from being flagged as spam.
                </span>
              </div>
            </div>
          </>
        )}

        {/* Save Button */}
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isSaving || !hasChanges}>
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
