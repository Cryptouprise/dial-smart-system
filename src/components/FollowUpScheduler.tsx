import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useDispositionAutomation, FollowUpSequence, ScheduledFollowUp, SequenceStep } from '@/hooks/useDispositionAutomation';
import { supabase } from '@/integrations/supabase/client';
import { 
  Calendar, 
  Clock, 
  Plus, 
  Play, 
  Pause, 
  Check, 
  X, 
  Trash2,
  Phone,
  MessageSquare,
  Mail,
  Timer,
  Bot,
  RefreshCw
} from 'lucide-react';
import { format } from 'date-fns';

const FollowUpScheduler = () => {
  const [sequences, setSequences] = useState<FollowUpSequence[]>([]);
  const [pendingFollowUps, setPendingFollowUps] = useState<ScheduledFollowUp[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const { toast } = useToast();
  const { 
    createSequence, 
    getPendingFollowUps, 
    executeFollowUp,
    initializeStandardDispositions 
  } = useDispositionAutomation();

  // New sequence form state
  const [newSequence, setNewSequence] = useState({
    name: '',
    description: '',
    steps: [] as Omit<SequenceStep, 'id' | 'sequence_id' | 'completed'>[]
  });

  const [newStep, setNewStep] = useState({
    action_type: 'ai_sms' as 'ai_call' | 'ai_sms' | 'manual_sms' | 'email' | 'wait',
    delay_minutes: 60,
    content: '',
    ai_prompt: ''
  });

  // Load sequences and pending follow-ups
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Load sequences
      const { data: seqData } = await supabase
        .from('follow_up_sequences')
        .select(`
          *,
          sequence_steps (*)
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (seqData) {
        setSequences(seqData.map(seq => ({
          id: seq.id,
          name: seq.name,
          description: seq.description || '',
          pipeline_stage_id: seq.pipeline_stage_id,
          steps: (seq.sequence_steps || []).map((step: any) => ({
            id: step.id,
            sequence_id: step.sequence_id,
            step_number: step.step_number,
            action_type: step.action_type,
            delay_minutes: step.delay_minutes || 0,
            content: step.content,
            ai_prompt: step.ai_prompt,
            completed: false
          })),
          active: seq.active ?? true,
          created_at: seq.created_at
        })));
      }

      // Load pending follow-ups with lead details
      const { data: followUpData } = await supabase
        .from('scheduled_follow_ups')
        .select(`
          *,
          leads (id, first_name, last_name, phone_number, company, email)
        `)
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .order('scheduled_at', { ascending: true });

      if (followUpData) {
        setPendingFollowUps(followUpData.map(fu => ({
          id: fu.id,
          lead_id: fu.lead_id,
          sequence_id: fu.sequence_id || undefined,
          current_step_id: fu.current_step_id || undefined,
          scheduled_at: fu.scheduled_at,
          status: fu.status || 'pending',
          action_type: fu.action_type,
          lead: fu.leads
        })) as any);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAddStep = () => {
    if (!newStep.action_type) return;

    setNewSequence(prev => ({
      ...prev,
      steps: [...prev.steps, {
        step_number: prev.steps.length + 1,
        action_type: newStep.action_type,
        delay_minutes: newStep.delay_minutes,
        content: newStep.content,
        ai_prompt: newStep.ai_prompt
      }]
    }));

    setNewStep({
      action_type: 'ai_sms',
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
    if (!newSequence.name || newSequence.steps.length === 0) {
      toast({
        title: "Validation Error",
        description: "Please provide a name and at least one step",
        variant: "destructive"
      });
      return;
    }

    const result = await createSequence({
      name: newSequence.name,
      description: newSequence.description,
      steps: newSequence.steps
    });

    if (result) {
      setNewSequence({ name: '', description: '', steps: [] });
      setShowCreateForm(false);
      loadData();
    }
  };

  const handleExecuteFollowUp = async (followUpId: string) => {
    const success = await executeFollowUp(followUpId);
    if (success) {
      loadData();
    }
  };

  const handleDeleteSequence = async (sequenceId: string) => {
    try {
      const { error } = await supabase
        .from('follow_up_sequences')
        .delete()
        .eq('id', sequenceId);

      if (error) throw error;

      toast({
        title: "Sequence Deleted",
        description: "Follow-up sequence has been removed",
      });

      loadData();
    } catch (error) {
      console.error('Error deleting sequence:', error);
      toast({
        title: "Error",
        description: "Failed to delete sequence",
        variant: "destructive"
      });
    }
  };

  const getActionIcon = (actionType: string) => {
    switch (actionType) {
      case 'ai_call': return <Phone className="h-4 w-4" />;
      case 'ai_sms': return <Bot className="h-4 w-4" />;
      case 'manual_sms': return <MessageSquare className="h-4 w-4" />;
      case 'email': return <Mail className="h-4 w-4" />;
      case 'wait': return <Timer className="h-4 w-4" />;
      default: return <Clock className="h-4 w-4" />;
    }
  };

  const getActionLabel = (actionType: string) => {
    switch (actionType) {
      case 'ai_call': return 'AI Call';
      case 'ai_sms': return 'AI SMS';
      case 'manual_sms': return 'Manual SMS';
      case 'email': return 'Email';
      case 'wait': return 'Wait';
      default: return actionType;
    }
  };

  const formatDelay = (minutes: number) => {
    if (minutes < 60) return `${minutes} min`;
    if (minutes < 1440) return `${Math.round(minutes / 60)} hours`;
    return `${Math.round(minutes / 1440)} days`;
  };

  // Create test sequences for demo
  const createTestSequences = async () => {
    setIsLoading(true);
    try {
      // Initialize dispositions first
      await initializeStandardDispositions();

      // Create Hot Lead sequence
      await createSequence({
        name: 'Hot Lead Follow-up',
        description: 'Multi-step follow-up for interested prospects',
        steps: [
          { step_number: 1, action_type: 'ai_sms', delay_minutes: 5, content: '', ai_prompt: 'Send a friendly follow-up SMS thanking them for their interest and asking about their timeline' },
          { step_number: 2, action_type: 'wait', delay_minutes: 1440, content: '', ai_prompt: '' },
          { step_number: 3, action_type: 'ai_call', delay_minutes: 0, content: '', ai_prompt: 'Call to schedule an appointment and discuss their needs in detail' },
          { step_number: 4, action_type: 'ai_sms', delay_minutes: 2880, content: '', ai_prompt: 'Check in if they have any questions and remind them of the benefits' }
        ]
      });

      // Create Callback sequence
      await createSequence({
        name: 'Callback Reminder',
        description: 'Simple callback reminder sequence',
        steps: [
          { step_number: 1, action_type: 'ai_sms', delay_minutes: 60, content: '', ai_prompt: 'Send a brief reminder that we tried to reach them earlier' },
          { step_number: 2, action_type: 'ai_call', delay_minutes: 1440, content: '', ai_prompt: 'Follow-up call to reconnect' }
        ]
      });

      // Create Voicemail sequence
      await createSequence({
        name: 'Voicemail Follow-up',
        description: 'Follow-up after leaving voicemail',
        steps: [
          { step_number: 1, action_type: 'ai_sms', delay_minutes: 30, content: '', ai_prompt: 'Send SMS saying we just left them a voicemail and briefly mention why we called' },
          { step_number: 2, action_type: 'wait', delay_minutes: 2880, content: '', ai_prompt: '' },
          { step_number: 3, action_type: 'ai_call', delay_minutes: 0, content: '', ai_prompt: 'Second attempt call' }
        ]
      });

      toast({
        title: "Test Sequences Created",
        description: "3 follow-up sequences have been created",
      });

      loadData();
    } catch (error) {
      console.error('Error creating test sequences:', error);
      toast({
        title: "Error",
        description: "Failed to create test sequences",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Follow-up Scheduler</h2>
          <p className="text-muted-foreground">Manage automated follow-up sequences</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadData} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="outline" onClick={createTestSequences} disabled={isLoading}>
            <Bot className="h-4 w-4 mr-2" />
            Create Test Sequences
          </Button>
          <Button onClick={() => setShowCreateForm(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Sequence
          </Button>
        </div>
      </div>

      <Tabs defaultValue="sequences">
        <TabsList>
          <TabsTrigger value="sequences">
            <Calendar className="h-4 w-4 mr-2" />
            Sequences ({sequences.length})
          </TabsTrigger>
          <TabsTrigger value="pending">
            <Clock className="h-4 w-4 mr-2" />
            Pending ({pendingFollowUps.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sequences" className="space-y-4">
          {showCreateForm && (
            <Card>
              <CardHeader>
                <CardTitle>Create New Sequence</CardTitle>
                <CardDescription>Build a multi-step follow-up workflow</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Sequence Name</label>
                    <Input
                      value={newSequence.name}
                      onChange={(e) => setNewSequence(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g., Hot Lead Follow-up"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Description</label>
                    <Input
                      value={newSequence.description}
                      onChange={(e) => setNewSequence(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="What this sequence does"
                    />
                  </div>
                </div>

                {/* Steps list */}
                {newSequence.steps.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Steps</label>
                    {newSequence.steps.map((step, index) => (
                      <div key={index} className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                        <Badge variant="outline">{index + 1}</Badge>
                        <div className="flex items-center gap-2">
                          {getActionIcon(step.action_type)}
                          <span className="text-sm">{getActionLabel(step.action_type)}</span>
                        </div>
                        <Badge variant="secondary">
                          {step.delay_minutes > 0 ? `Wait ${formatDelay(step.delay_minutes)}` : 'Immediate'}
                        </Badge>
                        <span className="text-sm text-muted-foreground flex-1 truncate">
                          {step.ai_prompt || step.content || 'No content'}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveStep(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add step form */}
                <div className="border rounded-lg p-4 space-y-3">
                  <label className="text-sm font-medium">Add Step</label>
                  <div className="grid grid-cols-3 gap-3">
                    <Select
                      value={newStep.action_type}
                      onValueChange={(v) => setNewStep(prev => ({ ...prev, action_type: v as any }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Action type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ai_sms">AI SMS</SelectItem>
                        <SelectItem value="ai_call">AI Call</SelectItem>
                        <SelectItem value="manual_sms">Manual SMS</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="wait">Wait</SelectItem>
                      </SelectContent>
                    </Select>
                    <div>
                      <Input
                        type="number"
                        value={newStep.delay_minutes}
                        onChange={(e) => setNewStep(prev => ({ ...prev, delay_minutes: parseInt(e.target.value) || 0 }))}
                        placeholder="Delay (minutes)"
                      />
                    </div>
                    <Button onClick={handleAddStep}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Step
                    </Button>
                  </div>
                  {newStep.action_type !== 'wait' && (
                    <Textarea
                      value={newStep.ai_prompt}
                      onChange={(e) => setNewStep(prev => ({ ...prev, ai_prompt: e.target.value }))}
                      placeholder="AI prompt or message content..."
                      rows={2}
                    />
                  )}
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowCreateForm(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreateSequence} disabled={isLoading}>
                    Create Sequence
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {sequences.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Sequences Yet</h3>
                <p className="text-muted-foreground mb-4">
                  Create your first follow-up sequence or use test sequences
                </p>
                <div className="flex justify-center gap-2">
                  <Button onClick={createTestSequences}>
                    <Bot className="h-4 w-4 mr-2" />
                    Create Test Sequences
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {sequences.map(sequence => (
                <Card key={sequence.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          {sequence.name}
                          <Badge variant={sequence.active ? 'default' : 'secondary'}>
                            {sequence.active ? 'Active' : 'Inactive'}
                          </Badge>
                        </CardTitle>
                        <CardDescription>{sequence.description}</CardDescription>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteSequence(sequence.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2 flex-wrap">
                      {sequence.steps
                        .sort((a, b) => a.step_number - b.step_number)
                        .map((step, index) => (
                          <React.Fragment key={step.id}>
                            {index > 0 && (
                              <div className="text-muted-foreground">→</div>
                            )}
                            <div className="flex items-center gap-1 px-2 py-1 bg-muted rounded">
                              {getActionIcon(step.action_type)}
                              <span className="text-sm">{getActionLabel(step.action_type)}</span>
                              {step.delay_minutes > 0 && (
                                <Badge variant="outline" className="ml-1 text-xs">
                                  {formatDelay(step.delay_minutes)}
                                </Badge>
                              )}
                            </div>
                          </React.Fragment>
                        ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="pending" className="space-y-4">
          {pendingFollowUps.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Pending Follow-ups</h3>
                <p className="text-muted-foreground">
                  Follow-ups will appear here when sequences are triggered
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {pendingFollowUps.map((followUp: any) => {
                const lead = followUp.lead;
                const leadName = lead 
                  ? [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Unknown'
                  : 'Unknown Lead';
                
                return (
                  <Card key={followUp.id}>
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                            {getActionIcon(followUp.action_type)}
                          </div>
                          <div>
                            <p className="font-medium">{leadName}</p>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              {lead?.phone_number && (
                                <span className="flex items-center gap-1">
                                  <Phone className="h-3 w-3" />
                                  {lead.phone_number}
                                </span>
                              )}
                              {lead?.company && (
                                <span className="text-xs">• {lead.company}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="outline" className="text-xs">
                                {getActionLabel(followUp.action_type)}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(followUp.scheduled_at), 'PPp')}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge 
                            variant={followUp.status === 'pending' ? 'default' : 
                                     followUp.status === 'completed' ? 'secondary' : 'destructive'}
                          >
                            {followUp.status}
                          </Badge>
                          {followUp.status === 'pending' && (
                            <Button
                              size="sm"
                              onClick={() => handleExecuteFollowUp(followUp.id)}
                            >
                              <Play className="h-4 w-4 mr-1" />
                              Execute
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default FollowUpScheduler;
