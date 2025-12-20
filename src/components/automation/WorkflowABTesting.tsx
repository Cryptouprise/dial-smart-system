import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { Plus, Play, Pause, BarChart3, Loader2, Beaker } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface ABTest {
  id: string;
  name: string;
  workflow_a_id: string;
  workflow_a_name: string;
  workflow_b_id: string;
  workflow_b_name: string;
  split_percentage: number;
  status: 'draft' | 'active' | 'completed';
  leads_a: number;
  leads_b: number;
  conversions_a: number;
  conversions_b: number;
  created_at: string;
}

export const WorkflowABTesting: React.FC = () => {
  const { toast } = useToast();
  const [tests, setTests] = useState<ABTest[]>([]);
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  // Form state
  const [testName, setTestName] = useState('');
  const [workflowAId, setWorkflowAId] = useState('');
  const [workflowBId, setWorkflowBId] = useState('');
  const [splitPercentage, setSplitPercentage] = useState(50);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Load workflows
      const { data: wfData } = await supabase
        .from('campaign_workflows')
        .select('id, name')
        .eq('user_id', user.id)
        .order('name');
      setWorkflows(wfData || []);

      // For now, we'll simulate A/B tests from workflow data
      // In production, you'd have a dedicated ab_tests table
      // This is a demonstration of the UI
      setTests([]);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateTest = async () => {
    if (!testName || !workflowAId || !workflowBId) {
      toast({ title: 'Error', description: 'Please fill all fields', variant: 'destructive' });
      return;
    }

    if (workflowAId === workflowBId) {
      toast({ title: 'Error', description: 'Please select different workflows', variant: 'destructive' });
      return;
    }

    const workflowA = workflows.find(w => w.id === workflowAId);
    const workflowB = workflows.find(w => w.id === workflowBId);

    const newTest: ABTest = {
      id: crypto.randomUUID(),
      name: testName,
      workflow_a_id: workflowAId,
      workflow_a_name: workflowA?.name || 'Workflow A',
      workflow_b_id: workflowBId,
      workflow_b_name: workflowB?.name || 'Workflow B',
      split_percentage: splitPercentage,
      status: 'draft',
      leads_a: 0,
      leads_b: 0,
      conversions_a: 0,
      conversions_b: 0,
      created_at: new Date().toISOString()
    };

    setTests(prev => [newTest, ...prev]);
    setShowCreateDialog(false);
    resetForm();
    toast({ title: 'A/B Test Created', description: 'Start the test to begin enrolling leads' });
  };

  const resetForm = () => {
    setTestName('');
    setWorkflowAId('');
    setWorkflowBId('');
    setSplitPercentage(50);
  };

  const toggleTestStatus = (testId: string) => {
    setTests(prev => prev.map(t => {
      if (t.id === testId) {
        const newStatus = t.status === 'active' ? 'draft' : 'active';
        return { ...t, status: newStatus };
      }
      return t;
    }));
  };

  const calculateWinner = (test: ABTest) => {
    if (test.leads_a === 0 && test.leads_b === 0) return null;
    
    const rateA = test.leads_a > 0 ? (test.conversions_a / test.leads_a) * 100 : 0;
    const rateB = test.leads_b > 0 ? (test.conversions_b / test.leads_b) * 100 : 0;

    if (rateA > rateB + 5) return 'A';
    if (rateB > rateA + 5) return 'B';
    return 'tie';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Beaker className="h-6 w-6" />
            Workflow A/B Testing
          </h2>
          <p className="text-muted-foreground">
            Compare workflow performance to optimize conversions
          </p>
        </div>

        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New A/B Test
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create A/B Test</DialogTitle>
              <DialogDescription>
                Compare two workflows to see which performs better
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div>
                <label className="text-sm font-medium">Test Name</label>
                <Input
                  value={testName}
                  onChange={(e) => setTestName(e.target.value)}
                  placeholder="e.g., SMS vs Call First Test"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Workflow A</label>
                  <Select value={workflowAId} onValueChange={setWorkflowAId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select workflow" />
                    </SelectTrigger>
                    <SelectContent>
                      {workflows.map(wf => (
                        <SelectItem key={wf.id} value={wf.id}>{wf.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium">Workflow B</label>
                  <Select value={workflowBId} onValueChange={setWorkflowBId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select workflow" />
                    </SelectTrigger>
                    <SelectContent>
                      {workflows.map(wf => (
                        <SelectItem key={wf.id} value={wf.id}>{wf.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">
                  Traffic Split: {splitPercentage}% A / {100 - splitPercentage}% B
                </label>
                <Slider
                  value={[splitPercentage]}
                  onValueChange={(v) => setSplitPercentage(v[0])}
                  min={10}
                  max={90}
                  step={5}
                  className="mt-2"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateTest}>
                Create Test
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Tests List */}
      {tests.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Beaker className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No A/B Tests Yet</h3>
            <p className="text-muted-foreground mb-4">
              Create your first test to compare workflow performance
            </p>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create A/B Test
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {tests.map((test) => {
            const winner = calculateWinner(test);
            const rateA = test.leads_a > 0 ? (test.conversions_a / test.leads_a) * 100 : 0;
            const rateB = test.leads_b > 0 ? (test.conversions_b / test.leads_b) * 100 : 0;

            return (
              <Card key={test.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {test.name}
                        <Badge variant={test.status === 'active' ? 'default' : 'secondary'}>
                          {test.status}
                        </Badge>
                      </CardTitle>
                      <CardDescription>
                        {test.split_percentage}% / {100 - test.split_percentage}% split
                      </CardDescription>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleTestStatus(test.id)}
                    >
                      {test.status === 'active' ? (
                        <>
                          <Pause className="h-4 w-4 mr-1" />
                          Pause
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4 mr-1" />
                          Start
                        </>
                      )}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-2 gap-4">
                    {/* Workflow A */}
                    <div className={`p-4 rounded-lg border ${winner === 'A' ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'bg-muted/50'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium">A: {test.workflow_a_name}</h4>
                        {winner === 'A' && <Badge className="bg-green-500">Winner</Badge>}
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        <div>
                          <p className="text-muted-foreground">Leads</p>
                          <p className="text-xl font-bold">{test.leads_a}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Conversions</p>
                          <p className="text-xl font-bold">{test.conversions_a}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Rate</p>
                          <p className="text-xl font-bold">{rateA.toFixed(1)}%</p>
                        </div>
                      </div>
                    </div>

                    {/* Workflow B */}
                    <div className={`p-4 rounded-lg border ${winner === 'B' ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'bg-muted/50'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium">B: {test.workflow_b_name}</h4>
                        {winner === 'B' && <Badge className="bg-green-500">Winner</Badge>}
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        <div>
                          <p className="text-muted-foreground">Leads</p>
                          <p className="text-xl font-bold">{test.leads_b}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Conversions</p>
                          <p className="text-xl font-bold">{test.conversions_b}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Rate</p>
                          <p className="text-xl font-bold">{rateB.toFixed(1)}%</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {test.leads_a + test.leads_b < 100 && (
                    <p className="text-xs text-muted-foreground mt-4 text-center">
                      Need more data for statistical significance (at least 100 leads per variant recommended)
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default WorkflowABTesting;
