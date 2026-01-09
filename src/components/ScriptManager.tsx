import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  FileText,
  Edit,
  TrendingUp,
  Activity,
  CheckCircle2,
  Loader2,
  Copy,
  BarChart3,
  Sparkles,
  Bot,
  Download
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useMLLearning } from '@/hooks/useMLLearning';
import { useRetellAI } from '@/hooks/useRetellAI';

interface CampaignScript {
  id: string;
  name: string;
  description: string | null;
  script: string | null;
  status: string;
  created_at: string;
  agent_id: string | null;
}

interface RetellAgent {
  agent_id: string;
  agent_name: string;
}

const SCRIPT_TEMPLATES = [
  {
    name: 'Introduction Script',
    content: `Hi, this is {{agent_name}} calling from {{company_name}}. 

I'm reaching out because {{reason_for_call}}.

Is this a good time to chat for just a couple of minutes?

[If YES]: Great! I'd like to tell you about {{value_proposition}}.

[If NO]: No problem! When would be a better time to call you back?`
  },
  {
    name: 'Follow-Up Script',
    content: `Hi {{lead_name}}, this is {{agent_name}} following up from our conversation on {{last_call_date}}.

You mentioned you were interested in {{interest_topic}}. I wanted to check in and see if you had any questions.

Have you had a chance to think about what we discussed?`
  },
  {
    name: 'Appointment Setting',
    content: `Hi {{lead_name}}, this is {{agent_name}} from {{company_name}}.

I'm calling to schedule your consultation. We have availability:
- {{slot_1}}
- {{slot_2}}
- {{slot_3}}

Which time works best for you?

[After selection]: Perfect! I've got you down for {{selected_time}}. You'll receive a confirmation email shortly.`
  },
  {
    name: 'Objection Handling',
    content: `I understand your concern about {{objection}}.

Many of our clients felt the same way initially. What they found was {{counter_point}}.

Would it help if I {{offer_solution}}?`
  }
];

export const ScriptManager: React.FC = () => {
  const { toast } = useToast();
  const { getScriptAnalytics, analyzePerformance, insights } = useMLLearning();
  const { listAgents, getAgent, isLoading: isRetellLoading } = useRetellAI();
  const [campaigns, setCampaigns] = useState<CampaignScript[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignScript | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editScript, setEditScript] = useState('');
  const [scriptAnalytics, setScriptAnalytics] = useState<any[]>([]);
  const [retellAgents, setRetellAgents] = useState<RetellAgent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [isImportingScript, setIsImportingScript] = useState(false);

  useEffect(() => {
    loadCampaigns();
    loadScriptAnalytics();
    loadRetellAgents();
  }, []);

  const loadRetellAgents = async () => {
    try {
      const agents = await listAgents();
      if (agents) {
        setRetellAgents(agents);
      }
    } catch (error) {
      console.error('Error loading Retell agents:', error);
    }
  };

  const handleImportFromRetell = async (agentId: string) => {
    if (!agentId) return;
    
    setIsImportingScript(true);
    try {
      const agentDetails = await getAgent(agentId);
      if (!agentDetails) {
        toast({
          title: 'Import Failed',
          description: 'Could not fetch agent details',
          variant: 'destructive'
        });
        return;
      }

      // Get the LLM ID to fetch the prompt
      const llmId = agentDetails?.response_engine?.llm_id || agentDetails?.llm_id;
      
      if (llmId) {
        // Fetch the LLM to get the prompt
        const { data: llmData, error: llmError } = await supabase.functions.invoke('retell-agent-management', {
          body: { action: 'get_llm', llmId }
        });

        if (!llmError && llmData?.general_prompt) {
          setEditScript(llmData.general_prompt);
          setSelectedAgentId(agentId);
          toast({
            title: 'Script Imported',
            description: `Imported prompt from "${agentDetails.agent_name}"`,
          });
          return;
        }
      }

      // Fallback: use any available prompt data from agent
      const prompt = agentDetails?.prompt || agentDetails?.general_prompt || '';
      if (prompt) {
        setEditScript(prompt);
        setSelectedAgentId(agentId);
        toast({
          title: 'Script Imported',
          description: `Imported configuration from "${agentDetails.agent_name}"`,
        });
      } else {
        toast({
          title: 'No Script Found',
          description: 'This agent does not have a configured prompt/script',
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Error importing from Retell:', error);
      toast({
        title: 'Import Error',
        description: 'Failed to import script from Retell agent',
        variant: 'destructive'
      });
    } finally {
      setIsImportingScript(false);
    }
  };

  const loadScriptAnalytics = async () => {
    const analytics = await getScriptAnalytics();
    if (analytics) {
      setScriptAnalytics(analytics);
    }
  };

  const loadCampaigns = async () => {
    try {
      setIsLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('campaigns')
        .select('id, name, description, script, status, created_at, agent_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCampaigns(data || []);
    } catch (error) {
      console.error('Error loading campaigns:', error);
      toast({
        title: 'Error',
        description: 'Failed to load campaign scripts',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditScript = (campaign: CampaignScript) => {
    setSelectedCampaign(campaign);
    setEditScript(campaign.script || '');
    setShowEditDialog(true);
  };

  const handleSaveScript = async () => {
    if (!selectedCampaign) return;

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('campaigns')
        .update({ 
          script: editScript,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedCampaign.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Script updated successfully'
      });

      setShowEditDialog(false);
      loadCampaigns();
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

  const handleApplyTemplate = (template: typeof SCRIPT_TEMPLATES[0]) => {
    setEditScript(template.content);
    toast({
      title: 'Template Applied',
      description: `"${template.name}" template has been applied`
    });
  };

  const handleCopyScript = (script: string) => {
    navigator.clipboard.writeText(script);
    toast({
      title: 'Copied',
      description: 'Script copied to clipboard'
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Script Manager</h2>
          <p className="text-muted-foreground">
            Manage and optimize your campaign call scripts
          </p>
        </div>
      </div>

      <Tabs defaultValue="scripts" className="space-y-4">
        <TabsList>
          <TabsTrigger value="scripts">Campaign Scripts</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="analytics">
            <BarChart3 className="h-4 w-4 mr-2" />
            Analytics & Learning
          </TabsTrigger>
        </TabsList>

        <TabsContent value="scripts">
          {isLoading ? (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </CardContent>
            </Card>
          ) : campaigns.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">No Campaigns Found</h3>
                <p className="text-muted-foreground">
                  Create a campaign first, then you can add scripts to it.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {campaigns.map((campaign) => (
                <Card key={campaign.id} className="bg-card">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">{campaign.name}</CardTitle>
                        <CardDescription className="mt-1">
                          {campaign.description || 'No description'}
                        </CardDescription>
                      </div>
                      <Badge variant={campaign.status === 'active' ? 'default' : 'secondary'}>
                        {campaign.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {campaign.script ? (
                        <div className="bg-muted rounded-md p-3">
                          <p className="text-sm text-muted-foreground line-clamp-3">
                            {campaign.script}
                          </p>
                        </div>
                      ) : (
                        <div className="bg-muted rounded-md p-3 text-center">
                          <p className="text-sm text-muted-foreground">No script configured</p>
                        </div>
                      )}
                      
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => handleEditScript(campaign)}
                        >
                          <Edit className="h-4 w-4 mr-1" />
                          Edit Script
                        </Button>
                        {campaign.script && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCopyScript(campaign.script!)}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="templates">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {SCRIPT_TEMPLATES.map((template, index) => (
              <Card key={index} className="bg-card">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    {template.name}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-40 rounded-md border p-3">
                    <pre className="text-sm whitespace-pre-wrap font-sans text-muted-foreground">
                      {template.content}
                    </pre>
                  </ScrollArea>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 w-full"
                    onClick={() => handleCopyScript(template.content)}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy Template
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="analytics">
          <div className="space-y-6">
            {/* AI Insights Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-purple-500" />
                  AI-Powered Script Insights
                </CardTitle>
                <CardDescription>
                  The system continuously learns from call outcomes to recommend improvements
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <Button 
                    onClick={analyzePerformance} 
                    disabled={isLoading}
                    className="w-full"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <TrendingUp className="h-4 w-4 mr-2" />
                        Generate New Insights
                      </>
                    )}
                  </Button>

                  {insights && insights.recommendations && insights.recommendations.length > 0 && (
                    <div className="space-y-3 mt-4">
                      <h4 className="font-medium">Latest Recommendations:</h4>
                      {insights.recommendations.map((rec, idx) => (
                        <Card key={idx} className="bg-muted/50">
                          <CardContent className="pt-4">
                            <p className="text-sm">{rec}</p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Script Performance Metrics */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Script Performance Analytics
                </CardTitle>
                <CardDescription>
                  Track how each script performs in real calls
                </CardDescription>
              </CardHeader>
              <CardContent>
                {scriptAnalytics.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No analytics data available yet</p>
                    <p className="text-sm mt-2">Make some calls to start collecting performance data</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {scriptAnalytics.map((analytics) => (
                      <Card key={analytics.id} className="bg-muted/30">
                        <CardContent className="pt-4">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <h4 className="font-medium">{analytics.script_name}</h4>
                              <p className="text-sm text-muted-foreground">
                                Version {analytics.script_version}
                              </p>
                            </div>
                            <Badge variant={analytics.success_rate >= 50 ? 'default' : 'secondary'}>
                              {analytics.success_rate?.toFixed(1)}% Success
                            </Badge>
                          </div>
                          
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <p className="text-muted-foreground">Total Calls</p>
                              <p className="font-medium text-lg">{analytics.total_calls}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Successful</p>
                              <p className="font-medium text-lg">{analytics.successful_calls}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Avg Duration</p>
                              <p className="font-medium text-lg">
                                {analytics.avg_call_duration ? `${Math.round(analytics.avg_call_duration / 60)}m` : 'N/A'}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Conversion</p>
                              <p className="font-medium text-lg">
                                {analytics.conversion_rate?.toFixed(1) || 0}%
                              </p>
                            </div>
                          </div>

                          {analytics.objection_count > 0 && (
                            <div className="mt-3 pt-3 border-t">
                              <p className="text-sm text-muted-foreground">
                                Common objections: {analytics.objection_count} recorded
                              </p>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Script Performance Insights */}
            {insights && insights.scriptPerformance && Object.keys(insights.scriptPerformance).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Script Comparison</CardTitle>
                  <CardDescription>
                    Compare performance across different scripts
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {Object.entries(insights.scriptPerformance).map(([scriptName, performance]: [string, any]) => (
                      <div key={scriptName} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                        <span className="font-medium">{scriptName}</span>
                        <div className="flex items-center gap-4">
                          <span className="text-sm text-muted-foreground">
                            Success Rate:
                          </span>
                          <Badge variant={performance.successRate >= 50 ? 'default' : 'secondary'}>
                            {performance.successRate.toFixed(1)}%
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Edit Script Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Script - {selectedCampaign?.name}</DialogTitle>
            <DialogDescription>
              Modify the call script for this campaign. Use variables like {`{{lead_name}}`} for personalization.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Import from Retell Agent */}
            <div className="space-y-2 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
              <Label className="flex items-center gap-2 text-purple-700 dark:text-purple-300">
                <Bot className="h-4 w-4" />
                Import from Retell AI Agent
              </Label>
              <div className="flex gap-2">
                <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select a Retell AI agent..." />
                  </SelectTrigger>
                  <SelectContent>
                    {retellAgents.map((agent) => (
                      <SelectItem key={agent.agent_id} value={agent.agent_id}>
                        {agent.agent_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  onClick={() => handleImportFromRetell(selectedAgentId)}
                  disabled={!selectedAgentId || isImportingScript}
                >
                  {isImportingScript ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-1" />
                      Import
                    </>
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Automatically import the script/prompt from your Retell AI agent
              </p>
            </div>

            <div className="space-y-2">
              <Label>Quick Templates</Label>
              <div className="flex flex-wrap gap-2">
                {SCRIPT_TEMPLATES.map((template, index) => (
                  <Button
                    key={index}
                    variant="outline"
                    size="sm"
                    onClick={() => handleApplyTemplate(template)}
                  >
                    {template.name}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="script">Script Content</Label>
              <Textarea
                id="script"
                value={editScript}
                onChange={(e) => setEditScript(e.target.value)}
                placeholder="Enter your call script here..."
                className="min-h-[300px] font-mono text-sm"
              />
            </div>

            <div className="bg-muted rounded-md p-3">
              <h4 className="text-sm font-medium mb-2">Available Variables</h4>
              <div className="flex flex-wrap gap-2">
                {[
                  '{{lead_name}}',
                  '{{company_name}}',
                  '{{agent_name}}',
                  '{{phone_number}}',
                  '{{date}}',
                  '{{time}}'
                ].map((variable) => (
                  <Badge
                    key={variable}
                    variant="secondary"
                    className="cursor-pointer"
                    onClick={() => {
                      setEditScript(prev => prev + ' ' + variable);
                    }}
                  >
                    {variable}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
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
                  Save Script
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ScriptManager;
