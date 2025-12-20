import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Phone, MessageSquare, Clock, GitBranch, Sparkles, 
  Plus, Trash2, Save, ArrowDown, GripVertical, Edit2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface WorkflowStep {
  id?: string;
  step_number: number;
  step_type: string;
  step_config: Record<string, any>;
}

interface Workflow {
  id: string;
  name: string;
  description?: string;
  workflow_type: string;
  active: boolean;
  settings?: Record<string, any>;
}

interface CampaignWorkflowEditorProps {
  open: boolean;
  onClose: () => void;
  workflowId: string;
  campaignName: string;
}

const STEP_TYPES = [
  { value: 'call', label: 'Phone Call', icon: Phone, color: 'bg-blue-500' },
  { value: 'sms', label: 'SMS Message', icon: MessageSquare, color: 'bg-green-500' },
  { value: 'ai_sms', label: 'AI SMS', icon: Sparkles, color: 'bg-purple-500' },
  { value: 'wait', label: 'Wait/Delay', icon: Clock, color: 'bg-orange-500' },
  { value: 'condition', label: 'Condition', icon: GitBranch, color: 'bg-yellow-500' },
];

export const CampaignWorkflowEditor: React.FC<CampaignWorkflowEditorProps> = ({
  open,
  onClose,
  workflowId,
  campaignName
}) => {
  const { toast } = useToast();
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editingStep, setEditingStep] = useState<number | null>(null);

  useEffect(() => {
    if (open && workflowId) {
      loadWorkflow();
    }
  }, [open, workflowId]);

  const loadWorkflow = async () => {
    setIsLoading(true);
    try {
      // Load workflow
      const { data: workflowData, error: workflowError } = await supabase
        .from('campaign_workflows')
        .select('*')
        .eq('id', workflowId)
        .single();

      if (workflowError) throw workflowError;
      setWorkflow({
        ...workflowData,
        settings: (workflowData.settings as Record<string, any>) || {}
      });

      // Load steps
      const { data: stepsData, error: stepsError } = await supabase
        .from('workflow_steps')
        .select('*')
        .eq('workflow_id', workflowId)
        .order('step_number');

      if (stepsError) throw stepsError;
      setSteps((stepsData || []).map(step => ({
        ...step,
        step_config: (step.step_config as Record<string, any>) || {}
      })));
    } catch (error) {
      console.error('Error loading workflow:', error);
      toast({
        title: 'Error',
        description: 'Failed to load workflow',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!workflow) return;
    
    setIsSaving(true);
    try {
      // Update workflow
      const { error: workflowError } = await supabase
        .from('campaign_workflows')
        .update({
          name: workflow.name,
          description: workflow.description,
          updated_at: new Date().toISOString()
        })
        .eq('id', workflowId);

      if (workflowError) throw workflowError;

      // Delete existing steps and re-insert
      await supabase
        .from('workflow_steps')
        .delete()
        .eq('workflow_id', workflowId);

      if (steps.length > 0) {
        const stepsToInsert = steps.map((step, index) => ({
          workflow_id: workflowId,
          step_number: index + 1,
          step_type: step.step_type,
          step_config: step.step_config
        }));

        const { error: stepsError } = await supabase
          .from('workflow_steps')
          .insert(stepsToInsert);

        if (stepsError) throw stepsError;
      }

      toast({
        title: 'Workflow Saved',
        description: 'Changes have been saved successfully'
      });
    } catch (error) {
      console.error('Error saving workflow:', error);
      toast({
        title: 'Error',
        description: 'Failed to save workflow',
        variant: 'destructive'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const addStep = (type: string) => {
    const newStep: WorkflowStep = {
      step_number: steps.length + 1,
      step_type: type,
      step_config: type === 'wait' ? { delay_hours: 1 } : 
                   type === 'sms' ? { sms_content: '' } :
                   type === 'call' ? { max_attempts: 1 } : {}
    };
    setSteps([...steps, newStep]);
    setEditingStep(steps.length);
  };

  const removeStep = (index: number) => {
    setSteps(steps.filter((_, i) => i !== index));
    setEditingStep(null);
  };

  const updateStepConfig = (index: number, config: Record<string, any>) => {
    const updated = [...steps];
    updated[index] = { ...updated[index], step_config: { ...updated[index].step_config, ...config } };
    setSteps(updated);
  };

  const getStepIcon = (type: string) => {
    const stepType = STEP_TYPES.find(s => s.value === type);
    return stepType || STEP_TYPES[0];
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit2 className="h-5 w-5" />
            Edit Workflow for {campaignName}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : workflow ? (
          <div className="space-y-4">
            {/* Workflow Info */}
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">Workflow Name</label>
                <Input
                  value={workflow.name}
                  onChange={(e) => setWorkflow({ ...workflow, name: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Description</label>
                <Textarea
                  value={workflow.description || ''}
                  onChange={(e) => setWorkflow({ ...workflow, description: e.target.value })}
                  rows={2}
                />
              </div>
            </div>

            {/* Steps */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Workflow Steps</label>
                <Badge variant="secondary">{steps.length} steps</Badge>
              </div>

              {steps.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="py-6 text-center text-muted-foreground">
                    No steps yet. Add a step below to get started.
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {steps.map((step, index) => {
                    const stepInfo = getStepIcon(step.step_type);
                    const Icon = stepInfo.icon;
                    const isEditing = editingStep === index;

                    return (
                      <Card key={index} className={isEditing ? 'ring-2 ring-primary' : ''}>
                        <CardContent className="p-3">
                          <div className="flex items-start gap-3">
                            <div className="flex items-center gap-2">
                              <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                              <div className={`${stepInfo.color} p-2 rounded text-white`}>
                                <Icon className="h-4 w-4" />
                              </div>
                            </div>
                            
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <span className="font-medium text-sm">
                                  Step {index + 1}: {stepInfo.label}
                                </span>
                                <div className="flex gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setEditingStep(isEditing ? null : index)}
                                  >
                                    <Edit2 className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => removeStep(index)}
                                  >
                                    <Trash2 className="h-3 w-3 text-destructive" />
                                  </Button>
                                </div>
                              </div>

                              {isEditing && (
                                <div className="mt-3 space-y-2">
                                  {step.step_type === 'wait' && (
                                    <div className="grid grid-cols-3 gap-2">
                                      <div>
                                        <label className="text-xs">Days</label>
                                        <Input
                                          type="number"
                                          min="0"
                                          value={step.step_config.delay_days || 0}
                                          onChange={(e) => updateStepConfig(index, { delay_days: parseInt(e.target.value) || 0 })}
                                        />
                                      </div>
                                      <div>
                                        <label className="text-xs">Hours</label>
                                        <Input
                                          type="number"
                                          min="0"
                                          value={step.step_config.delay_hours || 0}
                                          onChange={(e) => updateStepConfig(index, { delay_hours: parseInt(e.target.value) || 0 })}
                                        />
                                      </div>
                                      <div>
                                        <label className="text-xs">Minutes</label>
                                        <Input
                                          type="number"
                                          min="0"
                                          value={step.step_config.delay_minutes || 0}
                                          onChange={(e) => updateStepConfig(index, { delay_minutes: parseInt(e.target.value) || 0 })}
                                        />
                                      </div>
                                    </div>
                                  )}

                                  {step.step_type === 'sms' && (
                                    <div>
                                      <label className="text-xs">SMS Content</label>
                                      <Textarea
                                        value={step.step_config.sms_content || ''}
                                        onChange={(e) => updateStepConfig(index, { sms_content: e.target.value })}
                                        rows={3}
                                        placeholder="Enter SMS message..."
                                      />
                                    </div>
                                  )}

                                  {step.step_type === 'ai_sms' && (
                                    <div>
                                      <label className="text-xs">AI Instructions</label>
                                      <Textarea
                                        value={step.step_config.ai_prompt || ''}
                                        onChange={(e) => updateStepConfig(index, { ai_prompt: e.target.value })}
                                        rows={3}
                                        placeholder="Instructions for AI to generate SMS..."
                                      />
                                    </div>
                                  )}

                                  {step.step_type === 'call' && (
                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <label className="text-xs">Max Attempts</label>
                                        <Input
                                          type="number"
                                          min="1"
                                          max="10"
                                          value={step.step_config.max_attempts || 1}
                                          onChange={(e) => updateStepConfig(index, { max_attempts: parseInt(e.target.value) || 1 })}
                                        />
                                      </div>
                                      <div>
                                        <label className="text-xs">Max Ring (sec)</label>
                                        <Input
                                          type="number"
                                          min="10"
                                          max="60"
                                          value={step.step_config.max_ring_seconds || 30}
                                          onChange={(e) => updateStepConfig(index, { max_ring_seconds: parseInt(e.target.value) || 30 })}
                                        />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}

              {/* Add Step Buttons */}
              <div className="flex flex-wrap gap-2 pt-2">
                {STEP_TYPES.map((type) => {
                  const Icon = type.icon;
                  return (
                    <Button
                      key={type.value}
                      variant="outline"
                      size="sm"
                      onClick={() => addStep(type.value)}
                    >
                      <Icon className="h-3 w-3 mr-1" />
                      Add {type.label}
                    </Button>
                  );
                })}
              </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                <Save className="h-4 w-4 mr-2" />
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            Workflow not found
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
