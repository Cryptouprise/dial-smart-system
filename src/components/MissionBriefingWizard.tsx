import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import {
  Rocket, ChevronRight, ChevronLeft, Check, Loader2, Phone,
  Target, Users, TrendingUp, MessageSquare, ArrowRight, Sparkles, Plus
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAIBrainContext } from '@/contexts/AIBrainContext';
import { toast } from 'sonner';

interface WizardData {
  businessDescription: string;
  goalType: 'appointments' | 'qualify' | 'callbacks';
  dailyTarget: number;
  maxCostPerResult: number;
  startingLeads: number;
  rampUpTarget: number;
  dailyCalls: number;
  rampUpBehavior: 'conservative' | 'moderate' | 'aggressive';
  followUpStrategy: 'aggressive' | 'balanced' | 'gentle' | 'calls_only';
  provider: 'retell' | 'telnyx';
}

const INITIAL_DATA: WizardData = {
  businessDescription: '',
  goalType: 'appointments',
  dailyTarget: 10,
  maxCostPerResult: 20,
  startingLeads: 500,
  rampUpTarget: 5000,
  dailyCalls: 200,
  rampUpBehavior: 'moderate',
  followUpStrategy: 'balanced',
  provider: 'retell',
};

const GOAL_LABELS: Record<string, string> = {
  appointments: 'Book appointments / transfers to live agents',
  qualify: 'Collect info / qualify leads',
  callbacks: 'Drive to landing page / generate callbacks',
};

const RAMP_LABELS: Record<string, { label: string; desc: string }> = {
  conservative: { label: 'Conservative', desc: '+20%/day when results are good' },
  moderate: { label: 'Moderate', desc: '+50%/day as results come in' },
  aggressive: { label: 'Aggressive', desc: 'Double daily until target hit' },
};

const STRATEGY_LABELS: Record<string, { label: string; desc: string }> = {
  aggressive: { label: 'Aggressive', desc: 'Call fast, follow up hard' },
  balanced: { label: 'Balanced', desc: 'Professional cadence, calls + texts' },
  gentle: { label: 'Gentle', desc: 'Spaced out, relationship-building' },
  calls_only: { label: 'Calls Only', desc: 'No SMS — just call-wait-call-wait' },
};

const PIPELINE_STAGES: Record<string, string[]> = {
  appointments: ['New Lead', 'Contacted', 'Interested', 'Appointment Set', 'Completed'],
  qualify: ['New Lead', 'Contacted', 'Qualified', 'Sent to Team', 'Closed'],
  callbacks: ['New Lead', 'Contacted', 'Callback Requested', 'Converted', 'Closed'],
};

const MissionBriefingWizard: React.FC = () => {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<WizardData>(INITIAL_DATA);
  const [isBuilding, setIsBuilding] = useState(false);
  const [buildComplete, setBuildComplete] = useState(false);
  const [currentNumbers, setCurrentNumbers] = useState<number>(0);
  const { sendMessage } = useAIBrainContext();

  // Fetch current phone number count
  useEffect(() => {
    (async () => {
      const { count } = await supabase
        .from('phone_numbers')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');
      setCurrentNumbers(count ?? 0);
    })();
  }, []);

  const numbersNeeded = useMemo(() => Math.ceil(data.dailyCalls / 80), [data.dailyCalls]);
  const deficit = useMemo(() => Math.max(0, numbersNeeded - currentNumbers), [numbersNeeded, currentNumbers]);

  const totalSteps = 6;
  const progressPct = ((step + 1) / totalSteps) * 100;

  const canAdvance = () => {
    if (step === 0) return data.businessDescription.trim().length > 10;
    return true;
  };

  const update = (partial: Partial<WizardData>) => setData(prev => ({ ...prev, ...partial }));

  const handleBuild = async () => {
    setIsBuilding(true);
    try {
      const enableSms = data.followUpStrategy !== 'calls_only';
      const prompt = [
        `BUILD A CAMPAIGN FROM THIS MISSION BRIEFING:`,
        ``,
        `Business: ${data.businessDescription}`,
        `Goal: ${GOAL_LABELS[data.goalType]}`,
        `Daily target: ${data.dailyTarget} results/day`,
        `Max cost per result: $${data.maxCostPerResult}`,
        `Starting leads: ${data.startingLeads}, ramping to ${data.rampUpTarget}`,
        `Daily calls to start: ${data.dailyCalls}`,
        `Ramp-up: ${RAMP_LABELS[data.rampUpBehavior].label} (${RAMP_LABELS[data.rampUpBehavior].desc})`,
        `Follow-up strategy: ${STRATEGY_LABELS[data.followUpStrategy].label}`,
        `Provider: ${data.provider}`,
        `Enable SMS: ${enableSms}`,
        ``,
        `Pipeline stages to create: ${PIPELINE_STAGES[data.goalType].join(' → ')}`,
        ``,
        enableSms
          ? `Use a mix of call and SMS steps in the workflow.`
          : `Only use call and wait steps in the workflow. No SMS at all.`,
        ``,
        `Set autonomous settings: daily_goal_calls=${data.dailyCalls}, daily_goal_appointments=${data.dailyTarget}.`,
        `Enable lead journeys, calling time optimization, and adaptive pacing.`,
        `Create this campaign now using setup_full_campaign.`,
      ].join('\n');

      await sendMessage(prompt);
      setBuildComplete(true);
      toast.success('Campaign build initiated! Check the AI chat for progress.');
    } catch (err) {
      toast.error('Failed to start campaign build. Please try again.');
      console.error('Mission briefing build error:', err);
    } finally {
      setIsBuilding(false);
    }
  };

  if (buildComplete) {
    return (
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex items-center justify-between p-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
              <Check className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Mission Active</p>
              <p className="text-sm text-muted-foreground">
                Your campaign is being built by the AI. Check the chat panel for status.
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => { setBuildComplete(false); setStep(0); setData(INITIAL_DATA); }}>
            <Plus className="h-4 w-4 mr-1" /> New Mission
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Mission Briefing</CardTitle>
          </div>
          <Badge variant="secondary" className="text-xs">
            Step {step + 1} of {totalSteps}
          </Badge>
        </div>
        <Progress value={progressPct} className="h-1.5 mt-2" />
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Step 0: Business Description */}
        {step === 0 && (
          <div className="space-y-3">
            <Label className="text-base font-semibold">What are you selling?</Label>
            <Textarea
              value={data.businessDescription}
              onChange={e => update({ businessDescription: e.target.value })}
              placeholder="e.g. Solar panel installations for homeowners in Florida. We offer free consultations and financing options."
              className="min-h-[100px] resize-none"
            />
            <p className="text-xs text-muted-foreground">
              Describe your business, product, or service in plain English. The AI uses this to craft your campaign script and strategy.
            </p>
          </div>
        )}

        {/* Step 1: Goal */}
        {step === 1 && (
          <div className="space-y-4">
            <Label className="text-base font-semibold">What's your goal?</Label>
            <RadioGroup value={data.goalType} onValueChange={(v) => update({ goalType: v as WizardData['goalType'] })}>
              {Object.entries(GOAL_LABELS).map(([key, label]) => (
                <div key={key} className="flex items-center space-x-2 p-3 rounded-lg border hover:bg-accent/50 transition-colors">
                  <RadioGroupItem value={key} id={`goal-${key}`} />
                  <Label htmlFor={`goal-${key}`} className="cursor-pointer flex-1">{label}</Label>
                </div>
              ))}
            </RadioGroup>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <Label className="text-sm">Daily target</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Input type="number" value={data.dailyTarget} onChange={e => update({ dailyTarget: parseInt(e.target.value) || 1 })} min={1} max={500} className="w-24" />
                  <span className="text-sm text-muted-foreground">results/day</span>
                </div>
              </div>
              <div>
                <Label className="text-sm">Max cost per result</Label>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-muted-foreground">$</span>
                  <Input type="number" value={data.maxCostPerResult} onChange={e => update({ maxCostPerResult: parseInt(e.target.value) || 1 })} min={1} max={500} className="w-24" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Leads & Phone Numbers */}
        {step === 2 && (
          <div className="space-y-4">
            <Label className="text-base font-semibold">How many leads are you starting with?</Label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm">Starting leads</Label>
                <Input type="number" value={data.startingLeads} onChange={e => update({ startingLeads: parseInt(e.target.value) || 100 })} min={10} className="mt-1" />
              </div>
              <div>
                <Label className="text-sm">Ramp-up target</Label>
                <Input type="number" value={data.rampUpTarget} onChange={e => update({ rampUpTarget: parseInt(e.target.value) || 500 })} min={100} className="mt-1" />
                <p className="text-xs text-muted-foreground mt-1">Where you want to be in 2 weeks</p>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-accent/30 border space-y-1">
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm">Phone Number Recommendation</span>
              </div>
              <p className="text-sm text-muted-foreground">
                For <strong>{data.dailyCalls}</strong> calls/day you'll need ~<strong>{numbersNeeded}</strong> numbers.
                You currently have <strong>{currentNumbers}</strong>.
              </p>
              {deficit > 0 && (
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  ⚠️ We recommend buying <strong>{deficit}</strong> more numbers before launch.
                </p>
              )}
              {deficit === 0 && (
                <p className="text-sm text-green-600 dark:text-green-400">
                  ✅ You have enough numbers for this volume.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Daily Calls & Ramp-up */}
        {step === 3 && (
          <div className="space-y-4">
            <Label className="text-base font-semibold">How many calls per day to start?</Label>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Daily calls</span>
                <span className="font-semibold text-primary">{data.dailyCalls}</span>
              </div>
              <Slider
                value={[data.dailyCalls]}
                onValueChange={([v]) => update({ dailyCalls: v })}
                min={50}
                max={5000}
                step={50}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>50</span><span>5,000</span>
              </div>
            </div>

            <Label className="text-base font-semibold pt-2">How should we ramp up?</Label>
            <RadioGroup value={data.rampUpBehavior} onValueChange={(v) => update({ rampUpBehavior: v as WizardData['rampUpBehavior'] })}>
              {Object.entries(RAMP_LABELS).map(([key, { label, desc }]) => (
                <div key={key} className="flex items-center space-x-2 p-3 rounded-lg border hover:bg-accent/50 transition-colors">
                  <RadioGroupItem value={key} id={`ramp-${key}`} />
                  <Label htmlFor={`ramp-${key}`} className="cursor-pointer flex-1">
                    <span className="font-medium">{label}</span>
                    <span className="text-muted-foreground text-sm ml-2">— {desc}</span>
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>
        )}

        {/* Step 4: Follow-up Strategy */}
        {step === 4 && (
          <div className="space-y-4">
            <Label className="text-base font-semibold">How should we follow up?</Label>
            <RadioGroup value={data.followUpStrategy} onValueChange={(v) => update({ followUpStrategy: v as WizardData['followUpStrategy'] })}>
              {Object.entries(STRATEGY_LABELS).map(([key, { label, desc }]) => (
                <div key={key} className="flex items-center space-x-2 p-3 rounded-lg border hover:bg-accent/50 transition-colors">
                  <RadioGroupItem value={key} id={`strat-${key}`} />
                  <Label htmlFor={`strat-${key}`} className="cursor-pointer flex-1">
                    <span className="font-medium">{label}</span>
                    <span className="text-muted-foreground text-sm ml-2">— {desc}</span>
                  </Label>
                </div>
              ))}
            </RadioGroup>

            <div className="pt-2">
              <Label className="text-sm font-semibold">Voice Provider</Label>
              <RadioGroup value={data.provider} onValueChange={(v) => update({ provider: v as 'retell' | 'telnyx' })} className="flex gap-4 mt-2">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="retell" id="prov-retell" />
                  <Label htmlFor="prov-retell" className="cursor-pointer">Retell AI</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="telnyx" id="prov-telnyx" />
                  <Label htmlFor="prov-telnyx" className="cursor-pointer">Telnyx</Label>
                </div>
              </RadioGroup>
            </div>
          </div>
        )}

        {/* Step 5: Review & Build */}
        {step === 5 && (
          <div className="space-y-4">
            <Label className="text-base font-semibold">Review & Build</Label>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between p-2 rounded bg-accent/20"><span className="text-muted-foreground">Business</span><span className="font-medium text-right max-w-[60%] truncate">{data.businessDescription.slice(0, 80)}{data.businessDescription.length > 80 ? '…' : ''}</span></div>
              <div className="flex justify-between p-2 rounded bg-accent/20"><span className="text-muted-foreground">Goal</span><span className="font-medium">{GOAL_LABELS[data.goalType]}</span></div>
              <div className="flex justify-between p-2 rounded bg-accent/20"><span className="text-muted-foreground">Daily target</span><span className="font-medium">{data.dailyTarget} results @ ≤${data.maxCostPerResult} each</span></div>
              <div className="flex justify-between p-2 rounded bg-accent/20"><span className="text-muted-foreground">Leads</span><span className="font-medium">{data.startingLeads.toLocaleString()} → {data.rampUpTarget.toLocaleString()}</span></div>
              <div className="flex justify-between p-2 rounded bg-accent/20"><span className="text-muted-foreground">Daily calls</span><span className="font-medium">{data.dailyCalls} ({RAMP_LABELS[data.rampUpBehavior].label} ramp)</span></div>
              <div className="flex justify-between p-2 rounded bg-accent/20"><span className="text-muted-foreground">Strategy</span><span className="font-medium">{STRATEGY_LABELS[data.followUpStrategy].label}</span></div>
              <div className="flex justify-between p-2 rounded bg-accent/20"><span className="text-muted-foreground">Provider</span><span className="font-medium">{data.provider === 'retell' ? 'Retell AI' : 'Telnyx'}</span></div>
              <div className="flex justify-between p-2 rounded bg-accent/20"><span className="text-muted-foreground">Numbers</span><span className="font-medium">{currentNumbers} owned / {numbersNeeded} recommended</span></div>
            </div>

            <div className="p-3 rounded-lg border bg-accent/10 space-y-2">
              <p className="font-medium text-sm flex items-center gap-1">
                <Sparkles className="h-4 w-4 text-primary" /> Pipeline Stages
              </p>
              <div className="flex flex-wrap items-center gap-1">
                {PIPELINE_STAGES[data.goalType].map((stage, i) => (
                  <React.Fragment key={stage}>
                    <Badge variant="secondary" className="text-xs">{stage}</Badge>
                    {i < PIPELINE_STAGES[data.goalType].length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setStep(s => s - 1)}
            disabled={step === 0}
          >
            <ChevronLeft className="h-4 w-4 mr-1" /> Back
          </Button>

          {step < 5 ? (
            <Button size="sm" onClick={() => setStep(s => s + 1)} disabled={!canAdvance()}>
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button size="sm" onClick={handleBuild} disabled={isBuilding} className="gap-2">
              {isBuilding ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Building…</>
              ) : (
                <><Rocket className="h-4 w-4" /> Build My Campaign</>
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default MissionBriefingWizard;
