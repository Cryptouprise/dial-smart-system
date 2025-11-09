import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Edit, Trash2, Save, X, RefreshCw, Settings, Mic, Brain, Phone } from 'lucide-react';
import { useRetellAI } from '@/hooks/useRetellAI';
import { useRetellLLM } from '@/hooks/useRetellLLM';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface Agent {
  agent_id: string;
  agent_name: string;
  voice_id?: string;
  response_engine?: {
    type: string;
    llm_id: string;
  };
  language?: string;
  interruption_sensitivity?: number;
  ambient_sound?: string;
  backchannel_frequency?: number;
  backchannel_words?: string[];
  reminder_trigger_ms?: number;
  reminder_max_count?: number;
  enable_transcription_formatting?: boolean;
  normalize_for_speech?: boolean;
  responsiveness?: number;
  boosted_keywords?: string[];
  pronunciation_dictionary?: Record<string, string>;
}

interface CustomVariable {
  key: string;
  value: string;
  description: string;
}

export const EnhancedAgentManager = () => {
  const { toast } = useToast();
  const { listAgents, isLoading: agentsLoading } = useRetellAI();
  const { listLLMs, isLoading: llmsLoading } = useRetellLLM();
  
  const [agents, setAgents] = useState<Agent[]>([]);
  const [llms, setLLMs] = useState<any[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [createMode, setCreateMode] = useState(false);
  
  // Form state for agent configuration
  const [agentForm, setAgentForm] = useState({
    agent_name: '',
    voice_id: '11labs-Adrian',
    llm_id: '',
    language: 'en-US',
    interruption_sensitivity: 1,
    ambient_sound: 'off',
    backchannel_frequency: 0.8,
    backchannel_words: ['yeah', 'uh-huh', 'mm-hmm', 'I see'],
    reminder_trigger_ms: 10000,
    reminder_max_count: 1,
    enable_transcription_formatting: true,
    normalize_for_speech: true,
    responsiveness: 1,
    boosted_keywords: [] as string[],
    pronunciation_dictionary: {} as Record<string, string>,
  });
  
  const [customVariables, setCustomVariables] = useState<CustomVariable[]>([]);
  const [newVariable, setNewVariable] = useState({ key: '', value: '', description: '' });

  useEffect(() => {
    loadAgents();
    loadLLMs();
  }, []);

  const loadAgents = async () => {
    const data = await listAgents();
    if (data) {
      setAgents(data);
    }
  };

  const loadLLMs = async () => {
    const data = await listLLMs();
    if (data) {
      setLLMs(data);
    }
  };

  const handleCreateAgent = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('retell-agent-management', {
        body: {
          action: 'create',
          agentName: agentForm.agent_name,
          llmId: agentForm.llm_id,
          voiceId: agentForm.voice_id,
          language: agentForm.language,
          interruptionSensitivity: agentForm.interruption_sensitivity,
          ambientSound: agentForm.ambient_sound,
          backchannelFrequency: agentForm.backchannel_frequency,
          backchannelWords: agentForm.backchannel_words,
          reminderTriggerMs: agentForm.reminder_trigger_ms,
          reminderMaxCount: agentForm.reminder_max_count,
          enableTranscriptionFormatting: agentForm.enable_transcription_formatting,
          normalizeForSpeech: agentForm.normalize_for_speech,
          responsiveness: agentForm.responsiveness,
          boostedKeywords: agentForm.boosted_keywords,
          pronunciationDictionary: agentForm.pronunciation_dictionary,
          customVariables: customVariables,
        }
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Agent created successfully",
      });

      setCreateMode(false);
      loadAgents();
      resetForm();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create agent",
        variant: "destructive"
      });
    }
  };

  const handleUpdateAgent = async () => {
    if (!selectedAgent) return;

    try {
      const { data, error } = await supabase.functions.invoke('retell-agent-management', {
        body: {
          action: 'update',
          agentId: selectedAgent.agent_id,
          agentName: agentForm.agent_name,
          voiceId: agentForm.voice_id,
          llmId: agentForm.llm_id,
          language: agentForm.language,
          interruptionSensitivity: agentForm.interruption_sensitivity,
          ambientSound: agentForm.ambient_sound,
          backchannelFrequency: agentForm.backchannel_frequency,
          backchannelWords: agentForm.backchannel_words,
          reminderTriggerMs: agentForm.reminder_trigger_ms,
          reminderMaxCount: agentForm.reminder_max_count,
          enableTranscriptionFormatting: agentForm.enable_transcription_formatting,
          normalizeForSpeech: agentForm.normalize_for_speech,
          responsiveness: agentForm.responsiveness,
          boostedKeywords: agentForm.boosted_keywords,
          pronunciationDictionary: agentForm.pronunciation_dictionary,
          customVariables: customVariables,
        }
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Agent updated successfully",
      });

      setEditMode(false);
      loadAgents();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update agent",
        variant: "destructive"
      });
    }
  };

  const handleDeleteAgent = async (agentId: string) => {
    if (!confirm('Are you sure you want to delete this agent?')) return;

    try {
      const { error } = await supabase.functions.invoke('retell-agent-management', {
        body: {
          action: 'delete',
          agentId: agentId,
        }
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Agent deleted successfully",
      });

      loadAgents();
      if (selectedAgent?.agent_id === agentId) {
        setSelectedAgent(null);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete agent",
        variant: "destructive"
      });
    }
  };

  const loadAgentForEdit = (agent: Agent) => {
    setSelectedAgent(agent);
    setAgentForm({
      agent_name: agent.agent_name || '',
      voice_id: agent.voice_id || '11labs-Adrian',
      llm_id: agent.response_engine?.llm_id || '',
      language: agent.language || 'en-US',
      interruption_sensitivity: agent.interruption_sensitivity || 1,
      ambient_sound: agent.ambient_sound || 'off',
      backchannel_frequency: agent.backchannel_frequency || 0.8,
      backchannel_words: agent.backchannel_words || ['yeah', 'uh-huh', 'mm-hmm', 'I see'],
      reminder_trigger_ms: agent.reminder_trigger_ms || 10000,
      reminder_max_count: agent.reminder_max_count || 1,
      enable_transcription_formatting: agent.enable_transcription_formatting ?? true,
      normalize_for_speech: agent.normalize_for_speech ?? true,
      responsiveness: agent.responsiveness || 1,
      boosted_keywords: agent.boosted_keywords || [],
      pronunciation_dictionary: agent.pronunciation_dictionary || {},
    });
    setEditMode(true);
  };

  const resetForm = () => {
    setAgentForm({
      agent_name: '',
      voice_id: '11labs-Adrian',
      llm_id: '',
      language: 'en-US',
      interruption_sensitivity: 1,
      ambient_sound: 'off',
      backchannel_frequency: 0.8,
      backchannel_words: ['yeah', 'uh-huh', 'mm-hmm', 'I see'],
      reminder_trigger_ms: 10000,
      reminder_max_count: 1,
      enable_transcription_formatting: true,
      normalize_for_speech: true,
      responsiveness: 1,
      boosted_keywords: [],
      pronunciation_dictionary: {},
    });
    setCustomVariables([]);
    setEditMode(false);
    setCreateMode(false);
    setSelectedAgent(null);
  };

  const addCustomVariable = () => {
    if (newVariable.key && newVariable.value) {
      setCustomVariables([...customVariables, { ...newVariable }]);
      setNewVariable({ key: '', value: '', description: '' });
    }
  };

  const removeCustomVariable = (index: number) => {
    setCustomVariables(customVariables.filter((_, i) => i !== index));
  };

  const addKeyword = (keyword: string) => {
    if (keyword && !agentForm.boosted_keywords.includes(keyword)) {
      setAgentForm({
        ...agentForm,
        boosted_keywords: [...agentForm.boosted_keywords, keyword]
      });
    }
  };

  const removeKeyword = (keyword: string) => {
    setAgentForm({
      ...agentForm,
      boosted_keywords: agentForm.boosted_keywords.filter(k => k !== keyword)
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold">Agent Management</h2>
          <p className="text-muted-foreground">Create and manage your AI calling agents with advanced features</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={loadAgents} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={() => setCreateMode(true)} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Create Agent
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Agents List */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Your Agents</CardTitle>
            <CardDescription>{agents.length} agents configured</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[600px]">
              <div className="space-y-2">
                {agentsLoading ? (
                  <p className="text-sm text-muted-foreground">Loading...</p>
                ) : agents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No agents yet. Create one to get started!</p>
                ) : (
                  agents.map((agent) => (
                    <div
                      key={agent.agent_id}
                      className={`p-3 border rounded-lg cursor-pointer hover:bg-accent transition-colors ${
                        selectedAgent?.agent_id === agent.agent_id ? 'bg-accent border-primary' : ''
                      }`}
                      onClick={() => {
                        setSelectedAgent(agent);
                        setEditMode(false);
                        setCreateMode(false);
                      }}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="font-medium">{agent.agent_name}</div>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              loadAgentForEdit(agent);
                            }}
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteAgent(agent.agent_id);
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        ID: {agent.agent_id}
                      </div>
                      {agent.voice_id && (
                        <Badge variant="secondary" className="text-xs mt-2">
                          {agent.voice_id}
                        </Badge>
                      )}
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Agent Details/Editor */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>
              {createMode ? 'Create New Agent' : editMode ? 'Edit Agent' : 'Agent Details'}
            </CardTitle>
            <CardDescription>
              {createMode 
                ? 'Configure your new AI calling agent with advanced features'
                : editMode 
                ? 'Update agent configuration and settings'
                : selectedAgent 
                ? 'View agent configuration'
                : 'Select an agent to view details'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {(createMode || editMode) ? (
              <ScrollArea className="h-[600px] pr-4">
                <Tabs defaultValue="basic" className="w-full">
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="basic">
                      <Brain className="h-4 w-4 mr-2" />
                      Basic
                    </TabsTrigger>
                    <TabsTrigger value="voice">
                      <Mic className="h-4 w-4 mr-2" />
                      Voice
                    </TabsTrigger>
                    <TabsTrigger value="advanced">
                      <Settings className="h-4 w-4 mr-2" />
                      Advanced
                    </TabsTrigger>
                    <TabsTrigger value="variables">
                      Variables
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="basic" className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="agent_name">Agent Name</Label>
                      <Input
                        id="agent_name"
                        value={agentForm.agent_name}
                        onChange={(e) => setAgentForm({ ...agentForm, agent_name: e.target.value })}
                        placeholder="e.g., Sales Agent"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="llm_id">LLM (AI Brain)</Label>
                      <Select 
                        value={agentForm.llm_id} 
                        onValueChange={(value) => setAgentForm({ ...agentForm, llm_id: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select an LLM" />
                        </SelectTrigger>
                        <SelectContent>
                          {llmsLoading ? (
                            <SelectItem value="loading" disabled>Loading...</SelectItem>
                          ) : llms.length === 0 ? (
                            <SelectItem value="none" disabled>No LLMs found - Create one first</SelectItem>
                          ) : (
                            llms.map((llm) => (
                              <SelectItem key={llm.llm_id} value={llm.llm_id}>
                                {llm.llm_id}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="language">Language</Label>
                      <Select 
                        value={agentForm.language} 
                        onValueChange={(value) => setAgentForm({ ...agentForm, language: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="en-US">English (US)</SelectItem>
                          <SelectItem value="en-GB">English (UK)</SelectItem>
                          <SelectItem value="es-ES">Spanish</SelectItem>
                          <SelectItem value="fr-FR">French</SelectItem>
                          <SelectItem value="de-DE">German</SelectItem>
                          <SelectItem value="it-IT">Italian</SelectItem>
                          <SelectItem value="pt-BR">Portuguese (BR)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </TabsContent>

                  <TabsContent value="voice" className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="voice_id">Voice</Label>
                      <Select 
                        value={agentForm.voice_id} 
                        onValueChange={(value) => setAgentForm({ ...agentForm, voice_id: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="11labs-Adrian">Adrian (Male)</SelectItem>
                          <SelectItem value="11labs-Aria">Aria (Female)</SelectItem>
                          <SelectItem value="11labs-Sarah">Sarah (Female)</SelectItem>
                          <SelectItem value="11labs-Roger">Roger (Male)</SelectItem>
                          <SelectItem value="11labs-Emily">Emily (Female)</SelectItem>
                          <SelectItem value="openai-alloy">OpenAI Alloy</SelectItem>
                          <SelectItem value="openai-echo">OpenAI Echo</SelectItem>
                          <SelectItem value="openai-fable">OpenAI Fable</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="ambient_sound">Ambient Sound</Label>
                      <Select 
                        value={agentForm.ambient_sound} 
                        onValueChange={(value) => setAgentForm({ ...agentForm, ambient_sound: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="off">Off</SelectItem>
                          <SelectItem value="coffee-shop">Coffee Shop</SelectItem>
                          <SelectItem value="office">Office</SelectItem>
                          <SelectItem value="call-center">Call Center</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Add background noise to make the call more natural
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label>Backchannel Frequency: {agentForm.backchannel_frequency}</Label>
                      <Slider
                        value={[agentForm.backchannel_frequency]}
                        onValueChange={(value) => setAgentForm({ ...agentForm, backchannel_frequency: value[0] })}
                        min={0}
                        max={1}
                        step={0.1}
                      />
                      <p className="text-xs text-muted-foreground">
                        How often the agent says acknowledgment words like "uh-huh", "I see"
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label>Responsiveness: {agentForm.responsiveness}</Label>
                      <Slider
                        value={[agentForm.responsiveness]}
                        onValueChange={(value) => setAgentForm({ ...agentForm, responsiveness: value[0] })}
                        min={0}
                        max={2}
                        step={0.1}
                      />
                      <p className="text-xs text-muted-foreground">
                        Controls how quickly the agent responds (0=slower, 2=faster)
                      </p>
                    </div>
                  </TabsContent>

                  <TabsContent value="advanced" className="space-y-4">
                    <div className="space-y-2">
                      <Label>Interruption Sensitivity: {agentForm.interruption_sensitivity}</Label>
                      <Slider
                        value={[agentForm.interruption_sensitivity]}
                        onValueChange={(value) => setAgentForm({ ...agentForm, interruption_sensitivity: value[0] })}
                        min={0}
                        max={1}
                        step={0.1}
                      />
                      <p className="text-xs text-muted-foreground">
                        How sensitive the agent is to being interrupted (0=less sensitive, 1=more sensitive)
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="reminder_trigger_ms">Reminder Trigger (ms)</Label>
                      <Input
                        id="reminder_trigger_ms"
                        type="number"
                        value={agentForm.reminder_trigger_ms}
                        onChange={(e) => setAgentForm({ ...agentForm, reminder_trigger_ms: parseInt(e.target.value) || 0 })}
                      />
                      <p className="text-xs text-muted-foreground">
                        Milliseconds of silence before agent prompts user
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="reminder_max_count">Max Reminders</Label>
                      <Input
                        id="reminder_max_count"
                        type="number"
                        value={agentForm.reminder_max_count}
                        onChange={(e) => setAgentForm({ ...agentForm, reminder_max_count: parseInt(e.target.value) || 0 })}
                      />
                    </div>

                    <div className="flex items-center space-x-2">
                      <Switch
                        id="enable_transcription_formatting"
                        checked={agentForm.enable_transcription_formatting}
                        onCheckedChange={(checked) => 
                          setAgentForm({ ...agentForm, enable_transcription_formatting: checked })
                        }
                      />
                      <Label htmlFor="enable_transcription_formatting">
                        Enable Transcription Formatting
                      </Label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Switch
                        id="normalize_for_speech"
                        checked={agentForm.normalize_for_speech}
                        onCheckedChange={(checked) => 
                          setAgentForm({ ...agentForm, normalize_for_speech: checked })
                        }
                      />
                      <Label htmlFor="normalize_for_speech">
                        Normalize Text for Speech
                      </Label>
                    </div>

                    <div className="space-y-2">
                      <Label>Boosted Keywords</Label>
                      <div className="flex gap-2">
                        <Input
                          placeholder="Add keyword..."
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                              addKeyword((e.target as HTMLInputElement).value);
                              (e.target as HTMLInputElement).value = '';
                            }
                          }}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={(e) => {
                            const input = (e.currentTarget.previousElementSibling as HTMLInputElement);
                            addKeyword(input.value);
                            input.value = '';
                          }}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {agentForm.boosted_keywords.map((keyword) => (
                          <Badge key={keyword} variant="secondary" className="cursor-pointer">
                            {keyword}
                            <X
                              className="h-3 w-3 ml-1"
                              onClick={() => removeKeyword(keyword)}
                            />
                          </Badge>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Keywords that the agent should listen for more carefully
                      </p>
                    </div>
                  </TabsContent>

                  <TabsContent value="variables" className="space-y-4">
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-medium mb-2">Custom Variables</h4>
                        <p className="text-sm text-muted-foreground mb-4">
                          Add custom variables that can be used in your LLM prompts and agent configuration
                        </p>
                      </div>

                      <div className="space-y-3 p-4 border rounded-lg">
                        <div className="space-y-2">
                          <Label htmlFor="var_key">Variable Key</Label>
                          <Input
                            id="var_key"
                            placeholder="e.g., company_name"
                            value={newVariable.key}
                            onChange={(e) => setNewVariable({ ...newVariable, key: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="var_value">Value</Label>
                          <Input
                            id="var_value"
                            placeholder="e.g., Acme Corp"
                            value={newVariable.value}
                            onChange={(e) => setNewVariable({ ...newVariable, value: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="var_description">Description (optional)</Label>
                          <Input
                            id="var_description"
                            placeholder="What this variable is for"
                            value={newVariable.description}
                            onChange={(e) => setNewVariable({ ...newVariable, description: e.target.value })}
                          />
                        </div>
                        <Button onClick={addCustomVariable} className="w-full">
                          <Plus className="h-4 w-4 mr-2" />
                          Add Variable
                        </Button>
                      </div>

                      <div className="space-y-2">
                        {customVariables.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            No custom variables added yet
                          </p>
                        ) : (
                          customVariables.map((variable, index) => (
                            <div key={index} className="p-3 border rounded-lg">
                              <div className="flex justify-between items-start">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <code className="text-sm font-mono bg-muted px-2 py-1 rounded">
                                      {variable.key}
                                    </code>
                                    <span className="text-sm">=</span>
                                    <span className="text-sm font-medium">{variable.value}</span>
                                  </div>
                                  {variable.description && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                      {variable.description}
                                    </p>
                                  )}
                                </div>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => removeCustomVariable(index)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>

                <div className="flex gap-2 mt-6 pt-6 border-t">
                  <Button onClick={resetForm} variant="outline" className="flex-1">
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                  <Button
                    onClick={createMode ? handleCreateAgent : handleUpdateAgent}
                    className="flex-1"
                    disabled={!agentForm.agent_name || !agentForm.llm_id}
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {createMode ? 'Create Agent' : 'Update Agent'}
                  </Button>
                </div>
              </ScrollArea>
            ) : selectedAgent ? (
              <ScrollArea className="h-[600px]">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-muted-foreground">Agent Name</Label>
                      <p className="font-medium">{selectedAgent.agent_name}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Voice</Label>
                      <p className="font-medium">{selectedAgent.voice_id || 'Not set'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Language</Label>
                      <p className="font-medium">{selectedAgent.language || 'en-US'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">LLM ID</Label>
                      <p className="font-mono text-sm">{selectedAgent.response_engine?.llm_id || 'Not set'}</p>
                    </div>
                  </div>

                  <div className="pt-4 border-t">
                    <Label className="text-muted-foreground">Agent ID</Label>
                    <p className="font-mono text-sm">{selectedAgent.agent_id}</p>
                  </div>

                  <div className="pt-4">
                    <Button onClick={() => loadAgentForEdit(selectedAgent)} className="w-full">
                      <Edit className="h-4 w-4 mr-2" />
                      Edit Agent
                    </Button>
                  </div>
                </div>
              </ScrollArea>
            ) : (
              <div className="flex items-center justify-center h-[600px]">
                <div className="text-center text-muted-foreground">
                  <Phone className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Select an agent from the list or create a new one</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
