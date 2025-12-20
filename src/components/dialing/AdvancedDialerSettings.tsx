import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Shield, Clock, MapPin, Mic, CheckCircle, AlertCircle } from 'lucide-react';
import { useAdvancedDialerFeatures } from '@/hooks/useAdvancedDialerFeatures';

const AdvancedDialerSettings = () => {
  const { settings, updateSettings, isLoading } = useAdvancedDialerFeatures();
  const [localSettings, setLocalSettings] = useState(settings);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const handleSave = async () => {
    await updateSettings(localSettings);
  };

  const hasChanges = JSON.stringify(settings) !== JSON.stringify(localSettings);

  return (
    <div className="space-y-6">
      <Card className="bg-white dark:bg-slate-800">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Advanced Dialer Features
          </CardTitle>
          <CardDescription className="text-slate-600 dark:text-slate-400">
            Configure industry-leading dialing capabilities for maximum efficiency and compliance
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Answer Machine Detection */}
          <div className="space-y-4 p-4 border border-slate-200 dark:border-slate-700 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                  <Mic className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Answer Machine Detection (AMD)
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Automatically detect voicemail and answering machines
                  </p>
                </div>
              </div>
              <Switch
                checked={localSettings.enableAMD}
                onCheckedChange={(checked) => setLocalSettings({...localSettings, enableAMD: checked})}
              />
            </div>
            
            {localSettings.enableAMD && (
              <div className="ml-13 space-y-2">
                <Label htmlFor="amdSensitivity">Detection Sensitivity</Label>
                <Select 
                  value={localSettings.amdSensitivity}
                  onValueChange={(value: 'low' | 'medium' | 'high') => 
                    setLocalSettings({...localSettings, amdSensitivity: value})
                  }
                >
                  <SelectTrigger id="amdSensitivity">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low (More false positives)</SelectItem>
                    <SelectItem value="medium">Medium (Balanced)</SelectItem>
                    <SelectItem value="high">High (More false negatives)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Higher sensitivity = more accurate but slower detection
                </p>
                
                <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg mt-3">
                  <div className="flex items-center gap-2 text-blue-800 dark:text-blue-200 text-sm">
                    <CheckCircle className="h-4 w-4" />
                    <span className="font-medium">Benefits:</span>
                  </div>
                  <ul className="text-xs text-blue-700 dark:text-blue-300 ml-6 mt-1 space-y-1">
                    <li>• Saves agent time by filtering out voicemails</li>
                    <li>• Can leave pre-recorded messages on voicemail</li>
                    <li>• Reduces abandoned call rate</li>
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* Local Presence Dialing */}
          <div className="space-y-4 p-4 border border-slate-200 dark:border-slate-700 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                  <MapPin className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Local Presence Dialing
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Display local caller IDs to increase answer rates
                  </p>
                </div>
              </div>
              <Switch
                checked={localSettings.enableLocalPresence}
                onCheckedChange={(checked) => setLocalSettings({...localSettings, enableLocalPresence: checked})}
              />
            </div>
            
            {localSettings.enableLocalPresence && (
              <div className="ml-13 space-y-2">
                <Label htmlFor="localPresenceStrategy">Matching Strategy</Label>
                <Select 
                  value={localSettings.localPresenceStrategy}
                  onValueChange={(value: 'match_area_code' | 'match_prefix' | 'nearest') => 
                    setLocalSettings({...localSettings, localPresenceStrategy: value})
                  }
                >
                  <SelectTrigger id="localPresenceStrategy">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="match_area_code">Match Area Code (XXX-XXX-XXXX)</SelectItem>
                    <SelectItem value="match_prefix">Match Prefix (XXX-XXX-XXXX)</SelectItem>
                    <SelectItem value="nearest">Nearest Geographic Location</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Strategy for selecting the best caller ID to display
                </p>
                
                <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg mt-3">
                  <div className="flex items-center gap-2 text-green-800 dark:text-green-200 text-sm">
                    <CheckCircle className="h-4 w-4" />
                    <span className="font-medium">Benefits:</span>
                  </div>
                  <ul className="text-xs text-green-700 dark:text-green-300 ml-6 mt-1 space-y-1">
                    <li>• Up to 40% higher answer rates</li>
                    <li>• Builds trust with familiar area codes</li>
                    <li>• Reduces spam perception</li>
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* Time Zone Compliance */}
          <div className="space-y-4 p-4 border border-slate-200 dark:border-slate-700 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                  <Clock className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Time Zone Compliance
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Respect local calling hours and time zones
                  </p>
                </div>
              </div>
              <Switch
                checked={localSettings.enableTimeZoneCompliance}
                onCheckedChange={(checked) => setLocalSettings({...localSettings, enableTimeZoneCompliance: checked})}
              />
            </div>
            
            {localSettings.enableTimeZoneCompliance && (
              <div className="ml-13">
                <div className="bg-purple-50 dark:bg-purple-900/20 p-3 rounded-lg">
                  <div className="flex items-center gap-2 text-purple-800 dark:text-purple-200 text-sm">
                    <AlertCircle className="h-4 w-4" />
                    <span className="font-medium">Default Rules:</span>
                  </div>
                  <ul className="text-xs text-purple-700 dark:text-purple-300 ml-6 mt-1 space-y-1">
                    <li>• Calling hours: 8 AM - 9 PM (local time)</li>
                    <li>• No calls on Sundays</li>
                    <li>• Automatic timezone detection from area code</li>
                    <li>• TCPA compliant calling windows</li>
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* Do Not Call (DNC) List */}
          <div className="space-y-4 p-4 border border-slate-200 dark:border-slate-700 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center">
                  <Shield className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Do Not Call (DNC) Checking
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Automatically check against DNC lists
                  </p>
                </div>
              </div>
              <Switch
                checked={localSettings.enableDNCCheck}
                onCheckedChange={(checked) => setLocalSettings({...localSettings, enableDNCCheck: checked})}
              />
            </div>
            
            {localSettings.enableDNCCheck && (
              <div className="ml-13">
                <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
                  <div className="flex items-center gap-2 text-red-800 dark:text-red-200 text-sm">
                    <Shield className="h-4 w-4" />
                    <span className="font-medium">Protection:</span>
                  </div>
                  <ul className="text-xs text-red-700 dark:text-red-300 ml-6 mt-1 space-y-1">
                    <li>• Prevents calling numbers on your DNC list</li>
                    <li>• Helps maintain FTC/FCC compliance</li>
                    <li>• Automatic list scrubbing before campaigns</li>
                    <li>• Reduces legal liability</li>
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* Save Button */}
          {hasChanges && (
            <div className="flex justify-end pt-4 border-t border-slate-200 dark:border-slate-700">
              <Button 
                onClick={handleSave}
                disabled={isLoading}
                className="w-full sm:w-auto"
              >
                {isLoading ? 'Saving...' : 'Save Settings'}
              </Button>
            </div>
          )}

          {/* Feature Summary */}
          <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-lg">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
              Active Features Summary
            </h4>
            <div className="flex flex-wrap gap-2">
              <Badge variant={localSettings.enableAMD ? "default" : "secondary"}>
                {localSettings.enableAMD ? '✓' : '○'} AMD
              </Badge>
              <Badge variant={localSettings.enableLocalPresence ? "default" : "secondary"}>
                {localSettings.enableLocalPresence ? '✓' : '○'} Local Presence
              </Badge>
              <Badge variant={localSettings.enableTimeZoneCompliance ? "default" : "secondary"}>
                {localSettings.enableTimeZoneCompliance ? '✓' : '○'} Time Zone
              </Badge>
              <Badge variant={localSettings.enableDNCCheck ? "default" : "secondary"}>
                {localSettings.enableDNCCheck ? '✓' : '○'} DNC Check
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdvancedDialerSettings;
