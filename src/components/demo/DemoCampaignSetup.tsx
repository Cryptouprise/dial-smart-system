import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { ArrowLeft, ArrowRight, Phone, Target, DollarSign, Brain, Info, Wand2, Sparkles, Settings2, Zap } from 'lucide-react';

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
    <div className="min-h-screen p-4 md:p-8 bg-background">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Premium Header */}
        <div className="relative">
          <div className="absolute -inset-4 bg-gradient-to-r from-violet-500/10 via-primary/5 to-cyan-500/10 rounded-3xl blur-2xl" />
          
          <div className="relative flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={onBack}
              className="rounded-full border border-border/50 hover:border-primary/50 hover:bg-primary/10 transition-all"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Settings2 className="h-5 w-5 text-primary" />
                <h1 className="text-2xl md:text-3xl font-bold">Campaign Setup</h1>
              </div>
              <p className="text-muted-foreground mt-1">
                Configure your{' '}
                <span className="bg-gradient-to-r from-primary to-cyan-500 bg-clip-text text-transparent font-semibold">
                  {CAMPAIGN_TYPE_LABELS[campaignType] || 'campaign'}
                </span>{' '}
                simulation
              </p>
            </div>
          </div>
        </div>

        {/* Configuration Cards */}
        <div className="space-y-4">
          {/* Lead Count - Premium Card */}
          <div className="relative group">
            <div className="absolute -inset-[1px] bg-gradient-to-r from-primary/50 to-cyan-500/50 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity blur-sm" />
            <Card className="relative p-6 space-y-4 bg-background/80 backdrop-blur-sm border-border/50 rounded-2xl hover:border-primary/30 transition-all">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-violet-500/20 border border-primary/20">
                    <Target className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <Label className="text-base font-semibold">How many leads to call?</Label>
                    <p className="text-sm text-muted-foreground">
                      Estimated cost: <span className="text-primary font-bold">${estimatedCost}</span>
                    </p>
                  </div>
                </div>
                <div className="text-3xl font-bold bg-gradient-to-r from-primary to-cyan-500 bg-clip-text text-transparent">
                  {config.leadCount.toLocaleString()}
                </div>
              </div>
              <Slider
                value={[config.leadCount]}
                onValueChange={([v]) => updateConfig('leadCount', v)}
                min={100}
                max={10000}
                step={100}
                className="py-2"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>100</span>
                <span>5,000</span>
                <span>10,000</span>
              </div>
            </Card>
          </div>

          {/* Daily Goal - Premium Card */}
          <div className="relative group">
            <div className="absolute -inset-[1px] bg-gradient-to-r from-emerald-500/50 to-green-500/50 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity blur-sm" />
            <Card className="relative p-6 space-y-4 bg-background/80 backdrop-blur-sm border-border/50 rounded-2xl hover:border-emerald-500/30 transition-all">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-500/20 to-green-500/20 border border-emerald-500/20">
                    <Zap className="h-5 w-5 text-emerald-500" />
                  </div>
                  <div>
                    <Label className="text-base font-semibold">Daily appointment goal</Label>
                    <p className="text-sm text-muted-foreground">
                      AI will optimize to hit this target
                    </p>
                  </div>
                </div>
                <div className="text-3xl font-bold text-emerald-500">
                  {config.dailyGoalAppointments}
                </div>
              </div>
              <Slider
                value={[config.dailyGoalAppointments]}
                onValueChange={([v]) => updateConfig('dailyGoalAppointments', v)}
                min={1}
                max={20}
                step={1}
                className="py-2"
              />
            </Card>
          </div>

          {/* Cost Target - Premium Card */}
          <div className="relative group">
            <div className="absolute -inset-[1px] bg-gradient-to-r from-amber-500/50 to-yellow-500/50 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity blur-sm" />
            <Card className="relative p-6 space-y-4 bg-background/80 backdrop-blur-sm border-border/50 rounded-2xl hover:border-amber-500/30 transition-all">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-gradient-to-br from-amber-500/20 to-yellow-500/20 border border-amber-500/20">
                    <DollarSign className="h-5 w-5 text-amber-500" />
                  </div>
                  <div>
                    <Label className="text-base font-semibold">Target cost per appointment</Label>
                    <p className="text-sm text-muted-foreground">
                      System optimizes to stay under target
                    </p>
                  </div>
                </div>
                <div className="text-3xl font-bold text-amber-500">
                  ${config.costPerAppointmentTarget}
                </div>
              </div>
              <Slider
                value={[config.costPerAppointmentTarget]}
                onValueChange={([v]) => updateConfig('costPerAppointmentTarget', v)}
                min={20}
                max={200}
                step={10}
                className="py-2"
              />
            </Card>
          </div>

          {/* Phone Numbers Info - Premium Card */}
          <div className="relative group">
            <div className="absolute -inset-[1px] bg-gradient-to-r from-blue-500/50 to-cyan-500/50 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity blur-sm" />
            <Card className="relative p-6 bg-background/80 backdrop-blur-sm border-border/50 rounded-2xl hover:border-blue-500/30 transition-all">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/20">
                  <Phone className="h-5 w-5 text-blue-500" />
                </div>
                <div className="flex-1">
                  <Label className="text-base font-semibold">Phone numbers needed</Label>
                  <p className="text-sm text-muted-foreground">
                    {config.phoneNumbersNeeded} numbers × $2/month = <span className="text-blue-500 font-medium">${config.phoneNumbersNeeded * 2}/month</span>
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold text-blue-500">{config.phoneNumbersNeeded}</div>
                  <div className="text-xs text-muted-foreground bg-blue-500/10 px-2 py-0.5 rounded-full">Auto-rotated</div>
                </div>
              </div>
            </Card>
          </div>

          {/* Predictive Dialing Toggle - Premium Card */}
          <div className="relative group">
            <div className="absolute -inset-[1px] bg-gradient-to-r from-violet-500/50 to-purple-500/50 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity blur-sm" />
            <Card className="relative p-6 bg-background/80 backdrop-blur-sm border-border/50 rounded-2xl hover:border-violet-500/30 transition-all">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-500/20 border border-violet-500/20">
                    <Brain className="h-5 w-5 text-violet-500" />
                  </div>
                  <div>
                    <Label className="text-base font-semibold">AI Predictive Dialing</Label>
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
        </div>

        {/* Info Box - Styled */}
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-violet-500/5 to-cyan-500/5 rounded-2xl blur-xl" />
          <div className="relative flex items-start gap-3 p-5 rounded-2xl bg-muted/30 border border-border/30 backdrop-blur-sm">
            <div className="p-2 rounded-lg bg-primary/10">
              <Info className="h-4 w-4 text-primary" />
            </div>
            <div className="text-sm text-muted-foreground leading-relaxed">
              <strong className="text-foreground">Keep in mind:</strong> Average pickup rates are ~10%, and ~60-70% of pickups 
              result in voicemails. Calling a few thousand people typically costs less than <span className="text-primary font-semibold">$150</span>.
            </div>
          </div>
        </div>

        {/* Customization Callout - Premium */}
        <div className="relative overflow-hidden">
          <div className="absolute -inset-[1px] bg-gradient-to-r from-primary via-violet-500 to-cyan-500 rounded-2xl" />
          <div className="relative flex items-center gap-4 p-5 rounded-2xl bg-background/95 backdrop-blur-sm">
            <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-violet-500/20 border border-primary/30">
              <Wand2 className="h-5 w-5 text-primary" />
            </div>
            <p className="text-sm">
              <strong className="bg-gradient-to-r from-primary to-cyan-500 bg-clip-text text-transparent">Fully Customizable:</strong>{' '}
              <span className="text-muted-foreground">
                Lady Jarvis's personality, voice, scripts, and conversation style can be tailored to match your brand perfectly.
              </span>
            </p>
          </div>
        </div>

        {/* Premium Continue Button */}
        <div className="relative group pt-2">
          <div className="absolute -inset-[2px] rounded-2xl bg-gradient-to-r from-violet-500 via-cyan-400 to-emerald-400 opacity-75 blur-sm animate-pulse" />
          <div className="absolute -inset-[1px] rounded-xl bg-gradient-to-r from-violet-500 via-cyan-400 to-emerald-400" />
          
          <Button 
            size="lg" 
            className="relative w-full h-14 text-lg gap-2 bg-gradient-to-r from-violet-600 via-primary to-cyan-500 hover:opacity-90 transition-all hover:scale-[1.02] shadow-[0_0_30px_rgba(139,92,246,0.5)] rounded-xl font-bold border-0" 
            onClick={onContinue}
          >
            <Sparkles className="h-5 w-5" />
            Continue to Demo Call
            <ArrowRight className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
};
