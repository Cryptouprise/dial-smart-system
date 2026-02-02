import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowLeft, Database, Zap, Calendar, ShoppingCart, Bell, CheckCircle, Sparkles } from 'lucide-react';

interface DemoCampaignTypeSelectorProps {
  scrapedData: any;
  selectedType: string;
  onSelect: (type: string) => void;
  onBack: () => void;
}

const campaignTypes = [
  {
    id: 'database_reactivation',
    name: 'Database Reactivation',
    description: 'Re-engage cold leads who never converted',
    icon: Database,
    features: ['1 AI Call', '2 SMS Follow-ups', '1 Email'],
    recommended: true,
    gradient: 'from-violet-500 to-fuchsia-600',
    borderColor: 'border-violet-500/40 hover:border-violet-400/70',
    glowColor: 'shadow-violet-500/30',
    bgGlow: 'from-violet-500/20 via-purple-500/10 to-fuchsia-500/20',
  },
  {
    id: 'speed_to_lead',
    name: 'Speed to Lead',
    description: 'Instantly call new inbound leads',
    icon: Zap,
    features: ['Immediate AI Call', '1 SMS', 'Auto Follow-up'],
    recommended: false,
    gradient: 'from-amber-500 to-orange-600',
    borderColor: 'border-amber-500/40 hover:border-amber-400/70',
    glowColor: 'shadow-amber-500/30',
    bgGlow: 'from-amber-500/20 via-orange-500/10 to-rose-500/20',
  },
  {
    id: 'appointment_setter',
    name: 'Appointment Setter',
    description: 'Book meetings with qualified prospects',
    icon: Calendar,
    features: ['Qualifying Call', 'Calendar Integration', 'Reminder SMS'],
    recommended: false,
    gradient: 'from-cyan-500 to-blue-600',
    borderColor: 'border-cyan-500/40 hover:border-cyan-400/70',
    glowColor: 'shadow-cyan-500/30',
    bgGlow: 'from-cyan-500/20 via-blue-500/10 to-indigo-500/20',
  },
  {
    id: 'cross_sell',
    name: 'Cross-sell / Upsell',
    description: 'Maximize value from existing customers',
    icon: ShoppingCart,
    features: ['Personalized Offer', 'Product Recommendations', 'Follow-up'],
    recommended: false,
    gradient: 'from-emerald-500 to-teal-600',
    borderColor: 'border-emerald-500/40 hover:border-emerald-400/70',
    glowColor: 'shadow-emerald-500/30',
    bgGlow: 'from-emerald-500/20 via-teal-500/10 to-cyan-500/20',
  },
  {
    id: 'reminder',
    name: 'Appointment Reminders',
    description: 'Reduce no-shows with smart reminders',
    icon: Bell,
    features: ['24h Reminder', '1h Reminder', 'Confirmation'],
    recommended: false,
    gradient: 'from-rose-500 to-pink-600',
    borderColor: 'border-rose-500/40 hover:border-rose-400/70',
    glowColor: 'shadow-rose-500/30',
    bgGlow: 'from-rose-500/20 via-pink-500/10 to-fuchsia-500/20',
  },
];

export const DemoCampaignTypeSelector = ({ 
  scrapedData, 
  selectedType, 
  onSelect, 
  onBack 
}: DemoCampaignTypeSelectorProps) => {
  return (
    <div className="min-h-screen p-4 md:p-8 bg-background">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Premium Header */}
        <div className="relative">
          {/* Ambient glow behind header */}
          <div className="absolute -inset-4 bg-gradient-to-r from-violet-500/10 via-primary/5 to-cyan-500/10 rounded-3xl blur-2xl" />
          
          <div className="relative flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={onBack}
              className="rounded-full border border-border/50 hover:border-primary/50 hover:bg-primary/10 transition-all"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="space-y-1">
              <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-foreground via-foreground to-foreground/70 bg-clip-text">
                Choose Your Campaign Type
              </h1>
              <p className="text-muted-foreground">
                Select how you want to demonstrate AI calling for{' '}
                <span className="bg-gradient-to-r from-primary to-cyan-500 bg-clip-text text-transparent font-semibold">
                  {scrapedData?.business_name || 'your business'}
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* Campaign Type Grid - Premium Cards */}
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {campaignTypes.map((type) => {
            const Icon = type.icon;
            const isSelected = selectedType === type.id;

            return (
              <Card
                key={type.id}
                className={`
                  relative p-6 cursor-pointer transition-all duration-300
                  bg-gradient-to-br ${type.bgGlow}
                  border-2 ${isSelected ? 'border-primary ring-2 ring-primary/30' : type.borderColor}
                  backdrop-blur-sm
                  shadow-lg ${isSelected ? 'shadow-primary/40 scale-[1.02]' : type.glowColor}
                  hover:scale-[1.03] hover:shadow-xl
                  group
                `}
                onClick={() => onSelect(type.id)}
              >
                {/* Recommended badge with glow */}
                {type.recommended && (
                  <div className="absolute -top-3 -right-3">
                    <div className="relative">
                      <div className="absolute inset-0 bg-gradient-to-r from-violet-500 to-cyan-500 rounded-full blur-md opacity-60" />
                      <div className="relative flex items-center gap-1 px-3 py-1 rounded-full bg-gradient-to-r from-violet-500 to-cyan-500 text-white text-xs font-bold shadow-lg">
                        <Sparkles className="h-3 w-3" />
                        Recommended
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  {/* Icon and Check */}
                  <div className="flex items-start justify-between">
                    <div className={`
                      p-3 rounded-xl bg-gradient-to-br ${type.gradient}
                      shadow-lg group-hover:shadow-xl transition-shadow duration-300
                    `}>
                      <Icon className="h-6 w-6 text-white" />
                    </div>
                    {isSelected && (
                      <div className="relative">
                        <div className="absolute inset-0 bg-primary rounded-full blur-md opacity-50 animate-pulse" />
                        <CheckCircle className="relative h-6 w-6 text-primary" />
                      </div>
                    )}
                  </div>

                  {/* Title & Description */}
                  <div>
                    <h3 className="font-bold text-lg text-foreground group-hover:text-primary transition-colors">
                      {type.name}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                      {type.description}
                    </p>
                  </div>

                  {/* Features with gradient checks */}
                  <div className="space-y-2 pt-2 border-t border-border/30">
                    {type.features.map((feature, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <div className={`p-0.5 rounded-full bg-gradient-to-br ${type.gradient}`}>
                          <CheckCircle className="h-3 w-3 text-white" />
                        </div>
                        <span className="text-muted-foreground group-hover:text-foreground/80 transition-colors">
                          {feature}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Hover glow effect */}
                <div className={`
                  absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300
                  bg-gradient-to-br ${type.bgGlow} pointer-events-none
                `} />
              </Card>
            );
          })}
        </div>

        {/* Premium Info Note */}
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-violet-500/5 to-cyan-500/5 rounded-2xl blur-xl" />
          <div className="relative text-center p-4 rounded-2xl border border-border/30 bg-background/50 backdrop-blur-sm">
            <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span>This is a simulation. We'll show you exactly what a real campaign would look like.</span>
              <Sparkles className="h-4 w-4 text-cyan-500" />
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
