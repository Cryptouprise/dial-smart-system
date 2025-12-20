import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, Circle, ArrowRight, ArrowLeft, Phone, PhoneOff, Loader2, Rocket, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { CampaignReadinessChecker } from './CampaignReadinessChecker';
import { useRetellAI } from '@/hooks/useRetellAI';

interface CampaignSetupWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: (campaignId: string) => void;
}

const WEBHOOK_URL = 'https://emonjusymdripmkvtttc.supabase.co/functions/v1/call-tracking-webhook';

export const CampaignSetupWizard: React.FC<CampaignSetupWizardProps> = ({
  open,
  onOpenChange,
  onComplete
}) => {
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [createdCampaignId, setCreatedCampaignId] = useState<string | null>(null);
  const [fixIssueId, setFixIssueId] = useState<string | null>(null);

  // Form data
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [agentId, setAgentId] = useState('');
  const [workflowId, setWorkflowId] = useState('');
  const [callingHoursStart, setCallingHoursStart] = useState('09:00');
  const [callingHoursEnd, setCallingHoursEnd] = useState('17:00');
  const [callsPerMinute, setCallsPerMinute] = useState(5);
  const [maxAttempts, setMaxAttempts] = useState(3);

  // Data
  const [agents, setAgents] = useState<any[]>([]);
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [leadCount, setLeadCount] = useState(0);

  // Retell phone connection helpers
  const { listPhoneNumbers, updatePhoneNumber, isLoading: isRetellLoading } = useRetellAI();
  const [phoneDialogOpen, setPhoneDialogOpen] = useState(false);
  const [phoneDialogAgent, setPhoneDialogAgent] = useState<any | null>(null);
  const [availablePhones, setAvailablePhones] = useState<any[]>([]);
  const [selectedPhoneNumber, setSelectedPhoneNumber] = useState('');

  // Helper functions for fix guidance
  const getFixLabel = (checkId: string): string => {
    const labels: Record<string, string> = {
      'agent_phone': 'Agent needs a phone number',
      'leads_assigned': 'No leads in campaign',
      'phone_numbers': 'No active phone numbers',
      'ai_agent': 'No AI agent configured',
      'webhook': 'Webhook not configured',
      'campaign_name': 'Campaign name missing',
      'calling_hours': 'Calling hours not set',
      'workflow': 'No workflow attached',
      'sms_settings': 'SMS not configured',
    };
    return labels[checkId] || 'Issue needs fixing';
  };

  const getFixInstructions = (checkId: string): string => {
    const instructions: Record<string, string> = {
      'agent_phone': 'Your AI agent needs a phone number assigned. Go to the Setup Wizard and configure Phone Numbers, then link one to your agent.',
      'leads_assigned': 'Add leads to this campaign. Go to the Setup Wizard → Import Leads, then add them to your campaign.',
      'phone_numbers': 'You need active phone numbers. Go to the Setup Wizard → Phone Numbers to purchase numbers.',
      'ai_agent': 'Create an AI agent first. Go to the Setup Wizard → AI Agent to set one up.',
      'webhook': 'The webhook URL needs to be configured on your agent. This should be automatic, but you may need to re-create the agent.',
      'campaign_name': 'Your campaign needs a name.',
      'calling_hours': 'Set your calling hours to comply with regulations.',
      'workflow': 'Attach a workflow for automated follow-ups (optional).',
      'sms_settings': 'Configure AI SMS for text follow-ups (optional).',
    };
    return instructions[checkId] || 'Use the Setup Wizard to configure this.';
  };

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open]);

  const loadData = async () => {
    // Load agents
    try {
      const { data: agentData } = await supabase.functions.invoke('retell-agent-management', {
        body: { action: 'list' }
      });
      const agentArray = Array.isArray(agentData) ? agentData : (agentData?.agents || []);
      
      // Get phone mappings
      const { data: phoneData } = await supabase.functions.invoke('retell-phone-management', {
        body: { action: 'list' }
      });
      const phones = Array.isArray(phoneData) ? phoneData : (phoneData?.phone_numbers || []);
      
      const enrichedAgents = agentArray.map((agent: any) => ({
        ...agent,
        hasPhone: phones.some((p: any) => 
          p.inbound_agent_id === agent.agent_id || p.outbound_agent_id === agent.agent_id
        )
      }));
      
      setAgents(enrichedAgents);
    } catch (e) {
      console.error('Error loading agents:', e);
    }

    // Load workflows
    const { data: workflowData } = await supabase
      .from('campaign_workflows')
      .select('id, name, active')
      .eq('active', true)
      .order('name');
    setWorkflows(workflowData || []);

    // Load lead count
    const { count } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true });
    setLeadCount(count || 0);
  };

  const handleCreateCampaign = async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('campaigns')
        .insert({
          user_id: user.id,
          name,
          description,
          agent_id: agentId,
          workflow_id: workflowId === 'none' ? null : workflowId || null,
          calling_hours_start: callingHoursStart,
          calling_hours_end: callingHoursEnd,
          calls_per_minute: callsPerMinute,
          max_attempts: maxAttempts,
          status: 'draft'
        })
        .select()
        .maybeSingle();

      if (error) throw error;

      setCreatedCampaignId(data.id);
      toast({ title: 'Campaign created', description: 'Now add leads to your campaign' });
      setCurrentStep(5);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const steps = [
    { number: 1, title: 'Basic Info' },
    { number: 2, title: 'AI Agent' },
    { number: 3, title: 'Workflow' },
    { number: 4, title: 'Schedule' },
    { number: 5, title: 'Review' },
  ];

  const canProceed = () => {
    switch (currentStep) {
      case 1: return !!name;
      case 2: return !!agentId;
      case 3: return true; // Workflow is optional
      case 4: return true;
      default: return true;
    }
  };

  const handleNext = () => {
    if (currentStep === 4) {
      handleCreateCampaign();
    } else {
      setCurrentStep(prev => prev + 1);
    }
  };

  // Inline flow to connect a Retell phone number to the selected agent
  const openPhoneDialogForSelectedAgent = async () => {
    if (!agentId) return;
    const agent = agents.find(a => a.agent_id === agentId);
    if (!agent) return;

    setPhoneDialogAgent(agent);
    setPhoneDialogOpen(true);
    setSelectedPhoneNumber('');

    const numbers = await listPhoneNumbers();
    if (numbers) {
      // Prefer numbers that are not already attached to an agent
      const unattached = numbers.filter((n: any) => !n.inbound_agent_id && !n.outbound_agent_id);
      setAvailablePhones(unattached.length > 0 ? unattached : numbers);
    }
  };

  const handleAssignPhoneToAgent = async () => {
    if (!phoneDialogAgent || !selectedPhoneNumber) return;

    const result = await updatePhoneNumber(selectedPhoneNumber, phoneDialogAgent.agent_id);
    if (result) {
      // Mark agent as having a phone locally so the UI updates immediately
      setAgents(prev => prev.map(a => 
        a.agent_id === phoneDialogAgent.agent_id ? { ...a, hasPhone: true } : a
      ));
      setPhoneDialogOpen(false);
      setPhoneDialogAgent(null);
      toast({
        title: 'Phone connected',
        description: 'This agent now has an active phone number attached.',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Campaign Setup Wizard</DialogTitle>
          <DialogDescription>
            Step-by-step guide to create and launch your campaign
          </DialogDescription>
        </DialogHeader>

        {/* Progress Steps */}
        <div className="flex items-center justify-between py-4">
          {steps.map((step, index) => (
            <React.Fragment key={step.number}>
              <div className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  currentStep > step.number ? 'bg-green-500 text-white' :
                  currentStep === step.number ? 'bg-primary text-primary-foreground' :
                  'bg-muted text-muted-foreground'
                }`}>
                  {currentStep > step.number ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    step.number
                  )}
                </div>
                <span className="text-xs mt-1">{step.title}</span>
              </div>
              {index < steps.length - 1 && (
                <div className={`flex-1 h-1 mx-2 ${
                  currentStep > step.number ? 'bg-green-500' : 'bg-muted'
                }`} />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Step Content */}
        <div className="min-h-[300px]">
          {currentStep === 1 && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Campaign Name *</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Q4 Sales Outreach"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Description</label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Campaign objectives and notes..."
                  rows={3}
                />
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Select Retell AI Agent *</label>
                <p className="text-xs text-muted-foreground mb-2">
                  Choose an agent with an active phone number
                </p>
                <Select value={agentId} onValueChange={setAgentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an agent" />
                  </SelectTrigger>
                  <SelectContent>
                    {agents.map((agent) => (
                      <SelectItem key={agent.agent_id} value={agent.agent_id}>
                        <div className="flex items-center gap-2">
                          {agent.hasPhone ? (
                            <Phone className="h-4 w-4 text-green-500" />
                          ) : (
                            <PhoneOff className="h-4 w-4 text-red-500" />
                          )}
                          <span>{agent.agent_name}</span>
                          {!agent.hasPhone && (
                            <Badge variant="outline" className="text-xs">No phone</Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {agentId && !agents.find(a => a.agent_id === agentId)?.hasPhone && (
                <Card className="border-amber-500 bg-amber-50 dark:bg-amber-900/20">
                  <CardContent className="pt-4 space-y-3">
                    <div className="flex gap-2">
                      <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
                      <div className="text-sm">
                        <p className="font-medium">Agent needs a phone number</p>
                        <p className="text-muted-foreground">
                          Connect one of your Retell phone numbers directly to this agent without leaving the wizard.
                        </p>
                      </div>
                    </div>
                    <div>
                      <Button
                        type="button"
                        size="sm"
                        onClick={openPhoneDialogForSelectedAgent}
                        disabled={isRetellLoading}
                      >
                        {isRetellLoading ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Loading numbers...
                          </>
                        ) : (
                          <>
                            <Phone className="h-4 w-4 mr-2" />
                            Connect phone number to this agent
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card className="bg-muted/50">
                <CardContent className="pt-4 text-sm">
                  <p className="font-medium mb-1">Webhook Auto-Configuration</p>
                  <p className="text-muted-foreground text-xs">
                    Your agent's webhook will be set to:
                  </p>
                  <code className="text-xs bg-background p-1 rounded mt-1 block break-all">
                    {WEBHOOK_URL}
                  </code>
                </CardContent>
              </Card>
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Attach Workflow (Optional)</label>
                <p className="text-xs text-muted-foreground mb-2">
                  Workflows automate follow-ups and lead progression
                </p>
                <Select value={workflowId} onValueChange={setWorkflowId}>
                  <SelectTrigger>
                    <SelectValue placeholder="No workflow (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No workflow</SelectItem>
                    {workflows.map((wf) => (
                      <SelectItem key={wf.id} value={wf.id}>
                        {wf.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {leadCount > 0 && (
                <Card className="bg-muted/50">
                  <CardContent className="pt-4 text-sm">
                    <p className="font-medium">{leadCount} leads available</p>
                    <p className="text-muted-foreground text-xs">
                      You can assign leads after campaign creation
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {currentStep === 4 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Start Time</label>
                  <Input
                    type="time"
                    value={callingHoursStart}
                    onChange={(e) => setCallingHoursStart(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">End Time</label>
                  <Input
                    type="time"
                    value={callingHoursEnd}
                    onChange={(e) => setCallingHoursEnd(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Calls per Minute</label>
                  <Input
                    type="number"
                    min={1}
                    max={30}
                    value={callsPerMinute}
                    onChange={(e) => setCallsPerMinute(parseInt(e.target.value) || 5)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Max Attempts</label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={maxAttempts}
                    onChange={(e) => setMaxAttempts(parseInt(e.target.value) || 3)}
                  />
                </div>
              </div>
            </div>
          )}

          {currentStep === 5 && createdCampaignId && (
            <div className="space-y-4">
              <CampaignReadinessChecker
                campaignId={createdCampaignId}
                onLaunch={() => {
                  onComplete?.(createdCampaignId);
                  onOpenChange(false);
                }}
                onFixIssue={(checkId) => {
                  setFixIssueId(checkId);
                }}
              />
              
              {/* Fix Issue Guidance Dialog */}
              {fixIssueId && (
                <Card className="border-2 border-amber-500 bg-amber-50 dark:bg-amber-900/20">
                  <CardContent className="pt-4 space-y-3">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-semibold text-amber-800 dark:text-amber-200">
                          Fix Required: {getFixLabel(fixIssueId)}
                        </h4>
                        <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                          {getFixInstructions(fixIssueId)}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setFixIssueId(null)}
                      >
                        Dismiss
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          // Navigate to the fix location
                              const routes: Record<string, string> = {
                                agent_phone: '/?tab=onboarding&fixArea=phone_numbers&source=campaign_readiness',
                                leads_assigned: '/?tab=onboarding&fixArea=leads&source=campaign_readiness',
                                phone_numbers: '/?tab=onboarding&fixArea=phone_numbers&source=campaign_readiness',
                                ai_agent: '/?tab=onboarding&fixArea=ai_agent&source=campaign_readiness',
                              };
                              const route = routes[fixIssueId] || '/?tab=onboarding&source=campaign_readiness';
                          onOpenChange(false);
                          window.location.href = route;
                        }}
                      >
                        Go to Setup Wizard
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex justify-between pt-4 border-t">
          <Button
            variant="outline"
            onClick={() => setCurrentStep(prev => prev - 1)}
            disabled={currentStep === 1 || currentStep === 5}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>

          {currentStep < 5 && (
            <Button onClick={handleNext} disabled={!canProceed() || isLoading}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : currentStep === 4 ? (
                <Rocket className="h-4 w-4 mr-1" />
              ) : (
                <ArrowRight className="h-4 w-4 mr-1" />
              )}
              {currentStep === 4 ? 'Create Campaign' : 'Next'}
            </Button>
          )}

          {currentStep === 5 && (
            <Button 
              type="button"
              onClick={(e) => {
                e.preventDefault();
                onOpenChange(false);
              }}
            >
              Done
            </Button>
          )}
        </div>

        {/* Connect phone number dialog */}
        <Dialog open={phoneDialogOpen} onOpenChange={setPhoneDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Connect phone number to agent</DialogTitle>
              <DialogDescription>
                Choose which Retell phone number should be used by
                {" "}
                <span className="font-semibold">{phoneDialogAgent?.agent_name}</span>.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {availablePhones.length === 0 ? (
                <Card className="bg-muted/40">
                  <CardContent className="pt-4 text-sm text-muted-foreground">
                    You don&apos;t have any Retell phone numbers yet. Complete the
                    <span className="font-medium"> Phone Numbers</span> step in the setup wizard first.
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Select phone number</label>
                  <Select value={selectedPhoneNumber} onValueChange={setSelectedPhoneNumber}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a phone number" />
                    </SelectTrigger>
                    <SelectContent>
                      {availablePhones.map((phone: any) => (
                        <SelectItem key={phone.phone_number} value={phone.phone_number}>
                          <div className="flex flex-col">
                            <span className="font-medium">{phone.phone_number}</span>
                            {phone.nickname && (
                              <span className="text-xs text-muted-foreground">{phone.nickname}</span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => setPhoneDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleAssignPhoneToAgent}
                  disabled={!selectedPhoneNumber || isRetellLoading}
                >
                  {isRetellLoading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Phone className="h-4 w-4 mr-2" />
                  )}
                  Connect
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
};

export default CampaignSetupWizard;
