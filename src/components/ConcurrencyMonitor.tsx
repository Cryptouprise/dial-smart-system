import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Phone, PhoneOff, Activity, TrendingUp, Settings as SettingsIcon } from 'lucide-react';
import { useConcurrencyManager } from '@/hooks/useConcurrencyManager';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

const ConcurrencyMonitor = () => {
  const { 
    activeCalls, 
    getConcurrencySettings, 
    updateConcurrencySettings,
    calculateDialingRate 
  } = useConcurrencyManager();
  
  const [settings, setSettings] = useState({
    maxConcurrentCalls: 10,
    callsPerMinute: 30,
    maxCallsPerAgent: 3,
    enableAdaptivePacing: true
  });
  
  const [dialingRate, setDialingRate] = useState({
    currentConcurrency: 0,
    maxConcurrency: 10,
    utilizationRate: 0,
    recommendedRate: 30,
    availableSlots: 10
  });

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    loadSettings();
    loadDialingRate();
    
    // Refresh dialing rate every 5 seconds
    const interval = setInterval(() => {
      loadDialingRate();
    }, 5000);
    
    return () => clearInterval(interval);
  }, [activeCalls]);

  const loadSettings = async () => {
    const currentSettings = await getConcurrencySettings();
    setSettings(currentSettings);
  };

  const loadDialingRate = async () => {
    const rate = await calculateDialingRate();
    setDialingRate(rate);
  };

  const handleSaveSettings = async () => {
    const success = await updateConcurrencySettings(settings);
    if (success) {
      setIsSettingsOpen(false);
      loadSettings();
      loadDialingRate();
    }
  };

  const utilizationPercentage = (dialingRate.currentConcurrency / dialingRate.maxConcurrency) * 100;
  const utilizationColor = utilizationPercentage > 90 ? 'text-red-600' : 
                          utilizationPercentage > 70 ? 'text-yellow-600' : 
                          'text-green-600';

  return (
    <div className="space-y-4">
      {/* Main Concurrency Card */}
      <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950 border-blue-200 dark:border-blue-800">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Activity className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                Live Concurrency Monitor
              </CardTitle>
              <CardDescription className="text-slate-600 dark:text-slate-400">
                Real-time concurrent call tracking and capacity management
              </CardDescription>
            </div>
            <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <SettingsIcon className="h-4 w-4 mr-2" />
                  Settings
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Concurrency Settings</DialogTitle>
                  <DialogDescription>
                    Configure concurrent call limits and dialing behavior
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="maxConcurrent">Maximum Concurrent Calls</Label>
                    <Input
                      id="maxConcurrent"
                      type="number"
                      value={settings.maxConcurrentCalls}
                      onChange={(e) => setSettings({...settings, maxConcurrentCalls: parseInt(e.target.value) || 10})}
                      min={1}
                      max={100}
                    />
                    <p className="text-xs text-slate-500">
                      Maximum number of simultaneous active calls
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="callsPerMinute">Calls Per Minute (CPM)</Label>
                    <Input
                      id="callsPerMinute"
                      type="number"
                      value={settings.callsPerMinute}
                      onChange={(e) => setSettings({...settings, callsPerMinute: parseInt(e.target.value) || 30})}
                      min={1}
                      max={100}
                    />
                    <p className="text-xs text-slate-500">
                      Target dialing rate when at optimal capacity
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="maxPerAgent">Max Calls Per Agent</Label>
                    <Input
                      id="maxPerAgent"
                      type="number"
                      value={settings.maxCallsPerAgent}
                      onChange={(e) => setSettings({...settings, maxCallsPerAgent: parseInt(e.target.value) || 3})}
                      min={1}
                      max={10}
                    />
                    <p className="text-xs text-slate-500">
                      Maximum concurrent calls per agent
                    </p>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="adaptivePacing">Adaptive Pacing</Label>
                      <p className="text-xs text-slate-500">
                        AI automatically adjusts dialing rate based on performance
                      </p>
                    </div>
                    <Switch
                      id="adaptivePacing"
                      checked={settings.enableAdaptivePacing}
                      onCheckedChange={(checked) => setSettings({...settings, enableAdaptivePacing: checked})}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsSettingsOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleSaveSettings}>
                    Save Changes
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Concurrency Gauge */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Phone className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Active Calls
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-2xl font-bold ${utilizationColor}`}>
                  {dialingRate.currentConcurrency}
                </span>
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  / {dialingRate.maxConcurrency}
                </span>
                <Badge variant={utilizationPercentage > 90 ? "destructive" : utilizationPercentage > 70 ? "secondary" : "default"}>
                  {dialingRate.utilizationRate}%
                </Badge>
              </div>
            </div>
            <Progress value={utilizationPercentage} className="h-3" />
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Available Slots
                </span>
              </div>
              <div className="text-xl font-bold text-slate-900 dark:text-slate-100">
                {dialingRate.availableSlots}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2 mb-1">
                <Activity className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Utilization
                </span>
              </div>
              <div className="text-xl font-bold text-slate-900 dark:text-slate-100">
                {dialingRate.utilizationRate}%
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2 mb-1">
                <Phone className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Target CPM
                </span>
              </div>
              <div className="text-xl font-bold text-slate-900 dark:text-slate-100">
                {dialingRate.recommendedRate}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2 mb-1">
                <PhoneOff className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Max Capacity
                </span>
              </div>
              <div className="text-xl font-bold text-slate-900 dark:text-slate-100">
                {dialingRate.maxConcurrency}
              </div>
            </div>
          </div>

          {/* Active Calls List */}
          {activeCalls.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Active Calls ({activeCalls.length})
              </h4>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {activeCalls.map((call) => (
                  <div
                    key={call.id}
                    className="flex items-center justify-between p-2 bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700"
                  >
                    <div className="flex items-center gap-2">
                      <Phone className="h-3 w-3 text-green-600 animate-pulse" />
                      <span className="text-sm font-mono text-slate-900 dark:text-slate-100">
                        {call.phone_number}
                      </span>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {call.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Alert for high utilization */}
          {utilizationPercentage > 90 && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
              <div className="flex items-center gap-2 text-red-800 dark:text-red-200">
                <Activity className="h-4 w-4" />
                <p className="text-sm font-medium">
                  High Utilization Warning
                </p>
              </div>
              <p className="text-xs text-red-700 dark:text-red-300 mt-1">
                System is operating at {dialingRate.utilizationRate}% capacity. Consider increasing concurrent call limit or reducing dialing rate.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ConcurrencyMonitor;
