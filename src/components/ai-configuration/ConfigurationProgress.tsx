import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { 
  CheckCircle2, XCircle, Loader2, Clock, Sparkles,
  Phone, MessageSquare, Settings, User, AlertTriangle
} from 'lucide-react';

export interface ConfigurationStep {
  id: string;
  type: 'campaign' | 'agent' | 'workflow' | 'setting';
  action: string;
  name: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  message?: string;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

export interface ConfigurationResult {
  success: boolean;
  steps: ConfigurationStep[];
  totalTime: number;
  errors?: string[];
  createdResources?: Record<string, any>;
}

interface ConfigurationProgressProps {
  open: boolean;
  steps: ConfigurationStep[];
  onClose: () => void;
  onComplete?: (result: ConfigurationResult) => void;
}

const getStepIcon = (type: string, status: string) => {
  if (status === 'completed') return <CheckCircle2 className="h-5 w-5 text-green-500" />;
  if (status === 'failed') return <XCircle className="h-5 w-5 text-red-500" />;
  if (status === 'in_progress') return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
  
  switch (type) {
    case 'campaign':
      return <Phone className="h-5 w-5 text-muted-foreground" />;
    case 'agent':
      return <User className="h-5 w-5 text-muted-foreground" />;
    case 'workflow':
      return <MessageSquare className="h-5 w-5 text-muted-foreground" />;
    case 'setting':
      return <Settings className="h-5 w-5 text-muted-foreground" />;
    default:
      return <Sparkles className="h-5 w-5 text-muted-foreground" />;
  }
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'completed':
      return <Badge className="bg-green-500">Completed</Badge>;
    case 'failed':
      return <Badge className="bg-red-500">Failed</Badge>;
    case 'in_progress':
      return <Badge className="bg-blue-500">In Progress</Badge>;
    case 'pending':
      return <Badge variant="outline">Pending</Badge>;
    default:
      return null;
  }
};

export const ConfigurationProgress: React.FC<ConfigurationProgressProps> = ({
  open,
  steps,
  onClose,
  onComplete
}) => {
  const [startTime] = useState(Date.now());
  const [elapsedTime, setElapsedTime] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime]);

  const completedSteps = steps.filter(s => s.status === 'completed').length;
  const failedSteps = steps.filter(s => s.status === 'failed').length;
  const totalSteps = steps.length;
  const progress = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;
  const allComplete = completedSteps + failedSteps === totalSteps;
  const hasErrors = failedSteps > 0;

  useEffect(() => {
    if (allComplete && onComplete) {
      const result: ConfigurationResult = {
        success: !hasErrors,
        steps,
        totalTime: elapsedTime,
        errors: steps.filter(s => s.error).map(s => s.error!),
        createdResources: {}
      };
      onComplete(result);
    }
  }, [allComplete, hasErrors, steps, elapsedTime, onComplete]);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && allComplete && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {allComplete ? (
              hasErrors ? (
                <>
                  <AlertTriangle className="h-6 w-6 text-yellow-500" />
                  Configuration Completed with Errors
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-6 w-6 text-green-500" />
                  Configuration Complete!
                </>
              )
            ) : (
              <>
                <Loader2 className="h-6 w-6 text-primary animate-spin" />
                Configuring Your System...
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {allComplete
              ? `Completed in ${elapsedTime} seconds`
              : `This may take a few moments. Please don't close this window.`
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Overall Progress */}
          <Card>
            <CardContent className="p-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Progress</p>
                      <p className="text-2xl font-bold">
                        {completedSteps}/{totalSteps}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Time</p>
                      <p className="text-2xl font-bold flex items-center gap-1">
                        <Clock className="h-5 w-5" />
                        {elapsedTime}s
                      </p>
                    </div>
                  </div>
                  {hasErrors && (
                    <Badge variant="destructive" className="text-lg px-4 py-2">
                      {failedSteps} Failed
                    </Badge>
                  )}
                </div>
                <Progress value={progress} className="h-3" />
                <p className="text-sm text-muted-foreground text-center">
                  {progress.toFixed(0)}% Complete
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Step-by-Step Progress */}
          <div className="space-y-2">
            {steps.map((step, idx) => (
              <Card 
                key={step.id} 
                className={`transition-all ${
                  step.status === 'in_progress' ? 'ring-2 ring-primary' : ''
                } ${
                  step.status === 'failed' ? 'border-red-500' : ''
                }`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      {getStepIcon(step.type, step.status)}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-sm text-muted-foreground">
                          {idx + 1}.
                        </span>
                        <span className="font-semibold truncate">{step.name}</span>
                        {getStatusBadge(step.status)}
                      </div>
                      
                      <p className="text-sm text-muted-foreground capitalize mb-1">
                        {step.action} {step.type}
                      </p>
                      
                      {step.message && (
                        <p className="text-sm text-muted-foreground italic">
                          {step.message}
                        </p>
                      )}
                      
                      {step.error && (
                        <div className="mt-2 p-2 bg-red-50 dark:bg-red-950 rounded border border-red-200 dark:border-red-800">
                          <p className="text-sm text-red-600 dark:text-red-400">
                            ⚠️ {step.error}
                          </p>
                        </div>
                      )}
                      
                      {step.status === 'in_progress' && (
                        <div className="mt-2">
                          <Progress value={undefined} className="h-1" />
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Summary */}
          {allComplete && (
            <Card className={hasErrors ? 'bg-yellow-50 dark:bg-yellow-950' : 'bg-green-50 dark:bg-green-950'}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  {hasErrors ? (
                    <AlertTriangle className="h-6 w-6 text-yellow-600 mt-0.5" />
                  ) : (
                    <CheckCircle2 className="h-6 w-6 text-green-600 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <h4 className="font-semibold mb-2">
                      {hasErrors ? 'Configuration Completed with Issues' : 'All Done!'}
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      {hasErrors
                        ? `${completedSteps} steps completed successfully, ${failedSteps} failed. Please review the errors above.`
                        : `Successfully configured ${completedSteps} items in ${elapsedTime} seconds. Your system is ready to use!`
                      }
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {allComplete && (
          <div className="flex justify-end gap-2">
            <Button onClick={onClose}>
              {hasErrors ? 'Close' : 'Done'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ConfigurationProgress;
