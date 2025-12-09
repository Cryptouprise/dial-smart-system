import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Clock, 
  RotateCcw, 
  Calendar, 
  Brain, 
  X, 
  Settings,
  TrendingUp,
  RefreshCw
} from 'lucide-react';
import { useSmartRetry } from '@/hooks/useSmartRetry';
import { formatDistanceToNow } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const SmartRetryPanel = () => {
  const { 
    pendingRetries, 
    settings, 
    bestTimeData,
    isLoading,
    cancelRetry, 
    saveSettings,
    learnBestTimes,
    refreshRetries 
  } = useSmartRetry();

  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);
  const [localSettings, setLocalSettings] = React.useState(settings);

  React.useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const handleSaveSettings = async () => {
    await saveSettings(localSettings);
    setIsSettingsOpen(false);
  };

  const getScoreBadge = (score: number) => {
    if (score >= 70) return { variant: 'default' as const, label: 'High' };
    if (score >= 50) return { variant: 'secondary' as const, label: 'Medium' };
    return { variant: 'outline' as const, label: 'Low' };
  };

  // Get best times summary
  const topBestTimes = bestTimeData.slice(0, 5);
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-xl font-bold flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-orange-500" />
              Smart Retry Manager
            </CardTitle>
            <CardDescription>
              AI-powered retry scheduling with best-time-to-call learning
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={refreshRetries}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={learnBestTimes}
            >
              <Brain className="h-4 w-4 mr-2" />
              Learn
            </Button>
            <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Settings className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Retry Settings</DialogTitle>
                  <DialogDescription>
                    Configure smart retry behavior
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Maximum Retries</Label>
                    <Input
                      type="number"
                      value={localSettings.maxRetries}
                      onChange={(e) => setLocalSettings({
                        ...localSettings,
                        maxRetries: parseInt(e.target.value) || 5
                      })}
                      min={1}
                      max={10}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Base Delay (minutes)</Label>
                    <Input
                      type="number"
                      value={localSettings.baseDelayMinutes}
                      onChange={(e) => setLocalSettings({
                        ...localSettings,
                        baseDelayMinutes: parseInt(e.target.value) || 30
                      })}
                      min={5}
                      max={120}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Maximum Delay (minutes)</Label>
                    <Input
                      type="number"
                      value={localSettings.maxDelayMinutes}
                      onChange={(e) => setLocalSettings({
                        ...localSettings,
                        maxDelayMinutes: parseInt(e.target.value) || 1440
                      })}
                      min={60}
                      max={4320}
                    />
                    <p className="text-xs text-muted-foreground">
                      1440 = 24 hours, 4320 = 3 days
                    </p>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Exponential Backoff</Label>
                      <p className="text-xs text-muted-foreground">
                        Double delay after each failed attempt
                      </p>
                    </div>
                    <Switch
                      checked={localSettings.exponentialBackoff}
                      onCheckedChange={(checked) => 
                        setLocalSettings({ ...localSettings, exponentialBackoff: checked })
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Respect Best Time</Label>
                      <p className="text-xs text-muted-foreground">
                        Schedule retries during optimal contact windows
                      </p>
                    </div>
                    <Switch
                      checked={localSettings.respectBestTime}
                      onCheckedChange={(checked) => 
                        setLocalSettings({ ...localSettings, respectBestTime: checked })
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Learn from History</Label>
                      <p className="text-xs text-muted-foreground">
                        Analyze past calls to improve timing
                      </p>
                    </div>
                    <Switch
                      checked={localSettings.learnFromHistory}
                      onCheckedChange={(checked) => 
                        setLocalSettings({ ...localSettings, learnFromHistory: checked })
                      }
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsSettingsOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleSaveSettings}>
                    Save Settings
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Best Times Summary */}
        {topBestTimes.length > 0 && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium text-green-800 dark:text-green-200">
                Best Contact Times (Learned)
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {topBestTimes.map((bt, idx) => (
                <Badge key={idx} variant="outline" className="text-xs">
                  {dayNames[bt.dayOfWeek]} {bt.hourOfDay}:00 ({Math.round(bt.answerRate * 100)}%)
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Pending Retries List */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium">Scheduled Retries</h4>
            <Badge variant="secondary">{pendingRetries.length} pending</Badge>
          </div>
          
          {pendingRetries.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No retries scheduled
            </p>
          ) : (
            <ScrollArea className="h-[300px]">
              <div className="space-y-2">
                {pendingRetries.map((retry) => {
                  const scoreBadge = getScoreBadge(retry.bestTimeScore);
                  return (
                    <div
                      key={`${retry.leadId}-${retry.nextRetryAt}`}
                      className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 rounded-lg border"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{retry.leadName}</span>
                          <Badge variant="outline" className="text-xs">
                            Attempt {retry.attemptCount}/{retry.maxAttempts}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span>
                            {formatDistanceToNow(new Date(retry.nextRetryAt), { addSuffix: true })}
                          </span>
                          <span>•</span>
                          <Calendar className="h-3 w-3" />
                          <span>
                            {new Date(retry.nextRetryAt).toLocaleTimeString([], { 
                              hour: '2-digit', 
                              minute: '2-digit' 
                            })}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-2">
                        <Badge variant={scoreBadge.variant} className="text-xs">
                          {scoreBadge.label} Score
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => cancelRetry(retry.leadId, retry.campaignId)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Settings Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2 border-t">
          <div className="text-center p-2">
            <p className="text-xs text-muted-foreground">Max Retries</p>
            <p className="font-bold">{settings.maxRetries}</p>
          </div>
          <div className="text-center p-2">
            <p className="text-xs text-muted-foreground">Base Delay</p>
            <p className="font-bold">{settings.baseDelayMinutes}m</p>
          </div>
          <div className="text-center p-2">
            <p className="text-xs text-muted-foreground">Backoff</p>
            <p className="font-bold">{settings.exponentialBackoff ? 'Exp' : 'Linear'}</p>
          </div>
          <div className="text-center p-2">
            <p className="text-xs text-muted-foreground">Best Time</p>
            <p className="font-bold">{settings.respectBestTime ? 'On' : 'Off'}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default SmartRetryPanel;
