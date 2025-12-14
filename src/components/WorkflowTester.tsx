import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { 
  Play, 
  CheckCircle, 
  AlertCircle, 
  Clock, 
  DollarSign, 
  Loader2,
  AlertTriangle,
  Lightbulb,
  XCircle,
  FileText
} from 'lucide-react';

interface WorkflowTesterProps {
  open: boolean;
  workflow: any;
  onClose: () => void;
  onTestComplete?: (results: any) => void;
}

interface TestResults {
  testId: string;
  status: string;
  results: {
    totalSteps: number;
    successfulSteps: number;
    failedSteps: number;
    skippedSteps: number;
    totalDuration: string;
    simulatedDuration: string;
    estimatedCost: number;
  };
  stepResults: Array<{
    stepNumber: number;
    stepType: string;
    status: string;
    duration: string;
    details: string;
    timestamp: string;
    cost?: number;
    error?: string;
  }>;
  warnings: Array<{
    severity: string;
    message: string;
    suggestion: string;
    steps?: number[];
  }>;
  recommendations: Array<{
    type: string;
    message: string;
    impact: string;
    steps?: number[];
  }>;
  errors?: string[];
}

export const WorkflowTester: React.FC<WorkflowTesterProps> = ({
  open,
  workflow,
  onClose,
  onTestComplete,
}) => {
  const [testPhoneNumber, setTestPhoneNumber] = useState('');
  const [mode, setMode] = useState<'simulation' | 'real'>('simulation');
  const [speed, setSpeed] = useState<'realtime' | 'fast'>('fast');
  const [isTesting, setIsTesting] = useState(false);
  const [testResults, setTestResults] = useState<TestResults | null>(null);
  const [activeTab, setActiveTab] = useState('config');
  const { toast } = useToast();

  const runTest = async () => {
    if (mode === 'real' && !testPhoneNumber) {
      toast({
        title: 'Phone Number Required',
        description: 'Please enter a test phone number for real execution mode',
        variant: 'destructive',
      });
      return;
    }

    setIsTesting(true);
    setTestResults(null);
    setActiveTab('running');

    try {
      const { data, error } = await supabase.functions.invoke('test-workflow', {
        body: {
          workflow,
          testPhoneNumber: testPhoneNumber || undefined,
          mode,
          speed,
        },
      });

      if (error) throw error;

      if (data.errors && data.errors.length > 0) {
        toast({
          title: 'Validation Failed',
          description: `${data.errors.length} error(s) found in workflow`,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Test Complete',
          description: `${data.results.successfulSteps}/${data.results.totalSteps} steps successful`,
        });
      }

      setTestResults(data);
      setActiveTab('results');
      onTestComplete?.(data);

    } catch (error: any) {
      console.error('Test error:', error);
      toast({
        title: 'Test Failed',
        description: error.message || 'An error occurred during testing',
        variant: 'destructive',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const resetTest = () => {
    setTestResults(null);
    setActiveTab('config');
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'skipped':
        return <AlertCircle className="h-5 w-5 text-gray-400" />;
      default:
        return <Clock className="h-5 w-5 text-blue-500" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high':
        return 'border-red-200 bg-red-50 dark:bg-red-950';
      case 'medium':
        return 'border-orange-200 bg-orange-50 dark:bg-orange-950';
      case 'low':
        return 'border-yellow-200 bg-yellow-50 dark:bg-yellow-950';
      default:
        return 'border-gray-200 bg-gray-50';
    }
  };

  const getRecommendationIcon = (type: string) => {
    switch (type) {
      case 'cost-saving':
        return <DollarSign className="h-5 w-5 text-green-600" />;
      case 'optimization':
        return <Lightbulb className="h-5 w-5 text-blue-600" />;
      case 'enhancement':
        return <AlertTriangle className="h-5 w-5 text-purple-600" />;
      default:
        return <Lightbulb className="h-5 w-5" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <Play className="h-5 w-5" />
            Test Workflow: {workflow?.name || 'Untitled'}
          </DialogTitle>
          <DialogDescription>
            Validate and test your workflow before deploying to real leads
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="config">Configuration</TabsTrigger>
            <TabsTrigger value="running" disabled={!isTesting && !testResults}>
              {isTesting ? 'Testing...' : 'Test Progress'}
            </TabsTrigger>
            <TabsTrigger value="results" disabled={!testResults}>Results</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-hidden mt-2">
            {/* Configuration Tab */}
            <TabsContent value="config" className="h-full overflow-y-auto mt-4">
              <div className="space-y-6 pb-4">
                <div>
                  <Label htmlFor="test-phone">Test Phone Number (Optional)</Label>
                  <Input
                    id="test-phone"
                    placeholder="+1234567890"
                    value={testPhoneNumber}
                    onChange={(e) => setTestPhoneNumber(e.target.value)}
                    className="mt-2"
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    Required for real execution mode. Leave blank for simulation.
                  </p>
                </div>

                <div>
                  <Label>Test Mode</Label>
                  <RadioGroup value={mode} onValueChange={(v: any) => setMode(v)} className="mt-2">
                    <div className="flex items-start space-x-2 p-3 border rounded-lg">
                      <RadioGroupItem value="simulation" id="simulation" className="mt-1" />
                      <div className="flex-1">
                        <Label htmlFor="simulation" className="font-medium cursor-pointer">
                          Simulation Mode (Recommended)
                        </Label>
                        <p className="text-sm text-muted-foreground mt-1">
                          No real calls or SMS sent. Instant results with cost estimates and recommendations.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-2 p-3 border rounded-lg">
                      <RadioGroupItem value="real" id="real" className="mt-1" />
                      <div className="flex-1">
                        <Label htmlFor="real" className="font-medium cursor-pointer">
                          Real Execution Mode
                        </Label>
                        <p className="text-sm text-muted-foreground mt-1">
                          Actual calls and SMS sent to test number. Costs will be incurred.
                        </p>
                      </div>
                    </div>
                  </RadioGroup>
                </div>

                <div>
                  <Label>Execution Speed</Label>
                  <RadioGroup value={speed} onValueChange={(v: any) => setSpeed(v)} className="mt-2">
                    <div className="flex items-start space-x-2 p-3 border rounded-lg">
                      <RadioGroupItem value="fast" id="fast" className="mt-1" />
                      <div className="flex-1">
                        <Label htmlFor="fast" className="font-medium cursor-pointer">
                          Fast-Forward (Recommended)
                        </Label>
                        <p className="text-sm text-muted-foreground mt-1">
                          Skip wait times for instant results
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-2 p-3 border rounded-lg">
                      <RadioGroupItem value="realtime" id="realtime" className="mt-1" />
                      <div className="flex-1">
                        <Label htmlFor="realtime" className="font-medium cursor-pointer">
                          Real-Time
                        </Label>
                        <p className="text-sm text-muted-foreground mt-1">
                          Execute with actual wait times (capped at 5 seconds per wait)
                        </p>
                      </div>
                    </div>
                  </RadioGroup>
                </div>

                <div className="flex items-start gap-2 p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-blue-900 dark:text-blue-100">
                    <strong>Tip:</strong> Start with Simulation mode to validate your workflow structure and get cost estimates before testing with real execution.
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Running Tab */}
            <TabsContent value="running" className="h-full flex items-center justify-center mt-4">
              <div className="text-center space-y-4">
                <Loader2 className="h-16 w-16 animate-spin text-primary mx-auto" />
                <div>
                  <h3 className="text-lg font-semibold">Testing Workflow...</h3>
                  <p className="text-muted-foreground">
                    Executing {workflow?.steps?.length || 0} steps in {mode} mode
                  </p>
                </div>
              </div>
            </TabsContent>

            {/* Results Tab */}
            <TabsContent value="results" className="h-full overflow-y-auto mt-4">
              {testResults && (
                <div className="space-y-6 pb-4">
                  {/* Validation Errors */}
                  {testResults.errors && testResults.errors.length > 0 && (
                    <Card className="border-red-200 bg-red-50 dark:bg-red-950">
                      <CardHeader>
                        <CardTitle className="text-red-900 dark:text-red-100 flex items-center gap-2">
                          <XCircle className="h-5 w-5" />
                          Validation Errors
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ul className="space-y-2">
                          {testResults.errors.map((error, index) => (
                            <li key={index} className="text-sm text-red-800 dark:text-red-200">
                              • {error}
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  )}

                  {/* Success Banner */}
                  {testResults.status === 'completed' && testResults.results.failedSteps === 0 && (
                    <Card className="border-green-300 bg-green-50 dark:bg-green-950">
                      <CardContent className="pt-6 pb-4">
                        <div className="flex items-center gap-4">
                          <div className="p-3 bg-green-100 dark:bg-green-900 rounded-full">
                            <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
                          </div>
                          <div className="flex-1">
                            <h3 className="text-lg font-semibold text-green-800 dark:text-green-200">
                              Workflow Test Passed!
                            </h3>
                            <p className="text-sm text-green-700 dark:text-green-300">
                              All {testResults.results.successfulSteps} steps executed successfully. 
                              Your workflow is ready to use with real leads.
                            </p>
                            <div className="flex gap-4 mt-2 text-xs text-green-600 dark:text-green-400">
                              <span>✓ {workflow?.steps?.filter(s => s.step_type === 'call').length || 0} calls configured</span>
                              <span>✓ {workflow?.steps?.filter(s => s.step_type === 'sms' || s.step_type === 'ai_sms').length || 0} SMS messages</span>
                              <span>✓ Est. ${testResults.results.estimatedCost.toFixed(2)}/lead</span>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Summary Stats */}
                  {testResults.status === 'completed' && (
                    <>
                      <div className="grid grid-cols-4 gap-4">
                        <Card>
                          <CardContent className="pt-6">
                            <div className="text-3xl font-bold text-green-600">
                              {testResults.results.successfulSteps}
                            </div>
                            <div className="text-sm text-muted-foreground">Successful</div>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardContent className="pt-6">
                            <div className="text-3xl font-bold text-red-600">
                              {testResults.results.failedSteps}
                            </div>
                            <div className="text-sm text-muted-foreground">Failed</div>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardContent className="pt-6">
                            <div className="text-3xl font-bold flex items-center gap-1">
                              <DollarSign className="h-6 w-6" />
                              {testResults.results.estimatedCost.toFixed(2)}
                            </div>
                            <div className="text-sm text-muted-foreground">Est. Cost/Lead</div>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardContent className="pt-6">
                            <div className="text-2xl font-bold">
                              {testResults.results.totalDuration}
                            </div>
                            <div className="text-sm text-muted-foreground">Total Duration</div>
                          </CardContent>
                        </Card>
                      </div>

                      {/* Step Results */}
                      <Card>
                        <CardHeader>
                          <CardTitle>Step-by-Step Results</CardTitle>
                          <CardDescription>
                            Detailed execution log for each workflow step
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <ScrollArea className="h-[300px] pr-4">
                            <div className="space-y-3">
                              {testResults.stepResults.map((step, index) => (
                                <div
                                  key={index}
                                  className={`flex items-start gap-3 p-3 border rounded-lg ${
                                    step.status === 'failed' ? 'border-red-200 bg-red-50 dark:bg-red-950' : ''
                                  }`}
                                >
                                  {getStatusIcon(step.status)}
                                  
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-medium">
                                        Step {step.stepNumber}: {step.stepType}
                                      </span>
                                      <Badge variant={step.status === 'success' ? 'default' : step.status === 'failed' ? 'destructive' : 'secondary'}>
                                        {step.status}
                                      </Badge>
                                      <span className="text-sm text-muted-foreground">
                                        {step.duration}
                                      </span>
                                      {step.cost !== undefined && step.cost > 0 && (
                                        <Badge variant="outline" className="text-xs">
                                          ${step.cost.toFixed(4)}
                                        </Badge>
                                      )}
                                    </div>
                                    
                                    <p className="text-sm text-muted-foreground mt-1">
                                      {step.details}
                                    </p>
                                    
                                    {step.error && (
                                      <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                                        Error: {step.error}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                        </CardContent>
                      </Card>

                      {/* Warnings */}
                      {testResults.warnings.length > 0 && (
                        <Card>
                          <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-orange-600">
                              <AlertTriangle className="h-5 w-5" />
                              Warnings ({testResults.warnings.length})
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-3">
                              {testResults.warnings.map((warning, index) => (
                                <div
                                  key={index}
                                  className={`p-4 border rounded-lg ${getSeverityColor(warning.severity)}`}
                                >
                                  <div className="flex items-start gap-2">
                                    <Badge variant="outline" className="mt-0.5">
                                      {warning.severity}
                                    </Badge>
                                    <div className="flex-1">
                                      <div className="font-medium">{warning.message}</div>
                                      <p className="text-sm text-muted-foreground mt-1">
                                        💡 {warning.suggestion}
                                      </p>
                                      {warning.steps && warning.steps.length > 0 && (
                                        <p className="text-xs text-muted-foreground mt-1">
                                          Affects steps: {warning.steps.join(', ')}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      {/* Recommendations */}
                      {testResults.recommendations.length > 0 && (
                        <Card>
                          <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-blue-600">
                              <Lightbulb className="h-5 w-5" />
                              Optimization Recommendations ({testResults.recommendations.length})
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-3">
                              {testResults.recommendations.map((rec, index) => (
                                <div
                                  key={index}
                                  className="p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg"
                                >
                                  <div className="flex items-start gap-3">
                                    {getRecommendationIcon(rec.type)}
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium">{rec.message}</span>
                                        <Badge variant="outline" className="text-xs">
                                          {rec.type}
                                        </Badge>
                                      </div>
                                      <p className="text-sm text-muted-foreground mt-1">
                                        📈 {rec.impact}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </>
                  )}
                </div>
              )}
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter className="flex-shrink-0">
          {!testResults ? (
            <>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={runTest} disabled={isTesting}>
                {isTesting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Testing...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Run Test
                  </>
                )}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
              <Button onClick={resetTest}>
                Run Another Test
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
