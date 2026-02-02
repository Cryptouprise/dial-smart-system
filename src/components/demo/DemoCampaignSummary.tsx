import { Phone, Voicemail, MessageSquare, Mail, DollarSign, Users, Zap, TrendingUp } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AnimatedCounter } from '@/components/ui/animated-counter';

interface DemoCampaignSummaryProps {
  callsMade: number;
  voicemails: number;
  smsSent: number;
  emailsSent: number;
  totalCost: number;
  positiveOutcomes: number;
  onContinue: () => void;
}

export const DemoCampaignSummary = ({
  callsMade,
  voicemails,
  smsSent,
  emailsSent,
  totalCost,
  positiveOutcomes,
  onContinue,
}: DemoCampaignSummaryProps) => {
  // Human equivalent cost: 20 reps x $120/day = $2,400
  const humanEquivalentCost = 2400;
  const savings = humanEquivalentCost - totalCost;
  const savingsPercent = Math.round((savings / humanEquivalentCost) * 100);

  return (
    <Card className="p-6 glass-card-glow animate-scale-in">
      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/20 text-primary mb-3 animate-glow-pulse">
          <Zap className="h-4 w-4" />
          <span className="font-bold text-sm">CAMPAIGN DELIVERED</span>
        </div>
        <h2 className="text-2xl font-bold">Here's What You Got</h2>
        <p className="text-muted-foreground text-sm mt-1">
          All of this happened in minutes, not days
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <SummaryStatCard
          icon={Phone}
          label="Calls Made"
          value={callsMade}
          color="text-primary"
          bgColor="bg-primary/10"
        />
        <SummaryStatCard
          icon={Voicemail}
          label="Voicemails Dropped"
          value={voicemails}
          color="text-amber-500"
          bgColor="bg-amber-500/10"
        />
        <SummaryStatCard
          icon={MessageSquare}
          label="SMS Sent"
          value={smsSent}
          color="text-green-500"
          bgColor="bg-green-500/10"
        />
        <SummaryStatCard
          icon={Mail}
          label="Emails Sent"
          value={emailsSent}
          color="text-blue-500"
          bgColor="bg-blue-500/10"
        />
      </div>

      {/* Positive Outcomes Highlight */}
      <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 mb-6 text-center">
        <span className="text-sm text-muted-foreground">Total Positive Outcomes</span>
        <div className="text-4xl font-bold text-green-500 mt-1">
          <AnimatedCounter value={positiveOutcomes} duration={1500} />
        </div>
        <span className="text-xs text-muted-foreground">
          Hot leads, appointments, follow-ups & more
        </span>
      </div>

      {/* Cost Comparison */}
      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <div className="p-4 rounded-xl bg-primary/10 border border-primary/20 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Zap className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">AI Cost</span>
          </div>
          <div className="text-3xl font-bold text-primary">
            $<AnimatedCounter value={Math.round(totalCost)} duration={1200} />
          </div>
          <span className="text-xs text-muted-foreground">This entire campaign</span>
        </div>
        
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-center opacity-75">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Users className="h-4 w-4 text-destructive" />
            <span className="text-sm font-medium">Human Equivalent</span>
          </div>
          <div className="text-3xl font-bold text-destructive line-through decoration-2">
            ${humanEquivalentCost.toLocaleString()}+
          </div>
          <span className="text-xs text-muted-foreground">20 reps × $120/day</span>
        </div>
      </div>

      {/* Savings Banner */}
      <div className="p-4 rounded-xl bg-gradient-to-r from-green-500/20 via-green-500/10 to-green-500/20 border border-green-500/30 text-center mb-6 glow-border">
        <span className="text-sm font-medium text-green-600">You Just Saved</span>
        <div className="text-4xl font-bold text-green-500 glow-text">
          $<AnimatedCounter value={Math.round(savings)} duration={1800} />
        </div>
        <span className="text-sm text-green-600 font-medium">{savingsPercent}% cost reduction</span>
      </div>

      {/* CTA */}
      <div className="text-center">
        <Button size="lg" onClick={onContinue} className="gap-2 animate-glow-pulse">
          <TrendingUp className="h-4 w-4" />
          See Full ROI Analysis
        </Button>
      </div>
    </Card>
  );
};

const SummaryStatCard = ({
  icon: Icon,
  label,
  value,
  color,
  bgColor,
}: {
  icon: any;
  label: string;
  value: number;
  color: string;
  bgColor: string;
}) => (
  <div className={`p-3 rounded-xl ${bgColor} text-center transition-transform hover:scale-105`}>
    <Icon className={`h-5 w-5 ${color} mx-auto mb-1`} />
    <div className={`text-2xl font-bold ${color}`}>
      <AnimatedCounter value={value} duration={1400} />
    </div>
    <span className="text-xs text-muted-foreground">{label}</span>
  </div>
);

export default DemoCampaignSummary;
