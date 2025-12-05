import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2, Edit, CheckCircle, XCircle, Clock, Zap, MessageSquare, Phone, Mail } from 'lucide-react';
import { useDispositionAutomation } from '@/hooks/useDispositionAutomation';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface Disposition {
  id: string;
  name: string;
  description: string;
  color: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  auto_create_pipeline_stage: boolean;
  pipeline_stage_name: string;
  follow_up_action: string;
}

const DispositionAutomationManager: React.FC = () => {
  const { 
    isLoading, 
    initializeStandardDispositions,
    createSequence 
  } = useDispositionAutomation();
  const { toast } = useToast();

  const [dispositions, setDispositions] = useState<Disposition[]>([]);
  const [sequences, setSequences] = useState<any[]>([]);
  const [showDispositionDialog, setShowDispositionDialog] = useState(false);
  const [showSequenceDialog, setShowSequenceDialog] = useState(false);

  // New disposition form
  const [newDisposition, setNewDisposition] = useState({
    name: '',
    description: '',
    sentiment: 'neutral' as 'positive' | 'neutral' | 'negative',
    color: '#F59E0B',
    auto_create_pipeline_stage: true,
    pipeline_stage_name: '',
    follow_up_action: 'none' as 'none' | 'callback' | 'sequence',
    follow_up_delay_minutes: 1440
  });

  // New sequence form
  const [newSequence, setNewSequence] = useState({
    name: '',
    description: '',
    steps: [] as any[]
  });

  const [newStep, setNewStep] = useState({
    action_type: 'ai_call' as 'ai_call' | 'ai_sms' | 'manual_sms' | 'email' | 'wait',
    delay_minutes: 60,
    content: '',
    ai_prompt: ''
  });

  useEffect(() => {
    loadDispositions();
    loadSequences();
  }, []);

  const loadDispositions = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: disps } = await supabase
        .from('dispositions')
        .select(`
          *,
          disposition_rules (*)
        `)
        .eq('user_id', user.id)
        .order('created_at');

      if (disps) {
        const formatted = disps.map(d => ({
          id: d.id,
          name: d.name,
          description: d.description,
          color: d.color,
          sentiment: d.disposition_rules?.[0]?.sentiment || 'neutral',
          auto_create_pipeline_stage: d.disposition_rules?.[0]?.auto_create_pipeline_stage || false,
          pipeline_stage_name: d.disposition_rules?.[0]?.pipeline_stage_name || '',
          follow_up_action: d.disposition_rules?.[0]?.follow_up_action || 'none'
        }));
        setDispositions(formatted);
      }
    } catch (error) {
      console.error('Error loading dispositions:', error);
    }
  };

  const loadSequences = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: seqs } = await supabase
        .from('follow_up_sequences')
        .select(`
          *,
          sequence_steps (*)
        `)
        .eq('user_id', user.id)
        .order('created_at');

      setSequences(seqs || []);
    } catch (error) {
      console.error('Error loading sequences:', error);
    }
  };

  const handleInitializeStandard = async () => {
    await initializeStandardDispositions();
    loadDispositions();
  };

  const handleCreateDisposition = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Create disposition
      const { data: disp, error: dispError } = await supabase
        .from('dispositions')
        .insert({
          user_id: user.id,
          name: newDisposition.name,
          description: newDisposition.description,
          color: newDisposition.color,
          pipeline_stage: newDisposition.pipeline_stage_name || newDisposition.name.toLowerCase().replace(/\s+/g, '_'),
          auto_actions: []
        })
        .select()
        .single();

      if (dispError) throw dispError;

      // Create disposition rule
      await supabase
        .from('disposition_rules')
        .insert({
          user_id: user.id,
          disposition_id: disp.id,
          disposition_name: newDisposition.name,
          sentiment: newDisposition.sentiment,
          auto_create_pipeline_stage: newDisposition.auto_create_pipeline_stage,
          pipeline_stage_name: newDisposition.pipeline_stage_name,
          follow_up_action: newDisposition.follow_up_action,
          follow_up_delay_minutes: newDisposition.follow_up_action === 'callback' ? newDisposition.follow_up_delay_minutes : null
        });

      toast({
        title: "Disposition Created",
        description: `Created "${newDisposition.name}" with automation rules`,
      });

      setShowDispositionDialog(false);
      setNewDisposition({
        name: '',
        description: '',
        sentiment: 'neutral',
        color: '#F59E0B',
        auto_create_pipeline_stage: true,
        pipeline_stage_name: '',
        follow_up_action: 'none',
        follow_up_delay_minutes: 1440
      });
      loadDispositions();
    } catch (error) {
      console.error('Error creating disposition:', error);
      toast({
        title: "Error",
        description: "Failed to create disposition",
        variant: "destructive"
      });
    }
  };

  const handleAddStep = () => {
    setNewSequence(prev => ({
      ...prev,
      steps: [...prev.steps, { ...newStep, step_number: prev.steps.length + 1 }]
    }));
    setNewStep({
      action_type: 'ai_call',
      delay_minutes: 60,
      content: '',
      ai_prompt: ''
    });
  };

  const handleRemoveStep = (index: number) => {
    setNewSequence(prev => ({
      ...prev,
      steps: prev.steps.filter((_, i) => i !== index)
    }));
  };

  const handleCreateSequence = async () => {
    const result = await createSequence({
      name: newSequence.name,
      description: newSequence.description,
      steps: newSequence.steps
    });

    if (result) {
      setShowSequenceDialog(false);
      setNewSequence({ name: '', description: '', steps: [] });
      loadSequences();
    }
  };

  const getActionIcon = (actionType: string) => {
    switch (actionType) {
      case 'ai_call': return <Phone className="h-4 w-4" />;
      case 'ai_sms':
      case 'manual_sms': return <MessageSquare className="h-4 w-4" />;
      case 'email': return <Mail className="h-4 w-4" />;
      case 'wait': return <Clock className="h-4 w-4" />;
      default: return <Zap className="h-4 w-4" />;
    }
  };

  const getSentimentBadge = (sentiment: string) => {
    switch (sentiment) {
      case 'positive':
        return <Badge className="bg-green-500"><CheckCircle className="h-3 w-3 mr-1" /> Positive</Badge>;
      case 'negative':
        return <Badge className="bg-red-500"><XCircle className="h-3 w-3 mr-1" /> Negative</Badge>;
      default:
        return <Badge variant="secondary">Neutral</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            Disposition Automation
          </h2>
          <p className="text-slate-600 dark:text-slate-400">
            Manage dispositions, rules, and automated follow-up sequences
          </p>
        </div>
        <Button onClick={handleInitializeStandard} disabled={isLoading}>
          <Zap className="h-4 w-4 mr-2" />
          Initialize Standard Dispositions
        </Button>
      </div>

      <Tabs defaultValue="dispositions" className="w-full">
        <TabsList>
          <TabsTrigger value="dispositions">Dispositions & Rules</TabsTrigger>
          <TabsTrigger value="sequences">Follow-up Sequences</TabsTrigger>
          <TabsTrigger value="scheduled">Scheduled Follow-ups</TabsTrigger>
        </TabsList>

        <TabsContent value="dispositions" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={showDispositionDialog} onOpenChange={setShowDispositionDialog}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  New Disposition
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Create New Disposition</DialogTitle>
                  <DialogDescription>
                    Define a disposition with automated actions and pipeline movements
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Disposition Name *</Label>
                      <Input
                        value={newDisposition.name}
                        onChange={(e) => setNewDisposition(prev => ({ 
                          ...prev, 
                          name: e.target.value,
                          pipeline_stage_name: e.target.value.toLowerCase().replace(/\s+/g, '_')
                        }))}
                        placeholder="e.g., Hot Lead"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Sentiment</Label>
                      <Select
                        value={newDisposition.sentiment}
                        onValueChange={(value: any) => setNewDisposition(prev => ({ ...prev, sentiment: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="positive">Positive</SelectItem>
                          <SelectItem value="neutral">Neutral</SelectItem>
                          <SelectItem value="negative">Negative</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea
                      value={newDisposition.description}
                      onChange={(e) => setNewDisposition(prev => ({ ...prev, description: e.target.value }))}
                      rows={2}
                    />
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={newDisposition.auto_create_pipeline_stage}
                      onCheckedChange={(checked) => setNewDisposition(prev => ({ ...prev, auto_create_pipeline_stage: checked }))}
                    />
                    <Label>Auto-create pipeline stage</Label>
                  </div>

                  {newDisposition.auto_create_pipeline_stage && (
                    <div className="space-y-2">
                      <Label>Pipeline Stage Name</Label>
                      <Input
                        value={newDisposition.pipeline_stage_name}
                        onChange={(e) => setNewDisposition(prev => ({ ...prev, pipeline_stage_name: e.target.value }))}
                        placeholder="e.g., hot_leads"
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>Follow-up Action</Label>
                    <Select
                      value={newDisposition.follow_up_action}
                      onValueChange={(value: any) => setNewDisposition(prev => ({ ...prev, follow_up_action: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="callback">Schedule Callback</SelectItem>
                        <SelectItem value="sequence">Start Sequence</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {newDisposition.follow_up_action === 'callback' && (
                    <div className="space-y-2">
                      <Label>Callback Delay (minutes)</Label>
                      <Input
                        type="number"
                        value={newDisposition.follow_up_delay_minutes}
                        onChange={(e) => setNewDisposition(prev => ({ ...prev, follow_up_delay_minutes: parseInt(e.target.value) }))}
                      />
                      <p className="text-xs text-slate-500">
                        {Math.floor(newDisposition.follow_up_delay_minutes / 60)} hours and {newDisposition.follow_up_delay_minutes % 60} minutes
                      </p>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button onClick={handleCreateDisposition} disabled={!newDisposition.name}>
                      Create Disposition
                    </Button>
                    <Button variant="outline" onClick={() => setShowDispositionDialog(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid gap-4">
            {dispositions.map(disposition => (
              <Card key={disposition.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: disposition.color }} />
                        {disposition.name}
                        {getSentimentBadge(disposition.sentiment)}
                      </CardTitle>
                      <CardDescription>{disposition.description}</CardDescription>
                    </div>
                    <Button variant="ghost" size="sm">
                      <Edit className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-slate-500">Pipeline Stage:</span>
                      <div className="font-medium">{disposition.pipeline_stage_name || 'None'}</div>
                    </div>
                    <div>
                      <span className="text-slate-500">Auto-create Stage:</span>
                      <div className="font-medium">{disposition.auto_create_pipeline_stage ? 'Yes' : 'No'}</div>
                    </div>
                    <div>
                      <span className="text-slate-500">Follow-up:</span>
                      <div className="font-medium capitalize">{disposition.follow_up_action}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="sequences" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={showSequenceDialog} onOpenChange={setShowSequenceDialog}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  New Sequence
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Create Follow-up Sequence</DialogTitle>
                  <DialogDescription>
                    Define a series of automated actions to engage leads
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Sequence Name *</Label>
                    <Input
                      value={newSequence.name}
                      onChange={(e) => setNewSequence(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g., Hot Lead Nurture"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea
                      value={newSequence.description}
                      onChange={(e) => setNewSequence(prev => ({ ...prev, description: e.target.value }))}
                      rows={2}
                    />
                  </div>

                  <div className="border-t pt-4">
                    <h4 className="font-semibold mb-4">Sequence Steps</h4>
                    
                    {newSequence.steps.map((step, index) => (
                      <div key={index} className="flex items-start gap-2 mb-2 p-3 bg-slate-50 dark:bg-slate-900 rounded">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            {getActionIcon(step.action_type)}
                            <span className="font-medium">Step {index + 1}: {step.action_type.replace('_', ' ').toUpperCase()}</span>
                            <Badge variant="outline">After {step.delay_minutes} min</Badge>
                          </div>
                          {step.content && <p className="text-xs text-slate-600 mt-1">{step.content}</p>}
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => handleRemoveStep(index)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}

                    <Card className="mt-4">
                      <CardHeader>
                        <CardTitle className="text-sm">Add New Step</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <Label>Action Type</Label>
                            <Select
                              value={newStep.action_type}
                              onValueChange={(value: any) => setNewStep(prev => ({ ...prev, action_type: value }))}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="ai_call">AI Call</SelectItem>
                                <SelectItem value="ai_sms">AI SMS</SelectItem>
                                <SelectItem value="manual_sms">Manual SMS</SelectItem>
                                <SelectItem value="email">Email</SelectItem>
                                <SelectItem value="wait">Wait</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>Delay (minutes)</Label>
                            <Input
                              type="number"
                              value={newStep.delay_minutes}
                              onChange={(e) => setNewStep(prev => ({ ...prev, delay_minutes: parseInt(e.target.value) }))}
                            />
                          </div>
                        </div>

                        {(newStep.action_type === 'ai_call' || newStep.action_type === 'ai_sms') && (
                          <div className="space-y-2">
                            <Label>AI Prompt</Label>
                            <Textarea
                              value={newStep.ai_prompt}
                              onChange={(e) => setNewStep(prev => ({ ...prev, ai_prompt: e.target.value }))}
                              placeholder="Instructions for AI agent..."
                              rows={2}
                            />
                          </div>
                        )}

                        {(newStep.action_type === 'manual_sms' || newStep.action_type === 'email') && (
                          <div className="space-y-2">
                            <Label>Message Content</Label>
                            <Textarea
                              value={newStep.content}
                              onChange={(e) => setNewStep(prev => ({ ...prev, content: e.target.value }))}
                              placeholder="Message text..."
                              rows={2}
                            />
                          </div>
                        )}

                        <Button onClick={handleAddStep} size="sm">
                          <Plus className="h-4 w-4 mr-2" />
                          Add Step
                        </Button>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="flex gap-2">
                    <Button onClick={handleCreateSequence} disabled={!newSequence.name || newSequence.steps.length === 0}>
                      Create Sequence
                    </Button>
                    <Button variant="outline" onClick={() => setShowSequenceDialog(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid gap-4">
            {sequences.map(sequence => (
              <Card key={sequence.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle>{sequence.name}</CardTitle>
                      <CardDescription>{sequence.description}</CardDescription>
                    </div>
                    <Badge variant={sequence.active ? "default" : "secondary"}>
                      {sequence.active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Steps ({sequence.sequence_steps?.length || 0}):</div>
                    {sequence.sequence_steps?.map((step: any, index: number) => (
                      <div key={step.id} className="flex items-center gap-2 text-sm pl-4">
                        {getActionIcon(step.action_type)}
                        <span>Step {index + 1}: {step.action_type.replace('_', ' ')}</span>
                        <Badge variant="outline">+{step.delay_minutes}min</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="scheduled" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Scheduled Follow-ups</CardTitle>
              <CardDescription>
                Upcoming automated actions for leads
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-500">
                Follow-ups will be displayed here based on disposition rules and sequences.
                The system automatically executes these at the scheduled times.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default DispositionAutomationManager;
