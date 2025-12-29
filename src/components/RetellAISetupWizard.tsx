import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { DynamicVariablesInput } from '@/components/ui/dynamic-variables-input';
import { useRetellLLM } from '@/hooks/useRetellLLM';
import { useRetellAI } from '@/hooks/useRetellAI';
import { useCalendarIntegration } from '@/hooks/useCalendarIntegration';
import { CheckCircle2, Circle, Copy, Calendar, ArrowRight, Loader2, Link, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// Webhook URL for call tracking - use retell-call-webhook which handles dynamic variables, transcript analysis, and workflows
const WEBHOOK_URL = 'https://emonjusymdripmkvtttc.supabase.co/functions/v1/retell-call-webhook';

interface RetellLLM {
  llm_id: string;
  general_prompt: string;
  begin_message: string;
  model: string;
}

interface Agent {
  agent_id: string;
  agent_name: string;
}

export const RetellAISetupWizard = () => {
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [llmPrompt, setLlmPrompt] = useState(
    "You are a helpful call center agent. Answer questions clearly and professionally. Keep responses concise."
  );
  const [llmBeginMessage, setLlmBeginMessage] = useState(
    "Hello! Thank you for calling. How can I help you today?"
  );
  const [llmModel, setLlmModel] = useState('gpt-4o');
  const [createdLLM, setCreatedLLM] = useState<RetellLLM | null>(null);
  
  const [agentName, setAgentName] = useState('');
  const [agentVoice, setAgentVoice] = useState('11labs-Adrian');
  const [createdAgent, setCreatedAgent] = useState<Agent | null>(null);
  const [isConnectingCalendar, setIsConnectingCalendar] = useState(false);

  const { createLLM, isLoading: llmLoading } = useRetellLLM();
  const { createAgent, isLoading: agentLoading } = useRetellAI();
  const { integrations, connectGoogleCalendar, isLoading: calendarLoading } = useCalendarIntegration();
  
  const googleIntegration = integrations.find(i => i.provider === 'google');

  const handleCreateLLM = async () => {
    const llm = await createLLM(llmPrompt, llmBeginMessage, llmModel);
    if (llm) {
      setCreatedLLM(llm);
      setCurrentStep(2);
    }
  };

  const handleCreateAgent = async () => {
    if (!createdLLM) return;
    
    // Create agent with webhook URL auto-configured
    const agent = await createAgent(agentName, createdLLM.llm_id, agentVoice, WEBHOOK_URL);
    if (agent) {
      setCreatedAgent(agent);
      setCurrentStep(3); // Go to calendar step
    }
  };

  const handleConnectGoogle = async () => {
    setIsConnectingCalendar(true);
    try {
      await connectGoogleCalendar();
      toast({
        title: 'Google Calendar Connected',
        description: 'Your calendar is now linked for scheduling.',
      });
    } catch (error: any) {
      toast({
        title: 'Connection Failed',
        description: error.message || 'Failed to connect Google Calendar',
        variant: 'destructive',
      });
    } finally {
      setIsConnectingCalendar(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copied!',
      description: `${label} copied to clipboard`,
    });
  };

  const steps = [
    { number: 1, title: 'Create LLM', completed: !!createdLLM },
    { number: 2, title: 'Create Agent', completed: !!createdAgent },
    { number: 3, title: 'Calendar', completed: !!googleIntegration },
    { number: 4, title: 'Complete', completed: !!createdAgent && currentStep === 4 },
  ];

  return (
    <div className="space-y-6">
      {/* Progress Steps */}
      <div className="flex items-center justify-between">
        {steps.map((step, index) => (
          <div key={step.number} className="flex items-center flex-1">
            <div className="flex flex-col items-center">
              <div className="flex items-center">
                {step.completed ? (
                  <CheckCircle2 className="w-8 h-8 text-green-500" />
                ) : (
                  <Circle className={`w-8 h-8 ${currentStep === step.number ? 'text-primary' : 'text-muted-foreground'}`} />
                )}
              </div>
              <span className={`text-sm mt-2 ${currentStep === step.number ? 'font-semibold' : 'text-muted-foreground'}`}>
                {step.title}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div className={`flex-1 h-1 mx-4 ${step.completed ? 'bg-green-500' : 'bg-muted'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Create LLM */}
      {currentStep === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Step 1: Create Retell LLM</CardTitle>
            <CardDescription>
              Configure the AI brain that will power your call center agent
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="llm-prompt">System Prompt</Label>
              <DynamicVariablesInput
                id="llm-prompt"
                value={llmPrompt}
                onChange={setLlmPrompt}
                multiline
                rows={6}
                placeholder="Instructions for how the AI should behave... Type {{ to insert dynamic variables!"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="begin-message">First Message</Label>
              <DynamicVariablesInput
                id="begin-message"
                value={llmBeginMessage}
                onChange={setLlmBeginMessage}
                placeholder="e.g., Hi {{first_name}}, this is Sarah calling..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="model">AI Model</Label>
              <Select value={llmModel} onValueChange={setLlmModel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gpt-4o">GPT-4o (Recommended)</SelectItem>
                  <SelectItem value="gpt-4o-mini">GPT-4o Mini (Faster)</SelectItem>
                  <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Not sure what to pick? Use <span className="font-semibold">GPT-4o</span> for best quality, or
                <span className="font-semibold"> GPT-4o Mini</span> if you care more about speed and cost.
              </p>
            </div>
 
            <Button 
              onClick={handleCreateLLM} 
              disabled={llmLoading || !llmPrompt || !llmBeginMessage}
              className="w-full"
            >
              {llmLoading ? 'Creating...' : 'Create LLM'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Create Agent */}
      {currentStep === 2 && createdLLM && (
        <Card>
          <CardHeader>
            <CardTitle>Step 2: Create Agent</CardTitle>
            <CardDescription>
              Create an agent that uses the LLM you just created. Webhook URL will be auto-configured.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm font-medium">Using LLM: {createdLLM.llm_id}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="agent-name">Agent Name</Label>
              <Input
                id="agent-name"
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                placeholder="e.g., Sales Agent, Support Agent"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="voice">Voice</Label>
              <Select value={agentVoice} onValueChange={setAgentVoice}>
                <SelectTrigger id="voice">
                  <SelectValue placeholder="Select a voice" />
                </SelectTrigger>
                <SelectContent position="popper" sideOffset={5}>
                  <SelectItem value="11labs-Adrian">Adrian (Male)</SelectItem>
                  <SelectItem value="11labs-Aria">Aria (Female)</SelectItem>
                  <SelectItem value="11labs-Sarah">Sarah (Female)</SelectItem>
                  <SelectItem value="11labs-Roger">Roger (Male)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                You can change this later. Adrian/Roger are male voices, Aria/Sarah are female — pick what feels right
                for your brand.
              </p>
            </div>

            {/* Webhook Auto-Config Notice */}
            <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <p className="text-sm font-medium text-green-800 dark:text-green-200 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Webhook will be auto-configured
              </p>
              <p className="text-xs text-green-600 dark:text-green-400 mt-1 font-mono break-all">
                {WEBHOOK_URL}
              </p>
            </div>

            <Button 
              onClick={handleCreateAgent} 
              disabled={agentLoading || !agentName}
              className="w-full"
            >
              {agentLoading ? 'Creating...' : 'Create Agent'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Calendar Integration */}
      {currentStep === 3 && createdAgent && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Step 3: Calendar Integration (Optional)
            </CardTitle>
            <CardDescription>
              Enable your AI agent to check availability and book appointments
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Connection Status */}
            {googleIntegration ? (
              <div className="p-4 bg-green-50 dark:bg-green-900/20 border-2 border-green-500 rounded-lg">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-8 w-8 text-green-500" />
                  <div>
                    <h4 className="font-semibold text-green-800 dark:text-green-200">
                      Google Calendar Connected!
                    </h4>
                    <p className="text-sm text-green-700 dark:text-green-300">
                      {googleIntegration.provider_account_email || 'Your calendar is linked'}
                    </p>
                  </div>
                </div>
                <Button 
                  onClick={() => setCurrentStep(4)}
                  className="w-full mt-4 gap-2"
                >
                  Continue to Complete Setup <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <>
                {/* Connect Button - Main Action */}
                <Card className="border-2 border-primary/50 bg-primary/5">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-4">
                      <div className="p-3 rounded-full bg-primary/20">
                        <Calendar className="h-8 w-8 text-primary" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg">Connect Google Calendar</h3>
                        <p className="text-sm text-muted-foreground">
                          Allow AI to check your availability and book appointments
                        </p>
                      </div>
                    </div>
                    <Button 
                      onClick={handleConnectGoogle}
                      disabled={isConnectingCalendar || calendarLoading}
                      className="w-full mt-4 gap-2"
                      size="lg"
                    >
                      {isConnectingCalendar ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Connecting...
                        </>
                      ) : (
                        <>
                          <Link className="h-4 w-4" />
                          Connect Google Calendar
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>

                <div className="text-center text-sm text-muted-foreground">or</div>

                {/* Skip Option */}
                <Button 
                  variant="outline"
                  onClick={() => setCurrentStep(4)}
                  className="w-full gap-2"
                >
                  Skip for Now <ArrowRight className="h-4 w-4" />
                </Button>

                <p className="text-xs text-center text-muted-foreground">
                  You can always connect your calendar later from Settings → Calendar
                </p>
              </>
            )}

            {/* What it does - collapsed for connected users */}
            {!googleIntegration && (
              <div className="p-4 bg-muted rounded-lg space-y-3">
                <h4 className="font-semibold text-sm">What Calendar Integration Does:</h4>
                <ul className="text-sm text-muted-foreground space-y-2">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                    <span>AI checks your availability before suggesting times</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                    <span>Automatically creates calendar events for appointments</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                    <span>Sends reminders before scheduled callbacks</span>
                  </li>
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 4: Complete */}
      {currentStep === 4 && createdAgent && (
        <Card>
          <CardHeader>
            <CardTitle>Setup Complete! 🎉</CardTitle>
            <CardDescription>
              Your Retell AI agent is ready to use with webhooks configured
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="p-4 bg-muted rounded-lg flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">LLM ID: {createdLLM?.llm_id}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(createdLLM?.llm_id || '', 'LLM ID')}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <div className="p-4 bg-muted rounded-lg flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Agent ID: {createdAgent.agent_id}</p>
                  <p className="text-sm text-muted-foreground mt-1">Name: {createdAgent.agent_name}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(createdAgent.agent_id, 'Agent ID')}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Webhook URL with copy button */}
            <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-green-800 dark:text-green-200 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Webhook URL (Auto-configured)
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(WEBHOOK_URL, 'Webhook URL')}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-green-600 dark:text-green-400 font-mono break-all">
                {WEBHOOK_URL}
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Next steps:
              </p>
              <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground">
                <li>Go to the "Phone Numbers" tab to import phone numbers</li>
                <li>Link your phone numbers to this agent</li>
                <li>Set up Calendar integration if you haven't already</li>
                <li>Start making calls!</li>
              </ul>
            </div>

            <Button 
              onClick={() => {
                setCurrentStep(1);
                setCreatedLLM(null);
                setCreatedAgent(null);
                setAgentName('');
              }}
              variant="outline"
              className="w-full"
            >
              Create Another Agent
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};