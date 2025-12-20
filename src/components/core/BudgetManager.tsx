import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { 
  DollarSign, 
  TrendingUp, 
  AlertTriangle, 
  RefreshCw, 
  Pause, 
  Play,
  Bell,
  Phone,
  MessageSquare,
  Clock,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { useBudgetTracker } from '@/hooks/useBudgetTracker';
import { supabase } from '@/integrations/supabase/client';

interface Campaign {
  id: string;
  name: string;
  status: string;
}

export function BudgetManager() {
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [tempSettings, setTempSettings] = useState({
    dailyLimit: '',
    monthlyLimit: '',
    alertThreshold: 80,
    autoPause: true
  });

  const {
    budgetSettings,
    dailySummary,
    monthlySummary,
    alerts,
    budgetStatus,
    isLoading,
    updateBudgetSettings,
    acknowledgeAlert,
    togglePause,
    refreshUsage
  } = useBudgetTracker(selectedCampaign);

  useEffect(() => {
    loadCampaigns();
  }, []);

  useEffect(() => {
    if (budgetSettings) {
      setTempSettings({
        dailyLimit: budgetSettings.daily_limit?.toString() || '',
        monthlyLimit: budgetSettings.monthly_limit?.toString() || '',
        alertThreshold: budgetSettings.alert_threshold_percent || 80,
        autoPause: budgetSettings.auto_pause_enabled
      });
    }
  }, [budgetSettings]);

  const loadCampaigns = async () => {
    const { data } = await supabase
      .from('campaigns')
      .select('id, name, status')
      .order('created_at', { ascending: false });
    
    if (data) {
      setCampaigns(data);
    }
  };

  const handleSaveSettings = async () => {
    await updateBudgetSettings({
      dailyLimit: tempSettings.dailyLimit ? parseFloat(tempSettings.dailyLimit) : null,
      monthlyLimit: tempSettings.monthlyLimit ? parseFloat(tempSettings.monthlyLimit) : null,
      alertThreshold: tempSettings.alertThreshold,
      autoPause: tempSettings.autoPause
    });
    setEditMode(false);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  const getDailyProgress = () => {
    if (!budgetSettings?.daily_limit || !dailySummary) return 0;
    return Math.min((dailySummary.total / budgetSettings.daily_limit) * 100, 100);
  };

  const getMonthlyProgress = () => {
    if (!budgetSettings?.monthly_limit || !monthlySummary) return 0;
    return Math.min((monthlySummary.total / budgetSettings.monthly_limit) * 100, 100);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Budget Manager</h2>
          <p className="text-muted-foreground">Monitor and control your spending across all providers</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedCampaign || 'global'} onValueChange={(v) => setSelectedCampaign(v === 'global' ? null : v)}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select scope" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="global">Global Budget</SelectItem>
              {campaigns.map((campaign) => (
                <SelectItem key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={refreshUsage} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((alert) => (
            <Alert key={alert.id} variant={alert.alert_type.includes('exceeded') ? 'destructive' : 'default'}>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle className="flex items-center justify-between">
                <span>{alert.alert_type.includes('exceeded') ? 'Budget Exceeded' : 'Budget Warning'}</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => acknowledgeAlert(alert.id, 'continue')}>
                    Continue
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => acknowledgeAlert(alert.id, 'pause')}>
                    Pause
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => acknowledgeAlert(alert.id, 'dismiss')}>
                    Dismiss
                  </Button>
                </div>
              </AlertTitle>
              <AlertDescription>{alert.message}</AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      {/* Pause Status */}
      {budgetSettings?.is_paused && (
        <Alert variant="destructive">
          <Pause className="h-4 w-4" />
          <AlertTitle>Campaigns Paused</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>Calls have been paused due to budget limits. {budgetSettings.pause_reason}</span>
            <Button size="sm" onClick={() => togglePause(false)}>
              <Play className="h-4 w-4 mr-2" />
              Resume
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="breakdown">Cost Breakdown</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Today's Spending</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(dailySummary?.total || 0)}</div>
                {budgetSettings?.daily_limit && (
                  <>
                    <p className="text-xs text-muted-foreground">
                      of {formatCurrency(budgetSettings.daily_limit)} limit
                    </p>
                    <Progress value={getDailyProgress()} className="mt-2" />
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Monthly Spending</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(monthlySummary?.total || 0)}</div>
                {budgetSettings?.monthly_limit && (
                  <>
                    <p className="text-xs text-muted-foreground">
                      of {formatCurrency(budgetSettings.monthly_limit)} limit
                    </p>
                    <Progress value={getMonthlyProgress()} className="mt-2" />
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Calls Made</CardTitle>
                <Phone className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{monthlySummary?.callCount || 0}</div>
                <p className="text-xs text-muted-foreground">
                  {formatDuration(monthlySummary?.durationSeconds || 0)} total duration
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">SMS Sent</CardTitle>
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{monthlySummary?.smsCount || 0}</div>
                <p className="text-xs text-muted-foreground">This month</p>
              </CardContent>
            </Card>
          </div>

          {/* Provider Breakdown */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Badge variant="outline" className="bg-blue-500/10 text-blue-500">Twilio</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{formatCurrency(monthlySummary?.twilio || 0)}</div>
                <p className="text-sm text-muted-foreground mt-1">Voice & SMS costs</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Badge variant="outline" className="bg-purple-500/10 text-purple-500">Retell AI</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{formatCurrency(monthlySummary?.retell || 0)}</div>
                <p className="text-sm text-muted-foreground mt-1">AI agent minutes</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Badge variant="outline" className="bg-green-500/10 text-green-500">ElevenLabs</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{formatCurrency(monthlySummary?.elevenlabs || 0)}</div>
                <p className="text-sm text-muted-foreground mt-1">Text-to-speech</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Budget Settings</CardTitle>
              <CardDescription>
                Configure your spending limits and alerts for {selectedCampaign ? 'this campaign' : 'all campaigns'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="daily-limit">Daily Spending Limit</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="daily-limit"
                      type="number"
                      placeholder="No limit"
                      className="pl-9"
                      value={tempSettings.dailyLimit}
                      onChange={(e) => setTempSettings(prev => ({ ...prev, dailyLimit: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="monthly-limit">Monthly Spending Limit</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="monthly-limit"
                      type="number"
                      placeholder="No limit"
                      className="pl-9"
                      value={tempSettings.monthlyLimit}
                      onChange={(e) => setTempSettings(prev => ({ ...prev, monthlyLimit: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Alert Threshold: {tempSettings.alertThreshold}%</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive a warning when spending reaches this percentage of your limit
                  </p>
                  <Slider
                    value={[tempSettings.alertThreshold]}
                    onValueChange={([value]) => setTempSettings(prev => ({ ...prev, alertThreshold: value }))}
                    min={50}
                    max={100}
                    step={5}
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label>Auto-pause when limit reached</Label>
                    <p className="text-sm text-muted-foreground">
                      Automatically pause all campaigns when budget is exceeded
                    </p>
                  </div>
                  <Switch
                    checked={tempSettings.autoPause}
                    onCheckedChange={(checked) => setTempSettings(prev => ({ ...prev, autoPause: checked }))}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setTempSettings({
                  dailyLimit: budgetSettings?.daily_limit?.toString() || '',
                  monthlyLimit: budgetSettings?.monthly_limit?.toString() || '',
                  alertThreshold: budgetSettings?.alert_threshold_percent || 80,
                  autoPause: budgetSettings?.auto_pause_enabled ?? true
                })}>
                  Reset
                </Button>
                <Button onClick={handleSaveSettings} disabled={isLoading}>
                  Save Settings
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Manual Controls */}
          <Card>
            <CardHeader>
              <CardTitle>Manual Controls</CardTitle>
              <CardDescription>Manually pause or resume campaigns</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <Button
                  variant={budgetSettings?.is_paused ? 'default' : 'destructive'}
                  onClick={() => togglePause(!budgetSettings?.is_paused)}
                >
                  {budgetSettings?.is_paused ? (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Resume Campaigns
                    </>
                  ) : (
                    <>
                      <Pause className="h-4 w-4 mr-2" />
                      Pause Campaigns
                    </>
                  )}
                </Button>
                <span className="text-sm text-muted-foreground">
                  {budgetSettings?.is_paused 
                    ? `Paused since ${new Date(budgetSettings.paused_at || '').toLocaleString()}`
                    : 'Campaigns are running normally'
                  }
                </span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="breakdown" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Detailed Cost Breakdown</CardTitle>
              <CardDescription>See where your money is going</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Twilio breakdown */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Twilio Voice</span>
                    <span>{formatCurrency((monthlySummary?.twilio || 0) * 0.8)}</span>
                  </div>
                  <Progress value={80} className="h-2" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Twilio SMS</span>
                    <span>{formatCurrency((monthlySummary?.twilio || 0) * 0.2)}</span>
                  </div>
                  <Progress value={20} className="h-2" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Retell AI Minutes</span>
                    <span>{formatCurrency(monthlySummary?.retell || 0)}</span>
                  </div>
                  <Progress value={60} className="h-2" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">ElevenLabs TTS</span>
                    <span>{formatCurrency(monthlySummary?.elevenlabs || 0)}</span>
                  </div>
                  <Progress value={10} className="h-2" />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
