import { Sparkles, ArrowRight, MessageSquare, Calendar, TrendingUp } from 'lucide-react';
import { Card } from '@/components/ui/card';

interface DemoSecondaryCampaignCalloutProps {
  positiveOutcomes: number;
  estimatedAdditionalAppointments: number;
}

export const DemoSecondaryCampaignCallout = ({
  positiveOutcomes,
  estimatedAdditionalAppointments,
}: DemoSecondaryCampaignCalloutProps) => {
  if (positiveOutcomes < 1) return null;

  return (
    <Card className="relative overflow-hidden animate-in fade-in slide-in-from-bottom-2">
      {/* Gradient Background */}
      <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-primary/5 to-amber-500/10" />
      
      <div className="relative p-4">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          
          {/* Content */}
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-sm flex items-center gap-2">
              <span>Not Included in This Simulation</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-600 font-normal">
                Bonus ROI
              </span>
            </h4>
            <p className="text-sm text-muted-foreground mt-1">
              All positive outcomes automatically trigger a <strong>secondary SMS drip campaign</strong>, 
              typically generating <span className="text-primary font-semibold">15-25% more appointments</span>.
            </p>
            
            {/* Visual Flow */}
            <div className="flex items-center gap-2 mt-3 text-xs">
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-green-500/20 text-green-600">
                <TrendingUp className="h-3 w-3" />
                <span>{positiveOutcomes} Positive</span>
              </div>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-blue-500/20 text-blue-600">
                <MessageSquare className="h-3 w-3" />
                <span>SMS Drip</span>
              </div>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-primary/20 text-primary font-medium">
                <Calendar className="h-3 w-3" />
                <span>+{estimatedAdditionalAppointments} Appts</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default DemoSecondaryCampaignCallout;
