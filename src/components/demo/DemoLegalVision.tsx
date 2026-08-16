import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarCheck,
  CheckCircle2,
  Film,
  Loader2,
  MessageSquare,
  PhoneIncoming,
  Play,
  RefreshCw,
  RotateCcw,
  Scale,
  Sparkles,
  Target,
  UserCheck,
  Zap,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { LegalInboundConfig } from './DemoLegalInboundSetup';

interface DemoLegalVisionProps {
  businessName?: string;
  websiteUrl: string;
  sessionId: string | null;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  legalInboundConfig: LegalInboundConfig;
  retellCallId: string | null;
  onStartOver: () => void;
}

type Interest = 'start_beta' | 'talk' | 'lead_recovery';

const interestCopy: Record<Interest, { title: string; description: string; button: string }> = {
  start_beta: {
    title: 'Start My Law Firm Beta',
    description: 'Start narrow with after-hours, weekend, overflow, or missed-call intake. We use the demo context you already created instead of making you start over.',
    button: 'Submit My Beta Request',
  },
  talk: {
    title: 'Talk Through My Setup',
    description: 'Use a short fit conversation to confirm routing, intake questions, integrations, and what should happen when the AI needs a human.',
    button: 'Request a Setup Conversation',
  },
  lead_recovery: {
    title: 'Show Me Lead Recovery',
    description: 'See how Call Boss can systematically work old inquiries, no-shows, unsigned consultations, and prospects who stopped responding.',
    button: 'Request My Lead Recovery Demo',
  },
};

export const DemoLegalVision = ({
  businessName,
  websiteUrl,
  sessionId,
  contactName,
  contactEmail,
  contactPhone,
  legalInboundConfig,
  retellCallId,
  onStartOver,
}: DemoLegalVisionProps) => {
  const [videoAvailable, setVideoAvailable] = useState(true);
  const [selectedInterest, setSelectedInterest] = useState<Interest>('start_beta');
  const [name, setName] = useState(contactName);
  const [email, setEmail] = useState(contactEmail);
  const [phone, setPhone] = useState(contactPhone);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [leadId, setLeadId] = useState<string | null>(null);

  const firm = businessName || 'your firm';
  const selectedCopy = interestCopy[selectedInterest];

  const monthlyCalls = useMemo(() => {
    const weekly = legalInboundConfig.weeknightCalls * 5 + legalInboundConfig.weekendCallsPerDay * 2;
    return Math.round(weekly * 4.33);
  }, [legalInboundConfig.weeknightCalls, legalInboundConfig.weekendCallsPerDay]);

  const chooseInterest = (interest: Interest) => {
    setSelectedInterest(interest);
    setError(null);
    setSuccessMessage(null);
    requestAnimationFrame(() => {
      document.getElementById('law-firm-beta-close')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const submitInterest = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!email.trim() && !phone.trim()) {
      setError('Please give us an email address or phone number so we know how to follow up.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('law-firm-beta-submit', {
        body: {
          sessionId,
          websiteUrl,
          firmName: businessName || '',
          contactName: name,
          email,
          phone,
          interest: selectedInterest,
          legalInboundConfig,
          retellCallId,
          source: 'law_firm_demo',
        },
      });

      if (fnError) throw fnError;
      if (!data?.success) throw new Error(data?.error || 'Unable to save your request.');

      setLeadId(data.leadId || null);
      setSuccessMessage(data.message || 'Your request is in.');
    } catch (submitError: any) {
      setError(submitError?.message || 'Unable to save your request right now. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-8 bg-gradient-to-br from-background via-background to-indigo-500/5">
      <div className="max-w-6xl mx-auto space-y-10">
        <section className="text-center space-y-4 pt-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/25 text-xs font-black tracking-[0.14em] text-indigo-300">
            <Sparkles className="h-3.5 w-3.5" />
            THE BIGGER PICTURE
          </div>
          <h1 className="text-4xl md:text-6xl font-black leading-tight">
            That was only <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">one leak.</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            You just saw one place where {firm} can protect opportunities: the moment someone calls when the team cannot answer. But every prospective client has an entire lifecycle — and every handoff is another place value can disappear.
          </p>
        </section>

        <Card className="p-4 md:p-6 border-indigo-500/25 bg-background/70 overflow-hidden">
          {videoAvailable ? (
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-video">
              <video
                src="/videos/law-firm-beta-vsl.mp4"
                className="w-full h-full object-cover"
                controls
                muted
                playsInline
                preload="metadata"
                onError={() => setVideoAvailable(false)}
              />
              <div className="absolute top-4 left-4 pointer-events-none inline-flex items-center gap-2 px-3 py-1 rounded-full bg-black/60 backdrop-blur text-xs text-white/80">
                <Play className="h-3.5 w-3.5" />
                60–90 second overview
              </div>
            </div>
          ) : (
            <div className="aspect-video rounded-2xl bg-gradient-to-br from-indigo-500/10 via-background to-cyan-500/10 border border-indigo-500/20 flex items-center justify-center p-8 text-center">
              <div className="max-w-2xl">
                <div className="h-16 w-16 mx-auto rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center mb-5 shadow-lg shadow-indigo-500/20">
                  <Film className="h-8 w-8 text-white" />
                </div>
                <h2 className="text-2xl md:text-3xl font-black">One business brain. Multiple revenue workflows.</h2>
                <p className="text-muted-foreground mt-3 leading-relaxed">
                  The live VSL will sit here. Until the finished avatar asset is added, the full lifecycle below carries the same story without blocking the funnel.
                </p>
              </div>
            </div>
          )}
        </Card>

        <section className="space-y-6">
          <div className="text-center">
            <h2 className="text-2xl md:text-4xl font-black">A lead should not have one chance to become profitable.</h2>
            <p className="text-muted-foreground mt-2 max-w-3xl mx-auto">
              Call Boss can keep context moving across the moments where a prospect normally falls out of the process.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <LifecycleStep icon={PhoneIncoming} title="Inbound" />
            <LifecycleStep icon={Zap} title="Speed to Lead" />
            <LifecycleStep icon={UserCheck} title="Intake" />
            <LifecycleStep icon={CalendarCheck} title="Appointment" />
            <LifecycleStep icon={MessageSquare} title="Follow-Up" />
            <LifecycleStep icon={RefreshCw} title="Recovery" />
            <LifecycleStep icon={Target} title="Reactivation" />
          </div>
        </section>

        <Card className="p-6 md:p-9 border-violet-500/30 bg-gradient-to-br from-violet-500/10 via-background to-indigo-500/5">
          <div className="grid lg:grid-cols-[1.1fr_.9fr] gap-8 items-center">
            <div>
              <div className="inline-flex items-center gap-2 text-xs font-black tracking-[0.16em] text-violet-300">
                <RefreshCw className="h-4 w-4" />
                LEAD RECOVERY ENGINE
              </div>
              <h2 className="text-3xl md:text-4xl font-black mt-3">Before you buy another lead, work the ones you already paid for.</h2>
              <p className="text-muted-foreground mt-4 leading-relaxed">
                Old inquiries, no-shows, unsigned consultations, “call me later” prospects, and people who stopped responding already consumed acquisition dollars. The question is whether human follow-up ended before the opportunity did.
              </p>
              <p className="text-muted-foreground mt-3 leading-relaxed">
                A human team can call, text, email, handle replies, schedule callbacks, and keep trying for weeks. Call Boss makes that persistence far easier to run systematically — while keeping the high-value human conversations for your team.
              </p>
            </div>
            <div className="grid gap-3">
              {[
                'Old web inquiries',
                'No-shows',
                'Unsigned consultations',
                'Prospects who stopped responding',
                'Later-callback requests',
                'Old first-party marketing databases',
              ].map((item) => (
                <div key={item} className="flex items-center gap-3 p-3 rounded-xl border border-violet-500/20 bg-background/60">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                  <span className="text-sm">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <section className="grid md:grid-cols-3 gap-4">
          <ChoiceCard
            icon={Scale}
            title="Start My Beta"
            text={`Start with a narrow intake problem at ${firm}. You estimated about ${monthlyCalls.toLocaleString()} after-hours calls per month.`}
            cta="Put This on My Firm"
            primary
            onClick={() => chooseInterest('start_beta')}
          />
          <ChoiceCard
            icon={BriefcaseBusiness}
            title="Talk to Someone First"
            text="Confirm intake rules, routing, transfer logic, integrations, and what your team wants the AI to handle."
            cta="Talk Through My Setup"
            onClick={() => chooseInterest('talk')}
          />
          <ChoiceCard
            icon={RefreshCw}
            title="Show Me Lead Recovery"
            text="Go deeper on the leads you already paid for: stale inquiries, no-shows, unsigned consults, and old databases."
            cta="Show Me Recovery"
            onClick={() => chooseInterest('lead_recovery')}
          />
        </section>

        <section id="law-firm-beta-close" className="scroll-mt-6 pb-10">
          <Card className="p-6 md:p-9 border-indigo-500/30 bg-background/80 shadow-xl shadow-indigo-500/10">
            {successMessage ? (
              <div className="text-center py-6">
                <div className="h-16 w-16 mx-auto rounded-full bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center mb-4">
                  <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                </div>
                <h2 className="text-2xl md:text-3xl font-black">{successMessage}</h2>
                <p className="text-muted-foreground mt-3 max-w-xl mx-auto">
                  We preserved your firm and demo context. The next conversation can start from what you already showed us instead of asking you to rebuild the story.
                </p>
                {leadId && <p className="text-[10px] text-muted-foreground mt-3">Request reference: {leadId}</p>}
                <Button variant="outline" onClick={onStartOver} className="mt-6 gap-2">
                  <RotateCcw className="h-4 w-4" />
                  Run Another Demo
                </Button>
              </div>
            ) : (
              <form onSubmit={submitInterest} className="space-y-6">
                <div className="text-center">
                  <div className="text-xs font-black tracking-[0.14em] text-indigo-300">YOUR NEXT STEP</div>
                  <h2 className="text-2xl md:text-3xl font-black mt-2">{selectedCopy.title}</h2>
                  <p className="text-muted-foreground mt-2 max-w-2xl mx-auto">{selectedCopy.description}</p>
                </div>

                <div className="grid md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="beta-name">Your name</Label>
                    <Input id="beta-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" className="h-12" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="beta-email">Email</Label>
                    <Input id="beta-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@firm.com" className="h-12" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="beta-phone">Phone</Label>
                    <Input id="beta-phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="(555) 555-5555" className="h-12" />
                  </div>
                </div>

                <div className="rounded-xl border border-border/50 bg-muted/20 p-4 text-sm">
                  <div className="font-semibold">Already carried forward:</div>
                  <div className="text-muted-foreground mt-1">
                    {firm} · {websiteUrl || 'website from demo'} · your inbound opportunity assumptions · demo session context
                  </div>
                </div>

                {error && <div className="p-3 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-sm">{error}</div>}

                <div className="relative group">
                  <div className="absolute -inset-[2px] rounded-2xl bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-400 opacity-70 blur-sm" />
                  <Button
                    type="submit"
                    size="lg"
                    disabled={isSubmitting}
                    className="relative w-full h-14 text-lg font-bold gap-2 rounded-xl bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-500"
                  >
                    {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
                    {isSubmitting ? 'Saving your request...' : selectedCopy.button}
                    {!isSubmitting && <ArrowRight className="h-5 w-5" />}
                  </Button>
                </div>

                <p className="text-[11px] text-center text-muted-foreground">
                  No legal representation is created by this demo or request. Final intake rules, disclosures, routing, and data handling are configured with each firm before launch.
                </p>
              </form>
            )}
          </Card>
        </section>
      </div>
    </div>
  );
};

const LifecycleStep = ({ icon: Icon, title }: { icon: React.ComponentType<{ className?: string }>; title: string }) => (
  <div className="relative rounded-xl border border-indigo-500/20 bg-background/60 p-3 text-center min-h-[105px] flex flex-col items-center justify-center">
    <div className="h-9 w-9 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-2">
      <Icon className="h-4 w-4 text-indigo-400" />
    </div>
    <div className="text-xs font-bold">{title}</div>
  </div>
);

const ChoiceCard = ({
  icon: Icon,
  title,
  text,
  cta,
  primary = false,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  text: string;
  cta: string;
  primary?: boolean;
  onClick: () => void;
}) => (
  <Card className={`p-6 flex flex-col ${primary ? 'border-indigo-500/50 bg-indigo-500/5 shadow-lg shadow-indigo-500/10' : 'border-border/50 bg-background/70'}`}>
    <div className={`h-11 w-11 rounded-xl flex items-center justify-center ${primary ? 'bg-gradient-to-br from-indigo-500 to-violet-600' : 'bg-muted/40 border border-border/50'}`}>
      <Icon className={`h-5 w-5 ${primary ? 'text-white' : 'text-indigo-400'}`} />
    </div>
    <h3 className="text-xl font-black mt-4">{title}</h3>
    <p className="text-sm text-muted-foreground mt-2 leading-relaxed flex-1">{text}</p>
    <Button variant={primary ? 'default' : 'outline'} onClick={onClick} className={`mt-5 gap-2 ${primary ? 'bg-gradient-to-r from-indigo-600 to-violet-600' : ''}`}>
      {cta}
      <ArrowRight className="h-4 w-4" />
    </Button>
  </Card>
);
