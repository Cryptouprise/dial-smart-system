import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { WorkflowPreview } from '@/components/automation/WorkflowPreview';
import { 
  Rocket, ChevronRight, ChevronLeft, Check, Users, 
  Workflow, Phone, Settings2, Sparkles, Zap
} from 'lucide-react';

interface CampaignWizardProps {
  open: boolean;
  onClose: () => void;
  onComplete: (campaignId: string) => void;
}

interface WizardState {
  name: string;
  description: string;
  workflowId: string;
  agentId: string;
  callingHoursStart: string;
  callingHoursEnd: string;
  maxCallsPerDay: number;
  smsOnNoAnswer: boolean;
  smsTemplate: string;
}

const WORKFLOW_TEMPLATES = [
  {
    id: 'speed_to_lead',
    name: 'Speed to Lead',
    description: 'Immediate call + SMS follow-up for hot leads',
    steps: [
      { step_number: 1, step_type: 'call', step_config: { max_attempts: 2 } },
      { step_number: 2, step_type: 'wait', step_config: { delay_minutes: 5 } },
      { step_number: 3, step_type: 'sms', step_config: { sms_content: "Hi {{first_name}}, I just tried calling you. Is now a good time to chat?" } },
      { step_number: 4, step_type: 'wait', step_config: { delay_hours: 2 } },
      { step_number: 5, step_type: 'call', step_config: { max_attempts: 1 } },
    ]
  },
  {
    id: 'no_show_followup',
    name: 'No-Show Follow-up',
    description: 'Re-engage leads who missed appointments',
    steps: [
      { step_number: 1, step_type: 'sms', step_config: { sms_content: "Hi {{first_name}}, we missed you at your appointment. Want to reschedule?" } },
      { step_number: 2, step_type: 'wait', step_config: { delay_hours: 4 } },
      { step_number: 3, step_type: 'call', step_config: { max_attempts: 2 } },
      { step_number: 4, step_type: 'wait', step_config: { delay_days: 1 } },
      { step_number: 5, step_type: 'ai_sms', step_config: { ai_prompt: 'Follow up on missed appointment, offer flexible scheduling' } },
    ]
  },
  {
    id: 'nurture_sequence',
    name: 'Lead Nurture',
    description: 'Multi-day nurture sequence for cold leads',
    steps: [
      { step_number: 1, step_type: 'call', step_config: { max_attempts: 1 } },
      { step_number: 2, step_type: 'wait', step_config: { delay_days: 1 } },
      { step_number: 3, step_type: 'sms', step_config: { sms_content: "Hi {{first_name}}, just following up on my call yesterday. Any questions I can help with?" } },
      { step_number: 4, step_type: 'wait', step_config: { delay_days: 2 } },
      { step_number: 5, step_type: 'call', step_config: { max_attempts: 2 } },
      { step_number: 6, step_type: 'wait', step_config: { delay_days: 3 } },
      { step_number: 7, step_type: 'ai_sms', step_config: { ai_prompt: 'Final follow-up, create urgency, offer limited-time value' } },
    ]
  },
  {
    id: 'ai_conversation',
    name: 'AI Conversation',
    description: 'Let AI handle the entire conversation flow',
    steps: [
      { step_number: 1, step_type: 'call', step_config: { max_attempts: 3 } },
      { step_number: 2, step_type: 'wait', step_config: { delay_minutes: 30 } },
      { step_number: 3, step_type: 'ai_sms', step_config: { ai_prompt: 'Introduce yourself and offer to help based on their interest' } },
    ]
  },
];

export const CampaignWizard: React.FC<CampaignWizardProps> = ({ open, onClose, onComplete }) => {
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(0);
  const [isCreating, setIsCreating] = useState(false);
  const [agents, setAgents] = useState<Array<{ agent_id: string; agent_name: string }>>([]);
  const [workflows, setWorkflows] = useState<Array<{ id: string; name: string; steps?: any[] }>>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  
  const [wizardState, setWizardState] = useState<WizardState>({
    name: '',
    description: '',
    workflowId: '',
    agentId: '',
    callingHoursStart: '09:00',
    callingHoursEnd: '17:00',
    maxCallsPerDay: 2,
    smsOnNoAnswer: true,
    smsTemplate: "Hi {{first_name}}, I just tried to reach you. When's a good time to chat?",
  });

  const steps = [
    { title: 'Campaign Info', icon: Settings2 },
    { title: 'Select Workflow', icon: Workflow },
    { title: 'AI Agent', icon: Sparkles },
    { title: 'Launch', icon: Rocket },
  ];

  useEffect(() => {
    if (open) {
      fetchAgents();
      fetchWorkflows();
    }
  }, [open]);

  const fetchAgents = async () => {
    try {
      const { data } = await supabase.functions.invoke('retell-agent-management', {
        body: { action: 'list' }
      });
      // Handle both array format and {agents: [...]} format
      const agentArray = Array.isArray(data) ? data : (data?.agents || []);
      setAgents(agentArray);
    } catch (error) {
      console.error('Failed to fetch agents:', error);
    }
  };

  const fetchWorkflows = async () => {
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user) return;

      const { data } = await supabase
        .from('campaign_workflows')
        .select('id, name, workflow_steps(*)')
        .eq('user_id', session.session.user.id)
        .eq('active', true);
      
      if (data) {
        setWorkflows(data.map(w => ({
          id: w.id,
          name: w.name,
          steps: (w.workflow_steps as any[])?.sort((a: any, b: any) => a.step_number - b.step_number)
        })));
      }
    } catch (error) {
      console.error('Failed to fetch workflows:', error);
    }
  };

  const handleCreateFromTemplate = async (templateId: string) => {
    const template = WORKFLOW_TEMPLATES.find(t => t.id === templateId);
    if (!template) return;

    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user) throw new Error('Not authenticated');

      // Create workflow from template
      const { data: workflow, error: workflowError } = await supabase
        .from('campaign_workflows')
        .insert({
          user_id: session.session.user.id,
          name: `${template.name} - ${wizardState.name || 'New Campaign'}`,
          description: template.description,
          workflow_type: 'mixed',
          active: true,
        })
        .select()
        .single();

      if (workflowError) throw workflowError;

      // Create steps
      const stepsToInsert = template.steps.map(step => ({
        workflow_id: workflow.id,
        ...step,
      }));

      await supabase.from('workflow_steps').insert(stepsToInsert);

      setWizardState(prev => ({ ...prev, workflowId: workflow.id }));
      setSelectedTemplate(templateId);
      
      toast({ title: 'Template Applied', description: `${template.name} workflow created` });
      
      // Refresh workflows list
      await fetchWorkflows();
    } catch (error) {
      console.error('Failed to create from template:', error);
      toast({ title: 'Error', description: 'Failed to create workflow from template', variant: 'destructive' });
    }
  };

  const handleCreate = async () => {
    if (!wizardState.name || !wizardState.workflowId || !wizardState.agentId) {
      toast({ title: 'Missing Fields', description: 'Please complete all required fields', variant: 'destructive' });
      return;
    }

    setIsCreating(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user) throw new Error('Not authenticated');

      const { data: campaign, error } = await supabase
        .from('campaigns')
        .insert({
          user_id: session.session.user.id,
          name: wizardState.name,
          description: wizardState.description,
          workflow_id: wizardState.workflowId,
          agent_id: wizardState.agentId,
          calling_hours_start: wizardState.callingHoursStart,
          calling_hours_end: wizardState.callingHoursEnd,
          max_calls_per_day: wizardState.maxCallsPerDay,
          sms_on_no_answer: wizardState.smsOnNoAnswer,
          sms_template: wizardState.smsTemplate,
          status: 'draft',
        })
        .select()
        .single();

      if (error) throw error;

      toast({ title: 'Campaign Created!', description: 'Your campaign is ready to launch' });
      onComplete(campaign.id);
      onClose();
    } catch (error) {
      console.error('Failed to create campaign:', error);
      toast({ title: 'Error', description: 'Failed to create campaign', variant: 'destructive' });
    } finally {
      setIsCreating(false);
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 0: return wizardState.name.length > 0;
      case 1: return wizardState.workflowId.length > 0;
      case 2: return wizardState.agentId.length > 0;
      default: return true;
    }
  };

  const getTemplateSteps = () => {
    if (selectedTemplate) {
      return WORKFLOW_TEMPLATES.find(t => t.id === selectedTemplate)?.steps || [];
    }
    if (wizardState.workflowId) {
      const workflow = workflows.find(w => w.id === wizardState.workflowId);
      return workflow?.steps || [];
    }
    return [];
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Campaign Wizard
          </DialogTitle>
          <DialogDescription>
            Create and launch a campaign in minutes
          </DialogDescription>
        </DialogHeader>

        {/* Progress */}
        <div className="mb-6">
          <Progress value={(currentStep / (steps.length - 1)) * 100} className="h-2" />
          <div className="flex justify-between mt-2">
            {steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <div 
                  key={index}
                  className={`flex items-center gap-1 text-xs ${
                    index <= currentStep ? 'text-primary' : 'text-muted-foreground'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{step.title}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Step Content */}
        <div className="min-h-[300px]">
          {currentStep === 0 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Campaign Name *</Label>
                <Input
                  value={wizardState.name}
                  onChange={(e) => setWizardState(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Solar Leads Q1"
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={wizardState.description}
                  onChange={(e) => setWizardState(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="What's this campaign for?"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Calling Hours Start</Label>
                  <Input
                    type="time"
                    value={wizardState.callingHoursStart}
                    onChange={(e) => setWizardState(prev => ({ ...prev, callingHoursStart: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Calling Hours End</Label>
                  <Input
                    type="time"
                    value={wizardState.callingHoursEnd}
                    onChange={(e) => setWizardState(prev => ({ ...prev, callingHoursEnd: e.target.value }))}
                  />
                </div>
              </div>
            </div>
          )}

          {currentStep === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Quick Start Templates</Label>
                <div className="grid grid-cols-2 gap-3">
                  {WORKFLOW_TEMPLATES.map((template) => (
                    <Card 
                      key={template.id}
                      className={`cursor-pointer transition-all hover:border-primary ${
                        selectedTemplate === template.id ? 'border-primary ring-2 ring-primary/20' : ''
                      }`}
                      onClick={() => handleCreateFromTemplate(template.id)}
                    >
                      <CardContent className="p-3">
                        <h4 className="font-medium text-sm">{template.name}</h4>
                        <p className="text-xs text-muted-foreground mt-1">{template.description}</p>
                        <div className="mt-2">
                          <WorkflowPreview steps={template.steps} compact />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              {workflows.length > 0 && (
                <div className="space-y-2">
                  <Label>Or Select Existing Workflow</Label>
                  <Select
                    value={wizardState.workflowId}
                    onValueChange={(v) => {
                      setWizardState(prev => ({ ...prev, workflowId: v }));
                      setSelectedTemplate(null);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a workflow..." />
                    </SelectTrigger>
                    <SelectContent>
                      {workflows.map((workflow) => (
                        <SelectItem key={workflow.id} value={workflow.id}>
                          {workflow.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {getTemplateSteps().length > 0 && (
                <div className="mt-4">
                  <Label className="mb-2 block">Workflow Preview</Label>
                  <WorkflowPreview steps={getTemplateSteps()} />
                </div>
              )}
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>AI Voice Agent *</Label>
                <Select
                  value={wizardState.agentId}
                  onValueChange={(v) => setWizardState(prev => ({ ...prev, agentId: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select an AI agent..." />
                  </SelectTrigger>
                  <SelectContent>
                    {agents.map((agent) => (
                      <SelectItem key={agent.agent_id} value={agent.agent_id}>
                        {agent.agent_name || agent.agent_id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {agents.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No agents found. Create one in the Retell AI section first.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Max Calls Per Day (per lead)</Label>
                <Input
                  type="number"
                  value={wizardState.maxCallsPerDay}
                  onChange={(e) => setWizardState(prev => ({ ...prev, maxCallsPerDay: parseInt(e.target.value) || 2 }))}
                  min={1}
                  max={10}
                />
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-4">
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="p-4">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Check className="h-5 w-5 text-green-500" />
                    Ready to Launch!
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Review your campaign settings below:
                  </p>
                </CardContent>
              </Card>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Name:</span>
                  <p className="font-medium">{wizardState.name}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Calling Hours:</span>
                  <p className="font-medium">{wizardState.callingHoursStart} - {wizardState.callingHoursEnd}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Agent:</span>
                  <p className="font-medium">{agents.find(a => a.agent_id === wizardState.agentId)?.agent_name || 'Selected'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Max Calls/Day:</span>
                  <p className="font-medium">{wizardState.maxCallsPerDay}</p>
                </div>
              </div>

              {getTemplateSteps().length > 0 && (
                <div>
                  <Label className="mb-2 block">Workflow</Label>
                  <WorkflowPreview steps={getTemplateSteps()} compact />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex justify-between mt-6">
          <Button
            variant="outline"
            onClick={() => setCurrentStep(prev => Math.max(0, prev - 1))}
            disabled={currentStep === 0}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back
          </Button>

          {currentStep < steps.length - 1 ? (
            <Button
              onClick={() => setCurrentStep(prev => prev + 1)}
              disabled={!canProceed()}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleCreate} disabled={isCreating}>
              {isCreating ? 'Creating...' : 'Create Campaign'}
              <Rocket className="h-4 w-4 ml-1" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
