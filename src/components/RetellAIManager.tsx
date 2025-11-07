import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useRetellAI } from '@/hooks/useRetellAI';
import { useRetellLLM } from '@/hooks/useRetellLLM';
import { RetellAISetupWizard } from './RetellAISetupWizard';
import { Trash2, Edit, RefreshCw, Sparkles } from 'lucide-react';

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
  const { toast } = useToast();
  const { 
    listPhoneNumbers, 
    updatePhoneNumber, 
    deletePhoneNumber, 
    listAgents,
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
    if (agentsData) setAgents(agentsData);
    if (llmsData) setLlms(llmsData);
  };

  const handleRefresh = () => {
    loadRetellData();
    toast({
      title: "Data Refreshed",
      description: "Retell AI data has been updated",
    });
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold">Retell AI Management</h2>
          <p className="text-muted-foreground mt-1">
            Configure AI-powered phone agents
          </p>
        </div>
        <Button 
          onClick={handleRefresh} 
          variant="outline"
          disabled={isLoading || llmLoading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${(isLoading || llmLoading) ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
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
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="wizard">
            <Sparkles className="h-4 w-4 mr-2" />
            Setup Wizard
          </TabsTrigger>
          <TabsTrigger value="llms">LLMs ({llms.length})</TabsTrigger>
          <TabsTrigger value="agents">Agents ({agents.length})</TabsTrigger>
          <TabsTrigger value="numbers">Phone Numbers ({retellNumbers.length})</TabsTrigger>
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
                <div className="flex flex-wrap gap-2">
                  {agents.map((agent) => (
                    <Badge key={agent.agent_id} variant="secondary" className="text-sm py-2 px-3">
                      {agent.agent_name}
                      <span className="ml-2 text-xs text-muted-foreground">({agent.agent_id})</span>
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Phone Numbers Tab */}
        <TabsContent value="numbers">
          <Card>
            <CardHeader>
              <CardTitle>Retell AI Phone Numbers</CardTitle>
              <CardDescription>Manage phone numbers in your Retell AI account</CardDescription>
            </CardHeader>
            <CardContent>
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
                              <select
                                value={editForm.agentId}
                                onChange={(e) => setEditForm(prev => ({ ...prev, agentId: e.target.value }))}
                                className="border rounded px-2 py-1 text-sm"
                              >
                                <option value="">No agent</option>
                                {agents.map((agent) => (
                                  <option key={agent.agent_id} value={agent.agent_id}>
                                    {agent.agent_name}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-muted-foreground">
                                {number.inbound_agent_id ? getAgentName(number.inbound_agent_id) : 'No agent assigned'}
                              </span>
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
      </Tabs>
    </div>
  );
};

export default RetellAIManager;
