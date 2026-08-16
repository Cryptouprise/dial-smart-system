import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  DollarSign,
  Film,
  PhoneIncoming,
  RefreshCw,
  Scale,
  Sparkles,
  Target,
  Zap,
} from 'lucide-react';
import type { LegalInboundConfig } from './DemoLegalInboundSetup';
import type { LegalInboundResults } from './DemoLegalInboundSimulation';

interface DemoLegalInboundROIProps {
  businessName?: string;
  config: LegalInboundConfig;
  results: LegalInboundResults;
  onStartOver: () => void;
}

const money = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);

export const DemoLegalInboundROI = ({
  businessName,
  config,
  results,
  onStartOver,
}: DemoLegalInboundROIProps) => {
  const potentialClientsLost = results.baselineMissedProspectCalls * (config.signedClientRate / 100);
  const monthlyRevenueAtRisk = potentialClientsLost * config.averageClientValue;
  const annualRevenueAtRisk = monthlyRevenueAtRisk * 12;

  const scenarios = [0.25, 0.5, 0.75].map((captureRate) => {
    const recoveredCalls = results.baselineMissedProspectCalls * captureRate;
    const recoveredClients = recoveredCalls * (config.signedClientRate / 100);
    const revenueProtected = recoveredClients * config.averageClientValue;
    return { captureRate, recoveredCalls, recoveredClients, revenueProtected };
  });

  return (
    <div className="min-h-screen p-4 md:p-8 bg-gradient-to-br from-background via-background to-indigo-500/5">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/25 text-xs font-black tracking-wider text-indigo-300">
            <Sparkles className="h-3.5 w-3.5" />
            LAW FIRM INBOUND BETA
          </div>
          <h1 className="text-3xl md:text-5xl font-black leading-tight">
            Voicemail is not just a phone problem.
            <br />
            <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">It can be a revenue leak.</span>
          </h1>
          <p className="text-muted-foreground max-w-3xl mx-auto text-base md:text-lg leading-relaxed">
            Here is the opportunity model for <span className="text-foreground font-semibold">{businessName || 'your firm'}</span>, using only the rough numbers you entered. Existing-client and non-prospect calls are kept out of the new-business revenue math.
          </p>
        </div>

        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <SummaryCard label="After-hours calls / month" value={results.monthlyCalls.toLocaleString()} icon={PhoneIncoming} />
          <SummaryCard label="New prospects / month" value={results.monthlyNewProspectCalls.toLocaleString()} icon={BriefcaseBusiness} />
          <SummaryCard label="Missed new prospects / month" value={results.baselineMissedProspectCalls.toLocaleString()} icon={Scale} />
          <SummaryCard label="Illustrative monthly revenue at risk" value={money(monthlyRevenueAtRisk)} icon={DollarSign} highlight />
        </div>

        <Card className="p-6 md:p-8 border-rose-500/20 bg-gradient-to-br from-rose-500/5 via-background to-amber-500/5">
          <div className="grid md:grid-cols-[1fr_auto] items-center gap-6">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Using your own inputs</div>
              <h2 className="text-2xl md:text-3xl font-bold mt-2">Potential annual revenue currently exposed to missed new-prospect calls</h2>
              <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
                {results.baselineMissedProspectCalls.toLocaleString()} missed new-prospect calls/month × {config.signedClientRate}% signed-client rate × {money(config.averageClientValue)} average client value.
              </p>
            </div>
            <div className="text-center md:text-right">
              <div className="text-4xl md:text-6xl font-black text-rose-400">{money(annualRevenueAtRisk)}</div>
              <div className="text-xs text-muted-foreground mt-1">illustrative / year</div>
            </div>
          </div>
        </Card>

        <div className="space-y-4">
          <div className="text-center">
            <h2 className="text-2xl md:text-3xl font-bold">What if AI recovers only part of the new-prospect calls you miss today?</h2>
            <p className="text-muted-foreground mt-2">Three transparent sensitivity scenarios — not performance guarantees.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {scenarios.map((scenario) => (
              <Card
                key={scenario.captureRate}
                className={`p-6 border-2 ${scenario.captureRate === 0.5 ? 'border-indigo-500/50 bg-indigo-500/10 shadow-lg shadow-indigo-500/10' : 'border-border/50 bg-background/70'}`}
              >
                <div className="flex items-center justify-between mb-5">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Recovery scenario</div>
                  {scenario.captureRate === 0.5 && (
                    <span className="text-[10px] font-black px-2 py-1 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/25">MIDDLE CASE</span>
                  )}
                </div>
                <div className="text-5xl font-black">{Math.round(scenario.captureRate * 100)}%</div>
                <div className="mt-5 space-y-3 text-sm">
                  <MetricRow label="Missed prospects recovered" value={scenario.recoveredCalls.toFixed(0)} />
                  <MetricRow label="Potential clients recovered" value={scenario.recoveredClients.toFixed(1)} />
                  <MetricRow label="Potential monthly revenue protected" value={money(scenario.revenueProtected)} emphasize />
                  <MetricRow label="Potential annual revenue protected" value={money(scenario.revenueProtected * 12)} emphasize />
                </div>
              </Card>
            ))}
          </div>
        </div>

        <Card className="p-6 md:p-8 border-indigo-500/25 bg-gradient-to-br from-indigo-500/10 via-background to-cyan-500/5">
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2 text-sm font-bold text-indigo-300">
              <Zap className="h-4 w-4" />
              THIS IS THE DOORWAY, NOT THE WHOLE HOUSE
            </div>
            <h2 className="text-2xl md:text-3xl font-bold mt-2">Once the phone is answered, the rest of Call Boss can go to work.</h2>
            <p className="text-muted-foreground mt-2 max-w-2xl mx-auto">
              The same business context can power outbound and follow-up workflows around the firm instead of living as a one-off receptionist bot.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <EcosystemCard icon={Target} title="Speed to Lead" text="Call new web leads immediately while intent is still high." />
            <EcosystemCard icon={RefreshCw} title="Database Reactivation" text="Re-engage old inquiries and people who never booked or signed." />
            <EcosystemCard icon={Film} title="AI Video Follow-Up" text="Pair calls and SMS with personalized video or educational follow-up." />
            <EcosystemCard icon={BriefcaseBusiness} title="Appointment + Intake Follow-Up" text="Confirm consultations, reduce no-shows, and keep qualified prospects moving." />
          </div>
        </Card>

        <Card className="p-7 md:p-10 text-center border-indigo-500/30 bg-background/75 shadow-xl shadow-indigo-500/10">
          <div className="mx-auto h-16 w-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/25 mb-5">
            <Scale className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-2xl md:text-3xl font-black">Law Firm AI Intake Beta</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto mt-3">
            Start with nights, weekends, overflow, or missed calls. Prove the intake experience. Then expand into speed-to-lead, reactivation, reminders, SMS, and the rest of the revenue engine.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-3 mt-7">
            <Button size="lg" className="gap-2 bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-500">
              <Sparkles className="h-4 w-4" />
              Apply for the Law Firm Beta
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button size="lg" variant="outline" onClick={onStartOver} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Run Another Demo
            </Button>
          </div>
          <div className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground mt-4">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            Revenue examples above are sensitivity scenarios based on the firm's own estimates.
          </div>
        </Card>
      </div>
    </div>
  );
};

const SummaryCard = ({
  label,
  value,
  icon: Icon,
  highlight = false,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  highlight?: boolean;
}) => (
  <Card className={`p-5 text-center ${highlight ? 'border-emerald-500/25 bg-emerald-500/5' : 'border-indigo-500/15 bg-background/70'}`}>
    <Icon className={`h-5 w-5 mx-auto mb-2 ${highlight ? 'text-emerald-400' : 'text-indigo-400'}`} />
    <div className={`text-2xl md:text-3xl font-black ${highlight ? 'text-emerald-400' : ''}`}>{value}</div>
    <div className="text-[11px] text-muted-foreground leading-tight mt-1">{label}</div>
  </Card>
);

const MetricRow = ({ label, value, emphasize = false }: { label: string; value: string; emphasize?: boolean }) => (
  <div className="flex items-start justify-between gap-3 border-b border-border/30 pb-2 last:border-0">
    <span className="text-muted-foreground">{label}</span>
    <span className={`font-bold text-right ${emphasize ? 'text-emerald-400' : 'text-foreground'}`}>{value}</span>
  </div>
);

const EcosystemCard = ({
  icon: Icon,
  title,
  text,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  text: string;
}) => (
  <div className="rounded-xl border border-indigo-500/20 bg-background/60 p-4">
    <div className="h-10 w-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-3">
      <Icon className="h-5 w-5 text-indigo-400" />
    </div>
    <h3 className="font-bold">{title}</h3>
    <p className="text-xs text-muted-foreground leading-relaxed mt-1">{text}</p>
  </div>
);
