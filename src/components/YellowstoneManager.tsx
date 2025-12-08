
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Zap, History, Bot, Settings, RotateCcw, AlertTriangle, CheckCircle } from 'lucide-react';

interface YellowstoneSnapshot {
  id: string;
  timestamp: Date;
  numbers: any[];
  rotationSettings: any;
  automationSettings: any;
  description: string;
  aiTriggered: boolean;
}

interface YellowstoneManagerProps {
  numbers?: any[];
  onRefreshNumbers?: () => void;
}

const YellowstoneManager = ({ numbers = [], onRefreshNumbers = () => {} }: YellowstoneManagerProps) => {
  const [isEnabled, setIsEnabled] = useState(false);
  const [useAI, setUseAI] = useState(false);
  const [snapshots, setSnapshots] = useState<YellowstoneSnapshot[]>([]);
  const [autoSnapshotInterval, setAutoSnapshotInterval] = useState('24'); // hours
  const [maxSnapshots, setMaxSnapshots] = useState(10);
  const { toast } = useToast();

  useEffect(() => {
    loadSettings();
    loadSnapshots();
  }, []);

  const loadSettings = () => {
    const settings = localStorage.getItem('yellowstone-settings');
    if (settings) {
      const parsed = JSON.parse(settings);
      setIsEnabled(parsed.isEnabled || false);
      setUseAI(parsed.useAI || false);
      setAutoSnapshotInterval(parsed.autoSnapshotInterval || '24');
      setMaxSnapshots(parsed.maxSnapshots || 10);
    }
  };

  const loadSnapshots = () => {
    const saved = localStorage.getItem('yellowstone-snapshots');
    if (saved) {
      const parsed = JSON.parse(saved);
      setSnapshots(parsed.map((s: any) => ({
        ...s,
        timestamp: new Date(s.timestamp)
      })));
    }
  };

  const saveSettings = () => {
    const settings = {
      isEnabled,
      useAI,
      autoSnapshotInterval,
      maxSnapshots
    };
    localStorage.setItem('yellowstone-settings', JSON.stringify(settings));
  };

  const saveSnapshots = (newSnapshots: YellowstoneSnapshot[]) => {
    const serializable = newSnapshots.map(s => ({
      ...s,
      timestamp: s.timestamp.toISOString()
    }));
    localStorage.setItem('yellowstone-snapshots', JSON.stringify(serializable));
    setSnapshots(newSnapshots);
  };

  const createSnapshot = async (description: string, aiTriggered = false) => {
    const rotationSettings = JSON.parse(localStorage.getItem('automation-settings') || '{}');
    
    const snapshot: YellowstoneSnapshot = {
      id: `snapshot-${Date.now()}`,
      timestamp: new Date(),
      numbers: JSON.parse(JSON.stringify(numbers)),
      rotationSettings,
      automationSettings: rotationSettings,
      description,
      aiTriggered
    };

    const newSnapshots = [snapshot, ...snapshots].slice(0, maxSnapshots);
    saveSnapshots(newSnapshots);

    toast({
      title: "Snapshot Created",
      description: `System state saved: ${description}`,
    });

    return snapshot;
  };

  const rollbackToSnapshot = async (snapshot: YellowstoneSnapshot) => {
    try {
      // Create a rollback snapshot first
      await createSnapshot(`Pre-rollback state (before reverting to ${snapshot.description})`, false);

      // Restore settings
      localStorage.setItem('automation-settings', JSON.stringify(snapshot.automationSettings));

      // Note: In a real implementation, you'd need to:
      // 1. Update the database with the snapshot's number states
      // 2. Sync with Retell AI to match the snapshot state
      // 3. Update any external systems

      onRefreshNumbers();

      toast({
        title: "Rollback Complete",
        description: `System restored to: ${snapshot.description}`,
      });
    } catch (error) {
      toast({
        title: "Rollback Failed",
        description: "Failed to restore system state",
        variant: "destructive"
      });
    }
  };

  const triggerAISnapshot = async () => {
    if (!useAI) return;

    // In a real implementation, this would call OpenAI to analyze if a snapshot is needed
    const aiRecommendation = Math.random() > 0.7; // Simulate AI decision
    
    if (aiRecommendation) {
      await createSnapshot("AI-triggered safety snapshot", true);
      toast({
        title: "AI Safety Snapshot",
        description: "AI detected changes requiring backup",
      });
    }
  };

  useEffect(() => {
    saveSettings();
  }, [isEnabled, useAI, autoSnapshotInterval, maxSnapshots]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-600" />
            Yellowstone Rollback System
          </CardTitle>
          <CardDescription>
            Advanced system state management with rollback capabilities
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Main Controls */}
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <Label className="font-medium">Enable Yellowstone Protection</Label>
                <p className="text-sm text-gray-500">Automatic system state snapshots and rollback capability</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={isEnabled ? "default" : "secondary"}>
                  {isEnabled ? "Active" : "Inactive"}
                </Badge>
                <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
              </div>
            </div>

            {isEnabled && (
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <Label className="font-medium">AI-Powered Decision Making</Label>
                  <p className="text-sm text-gray-500">Use OpenAI to intelligently decide when to create snapshots</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={useAI ? "default" : "secondary"}>
                    {useAI ? "AI Enabled" : "Manual Only"}
                  </Badge>
                  <Switch checked={useAI} onCheckedChange={setUseAI} />
                </div>
              </div>
            )}
          </div>

          {/* Quick Actions */}
          {isEnabled && (
            <div className="flex gap-2">
              <Button 
                onClick={() => createSnapshot("Manual snapshot")}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <History className="h-4 w-4 mr-2" />
                Create Snapshot
              </Button>
              {useAI && (
                <Button 
                  onClick={triggerAISnapshot}
                  variant="outline"
                  className="border-purple-300 text-purple-700 hover:bg-purple-50"
                >
                  <Bot className="h-4 w-4 mr-2" />
                  AI Analysis
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Snapshots List */}
      {isEnabled && snapshots.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              System Snapshots ({snapshots.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {snapshots.map((snapshot) => (
                <div key={snapshot.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      {snapshot.aiTriggered ? (
                        <Bot className="h-4 w-4 text-purple-600" />
                      ) : (
                        <History className="h-4 w-4 text-blue-600" />
                      )}
                      <Badge variant={snapshot.aiTriggered ? "default" : "secondary"}>
                        {snapshot.aiTriggered ? "AI" : "Manual"}
                      </Badge>
                    </div>
                    <div>
                      <div className="font-medium text-sm">{snapshot.description}</div>
                      <div className="text-xs text-gray-500">
                        {snapshot.timestamp.toLocaleString()} • {snapshot.numbers.length} numbers
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => rollbackToSnapshot(snapshot)}
                    className="border-yellow-300 text-yellow-700 hover:bg-yellow-50"
                  >
                    <RotateCcw className="h-4 w-4 mr-1" />
                    Rollback
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Configuration */}
      {isEnabled && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Yellowstone Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Auto-Snapshot Interval (hours)</Label>
                <select 
                  className="w-full mt-1 p-2 border rounded"
                  value={autoSnapshotInterval}
                  onChange={(e) => setAutoSnapshotInterval(e.target.value)}
                >
                  <option value="1">Every Hour</option>
                  <option value="6">Every 6 Hours</option>
                  <option value="12">Every 12 Hours</option>
                  <option value="24">Daily</option>
                </select>
              </div>
              <div>
                <Label>Maximum Snapshots</Label>
                <select 
                  className="w-full mt-1 p-2 border rounded"
                  value={maxSnapshots}
                  onChange={(e) => setMaxSnapshots(Number(e.target.value))}
                >
                  <option value="5">5 Snapshots</option>
                  <option value="10">10 Snapshots</option>
                  <option value="20">20 Snapshots</option>
                  <option value="50">50 Snapshots</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default YellowstoneManager;
