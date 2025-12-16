import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useRetellAI } from '@/hooks/useRetellAI';
import { useRetellLLM } from '@/hooks/useRetellLLM';
import { RetellAISetupWizard } from './RetellAISetupWizard';
import { AgentEditDialog } from './AgentEditDialog';
import { RetellCalendarSetup } from './RetellCalendarSetup';
import { Trash2, Edit, RefreshCw, Sparkles, Plus, Webhook, CheckCircle, Calendar, CalendarCheck, CalendarX } from 'lucide-react';

interface RetellPhoneNumber {
  phone_number: string;
  nickname?: string;
  inbound_agent_id?: string;
  outbound_agent_id?: string;
  termination_uri?: string;
}

interface Agent {
  agent_id: string;
  agent_name: string;
  voice_id?: string;
  hasCalendarFunction?: boolean;
}

interface RetellLLM {
  llm_id: string;
  general_prompt: string;
  begin_message: string;
  model: string;
}

const RetellAIManager = () => {
  const [retellNumbers, setRetellNumbers] = useState<RetellPhoneNumber[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [llms, setLlms] = useState<RetellLLM[]>([]);
  const [editingNumber, setEditingNumber] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    nickname: '',
    agentId: ''
  });
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importForm, setImportForm] = useState({
    phoneNumber: '',
    terminationUri: ''
  });
  const [editingAgent, setEditingAgent] = useState<any>(null);
  const [showAgentEditDialog, setShowAgentEditDialog] = useState(false);
  const [isConfiguringWebhooks, setIsConfiguringWebhooks] = useState(false);
  const { toast } = useToast();
  const { 
    listPhoneNumbers, 
    updatePhoneNumber, 
    deletePhoneNumber, 
    listAgents,
    importPhoneNumber,
    getAgent,
    updateAgent,
    deleteAgent,
    configureWebhooksOnAllAgents,
    isLoading 
  } = useRetellAI();
  
  const { listLLMs, deleteLLM, isLoading: llmLoading } = useRetellLLM();

  useEffect(() => {
    loadRetellData();
  }, []);

  const loadRetellData = async () => {
    const [numbersData, agentsData, llmsData] = await Promise.all([
      listPhoneNumbers(),
      listAgents(),
      listLLMs()
    ]);

    if (numbersData) setRetellNumbers(numbersData);
    if (agentsData) {
      // Deduplicate agents by agent_id to prevent React key conflicts
      const uniqueAgents = agentsData.reduce((acc: any[], agent: any) => {
        if (!acc.find(a => a.agent_id === agent.agent_id)) {
          acc.push(agent);
        }
        return acc;
      }, []);
      
      // Check each agent for calendar function
      const agentsWithCalendarStatus = await Promise.all(
        uniqueAgents.map(async (agent: any) => {
          try {
            const details = await getAgent(agent.agent_id);
            const hasCalendarFunction = details?.functions?.some(
              (fn: any) => fn.name === 'manage_calendar'
            ) || false;
            return { ...agent, hasCalendarFunction };
          } catch {
            return { ...agent, hasCalendarFunction: false };
          }
        })
      );
      setAgents(agentsWithCalendarStatus);
    }
    if (llmsData) setLlms(llmsData);
  };

  const handleRefresh = () => {
    loadRetellData();
    toast({
      title: "Data Refreshed",
      description: "Retell AI data has been updated",
    });
  };

  const handleConfigureWebhooks = async () => {
    setIsConfiguringWebhooks(true);
    try {
      const results = await configureWebhooksOnAllAgents();
      if (results.success > 0) {
        toast({
          title: "Webhooks Configured",
          description: `${results.success} agent(s) now connected. Calls will trigger transcript analysis, disposition routing, and workflows automatically.`,
        });
      }
    } finally {
      setIsConfiguringWebhooks(false);
    }
  };

  const handleEditStart = (number: RetellPhoneNumber) => {
    setEditingNumber(number.phone_number);
    setEditForm({
      nickname: number.nickname || '',
      agentId: number.inbound_agent_id || ''
    });
  };

  const handleEditSave = async (phoneNumber: string) => {
    const success = await updatePhoneNumber(
      phoneNumber, 
      editForm.agentId || undefined, 
      editForm.nickname || undefined
    );
    
    if (success) {
      setEditingNumber(null);
      loadRetellData();
    }
  };

  const handleEditCancel = () => {
    setEditingNumber(null);
    setEditForm({ nickname: '', agentId: '' });
  };

  const handleDelete = async (phoneNumber: string) => {
    if (window.confirm(`Are you sure you want to delete ${phoneNumber} from Retell AI?`)) {
      const success = await deletePhoneNumber(phoneNumber);
      if (success) {
        loadRetellData();
      }
    }
  };

  const handleDeleteLLM = async (llmId: string) => {
    if (window.confirm(`Are you sure you want to delete this LLM? Agents using it will stop working.`)) {
      const success = await deleteLLM(llmId);
      if (success) {
        loadRetellData();
      }
    }
  };

  const getAgentName = (agentId: string) => {
    const agent = agents.find(a => a.agent_id === agentId);
    return agent ? agent.agent_name : agentId;
  };

  const handleImportNumber = async () => {
    if (!importForm.phoneNumber || !importForm.terminationUri) {
      toast({
        title: "Missing Information",
        description: "Please provide both phone number and termination URI",
        variant: "destructive"
      });
      return;
    }

    const result = await importPhoneNumber(importForm.phoneNumber, importForm.terminationUri);
    if (result) {
      setShowImportDialog(false);
      setImportForm({ phoneNumber: '', terminationUri: '' });
      loadRetellData();
    }
  };

  const handleEditAgent = async (agentId: string) => {
    const agentDetails = await getAgent(agentId);
    if (agentDetails) {
      setEditingAgent(agentDetails);
      setShowAgentEditDialog(true);
    }
  };

  const handleSaveAgent = async (agentConfig: any) => {
    if (editingAgent) {
      const success = await updateAgent(editingAgent.agent_id, agentConfig);
      if (success) {
        setShowAgentEditDialog(false);
        setEditingAgent(null);
        loadRetellData();
      }
    }
  };

  const handleDeleteAgent = async (agentId: string, agentName: string) => {
    if (window.confirm(`Are you sure you want to delete agent "${agentName}"? This cannot be undone.`)) {
      const success = await deleteAgent(agentId);
      if (success) {
        loadRetellData();
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold">Retell AI Management</h2>
          <p className="text-muted-foreground mt-1">
            Configure AI-powered phone agents
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            onClick={handleConfigureWebhooks} 
            variant="default"
            disabled={isConfiguringWebhooks || agents.length === 0}
            title="Configure all agents to send call data to our system for transcript analysis, disposition routing, and workflow automation"
          >
            {isConfiguringWebhooks ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Webhook className="h-4 w-4 mr-2" />
            )}
            {isConfiguringWebhooks ? 'Configuring...' : 'Auto-Configure Webhooks'}
          </Button>
          <Button 
            onClick={handleRefresh} 
            variant="outline"
            disabled={isLoading || llmLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${(isLoading || llmLoading) ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">LLMs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{llms.length}</div>
            <p className="text-xs text-muted-foreground">AI brains configured</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Agents</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{agents.length}</div>
            <p className="text-xs text-muted-foreground">Call agents ready</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Phone Numbers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{retellNumbers.length}</div>
            <p className="text-xs text-muted-foreground">Numbers connected</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="wizard" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="wizard">
            <Sparkles className="h-4 w-4 mr-2" />
            Setup Wizard
          </TabsTrigger>
          <TabsTrigger value="llms">LLMs ({llms.length})</TabsTrigger>
          <TabsTrigger value="agents">Agents ({agents.length})</TabsTrigger>
          <TabsTrigger value="numbers">Phone Numbers ({retellNumbers.length})</TabsTrigger>
          <TabsTrigger value="calendar">
            <Calendar className="h-4 w-4 mr-2" />
            Calendar
          </TabsTrigger>
        </TabsList>

        {/* Setup Wizard Tab */}
        <TabsContent value="wizard">
          <RetellAISetupWizard />
        </TabsContent>

        {/* LLMs Tab */}
        <TabsContent value="llms">
          <Card>
            <CardHeader>
              <CardTitle>Retell LLMs</CardTitle>
              <CardDescription>AI brains that power your call agents</CardDescription>
            </CardHeader>
            <CardContent>
              {llms.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No LLMs found. Use the Setup Wizard to create one.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {llms.map((llm) => (
                    <div key={llm.llm_id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="outline">{llm.model}</Badge>
                            <span className="font-mono text-xs text-muted-foreground">{llm.llm_id}</span>
                          </div>
                          <div className="space-y-2 text-sm">
                            <div>
                              <span className="font-semibold">Begin Message: </span>
                              <span className="text-muted-foreground">{llm.begin_message}</span>
                            </div>
                            <div>
                              <span className="font-semibold">System Prompt: </span>
                              <span className="text-muted-foreground">{llm.general_prompt.substring(0, 100)}...</span>
                            </div>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDeleteLLM(llm.llm_id)}
                          disabled={llmLoading}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Agents Tab */}
        <TabsContent value="agents">
          <Card>
            <CardHeader>
              <CardTitle>Retell AI Agents</CardTitle>
              <CardDescription>AI agents configured for phone calls</CardDescription>
            </CardHeader>
            <CardContent>
              {agents.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No agents found. Use the Setup Wizard to create one.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {agents.map((agent) => {
                    // Find phone numbers using this agent
                    const inboundNumbers = retellNumbers.filter(n => n.inbound_agent_id === agent.agent_id);
                    const outboundNumbers = retellNumbers.filter(n => n.outbound_agent_id === agent.agent_id);
                    
                    return (
                      <div key={agent.agent_id} className="p-4 border rounded-lg hover:bg-accent/50 transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3">
                              <h4 className="font-semibold">{agent.agent_name}</h4>
                              <Badge variant="outline" className="font-mono text-xs">
                                {agent.agent_id}
                              </Badge>
                              {agent.hasCalendarFunction ? (
                                <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-300 dark:border-green-700">
                                  <CalendarCheck className="h-3 w-3 mr-1" />
                                  Calendar Connected
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-muted-foreground">
                                  <CalendarX className="h-3 w-3 mr-1" />
                                  No Calendar
                                </Badge>
                              )}
                            </div>
                            {agent.voice_id && (
                              <p className="text-sm text-muted-foreground mt-1">
                                Voice: {agent.voice_id}
                              </p>
                            )}
                            
                            {/* Phone number assignments */}
                            <div className="flex flex-wrap gap-2 mt-2">
                              {inboundNumbers.length > 0 && (
                                <div className="flex items-center gap-1">
                                  <Badge variant="outline" className="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800">
                                    Inbound: {inboundNumbers.length} number{inboundNumbers.length !== 1 ? 's' : ''}
                                  </Badge>
                                </div>
                              )}
                              {outboundNumbers.length > 0 && (
                                <div className="flex items-center gap-1">
                                  <Badge variant="outline" className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800">
                                    Outbound: {outboundNumbers.length} number{outboundNumbers.length !== 1 ? 's' : ''}
                                  </Badge>
                                </div>
                              )}
                              {inboundNumbers.length === 0 && outboundNumbers.length === 0 && (
                                <Badge variant="outline" className="text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
                                  No phone numbers assigned
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEditAgent(agent.agent_id)}
                              disabled={isLoading}
                            >
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDeleteAgent(agent.agent_id, agent.agent_name)}
                              disabled={isLoading}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Phone Numbers Tab */}
        <TabsContent value="numbers">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Retell AI Phone Numbers</CardTitle>
                  <CardDescription>
                    Manage phone numbers in your Retell AI account. <strong className="text-primary">Assign an agent to enable outbound calling.</strong>
                  </CardDescription>
                </div>
                <Button onClick={() => setShowImportDialog(true)} size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Import Number
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {retellNumbers.some(n => !n.outbound_agent_id) && (
                <div className="mb-4 p-4 border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 rounded-lg">
                  <div className="flex items-start gap-3">
                    <Badge variant="outline" className="bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-700">
                      Action Required
                    </Badge>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-amber-900 dark:text-amber-100 mb-1">
                        Phone numbers need agents for outbound calling
                      </p>
                      <p className="text-sm text-amber-800 dark:text-amber-200">
                        Click the edit button on each phone number and select an agent. This configures the number for making outbound calls.
                      </p>
                    </div>
                  </div>
                </div>
              )}
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Phone Number</TableHead>
                      <TableHead>Nickname</TableHead>
                      <TableHead>Assigned Agent</TableHead>
                      <TableHead>Termination URI</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {retellNumbers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No phone numbers found in Retell AI. Import numbers from your main dashboard.
                        </TableCell>
                      </TableRow>
                    ) : (
                      retellNumbers.map((number) => (
                        <TableRow key={number.phone_number}>
                          <TableCell className="font-mono">{number.phone_number}</TableCell>
                          <TableCell>
                            {editingNumber === number.phone_number ? (
                              <Input
                                value={editForm.nickname}
                                onChange={(e) => setEditForm(prev => ({ ...prev, nickname: e.target.value }))}
                                placeholder="Enter nickname"
                                className="w-32"
                              />
                            ) : (
                              <span className="text-muted-foreground">
                                {number.nickname || 'No nickname'}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            {editingNumber === number.phone_number ? (
                              <div className="space-y-2">
                                <Select
                                  value={editForm.agentId || 'none'}
                                  onValueChange={(value) => setEditForm(prev => ({ 
                                    ...prev, 
                                    agentId: value === 'none' ? '' : value 
                                  }))}
                                >
                                  <SelectTrigger className="w-[200px]">
                                    <SelectValue placeholder="Select agent" />
                                  </SelectTrigger>
                                  <SelectContent className="bg-background z-50">
                                    <SelectItem value="none">No agent</SelectItem>
                                    {agents.map((agent) => (
                                      <SelectItem key={agent.agent_id} value={agent.agent_id}>
                                        {agent.agent_name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">
                                  Sets agent for both inbound & outbound
                                </p>
                              </div>
                            ) : (
                              <div className="space-y-1">
                                {/* Inbound Agent */}
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-xs shrink-0 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800">
                                    Inbound
                                  </Badge>
                                  <span className="text-sm truncate">
                                    {number.inbound_agent_id ? getAgentName(number.inbound_agent_id) : <span className="text-muted-foreground">Not set</span>}
                                  </span>
                                </div>
                                {/* Outbound Agent */}
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-xs shrink-0 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800">
                                    Outbound
                                  </Badge>
                                  <span className="text-sm truncate">
                                    {number.outbound_agent_id ? getAgentName(number.outbound_agent_id) : <span className="text-muted-foreground">Not set</span>}
                                  </span>
                                </div>
                                {/* Warning if mismatched or missing */}
                                {number.inbound_agent_id && number.outbound_agent_id && number.inbound_agent_id !== number.outbound_agent_id && (
                                  <Badge variant="outline" className="text-xs bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800">
                                    ⚠️ Different agents
                                  </Badge>
                                )}
                                {!number.outbound_agent_id && (
                                  <Badge variant="destructive" className="text-xs">
                                    Outbound not configured
                                  </Badge>
                                )}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {number.termination_uri || 'Not set'}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              {editingNumber === number.phone_number ? (
                                <>
                                  <Button
                                    size="sm"
                                    onClick={() => handleEditSave(number.phone_number)}
                                    disabled={isLoading}
                                  >
                                    Save
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={handleEditCancel}
                                  >
                                    Cancel
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleEditStart(number)}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => handleDelete(number.phone_number)}
                                    disabled={isLoading}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Calendar Integration Tab */}
        <TabsContent value="calendar">
          <RetellCalendarSetup />
        </TabsContent>
      </Tabs>

      {/* Import Phone Number Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import Phone Number to Retell AI</DialogTitle>
            <DialogDescription>
              Enter the phone number and termination URI to import it into Retell AI
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="import-phone">Phone Number</Label>
              <Input
                id="import-phone"
                placeholder="+1234567890"
                value={importForm.phoneNumber}
                onChange={(e) => setImportForm(prev => ({ ...prev, phoneNumber: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">Include country code (e.g., +1 for US)</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="import-uri">Termination URI</Label>
              <Input
                id="import-uri"
                placeholder="wss://your-domain.com/endpoint"
                value={importForm.terminationUri}
                onChange={(e) => setImportForm(prev => ({ ...prev, terminationUri: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">WebSocket endpoint for call handling</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImportDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleImportNumber} disabled={isLoading}>
              {isLoading ? 'Importing...' : 'Import Number'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Agent Edit Dialog */}
      {editingAgent && (
        <AgentEditDialog
          open={showAgentEditDialog}
          onOpenChange={setShowAgentEditDialog}
          agent={editingAgent}
          onSave={handleSaveAgent}
          isLoading={isLoading}
        />
      )}
    </div>
  );
};

export default RetellAIManager;
