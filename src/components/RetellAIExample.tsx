/**
 * Example component demonstrating the comprehensive Retell AI integration
 * This shows how to build an AI agent programmatically from a description
 */

import { useState } from 'react';
import { useRetellService } from '@/hooks/useRetellService';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

export function RetellAIExample() {
  const retell = useRetellService();
  const [agentDescription, setAgentDescription] = useState('');
  const [agentName, setAgentName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [createdAgent, setCreatedAgent] = useState<{
    agentId: string;
    llmId: string;
    phoneNumber?: string;
  } | null>(null);

  const buildAgent = async () => {
    if (!agentDescription || !agentName) {
      return;
    }

    // Step 1: Create the LLM with the description as the prompt
    const llm = await retell.createRetellLLM({
      general_prompt: agentDescription,
      begin_message: 'Hello! How can I assist you today?',
      model: 'gpt-4o',
      temperature: 0.7,
    });

    if (!llm) return;

    // Step 2: Create the agent with the LLM
    const agent = await retell.createAgent({
      agent_name: agentName,
      voice_id: '11labs-Adrian',
      response_engine: {
        type: 'retell-llm',
        llm_id: llm.llm_id,
      },
      enable_backchannel: true,
      responsiveness: 1.0,
    });

    if (!agent) return;

    // Step 3: Optionally import a phone number
    let phoneNum = undefined;
    if (phoneNumber) {
      const importedNumber = await retell.importPhoneNumber({
        phone_number: phoneNumber,
        termination_uri: 'sip:example.pstn.twilio.com',
        inbound_agent_id: agent.agent_id,
        nickname: `${agentName} Line`,
      });
      
      if (importedNumber) {
        phoneNum = importedNumber.phone_number;
      }
    }

    setCreatedAgent({
      agentId: agent.agent_id,
      llmId: llm.llm_id,
      phoneNumber: phoneNum,
    });
  };

  const testAgent = async () => {
    if (!createdAgent) return;

    // Create a web call to test the agent
    const webCall = await retell.createWebCall({
      agent_id: createdAgent.agentId,
      metadata: {
        test: true,
        created_at: new Date().toISOString(),
      },
    });

    if (webCall) {
      console.log('Web call created:', webCall);
      console.log('Access token:', webCall.access_token);
    }
  };

  const listAllResources = async () => {
    // List all agents
    const agents = await retell.listAgents();
    console.log('All agents:', agents);

    // List all LLMs
    const llms = await retell.listRetellLLMs();
    console.log('All LLMs:', llms);

    // List all phone numbers
    const numbers = await retell.listPhoneNumbers();
    console.log('All phone numbers:', numbers);

    // List all voices
    const voices = await retell.listVoices();
    console.log('All voices:', voices);

    // Get account info
    const account = await retell.getAccount();
    console.log('Account info:', account);
  };

  return (
    <div className="space-y-4 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Retell AI - Build Agent from Description</CardTitle>
          <CardDescription>
            Demonstrate the comprehensive Retell AI integration by creating an agent from a natural language description.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="agentName">Agent Name</Label>
            <Input
              id="agentName"
              placeholder="e.g., Sales Assistant"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Agent Description / Prompt</Label>
            <Textarea
              id="description"
              placeholder="Describe what your agent should do. For example: 'You are a friendly sales assistant for a tech company. Help customers understand our products and guide them through purchases.'"
              value={agentDescription}
              onChange={(e) => setAgentDescription(e.target.value)}
              rows={6}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phoneNumber">Phone Number (Optional)</Label>
            <Input
              id="phoneNumber"
              placeholder="+1234567890"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
            />
          </div>

          <Button
            onClick={buildAgent}
            disabled={retell.isLoading || !agentDescription || !agentName}
            className="w-full"
          >
            {retell.isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Building Agent...
              </>
            ) : (
              'Build Agent'
            )}
          </Button>

          {createdAgent && (
            <div className="mt-4 p-4 bg-green-50 rounded-md space-y-2">
              <p className="font-semibold text-green-900">Agent Created Successfully!</p>
              <p className="text-sm text-green-800">Agent ID: {createdAgent.agentId}</p>
              <p className="text-sm text-green-800">LLM ID: {createdAgent.llmId}</p>
              {createdAgent.phoneNumber && (
                <p className="text-sm text-green-800">Phone Number: {createdAgent.phoneNumber}</p>
              )}
              
              <div className="flex gap-2 mt-4">
                <Button
                  onClick={testAgent}
                  variant="outline"
                  size="sm"
                  disabled={retell.isLoading}
                >
                  Test Agent (Web Call)
                </Button>
              </div>
            </div>
          )}

          <div className="border-t pt-4 mt-4">
            <Button
              onClick={listAllResources}
              variant="secondary"
              className="w-full"
              disabled={retell.isLoading}
            >
              List All Resources (Check Console)
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
