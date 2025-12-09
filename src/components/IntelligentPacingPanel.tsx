import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  Zap, 
  Brain, 
  RefreshCw,
  Settings
} from 'lucide-react';
import { useIntelligentPacing } from '@/hooks/useIntelligentPacing';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const IntelligentPacingPanel = () => {
  const { 
    metrics, 
    settings, 
    isAutoAdjusting,
    saveSettings, 
    refreshMetrics,
    autoAdjustDialRate 
  } = useIntelligentPacing();

  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);
  const [localSettings, setLocalSettings] = React.useState(settings);

  React.useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const handleSaveSettings = async () => {
    await saveSettings(localSettings);
    setIsSettingsOpen(false);
  };

  const getAdjustmentIcon = () => {
    if (!metrics) return <Minus className="h-4 w-4" />;
    switch (metrics.recommendedAdjustment) {
      case 'increase': return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'decrease': return <TrendingDown className="h-4 w-4 text-red-500" />;
      default: return <Minus className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getPacingBadge = () => {
    if (!metrics) return { variant: 'secondary' as const, label: 'Loading...' };
    if (metrics.pacingScore >= 80) return { variant: 'default' as const, label: 'Optimal' };
    if (metrics.pacingScore >= 60) return { variant: 'secondary' as const, label: 'Good' };
    if (metrics.pacingScore >= 40) return { variant: 'outline' as const, label: 'Fair' };
    return { variant: 'destructive' as const, label: 'Poor' };
  };

  const badge = getPacingBadge();

  return (
    <Card className="bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-950 dark:to-indigo-950 border-purple-200 dark:border-purple-800">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-xl font-bold flex items-center gap-2">
              <Brain className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              Intelligent Call Pacing
            </CardTitle>
            <CardDescription>
              AI-powered dial rate optimization based on real-time performance
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={refreshMetrics}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Settings className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Pacing Settings</DialogTitle>
                  <DialogDescription>
                    Configure intelligent pacing behavior
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Auto-Adjust Enabled</Label>
                      <p className="text-xs text-muted-foreground">
                        AI automatically adjusts dial rate
                      </p>
                    </div>
                    <Switch
                      checked={localSettings.autoAdjustEnabled}
                      onCheckedChange={(checked) => 
                        setLocalSettings({ ...localSettings, autoAdjustEnabled: checked })
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Dial Rate Range (CPM)</Label>
                    <div className="flex gap-2 items-center">
                      <Input
                        type="number"
                        value={localSettings.minDialRate}
                        onChange={(e) => setLocalSettings({
                          ...localSettings,
                          minDialRate: parseInt(e.target.value) || 5
                        })}
                        className="w-20"
                      />
                      <span className="text-sm text-muted-foreground">to</span>
                      <Input
                        type="number"
                        value={localSettings.maxDialRate}
                        onChange={(e) => setLocalSettings({
                          ...localSettings,
                          maxDialRate: parseInt(e.target.value) || 60
                        })}
                        className="w-20"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Target Answer Rate: {Math.round(localSettings.targetAnswerRate * 100)}%</Label>
                    <Slider
                      value={[localSettings.targetAnswerRate * 100]}
                      onValueChange={([value]) => 
                        setLocalSettings({ ...localSettings, targetAnswerRate: value / 100 })
                      }
                      min={10}
                      max={60}
                      step={5}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Max Abandonment Rate: {Math.round(localSettings.maxAbandonmentRate * 100)}%</Label>
                    <Slider
                      value={[localSettings.maxAbandonmentRate * 100]}
                      onValueChange={([value]) => 
                        setLocalSettings({ ...localSettings, maxAbandonmentRate: value / 100 })
                      }
                      min={1}
                      max={10}
                      step={0.5}
                    />
                    <p className="text-xs text-muted-foreground">
                      FCC limit is 3% - stay below for compliance
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Learning Rate: {Math.round(localSettings.learningRate * 100)}%</Label>
                    <Slider
                      value={[localSettings.learningRate * 100]}
                      onValueChange={([value]) => 
                        setLocalSettings({ ...localSettings, learningRate: value / 100 })
                      }
                      min={5}
                      max={30}
                      step={5}
                    />
                    <p className="text-xs text-muted-foreground">
                      How aggressively to adjust dial rate
                    </p>
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
        {/* Pacing Score */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Pacing Score</span>
            <Badge variant={badge.variant}>{badge.label}</Badge>
          </div>
          <Progress value={metrics?.pacingScore || 0} className="h-2" />
          <p className="text-xs text-muted-foreground">
            {metrics?.pacingScore || 0}/100 - Based on answer rate, abandonment, and utilization
          </p>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="h-4 w-4 text-blue-500" />
              <span className="text-xs font-medium text-muted-foreground">Current Rate</span>
            </div>
            <div className="text-xl font-bold">
              {metrics?.currentDialRate || 0}
              <span className="text-sm font-normal text-muted-foreground"> CPM</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border">
            <div className="flex items-center gap-2 mb-1">
              {getAdjustmentIcon()}
              <span className="text-xs font-medium text-muted-foreground">Target Rate</span>
            </div>
            <div className="text-xl font-bold">
              {metrics?.targetDialRate || 0}
              <span className="text-sm font-normal text-muted-foreground"> CPM</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-green-500" />
              <span className="text-xs font-medium text-muted-foreground">Answer Rate</span>
            </div>
            <div className="text-xl font-bold">
              {Math.round((metrics?.answerRate || 0) * 100)}%
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="h-4 w-4 text-red-500" />
              <span className="text-xs font-medium text-muted-foreground">Abandonment</span>
            </div>
            <div className="text-xl font-bold">
              {Math.round((metrics?.abandonmentRate || 0) * 100)}%
            </div>
          </div>
        </div>

        {/* Auto-Adjust Status */}
        <div className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 rounded-lg border">
          <div className="flex items-center gap-2">
            <Brain className={`h-5 w-5 ${settings.autoAdjustEnabled ? 'text-purple-500 animate-pulse' : 'text-gray-400'}`} />
            <div>
              <p className="text-sm font-medium">
                {settings.autoAdjustEnabled ? 'AI Auto-Adjust Active' : 'Auto-Adjust Disabled'}
              </p>
              <p className="text-xs text-muted-foreground">
                {settings.autoAdjustEnabled 
                  ? `Recommendation: ${metrics?.recommendedAdjustment || 'calculating...'}`
                  : 'Enable to let AI optimize dial rate automatically'
                }
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={autoAdjustDialRate}
            disabled={isAutoAdjusting}
          >
            {isAutoAdjusting ? 'Adjusting...' : 'Adjust Now'}
          </Button>
        </div>

        {/* Compliance Alert */}
        {metrics && metrics.abandonmentRate > 0.03 && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
            <p className="text-sm font-medium text-red-800 dark:text-red-200">
              ⚠️ Abandonment Rate Exceeds FCC Limit
            </p>
            <p className="text-xs text-red-700 dark:text-red-300 mt-1">
              Current: {Math.round(metrics.abandonmentRate * 100)}% | Limit: 3%
              {settings.autoAdjustEnabled && ' - AI is reducing dial rate automatically'}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default IntelligentPacingPanel;
