import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Phone, PhoneOff, Activity, TrendingUp, Settings as SettingsIcon, Trash2, RefreshCw, Bot, Zap, AlertTriangle, DollarSign } from 'lucide-react';
import { useConcurrencyManager } from '@/hooks/useConcurrencyManager';
import { computeDialingRate, computePlatformCapacities } from '@/lib/concurrencyUtils';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const ConcurrencyMonitor = () => {
  const {
    activeCalls,
    activeTransfers,
    getConcurrencySettings,
    updateConcurrencySettings,
    cleanupStuckCalls,
    cleanupStuckTransfers,
    loadActiveCalls,
    loadActiveTransfers,
    isLoading,
  } = useConcurrencyManager();

  const [settings, setSettings] = useState({
    maxConcurrentCalls: 10,
    callsPerMinute: 30,
    maxCallsPerAgent: 3,
    enableAdaptivePacing: true,
    retellMaxConcurrent: 10,
    assistableMaxConcurrent: 200,
    transferQueueEnabled: true
  });
  
  const [dialingRate, setDialingRate] = useState({
    currentConcurrency: 0,
    maxConcurrency: 10,
    utilizationRate: 0,
    recommendedRate: 30,
    availableSlots: 10
  });

  const [platformCapacity, setPlatformCapacity] = useState({
    retell: { active: 0, max: 10, available: 10, utilizationRate: 0 },
    assistable: { active: 0, max: 200, available: 200, utilizationRate: 0 }
  });

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const loadSettings = useCallback(async () => {
    const currentSettings = await getConcurrencySettings();
    setSettings(currentSettings);
  }, [getConcurrencySettings]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    setDialingRate(computeDialingRate(activeCalls.length, settings));
  }, [activeCalls.length, settings]);

  useEffect(() => {
    setPlatformCapacity(computePlatformCapacities(activeTransfers, settings));
  }, [activeTransfers, settings]);

  const handleSaveSettings = async () => {
    const success = await updateConcurrencySettings(settings);
    if (success) {
      setIsSettingsOpen(false);
      await loadSettings();
    }
  };

  const handleRefresh = () => {
    loadActiveCalls();
    loadActiveTransfers();
    loadSettings();
  };

  const utilizationPercentage = (dialingRate.currentConcurrency / dialingRate.maxConcurrency) * 100;
  const utilizationColor = utilizationPercentage > 90 ? 'text-red-600' : 
                          utilizationPercentage > 70 ? 'text-yellow-600' : 
                          'text-green-600';

  const retellTransfers = activeTransfers.filter(t => t.platform === 'retell');
  const assistableTransfers = activeTransfers.filter(t => t.platform === 'assistable');

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
                Real-time concurrent call tracking and AI agent capacity management
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleRefresh}
                disabled={isLoading}
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={cleanupStuckCalls}
                disabled={isLoading}
                className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Clear Stuck
              </Button>
              <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <SettingsIcon className="h-4 w-4 mr-2" />
                    Settings
                  </Button>
                </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Concurrency Settings</DialogTitle>
                  <DialogDescription>
                    Configure concurrent call limits and AI platform capacity
                  </DialogDescription>
                </DialogHeader>
                <Tabs defaultValue="general" className="mt-4">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="general">General</TabsTrigger>
                    <TabsTrigger value="platforms">AI Platforms</TabsTrigger>
                  </TabsList>

                  <TabsContent value="general" className="space-y-4 py-4">
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

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="transferQueue">Queue Transfers When At Capacity</Label>
                        <p className="text-xs text-slate-500">
                          Hold callers in queue if AI agents are busy
                        </p>
                      </div>
                      <Switch
                        id="transferQueue"
                        checked={settings.transferQueueEnabled}
                        onCheckedChange={(checked) => setSettings({...settings, transferQueueEnabled: checked})}
                      />
                    </div>
                  </TabsContent>

                  <TabsContent value="platforms" className="space-y-4 py-4">
                    {/* Retell AI */}
                    <div className="p-4 border border-purple-200 dark:border-purple-800 rounded-lg bg-purple-50/50 dark:bg-purple-950/20">
                      <div className="flex items-center gap-2 mb-3">
                        <Bot className="h-5 w-5 text-purple-600" />
                        <Label className="text-base font-semibold">Retell AI</Label>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="retellMax">Max Concurrent AI Agents</Label>
                        <Input
                          id="retellMax"
                          type="number"
                          value={settings.retellMaxConcurrent}
                          onChange={(e) => setSettings({...settings, retellMaxConcurrent: parseInt(e.target.value) || 10})}
                          min={1}
                          max={100}
                        />
                        <div className="flex items-start gap-2 p-2 bg-amber-50 dark:bg-amber-950/30 rounded border border-amber-200 dark:border-amber-800">
                          <DollarSign className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                          <p className="text-xs text-amber-700 dark:text-amber-300">
                            Your Retell plan's concurrent call limit. Additional slots cost $8/month each on Retell.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Assistable */}
                    <div className="p-4 border border-emerald-200 dark:border-emerald-800 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20">
                      <div className="flex items-center gap-2 mb-3">
                        <Zap className="h-5 w-5 text-emerald-600" />
                        <Label className="text-base font-semibold">Assistable</Label>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="assistableMax">Max Concurrent Agents</Label>
                        <Input
                          id="assistableMax"
                          type="number"
                          value={settings.assistableMaxConcurrent}
                          onChange={(e) => setSettings({...settings, assistableMaxConcurrent: parseInt(e.target.value) || 200})}
                          min={1}
                          max={500}
                        />
                        <p className="text-xs text-slate-500">
                          High-concurrency platform with ~200 agent capacity
                        </p>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
                <div className="flex justify-end gap-2 mt-4">
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

          {/* AI Platform Capacity */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            {/* Retell AI Capacity */}
            <div className="p-4 rounded-lg bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Bot className="h-5 w-5 text-purple-600" />
                  <span className="font-medium text-purple-900 dark:text-purple-100">Retell AI Agents</span>
                </div>
                <Badge 
                  variant={platformCapacity.retell.utilizationRate > 90 ? "destructive" : platformCapacity.retell.utilizationRate > 70 ? "secondary" : "outline"}
                  className="text-xs"
                >
                  {platformCapacity.retell.utilizationRate}%
                </Badge>
              </div>
              <div className="flex items-baseline gap-1 mb-2">
                <span className="text-2xl font-bold text-purple-700 dark:text-purple-300">
                  {platformCapacity.retell.active}
                </span>
                <span className="text-sm text-purple-600/70 dark:text-purple-400/70">
                  / {platformCapacity.retell.max} active
                </span>
              </div>
              <Progress 
                value={(platformCapacity.retell.active / platformCapacity.retell.max) * 100} 
                className="h-2" 
              />
              <p className="text-xs text-purple-600/70 dark:text-purple-400/70 mt-2">
                {platformCapacity.retell.available} slots available • $8/additional slot
              </p>
              {retellTransfers.length > 0 && (
                <div className="mt-2 space-y-1 max-h-24 overflow-y-auto">
                  {retellTransfers.map((t) => (
                    <div key={t.id} className="flex items-center gap-2 text-xs bg-purple-100 dark:bg-purple-900/30 p-1 rounded">
                      <Phone className="h-3 w-3 text-purple-600 animate-pulse" />
                      <span className="font-mono">{t.transfer_number || 'Active'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Assistable Capacity */}
            <div className="p-4 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-emerald-600" />
                  <span className="font-medium text-emerald-900 dark:text-emerald-100">Assistable Agents</span>
                </div>
                <Badge 
                  variant={platformCapacity.assistable.utilizationRate > 90 ? "destructive" : platformCapacity.assistable.utilizationRate > 70 ? "secondary" : "outline"}
                  className="text-xs"
                >
                  {platformCapacity.assistable.utilizationRate}%
                </Badge>
              </div>
              <div className="flex items-baseline gap-1 mb-2">
                <span className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">
                  {platformCapacity.assistable.active}
                </span>
                <span className="text-sm text-emerald-600/70 dark:text-emerald-400/70">
                  / {platformCapacity.assistable.max} active
                </span>
              </div>
              <Progress 
                value={(platformCapacity.assistable.active / platformCapacity.assistable.max) * 100} 
                className="h-2" 
              />
              <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70 mt-2">
                {platformCapacity.assistable.available} slots available • High capacity
              </p>
              {assistableTransfers.length > 0 && (
                <div className="mt-2 space-y-1 max-h-24 overflow-y-auto">
                  {assistableTransfers.map((t) => (
                    <div key={t.id} className="flex items-center gap-2 text-xs bg-emerald-100 dark:bg-emerald-900/30 p-1 rounded">
                      <Phone className="h-3 w-3 text-emerald-600 animate-pulse" />
                      <span className="font-mono">{t.transfer_number || 'Active'}</span>
                    </div>
                  ))}
                </div>
              )}
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
                <AlertTriangle className="h-4 w-4" />
                <p className="text-sm font-medium">
                  High Utilization Warning
                </p>
              </div>
              <p className="text-xs text-red-700 dark:text-red-300 mt-1">
                System is operating at {dialingRate.utilizationRate}% capacity. Consider increasing concurrent call limit or reducing dialing rate.
              </p>
            </div>
          )}

          {/* Cleanup stuck transfers button */}
          {activeTransfers.length > 0 && (
            <div className="flex justify-end">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={cleanupStuckTransfers}
                disabled={isLoading}
                className="text-xs text-muted-foreground"
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Clear Stuck Transfers
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ConcurrencyMonitor;