import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  Clock3,
  PhoneIncoming,
  Scale,
  ShieldCheck,
  Sparkles,
  UserRound,
} from 'lucide-react';
import type { LegalInboundConfig } from './DemoLegalInboundSetup';

export interface LegalInboundResults {
  monthlyCalls: number;
  baselineMissedCalls: number;
  newProspectCalls: number;
  existingClientCalls: number;
  urgentCalls: number;
  otherCalls: number;
}

interface DemoLegalInboundSimulationProps {
  businessName?: string;
  config: LegalInboundConfig;
  onComplete: (results: LegalInboundResults) => void;
}

type FeedType = 'new' | 'existing' | 'urgent' | 'other';

interface FeedItem {
  id: string;
  label: string;
  detail: string;
  type: FeedType;
}

const sampleMatters = [
  'New potential client — website inquiry follow-up',
  'New potential client — wants to know if the firm handles their matter',
  'New potential client — incident happened today',
  'New potential client — needs a consultation',
  'New potential client — calling after work hours',
];

const existingClientNeeds = [
  'Existing client — requesting a callback',
  'Existing client — has a case-status question',
  'Existing client — needs to pass along new information',
];

export const DemoLegalInboundSimulation = ({
  businessName,
  config,
  onComplete,
}: DemoLegalInboundSimulationProps) => {
  const weeklyCalls = config.weeknightCalls * 5 + config.weekendCallsPerDay * 2;
  const monthlyCalls = Math.round(weeklyCalls * 4.33);
  const baselineMissedCalls = Math.round(monthlyCalls * (config.missedCallPercent / 100));
  const targetCalls = Math.max(monthlyCalls, 1);

  const [callsProcessed, setCallsProcessed] = useState(0);
  const [newProspectCalls, setNewProspectCalls] = useState(0);
  const [existingClientCalls, setExistingClientCalls] = useState(0);
  const [urgentCalls, setUrgentCalls] = useState(0);
  const [otherCalls, setOtherCalls] = useState(0);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [complete, setComplete] = useState(monthlyCalls === 0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const simulationSeconds = 18;
  const tickMs = 120;
  const callsPerTick = targetCalls / ((simulationSeconds * 1000) / tickMs);

  useEffect(() => {
    if (monthlyCalls === 0) return;

    intervalRef.current = setInterval(() => {
      setCallsProcessed((previous) => {
        const next = Math.min(targetCalls, previous + callsPerTick);
        const wholeBefore = Math.floor(previous);
        const wholeAfter = Math.floor(next);
        const newCallsThisTick = Math.max(0, wholeAfter - wholeBefore);

        for (let i = 0; i < newCallsThisTick; i += 1) {
          const roll = Math.random();
          let item: FeedItem;

          if (roll < 0.08) {
            setUrgentCalls((value) => value + 1);
            item = {
              id: `urgent-${Date.now()}-${Math.random()}`,
              label: 'Urgent matter flagged',
              detail: 'Deadline / same-day urgency detected and marked for priority follow-up',
              type: 'urgent',
            };
          } else if (roll < 0.66) {
            setNewProspectCalls((value) => value + 1);
            item = {
              id: `new-${Date.now()}-${Math.random()}`,
              label: 'New-client intake',
              detail: sampleMatters[Math.floor(Math.random() * sampleMatters.length)],
              type: 'new',
            };
          } else if (roll < 0.91) {
            setExistingClientCalls((value) => value + 1);
            item = {
              id: `existing-${Date.now()}-${Math.random()}`,
              label: 'Existing client routed',
              detail: existingClientNeeds[Math.floor(Math.random() * existingClientNeeds.length)],
              type: 'existing',
            };
          } else {
            setOtherCalls((value) => value + 1);
            item = {
              id: `other-${Date.now()}-${Math.random()}`,
              label: 'Other caller handled',
              detail: 'Vendor, wrong department, or non-client call triaged without tying up staff',
              type: 'other',
            };
          }

          setFeed((items) => [item, ...items].slice(0, 8));
        }

        if (next >= targetCalls) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          setComplete(true);
        }

        return next;
      });
    }, tickMs);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [callsPerTick, monthlyCalls, targetCalls]);

  const progress = monthlyCalls === 0 ? 100 : Math.min(100, (callsProcessed / targetCalls) * 100);

  const results = useMemo<LegalInboundResults>(() => ({
    monthlyCalls,
    baselineMissedCalls,
    newProspectCalls,
    existingClientCalls,
    urgentCalls,
    otherCalls,
  }), [monthlyCalls, baselineMissedCalls, newProspectCalls, existingClientCalls, urgentCalls, otherCalls]);

  const iconFor = (type: FeedType) => {
    if (type === 'urgent') return AlertTriangle;
    if (type === 'existing') return UserRound;
    if (type === 'other') return ShieldCheck;
    return BriefcaseBusiness;
  };

  return (
    <div className="min-h-screen p-4 md:p-8 bg-gradient-to-br from-background via-background to-indigo-500/5">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/25 text-xs font-bold text-indigo-300">
            <Clock3 className="h-3.5 w-3.5" />
            30-DAY INBOUND TIME-LAPSE
          </div>
          <h1 className="text-3xl md:text-4xl font-bold">
            Watch the calls come in to {businessName || 'your firm'}.
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            This is an illustrative workload simulation based on the after-hours volume you entered — not a claim about your exact caller mix or results.
          </p>
        </div>

        <Card className="p-5 md:p-6 border-indigo-500/25 bg-background/70 backdrop-blur-sm">
          <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-8">
            <div className="flex items-center gap-3 flex-1">
              <div className="relative h-14 w-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
                <PhoneIncoming className="h-7 w-7 text-white" />
                {!complete && <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-emerald-400 animate-ping" />}
              </div>
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider">Incoming calls processed</div>
                <div className="text-3xl font-black">{Math.min(Math.round(callsProcessed), monthlyCalls).toLocaleString()} <span className="text-base font-medium text-muted-foreground">/ {monthlyCalls.toLocaleString()}</span></div>
              </div>
            </div>
            <div className="md:w-1/2 space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{complete ? 'Month complete' : 'Time-lapse running...'}</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-3" />
            </div>
          </div>
        </Card>

        <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
          <StatCard label="After-hours calls" value={monthlyCalls} icon={PhoneIncoming} />
          <StatCard label="New-client intakes" value={newProspectCalls} icon={BriefcaseBusiness} />
          <StatCard label="Existing clients routed" value={existingClientCalls} icon={UserRound} />
          <StatCard label="Urgent matters flagged" value={urgentCalls} icon={AlertTriangle} />
          <StatCard label="Your current missed-call baseline" value={baselineMissedCalls} icon={Scale} emphasis />
        </div>

        <div className="grid lg:grid-cols-[1.35fr_.65fr] gap-5">
          <Card className="p-5 md:p-6 border-border/50 bg-background/70">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-bold text-lg">Live intake feed</h2>
                <p className="text-xs text-muted-foreground">A visual example of how calls can be triaged instead of disappearing into voicemail.</p>
              </div>
              <Sparkles className="h-5 w-5 text-indigo-400" />
            </div>
            <div className="space-y-2 min-h-[300px]">
              {feed.length === 0 ? (
                <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">
                  {monthlyCalls === 0 ? 'Increase the call-volume estimates to run the time-lapse.' : 'Inbound calls are starting...'}
                </div>
              ) : (
                feed.map((item) => {
                  const Icon = iconFor(item.type);
                  return (
                    <div key={item.id} className="flex gap-3 p-3 rounded-xl border border-border/40 bg-muted/20 animate-in fade-in slide-in-from-top-2">
                      <div className="p-2 h-fit rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                        <Icon className="h-4 w-4 text-indigo-300" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold">{item.label}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{item.detail}</div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>

          <Card className="p-5 md:p-6 border-rose-500/20 bg-gradient-to-b from-rose-500/5 to-background">
            <div className="text-center space-y-4">
              <div className="mx-auto h-14 w-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
                <Scale className="h-7 w-7 text-rose-400" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Based on your current estimate</p>
                <div className="text-5xl font-black text-rose-400 mt-2">{baselineMissedCalls}</div>
                <p className="font-semibold">after-hours calls/month may currently be missed or sent to voicemail.</p>
              </div>
              <div className="text-sm text-muted-foreground leading-relaxed">
                The next screen does not pretend every missed call becomes a case. It shows exactly what different recovery scenarios could be worth using the conversion rate and client value you entered.
              </div>
            </div>
          </Card>
        </div>

        <div className="relative group pb-8">
          <div className="absolute -inset-[2px] rounded-2xl bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-400 opacity-70 blur-sm" />
          <Button
            size="lg"
            disabled={!complete}
            onClick={() => onComplete(results)}
            className="relative w-full h-14 text-lg gap-2 bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-500 rounded-xl font-bold"
          >
            {complete ? <CheckCircle2 className="h-5 w-5" /> : <Clock3 className="h-5 w-5 animate-pulse" />}
            {complete ? 'Show Me What Those Missed Calls Could Be Worth' : 'Running 30-Day Time-Lapse...'}
            {complete && <ArrowRight className="h-5 w-5" />}
          </Button>
        </div>
      </div>
    </div>
  );
};

const StatCard = ({
  label,
  value,
  icon: Icon,
  emphasis = false,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  emphasis?: boolean;
}) => (
  <Card className={`p-4 text-center ${emphasis ? 'border-rose-500/25 bg-rose-500/5' : 'border-indigo-500/15 bg-background/60'}`}>
    <Icon className={`h-5 w-5 mx-auto mb-2 ${emphasis ? 'text-rose-400' : 'text-indigo-400'}`} />
    <div className="text-2xl font-black">{Math.round(value).toLocaleString()}</div>
    <div className="text-[11px] text-muted-foreground leading-tight mt-1">{label}</div>
  </Card>
);
