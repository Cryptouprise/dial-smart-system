import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  Clock3,
  DollarSign,
  Film,
  Globe,
  MessageSquare,
  Moon,
  PhoneIncoming,
  RefreshCw,
  Scale,
  Sparkles,
  Target,
  Zap,
} from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import { trackDemoFunnelEvent } from '@/lib/demoFunnelAnalytics';

const LegalBeta = () => {
  const [url, setUrl] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    void trackDemoFunnelEvent({ eventName: 'law_firm_landing_view' });
  }, []);

  const startDemo = (event: React.FormEvent) => {
    event.preventDefault();
    const website = url.trim();
    if (!website) return;

    void trackDemoFunnelEvent({
      eventName: 'website_submitted',
      metadata: { entry: 'law_firm_landing' },
    });

    navigate(`/demo?mode=legal&url=${encodeURIComponent(website)}`);
  };

  return (
    <div className="min-h-screen bg-background text-foreground overflow-hidden">
      <Helmet>
        <title>Law Firm AI Intake Beta — Call Boss</title>
        <meta
          name="description"
          content="See a firm-specific AI after-hours receptionist and intake specialist built from your law firm's website, then model what missed new-client calls may be worth."
        />
      </Helmet>

      <div className="fixed inset-0 hero-gradient pointer-events-none" />
      <div className="fixed inset-0 grid-bg pointer-events-none opacity-40" />

      <nav className="relative z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl sticky top-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
              <Scale className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="font-bold leading-none">Call Boss</div>
              <div className="text-[10px] text-muted-foreground tracking-wider">LAW FIRM BETA</div>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Button variant="ghost" size="sm" asChild>
              <Link to="/">Main Site</Link>
            </Button>
          </div>
        </div>
      </nav>

      <main className="relative">
        <section className="pt-16 md:pt-24 pb-14">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-xs md:text-sm text-indigo-300 font-bold mb-7">
              <Sparkles className="h-4 w-4" />
              NEW — LAW FIRM AI INTAKE BETA
            </div>
            <h1 className="text-4xl sm:text-5xl md:text-7xl font-black tracking-tight leading-[1.05] max-w-5xl mx-auto">
              Your best new case shouldn't die in voicemail at{' '}
              <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">9:14 PM.</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto mt-6 leading-relaxed">
              Call Boss can become your after-hours receptionist and intake specialist — answering as your firm, using your website knowledge, collecting new-client details, flagging urgency, and preparing the call for your team.
            </p>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-10 text-left">
              <Benefit icon={Moon} title="Nights + Weekends" text="Give prospective clients a real answer when the office is closed." />
              <Benefit icon={BriefcaseBusiness} title="New-Client Intake" text="Collect the matter, contact details, location, dates, and follow-up needs conversationally." />
              <Benefit icon={AlertTriangle} title="Urgency Detection" text="Flag time-sensitive or high-priority matters for prompt human review." />
              <Benefit icon={Scale} title="Firm-Specific Context" text="Use your website-derived practice areas, team, locations, and firm information." />
            </div>
          </div>
        </section>

        <section className="pb-20">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="relative">
              <div className="absolute -inset-[2px] rounded-3xl bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-400 opacity-75 blur-sm" />
              <Card className="relative p-6 md:p-8 rounded-3xl bg-background/95 border-0">
                <div className="text-center mb-6">
                  <div className="mx-auto h-14 w-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center mb-4 shadow-lg shadow-indigo-500/25">
                    <Globe className="h-7 w-7 text-white" />
                  </div>
                  <h2 className="text-2xl md:text-3xl font-black">Build the demo around your firm.</h2>
                  <p className="text-muted-foreground mt-2">
                    Drop your law firm's website. We'll scan it, build the business context, and let you experience the receptionist yourself.
                  </p>
                </div>
                <form onSubmit={startDemo} className="space-y-4">
                  <Input
                    type="text"
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    placeholder="https://yourlawfirm.com"
                    className="h-14 text-lg rounded-xl bg-muted/40 border-2 border-indigo-500/20 focus:border-indigo-400/60"
                  />
                  <Button
                    type="submit"
                    size="lg"
                    disabled={!url.trim()}
                    className="w-full h-14 text-lg font-bold gap-2 rounded-xl bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-500"
                  >
                    <PhoneIncoming className="h-5 w-5" />
                    Show Me My After-Hours AI Intake Agent
                    <ArrowRight className="h-5 w-5" />
                  </Button>
                </form>
                <div className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground mt-4">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  Live demo call requires your explicit consent before any call is placed.
                </div>
              </Card>
            </div>
          </div>
        </section>

        <section className="py-20 border-y border-border/40 bg-muted/10">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <div className="text-xs font-black tracking-[0.18em] text-indigo-300">THE DEMO IN ABOUT 3 MINUTES</div>
              <h2 className="text-3xl md:text-4xl font-black mt-3">See the entire opportunity, not just a chatbot.</h2>
            </div>
            <div className="grid md:grid-cols-4 gap-4">
              <Step number="1" icon={Globe} title="We learn your firm" text="Website context becomes the knowledge for the demo conversation." />
              <Step number="2" icon={Clock3} title="Model your inbound opportunity" text="Enter rough nights/weekends volume, new-prospect mix, missed calls, conversion, and client value." />
              <Step number="3" icon={PhoneIncoming} title="Experience the call" text="Lady Jarvis acts like your after-hours receptionist and intake specialist." />
              <Step number="4" icon={DollarSign} title="Watch + see the math" text="Run the inbound time-lapse, then see 25%, 50%, and 75% recovery scenarios using your estimates." />
            </div>
          </div>
        </section>

        <section className="py-20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid lg:grid-cols-[.8fr_1.2fr] gap-8 items-center">
              <div>
                <div className="inline-flex items-center gap-2 text-sm font-bold text-indigo-300">
                  <Zap className="h-4 w-4" />
                  START WITH INBOUND. EXPAND FROM THERE.
                </div>
                <h2 className="text-3xl md:text-4xl font-black mt-3">The receptionist is the doorway into the revenue engine.</h2>
                <p className="text-muted-foreground mt-4 leading-relaxed">
                  Once Call Boss understands the firm, the same context can power the workflows around every lead and every appointment — inbound and outbound.
                </p>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <Expansion icon={Target} title="Speed to Lead" text="Respond to web inquiries immediately and qualify while intent is fresh." />
                <Expansion icon={RefreshCw} title="Database Reactivation" text="Re-engage old inquiries, no-shows, and prospects who never signed." />
                <Expansion icon={MessageSquare} title="SMS + Follow-Up" text="Keep qualified prospects moving when a call alone is not enough." />
                <Expansion icon={Film} title="AI Video" text="Layer personalized or educational video into follow-up and nurture." />
              </div>
            </div>
          </div>
        </section>

        <section className="pb-24">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <Card className="p-8 md:p-12 text-center border-indigo-500/25 bg-gradient-to-br from-indigo-500/10 via-background to-cyan-500/5">
              <div className="h-16 w-16 mx-auto rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center mb-5">
                <Scale className="h-8 w-8 text-white" />
              </div>
              <h2 className="text-3xl md:text-4xl font-black">Law Firm AI Intake Beta</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto mt-3">
                Start with a narrow, measurable problem: nights, weekends, overflow, and missed new-client calls. Prove the experience, then expand what the AI handles.
              </p>
              <Button
                size="lg"
                className="mt-7 gap-2 bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-500"
                onClick={() => document.querySelector('input')?.focus()}
              >
                <Sparkles className="h-4 w-4" />
                Build My Firm's Demo
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Card>
          </div>
        </section>
      </main>
    </div>
  );
};

const Benefit = ({ icon: Icon, title, text }: CardProps) => (
  <Card className="p-5 border-indigo-500/15 bg-background/65">
    <div className="h-10 w-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-3">
      <Icon className="h-5 w-5 text-indigo-400" />
    </div>
    <h3 className="font-bold">{title}</h3>
    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{text}</p>
  </Card>
);

const Step = ({ number, icon: Icon, title, text }: CardProps & { number: string }) => (
  <Card className="p-5 border-border/50 bg-background/70 relative">
    <div className="absolute -top-3 -left-2 h-8 w-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-xs font-black text-white ring-2 ring-background">
      {number}
    </div>
    <Icon className="h-6 w-6 text-indigo-400 mt-3" />
    <h3 className="font-bold mt-3">{title}</h3>
    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{text}</p>
  </Card>
);

const Expansion = ({ icon: Icon, title, text }: CardProps) => (
  <Card className="p-5 border-indigo-500/15 bg-background/65">
    <Icon className="h-5 w-5 text-indigo-400" />
    <h3 className="font-bold mt-3">{title}</h3>
    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{text}</p>
  </Card>
);

interface CardProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  text: string;
}

export default LegalBeta;
