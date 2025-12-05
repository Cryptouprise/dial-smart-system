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
import { Plus, Edit, CheckCircle, XCircle, Clock, Zap, MessageSquare, Phone, Mail } from 'lucide-react';
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
  }, []);

  const loadDispositions = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: disps } = await supabase
        .from('dispositions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at');

      if (disps) {
        const formatted: Disposition[] = disps.map(d => ({
          id: d.id,
          name: d.name,
          description: d.description || '',
          color: d.color,
          sentiment: 'neutral',
          auto_create_pipeline_stage: false,
          pipeline_stage_name: d.pipeline_stage || '',
          follow_up_action: 'none'
        }));
        setDispositions(formatted);
      }
    } catch (error) {
      console.error('Error loading dispositions:', error);
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

      const { error: dispError } = await supabase
        .from('dispositions')
        .insert({
          user_id: user.id,
          name: newDisposition.name,
          description: newDisposition.description,
          color: newDisposition.color,
          pipeline_stage: newDisposition.pipeline_stage_name || newDisposition.name.toLowerCase().replace(/\s+/g, '_'),
          auto_actions: []
        });

      if (dispError) throw dispError;

      toast({
        title: "Disposition Created",
        description: `Created "${newDisposition.name}"`,
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
            Manage dispositions and automated follow-up sequences
          </p>
        </div>
        <Button onClick={handleInitializeStandard} disabled={isLoading}>
          <Zap className="h-4 w-4 mr-2" />
          Initialize Standard Dispositions
        </Button>
      </div>

      <Tabs defaultValue="dispositions" className="w-full">
        <TabsList>
          <TabsTrigger value="dispositions">Dispositions</TabsTrigger>
          <TabsTrigger value="sequences">Follow-up Sequences</TabsTrigger>
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
                    Define a disposition with pipeline stage mapping
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
                        onValueChange={(value: 'positive' | 'neutral' | 'negative') => setNewDisposition(prev => ({ ...prev, sentiment: value }))}
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

                  <div className="space-y-2">
                    <Label>Pipeline Stage Name</Label>
                    <Input
                      value={newDisposition.pipeline_stage_name}
                      onChange={(e) => setNewDisposition(prev => ({ ...prev, pipeline_stage_name: e.target.value }))}
                      placeholder="e.g., hot_leads"
                    />
                  </div>

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
            {dispositions.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No dispositions configured. Click "Initialize Standard Dispositions" to get started.
                </CardContent>
              </Card>
            ) : (
              dispositions.map(disposition => (
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
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-slate-500">Pipeline Stage:</span>
                        <div className="font-medium">{disposition.pipeline_stage_name || 'None'}</div>
                      </div>
                      <div>
                        <span className="text-slate-500">Follow-up:</span>
                        <div className="font-medium capitalize">{disposition.follow_up_action}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="sequences" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Follow-up Sequences</CardTitle>
              <CardDescription>
                Automated follow-up sequences require additional database configuration.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Follow-up sequences feature coming soon.</p>
                <p className="text-sm mt-2">This feature requires additional database tables to be configured.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default DispositionAutomationManager;
