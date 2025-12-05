import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  FileText,
  Plus,
  Edit,
  Trash2,
  TrendingUp,
  TrendingDown,
  Activity,
  BarChart3,
  AlertCircle,
  CheckCircle2,
  Brain,
  Loader2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Script {
  id: string;
  agent_name: string;
  script_name: string;
  script_type: string;
  script_content: string;
  description: string;
  is_active: boolean;
  created_at: string;
}

interface ScriptPerformance {
  script_id: string;
  total_uses: number;
  positive_outcomes: number;
  negative_outcomes: number;
  neutral_outcomes: number;
  conversion_rate: number;
  average_call_duration: number;
  average_sentiment: number;
  performance_score: number;
  last_calculated_at: string;
}

interface ScriptSuggestion {
  id: string;
  script_id: string;
  current_performance: any;
  suggested_script: string;
  reasoning: string[];
  expected_improvement: string;
  based_on_data: any;
  status: string;
  created_at: string;
}

export const ScriptManager: React.FC = () => {
  const { toast } = useToast();
  const [scripts, setScripts] = useState<Script[]>([]);
  const [performances, setPerformances] = useState<Map<string, ScriptPerformance>>(new Map());
  const [suggestions, setSuggestions] = useState<ScriptSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedScript, setSelectedScript] = useState<Script | null>(null);
  
  // Form state
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [formData, setFormData] = useState({
    agent_name: '',
    script_name: '',
    script_type: 'call',
    script_content: '',
    description: ''
  });

  useEffect(() => {
    loadScripts();
  }, []);

  const loadScripts = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: scriptsData, error: scriptsError } = await supabase
        .from('agent_scripts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (scriptsError) throw scriptsError;

      setScripts(scriptsData || []);

      // Load performance metrics for all scripts
      if (scriptsData && scriptsData.length > 0) {
        const { data: metricsData, error: metricsError } = await supabase
          .from('script_performance_metrics')
          .select('*')
          .eq('user_id', user.id);

        if (metricsError) throw metricsError;

        const metricsMap = new Map();
        metricsData?.forEach((metric: ScriptPerformance) => {
          metricsMap.set(metric.script_id, metric);
        });
        setPerformances(metricsMap);
      }

      // Load suggestions
      const { data: suggestionsData, error: suggestionsError } = await supabase
        .from('script_suggestions')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (!suggestionsError) {
        setSuggestions(suggestionsData || []);
      }
    } catch (error) {
      console.error('Error loading scripts:', error);
      toast({
        title: 'Error',
        description: 'Failed to load scripts',
        variant: 'destructive'
      });
    }
  };

  const handleSaveScript = async () => {
    if (!formData.agent_name || !formData.script_name || !formData.script_content) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields',
        variant: 'destructive'
      });
      return;
    }

    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      if (selectedScript) {
        // Update existing script
        const { error } = await supabase
          .from('agent_scripts')
          .update({
            agent_name: formData.agent_name,
            script_name: formData.script_name,
            script_type: formData.script_type,
            script_content: formData.script_content,
            description: formData.description,
            updated_at: new Date().toISOString()
          })
          .eq('id', selectedScript.id);

        if (error) throw error;

        toast({
          title: 'Success',
          description: 'Script updated successfully'
        });
      } else {
        // Create new script
        const { error } = await supabase
          .from('agent_scripts')
          .insert({
            user_id: user.id,
            agent_name: formData.agent_name,
            script_name: formData.script_name,
            script_type: formData.script_type,
            script_content: formData.script_content,
            description: formData.description,
            is_active: true
          });

        if (error) throw error;

        toast({
          title: 'Success',
          description: 'Script created successfully'
        });
      }

      setShowAddDialog(false);
      setSelectedScript(null);
      setFormData({
        agent_name: '',
        script_name: '',
        script_type: 'call',
        script_content: '',
        description: ''
      });
      loadScripts();
    } catch (error) {
      console.error('Error saving script:', error);
      toast({
        title: 'Error',
        description: 'Failed to save script',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteScript = async (scriptId: string) => {
    if (!confirm('Are you sure you want to delete this script? This will also delete all associated performance data.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('agent_scripts')
        .delete()
        .eq('id', scriptId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Script deleted successfully'
      });
      loadScripts();
    } catch (error) {
      console.error('Error deleting script:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete script',
        variant: 'destructive'
      });
    }
  };

  const handleEditScript = (script: Script) => {
    setSelectedScript(script);
    setFormData({
      agent_name: script.agent_name,
      script_name: script.script_name,
      script_type: script.script_type,
      script_content: script.script_content,
      description: script.description || ''
    });
    setShowAddDialog(true);
  };

  const handleGenerateSuggestions = async (scriptId: string) => {
    setIsLoading(true);
    try {
      const performance = performances.get(scriptId);
      if (!performance) {
        toast({
          title: 'No Data',
          description: 'Not enough data to generate suggestions. Script needs at least 10 uses.',
          variant: 'destructive'
        });
        return;
      }

      if (performance.total_uses < 10) {
        toast({
          title: 'Insufficient Data',
          description: `Script needs at least 10 uses. Current: ${performance.total_uses}`,
          variant: 'destructive'
        });
        return;
      }

      // Generate AI suggestions based on performance
      const script = scripts.find(s => s.id === scriptId);
      if (!script) return;

      const reasoning = [];
      if (performance.conversion_rate < 20) {
        reasoning.push(`Low conversion rate (${performance.conversion_rate}%) - script needs stronger value proposition`);
      }
      if (performance.negative_outcomes > performance.positive_outcomes) {
        reasoning.push(`More negative than positive outcomes - needs better objection handling`);
      }
      if (performance.average_call_duration < 60) {
        reasoning.push(`Short call duration (${performance.average_call_duration}s) - script may be too brief or disengaging`);
      }
      if (performance.performance_score < 70) {
        reasoning.push(`Overall performance score is ${performance.performance_score}/100 - needs optimization`);
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { error } = await supabase
        .from('script_suggestions')
        .insert({
          user_id: user.id,
          script_id: scriptId,
          current_performance: {
            conversion_rate: performance.conversion_rate,
            performance_score: performance.performance_score,
            total_uses: performance.total_uses
          },
          suggested_script: `${script.script_content}\n\n[AI SUGGESTION: Add more engaging opening, stronger value proposition, and better objection handling based on performance data]`,
          reasoning: reasoning,
          expected_improvement: `Expected ${Math.min(30, Math.round(100 - performance.performance_score) / 2)}% improvement in performance score`,
          based_on_data: {
            conversionRate: performance.conversion_rate,
            totalCalls: performance.total_uses,
            avgDuration: performance.average_call_duration
          },
          status: 'pending'
        });

      if (error) throw error;

      toast({
        title: 'Suggestions Generated',
        description: 'AI has analyzed the script and generated improvement suggestions'
      });
      loadScripts();
    } catch (error) {
      console.error('Error generating suggestions:', error);
      toast({
        title: 'Error',
        description: 'Failed to generate suggestions',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplySuggestion = async (suggestionId: string, scriptId: string, suggestedScript: string) => {
    try {
      const { error: updateError } = await supabase
        .from('agent_scripts')
        .update({
          script_content: suggestedScript,
          updated_at: new Date().toISOString()
        })
        .eq('id', scriptId);

      if (updateError) throw updateError;

      const { error: suggestionError } = await supabase
        .from('script_suggestions')
        .update({
          status: 'applied',
          applied_at: new Date().toISOString()
        })
        .eq('id', suggestionId);

      if (suggestionError) throw suggestionError;

      toast({
        title: 'Success',
        description: 'Script updated with AI suggestions'
      });
      loadScripts();
    } catch (error) {
      console.error('Error applying suggestion:', error);
      toast({
        title: 'Error',
        description: 'Failed to apply suggestion',
        variant: 'destructive'
      });
    }
  };

  const getPerformanceBadge = (score: number) => {
    if (score >= 80) return <Badge className="bg-green-500">Excellent</Badge>;
    if (score >= 70) return <Badge className="bg-blue-500">Good</Badge>;
    if (score >= 50) return <Badge className="bg-yellow-500">Fair</Badge>;
    return <Badge className="bg-red-500">Needs Improvement</Badge>;
  };

  const getTrendIcon = (performance: ScriptPerformance) => {
    if (performance.conversion_rate > 25) {
      return <TrendingUp className="h-4 w-4 text-green-500" />;
    } else if (performance.conversion_rate < 15) {
      return <TrendingDown className="h-4 w-4 text-red-500" />;
    }
    return <Activity className="h-4 w-4 text-yellow-500" />;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Script Manager</h3>
          <p className="text-sm text-muted-foreground">
            Manage and optimize scripts for multiple agents
          </p>
        </div>
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button onClick={() => {
              setSelectedScript(null);
              setFormData({
                agent_name: '',
                script_name: '',
                script_type: 'call',
                script_content: '',
                description: ''
              });
            }}>
              <Plus className="h-4 w-4 mr-2" />
              Add Script
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selectedScript ? 'Edit Script' : 'Add New Script'}</DialogTitle>
              <DialogDescription>
                {selectedScript ? 'Update the script details below' : 'Create a new script for your AI agent'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="agent_name">Agent Name *</Label>
                  <Input
                    id="agent_name"
                    placeholder="e.g., Sales Agent 1"
                    value={formData.agent_name}
                    onChange={(e) => setFormData({ ...formData, agent_name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="script_name">Script Name *</Label>
                  <Input
                    id="script_name"
                    placeholder="e.g., Cold Call Script v1"
                    value={formData.script_name}
                    onChange={(e) => setFormData({ ...formData, script_name: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="script_type">Script Type</Label>
                <Select value={formData.script_type} onValueChange={(value) => setFormData({ ...formData, script_type: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="call">Phone Call</SelectItem>
                    <SelectItem value="sms">SMS Message</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  placeholder="Brief description of the script purpose"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="script_content">Script Content *</Label>
                <Textarea
                  id="script_content"
                  placeholder="Enter your script content here..."
                  className="min-h-[300px] font-mono text-sm"
                  value={formData.script_content}
                  onChange={(e) => setFormData({ ...formData, script_content: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Enter the complete script that will be used by the AI agent
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveScript} disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    {selectedScript ? 'Update Script' : 'Create Script'}
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="scripts" className="w-full">
        <TabsList>
          <TabsTrigger value="scripts">All Scripts ({scripts.length})</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="suggestions">AI Suggestions ({suggestions.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="scripts" className="space-y-4">
          {scripts.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">
                  No scripts yet. Click "Add Script" to create your first script.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {scripts.map((script) => {
                const performance = performances.get(script.id);
                return (
                  <Card key={script.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <CardTitle className="text-lg">{script.script_name}</CardTitle>
                            <Badge variant="outline">{script.agent_name}</Badge>
                            <Badge variant="secondary">{script.script_type}</Badge>
                            {performance && getPerformanceBadge(performance.performance_score)}
                          </div>
                          {script.description && (
                            <CardDescription>{script.description}</CardDescription>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => handleEditScript(script)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => handleDeleteScript(script.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="p-3 bg-muted rounded-lg">
                        <ScrollArea className="h-24">
                          <pre className="text-xs whitespace-pre-wrap font-mono">
                            {script.script_content}
                          </pre>
                        </ScrollArea>
                      </div>

                      {performance ? (
                        <>
                          <div className="grid grid-cols-4 gap-4 text-sm">
                            <div>
                              <div className="text-muted-foreground">Uses</div>
                              <div className="font-semibold">{performance.total_uses}</div>
                            </div>
                            <div>
                              <div className="text-muted-foreground">Conversion</div>
                              <div className="font-semibold flex items-center gap-1">
                                {performance.conversion_rate}%
                                {getTrendIcon(performance)}
                              </div>
                            </div>
                            <div>
                              <div className="text-muted-foreground">Score</div>
                              <div className="font-semibold">{performance.performance_score}/100</div>
                            </div>
                            <div>
                              <div className="text-muted-foreground">Avg Duration</div>
                              <div className="font-semibold">{Math.floor(performance.average_call_duration / 60)}m {performance.average_call_duration % 60}s</div>
                            </div>
                          </div>

                          {performance.total_uses >= 10 && performance.performance_score < 70 && (
                            <Button
                              onClick={() => handleGenerateSuggestions(script.id)}
                              disabled={isLoading}
                              variant="outline"
                              className="w-full"
                            >
                              <Brain className="h-4 w-4 mr-2" />
                              Generate AI Suggestions
                            </Button>
                          )}
                        </>
                      ) : (
                        <div className="text-sm text-muted-foreground text-center py-2">
                          No performance data yet. Use this script in calls to start tracking metrics.
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          {Array.from(performances.values()).length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">
                  No performance data available yet. Start using your scripts to track performance.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {Array.from(performances.entries()).map(([scriptId, perf]) => {
                const script = scripts.find(s => s.id === scriptId);
                if (!script) return null;
                return (
                  <Card key={scriptId}>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        {script.script_name}
                        {getPerformanceBadge(perf.performance_score)}
                      </CardTitle>
                      <CardDescription>{script.agent_name} - {script.script_type}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-3 gap-6">
                        <div className="space-y-2">
                          <div className="text-sm font-medium">Usage Statistics</div>
                          <div className="space-y-1 text-sm">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Total Uses:</span>
                              <span className="font-medium">{perf.total_uses}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-green-600">Positive:</span>
                              <span className="font-medium">{perf.positive_outcomes}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-red-600">Negative:</span>
                              <span className="font-medium">{perf.negative_outcomes}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Neutral:</span>
                              <span className="font-medium">{perf.neutral_outcomes}</span>
                            </div>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="text-sm font-medium">Performance Metrics</div>
                          <div className="space-y-1 text-sm">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Conversion Rate:</span>
                              <span className="font-medium">{perf.conversion_rate}%</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Performance Score:</span>
                              <span className="font-medium">{perf.performance_score}/100</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Avg Sentiment:</span>
                              <span className="font-medium">{perf.average_sentiment.toFixed(2)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="text-sm font-medium">Call Metrics</div>
                          <div className="space-y-1 text-sm">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Avg Duration:</span>
                              <span className="font-medium">
                                {Math.floor(perf.average_call_duration / 60)}m {perf.average_call_duration % 60}s
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Last Updated:</span>
                              <span className="font-medium text-xs">
                                {new Date(perf.last_calculated_at).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="suggestions" className="space-y-4">
          {suggestions.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Brain className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">
                  No AI suggestions available. Generate suggestions for scripts with low performance.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {suggestions.map((suggestion) => {
                const script = scripts.find(s => s.id === suggestion.script_id);
                if (!script) return null;
                return (
                  <Card key={suggestion.id} className="border-blue-500">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            <Brain className="h-5 w-5 text-blue-500" />
                            AI Suggestion for {script.script_name}
                          </CardTitle>
                          <CardDescription>{script.agent_name}</CardDescription>
                        </div>
                        <Badge>{suggestion.status}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <div className="text-sm font-semibold mb-2 flex items-center gap-2">
                          <AlertCircle className="h-4 w-4" />
                          Why This Change?
                        </div>
                        <ul className="space-y-1 text-sm">
                          {suggestion.reasoning.map((reason, idx) => (
                            <li key={idx} className="text-muted-foreground">• {reason}</li>
                          ))}
                        </ul>
                      </div>

                      <div>
                        <div className="text-sm font-semibold mb-2">Expected Improvement</div>
                        <p className="text-sm text-green-600">{suggestion.expected_improvement}</p>
                      </div>

                      <div>
                        <div className="text-sm font-semibold mb-2">Suggested Script</div>
                        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                          <ScrollArea className="h-48">
                            <pre className="text-xs whitespace-pre-wrap font-mono">
                              {suggestion.suggested_script}
                            </pre>
                          </ScrollArea>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          onClick={() => handleApplySuggestion(suggestion.id, suggestion.script_id, suggestion.suggested_script)}
                          className="flex-1"
                        >
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                          Apply Changes
                        </Button>
                        <Button
                          variant="outline"
                          onClick={async () => {
                            await supabase
                              .from('script_suggestions')
                              .update({ status: 'rejected' })
                              .eq('id', suggestion.id);
                            loadScripts();
                          }}
                        >
                          Reject
                        </Button>
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

export default ScriptManager;
