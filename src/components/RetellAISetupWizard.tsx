import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRetellLLM } from '@/hooks/useRetellLLM';
import { useRetellAI } from '@/hooks/useRetellAI';
import { CheckCircle2, Circle } from 'lucide-react';

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

  const { createLLM, isLoading: llmLoading } = useRetellLLM();
  const { createAgent, isLoading: agentLoading } = useRetellAI();

  const handleCreateLLM = async () => {
    const llm = await createLLM(llmPrompt, llmBeginMessage, llmModel);
    if (llm) {
      setCreatedLLM(llm);
      setCurrentStep(2);
    }
  };

  const handleCreateAgent = async () => {
    if (!createdLLM) return;
    
    const agent = await createAgent(agentName, createdLLM.llm_id, agentVoice);
    if (agent) {
      setCreatedAgent(agent);
      setCurrentStep(3);
    }
  };

  const steps = [
    { number: 1, title: 'Create LLM', completed: !!createdLLM },
    { number: 2, title: 'Create Agent', completed: !!createdAgent },
    { number: 3, title: 'Complete', completed: !!createdAgent },
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
              <Textarea
                id="llm-prompt"
                value={llmPrompt}
                onChange={(e) => setLlmPrompt(e.target.value)}
                rows={4}
                placeholder="Instructions for how the AI should behave..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="begin-message">First Message</Label>
              <Input
                id="begin-message"
                value={llmBeginMessage}
                onChange={(e) => setLlmBeginMessage(e.target.value)}
                placeholder="What the AI says when answering the call"
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
              Create an agent that uses the LLM you just created
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
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="11labs-Adrian">Adrian (Male)</SelectItem>
                  <SelectItem value="11labs-Aria">Aria (Female)</SelectItem>
                  <SelectItem value="11labs-Sarah">Sarah (Female)</SelectItem>
                  <SelectItem value="11labs-Roger">Roger (Male)</SelectItem>
                </SelectContent>
              </Select>
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

      {/* Step 3: Complete */}
      {currentStep === 3 && createdAgent && (
        <Card>
          <CardHeader>
            <CardTitle>Setup Complete! 🎉</CardTitle>
            <CardDescription>
              Your Retell AI agent is ready to use
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm font-medium">LLM ID: {createdLLM?.llm_id}</p>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm font-medium">Agent ID: {createdAgent.agent_id}</p>
                <p className="text-sm text-muted-foreground mt-1">Name: {createdAgent.agent_name}</p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Next steps:
              </p>
              <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground">
                <li>Go to the "Phone Numbers" tab to import phone numbers</li>
                <li>Link your phone numbers to this agent</li>
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
