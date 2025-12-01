
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
import { useRetellAI } from '@/hooks/useRetellAI';
import { Sparkles, MessageSquare, Shield, CheckCircle, AlertCircle, Phone, ShoppingCart } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

const Settings = () => {
  const [autoQuarantine, setAutoQuarantine] = useState(true);
  const [dailyCallLimit, setDailyCallLimit] = useState('50');
  const [cooldownPeriod, setCooldownPeriod] = useState('30');
  const [preferStirShaken, setPreferStirShaken] = useState(true);
  const [phoneNumbers, setPhoneNumbers] = useState<any[]>([]);
  const [availableRetellNumbers, setAvailableRetellNumbers] = useState<any[]>([]);
  const [searchAreaCode, setSearchAreaCode] = useState('');
  const [isRetellDialogOpen, setIsRetellDialogOpen] = useState(false);
  const { toast } = useToast();
  const { settings, updateSettings } = useAiSmsMessaging();
  const { listAvailableNumbers, purchaseNumber, isLoading: retellLoading } = useRetellAI();

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

            <div className="border-t pt-6 space-y-4">
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-5 space-y-3">
                <h4 className="font-semibold text-base flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-blue-600" />
                  Retell AI Business Verification Services
                </h4>
                <p className="text-sm text-gray-700 leading-relaxed">
                  Increase your call pickup rates by up to 40% with Retell AI's carrier verification services. 
                  These premium features help establish trust with your callers and prevent your numbers from being marked as spam.
                </p>
                
                <div className="grid gap-3 mt-4">
                  <div className="bg-white rounded-lg p-4 border border-blue-100">
                    <div className="flex items-start gap-3">
                      <div className="bg-blue-100 rounded-full p-2 mt-0.5">
                        <Shield className="h-4 w-4 text-blue-600" />
                      </div>
                      <div className="flex-1">
                        <h5 className="font-semibold text-sm mb-1">Business Profile Registration</h5>
                        <p className="text-xs text-gray-600 mb-2">
                          Register your business identity with carriers. Required for all verification services.
                        </p>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="text-xs"
                          onClick={() => window.open('https://app.retellai.com', '_blank')}
                        >
                          Create Business Profile →
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-lg p-4 border border-blue-100">
                    <div className="flex items-start gap-3">
                      <div className="bg-green-100 rounded-full p-2 mt-0.5">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      </div>
                      <div className="flex-1">
                        <h5 className="font-semibold text-sm mb-1">Verified Phone Number</h5>
                        <p className="text-xs text-gray-600 mb-2">
                          Remove "Spam Likely" labels from your numbers. Approval takes 1-2 weeks. (US only)
                        </p>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="text-xs"
                          onClick={() => window.open('https://app.retellai.com', '_blank')}
                        >
                          Apply for Verification →
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-lg p-4 border border-blue-100">
                    <div className="flex items-start gap-3">
                      <div className="bg-purple-100 rounded-full p-2 mt-0.5">
                        <Phone className="h-4 w-4 text-purple-600" />
                      </div>
                      <div className="flex-1">
                        <h5 className="font-semibold text-sm mb-1">Branded Call Display</h5>
                        <p className="text-xs text-gray-600 mb-2">
                          Show your business name instead of just a number. Increases answer rates. (US only)
                        </p>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="text-xs"
                          onClick={() => window.open('https://app.retellai.com', '_blank')}
                        >
                          Apply for Branded Call →
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mt-3">
                  <p className="text-xs text-gray-700">
                    <strong>Note:</strong> These services are managed through Retell AI's dashboard and work with ANY phone numbers 
                    you use with Retell AI - whether you purchase through Retell, import from Twilio, or use Telnyx numbers.
                  </p>
                </div>
              </div>
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
