import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { ArrowLeft, ArrowRight, Phone, Target, DollarSign, Brain, Info } from 'lucide-react';

interface SimulationConfig {
  leadCount: number;
  dailyGoalAppointments: number;
  costPerAppointmentTarget: number;
  phoneNumbersNeeded: number;
  enablePredictiveDialing: boolean;
}

interface DemoCampaignSetupProps {
  campaignType: string;
  config: SimulationConfig;
  onConfigChange: (config: SimulationConfig) => void;
  onContinue: () => void;
  onBack: () => void;
}

const CAMPAIGN_TYPE_LABELS: Record<string, string> = {
  database_reactivation: 'Database Reactivation',
  speed_to_lead: 'Speed to Lead',
  appointment_setter: 'Appointment Setter',
  cross_sell: 'Cross-sell / Upsell',
  reminder: 'Appointment Reminders',
};

export const DemoCampaignSetup = ({
  campaignType,
  config,
  onConfigChange,
  onContinue,
  onBack,
}: DemoCampaignSetupProps) => {
  const updateConfig = (key: keyof SimulationConfig, value: any) => {
    const newConfig = { ...config, [key]: value };
    
    // Auto-calculate phone numbers needed (1 per 100 calls)
    if (key === 'leadCount') {
      newConfig.phoneNumbersNeeded = Math.max(10, Math.ceil(value / 100));
    }
    
    onConfigChange(newConfig);
  };

  const estimatedCost = Math.round(config.leadCount * 0.07); // ~$0.07 per call attempt

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Campaign Setup</h1>
            <p className="text-muted-foreground">
              Configure your {CAMPAIGN_TYPE_LABELS[campaignType] || 'campaign'} simulation
            </p>
          </div>
        </div>

        {/* Configuration Cards */}
        <div className="space-y-4">
          {/* Lead Count */}
          <Card className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Target className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <Label className="text-base">How many leads to call?</Label>
                  <p className="text-sm text-muted-foreground">
                    Estimated cost: <span className="text-primary font-medium">${estimatedCost}</span>
                  </p>
                </div>
              </div>
              <div className="text-2xl font-bold text-primary">
                {config.leadCount.toLocaleString()}
              </div>
            </div>
            <Slider
              value={[config.leadCount]}
              onValueChange={([v]) => updateConfig('leadCount', v)}
              min={100}
              max={10000}
              step={100}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>100</span>
              <span>5,000</span>
              <span>10,000</span>
            </div>
          </Card>

          {/* Daily Goal */}
          <Card className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <Target className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <Label className="text-base">Daily appointment goal</Label>
                  <p className="text-sm text-muted-foreground">
                    AI will optimize to hit this target
                  </p>
                </div>
              </div>
              <div className="text-2xl font-bold text-green-500">
                {config.dailyGoalAppointments}
              </div>
            </div>
            <Slider
              value={[config.dailyGoalAppointments]}
              onValueChange={([v]) => updateConfig('dailyGoalAppointments', v)}
              min={1}
              max={20}
              step={1}
            />
          </Card>

          {/* Cost Target */}
          <Card className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-yellow-500/10">
                  <DollarSign className="h-5 w-5 text-yellow-500" />
                </div>
                <div>
                  <Label className="text-base">Target cost per appointment</Label>
                  <p className="text-sm text-muted-foreground">
                    System optimizes to stay under target
                  </p>
                </div>
              </div>
              <div className="text-2xl font-bold text-yellow-500">
                ${config.costPerAppointmentTarget}
              </div>
            </div>
            <Slider
              value={[config.costPerAppointmentTarget]}
              onValueChange={([v]) => updateConfig('costPerAppointmentTarget', v)}
              min={20}
              max={200}
              step={10}
            />
          </Card>

          {/* Phone Numbers Info */}
          <Card className="p-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Phone className="h-5 w-5 text-blue-500" />
              </div>
              <div className="flex-1">
                <Label className="text-base">Phone numbers needed</Label>
                <p className="text-sm text-muted-foreground">
                  {config.phoneNumbersNeeded} numbers × $2/month = ${config.phoneNumbersNeeded * 2}/month
                </p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-blue-500">{config.phoneNumbersNeeded}</div>
                <div className="text-xs text-muted-foreground">Auto-rotated</div>
              </div>
            </div>
          </Card>

          {/* Predictive Dialing Toggle */}
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/10">
                  <Brain className="h-5 w-5 text-purple-500" />
                </div>
                <div>
                  <Label className="text-base">AI Predictive Dialing</Label>
                  <p className="text-sm text-muted-foreground">
                    AI manager optimizes speed, agents, and goals
                  </p>
                </div>
              </div>
              <Switch
                checked={config.enablePredictiveDialing}
                onCheckedChange={(v) => updateConfig('enablePredictiveDialing', v)}
              />
            </div>
          </Card>
        </div>

        {/* Info Box */}
        <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50">
          <Info className="h-5 w-5 text-muted-foreground mt-0.5" />
          <div className="text-sm text-muted-foreground">
            <p>
              <strong>Keep in mind:</strong> Average pickup rates are ~10%, and ~60-70% of pickups 
              result in voicemails. Calling a few thousand people typically costs less than $150.
            </p>
          </div>
        </div>

        {/* Continue Button */}
        <Button size="lg" className="w-full gap-2" onClick={onContinue}>
          Continue to Demo Call
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};
