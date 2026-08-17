import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import {
  ArrowLeft,
  ArrowRight,
  Ban,
  CalendarCheck,
  CheckCircle2,
  Clock3,
  DollarSign,
  MessageSquare,
  PhoneCall,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Users,
} from 'lucide-react';
import { trackDemoFunnelEvent } from '@/lib/demoFunnelAnalytics';

interface DemoLeadRecoveryProps {
  businessName?: string;
  sessionId: string | null;
  averageClientValue: number;
  onBack: () => void;
  onContinue: () => void;
}

const money = (value: number) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0,
}).format(value);

export const DemoLeadRecovery = ({
  businessName,
  sessionId,
  averageClientValue,
  onBack,
  onContinue,
}: DemoLeadRecoveryProps) => {
  const [databaseSize, setDatabaseSize] = useState(2500);
  const [eligiblePercent, setEligiblePercent] = useState(60);
  const [reengagePercent, setReengagePercent] = useState(12);
  const [appointmentPercent, setAppointmentPercent] = useState(30);
  const [signPercent, setSignPercent] = useState(20);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processed, setProcessed] = useState(0);
  const [reengaged, setReengaged] = useState(0);
  const [callbacks, setCallbacks] = useState(0);
  const [dnc, setDnc] = useState(0);
  const [appointments, setAppointments] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const firm = businessName || 'your firm';
  const eligibleLeads = Math.round(databaseSize * eligiblePercent / 100);
  const projectedReengaged = Math.round(eligibleLeads * reengagePercent / 100);
  const projectedAppointments = Math.round(projectedReengaged * appointmentPercent / 100);
  const projectedClients = projectedAppointments * signPercent / 100;
  const projectedRevenue = projectedClients * averageClientValue;

  useEffect(() => {
    void trackDemoFunnelEvent({
      eventName: 'interest_selected',
      sessionId,
      metadata: { interest: 'lead_recovery', step: 'lead_recovery_demo' },
    });
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [sessionId]);

  const runDemo = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setRunning(true);
    setProgress(0);
    setProcessed(0);
    setReengaged(0);
    setCallbacks(0);
    setDnc(0);
    setAppointments(0);

    let tick = 0;
    const totalTicks = 80;
    timerRef.current = setInterval(() => {
      tick += 1;
      const ratio = Math.min(1, tick / totalTicks);
      setProgress(ratio * 100);
      setProcessed(Math.round(eligibleLeads * ratio));
      setReengaged(Math.round(projectedReengaged * ratio));
      setCallbacks(Math.round(projectedReengaged * 0.32 * ratio));
      setDnc(Math.round(eligibleLeads * 0.018 * ratio));
      setAppointments(Math.round(projectedAppointments * ratio));

      if (tick >= totalTicks) {
        if (timerRef.current) clearInterval(timerRef.current);
        setRunning(false);
        void trackDemoFunnelEvent({
          eventName: 'legal_simulation_completed',
          sessionId,
          metadata: {
            step: 'lead_recovery_demo',
            monthlyCalls: eligibleLeads,
            missedProspects: projectedAppointments,
          },
        });
      }
    }, 80);
  };

  const feed = useMemo(() => [
    { icon: PhoneCall, label: 'Call attempt', text: 'Old web inquiry — AI reconnect attempt', tone: 'text-indigo-400' },
    { icon: MessageSquare, label: 'SMS reply', text: '“Yes, I still need help. Can someone call me after 3?”', tone: 'text-cyan-400' },
    { icon: Clock3, label: 'Callback scheduled', text: 'Prospect asked for Friday afternoon', tone: 'text-amber-400' },
    { icon: UserCheck, label: 'Human handoff', text: 'Qualified prospect wants to discuss the matter', tone: 'text-emerald-400' },
    { icon: Ban, label: 'Stop rule', text: 'Opt-out detected — future outreach suppressed', tone: 'text-rose-400' },
  ], []);

  return (
    <div className="min-h-screen p-4 md:p-8 bg-gradient-to-br from-background via-background to-violet-500/5">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full border border-border/50">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/25 text-xs font-black tracking-[0.14em] text-violet-300">
              <RefreshCw className="h-3.5 w-3.5" /> LEAD RECOVERY ENGINE
            </div>
            <h1 className="text-3xl md:text-5xl font-black mt-3">Your cheapest next client may already be in your database.</h1>
            <p className="text-muted-foreground mt-3 max-w-3xl leading-relaxed">
              Model what systematic, permission-aware follow-up could look like for leads {firm} already paid to acquire. This is a workload and sensitivity demo — not a promise of results.
            </p>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-5">
          <Card className="p-6 space-y-6 border-violet-500/20 bg-background/75">
            <h2 className="text-xl font-bold">Give us the rough shape of the old database</h2>
            <RecoverySlider label="Old inquiries / no-shows / unsigned prospects" value={databaseSize} valueLabel={databaseSize.toLocaleString()} min={250} max={20000} step={250} onChange={setDatabaseSize} />
            <RecoverySlider label="Eligible for this approved recovery campaign" value={eligiblePercent} valueLabel={`${eligiblePercent}%`} min={10} max={100} step={5} onChange={setEligiblePercent} />
            <RecoverySlider label="Illustrative re-engagement rate" value={reengagePercent} valueLabel={`${reengagePercent}%`} min={3} max={30} step={1} onChange={setReengagePercent} />
            <RecoverySlider label="Re-engaged prospects who book" value={appointmentPercent} valueLabel={`${appointmentPercent}%`} min={10} max={60} step={5} onChange={setAppointmentPercent} />
            <RecoverySlider label="Booked consultations that sign" value={signPercent} valueLabel={`${signPercent}%`} min={5} max={50} step={5} onChange={setSignPercent} />
          </Card>

          <Card className="p-6 border-indigo-500/20 bg-gradient-to-br from-indigo-500/5 via-background to-violet-500/5">
            <div className="flex items-center gap-3 mb-5">
              <ShieldCheck className="h-6 w-6 text-emerald-400" />
              <div>
                <h2 className="text-xl font-bold">Start with eligibility, not blasting.</h2>
                <p className="text-xs text-muted-foreground">Historical presence in a CRM is not automatically permission to contact.</p>
              </div>
            </div>
            <div className="space-y-3">
              {[
                'Use only an approved first-party source and campaign purpose',
                'Apply consent / suppression / DNC rules before contact',
                'Stop immediately on opt-out or disqualifying response',
                'Escalate qualified or sensitive conversations to a human',
                'Preserve dispositions so the same lead is not mindlessly recycled',
              ].map((text) => (
                <div key={text} className="flex gap-3 p-3 rounded-xl bg-muted/20 border border-border/40">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                  <span className="text-sm">{text}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <Card className="p-6 md:p-8 border-violet-500/25 bg-background/75">
          <div className="flex flex-col md:flex-row md:items-center gap-5 justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Eligible recovery pool</div>
              <div className="text-4xl font-black mt-1">{eligibleLeads.toLocaleString()} <span className="text-base text-muted-foreground font-medium">of {databaseSize.toLocaleString()} leads</span></div>
            </div>
            <Button size="lg" onClick={runDemo} disabled={running} className="gap-2 bg-gradient-to-r from-violet-600 to-indigo-600">
              <Sparkles className="h-4 w-4" /> {running ? 'Recovery Campaign Running…' : 'Run 30-Day Recovery Simulation'}
            </Button>
          </div>
          <div className="mt-5 space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground"><span>{running ? 'AI team working the approved pool…' : progress >= 100 ? 'Simulation complete' : 'Ready to simulate'}</span><span>{Math.round(progress)}%</span></div>
            <Progress value={progress} className="h-3" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-6">
            <RecoveryStat icon={Users} label="Processed" value={processed} />
            <RecoveryStat icon={RefreshCw} label="Re-engaged" value={reengaged} />
            <RecoveryStat icon={Clock3} label="Callbacks" value={callbacks} />
            <RecoveryStat icon={Ban} label="Suppressed / DNC" value={dnc} />
            <RecoveryStat icon={CalendarCheck} label="Appointments" value={appointments} highlight />
          </div>
        </Card>

        <div className="grid lg:grid-cols-[1.25fr_.75fr] gap-5">
          <Card className="p-6 border-border/50 bg-background/75">
            <h2 className="font-bold text-lg">What the AI team is actually doing</h2>
            <p className="text-sm text-muted-foreground mt-1 mb-4">Calls, replies, callbacks, handoffs, and stop conditions — not just dialing the same list forever.</p>
            <div className="space-y-2">
              {feed.map(({ icon: Icon, label, text, tone }) => (
                <div key={label} className="flex gap-3 p-3 rounded-xl border border-border/40 bg-muted/20">
                  <Icon className={`h-5 w-5 mt-0.5 ${tone}`} />
                  <div><div className="font-semibold text-sm">{label}</div><div className="text-xs text-muted-foreground">{text}</div></div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6 border-emerald-500/20 bg-emerald-500/5">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Illustrative opportunity</div>
            <div className="mt-5 space-y-4">
              <Projection label="Re-engaged leads" value={projectedReengaged.toLocaleString()} />
              <Projection label="Potential consultations" value={projectedAppointments.toLocaleString()} />
              <Projection label="Potential signed clients" value={projectedClients.toFixed(1)} />
              <div className="pt-4 border-t border-emerald-500/20">
                <div className="text-xs text-muted-foreground">Potential revenue represented by this sensitivity model</div>
                <div className="text-4xl font-black text-emerald-400 mt-1">{money(projectedRevenue)}</div>
                <div className="text-[10px] text-muted-foreground mt-2">Based only on the assumptions shown above. Not a performance guarantee.</div>
              </div>
            </div>
          </Card>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pb-10">
          <Button size="lg" variant="outline" onClick={onBack} className="flex-1 gap-2"><ArrowLeft className="h-4 w-4" /> Back to the Bigger Picture</Button>
          <Button size="lg" onClick={onContinue} className="flex-1 gap-2 bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500">I Want to Recover My Old Leads <ArrowRight className="h-4 w-4" /></Button>
        </div>
      </div>
    </div>
  );
};

const RecoverySlider = ({ label, value, valueLabel, min, max, step, onChange }: { label: string; value: number; valueLabel: string; min: number; max: number; step: number; onChange: (value: number) => void }) => (
  <div className="space-y-3">
    <div className="flex items-center justify-between gap-3"><Label className="text-sm">{label}</Label><span className="text-xl font-black text-violet-300">{valueLabel}</span></div>
    <Slider value={[value]} min={min} max={max} step={step} onValueChange={([next]) => onChange(next)} />
  </div>
);

const RecoveryStat = ({ icon: Icon, label, value, highlight = false }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; highlight?: boolean }) => (
  <div className={`rounded-xl border p-4 text-center ${highlight ? 'border-emerald-500/25 bg-emerald-500/5' : 'border-border/40 bg-muted/15'}`}>
    <Icon className={`h-4 w-4 mx-auto ${highlight ? 'text-emerald-400' : 'text-violet-300'}`} />
    <div className="text-2xl font-black mt-2">{Math.round(value).toLocaleString()}</div>
    <div className="text-[10px] text-muted-foreground">{label}</div>
  </div>
);

const Projection = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-center justify-between gap-3"><span className="text-sm text-muted-foreground">{label}</span><span className="font-bold">{value}</span></div>
);
