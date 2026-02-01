import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowLeft, Database, Zap, Calendar, ShoppingCart, Bell, CheckCircle } from 'lucide-react';

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
  },
  {
    id: 'speed_to_lead',
    name: 'Speed to Lead',
    description: 'Instantly call new inbound leads',
    icon: Zap,
    features: ['Immediate AI Call', '1 SMS', 'Auto Follow-up'],
    recommended: false,
  },
  {
    id: 'appointment_setter',
    name: 'Appointment Setter',
    description: 'Book meetings with qualified prospects',
    icon: Calendar,
    features: ['Qualifying Call', 'Calendar Integration', 'Reminder SMS'],
    recommended: false,
  },
  {
    id: 'cross_sell',
    name: 'Cross-sell / Upsell',
    description: 'Maximize value from existing customers',
    icon: ShoppingCart,
    features: ['Personalized Offer', 'Product Recommendations', 'Follow-up'],
    recommended: false,
  },
  {
    id: 'reminder',
    name: 'Appointment Reminders',
    description: 'Reduce no-shows with smart reminders',
    icon: Bell,
    features: ['24h Reminder', '1h Reminder', 'Confirmation'],
    recommended: false,
  },
];

export const DemoCampaignTypeSelector = ({ 
  scrapedData, 
  selectedType, 
  onSelect, 
  onBack 
}: DemoCampaignTypeSelectorProps) => {
  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Choose Your Campaign Type</h1>
            <p className="text-muted-foreground">
              Select how you want to demonstrate AI calling for{' '}
              <span className="text-primary font-medium">{scrapedData?.business_name || 'your business'}</span>
            </p>
          </div>
        </div>

        {/* Campaign Type Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {campaignTypes.map((type) => {
            const Icon = type.icon;
            const isSelected = selectedType === type.id;

            return (
              <Card
                key={type.id}
                className={`relative p-6 cursor-pointer transition-all hover:border-primary/50 ${
                  isSelected ? 'border-primary ring-2 ring-primary/20' : ''
                }`}
                onClick={() => onSelect(type.id)}
              >
                {type.recommended && (
                  <div className="absolute -top-2 -right-2 px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-xs font-medium">
                    Recommended
                  </div>
                )}

                <div className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div className={`p-3 rounded-lg ${isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                      <Icon className="h-6 w-6" />
                    </div>
                    {isSelected && (
                      <CheckCircle className="h-5 w-5 text-primary" />
                    )}
                  </div>

                  <div>
                    <h3 className="font-semibold">{type.name}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{type.description}</p>
                  </div>

                  <div className="space-y-1">
                    {type.features.map((feature, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <CheckCircle className="h-3 w-3 text-primary" />
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Info Note */}
        <div className="text-center text-sm text-muted-foreground">
          <p>
            💡 This is a simulation. We'll show you exactly what a real campaign would look like.
          </p>
        </div>
      </div>
    </div>
  );
};
