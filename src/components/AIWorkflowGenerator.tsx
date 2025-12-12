import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sparkles, Loader2, Phone, MessageSquare, Clock, Zap, Check, Save, Edit2, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { useAIWorkflowGenerator } from '@/hooks/useAIWorkflowGenerator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

const EXAMPLE_PROMPTS = [
  "Call twice a day, 5 hours apart for 3 days, then pause until Saturday morning and blast at 9am and 12pm",
  "Follow-up workflow: Send thank you SMS immediately, wait 1 hour and send appointment reminder, then call next day",
  "Cold call campaign: Call at 10am, if no answer send SMS after 30 minutes, retry call at 3pm, repeat for 5 days",
  "Appointment reminder: SMS 24 hours before, call 2 hours before, final SMS 30 minutes before",
];

const StepIcon = ({ type }: { type: string }) => {
  switch (type) {
    case 'call': return <Phone className="h-4 w-4" />;
    case 'sms': return <MessageSquare className="h-4 w-4" />;
    case 'ai_sms': return <Sparkles className="h-4 w-4" />;
    case 'wait': return <Clock className="h-4 w-4" />;
    default: return <Zap className="h-4 w-4" />;
  }
};

const formatWaitTime = (config: any) => {
  const parts = [];
  if (config.delay_days) parts.push(`${config.delay_days}d`);
  if (config.delay_hours) parts.push(`${config.delay_hours}h`);
  if (config.delay_minutes) parts.push(`${config.delay_minutes}m`);
  if (config.time_of_day) parts.push(`at ${config.time_of_day}`);
  return parts.join(' ') || 'Immediately';
};

export const AIWorkflowGenerator = () => {
  const [prompt, setPrompt] = useState('');
  const [workflowType, setWorkflowType] = useState('mixed');
  const [refinementPrompt, setRefinementPrompt] = useState('');
  const [editingStepIndex, setEditingStepIndex] = useState<number | null>(null);
  const [editedContent, setEditedContent] = useState('');
  const [showRefinement, setShowRefinement] = useState(false);
  const { isGenerating, generatedWorkflow, generateWorkflow, saveGeneratedWorkflow, setGeneratedWorkflow } = useAIWorkflowGenerator();
  const [isSaving, setIsSaving] = useState(false);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    await generateWorkflow(prompt, workflowType);
    setShowRefinement(false);
    setRefinementPrompt('');
  };

  const handleRefine = async () => {
    if (!refinementPrompt.trim() || !generatedWorkflow) return;
    const fullPrompt = `${prompt}\n\nModifications requested: ${refinementPrompt}`;
    await generateWorkflow(fullPrompt, workflowType);
    setRefinementPrompt('');
  };

  const handleEditStep = (index: number) => {
    if (!generatedWorkflow) return;
    const step = generatedWorkflow.steps[index];
    setEditingStepIndex(index);
    setEditedContent(step.step_config.content || step.step_config.ai_prompt || '');
  };

  const handleSaveStepEdit = () => {
    if (editingStepIndex === null || !generatedWorkflow) return;
    
    const updatedSteps = [...generatedWorkflow.steps];
    const step = updatedSteps[editingStepIndex];
    
    if (step.step_config.content !== undefined) {
      step.step_config.content = editedContent;
    } else if (step.step_config.ai_prompt !== undefined) {
      step.step_config.ai_prompt = editedContent;
    }
    
    setGeneratedWorkflow({
      ...generatedWorkflow,
      steps: updatedSteps
    });
    setEditingStepIndex(null);
    setEditedContent('');
  };

  const handleSave = async () => {
    if (!generatedWorkflow) return;
    setIsSaving(true);
    await saveGeneratedWorkflow(generatedWorkflow, 'good');
    setIsSaving(false);
    setPrompt('');
    setShowRefinement(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-purple-500" />
          AI Workflow Generator
        </CardTitle>
        <CardDescription>
          Describe your ideal workflow in plain English and AI will build it for you
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Workflow Type</label>
          <Select value={workflowType} onValueChange={setWorkflowType}>
            <SelectTrigger className="w-full max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="calling_only">Calling Only</SelectItem>
              <SelectItem value="follow_up">Follow-up</SelectItem>
              <SelectItem value="mixed">Mixed (Calls + SMS)</SelectItem>
              <SelectItem value="appointment_reminder">Appointment Reminder</SelectItem>
              <SelectItem value="no_show">No Show Follow-up</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Describe Your Workflow</label>
          <Textarea
            placeholder="Example: Call twice a day, 5 hours apart, for 3 days. If no answer, send an SMS. Pause until Saturday, then blast at 9am..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            className="resize-none"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-muted-foreground">Try:</span>
          {EXAMPLE_PROMPTS.slice(0, 2).map((example, i) => (
            <button
              key={i}
              onClick={() => setPrompt(example)}
              className="text-xs text-primary hover:underline"
            >
              "{example.slice(0, 40)}..."
            </button>
          ))}
        </div>

        <Button 
          onClick={handleGenerate} 
          disabled={!prompt.trim() || isGenerating}
          className="w-full"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Generating Workflow...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Generate Workflow
            </>
          )}
        </Button>

        {generatedWorkflow && (
          <div className="mt-6 space-y-4 border-t pt-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h4 className="font-semibold">{generatedWorkflow.name}</h4>
                <p className="text-sm text-muted-foreground">{generatedWorkflow.description}</p>
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setShowRefinement(!showRefinement)}
                >
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Refine
                </Button>
                <Button onClick={handleSave} disabled={isSaving} size="sm">
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-1" />
                      Save Workflow
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Refinement Section */}
            {showRefinement && (
              <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg space-y-2">
                <p className="text-sm font-medium">Request changes to this workflow:</p>
                <Textarea
                  placeholder="e.g., Add another call at 5pm, change the SMS message to be more friendly, wait 2 days instead of 1..."
                  value={refinementPrompt}
                  onChange={(e) => setRefinementPrompt(e.target.value)}
                  rows={2}
                  className="resize-none"
                />
                <div className="flex gap-2">
                  <Button 
                    size="sm" 
                    onClick={handleRefine}
                    disabled={!refinementPrompt.trim() || isGenerating}
                  >
                    {isGenerating ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <Sparkles className="h-4 w-4 mr-1" />
                    )}
                    Regenerate with Changes
                  </Button>
                  <Button 
                    size="sm" 
                    variant="ghost"
                    onClick={() => setShowRefinement(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <h5 className="text-sm font-medium">Steps ({generatedWorkflow.steps.length}) - Click to edit</h5>
              <div className="space-y-2">
                {generatedWorkflow.steps.map((step, index) => (
                  <div 
                    key={index} 
                    className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg group hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-medium">
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <StepIcon type={step.step_type} />
                        <Badge variant="outline" className="capitalize">
                          {step.step_type.replace('_', ' ')}
                        </Badge>
                        {step.step_type === 'wait' && (
                          <span className="text-sm text-muted-foreground">
                            {formatWaitTime(step.step_config)}
                          </span>
                        )}
                      </div>
                      
                      {editingStepIndex === index ? (
                        <div className="mt-2 space-y-2">
                          <Textarea
                            value={editedContent}
                            onChange={(e) => setEditedContent(e.target.value)}
                            rows={2}
                            className="text-sm"
                          />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={handleSaveStepEdit}>
                              <Check className="h-3 w-3 mr-1" /> Save
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingStepIndex(null)}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {step.step_config.content && (
                            <p className="text-sm text-muted-foreground mt-1">
                              "{step.step_config.content}"
                            </p>
                          )}
                          {step.step_config.ai_prompt && (
                            <p className="text-sm text-purple-600 mt-1">
                              AI: {step.step_config.ai_prompt}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                    
                    {(step.step_config.content || step.step_config.ai_prompt) && editingStepIndex !== index && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => handleEditStep(index)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {generatedWorkflow.sms_templates && generatedWorkflow.sms_templates.length > 0 && (
              <div className="space-y-2">
                <h5 className="text-sm font-medium">SMS Templates</h5>
                <div className="space-y-2">
                  {generatedWorkflow.sms_templates.map((template, index) => (
                    <div key={index} className="p-2 bg-blue-50 dark:bg-blue-950 rounded text-sm">
                      {template}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AIWorkflowGenerator;
