
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import Navigation from '@/components/Navigation';
import EnhancedSpamDashboard from '@/components/EnhancedSpamDashboard';
import { useAiSmsMessaging } from '@/hooks/useAiSmsMessaging';
import { Sparkles, MessageSquare, Shield, CheckCircle, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const Settings = () => {
  const [autoQuarantine, setAutoQuarantine] = useState(true);
  const [dailyCallLimit, setDailyCallLimit] = useState('50');
  const [cooldownPeriod, setCooldownPeriod] = useState('30');
  const [preferStirShaken, setPreferStirShaken] = useState(true);
  const [phoneNumbers, setPhoneNumbers] = useState<any[]>([]);
  const { toast } = useToast();
  const { settings, updateSettings } = useAiSmsMessaging();

  useEffect(() => {
    loadPhoneNumbers();
  }, []);

  const loadPhoneNumbers = async () => {
    const { data } = await supabase
      .from('phone_numbers')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(5);
    if (data) setPhoneNumbers(data);
  };

  const handleSaveSettings = () => {
    // In a real app, you'd save these settings to the database
    toast({
      title: "Settings Saved",
      description: "Your settings have been updated successfully.",
    });
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast({
      title: "Signed Out",
      description: "You have been signed out successfully",
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <Navigation />
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
          <Button onClick={handleSignOut} variant="outline">
            Sign Out
          </Button>
        </div>

        {/* Dialer Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Dialer Configuration</CardTitle>
            <CardDescription>Configure your dialer system settings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base font-medium">Auto-Quarantine Spam Numbers</Label>
                <p className="text-sm text-gray-600">Automatically quarantine numbers flagged as spam</p>
              </div>
              <Switch
                checked={autoQuarantine}
                onCheckedChange={setAutoQuarantine}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="callLimit">Daily Call Limit per Number</Label>
              <Input
                id="callLimit"
                type="number"
                value={dailyCallLimit}
                onChange={(e) => setDailyCallLimit(e.target.value)}
                className="max-w-xs"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cooldown">Quarantine Period (days)</Label>
              <Input
                id="cooldown"
                type="number"
                value={cooldownPeriod}
                onChange={(e) => setCooldownPeriod(e.target.value)}
                className="max-w-xs"
              />
            </div>

            <Button onClick={handleSaveSettings} className="bg-blue-600 hover:bg-blue-700">
              Save Settings
            </Button>
          </CardContent>
        </Card>

        {/* Account Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Account Settings</CardTitle>
            <CardDescription>Manage your account preferences</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="your@email.com"
                disabled
                className="max-w-md"
              />
            </div>
            
            <Button variant="outline">
              Change Password
            </Button>
          </CardContent>
        </Card>

        {/* AI SMS Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              AI SMS Settings
            </CardTitle>
            <CardDescription>Configure AI provider and SMS behavior</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base font-medium">Enable AI SMS</Label>
                <p className="text-sm text-gray-600">Turn on AI-powered SMS responses</p>
              </div>
              <Switch
                checked={settings?.enabled || false}
                onCheckedChange={(checked) => updateSettings({ enabled: checked })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ai-provider" className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                AI Provider
              </Label>
              <Select
                value={settings?.ai_provider || 'lovable'}
                onValueChange={(value: 'lovable' | 'retell') => updateSettings({ ai_provider: value })}
              >
                <SelectTrigger id="ai-provider" className="max-w-md">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lovable">
                    <div className="flex flex-col py-1">
                      <span className="font-medium">Lovable AI</span>
                      <span className="text-xs text-muted-foreground">Powered by Gemini - Best for images & context</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="retell">
                    <div className="flex flex-col py-1">
                      <span className="font-medium">Retell AI</span>
                      <span className="text-xs text-muted-foreground">Voice-optimized SMS responses</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {settings?.ai_provider === 'retell' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="retell-llm">Retell LLM ID</Label>
                  <Input
                    id="retell-llm"
                    value={settings?.retell_llm_id || ''}
                    onChange={(e) => updateSettings({ retell_llm_id: e.target.value })}
                    placeholder="llm_xxxxxxxxxxxxx"
                    className="max-w-md"
                  />
                  <p className="text-xs text-muted-foreground">
                    Get this from your Retell AI dashboard
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="retell-voice">Retell Voice ID (Optional)</Label>
                  <Input
                    id="retell-voice"
                    value={settings?.retell_voice_id || ''}
                    onChange={(e) => updateSettings({ retell_voice_id: e.target.value })}
                    placeholder="voice_xxxxxxxxxxxxx"
                    className="max-w-md"
                  />
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="ai-personality">AI Personality</Label>
              <Textarea
                id="ai-personality"
                value={settings?.ai_personality || ''}
                onChange={(e) => updateSettings({ ai_personality: e.target.value })}
                placeholder="e.g., professional and helpful, friendly and casual, etc."
                rows={3}
                className="max-w-md"
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base font-medium">Auto Response</Label>
                <p className="text-sm text-gray-600">Automatically respond to incoming messages</p>
              </div>
              <Switch
                checked={settings?.auto_response_enabled || false}
                onCheckedChange={(checked) => updateSettings({ auto_response_enabled: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base font-medium">Image Analysis</Label>
                <p className="text-sm text-gray-600">Analyze images sent by contacts</p>
              </div>
              <Switch
                checked={settings?.enable_image_analysis || false}
                onCheckedChange={(checked) => updateSettings({ enable_image_analysis: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base font-medium">Prevent Double Texting</Label>
                <p className="text-sm text-gray-600">Avoid sending multiple messages in quick succession</p>
              </div>
              <Switch
                checked={settings?.prevent_double_texting || false}
                onCheckedChange={(checked) => updateSettings({ prevent_double_texting: checked })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="context-window">Context Window Size</Label>
              <Input
                id="context-window"
                type="number"
                value={settings?.context_window_size || 20}
                onChange={(e) => updateSettings({ context_window_size: parseInt(e.target.value) })}
                min={1}
                max={100}
                className="max-w-xs"
              />
              <p className="text-xs text-muted-foreground">
                Number of previous messages to include for context
              </p>
            </div>
          </CardContent>
        </Card>

        {/* STIR/SHAKEN Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              STIR/SHAKEN Attestation
            </CardTitle>
            <CardDescription>
              Call authentication to prevent spam and spoofing
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-blue-600" />
                How STIR/SHAKEN Works
              </h4>
              <p className="text-sm text-gray-700">
                <strong>Direct with Twilio/Telnyx:</strong> STIR/SHAKEN attestation is provided by your carrier (Twilio, Telnyx). 
                These providers sign your calls at the network level.
              </p>
              <p className="text-sm text-gray-700">
                <strong>Through Retell AI:</strong> When Retell AI uses a Twilio or Telnyx number, it inherits that number's 
                STIR/SHAKEN attestation automatically. Both work together seamlessly.
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base font-medium">Prefer STIR/SHAKEN Numbers</Label>
                <p className="text-sm text-gray-600">Prioritize numbers with attestation for outbound calls</p>
              </div>
              <Switch
                checked={preferStirShaken}
                onCheckedChange={setPreferStirShaken}
              />
            </div>

            <div className="space-y-3">
              <Label className="text-base font-medium">Phone Number Attestation Status</Label>
              <div className="border rounded-lg overflow-hidden">
                {phoneNumbers.length === 0 ? (
                  <div className="p-4 text-center text-sm text-gray-500">
                    No active phone numbers. Import numbers from your carriers.
                  </div>
                ) : (
                  <div className="divide-y">
                    {phoneNumbers.map((number) => (
                      <div key={number.id} className="p-3 flex items-center justify-between hover:bg-gray-50">
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-sm">{number.number}</span>
                          {number.carrier_name && (
                            <Badge variant="outline" className="text-xs">
                              {number.carrier_name}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {number.stir_shaken_attestation === 'A' ? (
                            <Badge className="bg-green-100 text-green-800 gap-1">
                              <CheckCircle className="h-3 w-3" />
                              Full Attestation
                            </Badge>
                          ) : number.stir_shaken_attestation === 'B' ? (
                            <Badge className="bg-blue-100 text-blue-800 gap-1">
                              <CheckCircle className="h-3 w-3" />
                              Partial
                            </Badge>
                          ) : number.stir_shaken_attestation === 'C' ? (
                            <Badge variant="secondary" className="gap-1">
                              <AlertCircle className="h-3 w-3" />
                              Gateway
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="gap-1">
                              <AlertCircle className="h-3 w-3" />
                              Not Verified
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                <strong>A:</strong> Full attestation (best) · <strong>B:</strong> Partial attestation · <strong>C:</strong> Gateway attestation
              </p>
            </div>

            <Button onClick={handleSaveSettings} className="bg-blue-600 hover:bg-blue-700">
              Save STIR/SHAKEN Preferences
            </Button>
          </CardContent>
        </Card>

        {/* Enhanced Spam Detection & STIR/SHAKEN */}
        <EnhancedSpamDashboard />
      </div>
    </div>
  );
};

export default Settings;
