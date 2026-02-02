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
  Rocket
} from 'lucide-react';

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
              <span className="text-primary">you've got two options...</span>
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
                <PainPoint icon={TrendingDown} text="50-150 calls/day max per human" />
                <PainPoint icon={DollarSign} text="$50-$250/day per rep (plus overhead)" />
                <PainPoint icon={Flame} text="Churn. Burn. Theft. Bad attitudes." />
                <PainPoint icon={Users} text="They poison the crew when they leave" />
                <PainPoint icon={Clock} text="Constant hiring. Endless training." />
              </div>
            </OptionCard>

            {/* Option 2: AI Employee (Solution) */}
            <OptionCard variant="solution">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-full bg-primary/20">
                  <Bot className="h-6 w-6 text-primary" />
                </div>
                <h2 className="text-xl md:text-2xl font-bold">Option 2: AI Sales Employee</h2>
              </div>
              <div className="space-y-4">
                <BenefitPoint icon={TrendingUp} text="2,000+ calls/day, 24/7" />
                <BenefitPoint icon={DollarSign} text="Fraction of the cost" />
                <BenefitPoint icon={Check} text="Never quits. Never complains." />
                <BenefitPoint icon={Brain} text="Gets better over time (compounds)" />
                <BenefitPoint icon={Rocket} text="Deploy once, scales forever" />
              </div>
            </OptionCard>
          </div>

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

          {/* Section 3: URL Input CTA */}
          <Card className="p-6 md:p-8 max-w-xl mx-auto bg-card/50 backdrop-blur border-primary/20">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-lg font-semibold text-left block">
                  Drop your website below—let's get started
                </label>
                <p className="text-sm text-muted-foreground">
                  We'll become a semi-expert on your product, then show you exactly what a campaign would look like.
                </p>
                <Input
                  type="text"
                  placeholder="https://yourcompany.com"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="h-12 text-lg"
                  autoFocus
                />
              </div>
              <Button 
                type="submit" 
                size="lg" 
                className="w-full h-12 text-lg gap-2"
                disabled={!url.trim()}
              >
                <Zap className="h-5 w-5" />
                Show Me What's Possible
              </Button>
            </form>
          </Card>
        </div>
      </div>

      {/* Section 4: Footer Stats */}
      <div className="border-t bg-muted/30 py-6">
        <div className="max-w-4xl mx-auto px-4 grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatItem value="2+ Years" label="Battle-Tested" />
          <StatItem value="50K+" label="Calls/Day Platform" />
          <StatItem value="97%" label="Cost Reduction" />
          <StatItem value="~3 Min" label="Demo Time" />
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
        ? 'bg-destructive/5 border-destructive/20 hover:border-destructive/40' 
        : 'bg-primary/5 border-primary/30 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10'
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

// Demo Step Item Component
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
}) => (
  <div className="relative p-4 rounded-lg bg-muted/50 border border-border hover:border-primary/30 transition-colors">
    <div className="absolute -top-3 -left-2 w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center">
      {step}
    </div>
    <div className="flex flex-col items-center text-center space-y-2 pt-2">
      <Icon className="h-8 w-8 text-primary" />
      <h3 className="font-semibold text-sm">{title}</h3>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  </div>
);

// Stat Item Component
const StatItem = ({ value, label }: { value: string; label: string }) => (
  <div className="text-center">
    <div className="text-2xl md:text-3xl font-bold text-primary">{value}</div>
    <div className="text-xs md:text-sm text-muted-foreground">{label}</div>
  </div>
);
