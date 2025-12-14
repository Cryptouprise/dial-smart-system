import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Phone, MessageSquare, Clock, GitBranch, Sparkles, 
  ArrowDown, CheckCircle2, AlertCircle
} from 'lucide-react';

interface WorkflowStep {
  step_number: number;
  step_type: string;
  step_config: Record<string, any>;
}

interface WorkflowPreviewProps {
  steps: WorkflowStep[];
  workflowName?: string;
  compact?: boolean;
}

const STEP_ICONS: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  call: { icon: Phone, color: 'bg-blue-500', label: 'Call' },
  sms: { icon: MessageSquare, color: 'bg-green-500', label: 'SMS' },
  ai_sms: { icon: Sparkles, color: 'bg-purple-500', label: 'AI SMS' },
  wait: { icon: Clock, color: 'bg-orange-500', label: 'Wait' },
  condition: { icon: GitBranch, color: 'bg-yellow-500', label: 'Condition' },
};

export const WorkflowPreview: React.FC<WorkflowPreviewProps> = ({ 
  steps, 
  workflowName,
  compact = false 
}) => {
  if (!steps || steps.length === 0) {
    return (
      <div className="flex items-center justify-center p-4 text-muted-foreground">
        <AlertCircle className="h-4 w-4 mr-2" />
        No steps defined
      </div>
    );
  }

  const formatDelay = (config: Record<string, any>) => {
    const parts = [];
    if (config.delay_days) parts.push(`${config.delay_days}d`);
    if (config.delay_hours) parts.push(`${config.delay_hours}h`);
    if (config.delay_minutes) parts.push(`${config.delay_minutes}m`);
    return parts.length > 0 ? parts.join(' ') : 'Immediate';
  };

  const getStepDescription = (step: WorkflowStep) => {
    const config = step.step_config || {};
    switch (step.step_type) {
      case 'call':
        return config.max_attempts > 1 
          ? `Up to ${config.max_attempts} attempts` 
          : 'Single attempt';
      case 'sms':
        return config.sms_content?.substring(0, 30) + (config.sms_content?.length > 30 ? '...' : '') || 'Template SMS';
      case 'ai_sms':
        return 'AI-generated response';
      case 'wait':
        return formatDelay(config);
      case 'condition':
        return `If ${config.condition_type || 'disposition'}`;
      default:
        return step.step_type;
    }
  };

  if (compact) {
    return (
      <div className="flex items-center gap-1 flex-wrap">
        {steps.map((step, index) => {
          const stepInfo = STEP_ICONS[step.step_type] || STEP_ICONS.wait;
          const Icon = stepInfo.icon;
          return (
            <React.Fragment key={index}>
              <Badge variant="outline" className={`${stepInfo.color} text-white border-none text-xs`}>
                <Icon className="h-3 w-3 mr-1" />
                {stepInfo.label}
              </Badge>
              {index < steps.length - 1 && (
                <ArrowDown className="h-3 w-3 text-muted-foreground rotate-[-90deg]" />
              )}
            </React.Fragment>
          );
        })}
      </div>
    );
  }

  return (
    <Card className="border-dashed">
      <CardContent className="p-4">
        {workflowName && (
          <h4 className="font-medium mb-3">{workflowName}</h4>
        )}
        <div className="relative">
          {steps.map((step, index) => {
            const stepInfo = STEP_ICONS[step.step_type] || STEP_ICONS.wait;
            const Icon = stepInfo.icon;
            const isLast = index === steps.length - 1;
            
            return (
              <div key={index} className="flex items-start gap-3 relative">
                {/* Connector line */}
                {!isLast && (
                  <div className="absolute left-4 top-8 w-0.5 h-8 bg-border" />
                )}
                
                {/* Step icon */}
                <div className={`${stepInfo.color} p-2 rounded-full text-white z-10`}>
                  <Icon className="h-4 w-4" />
                </div>
                
                {/* Step content */}
                <div className="flex-1 pb-6">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">
                      Step {step.step_number}: {stepInfo.label}
                    </span>
                    {step.step_type === 'wait' && (
                      <Badge variant="secondary" className="text-xs">
                        {formatDelay(step.step_config)}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {getStepDescription(step)}
                  </p>
                </div>
              </div>
            );
          })}
          
          {/* End marker */}
          <div className="flex items-center gap-3">
            <div className="bg-green-500 p-2 rounded-full text-white">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <span className="text-sm text-muted-foreground">Workflow Complete</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
