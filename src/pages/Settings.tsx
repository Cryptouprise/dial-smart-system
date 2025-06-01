
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import Navigation from '@/components/Navigation';

const Settings = () => {
  const [autoQuarantine, setAutoQuarantine] = useState(true);
  const [dailyCallLimit, setDailyCallLimit] = useState('50');
  const [cooldownPeriod, setCooldownPeriod] = useState('30');
  const { toast } = useToast();

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
      </div>
    </div>
  );
};

export default Settings;
