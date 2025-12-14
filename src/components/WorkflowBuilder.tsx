import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Plus, Trash2, Phone, MessageSquare, Clock, GitBranch, 
  Play, Pause, Sparkles, GripVertical, ArrowDown, Settings2,
  Zap, Target, AlertTriangle, Ban
} from 'lucide-react';
import { useCampaignWorkflows, CampaignWorkflow, WorkflowStep, DispositionAutoAction } from '@/hooks/useCampaignWorkflows';
import { useToast } from '@/hooks/use-toast';
import { WorkflowTester } from './WorkflowTester';

const STEP_TYPES = [
  { value: 'call', label: 'Phone Call', icon: Phone, color: 'bg-blue-500' },
  { value: 'sms', label: 'SMS Message', icon: MessageSquare, color: 'bg-green-500' },
  { value: 'ai_sms', label: 'AI SMS', icon: Sparkles, color: 'bg-purple-500' },
  { value: 'wait', label: 'Wait/Delay', icon: Clock, color: 'bg-orange-500' },
  { value: 'condition', label: 'Condition', icon: GitBranch, color: 'bg-yellow-500' },
];

const WORKFLOW_TYPES = [
  { value: 'calling_only', label: 'Calling Only', description: 'Phone calls with scheduled timing' },
  { value: 'follow_up', label: 'Follow Up', description: 'Post-call follow-up sequence' },
  { value: 'mixed', label: 'Mixed', description: 'Calls and SMS combined' },
  { value: 'appointment_reminder', label: 'Appointment Reminder', description: 'Remind about appointments' },
  { value: 'no_show', label: 'No Show', description: 'Handle no-show leads' },
];

const DISPOSITION_ACTIONS = [
  { value: 'remove_all_campaigns', label: 'Remove from All Campaigns', icon: Ban },
  { value: 'move_to_stage', label: 'Move to Pipeline Stage', icon: Target },
  { value: 'add_to_dnc', label: 'Add to DNC List', icon: AlertTriangle },
  { value: 'start_workflow', label: 'Start New Workflow', icon: Zap },
];

const NEGATIVE_DISPOSITIONS = [
  'Not Interested',
  'Wrong Number', 
  'Already Has Solar',
  'Do Not Call',
  'Rude/Threatening',
  'Disconnected',
  'Business Line',
  'Deceased'
];

interface WorkflowBuilderProps {
  onWorkflowCreated?: () => void;
}

export const WorkflowBuilder: React.FC<WorkflowBuilderProps> = ({ onWorkflowCreated }) => {
  const { 
    workflows, 
    dispositionActions,
    isLoading, 
    createWorkflow, 
    updateWorkflow,
    deleteWorkflow,
    createDispositionAction,
    deleteDispositionAction
  } = useCampaignWorkflows();
  const { toast } = useToast();
  
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<CampaignWorkflow | null>(null);
  const [activeTab, setActiveTab] = useState('workflows');
  const [showTester, setShowTester] = useState(false);
  const [showAIHelper, setShowAIHelper] = useState(false);
  const [aiPrompt, setAIPrompt] = useState('');
  const [aiLoading, setAILoading] = useState(false);
  const [includeAiAutoReply, setIncludeAiAutoReply] = useState(false);

  // New workflow form state
  const [newWorkflow, setNewWorkflow] = useState<CampaignWorkflow>({
    name: '',
    description: '',
    workflow_type: 'calling_only',
    settings: {
      max_calls_per_day: 2,
      call_spacing_hours: 5,
      pause_on_weekends: false,
      pause_days: [],
      resume_day: 'saturday',
      resume_time: '09:00'
    },
    auto_reply_settings: null,
    active: true,
    steps: []
  });
  
  const [workflowDialogTab, setWorkflowDialogTab] = useState<'steps' | 'ai_reply'>('steps');

  // Disposition action form state
  const [newDispositionAction, setNewDispositionAction] = useState<DispositionAutoAction>({
    disposition_name: '',
    action_type: 'remove_all_campaigns',
    action_config: {},
    active: true
  });

  const addStep = (type: WorkflowStep['step_type']) => {
    const defaultConfig: WorkflowStep['step_config'] = {};
    
    if (type === 'wait') {
      defaultConfig.delay_hours = 0;
      defaultConfig.delay_minutes = 0;
      defaultConfig.delay_days = 0;
    } else if (type === 'sms' || type === 'ai_sms') {
      defaultConfig.sms_content = '';
    } else if (type === 'call') {
      defaultConfig.timing_mode = 'immediate'; // 'immediate' | 'scheduled' | 'inherit'
      defaultConfig.time_of_day = '09:00';
      defaultConfig.max_ring_seconds = 30;
      defaultConfig.leave_voicemail = false;
      defaultConfig.voicemail_message = '';
    } else if (type === 'condition') {
      defaultConfig.condition_type = 'disposition';
      defaultConfig.condition_operator = 'equals';
      defaultConfig.condition_value = '';
      defaultConfig.then_action = 'continue';
      defaultConfig.else_action = 'skip';
    }

    setNewWorkflow(prev => ({
      ...prev,
      steps: [
        ...(prev.steps || []),
        {
          step_number: (prev.steps?.length || 0) + 1,
          step_type: type,
          step_config: defaultConfig
        }
      ]
    }));
  };

  const updateStep = (index: number, updates: Partial<WorkflowStep>) => {
    setNewWorkflow(prev => ({
      ...prev,
      steps: prev.steps?.map((step, i) => 
        i === index ? { ...step, ...updates } : step
      )
    }));
  };

  const removeStep = (index: number) => {
    setNewWorkflow(prev => ({
      ...prev,
      steps: prev.steps?.filter((_, i) => i !== index).map((step, i) => ({
        ...step,
        step_number: i + 1
      }))
    }));
  };

  const handleSaveWorkflow = async () => {
    if (!newWorkflow.name) {
      toast({ title: 'Error', description: 'Please enter a workflow name', variant: 'destructive' });
      return;
    }

    if (editingWorkflow?.id) {
      await updateWorkflow(editingWorkflow.id, newWorkflow);
    } else {
      await createWorkflow(newWorkflow);
    }

    setShowCreateDialog(false);
    resetForm();
    onWorkflowCreated?.();
  };

  const resetForm = () => {
    setNewWorkflow({
      name: '',
      description: '',
      workflow_type: 'calling_only',
      settings: {
        max_calls_per_day: 2,
        call_spacing_hours: 5,
        pause_on_weekends: false
      },
      active: true,
      steps: []
    });
    setEditingWorkflow(null);
  };

  const handleEditWorkflow = (workflow: CampaignWorkflow) => {
    setEditingWorkflow(workflow);
    setNewWorkflow(workflow);
    setShowCreateDialog(true);
  };

  const handleSaveDispositionAction = async () => {
    if (!newDispositionAction.disposition_name) {
      toast({ title: 'Error', description: 'Please select a disposition', variant: 'destructive' });
      return;
    }

    await createDispositionAction(newDispositionAction);
    setNewDispositionAction({
      disposition_name: '',
      action_type: 'remove_all_campaigns',
      action_config: {},
      active: true
    });
  };

  const handleAIBuildWorkflow = async () => {
    if (!aiPrompt.trim()) {
      toast({ title: 'Error', description: 'Please describe what you want to build', variant: 'destructive' });
      return;
    }

    setAILoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-workflow-generator', {
        body: {
          prompt: aiPrompt,
          currentSteps: newWorkflow.steps,
          workflowType: newWorkflow.workflow_type,
          includeAiAutoReply
        }
      });

      if (error) throw error;

      // Handle response - steps can be at data.steps or data.workflow.steps
      const generatedSteps = data?.steps || data?.workflow?.steps;
      
      if (generatedSteps && Array.isArray(generatedSteps)) {
        // Replace existing steps with AI-generated ones (user asked to "change the workflow")
        const newSteps = generatedSteps.map((step: any, idx: number) => ({
          step_number: idx + 1,
          step_type: step.step_type,
          step_config: step.step_config || {}
        }));

        setNewWorkflow(prev => ({
          ...prev,
          name: data?.workflow?.name || prev.name,
          description: data?.workflow?.description || prev.description,
          steps: newSteps
        }));

        toast({
          title: 'Workflow Generated!',
          description: `AI created ${newSteps.length} steps for your workflow`,
        });

        setShowAIHelper(false);
        setAIPrompt('');
      } else {
        console.error('AI response missing steps:', data);
        toast({
          title: 'AI Error',
          description: 'AI response did not include workflow steps. Please try again.',
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('AI workflow generation error:', error);
      toast({
        title: 'AI Error',
        description: error instanceof Error ? error.message : 'Failed to generate workflow steps',
        variant: 'destructive'
      });
    } finally {
      setAILoading(false);
    }
  };

  const renderStepEditor = (step: WorkflowStep, index: number) => {
    const stepType = STEP_TYPES.find(t => t.value === step.step_type);
    const Icon = stepType?.icon || Clock;

    return (
      <div key={index} className="relative">
        {index > 0 && (
          <div className="absolute left-6 -top-4 w-0.5 h-4 bg-border" />
        )}
        <Card className="border-l-4" style={{ borderLeftColor: stepType?.color.replace('bg-', '') }}>
          <CardContent className="p-4">
            <div className="flex items-start gap-4">
              <div className={`p-2 rounded-lg ${stepType?.color} text-white`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Step {index + 1}: {stepType?.label}</span>
                  <Button variant="ghost" size="icon" onClick={() => removeStep(index)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>

                {step.step_type === 'call' && (
                  <div className="space-y-4">
                    {/* Timing Mode */}
                    <div className="space-y-2">
                      <Label>When should this call happen?</Label>
                      <Select
                        value={step.step_config.timing_mode || 'immediate'}
                        onValueChange={(v) => updateStep(index, { 
                          step_config: { ...step.step_config, timing_mode: v as 'immediate' | 'scheduled' | 'inherit' }
                        })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="immediate">
                            <div className="flex flex-col">
                              <span className="font-medium">Immediately</span>
                              <span className="text-xs text-muted-foreground">Call as soon as this step is reached</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="inherit">
                            <div className="flex flex-col">
                              <span className="font-medium">After Previous Step</span>
                              <span className="text-xs text-muted-foreground">Wait for any prior wait/condition to complete</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="scheduled">
                            <div className="flex flex-col">
                              <span className="font-medium">At Specific Time</span>
                              <span className="text-xs text-muted-foreground">Schedule for a specific time of day</span>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Show time picker only for scheduled */}
                    {step.step_config.timing_mode === 'scheduled' && (
                      <div className="space-y-2">
                        <Label>Time of Day</Label>
                        <Input
                          type="time"
                          value={step.step_config.time_of_day || '09:00'}
                          onChange={(e) => updateStep(index, { 
                            step_config: { ...step.step_config, time_of_day: e.target.value }
                          })}
                        />
                      </div>
                    )}

                    {/* Advanced call options */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Max Ring Time (seconds)</Label>
                        <Input
                          type="number"
                          value={step.step_config.max_ring_seconds || 30}
                          onChange={(e) => updateStep(index, { 
                            step_config: { ...step.step_config, max_ring_seconds: parseInt(e.target.value) || 30 }
                          })}
                          min={10}
                          max={120}
                        />
                      </div>
                      <div className="space-y-2 flex items-end">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={step.step_config.leave_voicemail || false}
                            onCheckedChange={(v) => updateStep(index, { 
                              step_config: { ...step.step_config, leave_voicemail: v }
                            })}
                          />
                          <Label className="cursor-pointer">Leave voicemail if no answer</Label>
                        </div>
                      </div>
                    </div>

                    {step.step_config.leave_voicemail && (
                      <div className="space-y-2">
                        <Label>Voicemail Message (optional AI prompt)</Label>
                        <Textarea
                          value={step.step_config.voicemail_message || ''}
                          onChange={(e) => updateStep(index, { 
                            step_config: { ...step.step_config, voicemail_message: e.target.value }
                          })}
                          placeholder="Leave blank to use agent's default. Or describe what the voicemail should say..."
                          rows={2}
                        />
                      </div>
                    )}
                  </div>
                )}

                {step.step_type === 'wait' && (
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Minutes</Label>
                      <Input
                        type="number"
                        value={step.step_config.delay_minutes || 0}
                        onChange={(e) => updateStep(index, { 
                          step_config: { ...step.step_config, delay_minutes: parseInt(e.target.value) || 0 }
                        })}
                        min={0}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Hours</Label>
                      <Input
                        type="number"
                        value={step.step_config.delay_hours || 0}
                        onChange={(e) => updateStep(index, { 
                          step_config: { ...step.step_config, delay_hours: parseInt(e.target.value) || 0 }
                        })}
                        min={0}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Days</Label>
                      <Input
                        type="number"
                        value={step.step_config.delay_days || 0}
                        onChange={(e) => updateStep(index, { 
                          step_config: { ...step.step_config, delay_days: parseInt(e.target.value) || 0 }
                        })}
                        min={0}
                      />
                    </div>
                  </div>
                )}

                {(step.step_type === 'sms' || step.step_type === 'ai_sms') && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>{step.step_type === 'ai_sms' ? 'AI Prompt / Context' : 'Message Content'}</Label>
                      <Textarea
                        value={step.step_config.sms_content || ''}
                        onChange={(e) => updateStep(index, { 
                          step_config: { ...step.step_config, sms_content: e.target.value }
                        })}
                        placeholder={step.step_type === 'ai_sms' 
                          ? "Describe what the AI should say based on the conversation..."
                          : "Enter the SMS message content. Use {first_name}, {company} for personalization..."
                        }
                        rows={3}
                      />
                    </div>
                    {step.step_type === 'ai_sms' && (
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={step.step_config.use_conversation_context !== false}
                          onCheckedChange={(v) => updateStep(index, { 
                            step_config: { ...step.step_config, use_conversation_context: v }
                          })}
                        />
                        <Label className="cursor-pointer">Include call transcript in AI context</Label>
                      </div>
                    )}
                  </div>
                )}

                {step.step_type === 'condition' && (
                  <div className="space-y-4 bg-muted/50 rounded-lg p-4">
                    <div className="grid grid-cols-3 gap-3">
                    {/* Condition Type */}
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">If...</Label>
                        <Select
                          value={step.step_config.condition_type || 'disposition'}
                          onValueChange={(v) => updateStep(index, { 
                            step_config: { ...step.step_config, condition_type: v as any }
                          })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select condition" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="disposition">Call Disposition</SelectItem>
                            <SelectItem value="lead_status">Lead Status</SelectItem>
                            <SelectItem value="call_outcome">Call Outcome</SelectItem>
                            <SelectItem value="attempts">Number of Attempts</SelectItem>
                            <SelectItem value="time_of_day">Time of Day</SelectItem>
                            <SelectItem value="day_of_week">Day of Week</SelectItem>
                            <SelectItem value="tag_exists">Tag Exists</SelectItem>
                            <SelectItem value="custom_field">Custom Field</SelectItem>
                            <SelectItem value="call_duration">Call Duration (seconds)</SelectItem>
                            <SelectItem value="sms_reply_received">SMS Reply Received</SelectItem>
                            <SelectItem value="voicemail_left">Voicemail Was Left</SelectItem>
                            <SelectItem value="appointment_scheduled">Appointment Scheduled</SelectItem>
                            <SelectItem value="lead_score">Lead Score</SelectItem>
                            <SelectItem value="last_contact_days">Days Since Last Contact</SelectItem>
                            <SelectItem value="total_calls">Total Calls Made</SelectItem>
                            <SelectItem value="total_sms">Total SMS Sent</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Operator */}
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Operator</Label>
                        <Select
                          value={step.step_config.condition_operator || 'equals'}
                          onValueChange={(v) => updateStep(index, { 
                            step_config: { ...step.step_config, condition_operator: v as any }
                          })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="equals">Equals</SelectItem>
                            <SelectItem value="not_equals">Not Equals</SelectItem>
                            <SelectItem value="contains">Contains</SelectItem>
                            <SelectItem value="greater_than">Greater Than</SelectItem>
                            <SelectItem value="less_than">Less Than</SelectItem>
                            <SelectItem value="is_empty">Is Empty</SelectItem>
                            <SelectItem value="is_not_empty">Is Not Empty</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Value - different inputs based on condition type */}
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Value</Label>
                        {step.step_config.condition_type === 'disposition' ? (
                          <Select
                            value={step.step_config.condition_value || ''}
                            onValueChange={(v) => updateStep(index, { 
                              step_config: { ...step.step_config, condition_value: v }
                            })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select disposition" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="interested">Interested</SelectItem>
                              <SelectItem value="not_interested">Not Interested</SelectItem>
                              <SelectItem value="callback">Callback Requested</SelectItem>
                              <SelectItem value="no_answer">No Answer</SelectItem>
                              <SelectItem value="voicemail">Voicemail</SelectItem>
                              <SelectItem value="busy">Busy</SelectItem>
                              <SelectItem value="wrong_number">Wrong Number</SelectItem>
                              <SelectItem value="dnc">Do Not Call</SelectItem>
                              <SelectItem value="appointment_set">Appointment Set</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : step.step_config.condition_type === 'lead_status' ? (
                          <Select
                            value={step.step_config.condition_value || ''}
                            onValueChange={(v) => updateStep(index, { 
                              step_config: { ...step.step_config, condition_value: v }
                            })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="new">New</SelectItem>
                              <SelectItem value="contacted">Contacted</SelectItem>
                              <SelectItem value="qualified">Qualified</SelectItem>
                              <SelectItem value="proposal">Proposal</SelectItem>
                              <SelectItem value="negotiation">Negotiation</SelectItem>
                              <SelectItem value="won">Won</SelectItem>
                              <SelectItem value="lost">Lost</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : step.step_config.condition_type === 'day_of_week' ? (
                          <Select
                            value={step.step_config.condition_value || ''}
                            onValueChange={(v) => updateStep(index, { 
                              step_config: { ...step.step_config, condition_value: v }
                            })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select day" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="monday">Monday</SelectItem>
                              <SelectItem value="tuesday">Tuesday</SelectItem>
                              <SelectItem value="wednesday">Wednesday</SelectItem>
                              <SelectItem value="thursday">Thursday</SelectItem>
                              <SelectItem value="friday">Friday</SelectItem>
                              <SelectItem value="saturday">Saturday</SelectItem>
                              <SelectItem value="sunday">Sunday</SelectItem>
                              <SelectItem value="weekday">Any Weekday</SelectItem>
                              <SelectItem value="weekend">Any Weekend</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : step.step_config.condition_type === 'call_outcome' ? (
                          <Select
                            value={step.step_config.condition_value || ''}
                            onValueChange={(v) => updateStep(index, { 
                              step_config: { ...step.step_config, condition_value: v }
                            })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select outcome" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="answered">Answered</SelectItem>
                              <SelectItem value="no_answer">No Answer</SelectItem>
                              <SelectItem value="busy">Busy</SelectItem>
                              <SelectItem value="voicemail">Voicemail</SelectItem>
                              <SelectItem value="failed">Failed</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : ['call_duration', 'lead_score', 'last_contact_days', 'total_calls', 'total_sms', 'attempts'].includes(step.step_config.condition_type || '') ? (
                          <Input
                            type="number"
                            value={step.step_config.condition_value || ''}
                            onChange={(e) => updateStep(index, { 
                              step_config: { ...step.step_config, condition_value: e.target.value }
                            })}
                            placeholder={
                              step.step_config.condition_type === 'call_duration' ? "e.g., 60 (seconds)" :
                              step.step_config.condition_type === 'lead_score' ? "e.g., 70" :
                              step.step_config.condition_type === 'last_contact_days' ? "e.g., 7" :
                              step.step_config.condition_type === 'total_calls' ? "e.g., 3" :
                              step.step_config.condition_type === 'total_sms' ? "e.g., 5" :
                              "Enter number..."
                            }
                          />
                        ) : ['sms_reply_received', 'voicemail_left', 'appointment_scheduled'].includes(step.step_config.condition_type || '') ? (
                          <Select
                            value={step.step_config.condition_value || 'true'}
                            onValueChange={(v) => updateStep(index, { 
                              step_config: { ...step.step_config, condition_value: v }
                            })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="true">Yes / True</SelectItem>
                              <SelectItem value="false">No / False</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            value={step.step_config.condition_value || ''}
                            onChange={(e) => updateStep(index, { 
                              step_config: { ...step.step_config, condition_value: e.target.value }
                            })}
                            placeholder={
                              step.step_config.condition_type === 'time_of_day' ? "e.g., 09:00" :
                              step.step_config.condition_type === 'tag_exists' ? "Tag name" :
                              "Enter value..."
                            }
                          />
                        )}
                      </div>
                    </div>

                    {/* Custom field name if condition_type is custom_field */}
                    {step.step_config.condition_type === 'custom_field' && (
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Custom Field Name</Label>
                        <Input
                          value={step.step_config.condition_field || ''}
                          onChange={(e) => updateStep(index, { 
                            step_config: { ...step.step_config, condition_field: e.target.value }
                          })}
                          placeholder="e.g., budget, source, industry"
                        />
                      </div>
                    )}

                    {/* Then/Else Actions */}
                    <div className="grid grid-cols-2 gap-4 pt-3 border-t border-border">
                      <div className="space-y-2">
                        <Label className="text-xs font-medium text-green-600">✓ If TRUE, then...</Label>
                        <Select
                          value={step.step_config.then_action || 'continue'}
                          onValueChange={(v) => updateStep(index, { 
                            step_config: { ...step.step_config, then_action: v as any }
                          })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="continue">Continue to Next Step</SelectItem>
                            <SelectItem value="skip">Skip Next Step</SelectItem>
                            <SelectItem value="end_workflow">End Workflow</SelectItem>
                            <SelectItem value="jump_to_step">Jump to Step #</SelectItem>
                            <SelectItem value="start_workflow">Start Another Workflow</SelectItem>
                          </SelectContent>
                        </Select>
                        {step.step_config.then_action === 'jump_to_step' && (
                          <Input
                            type="number"
                            value={step.step_config.then_target || ''}
                            onChange={(e) => updateStep(index, { 
                              step_config: { ...step.step_config, then_target: e.target.value }
                            })}
                            placeholder="Step number"
                            min={1}
                          />
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs font-medium text-red-600">✗ If FALSE, then...</Label>
                        <Select
                          value={step.step_config.else_action || 'skip'}
                          onValueChange={(v) => updateStep(index, { 
                            step_config: { ...step.step_config, else_action: v as any }
                          })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="continue">Continue to Next Step</SelectItem>
                            <SelectItem value="skip">Skip Next Step</SelectItem>
                            <SelectItem value="end_workflow">End Workflow</SelectItem>
                            <SelectItem value="jump_to_step">Jump to Step #</SelectItem>
                            <SelectItem value="start_workflow">Start Another Workflow</SelectItem>
                          </SelectContent>
                        </Select>
                        {step.step_config.else_action === 'jump_to_step' && (
                          <Input
                            type="number"
                            value={step.step_config.else_target || ''}
                            onChange={(e) => updateStep(index, { 
                              step_config: { ...step.step_config, else_target: e.target.value }
                            })}
                            placeholder="Step number"
                            min={1}
                          />
                        )}
                      </div>
                    </div>

                    {/* Preview of condition logic */}
                    <div className="bg-background rounded p-3 text-sm border">
                      <p className="text-muted-foreground">
                        <span className="font-medium text-foreground">Logic Preview: </span>
                        If <span className="text-primary font-medium">{step.step_config.condition_type || 'condition'}</span>
                        {' '}<span className="text-orange-500">{step.step_config.condition_operator?.replace('_', ' ') || 'equals'}</span>
                        {' '}"<span className="text-green-600 font-medium">{step.step_config.condition_value || '...'}</span>"
                        {' → '}<span className="text-blue-500">{step.step_config.then_action?.replace('_', ' ') || 'continue'}</span>
                        {', else → '}<span className="text-red-500">{step.step_config.else_action?.replace('_', ' ') || 'skip'}</span>
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Workflow Builder</h2>
          <p className="text-muted-foreground">Create automated calling and follow-up sequences</p>
        </div>
        <Dialog open={showCreateDialog} onOpenChange={(open) => { setShowCreateDialog(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Create Workflow
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingWorkflow ? 'Edit Workflow' : 'Create New Workflow'}</DialogTitle>
              <DialogDescription>
                Build a multi-step sequence of calls, SMS, and automations
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Workflow Name *</Label>
                  <Input
                    value={newWorkflow.name}
                    onChange={(e) => setNewWorkflow({ ...newWorkflow, name: e.target.value })}
                    placeholder="e.g., 3-Day Cold Call Blitz"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select 
                    value={newWorkflow.workflow_type} 
                    onValueChange={(v: CampaignWorkflow['workflow_type']) => setNewWorkflow({ ...newWorkflow, workflow_type: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WORKFLOW_TYPES.map(type => (
                        <SelectItem key={type.value} value={type.value}>
                          <div className="flex flex-col">
                            <span>{type.label}</span>
                            <span className="text-xs text-muted-foreground">{type.description}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={newWorkflow.description || ''}
                  onChange={(e) => setNewWorkflow({ ...newWorkflow, description: e.target.value })}
                  placeholder="Describe what this workflow does..."
                  rows={2}
                />
              </div>

              {/* Settings */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Settings2 className="h-4 w-4" />
                    Workflow Settings
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Max Calls Per Day</Label>
                      <Input
                        type="number"
                        value={newWorkflow.settings?.max_calls_per_day || 2}
                        onChange={(e) => setNewWorkflow({
                          ...newWorkflow,
                          settings: { ...newWorkflow.settings, max_calls_per_day: parseInt(e.target.value) || 2 }
                        })}
                        min={1}
                        max={10}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Hours Between Calls</Label>
                      <Input
                        type="number"
                        value={newWorkflow.settings?.call_spacing_hours || 5}
                        onChange={(e) => setNewWorkflow({
                          ...newWorkflow,
                          settings: { ...newWorkflow.settings, call_spacing_hours: parseInt(e.target.value) || 5 }
                        })}
                        min={1}
                        max={24}
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Pause on Weekends</Label>
                      <p className="text-xs text-muted-foreground">Skip Saturday/Sunday, resume Monday</p>
                    </div>
                    <Switch
                      checked={newWorkflow.settings?.pause_on_weekends || false}
                      onCheckedChange={(v) => setNewWorkflow({
                        ...newWorkflow,
                        settings: { ...newWorkflow.settings, pause_on_weekends: v }
                      })}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Workflow Content Tabs */}
              <Tabs value={workflowDialogTab} onValueChange={(v) => setWorkflowDialogTab(v as 'steps' | 'ai_reply')}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="steps" className="gap-2">
                    <Play className="h-4 w-4" />
                    Workflow Steps
                  </TabsTrigger>
                  <TabsTrigger value="ai_reply" className="gap-2">
                    <Zap className="h-4 w-4" />
                    AI Auto-Reply
                    {newWorkflow.auto_reply_settings?.enabled && (
                      <Badge variant="secondary" className="ml-1 text-xs">On</Badge>
                    )}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="steps" className="mt-4">
                  {/* Steps */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <Label className="text-base">Workflow Steps</Label>
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => setShowAIHelper(true)}
                      className="gap-1 bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600"
                    >
                      <Sparkles className="h-3 w-3" />
                      AI: What can I help you build?
                    </Button>
                    {STEP_TYPES.map(type => (
                      <Button
                        key={type.value}
                        variant="outline"
                        size="sm"
                        onClick={() => addStep(type.value as WorkflowStep['step_type'])}
                        className="gap-1"
                      >
                        <type.icon className="h-3 w-3" />
                        {type.label}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* AI Helper Dialog */}
                <Dialog open={showAIHelper} onOpenChange={setShowAIHelper}>
                  <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-purple-500" />
                    {editingWorkflow || newWorkflow.steps.length > 0 ? 'AI: Edit This Workflow' : 'AI Workflow Builder'}
                  </DialogTitle>
                  <DialogDescription>
                    {editingWorkflow || newWorkflow.steps.length > 0
                      ? 'Describe how you want to modify this workflow and AI will update the steps for you.'
                      : 'Describe what you want your workflow to do and AI will build the steps for you.'}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  {/* Show current workflow summary if editing */}
                  {(editingWorkflow || newWorkflow.steps.length > 0) && (
                    <div className="p-3 rounded-lg bg-muted/50 border border-border">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Current Workflow:</p>
                      <p className="text-sm font-medium">{newWorkflow.name || 'Untitled'}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {newWorkflow.steps.length} step{newWorkflow.steps.length !== 1 ? 's' : ''}: {newWorkflow.steps.map(s => s.step_type).join(' → ')}
                      </p>
                    </div>
                  )}
                  
                  <Textarea
                    value={aiPrompt}
                    onChange={(e) => setAIPrompt(e.target.value)}
                    placeholder={
                      editingWorkflow || newWorkflow.steps.length > 0
                        ? 'Example: Add an AI auto-reply step, remove the second call, make it more aggressive...'
                        : 'Example: Create a 3-day follow-up sequence that calls leads, sends an SMS if no answer, waits 1 day, then calls again...'
                    }
                    rows={4}
                    className="resize-none"
                  />
                  
                  {/* AI Auto-Reply Toggle */}
                  <div className="flex items-center justify-between p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-indigo-500" />
                      <div>
                        <p className="text-sm font-medium">Enable AI Auto-Reply?</p>
                        <p className="text-xs text-muted-foreground">AI will automatically respond to inbound SMS messages</p>
                      </div>
                    </div>
                    <Switch
                      checked={includeAiAutoReply}
                      onCheckedChange={setIncludeAiAutoReply}
                    />
                  </div>
                  
                  <div className="flex gap-2 text-xs text-muted-foreground flex-wrap">
                    <button 
                      type="button"
                      className="px-2 py-1 rounded bg-muted hover:bg-muted/80 transition-colors"
                      onClick={() => setAIPrompt(editingWorkflow || newWorkflow.steps.length > 0 
                        ? 'Make this workflow more aggressive with shorter wait times'
                        : 'Create a 3-day calling campaign with SMS follow-ups after missed calls')}
                    >
                      {editingWorkflow || newWorkflow.steps.length > 0 ? 'More aggressive' : '3-day calling campaign'}
                    </button>
                    <button 
                      type="button"
                      className="px-2 py-1 rounded bg-muted hover:bg-muted/80 transition-colors"
                      onClick={() => setAIPrompt(editingWorkflow || newWorkflow.steps.length > 0
                        ? 'Add AI auto-reply so leads get instant responses'
                        : 'Build a nurture sequence with 2 calls per day and AI SMS responses')}
                    >
                      {editingWorkflow || newWorkflow.steps.length > 0 ? 'Add AI auto-reply' : 'Nurture sequence'}
                    </button>
                    <button 
                      type="button"
                      className="px-2 py-1 rounded bg-muted hover:bg-muted/80 transition-colors"
                      onClick={() => setAIPrompt(editingWorkflow || newWorkflow.steps.length > 0
                        ? 'Add conditional logic: if they reply interested, stop calling'
                        : 'Add conditional logic: if no answer, send SMS; if interested, schedule callback')}
                    >
                      {editingWorkflow || newWorkflow.steps.length > 0 ? 'Add conditions' : 'Conditional logic'}
                    </button>
                  </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setShowAIHelper(false)}>
                          Cancel
                        </Button>
                        <Button 
                          onClick={handleAIBuildWorkflow}
                          disabled={aiLoading || !aiPrompt.trim()}
                          className="gap-2"
                        >
                          {aiLoading ? (
                            <>
                              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                              Building...
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-4 w-4" />
                              Build Steps
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>

                <div className="space-y-4">
                  {newWorkflow.steps?.length === 0 ? (
                    <Card className="border-dashed">
                      <CardContent className="py-8 text-center text-muted-foreground">
                        <Sparkles className="h-8 w-8 mx-auto mb-3 text-purple-400" />
                        <p className="font-medium">No steps yet</p>
                        <p className="text-sm mt-1">Click "AI: What can I help you build?" or add steps manually above</p>
                      </CardContent>
                    </Card>
                  ) : (
                    newWorkflow.steps?.map((step, index) => renderStepEditor(step, index))
                  )}
                </div>
                  </div>
                </TabsContent>

                <TabsContent value="ai_reply" className="mt-4 space-y-4">
                  <Card className="bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Zap className="h-4 w-4 text-indigo-600" />
                        Workflow AI Auto-Reply
                      </CardTitle>
                      <CardDescription>
                        When enabled, leads in this workflow get AI responses that override the global SMS agent.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label>Enable AI Auto-Reply</Label>
                          <p className="text-xs text-muted-foreground">Override global SMS agent for leads in this workflow</p>
                        </div>
                        <Switch
                          checked={newWorkflow.auto_reply_settings?.enabled || false}
                          onCheckedChange={(v) => setNewWorkflow({
                            ...newWorkflow,
                            auto_reply_settings: {
                              enabled: v,
                              ai_instructions: newWorkflow.auto_reply_settings?.ai_instructions || '',
                              response_delay_seconds: newWorkflow.auto_reply_settings?.response_delay_seconds || 5,
                              stop_on_human_reply: newWorkflow.auto_reply_settings?.stop_on_human_reply ?? true,
                              calendar_enabled: newWorkflow.auto_reply_settings?.calendar_enabled || false,
                              booking_link: newWorkflow.auto_reply_settings?.booking_link || '',
                            }
                          })}
                        />
                      </div>
                      {newWorkflow.auto_reply_settings?.enabled && (
                        <div className="space-y-4 pt-4 border-t">
                          <div className="space-y-2">
                            <Label>AI Instructions</Label>
                            <Textarea
                              value={newWorkflow.auto_reply_settings?.ai_instructions || ''}
                              onChange={(e) => setNewWorkflow({
                                ...newWorkflow,
                                auto_reply_settings: { ...newWorkflow.auto_reply_settings!, ai_instructions: e.target.value }
                              })}
                              placeholder="Custom AI personality for this workflow..."
                              rows={4}
                            />
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setShowCreateDialog(false); resetForm(); }}>
                  Cancel
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setShowTester(true)}
                  disabled={newWorkflow.steps.length === 0}
                >
                  <Play className="h-4 w-4 mr-2" />
                  Test Workflow
                </Button>
                <Button onClick={handleSaveWorkflow}>
                  {editingWorkflow ? 'Update Workflow' : 'Create Workflow'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="workflows">Workflows</TabsTrigger>
          <TabsTrigger value="disposition-actions">Disposition Actions</TabsTrigger>
        </TabsList>

        <TabsContent value="workflows" className="space-y-4">
          {workflows.length === 0 && !isLoading ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center text-muted-foreground">
                <Zap className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No workflows yet</p>
                <p className="text-sm">Create your first workflow to automate your campaigns</p>
              </CardContent>
            </Card>
          ) : (
            workflows.map(workflow => (
              <Card key={workflow.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`p-2 rounded-lg ${workflow.active ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}>
                        {workflow.active ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                      </div>
                      <div>
                        <h3 className="font-semibold flex items-center gap-2">
                          {workflow.name}
                          <Badge variant="secondary" className="capitalize">
                            {workflow.workflow_type.replace('_', ' ')}
                          </Badge>
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {workflow.steps?.length || 0} steps • 
                          {workflow.settings?.max_calls_per_day || 2} calls/day
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleEditWorkflow(workflow)}>
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => deleteWorkflow(workflow.id!)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="disposition-actions" className="space-y-4">
          {/* Create disposition action form */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Auto-Actions by Disposition</CardTitle>
              <CardDescription>
                Automatically handle leads based on call outcomes (e.g., DNC for rude callers)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Disposition</Label>
                  <Select 
                    value={newDispositionAction.disposition_name || ''} 
                    onValueChange={(v) => setNewDispositionAction({ ...newDispositionAction, disposition_name: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select disposition" />
                    </SelectTrigger>
                    <SelectContent>
                      {NEGATIVE_DISPOSITIONS.map(d => (
                        <SelectItem key={d} value={d}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Action</Label>
                  <Select 
                    value={newDispositionAction.action_type} 
                    onValueChange={(v: DispositionAutoAction['action_type']) => setNewDispositionAction({ ...newDispositionAction, action_type: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DISPOSITION_ACTIONS.map(a => (
                        <SelectItem key={a.value} value={a.value}>
                          <div className="flex items-center gap-2">
                            <a.icon className="h-4 w-4" />
                            {a.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button onClick={handleSaveDispositionAction} className="w-full">
                    Add Action
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Existing actions */}
          {dispositionActions.map(action => (
            <Card key={action.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <Badge variant="outline">{action.disposition_name}</Badge>
                    <ArrowDown className="h-4 w-4 text-muted-foreground" />
                    <Badge>
                      {DISPOSITION_ACTIONS.find(a => a.value === action.action_type)?.label}
                    </Badge>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => deleteDispositionAction(action.id!)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}

          {dispositionActions.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="py-8 text-center text-muted-foreground">
                <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No disposition actions configured</p>
                <p className="text-xs">Add actions above to auto-handle negative dispositions</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Workflow Tester */}
      <WorkflowTester
        open={showTester}
        workflow={newWorkflow}
        onClose={() => setShowTester(false)}
        onTestComplete={(results) => {
          console.log('Test results:', results);
          toast({
            title: 'Test Complete',
            description: `${results.results.successfulSteps}/${results.results.totalSteps} steps successful`,
          });
        }}
      />
    </div>
  );
};

export default WorkflowBuilder;
