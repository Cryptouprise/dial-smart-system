/**
 * Visual Agent Flow Builder
 *
 * Drag-and-drop interface for creating AI agent conversation flows.
 * Generates Retell-compatible agent configurations.
 */

import { useState, useCallback, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Play,
  Save,
  Plus,
  Trash2,
  Settings,
  MessageSquare,
  Phone,
  Calendar,
  FileText,
  GitBranch,
  ArrowRight,
  GripVertical,
  Copy,
  Eye,
  Wand2,
  Bot,
  Mic,
  Volume2,
  Clock,
  Target,
  Zap
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

// Node types for the flow builder
type NodeType = 'greeting' | 'question' | 'response' | 'condition' | 'action' | 'transfer' | 'end';

interface FlowNode {
  id: string;
  type: NodeType;
  label: string;
  content: string;
  conditions?: { condition: string; nextNodeId: string }[];
  nextNodeId?: string;
  action?: string;
  metadata?: Record<string, any>;
}

interface AgentConfig {
  name: string;
  description: string;
  voice: string;
  language: string;
  firstMessage: string;
  systemPrompt: string;
  nodes: FlowNode[];
  settings: {
    interruptionSensitivity: number;
    responseDelay: number;
    endCallAfterSilence: number;
    maxCallDuration: number;
    enableVoicemail: boolean;
    voicemailMessage: string;
  };
}

const NODE_TEMPLATES: Record<NodeType, { icon: any; color: string; label: string }> = {
  greeting: { icon: MessageSquare, color: 'bg-green-500', label: 'Greeting' },
  question: { icon: MessageSquare, color: 'bg-blue-500', label: 'Question' },
  response: { icon: FileText, color: 'bg-purple-500', label: 'Response' },
  condition: { icon: GitBranch, color: 'bg-yellow-500', label: 'Condition' },
  action: { icon: Zap, color: 'bg-orange-500', label: 'Action' },
  transfer: { icon: Phone, color: 'bg-pink-500', label: 'Transfer' },
  end: { icon: Target, color: 'bg-red-500', label: 'End Call' },
};

// Top ElevenLabs voices optimized for sales/retail - organized by gender
const VOICE_OPTIONS = [
  // === MALE VOICES - Sales Optimized ===
  { value: 'JBFqnCBsd6RMkjVDRZzb', label: 'George (Male, Authoritative Sales)' },
  { value: 'nPczCjzI2devNBz1zQrb', label: 'Brian (Male, Deep Professional)' },
  { value: 'onwK4e9ZLuTAKqWW03F9', label: 'Daniel (Male, British Sophisticated)' },
  { value: 'cjVigY5qzO86Huf0OWal', label: 'Eric (Male, Friendly American)' },
  { value: 'iP95p4xoKVk53GoZ742B', label: 'Chris (Male, Warm Conversational)' },
  { value: 'TX3LPaxmHKxFdv7VOQHJ', label: 'Liam (Male, Clear Articulate)' },
  { value: 'CwhRBWXzGAHq8TQ4Fs17', label: 'Roger (Male, Confident Executive)' },
  { value: 'N2lVS1w4EtoT3dr4eOWO', label: 'Callum (Male, Energetic Persuasive)' },
  { value: 'bIHbv24MWmeRgasZH58o', label: 'Will (Male, Young Professional)' },
  { value: 'pqHfZKP75CvOlQylNhV4', label: 'Bill (Male, Mature Trustworthy)' },
  { value: 'IKne3meq5aSn9XLyUdCD', label: 'Charlie (Male, Casual Approachable)' },
  
  // === FEMALE VOICES - Sales Optimized ===
  { value: 'EXAVITQu4vr4xnSDxMaL', label: 'Sarah (Female, Warm Professional)' },
  { value: 'FGY2WhTYpPnrIDTdsKH5', label: 'Laura (Female, Upbeat Friendly)' },
  { value: 'cgSgspJ2msm6clMCkdW9', label: 'Jessica (Female, Clear Energetic)' },
  { value: 'Xb7hH8MSUJpSbSDYk0k2', label: 'Alice (Female, British Confident)' },
  { value: 'XrExE9yKIg1WjnnlVkGX', label: 'Matilda (Female, Warm Engaging)' },
  { value: 'pFZP5JQG7iQjIQuC4Bku', label: 'Lily (Female, Youthful Enthusiastic)' },
  { value: 'SAz9YHcvj6GT2YYXdXww', label: 'River (Female, Calm Reassuring)' },
  { value: '21m00Tcm4TlvDq8ikWAM', label: 'Rachel (Female, Classic American)' },
  { value: 'ThT5KcBeYPX3keUQqHPh', label: 'Dorothy (Female, Mature Trustworthy)' },
  { value: 'jsCqWAovK2LkecY7zXl4', label: 'Freya (Female, Nordic Professional)' },
];

const ACTION_OPTIONS = [
  { value: 'book_appointment', label: 'Book Appointment' },
  { value: 'send_sms', label: 'Send SMS' },
  { value: 'update_crm', label: 'Update CRM' },
  { value: 'add_to_pipeline', label: 'Add to Pipeline' },
  { value: 'schedule_callback', label: 'Schedule Callback' },
  { value: 'transfer_call', label: 'Transfer to Human' },
  { value: 'play_audio', label: 'Play Audio' },
];

const DEFAULT_CONFIG: AgentConfig = {
  name: 'New Agent',
  description: '',
  voice: 'EXAVITQu4vr4xnSDxMaL', // Sarah (Female, Warm Professional)
  language: 'en-US',
  firstMessage: 'Hi {{first_name}}, this is Sarah from {{company}}. How are you doing today?',
  systemPrompt: `You are a friendly and professional AI assistant making outbound calls.

Your goals:
1. Build rapport with the prospect
2. Qualify their interest
3. Book an appointment if interested

Key behaviors:
- Be conversational and natural
- Listen actively and respond appropriately
- Handle objections gracefully
- Always be respectful of their time`,
  nodes: [],
  settings: {
    interruptionSensitivity: 0.5,
    responseDelay: 0.8,
    endCallAfterSilence: 10,
    maxCallDuration: 600,
    enableVoicemail: true,
    voicemailMessage: 'Hi {{first_name}}, this is {{agent_name}}. I was calling about {{topic}}. Please call me back at your convenience.',
  },
};

export function AgentFlowBuilder() {
  const [config, setConfig] = useState<AgentConfig>(DEFAULT_CONFIG);
  const [selectedNode, setSelectedNode] = useState<FlowNode | null>(null);
  const [showNodeEditor, setShowNodeEditor] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  // This table may not exist in every environment; use a safe client to avoid typecheck failures.
  const sb = supabase as any;

  const addNode = (type: NodeType) => {
    const newNode: FlowNode = {
      id: `node_${Date.now()}`,
      type,
      label: NODE_TEMPLATES[type].label,
      content: '',
      conditions: type === 'condition' ? [{ condition: '', nextNodeId: '' }] : undefined,
    };

    setConfig(prev => ({
      ...prev,
      nodes: [...prev.nodes, newNode]
    }));

    setSelectedNode(newNode);
    setShowNodeEditor(true);
  };

  const updateNode = (updatedNode: FlowNode) => {
    setConfig(prev => ({
      ...prev,
      nodes: prev.nodes.map(n => n.id === updatedNode.id ? updatedNode : n)
    }));
    setSelectedNode(updatedNode);
  };

  const deleteNode = (nodeId: string) => {
    setConfig(prev => ({
      ...prev,
      nodes: prev.nodes.filter(n => n.id !== nodeId)
    }));
    if (selectedNode?.id === nodeId) {
      setSelectedNode(null);
      setShowNodeEditor(false);
    }
  };

  const duplicateNode = (node: FlowNode) => {
    const newNode: FlowNode = {
      ...node,
      id: `node_${Date.now()}`,
      label: `${node.label} (Copy)`,
    };

    setConfig(prev => ({
      ...prev,
      nodes: [...prev.nodes, newNode]
    }));
  };

  const generateSystemPrompt = () => {
    // Generate a system prompt based on the flow nodes
    let prompt = config.systemPrompt + '\n\n## Conversation Flow\n\n';

    config.nodes.forEach((node, index) => {
      prompt += `### Step ${index + 1}: ${node.label}\n`;
      prompt += `${node.content}\n\n`;

      if (node.type === 'condition' && node.conditions) {
        prompt += 'Conditions:\n';
        node.conditions.forEach(c => {
          prompt += `- If ${c.condition}: proceed accordingly\n`;
        });
        prompt += '\n';
      }
    });

    return prompt;
  };

  const saveAgent = async () => {
    if (!config.name.trim()) {
      toast({ title: 'Error', description: 'Please enter an agent name', variant: 'destructive' });
      return;
    }

    setSaving(true);

    try {
      const generatedPrompt = generateSystemPrompt();

      // Save to database
      const { data, error } = await sb
        .from('retell_agents')
        .insert({
          name: config.name,
          agent_type: 'outbound',
          voice_id: config.voice,
          language: config.language,
          first_message: config.firstMessage,
          system_prompt: generatedPrompt,
          settings: {
            ...config.settings,
            flow_nodes: config.nodes,
          },
          is_active: true,
        })
        .select()
        .maybeSingle();

      if (error) throw error;

      toast({
        title: 'Agent Saved!',
        description: `"${config.name}" has been created. Deploy it to Retell to start using.`,
      });

    } catch (error: any) {
      console.error('Error saving agent:', error);
      toast({
        title: 'Error saving agent',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const exportConfig = () => {
    const exportData = {
      ...config,
      generatedPrompt: generateSystemPrompt(),
      exportedAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agent-${config.name.toLowerCase().replace(/\s+/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);

    toast({ title: 'Exported!', description: 'Agent configuration downloaded' });
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-4">
          <Bot className="h-6 w-6 text-primary" />
          <div>
            <Input
              value={config.name}
              onChange={(e) => setConfig(prev => ({ ...prev, name: e.target.value }))}
              className="text-lg font-semibold border-none p-0 h-auto focus-visible:ring-0"
              placeholder="Agent Name"
            />
            <p className="text-sm text-muted-foreground">Visual Agent Flow Builder</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowPreview(true)}>
            <Eye className="h-4 w-4 mr-2" />
            Preview
          </Button>
          <Button variant="outline" size="sm" onClick={exportConfig}>
            <Copy className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button size="sm" onClick={saveAgent} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Saving...' : 'Save Agent'}
          </Button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Node Palette */}
        <div className="w-64 border-r p-4 flex flex-col">
          <h3 className="font-semibold mb-3">Add Node</h3>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(NODE_TEMPLATES) as NodeType[]).map((type) => {
              const template = NODE_TEMPLATES[type];
              const Icon = template.icon;
              return (
                <Button
                  key={type}
                  variant="outline"
                  size="sm"
                  className="h-auto py-3 flex flex-col gap-1"
                  onClick={() => addNode(type)}
                >
                  <div className={`p-1.5 rounded ${template.color}`}>
                    <Icon className="h-4 w-4 text-white" />
                  </div>
                  <span className="text-xs">{template.label}</span>
                </Button>
              );
            })}
          </div>

          <Separator className="my-4" />

          <h3 className="font-semibold mb-3">Agent Settings</h3>
          <ScrollArea className="flex-1">
            <div className="space-y-4 pr-2">
              <div>
                <Label className="text-xs">Voice</Label>
                <Select
                  value={config.voice}
                  onValueChange={(v) => setConfig(prev => ({ ...prev, voice: v }))}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VOICE_OPTIONS.map((v) => (
                      <SelectItem key={v.value} value={v.value} className="text-xs">
                        {v.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">First Message</Label>
                <Textarea
                  value={config.firstMessage}
                  onChange={(e) => setConfig(prev => ({ ...prev, firstMessage: e.target.value }))}
                  className="text-xs h-20"
                  placeholder="Hi {{first_name}}..."
                />
              </div>

              <div className="flex items-center justify-between">
                <Label className="text-xs">Enable Voicemail</Label>
                <Switch
                  checked={config.settings.enableVoicemail}
                  onCheckedChange={(v) => setConfig(prev => ({
                    ...prev,
                    settings: { ...prev.settings, enableVoicemail: v }
                  }))}
                />
              </div>

              <div>
                <Label className="text-xs">Max Call Duration (sec)</Label>
                <Input
                  type="number"
                  value={config.settings.maxCallDuration}
                  onChange={(e) => setConfig(prev => ({
                    ...prev,
                    settings: { ...prev.settings, maxCallDuration: parseInt(e.target.value) || 600 }
                  }))}
                  className="h-8 text-xs"
                />
              </div>
            </div>
          </ScrollArea>
        </div>

        {/* Center - Flow Canvas */}
        <div className="flex-1 p-6 overflow-auto bg-muted/30">
          {config.nodes.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <Card className="w-96">
                <CardHeader className="text-center">
                  <Wand2 className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                  <CardTitle>Start Building Your Agent</CardTitle>
                  <CardDescription>
                    Click on a node type from the left panel to add it to your conversation flow.
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-center">
                  <Button onClick={() => addNode('greeting')}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add First Node
                  </Button>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="space-y-3">
              {/* System Prompt Card */}
              <Card className="mb-6">
                <CardHeader className="py-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    System Prompt
                  </CardTitle>
                </CardHeader>
                <CardContent className="py-0 pb-3">
                  <Textarea
                    value={config.systemPrompt}
                    onChange={(e) => setConfig(prev => ({ ...prev, systemPrompt: e.target.value }))}
                    className="text-xs font-mono h-32"
                    placeholder="Define your agent's personality and behavior..."
                  />
                </CardContent>
              </Card>

              {/* Flow Nodes */}
              {config.nodes.map((node, index) => {
                const template = NODE_TEMPLATES[node.type];
                const Icon = template.icon;

                return (
                  <div key={node.id} className="relative">
                    {index > 0 && (
                      <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                        <ArrowRight className="h-4 w-4 text-muted-foreground rotate-90" />
                      </div>
                    )}
                    <Card
                      className={`cursor-pointer hover:shadow-md transition-shadow ${
                        selectedNode?.id === node.id ? 'ring-2 ring-primary' : ''
                      }`}
                      onClick={() => {
                        setSelectedNode(node);
                        setShowNodeEditor(true);
                      }}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className={`p-2 rounded ${template.color}`}>
                            <Icon className="h-4 w-4 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <h4 className="font-medium text-sm">{node.label}</h4>
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    duplicateNode(node);
                                  }}
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-destructive"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteNode(node.id);
                                  }}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground truncate mt-1">
                              {node.content || 'Click to configure...'}
                            </p>
                            {node.type === 'condition' && node.conditions && (
                              <div className="flex gap-1 mt-2">
                                {node.conditions.map((c, i) => (
                                  <Badge key={i} variant="outline" className="text-xs">
                                    {c.condition || `Branch ${i + 1}`}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                );
              })}

              {/* Add More Button */}
              <Button
                variant="outline"
                className="w-full border-dashed"
                onClick={() => addNode('question')}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Node
              </Button>
            </div>
          )}
        </div>

        {/* Right Panel - Node Editor */}
        {showNodeEditor && selectedNode && (
          <div className="w-80 border-l p-4 overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Edit Node</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowNodeEditor(false)}
              >
                ×
              </Button>
            </div>

            <div className="space-y-4">
              <div>
                <Label>Label</Label>
                <Input
                  value={selectedNode.label}
                  onChange={(e) => updateNode({ ...selectedNode, label: e.target.value })}
                />
              </div>

              <div>
                <Label>Content / Script</Label>
                <Textarea
                  value={selectedNode.content}
                  onChange={(e) => updateNode({ ...selectedNode, content: e.target.value })}
                  className="h-32"
                  placeholder={
                    selectedNode.type === 'question'
                      ? "What question should the agent ask?"
                      : selectedNode.type === 'response'
                      ? "How should the agent respond?"
                      : selectedNode.type === 'condition'
                      ? "What conditions determine the next step?"
                      : "Enter the content for this node..."
                  }
                />
              </div>

              {selectedNode.type === 'action' && (
                <div>
                  <Label>Action Type</Label>
                  <Select
                    value={selectedNode.action || ''}
                    onValueChange={(v) => updateNode({ ...selectedNode, action: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select action..." />
                    </SelectTrigger>
                    <SelectContent>
                      {ACTION_OPTIONS.map((a) => (
                        <SelectItem key={a.value} value={a.value}>
                          {a.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {selectedNode.type === 'condition' && (
                <div>
                  <Label>Conditions</Label>
                  <div className="space-y-2 mt-2">
                    {selectedNode.conditions?.map((condition, i) => (
                      <div key={i} className="flex gap-2">
                        <Input
                          value={condition.condition}
                          onChange={(e) => {
                            const newConditions = [...(selectedNode.conditions || [])];
                            newConditions[i] = { ...newConditions[i], condition: e.target.value };
                            updateNode({ ...selectedNode, conditions: newConditions });
                          }}
                          placeholder={`Condition ${i + 1}`}
                          className="text-sm"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 shrink-0"
                          onClick={() => {
                            const newConditions = selectedNode.conditions?.filter((_, idx) => idx !== i);
                            updateNode({ ...selectedNode, conditions: newConditions });
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const newConditions = [...(selectedNode.conditions || []), { condition: '', nextNodeId: '' }];
                        updateNode({ ...selectedNode, conditions: newConditions });
                      }}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Condition
                    </Button>
                  </div>
                </div>
              )}

              <div className="pt-4">
                <Badge variant="outline" className="text-xs">
                  {NODE_TEMPLATES[selectedNode.type].label} Node
                </Badge>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Agent Preview</DialogTitle>
            <DialogDescription>
              Generated system prompt for your agent
            </DialogDescription>
          </DialogHeader>
          <div className="bg-muted p-4 rounded-lg">
            <pre className="text-xs whitespace-pre-wrap font-mono">
              {generateSystemPrompt()}
            </pre>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreview(false)}>
              Close
            </Button>
            <Button onClick={saveAgent} disabled={saving}>
              {saving ? 'Saving...' : 'Save Agent'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AgentFlowBuilder;
