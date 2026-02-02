import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { 
  Zap, Users, Clock, DollarSign, TrendingUp, CheckCircle, 
  XCircle, Heart, Brain, Sparkles, ArrowRight, RefreshCw
} from 'lucide-react';
import { calculateROI } from '@/lib/roiCalculator';
import { AnimatedCounter } from '@/components/ui/animated-counter';

interface SimulationResults {
  callsMade: number;
  connected: number;
  voicemails: number;
  appointments: number;
  totalCost: number;
  durationMinutes: number;
}

interface SimulationConfig {
  leadCount: number;
  dailyGoalAppointments: number;
  costPerAppointmentTarget: number;
  phoneNumbersNeeded: number;
  enablePredictiveDialing: boolean;
}

interface DemoROIDashboardProps {
  simulationResults: SimulationResults;
  config: SimulationConfig;
  scrapedData: any;
  onStartOver: () => void;
}

export const DemoROIDashboard = ({
  simulationResults,
  config,
  scrapedData,
  onStartOver,
}: DemoROIDashboardProps) => {
  const roi = useMemo(() => calculateROI({
    callsMade: simulationResults.callsMade,
    durationMinutes: simulationResults.durationMinutes,
    appointmentsSet: simulationResults.appointments,
    aiCost: simulationResults.totalCost,
  }), [simulationResults]);

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value.toLocaleString()}`;
  };

  const formatHours = (hours: number) => {
    if (hours >= 24) return `${Math.round(hours / 24)} days`;
    return `${hours.toFixed(1)} hours`;
  };

  return (
    <div className="min-h-screen p-4 md:p-8 bg-gradient-to-br from-background via-background to-primary/5">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Hero Section */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary animate-glow-pulse">
            <Zap className="h-4 w-4" />
            <span className="font-medium">THE POWER OF AI DIAL BOSS</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold">
            The automated sales team with the power of{' '}
            <span className="text-primary glow-text"><AnimatedCounter value={roi.repsNeeded} duration={1500} /> reps</span>,
            <br />
            the cost of less than 1, and the management of 0.
          </h1>
        </div>

        {/* What Just Happened */}
        <Card className="p-6 space-y-6 glass-card-glow">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            What Just Happened
          </h2>
          
          <div className="text-center p-4 rounded-lg bg-muted/50">
            <span className="text-3xl font-bold"><AnimatedCounter value={simulationResults.callsMade} duration={1800} /></span>
            <span className="text-muted-foreground"> calls made in </span>
            <span className="text-3xl font-bold text-primary">{formatHours(roi.aiTimeHours)}</span>
          </div>

          {/* Comparison Table */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
              <div className="flex items-center gap-2 mb-4">
                <Brain className="h-5 w-5 text-primary" />
                <span className="font-semibold">AI Dial Boss</span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span>Time:</span><span className="font-bold">{formatHours(roi.aiTimeHours)}</span></div>
                <div className="flex justify-between"><span>Cost:</span><span className="font-bold text-green-500">${simulationResults.totalCost.toFixed(2)}</span></div>
                <div className="flex justify-between"><span>Agents needed:</span><span className="font-bold">1 AI</span></div>
                <div className="flex justify-between"><span>Management:</span><span className="font-bold">You (5 min)</span></div>
                <div className="flex justify-between"><span>Quality:</span><span className="font-bold">100% consistent</span></div>
              </div>
            </div>
            
            <div className="p-4 rounded-lg bg-muted/50 opacity-75">
              <div className="flex items-center gap-2 mb-4">
                <Users className="h-5 w-5" />
                <span className="font-semibold">Traditional Team</span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span>Time:</span><span className="font-bold">{formatHours(roi.humanTimeHours)}</span></div>
                <div className="flex justify-between"><span>Cost:</span><span className="font-bold text-destructive">${roi.humanCost.toLocaleString()}</span></div>
                <div className="flex justify-between"><span>Agents needed:</span><span className="font-bold">{roi.repsNeeded} humans</span></div>
                <div className="flex justify-between"><span>Management:</span><span className="font-bold">{roi.supervisorsNeeded} supervisors</span></div>
                <div className="flex justify-between"><span>Quality:</span><span className="text-muted-foreground">Varies wildly</span></div>
              </div>
            </div>
          </div>

          {/* Savings Highlight */}
          <div className="grid md:grid-cols-2 gap-4 text-center">
            <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20 glow-border">
              <div className="text-3xl font-bold text-green-500 glow-text">
                $<AnimatedCounter value={Math.round(roi.savings)} duration={2000} />
              </div>
              <div className="text-sm text-muted-foreground">
                Saved (<AnimatedCounter value={roi.savingsPercent} duration={1500} />% reduction)
              </div>
            </div>
            <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <div className="text-3xl font-bold text-blue-500">
                <AnimatedCounter value={roi.timeSavingsPercent} duration={1500} />%
              </div>
              <div className="text-sm text-muted-foreground">
                Faster than humans
              </div>
            </div>
          </div>
        </Card>

        {/* Human Equivalent */}
        <Card className="p-6 space-y-4 glass-card">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            The Human Equivalent
          </h2>
          <p className="text-muted-foreground">
            To make <AnimatedCounter value={simulationResults.callsMade} duration={1200} /> calls traditionally, you would need:
          </p>
          
          <div className="grid grid-cols-5 md:grid-cols-10 gap-2">
            {Array(Math.min(roi.repsNeeded, 20)).fill(0).map((_, i) => (
              <div 
                key={i} 
                className="aspect-square rounded-lg bg-muted/50 flex items-center justify-center text-2xl animate-in fade-in"
                style={{ animationDelay: `${i * 50}ms` }}
                title="Sales Rep"
              >
                👤
              </div>
            ))}
            {roi.repsNeeded > 20 && (
              <div className="aspect-square rounded-lg bg-muted/50 flex items-center justify-center text-sm font-bold">
                +{roi.repsNeeded - 20}
              </div>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div className="space-y-2 p-4 rounded-lg bg-muted/30">
              <div>👤 <strong><AnimatedCounter value={roi.repsNeeded} duration={1200} /> Sales Reps</strong> @ 100 calls/day each</div>
              <div>💰 At $15/hour = $120/day each</div>
              <div>👔 + <AnimatedCounter value={roi.supervisorsNeeded} duration={1000} /> Supervisors @ $25/hr</div>
              <div>📊 + Benefits, taxes, overhead: +30%</div>
              <div>🔄 + Training new hires (35% annual turnover)</div>
              <div>🤒 + Sick days, no-shows, bad attitudes</div>
            </div>
            <div className="flex flex-col justify-center items-center p-4 rounded-lg bg-destructive/10">
              <span className="text-muted-foreground">REAL COST:</span>
              <span className="text-4xl font-bold text-destructive">
                $<AnimatedCounter value={roi.humanCost} duration={2000} />+
              </span>
              <span className="text-sm text-muted-foreground">per day</span>
            </div>
          </div>
        </Card>

        {/* The Promise */}
        <div className="grid md:grid-cols-2 gap-4">
          <Card className="p-6 text-center">
            <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-xl font-bold">NO MORE CHURN</h3>
            <ul className="text-muted-foreground mt-2 space-y-1">
              <li>Never quits</li>
              <li>Never leaves</li>
              <li>Never calls in sick</li>
            </ul>
          </Card>
          <Card className="p-6 text-center">
            <Heart className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-xl font-bold">NO MORE BURN</h3>
            <ul className="text-muted-foreground mt-2 space-y-1">
              <li>Never burns out</li>
              <li>Never has bad days</li>
              <li>Never loses focus</li>
            </ul>
          </Card>
        </div>

        {/* Monthly Projection */}
        <Card className="p-6 space-y-4 glass-card">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            Your Personalized Projection
          </h2>
          <p className="text-muted-foreground">
            Based on your simulation for <span className="text-primary font-medium">{scrapedData?.business_name || 'your business'}</span>:
          </p>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-muted/30 space-y-3">
              <h4 className="font-semibold">Monthly Projection</h4>
              <div className="flex justify-between"><span>Calls Made:</span><span className="font-bold"><AnimatedCounter value={roi.monthlyCallsProjected} duration={1500} /></span></div>
              <div className="flex justify-between"><span>Appointments Set:</span><span className="font-bold">~<AnimatedCounter value={roi.monthlyAppointmentsProjected} duration={1500} /></span></div>
              <div className="flex justify-between"><span>Cost with AI:</span><span className="font-bold text-green-500">{formatCurrency(roi.monthlyAICost)}</span></div>
              <div className="flex justify-between"><span>Cost with Humans:</span><span className="font-bold text-destructive">{formatCurrency(roi.monthlyHumanCost)}</span></div>
            </div>
            <div className="flex flex-col justify-center items-center p-4 rounded-lg bg-green-500/10 border border-green-500/20 glow-border">
              <span className="text-sm text-muted-foreground">Annual Savings</span>
              <span className="text-4xl md:text-5xl font-bold text-green-500 glow-text">
                $<AnimatedCounter value={Math.round(roi.annualSavings)} duration={2500} />
              </span>
            </div>
          </div>
        </Card>

        {/* CTA */}
        <Card className="p-8 text-center glass-card-glow border-primary/30">
          <Sparkles className="h-12 w-12 text-primary mx-auto mb-4 animate-float" />
          <h2 className="text-2xl font-bold mb-2">Ready to Unleash the Monster?</h2>
          <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
            Join companies who replaced their call centers with AI Dial Boss. 
            No more churn. No more burn. Just results.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button size="lg" className="gap-2 glow-border transition-all hover:scale-105">
              <Zap className="h-4 w-4" />
              Start Free Trial
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button size="lg" variant="outline" className="gap-2">
              Talk to Sales
            </Button>
          </div>
          <Button variant="link" onClick={onStartOver} className="mt-4 gap-2 text-muted-foreground">
            <RefreshCw className="h-4 w-4" />
            Try with different settings
          </Button>
        </Card>
      </div>
    </div>
  );
};
