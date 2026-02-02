import { Users, Bot, DollarSign, Clock, TrendingDown } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { AnimatedCounter } from '@/components/ui/animated-counter';

export const DemoDoTheMath = () => {
  return (
    <div className="space-y-6 py-8">
      <div className="text-center">
        <h2 className="text-2xl md:text-3xl font-bold mb-2">
          Here's what it takes to make{' '}
          <span className="text-primary">2,000 calls</span> in one day...
        </h2>
        <p className="text-muted-foreground">Do the math. Feel the weight.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Human Side - Pain */}
        <Card className="p-6 bg-destructive/5 border-destructive/20 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-destructive/10 rounded-full blur-3xl -mr-16 -mt-16" />
          
          <div className="flex items-center gap-3 mb-6 relative">
            <div className="p-2 rounded-full bg-destructive/20">
              <Users className="h-6 w-6 text-destructive" />
            </div>
            <h3 className="text-xl font-bold">With Humans</h3>
          </div>

          {/* Rep Grid Visual */}
          <div className="grid grid-cols-10 gap-1 mb-4">
            {Array(20).fill(0).map((_, i) => (
              <div 
                key={i} 
                className="aspect-square rounded bg-destructive/20 flex items-center justify-center text-lg animate-in fade-in"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                👤
              </div>
            ))}
          </div>
          <p className="text-sm text-muted-foreground mb-4 text-center">
            20 reps making 100 calls each
          </p>

          {/* Cost Breakdown */}
          <div className="space-y-2 text-sm">
            <CostRow label="20 reps × $120/day" value={2400} isDestructive />
            <CostRow label="+ 2 supervisors @ $200/day" value={400} isDestructive />
            <CostRow label="+ 30% overhead (taxes, benefits)" value={840} isDestructive />
            <div className="border-t border-destructive/20 pt-2 mt-2">
              <div className="flex justify-between items-center font-bold text-destructive">
                <span>TOTAL DAILY COST</span>
                <span className="text-2xl">
                  $<AnimatedCounter value={3640} duration={2000} />+
                </span>
              </div>
            </div>
          </div>

          {/* Hidden Costs */}
          <div className="mt-4 p-3 rounded-lg bg-destructive/10 text-sm space-y-1">
            <p className="font-medium text-destructive flex items-center gap-2">
              <TrendingDown className="h-4 w-4" />
              Hidden costs not included:
            </p>
            <ul className="text-muted-foreground text-xs space-y-0.5 ml-6">
              <li>• 35% annual turnover = constant rehiring</li>
              <li>• 2-4 weeks training before productive</li>
              <li>• Sick days, no-shows, bad attitudes</li>
              <li>• Quality inconsistency across reps</li>
            </ul>
          </div>
        </Card>

        {/* AI Side - Solution */}
        <Card className="p-6 bg-primary/5 border-primary/30 relative overflow-hidden glow-border animate-float">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/20 rounded-full blur-3xl -mr-16 -mt-16" />
          
          <div className="flex items-center gap-3 mb-6 relative">
            <div className="p-2 rounded-full bg-primary/20 animate-glow-pulse">
              <Bot className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-xl font-bold">With AI</h3>
          </div>

          {/* Single AI Visual */}
          <div className="flex justify-center items-center mb-4 py-6">
            <div className="relative">
              <div className="w-20 h-20 rounded-2xl bg-primary/20 flex items-center justify-center text-4xl animate-glow-pulse">
                🤖
              </div>
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-primary text-primary-foreground text-xs font-bold whitespace-nowrap">
                1 AI Agent
              </div>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mb-4 text-center">
            Making 2,000+ calls in a single day
          </p>

          {/* Cost Breakdown */}
          <div className="space-y-2 text-sm">
            <CostRow label="2,000 calls × ~$0.07 each" value={140} isPrimary />
            <CostRow label="+ Management required" value={0} isPrimary label2="$0" />
            <CostRow label="+ Overhead" value={0} isPrimary label2="$0" />
            <div className="border-t border-primary/20 pt-2 mt-2">
              <div className="flex justify-between items-center font-bold text-primary">
                <span>TOTAL DAILY COST</span>
                <span className="text-2xl glow-text">
                  $<AnimatedCounter value={140} duration={1500} />
                </span>
              </div>
            </div>
          </div>

          {/* Benefits */}
          <div className="mt-4 p-3 rounded-lg bg-primary/10 text-sm space-y-1">
            <p className="font-medium text-primary flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Plus these bonuses:
            </p>
            <ul className="text-muted-foreground text-xs space-y-0.5 ml-6">
              <li>✓ 24/7 availability</li>
              <li>✓ 100% consistent quality</li>
              <li>✓ Zero turnover, ever</li>
              <li>✓ Gets smarter over time</li>
            </ul>
          </div>
        </Card>
      </div>

      {/* Bottom Line */}
      <Card className="p-4 text-center bg-gradient-to-r from-green-500/10 via-green-500/5 to-green-500/10 border-green-500/20">
        <span className="text-sm text-muted-foreground">Save </span>
        <span className="text-3xl font-bold text-green-500">
          $<AnimatedCounter value={3500} duration={2000} />+
        </span>
        <span className="text-sm text-muted-foreground"> per day </span>
        <span className="text-xl font-bold text-green-500">(96% reduction)</span>
      </Card>
    </div>
  );
};

const CostRow = ({ 
  label, 
  value, 
  isDestructive, 
  isPrimary,
  label2,
}: { 
  label: string; 
  value: number; 
  isDestructive?: boolean;
  isPrimary?: boolean;
  label2?: string;
}) => (
  <div className="flex justify-between items-center p-2 rounded bg-muted/30">
    <span className="text-muted-foreground">{label}</span>
    <span className={`font-semibold ${isDestructive ? 'text-destructive' : isPrimary ? 'text-primary' : ''}`}>
      {label2 || `+$${value.toLocaleString()}`}
    </span>
  </div>
);

export default DemoDoTheMath;
