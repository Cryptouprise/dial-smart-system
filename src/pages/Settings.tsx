
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
import ChatbotSettings from '@/components/ChatbotSettings';
import PhoneNumberRow from '@/components/PhoneNumberRow';
import { LeadScoringSettings } from '@/components/LeadScoringSettings';
import GoHighLevelManager from '@/components/GoHighLevelManager';
import YellowstoneManager from '@/components/YellowstoneManager';
import { useAiSmsMessaging } from '@/hooks/useAiSmsMessaging';
import { useRetellAI } from '@/hooks/useRetellAI';
import { Sparkles, MessageSquare, Shield, AlertCircle, Phone, ShoppingCart, Target, Calendar, Link, Server, FlaskConical } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { RetellBusinessVerification } from '@/components/RetellBusinessVerification';
import { CalendarIntegrationManager } from '@/components/CalendarIntegrationManager';
import { SipTrunkManager } from '@/components/SipTrunkManager';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { CallSimulator } from '@/components/CallSimulator';
import { RateLimitingSettings } from '@/components/RateLimitingSettings';

const Settings = () => {
  const [autoQuarantine, setAutoQuarantine] = useState(true);
  const [dailyCallLimit, setDailyCallLimit] = useState('50');
  const [cooldownPeriod, setCooldownPeriod] = useState('30');
  const [preferStirShaken, setPreferStirShaken] = useState(true);
  const [phoneNumbers, setPhoneNumbers] = useState<any[]>([]);
  const [availableRetellNumbers, setAvailableRetellNumbers] = useState<any[]>([]);
  const [searchAreaCode, setSearchAreaCode] = useState('');
  const [isRetellDialogOpen, setIsRetellDialogOpen] = useState(false);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const { toast } = useToast();
  const { settings, updateSettings } = useAiSmsMessaging();
  const { listAvailableNumbers, purchaseNumber, isLoading: retellLoading } = useRetellAI();

  useEffect(() => {
    const loadAllData = async () => {
      setIsLoadingSettings(true);
      await Promise.all([loadPhoneNumbers(), loadDialerSettings()]);
      setIsLoadingSettings(false);
    };
    loadAllData();
  }, []);

  const loadDialerSettings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('rotation_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (data) {
        setAutoQuarantine(data.auto_remove_quarantined ?? true);
        setDailyCallLimit(String(data.high_volume_threshold ?? 50));
        setCooldownPeriod(String(Math.round((data.rotation_interval_hours ?? 720) / 24)));
      }
    } catch (error) {
      console.error('Error loading dialer settings:', error);
    }
  };

  const loadPhoneNumbers = async () => {
    const { data } = await supabase
      .from('phone_numbers')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(5);
    if (data) setPhoneNumbers(data);
  };

  const handleSearchRetellNumbers = async () => {
    const numbers = await listAvailableNumbers(searchAreaCode);
    if (numbers) setAvailableRetellNumbers(numbers);
  };

  const handlePurchaseRetellNumber = async (phoneNumber: string) => {
    const result = await purchaseNumber(phoneNumber);
    if (result) {
      setIsRetellDialogOpen(false);
      loadPhoneNumbers();
    }
  };

  const handleSaveSettings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: 'Please log in', variant: 'destructive' });
        return;
      }

      // Save rotation settings
      await supabase.from('rotation_settings').upsert({
        user_id: user.id,
        auto_remove_quarantined: autoQuarantine,
        high_volume_threshold: parseInt(dailyCallLimit) || 50,
        rotation_interval_hours: parseInt(cooldownPeriod) * 24 || 720, // Convert days to hours
      }, { onConflict: 'user_id' });

      toast({
        title: "Settings Saved",
        description: "Your dialer settings have been updated.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save settings",
        variant: 'destructive',
      });
    }
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
            {isLoadingSettings ? (
              <div className="py-8 text-center text-muted-foreground">Loading settings...</div>
            ) : (
              <>
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
            </>
            )}
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

        {/* Lead Scoring Configuration */}
        <LeadScoringSettings />

        {/* Calendar Integration */}
        <CalendarIntegrationManager />

        {/* AI Assistant / Chatbot Settings */}
        <ChatbotSettings />

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

        {/* Rate Limiting */}
        <RateLimitingSettings />

        {/* SIP Trunk Configuration */}
        <SipTrunkManager />

        {/* STIR/SHAKEN Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              STIR/SHAKEN & Number Management
            </CardTitle>
            <CardDescription>
              Call authentication, verification, and spam prevention
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-blue-600" />
                How STIR/SHAKEN & Verification Works
              </h4>
              <div className="space-y-2">
                <p className="text-sm text-gray-700">
                  <strong>Option 1 - Your Own Numbers (Direct Carrier):</strong> When you use your own Twilio/Telnyx numbers, 
                  STIR/SHAKEN attestation is provided directly by the carrier at the network level.
                </p>
                <p className="text-sm text-gray-700">
                  <strong>Option 2 - Retell AI Managed Numbers:</strong> Retell AI offers their own phone numbers (backed by Twilio) 
                  with built-in verification and spam prevention. These numbers come pre-verified and include STIR/SHAKEN attestation 
                  from Retell's Twilio backend.
                </p>
                <p className="text-sm text-gray-700">
                  <strong>Hybrid Approach:</strong> Import your Twilio/Telnyx numbers into Retell AI to get the best of both worlds - 
                  your existing numbers with Retell's AI calling features and attestation inheritance.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-medium">Retell AI Managed Numbers</Label>
                <Dialog open={isRetellDialogOpen} onOpenChange={setIsRetellDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                      <ShoppingCart className="h-4 w-4" />
                      Browse & Purchase
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <Phone className="h-5 w-5" />
                        Retell AI Managed Numbers
                      </DialogTitle>
                      <DialogDescription>
                        Purchase pre-verified numbers with built-in spam prevention and STIR/SHAKEN attestation
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="flex gap-2">
                        <Input
                          placeholder="Area code (optional)"
                          value={searchAreaCode}
                          onChange={(e) => setSearchAreaCode(e.target.value)}
                          maxLength={3}
                          className="max-w-[150px]"
                        />
                        <Button onClick={handleSearchRetellNumbers} disabled={retellLoading}>
                          Search Numbers
                        </Button>
                      </div>
                      <div className="border rounded-lg max-h-[400px] overflow-y-auto">
                        {availableRetellNumbers.length === 0 ? (
                          <div className="p-8 text-center text-muted-foreground">
                            Click "Search Numbers" to see available Retell AI managed numbers
                          </div>
                        ) : (
                          <div className="divide-y">
                            {availableRetellNumbers.map((number: any) => (
                              <div key={number.phone_number} className="p-3 flex items-center justify-between hover:bg-gray-50">
                                <div className="flex items-center gap-3">
                                  <span className="font-mono text-sm">{number.phone_number}</span>
                                  <Badge className="bg-green-100 text-green-800 gap-1">
                                    <Shield className="h-3 w-3" />
                                    Verified
                                  </Badge>
                                </div>
                                <Button 
                                  size="sm" 
                                  onClick={() => handlePurchaseRetellNumber(number.phone_number)}
                                  disabled={retellLoading}
                                >
                                  Purchase
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
              <p className="text-xs text-muted-foreground">
                Retell AI offers phone numbers backed by Twilio with pre-configured verification and spam prevention
              </p>
            </div>

            {/* Business Verification Management */}
            <RetellBusinessVerification />

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
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    No active phone numbers. Import numbers from your carriers.
                  </div>
                ) : (
                  <div className="divide-y">
                    {phoneNumbers.map((number) => (
                      <PhoneNumberRow 
                        key={number.id} 
                        number={number}
                        onRefresh={loadPhoneNumbers}
                      />
                    ))}
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                <strong>SHAKEN A:</strong> Full attestation (best) · <strong>B:</strong> Partial · <strong>C:</strong> Gateway · Use the menu to register numbers
              </p>
            </div>

            <Button onClick={handleSaveSettings} className="bg-blue-600 hover:bg-blue-700">
              Save STIR/SHAKEN Preferences
            </Button>
          </CardContent>
        </Card>

        {/* Enhanced Spam Detection & STIR/SHAKEN */}
        <EnhancedSpamDashboard />

        {/* Integrations Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link className="h-5 w-5" />
              Integrations
            </CardTitle>
            <CardDescription>Connect to external services and platforms</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="gohighlevel" className="w-full">
              <TabsList className="mb-4">
                <TabsTrigger value="gohighlevel">Go High Level</TabsTrigger>
                <TabsTrigger value="yellowstone">Yellowstone</TabsTrigger>
              </TabsList>
              <TabsContent value="gohighlevel">
                <GoHighLevelManager />
              </TabsContent>
              <TabsContent value="yellowstone">
                <YellowstoneManager />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Call Simulator - Developer Tools */}
        <Collapsible>
          <Card>
            <CardHeader className="pb-3">
              <CollapsibleTrigger className="flex items-center justify-between w-full text-left">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <FlaskConical className="h-5 w-5" />
                    Call Simulator (Dev Tools)
                  </CardTitle>
                  <CardDescription>Test call flows without making real calls</CardDescription>
                </div>
                <Badge variant="secondary">Click to expand</Badge>
              </CollapsibleTrigger>
            </CardHeader>
            <CollapsibleContent>
              <CardContent>
                <CallSimulator />
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      </div>
    </div>
  );
};

export default Settings;
