import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { 
  Zap, 
  X, 
  Check, 
  Globe, 
  Target, 
  PhoneCall, 
  BarChart3,
  Users,
  Bot,
  TrendingDown,
  TrendingUp,
  Clock,
  DollarSign,
  Flame,
  Brain,
  Rocket,
  AlertTriangle
} from 'lucide-react';
import { DemoDoTheMath } from './DemoDoTheMath';
import { AnimatedCounter } from '@/components/ui/animated-counter';

interface DemoLandingProps {
  onStart: (url: string) => void;
}

export const DemoLanding = ({ onStart }: DemoLandingProps) => {
  const [url, setUrl] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      onStart(url.trim());
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Section 1: The Reality Check */}
      <div className="flex-1 py-8 md:py-16 px-4">
        <div className="max-w-6xl mx-auto space-y-8 md:space-y-12">
          {/* Opening Hook */}
          <div className="text-center space-y-4">
            <h1 className="text-3xl md:text-5xl font-bold tracking-tight">
              When it comes to AI outbound at scale,
              <br />
              <span className="text-primary glow-text">you've got two options...</span>
            </h1>
          </div>

          {/* Side-by-Side Comparison */}
          <div className="grid md:grid-cols-2 gap-4 md:gap-6">
            {/* Option 1: Human Team (Pain) */}
            <OptionCard variant="pain">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-full bg-destructive/20">
                  <Users className="h-6 w-6 text-destructive" />
                </div>
                <h2 className="text-xl md:text-2xl font-bold">Option 1: Human Sales Team</h2>
              </div>
              <div className="space-y-4">
                <PainPoint icon={TrendingDown} text="50-150 calls/day per human (that's 20 reps to hit 2,000)" />
                <PainPoint icon={DollarSign} text="$120/day MINIMUM per rep (plus taxes, benefits, overhead)" />
                <PainPoint icon={Flame} text="Churn. Burn. Theft. Bad attitudes." />
                <PainPoint icon={AlertTriangle} text="35% annual turnover = constant rehiring" />
                <PainPoint icon={Clock} text="2-4 weeks training before they're productive" />
              </div>
            </OptionCard>

            {/* Option 2: AI Employee (Solution) */}
            <OptionCard variant="solution">
              <div className="flex items-center gap-3 mb-6">
                {/* ✨ STUNNING AI Avatar - Multi-ring animated orb */}
                <div className="relative w-16 h-16">
                  {/* Outer rotating ring */}
                  <div className="absolute inset-0 rounded-full border-2 border-dashed border-cyan-400/50 animate-spin" style={{ animationDuration: '8s' }} />
                  {/* Middle pulsing glow */}
                  <div className="absolute inset-1 rounded-full bg-gradient-to-r from-violet-500 via-cyan-400 to-emerald-400 blur-lg opacity-60 animate-pulse" />
                  {/* Inner rotating ring */}
                  <div className="absolute inset-2 rounded-full border border-violet-400/60 animate-spin" style={{ animationDuration: '4s', animationDirection: 'reverse' }} />
                  {/* Core orb with gradient */}
                  <div className="absolute inset-3 rounded-full bg-gradient-to-br from-violet-500 via-primary to-cyan-500 flex items-center justify-center shadow-[0_0_30px_rgba(139,92,246,0.5)]">
                    <Bot className="h-5 w-5 text-white drop-shadow-lg" />
                  </div>
                  {/* Sparkle effects */}
                  <div className="absolute -top-1 -right-1 w-2 h-2 bg-cyan-400 rounded-full animate-ping" style={{ animationDuration: '2s' }} />
                  <div className="absolute -bottom-0.5 -left-0.5 w-1.5 h-1.5 bg-violet-400 rounded-full animate-ping" style={{ animationDuration: '3s' }} />
                </div>
                <h2 className="text-xl md:text-2xl font-bold">Option 2: AI Sales Employee</h2>
              </div>
              <div className="space-y-4">
                <BenefitPoint icon={TrendingUp} text="2,000+ calls/day, 24/7" />
                <BenefitPoint icon={DollarSign} text="~$140 total (not per rep, TOTAL)" />
                <BenefitPoint icon={Check} text="Never quits. Never complains. Never calls in sick." />
                <BenefitPoint icon={Brain} text="Gets better over time (compounds)" />
                <BenefitPoint icon={Rocket} text="Deploy once, scales forever" />
              </div>
            </OptionCard>
          </div>

          {/* NEW: Do The Math Section */}
          <DemoDoTheMath />

          {/* Section 2: What This Demo Shows */}
          <div className="space-y-6 pt-8 border-t border-border">
            <div className="text-center space-y-2">
              <h2 className="text-2xl md:text-3xl font-bold">
                See Option 2 in Action—
                <span className="text-primary">Personalized for Your Business</span>
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                We've spent 2 years perfecting the AI sales employee. This demo lets you experience it in about 3 minutes.
              </p>
            </div>

            {/* 4-Step Promise */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <DemoStepItem 
                step={1} 
                icon={Globe} 
                title="We scrape your website" 
                description="Become a semi-expert on your product in 60 seconds"
              />
              <DemoStepItem 
                step={2} 
                icon={Target} 
                title="Choose your campaign" 
                description="Database reactivation, cross-sell, appointment setting, etc."
              />
              <DemoStepItem 
                step={3} 
                icon={PhoneCall} 
                title="Get a real AI call" 
                description="Experience Lady Jarvis's psychology-driven approach"
              />
              <DemoStepItem 
                step={4} 
                icon={BarChart3} 
                title="See the simulation" 
                description="Realistic numbers: calls, connects, appointments, ROI"
              />
            </div>

            {/* Trust Line */}
            <p className="text-center text-sm text-muted-foreground italic">
              "The numbers we show you aren't hype—they're typical results from 2 years of perfecting this."
            </p>
          </div>

          {/* Section 3: URL Input CTA - Premium styled */}
          <div className="relative max-w-xl mx-auto">
            {/* Animated gradient border */}
            <div className="absolute -inset-[2px] bg-gradient-to-r from-violet-500 via-primary to-cyan-500 rounded-2xl opacity-75 blur-sm animate-pulse" />
            <div className="absolute -inset-[1px] bg-gradient-to-r from-violet-500 via-primary to-cyan-500 rounded-2xl" />
            
            <Card className="relative p-6 md:p-8 bg-background/95 backdrop-blur-xl rounded-2xl border-0">
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-3">
                  {/* Glowing header */}
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-gradient-to-br from-primary to-cyan-500">
                      <Globe className="h-5 w-5 text-white" />
                    </div>
                    <label className="text-xl font-bold bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text">
                      Drop your website below—let's get started
                    </label>
                  </div>
                  <p className="text-sm text-muted-foreground pl-12">
                    We'll become a semi-expert on your product, then show you exactly what a campaign would look like.
                  </p>
                  <Input
                    type="text"
                    placeholder="https://yourcompany.com"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="h-14 text-lg bg-muted/50 border-2 border-primary/20 focus:border-primary/50 rounded-xl transition-all"
                    autoFocus
                  />
                </div>
                {/* Button with glowing border */}
                <div className="relative group">
                  {/* Pulsing glow border */}
                  <div className="absolute -inset-[2px] rounded-2xl bg-gradient-to-r from-violet-500 via-cyan-400 to-emerald-400 opacity-75 blur-sm animate-pulse" />
                  <div className="absolute -inset-[1px] rounded-xl bg-gradient-to-r from-violet-500 via-cyan-400 to-emerald-400" />
                  
                  <Button 
                    type="submit" 
                    size="lg" 
                    className="relative w-full h-14 text-lg gap-2 bg-gradient-to-r from-violet-600 via-primary to-cyan-500 hover:opacity-90 transition-all hover:scale-[1.02] shadow-[0_0_30px_rgba(139,92,246,0.5)] rounded-xl font-bold border-0"
                    disabled={!url.trim()}
                  >
                    <Zap className="h-5 w-5" />
                    Show Me What's Possible
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        </div>
      </div>

      {/* Section 4: Footer Stats */}
      <div className="border-t bg-muted/30 py-6">
        <div className="max-w-4xl mx-auto px-4 grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatItem value={2} suffix="+ Years" label="Battle-Tested" />
          <StatItem value={50} suffix="K+" label="Calls/Day Platform" />
          <StatItem value={97} suffix="%" label="Cost Reduction" />
          <StatItem value={3} prefix="~" suffix=" Min" label="Demo Time" />
        </div>
      </div>
    </div>
  );
};

// Option Card Component
const OptionCard = ({ 
  children, 
  variant 
}: { 
  children: React.ReactNode; 
  variant: 'pain' | 'solution';
}) => {
  const isPain = variant === 'pain';
  
  return (
    <Card className={`p-6 transition-all duration-300 ${
      isPain 
        ? 'bg-destructive/5 border-2 border-red-500/40 hover:border-red-500/60 shadow-[0_0_15px_-3px_rgba(239,68,68,0.2)] hover:shadow-[0_0_25px_-3px_rgba(239,68,68,0.3)]' 
        : 'bg-primary/5 border-2 border-primary/40 hover:border-primary/60 hover:shadow-lg hover:shadow-primary/20 glow-border animate-float'
    }`}>
      {children}
    </Card>
  );
};

// Pain Point Component
const PainPoint = ({ 
  icon: Icon, 
  text 
}: { 
  icon: React.ComponentType<{ className?: string }>; 
  text: string;
}) => (
  <div className="flex items-start gap-3">
    <div className="flex-shrink-0 mt-0.5">
      <X className="h-5 w-5 text-destructive" />
    </div>
    <span className="text-muted-foreground">{text}</span>
  </div>
);

// Benefit Point Component
const BenefitPoint = ({ 
  icon: Icon, 
  text 
}: { 
  icon: React.ComponentType<{ className?: string }>; 
  text: string;
}) => (
  <div className="flex items-start gap-3">
    <div className="flex-shrink-0 mt-0.5">
      <Check className="h-5 w-5 text-primary" />
    </div>
    <span className="text-foreground font-medium">{text}</span>
  </div>
);

// Demo Step Item Component - Premium gradient cards
const DemoStepItem = ({ 
  step, 
  icon: Icon, 
  title, 
  description 
}: { 
  step: number; 
  icon: React.ComponentType<{ className?: string }>; 
  title: string; 
  description: string;
}) => {
  // Each step gets a unique gradient accent + visible colored border
  const configs = [
    { 
      gradient: 'from-violet-500/20 via-purple-500/10 to-fuchsia-500/20',
      iconBg: 'bg-gradient-to-br from-violet-500 to-fuchsia-600',
      border: 'border-violet-500/40 hover:border-violet-400/70',
      shadow: 'shadow-violet-500/20 hover:shadow-violet-500/30'
    },
    { 
      gradient: 'from-cyan-500/20 via-blue-500/10 to-indigo-500/20',
      iconBg: 'bg-gradient-to-br from-cyan-500 to-blue-600',
      border: 'border-cyan-500/40 hover:border-cyan-400/70',
      shadow: 'shadow-cyan-500/20 hover:shadow-cyan-500/30'
    },
    { 
      gradient: 'from-emerald-500/20 via-teal-500/10 to-cyan-500/20',
      iconBg: 'bg-gradient-to-br from-emerald-500 to-teal-600',
      border: 'border-emerald-500/40 hover:border-emerald-400/70',
      shadow: 'shadow-emerald-500/20 hover:shadow-emerald-500/30'
    },
    { 
      gradient: 'from-amber-500/20 via-orange-500/10 to-rose-500/20',
      iconBg: 'bg-gradient-to-br from-amber-500 to-orange-600',
      border: 'border-amber-500/40 hover:border-amber-400/70',
      shadow: 'shadow-amber-500/20 hover:shadow-amber-500/30'
    },
  ];
  
  const config = configs[step - 1];

  return (
    <div className={`
      relative p-5 rounded-xl 
      bg-gradient-to-br ${config.gradient}
      border-2 ${config.border}
      backdrop-blur-sm
      shadow-lg ${config.shadow}
      hover:scale-[1.03] hover:shadow-xl
      transition-all duration-300 group
    `}>
      {/* Step badge */}
      <div className={`
        absolute -top-3 -left-2 w-8 h-8 rounded-full 
        ${config.iconBg}
        text-white text-sm font-bold 
        flex items-center justify-center
        shadow-lg ring-2 ring-background
      `}>
        {step}
      </div>
      
      {/* Content */}
      <div className="flex flex-col items-center text-center space-y-3 pt-2">
        {/* Icon container with glow */}
        <div className={`
          p-3 rounded-xl ${config.iconBg}
          shadow-lg group-hover:shadow-xl
          transition-shadow duration-300
        `}>
          <Icon className="h-6 w-6 text-white" />
        </div>
        <h3 className="font-bold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
      </div>
    </div>
  );
};

// Stat Item Component with AnimatedCounter
const StatItem = ({ value, label, prefix = '', suffix = '' }: { value: number; label: string; prefix?: string; suffix?: string }) => (
  <div className="text-center">
    <div className="text-2xl md:text-3xl font-bold text-primary">
      {prefix}<AnimatedCounter value={value} duration={1800} />{suffix}
    </div>
    <div className="text-xs md:text-sm text-muted-foreground">{label}</div>
  </div>
);
