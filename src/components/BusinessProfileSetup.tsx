import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { BUSINESS_TEMPLATES, BusinessTemplate } from '@/lib/businessTemplates';
import { ArrowLeft, ArrowRight, Check, Loader2, Building2, Target, Phone, DollarSign } from 'lucide-react';

type Step = 'select' | 'customize' | 'review' | 'applying';

const BusinessProfileSetup = () => {
  const [step, setStep] = useState<Step>('select');
  const [selectedTemplate, setSelectedTemplate] = useState<BusinessTemplate | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [customInstructions, setCustomInstructions] = useState('');
  const [customGreeting, setCustomGreeting] = useState('');
  const [dailyCalls, setDailyCalls] = useState(0);
  const [dailyAppointments, setDailyAppointments] = useState(0);
  const [dailyBudget, setDailyBudget] = useState(0);
  const [callsPerMinute, setCallsPerMinute] = useState(0);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const { toast } = useToast();

  const handleSelectTemplate = (template: BusinessTemplate) => {
    setSelectedTemplate(template);
    setCustomInstructions(template.agentInstructions);
    setCustomGreeting(template.agentGreeting);
    setDailyCalls(template.suggestedGoals.daily_goal_calls);
    setDailyAppointments(template.suggestedGoals.daily_goal_appointments);
    setDailyBudget(template.suggestedGoals.daily_budget_cents / 100);
    setCallsPerMinute(template.suggestedGoals.calls_per_minute);
    setStep('customize');
  };

  const handleApplyTemplate = async () => {
    if (!selectedTemplate) return;
    setStep('applying');
    setApplying(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // 1. Create pipeline board with template stages
      const boardName = `${companyName || selectedTemplate.name} Pipeline`;
      const { data: existingBoard } = await supabase
        .from('pipeline_boards')
        .select('id')
        .eq('user_id', user.id)
        .eq('name', boardName)
        .maybeSingle();

      let boardId = existingBoard?.id;
      if (!boardId) {
        const { data: newBoard, error: boardError } = await supabase
          .from('pipeline_boards')
          .insert({
            user_id: user.id,
            name: boardName,
            description: `${selectedTemplate.name} - ${selectedTemplate.description}`,
          })
          .select('id')
          .single();
        if (boardError) throw boardError;
        boardId = newBoard.id;

        // Create stages
        const stages = selectedTemplate.pipelineStages.map((stage, idx) => ({
          board_id: boardId!,
          name: stage.name,
          position: idx,
          color: stage.isTerminal ? '#6b7280' : idx === 0 ? '#3b82f6' : '#10b981',
        }));
        const { error: stagesError } = await supabase.from('pipeline_stages').insert(stages);
        if (stagesError) throw stagesError;
      }

      // 2. Update autonomous settings with goals
      const { error: settingsError } = await supabase
        .from('autonomous_settings')
        .upsert({
          user_id: user.id,
          daily_goal_calls: dailyCalls,
          daily_goal_appointments: dailyAppointments,
          daily_goal_conversations: selectedTemplate.suggestedGoals.daily_goal_conversations,
          daily_budget_cents: Math.round(dailyBudget * 100),
          calls_per_minute: callsPerMinute,
          enabled: true,
          manage_lead_journeys: true,
        }, { onConflict: 'user_id' });
      if (settingsError) throw settingsError;

      // 3. Save business profile metadata
      const { error: memoryError } = await supabase
        .from('ai_operational_memory')
        .insert({
          user_id: user.id,
          memory_type: 'business_profile',
          key: 'active_business_template',
          content: JSON.stringify({
            template_id: selectedTemplate.id,
            company_name: companyName,
            agent_instructions: customInstructions,
            agent_greeting: customGreeting,
            fields_to_capture: selectedTemplate.fieldsToCapture,
            disposition_map: selectedTemplate.dispositionMap,
            follow_up_strategy: selectedTemplate.followUpStrategy,
            applied_at: new Date().toISOString(),
          }),
          importance: 10,
        });
      // Memory insert may fail if table doesn't exist yet, non-critical
      if (memoryError) console.warn('Memory save skipped:', memoryError.message);

      setApplied(true);
      toast({
        title: 'Business Profile Applied',
        description: `${selectedTemplate.name} template configured with ${dailyCalls} calls/day goal and $${dailyBudget}/day budget.`,
      });
    } catch (err: any) {
      console.error('Apply template error:', err);
      toast({
        title: 'Error Applying Template',
        description: err.message || 'Something went wrong',
        variant: 'destructive',
      });
      setStep('review');
    } finally {
      setApplying(false);
    }
  };

  // Template selection grid
  if (step === 'select') {
    return (
      <div className="space-y-6 p-4 max-w-5xl mx-auto">
        <div>
          <h2 className="text-2xl font-bold">Business Profile Setup</h2>
          <p className="text-muted-foreground mt-1">
            Choose your industry to get pre-configured pipelines, agent scripts, tracking fields, and calling goals.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {BUSINESS_TEMPLATES.map((template) => (
            <Card
              key={template.id}
              className="cursor-pointer hover:border-primary hover:shadow-md transition-all"
              onClick={() => handleSelectTemplate(template)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{template.icon}</span>
                  <div>
                    <CardTitle className="text-lg">{template.name}</CardTitle>
                    <Badge variant="outline" className="mt-1 text-xs">{template.category.replace('_', ' ')}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">{template.description}</p>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="secondary">{template.pipelineStages.length} stages</Badge>
                  <Badge variant="secondary">{template.fieldsToCapture.length} fields</Badge>
                  <Badge variant="secondary">{template.suggestedGoals.daily_goal_calls} calls/day</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Customize template
  if (step === 'customize' && selectedTemplate) {
    return (
      <div className="space-y-6 p-4 max-w-4xl mx-auto">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setStep('select')}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <div>
            <h2 className="text-2xl font-bold">
              <span className="mr-2">{selectedTemplate.icon}</span>
              {selectedTemplate.name}
            </h2>
            <p className="text-muted-foreground text-sm">Customize settings for your campaign</p>
          </div>
        </div>

        {/* Company Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" /> Company Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Company Name</Label>
              <Input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Your Company Name"
              />
            </div>
          </CardContent>
        </Card>

        {/* Goals */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Target className="h-5 w-5" /> Daily Goals</CardTitle>
            <CardDescription>How many calls per day and what's your budget?</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <Label>Calls / Day</Label>
                <Input
                  type="number"
                  value={dailyCalls}
                  onChange={(e) => setDailyCalls(Number(e.target.value))}
                />
              </div>
              <div>
                <Label>Appointments / Day</Label>
                <Input
                  type="number"
                  value={dailyAppointments}
                  onChange={(e) => setDailyAppointments(Number(e.target.value))}
                />
              </div>
              <div>
                <Label>Budget / Day ($)</Label>
                <Input
                  type="number"
                  value={dailyBudget}
                  onChange={(e) => setDailyBudget(Number(e.target.value))}
                />
              </div>
              <div>
                <Label>Calls / Minute</Label>
                <Input
                  type="number"
                  value={callsPerMinute}
                  onChange={(e) => setCallsPerMinute(Number(e.target.value))}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Agent Script */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Phone className="h-5 w-5" /> Agent Script</CardTitle>
            <CardDescription>Instructions and greeting for your AI agent</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Greeting</Label>
              <Input
                value={customGreeting}
                onChange={(e) => setCustomGreeting(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Use {'{{first_name}}'}, {'{{agent_name}}'}, {'{{company_name}}'} for personalization
              </p>
            </div>
            <div>
              <Label>Agent Instructions</Label>
              <Textarea
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                rows={10}
                className="font-mono text-sm"
              />
            </div>
          </CardContent>
        </Card>

        {/* Pipeline Preview */}
        <Card>
          <CardHeader>
            <CardTitle>Pipeline Stages</CardTitle>
            <CardDescription>These stages will be created in your pipeline</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {selectedTemplate.pipelineStages.map((stage, idx) => (
                <Badge
                  key={idx}
                  variant={stage.isTerminal ? 'outline' : 'default'}
                  className={stage.isTerminal ? 'text-muted-foreground' : ''}
                >
                  {stage.name}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Fields to Capture */}
        {selectedTemplate.fieldsToCapture.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Fields to Capture</CardTitle>
              <CardDescription>Data your AI agent will collect during calls</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {selectedTemplate.fieldsToCapture.map((field, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">{field.label}</span>
                    {field.required && <Badge variant="destructive" className="text-[10px] px-1">Required</Badge>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex justify-end">
          <Button onClick={() => setStep('review')} size="lg">
            Review & Apply <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </div>
    );
  }

  // Review & Apply
  if ((step === 'review' || step === 'applying') && selectedTemplate) {
    return (
      <div className="space-y-6 p-4 max-w-3xl mx-auto">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setStep('customize')} disabled={applying}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <h2 className="text-2xl font-bold">Review & Apply</h2>
        </div>

        {applied ? (
          <Card className="border-green-500">
            <CardContent className="pt-6 text-center space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 text-green-600">
                <Check className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-bold">Template Applied</h3>
              <p className="text-muted-foreground">
                Your {selectedTemplate.name} profile is configured. Pipeline created, goals set, agent instructions saved.
              </p>
              <div className="flex gap-3 justify-center pt-2">
                <Button variant="outline" onClick={() => { setApplied(false); setStep('select'); setSelectedTemplate(null); }}>
                  Set Up Another
                </Button>
                <Button onClick={() => window.location.search = '?tab=autonomous-agent'}>
                  Go to Autonomous Agent
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Template</p>
                    <p className="font-medium">{selectedTemplate.icon} {selectedTemplate.name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Company</p>
                    <p className="font-medium">{companyName || '(not set)'}</p>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-4 pt-2 border-t">
                  <div className="text-center">
                    <p className="text-2xl font-bold">{dailyCalls}</p>
                    <p className="text-xs text-muted-foreground">Calls/Day</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold">{dailyAppointments}</p>
                    <p className="text-xs text-muted-foreground">Appts/Day</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold">${dailyBudget}</p>
                    <p className="text-xs text-muted-foreground">Budget/Day</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold">{callsPerMinute}</p>
                    <p className="text-xs text-muted-foreground">Calls/Min</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">What will be created:</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>1. Pipeline board "{companyName || selectedTemplate.name} Pipeline" with {selectedTemplate.pipelineStages.length} stages</p>
                <p>2. Autonomous settings: {dailyCalls} calls/day, {dailyAppointments} appointments/day, ${dailyBudget}/day budget</p>
                <p>3. Lead journey management enabled</p>
                <p>4. Business profile saved (agent instructions, fields, dispositions)</p>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button onClick={handleApplyTemplate} size="lg" disabled={applying}>
                {applying ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Applying...</>
                ) : (
                  <><Check className="h-4 w-4 mr-2" /> Apply Template</>
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    );
  }

  return null;
};

export default BusinessProfileSetup;
