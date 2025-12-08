import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
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
    active: true,
    steps: []
  });

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
      defaultConfig.delay_hours = 5;
    } else if (type === 'sms' || type === 'ai_sms') {
      defaultConfig.sms_content = '';
    } else if (type === 'call') {
      defaultConfig.time_of_day = '09:00';
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
                  <div className="grid grid-cols-2 gap-4">
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

              {/* Steps */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-base">Workflow Steps</Label>
                  <div className="flex gap-2">
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

                <div className="space-y-4">
                  {newWorkflow.steps?.length === 0 ? (
                    <Card className="border-dashed">
                      <CardContent className="py-8 text-center text-muted-foreground">
                        <p>No steps yet. Add steps above to build your workflow.</p>
                      </CardContent>
                    </Card>
                  ) : (
                    newWorkflow.steps?.map((step, index) => renderStepEditor(step, index))
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setShowCreateDialog(false); resetForm(); }}>
                  Cancel
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
    </div>
  );
};

export default WorkflowBuilder;
