import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  Clock3,
  DollarSign,
  Moon,
  Scale,
  Sparkles,
  UserPlus,
  Voicemail,
} from 'lucide-react';

export interface LegalInboundConfig {
  weeknightCalls: number;
  weekendCallsPerDay: number;
  newProspectPercent: number;
  missedCallPercent: number;
  signedClientRate: number;
  averageClientValue: number;
}

interface DemoLegalInboundSetupProps {
  businessName?: string;
  config: LegalInboundConfig;
  onConfigChange: (config: LegalInboundConfig) => void;
  onContinue: () => void;
  onBack: () => void;
}

const money = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);

export const DemoLegalInboundSetup = ({
  businessName,
  config,
  onConfigChange,
  onContinue,
  onBack,
}: DemoLegalInboundSetupProps) => {
  const updateConfig = (key: keyof LegalInboundConfig, value: number) => {
    onConfigChange({ ...config, [key]: value });
  };

  const weeklyAfterHoursCalls = config.weeknightCalls * 5 + config.weekendCallsPerDay * 2;
  const monthlyAfterHoursCalls = Math.round(weeklyAfterHoursCalls * 4.33);
  const monthlyNewProspectCalls = Math.round(monthlyAfterHoursCalls * (config.newProspectPercent / 100));
  const monthlyMissedProspectCalls = Math.round(monthlyNewProspectCalls * (config.missedCallPercent / 100));
  const potentialClientsLost = monthlyMissedProspectCalls * (config.signedClientRate / 100);
  const monthlyRevenueAtRisk = potentialClientsLost * config.averageClientValue;

  return (
    <div className="min-h-screen p-4 md:p-8 bg-gradient-to-br from-background via-background to-indigo-500/5">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="relative">
          <div className="absolute -inset-4 bg-gradient-to-r from-indigo-500/10 via-violet-500/5 to-cyan-500/10 rounded-3xl blur-2xl" />
          <div className="relative flex items-start gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              className="rounded-full border border-border/50 hover:border-indigo-400/50 hover:bg-indigo-500/10"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/25 text-[11px] font-black tracking-[0.14em] text-indigo-300">
                <Scale className="h-3.5 w-3.5" />
                LAW FIRM INBOUND BETA
              </div>
              <h1 className="text-2xl md:text-4xl font-bold">What happens when the office is closed?</h1>
              <p className="text-muted-foreground max-w-2xl leading-relaxed">
                Give us rough numbers for {businessName || 'your firm'}. They do not need to be perfect — we use them to make the rest of the demo relevant to your actual after-hours opportunity.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-4">
          <MetricSliderCard
            icon={Moon}
            accent="indigo"
            label="Total calls on a typical weekday evening"
            helper="Roughly how many inbound calls come in after the team goes home?"
            value={config.weeknightCalls}
            valueLabel={`${config.weeknightCalls} / evening`}
            min={0}
            max={30}
            step={1}
            onChange={(value) => updateConfig('weeknightCalls', value)}
          />

          <MetricSliderCard
            icon={Clock3}
            accent="cyan"
            label="Total calls on a typical weekend day"
            helper="Saturday and Sunday inbound calls — prospects, clients, and everything else."
            value={config.weekendCallsPerDay}
            valueLabel={`${config.weekendCallsPerDay} / day`}
            min={0}
            max={50}
            step={1}
            onChange={(value) => updateConfig('weekendCallsPerDay', value)}
          />

          <MetricSliderCard
            icon={UserPlus}
            accent="violet"
            label="Percent of after-hours calls that are new prospective clients"
            helper="This keeps existing-client and vendor calls out of the new-business revenue math."
            value={config.newProspectPercent}
            valueLabel={`${config.newProspectPercent}%`}
            min={10}
            max={100}
            step={5}
            onChange={(value) => updateConfig('newProspectPercent', value)}
          />

          <MetricSliderCard
            icon={Voicemail}
            accent="rose"
            label="Percent of new-prospect calls that currently hit voicemail or go unanswered"
            helper="Use your best guess. We will show the math transparently."
            value={config.missedCallPercent}
            valueLabel={`${config.missedCallPercent}%`}
            min={0}
            max={100}
            step={5}
            onChange={(value) => updateConfig('missedCallPercent', value)}
          />

          <MetricSliderCard
            icon={BriefcaseBusiness}
            accent="emerald"
            label="Percent of qualified new callers who become clients"
            helper="Your rough signed-client rate once a legitimate prospect gets a real conversation."
            value={config.signedClientRate}
            valueLabel={`${config.signedClientRate}%`}
            min={5}
            max={60}
            step={5}
            onChange={(value) => updateConfig('signedClientRate', value)}
          />

          <MetricSliderCard
            icon={DollarSign}
            accent="amber"
            label="Average revenue to the firm from a signed new client"
            helper="Use the firm's revenue/fee value — not the size of a settlement or judgment."
            value={config.averageClientValue}
            valueLabel={money(config.averageClientValue)}
            min={500}
            max={50000}
            step={500}
            onChange={(value) => updateConfig('averageClientValue', value)}
          />
        </div>

        <Card className="p-5 md:p-6 border-indigo-500/25 bg-gradient-to-br from-indigo-500/10 via-background to-cyan-500/5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <QuickStat label="After-hours calls / month" value={monthlyAfterHoursCalls.toLocaleString()} />
            <QuickStat label="New prospects / month" value={monthlyNewProspectCalls.toLocaleString()} />
            <QuickStat label="Missed new prospects / month" value={monthlyMissedProspectCalls.toLocaleString()} />
            <QuickStat label="Illustrative revenue at risk" value={money(monthlyRevenueAtRisk)} highlight />
          </div>
          <p className="text-[11px] text-muted-foreground text-center mt-4">
            Illustrative math based entirely on the estimates you entered. This is not a promise of results.
          </p>
        </Card>

        <div className="relative group pt-1">
          <div className="absolute -inset-[2px] rounded-2xl bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-400 opacity-70 blur-sm animate-pulse" />
          <Button
            size="lg"
            onClick={onContinue}
            className="relative w-full h-14 text-lg gap-2 bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-500 hover:opacity-90 rounded-xl font-bold"
          >
            <Sparkles className="h-5 w-5" />
            Experience Your After-Hours Receptionist
            <ArrowRight className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
};

const QuickStat = ({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) => (
  <div className="space-y-1">
    <div className={`text-xl md:text-2xl font-black ${highlight ? 'text-emerald-400' : 'text-foreground'}`}>{value}</div>
    <div className="text-xs text-muted-foreground leading-tight">{label}</div>
  </div>
);

const MetricSliderCard = ({
  icon: Icon,
  label,
  helper,
  value,
  valueLabel,
  min,
  max,
  step,
  onChange,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  helper: string;
  value: number;
  valueLabel: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  accent: 'indigo' | 'cyan' | 'violet' | 'rose' | 'emerald' | 'amber';
}) => {
  const accentClasses = {
    indigo: 'border-indigo-500/30 bg-indigo-500/5 text-indigo-400',
    cyan: 'border-cyan-500/30 bg-cyan-500/5 text-cyan-400',
    violet: 'border-violet-500/30 bg-violet-500/5 text-violet-400',
    rose: 'border-rose-500/30 bg-rose-500/5 text-rose-400',
    emerald: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400',
    amber: 'border-amber-500/30 bg-amber-500/5 text-amber-400',
  }[accent];

  return (
    <Card className={`p-5 md:p-6 border-2 ${accentClasses}`}>
      <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
        <div className="flex items-start gap-3 flex-1">
          <div className="p-2.5 rounded-xl bg-background/60 border border-current/10">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <Label className="text-sm md:text-base font-semibold text-foreground">{label}</Label>
            <p className="text-xs md:text-sm text-muted-foreground mt-1">{helper}</p>
          </div>
        </div>
        <div className="md:w-64 space-y-3">
          <div className="text-right text-2xl font-black text-foreground">{valueLabel}</div>
          <Slider value={[value]} min={min} max={max} step={step} onValueChange={([next]) => onChange(next)} />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{min.toLocaleString()}</span>
            <span>{max.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </Card>
  );
};
