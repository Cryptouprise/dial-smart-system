import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  Phone, Bot, Users, Zap, CheckCircle2, ArrowRight, ArrowLeft, 
  ChevronDown, SkipForward, Sparkles, Rocket, Info
} from 'lucide-react';
import PhoneNumberPurchasing from '@/components/dialing/PhoneNumberPurchasing';
import { RetellAISetupWizard } from '@/components/integrations/RetellAISetupWizard';
import { LeadUpload } from '@/components/leads/LeadUpload';
import { useToast } from '@/hooks/use-toast';

interface QuickStartWizardProps {
  onComplete?: () => void;
  onSkip?: () => void;
}

const STEPS = [
  {
    id: 'phone_numbers',
    number: 1,
    title: 'Get Phone Numbers',
    subtitle: 'Numbers your leads will see',
    icon: Phone,
    tip: 'Start with 3-5 numbers for rotation',
  },
  {
    id: 'ai_agent',
    number: 2,
    title: 'Create AI Agent',
    subtitle: 'The voice that makes your calls',
    icon: Bot,
    tip: 'Follow the 3-step wizard to set up your agent',
  },
  {
    id: 'leads',
    number: 3,
    title: 'Add Leads',
    subtitle: 'Who do you want to call?',
    icon: Users,
    tip: 'Upload a CSV or add leads manually',
  },
  {
    id: 'launch',
    number: 4,
    title: 'Launch!',
    subtitle: 'Start your first campaign',
    icon: Rocket,
    tip: 'You\'re ready to make calls',
  },
];

export const QuickStartWizard: React.FC<QuickStartWizardProps> = ({ onComplete, onSkip }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [showHelp, setShowHelp] = useState(false);
  const { toast } = useToast();

  const step = STEPS[currentStep];
  const progress = ((currentStep) / STEPS.length) * 100;

  const handleComplete = () => {
    setCompletedSteps(prev => new Set([...prev, step.id]));
    
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
      toast({
        title: `✓ ${step.title} complete!`,
        description: `Moving to: ${STEPS[currentStep + 1].title}`,
      });
    } else {
      // Final step - go to dashboard
      toast({
        title: '🎉 Setup Complete!',
        description: 'Your dialer is ready to make calls.',
      });
      if (onComplete) {
        onComplete();
      } else {
        window.location.href = '/?tab=campaigns';
      }
    }
  };

  const handleSkipStep = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      handleComplete();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const renderStepContent = () => {
    switch (step.id) {
      case 'phone_numbers':
        return (
          <div className="space-y-4">
            <PhoneNumberPurchasing />
          </div>
        );

      case 'ai_agent':
        return (
          <div className="space-y-4">
            <RetellAISetupWizard />
          </div>
        );

      case 'leads':
        return (
          <div className="space-y-4">
            <LeadUpload />
          </div>
        );

      case 'launch':
        return (
          <div className="space-y-6">
            {/* Summary of what's done */}
            <div className="grid gap-3">
              {STEPS.slice(0, -1).map((s) => {
                const isCompleted = completedSteps.has(s.id);
                const Icon = s.icon;
                return (
                  <div 
                    key={s.id} 
                    className={`flex items-center gap-3 p-3 rounded-lg border ${
                      isCompleted 
                        ? 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800' 
                        : 'bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800'
                    }`}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : (
                      <SkipForward className="h-5 w-5 text-amber-600" />
                    )}
                    <Icon className="h-5 w-5 text-muted-foreground" />
                    <span className="font-medium">{s.title}</span>
                    <Badge variant={isCompleted ? 'default' : 'secondary'} className="ml-auto">
                      {isCompleted ? 'Done' : 'Skipped'}
                    </Badge>
                  </div>
                );
              })}
            </div>

            {/* Next steps */}
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
              <h4 className="font-semibold text-primary mb-2">What happens next?</h4>
              <ul className="text-sm space-y-2 text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">1.</span>
                  <span>Go to <strong>AI Campaigns</strong> to create your first campaign</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">2.</span>
                  <span>Select your AI agent and add leads</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">3.</span>
                  <span>Click <strong>Launch</strong> and watch the calls happen!</span>
                </li>
              </ul>
            </div>

            <Button onClick={handleComplete} size="lg" className="w-full gap-2">
              <Rocket className="h-5 w-5" />
              Go to Campaigns & Start Calling
            </Button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Card className="w-full max-w-4xl mx-auto">
      {/* Header with progress */}
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-full ${step.id === 'launch' ? 'bg-green-100 dark:bg-green-900' : 'bg-primary/10'}`}>
              <step.icon className={`h-5 w-5 ${step.id === 'launch' ? 'text-green-600' : 'text-primary'}`} />
            </div>
            <div>
              <CardTitle className="text-xl">{step.title}</CardTitle>
              <CardDescription>{step.subtitle}</CardDescription>
            </div>
          </div>
          <Badge variant="outline" className="text-sm">
            Step {step.number} of {STEPS.length}
          </Badge>
        </div>
        
        {/* Progress bar */}
        <div className="space-y-1">
          <Progress value={progress} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            {STEPS.map((s, i) => (
              <span 
                key={s.id} 
                className={`${i <= currentStep ? 'text-primary font-medium' : ''}`}
              >
                {s.title.split(' ')[0]}
              </span>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Collapsible help section */}
        {step.id !== 'launch' && (
          <Collapsible open={showHelp} onOpenChange={setShowHelp}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-between text-muted-foreground">
                <span className="flex items-center gap-2">
                  <Info className="h-4 w-4" />
                  {showHelp ? 'Hide help' : 'Need help with this step?'}
                </span>
                <ChevronDown className={`h-4 w-4 transition-transform ${showHelp ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <div className="bg-muted/50 rounded-lg p-4 text-sm">
                <p className="text-muted-foreground">
                  💡 <strong>Tip:</strong> {step.tip}
                </p>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Main content */}
        <div className="min-h-[300px]">
          {renderStepContent()}
        </div>

        {/* Footer navigation */}
        {step.id !== 'launch' && (
          <div className="flex items-center justify-between pt-4 border-t">
            <div className="flex gap-2">
              {currentStep > 0 && (
                <Button variant="outline" onClick={handleBack} className="gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={handleSkipStep}>
                Skip for now
              </Button>
              <Button onClick={handleComplete} className="gap-2">
                Done, Next Step
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default QuickStartWizard;
