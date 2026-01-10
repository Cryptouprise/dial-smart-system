import React from 'react';
import { CheckCircle2, Circle, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Step {
  id: string;
  label: string;
  status: 'complete' | 'current' | 'pending' | 'error';
  errorMessage?: string;
}

interface BroadcastStepIndicatorProps {
  hasAudio: boolean;
  hasLeads: boolean;
  isGeneratingAudio?: boolean;
}

export const BroadcastStepIndicator: React.FC<BroadcastStepIndicatorProps> = ({
  hasAudio,
  hasLeads,
  isGeneratingAudio = false,
}) => {
  const steps: Step[] = [
    {
      id: 'create',
      label: 'Created',
      status: 'complete',
    },
    {
      id: 'audio',
      label: 'Audio',
      status: isGeneratingAudio ? 'current' : hasAudio ? 'complete' : 'pending',
      errorMessage: !hasAudio ? 'Generate audio to continue' : undefined,
    },
    {
      id: 'leads',
      label: 'Leads',
      status: hasLeads ? 'complete' : hasAudio ? 'pending' : 'pending',
      errorMessage: !hasLeads ? 'Add leads to queue' : undefined,
    },
    {
      id: 'ready',
      label: 'Ready',
      status: hasAudio && hasLeads ? 'complete' : 'pending',
    },
  ];

  const getStepIcon = (step: Step) => {
    switch (step.status) {
      case 'complete':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'current':
        return <Loader2 className="h-4 w-4 text-primary animate-spin" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      default:
        return <Circle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="flex items-center gap-1 text-xs">
      {steps.map((step, index) => (
        <React.Fragment key={step.id}>
          <div 
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-full",
              step.status === 'complete' && "bg-green-500/10",
              step.status === 'current' && "bg-primary/10",
              step.status === 'pending' && "bg-muted",
              step.status === 'error' && "bg-destructive/10"
            )}
            title={step.errorMessage}
          >
            {getStepIcon(step)}
            <span className={cn(
              "font-medium",
              step.status === 'complete' && "text-green-600",
              step.status === 'current' && "text-primary",
              step.status === 'pending' && "text-muted-foreground",
              step.status === 'error' && "text-destructive"
            )}>
              {step.label}
            </span>
          </div>
          {index < steps.length - 1 && (
            <div className={cn(
              "h-0.5 w-3",
              steps[index + 1].status === 'complete' || step.status === 'complete' 
                ? "bg-green-500/50" 
                : "bg-muted-foreground/20"
            )} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

export default BroadcastStepIndicator;
