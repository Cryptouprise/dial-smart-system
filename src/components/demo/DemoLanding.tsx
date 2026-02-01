import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Zap, Phone, Users, TrendingUp, Bot, Sparkles } from 'lucide-react';

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
    <div className="min-h-screen flex flex-col">
      {/* Hero Section */}
      <div className="flex-1 flex items-center justify-center p-4 md:p-8">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary border border-primary/20">
            <Sparkles className="h-4 w-4" />
            <span className="text-sm font-medium">Experience AI Outbound Calling</span>
          </div>

          {/* Main Headline */}
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight">
            <span className="bg-gradient-to-r from-foreground via-foreground to-primary bg-clip-text">
              The Power of{' '}
            </span>
            <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              100 Sales Reps
            </span>
            <br />
            <span className="text-2xl md:text-4xl text-muted-foreground font-normal">
              The Cost of Less Than 10
            </span>
          </h1>

          {/* Subheadline */}
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
            See exactly what AI-powered outbound calling looks like for <strong>your business</strong>. 
            Enter your website, and we'll personalize a live demo just for you.
          </p>

          {/* URL Input */}
          <Card className="p-6 md:p-8 max-w-xl mx-auto bg-card/50 backdrop-blur border-primary/20">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-left block">
                  Enter your website to personalize this demo
                </label>
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
                Start Interactive Demo
              </Button>
            </form>
          </Card>

          {/* Feature Pills */}
          <div className="flex flex-wrap justify-center gap-3">
            <FeaturePill icon={Phone} text="Real AI Call" />
            <FeaturePill icon={Users} text="Live Simulation" />
            <FeaturePill icon={TrendingUp} text="ROI Calculator" />
            <FeaturePill icon={Bot} text="Personalized Demo" />
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="border-t bg-muted/30 py-6">
        <div className="max-w-4xl mx-auto px-4 grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatItem value="50K+" label="Calls Made Daily" />
          <StatItem value="97%" label="Cost Reduction" />
          <StatItem value="24/7" label="Never Stops" />
          <StatItem value="60s" label="Demo Time" />
        </div>
      </div>
    </div>
  );
};

const FeaturePill = ({ icon: Icon, text }: { icon: any; text: string }) => (
  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50 text-muted-foreground text-sm">
    <Icon className="h-4 w-4" />
    <span>{text}</span>
  </div>
);

const StatItem = ({ value, label }: { value: string; label: string }) => (
  <div className="text-center">
    <div className="text-2xl md:text-3xl font-bold text-primary">{value}</div>
    <div className="text-xs md:text-sm text-muted-foreground">{label}</div>
  </div>
);
