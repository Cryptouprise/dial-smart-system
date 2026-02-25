import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  Plus, RefreshCw, Trash2, Copy, Phone, Bot, Brain,
  Mic, MessageSquare, Calendar, Database, Settings,
  CheckCircle, AlertCircle, Loader2, ExternalLink, Zap,
  PhoneCall, Variable, Info, BookOpen,
} from 'lucide-react';

interface TelnyxAssistant {
  id: string;
  telnyx_assistant_id: string | null;
  name: string;
  description: string | null;
  model: string;
  instructions: string;
  greeting: string | null;
  voice: string;
  transcription_model: string;
  status: string;
  tools: any[];
  enabled_features: string[];
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

interface TelnyxModel {
  id: string;
  name: string;
  provider: string;
  recommended?: boolean;
  cost: string;
}

interface TelnyxVoice {
  id: string;
  name: string;
  provider: string;
  tier: string;
  gender: string;
}

const DEFAULT_INSTRUCTIONS = `You are a professional and friendly AI assistant making outbound calls. Your goal is to have a natural conversation, qualify the lead's interest, and if appropriate, book an appointment.

Key behaviors:
- Greet the person by name if available using {{first_name}}
- Be conversational, not robotic
- Listen actively and respond to what they actually say
- If they're interested, use the book_appointment tool to check availability and schedule
- If they ask to be called back, note the preferred time
- If they're not interested, be respectful and end the call gracefully
- Never be pushy or aggressive

Current time: {{telnyx_current_time}}
Lead info: {{full_name}}, {{company}}, {{lead_source}}`;

const DEFAULT_GREETING = "Hi {{first_name}}, this is an AI assistant calling on behalf of our team. How are you doing today?";

async function callEdgeFunction(functionName: string, body: any) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${functionName}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Edge function error');
  return data;
}

// =============================================
// TEST CALL DIALOG
// =============================================
const TestCallDialog: React.FC<{ assistant: TelnyxAssistant; onClose: () => void }> = ({ assistant, onClose }) => {
  const { toast } = useToast();
  const [toNumber, setToNumber] = useState('');
  const [fromNumber, setFromNumber] = useState('');
  const [calling, setCalling] = useState(false);
  const [callResult, setCallResult] = useState<any>(null);
  const [dynVars, setDynVars] = useState('{\n  "first_name": "John",\n  "last_name": "Smith",\n  "company": "Test Corp"\n}');

  const handleTestCall = async () => {
    if (!toNumber.trim()) {
      toast({ title: 'Enter Phone Number', description: 'Enter the number you want the AI to call', variant: 'destructive' });
      return;
    }
    setCalling(true);
    setCallResult(null);
    try {
      let parsedVars = {};
      try { parsedVars = JSON.parse(dynVars); } catch { /* ignore parse errors */ }

      const data = await callEdgeFunction('telnyx-ai-assistant', {
        action: 'test_call',
        assistant_id: assistant.id,
        to_number: toNumber,
        from_number: fromNumber || undefined,
        dynamic_variables: parsedVars,
      });
      setCallResult(data);
      toast({ title: '📞 Call Initiated!', description: data.message });
    } catch (err: any) {
      toast({ title: 'Call Failed', description: err.message, variant: 'destructive' });
      setCallResult({ error: err.message });
    } finally {
      setCalling(false);
    }
  };

  return (
    <Card className="border-2 border-primary/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <PhoneCall className="h-5 w-5 text-primary" />
          Test Call — {assistant.name}
        </CardTitle>
        <CardDescription>
          Have this AI assistant call a phone number. The agent will use its instructions, voice, and tools in a live call.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Phone Number to Call *</Label>
            <Input
              value={toNumber}
              onChange={e => setToNumber(e.target.value)}
              placeholder="+1 (555) 123-4567"
              type="tel"
            />
            <p className="text-xs text-muted-foreground">Enter your phone number — the AI will call you</p>
          </div>
          <div className="space-y-2">
            <Label>From Number (optional)</Label>
            <Input
              value={fromNumber}
              onChange={e => setFromNumber(e.target.value)}
              placeholder="Auto-detect Telnyx number"
              type="tel"
            />
            <p className="text-xs text-muted-foreground">Leave blank to use your first active Telnyx number</p>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Dynamic Variables (JSON — injected into the call)</Label>
          <Textarea
            value={dynVars}
            onChange={e => setDynVars(e.target.value)}
            className="font-mono text-sm min-h-[100px]"
            placeholder='{"first_name": "John", "company": "Acme"}'
          />
          <p className="text-xs text-muted-foreground">
            These override the {"{{variable}}"} placeholders in your instructions and greeting
          </p>
        </div>

        {callResult && (
          <Card className={callResult.error ? 'border-destructive/50 bg-destructive/5' : 'border-green-500/50 bg-green-500/5'}>
            <CardContent className="py-3">
              {callResult.error ? (
                <p className="text-sm text-destructive">{callResult.error}</p>
              ) : (
                <div className="text-sm space-y-1">
                  <p className="font-medium text-green-700">✅ {callResult.message}</p>
                  <p className="text-muted-foreground">From: {callResult.from} → To: {callResult.to}</p>
                  {callResult.call_sid && <p className="text-xs text-muted-foreground">Call SID: {callResult.call_sid}</p>}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={handleTestCall} disabled={calling} className="gap-1">
            {calling ? <Loader2 className="h-4 w-4 animate-spin" /> : <PhoneCall className="h-4 w-4" />}
            {calling ? 'Calling...' : 'Call Now'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

// =============================================
// DYNAMIC VARIABLES REFERENCE PANEL
// =============================================
const DynamicVariablesPanel: React.FC = () => {
  const [varData, setVarData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await callEdgeFunction('telnyx-ai-assistant', { action: 'list_variables' });
        setVarData(data);
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!varData) return null;

  return (
    <div className="space-y-6">
      {/* How It Works */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><Info className="h-4 w-4" />How Dynamic Variables Work</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Variables let you personalize every call. Use <code className="bg-muted px-1 rounded">{"{{variable_name}}"}</code> in your instructions and greeting.
          </p>
          <div className="bg-muted/50 rounded-lg p-3 space-y-1">
            {varData.how_it_works?.priority_order?.map((step: string, i: number) => (
              <p key={i} className="text-xs text-muted-foreground">{step}</p>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            <strong>Webhook:</strong> <code className="bg-muted px-1 rounded text-[10px]">{varData.how_it_works?.webhook_url}</code>
          </p>
          <p className="text-xs text-muted-foreground">{varData.how_it_works?.webhook_note}</p>
        </CardContent>
      </Card>

      {/* System Variables */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">System Variables (Auto-injected by Telnyx)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {varData.system_variables?.map((v: any) => (
              <div key={v.name} className="py-2 flex items-start gap-3">
                <code className="bg-muted px-2 py-0.5 rounded text-xs font-mono whitespace-nowrap">{v.name}</code>
                <div className="flex-1">
                  <p className="text-sm">{v.description}</p>
                  {v.example && <p className="text-xs text-muted-foreground">e.g. {v.example}</p>}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Custom Variables */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Custom Variables (From Webhook or API Call)</CardTitle>
          <CardDescription className="text-xs">
            These are auto-loaded from your leads database via the dynamic vars webhook when a call starts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {varData.custom_variables?.map((v: any) => (
              <div key={v.name} className="flex items-center gap-2 py-1">
                <code className="bg-muted px-2 py-0.5 rounded text-xs font-mono">{v.name}</code>
                <span className="text-xs text-muted-foreground">{v.description}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Calendar Integration Info */}
      <Card className="border-blue-500/20 bg-blue-500/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><Calendar className="h-4 w-4 text-blue-500" />Calendar Integration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>Calendar booking is <strong>automatically added</strong> as a webhook tool on every new assistant. The AI can:</p>
          <ul className="list-disc list-inside space-y-1 text-muted-foreground text-sm">
            <li><code className="bg-muted px-1 rounded">get_available_slots</code> — Check your calendar availability for a given date</li>
            <li><code className="bg-muted px-1 rounded">book_appointment</code> — Book an appointment with lead name, email, phone, date/time</li>
          </ul>
          <p className="text-muted-foreground text-xs mt-2">
            <strong>Setup:</strong> Connect Google Calendar in Settings → Calendar tab first. The AI agent will automatically call your calendar-integration endpoint during live calls.
          </p>
          <p className="text-muted-foreground text-xs">
            <strong>In your instructions:</strong> Add something like "When the lead wants to schedule, use the book_appointment tool to check availability and book."
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

// =============================================
// MAIN COMPONENT
// =============================================
const TelnyxAIManager: React.FC = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('assistants');
  const [assistants, setAssistants] = useState<TelnyxAssistant[]>([]);
  const [models, setModels] = useState<TelnyxModel[]>([]);
  const [voices, setVoices] = useState<TelnyxVoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [testCallAssistant, setTestCallAssistant] = useState<TelnyxAssistant | null>(null);

  // Create form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formModel, setFormModel] = useState('Qwen/Qwen3-235B-A22B');
  const [formVoice, setFormVoice] = useState('Telnyx.NaturalHD.Ava');
  const [formInstructions, setFormInstructions] = useState(DEFAULT_INSTRUCTIONS);
  const [formGreeting, setFormGreeting] = useState(DEFAULT_GREETING);
  const [formAmd, setFormAmd] = useState(true);

  // Health check state
  const [healthStatus, setHealthStatus] = useState<any>(null);

  const loadAssistants = useCallback(async () => {
    setLoading(true);
    try {
      const data = await callEdgeFunction('telnyx-ai-assistant', { action: 'list_assistants' });
      setAssistants(data.assistants || []);
    } catch (err: any) {
      console.error('Failed to load assistants:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadModelsAndVoices = useCallback(async () => {
    try {
      const [modelData, voiceData] = await Promise.all([
        callEdgeFunction('telnyx-ai-assistant', { action: 'list_models' }),
        callEdgeFunction('telnyx-ai-assistant', { action: 'list_voices' }),
      ]);
      setModels(modelData.models || []);
      setVoices(voiceData.voices || []);
    } catch (err: any) {
      console.error('Failed to load models/voices:', err);
    }
  }, []);

  const checkHealth = useCallback(async () => {
    try {
      const data = await callEdgeFunction('telnyx-ai-assistant', { action: 'health_check' });
      setHealthStatus(data);
    } catch (err: any) {
      setHealthStatus({ healthy: false, error: err.message });
    }
  }, []);

  useEffect(() => {
    loadAssistants();
    loadModelsAndVoices();
    checkHealth();
  }, [loadAssistants, loadModelsAndVoices, checkHealth]);

  const handleCreate = async () => {
    if (!formName.trim() || !formInstructions.trim()) {
      toast({ title: 'Missing fields', description: 'Name and instructions are required', variant: 'destructive' });
      return;
    }

    setCreating(true);
    try {
      await callEdgeFunction('telnyx-ai-assistant', {
        action: 'create_assistant',
        name: formName,
        description: formDescription || null,
        model: formModel,
        voice: formVoice,
        instructions: formInstructions,
        greeting: formGreeting || null,
        tools: [],
      });

      toast({ title: 'Assistant Created', description: `${formName} is ready on Telnyx` });
      setShowCreateForm(false);
      setFormName('');
      setFormDescription('');
      setFormInstructions(DEFAULT_INSTRUCTIONS);
      setFormGreeting(DEFAULT_GREETING);
      loadAssistants();
    } catch (err: any) {
      toast({ title: 'Creation Failed', description: err.message, variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (assistant: TelnyxAssistant) => {
    if (!confirm(`Delete "${assistant.name}"? This will also delete it from Telnyx.`)) return;

    try {
      await callEdgeFunction('telnyx-ai-assistant', {
        action: 'delete_assistant',
        assistant_id: assistant.id,
      });
      toast({ title: 'Deleted', description: `${assistant.name} has been removed` });
      loadAssistants();
    } catch (err: any) {
      toast({ title: 'Delete Failed', description: err.message, variant: 'destructive' });
    }
  };

  const handleClone = async (assistant: TelnyxAssistant) => {
    try {
      await callEdgeFunction('telnyx-ai-assistant', {
        action: 'clone_assistant',
        assistant_id: assistant.id,
      });
      toast({ title: 'Cloned', description: `Copy of ${assistant.name} created` });
      loadAssistants();
    } catch (err: any) {
      toast({ title: 'Clone Failed', description: err.message, variant: 'destructive' });
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const data = await callEdgeFunction('telnyx-ai-assistant', { action: 'sync_assistants' });
      toast({ title: 'Synced', description: `${data.synced} assistants synced from Telnyx` });
      loadAssistants();
    } catch (err: any) {
      toast({ title: 'Sync Failed', description: err.message, variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  const handleToggleStatus = async (assistant: TelnyxAssistant) => {
    const newStatus = assistant.status === 'active' ? 'paused' : 'active';
    try {
      await callEdgeFunction('telnyx-ai-assistant', {
        action: 'update_assistant',
        assistant_id: assistant.id,
        status: newStatus,
      });
      loadAssistants();
    } catch (err: any) {
      toast({ title: 'Update Failed', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Telnyx Voice AI</h2>
          <p className="text-muted-foreground">Manage AI assistants, test calls, dynamic variables, and more</p>
        </div>
        <div className="flex items-center gap-2">
          {healthStatus && (
            <Badge variant={healthStatus.telnyx_api_reachable ? 'default' : 'destructive'} className="gap-1">
              {healthStatus.telnyx_api_reachable ? <CheckCircle className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
              {healthStatus.telnyx_configured ? (healthStatus.telnyx_api_reachable ? 'Connected' : 'API Error') : 'Not Configured'}
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
            <RefreshCw className={`h-4 w-4 mr-1 ${syncing ? 'animate-spin' : ''}`} />
            Sync
          </Button>
          <Button size="sm" onClick={() => setShowCreateForm(true)}>
            <Plus className="h-4 w-4 mr-1" />
            New Assistant
          </Button>
        </div>
      </div>

      {/* Pricing Banner */}
      <Card className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 border-green-500/20">
        <CardContent className="py-3 px-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-4 text-sm">
              <span className="font-medium">Telnyx AI Pricing:</span>
              <Badge variant="secondary">$0.09/min all-in (open-source LLM)</Badge>
              <Badge variant="secondary">Free AMD</Badge>
              <Badge variant="secondary">Native Memory</Badge>
              <Badge variant="secondary">Sub-200ms Latency</Badge>
            </div>
            <span className="text-xs text-muted-foreground">vs Retell: $0.13-0.31/min</span>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="assistants" className="gap-1"><Bot className="h-3 w-3" />Assistants</TabsTrigger>
          <TabsTrigger value="variables" className="gap-1"><Variable className="h-3 w-3" />Variables</TabsTrigger>
          <TabsTrigger value="insights" className="gap-1"><Brain className="h-3 w-3" />Insights</TabsTrigger>
          <TabsTrigger value="scheduled" className="gap-1"><Calendar className="h-3 w-3" />Scheduled</TabsTrigger>
          <TabsTrigger value="knowledge" className="gap-1"><Database className="h-3 w-3" />Knowledge</TabsTrigger>
          <TabsTrigger value="docs" className="gap-1"><BookOpen className="h-3 w-3" />Docs</TabsTrigger>
        </TabsList>

        {/* ==================== ASSISTANTS TAB ==================== */}
        <TabsContent value="assistants" className="space-y-4">
          {/* Test Call Panel */}
          {testCallAssistant && (
            <TestCallDialog
              assistant={testCallAssistant}
              onClose={() => setTestCallAssistant(null)}
            />
          )}

          {/* Create Form */}
          {showCreateForm && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Create New AI Assistant</CardTitle>
                <CardDescription>Configure a voice AI agent on Telnyx. Calendar booking tool is auto-added.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Name *</Label>
                    <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Solar Sales Agent" />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Input value={formDescription} onChange={e => setFormDescription(e.target.value)} placeholder="Outbound solar lead qualification" />
                  </div>
                  <div className="space-y-2">
                    <Label>LLM Model</Label>
                    <Select value={formModel} onValueChange={setFormModel}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {models.map(m => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.name} ({m.cost}){m.recommended ? ' — Recommended' : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Voice</Label>
                    <Select value={formVoice} onValueChange={setFormVoice}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {voices.map(v => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.name} ({v.provider}, {v.gender})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Greeting (spoken at call start — supports {"{{variables}}"} )</Label>
                  <Input value={formGreeting} onChange={e => setFormGreeting(e.target.value)} placeholder="Hi {{first_name}}..." />
                </div>
                <div className="space-y-2">
                  <Label>Instructions * (system prompt — supports {"{{variables}}"} )</Label>
                  <Textarea
                    value={formInstructions}
                    onChange={e => setFormInstructions(e.target.value)}
                    placeholder="You are a professional AI assistant..."
                    className="min-h-[200px] font-mono text-sm"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={formAmd} onCheckedChange={setFormAmd} />
                  <Label>Enable Answering Machine Detection (Premium — 97% accuracy, $0.0065/call)</Label>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setShowCreateForm(false)}>Cancel</Button>
                  <Button onClick={handleCreate} disabled={creating}>
                    {creating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Zap className="h-4 w-4 mr-1" />}
                    Create on Telnyx
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Assistant List */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : assistants.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Bot className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No Telnyx AI Assistants</h3>
                <p className="text-muted-foreground mt-1 max-w-md">
                  Create your first AI assistant to start making intelligent outbound calls with native memory, AMD, and sub-200ms latency.
                </p>
                <Button className="mt-4" onClick={() => setShowCreateForm(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Create Assistant
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {assistants.map(a => (
                <Card key={a.id} className={a.status === 'paused' ? 'opacity-60' : ''}>
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold truncate">{a.name}</h3>
                          <Badge variant={a.status === 'active' ? 'default' : a.status === 'draft' ? 'secondary' : 'outline'}>
                            {a.status}
                          </Badge>
                          {a.is_default && <Badge variant="outline" className="text-xs">Default</Badge>}
                          {a.telnyx_assistant_id && (
                            <Badge variant="outline" className="text-xs gap-1">
                              <CheckCircle className="h-2.5 w-2.5" />Synced
                            </Badge>
                          )}
                        </div>
                        {a.description && <p className="text-sm text-muted-foreground truncate">{a.description}</p>}
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Brain className="h-3 w-3" />{a.model.split('/').pop()}</span>
                          <span className="flex items-center gap-1"><Mic className="h-3 w-3" />{a.voice.split('.').pop()}</span>
                          <span className="flex items-center gap-1"><Zap className="h-3 w-3" />{a.tools?.length || 0} tools</span>
                          {a.enabled_features?.includes('messaging') && (
                            <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />SMS</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 ml-2">
                        <Button
                          variant="default"
                          size="sm"
                          className="gap-1"
                          onClick={() => setTestCallAssistant(a)}
                          disabled={a.status !== 'active'}
                        >
                          <PhoneCall className="h-3.5 w-3.5" />
                          Test Call
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleToggleStatus(a)} title={a.status === 'active' ? 'Pause' : 'Activate'}>
                          {a.status === 'active' ? 'Pause' : 'Activate'}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleClone(a)} title="Clone">
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(a)} title="Delete">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ==================== VARIABLES TAB ==================== */}
        <TabsContent value="variables" className="space-y-4">
          <DynamicVariablesPanel />
        </TabsContent>

        {/* ==================== INSIGHTS TAB ==================== */}
        <TabsContent value="insights" className="space-y-4">
          <InsightsPanel />
        </TabsContent>

        {/* ==================== SCHEDULED TAB ==================== */}
        <TabsContent value="scheduled" className="space-y-4">
          <ScheduledEventsPanel />
        </TabsContent>

        {/* ==================== KNOWLEDGE TAB ==================== */}
        <TabsContent value="knowledge" className="space-y-4">
          <KnowledgeBasePanel />
        </TabsContent>

        {/* ==================== DOCS TAB ==================== */}
        <TabsContent value="docs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Telnyx AI Quick Reference</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <h4 className="font-semibold mb-2">🤖 Creating Agents</h4>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li><strong>Name & Instructions</strong> are required — instructions are the system prompt</li>
                  <li><strong>Greeting</strong> is spoken first when the call connects</li>
                  <li><strong>Model</strong>: Qwen 3 235B is free on Telnyx and recommended for voice</li>
                  <li><strong>Voice</strong>: NaturalHD voices sound most human ($0.000012/char)</li>
                  <li><strong>Calendar tool</strong> is auto-added — just mention booking in your instructions</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-2">📞 Test Calls</h4>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li>Click <strong>"Test Call"</strong> on any active assistant</li>
                  <li>Enter your phone number — the AI will call you within seconds</li>
                  <li>You can inject dynamic variables for personalization testing</li>
                  <li>Requires at least one active Telnyx phone number</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-2">📋 Dynamic Variables</h4>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li>Use <code className="bg-muted px-1 rounded">{"{{variable_name}}"}</code> in instructions & greeting</li>
                  <li>System vars like <code className="bg-muted px-1 rounded">{"{{telnyx_current_time}}"}</code> are auto-filled</li>
                  <li>Custom vars are loaded from your leads DB via the dynamic vars webhook</li>
                  <li>See the <strong>Variables</strong> tab for the full reference</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-2">📅 Calendar Booking</h4>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li>Connect Google Calendar first in Settings → Calendar</li>
                  <li>The webhook tool is auto-configured on every new assistant</li>
                  <li>The AI calls <code className="bg-muted px-1 rounded">get_available_slots</code> and <code className="bg-muted px-1 rounded">book_appointment</code></li>
                  <li>Include booking instructions in your agent prompt</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-2">💡 Tips for Best Results</h4>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li>Keep instructions under 4000 characters for best latency</li>
                  <li>Use numbered steps in your script for consistent flow</li>
                  <li>Always include objection handling instructions</li>
                  <li>Test with real phone calls before launching campaigns</li>
                  <li>Telnyx memory persists across calls — the AI remembers previous conversations</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

// =============================================
// SUB-COMPONENTS
// =============================================

const InsightsPanel: React.FC = () => {
  const { toast } = useToast();
  const [insights, setInsights] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [insightData, templateData] = await Promise.all([
        callEdgeFunction('telnyx-insights', { action: 'list_insights', limit: 20 }),
        callEdgeFunction('telnyx-insights', { action: 'list_templates' }),
      ]);
      setInsights(insightData.insights || []);
      setTemplates(templateData.templates || []);
    } catch (err: any) {
      console.error('Failed to load insights:', err);
    } finally {
      setLoading(false);
    }
  };

  const createDefaults = async () => {
    try {
      const data = await callEdgeFunction('telnyx-insights', { action: 'create_defaults' });
      toast({ title: 'Default Templates Created', description: `${data.created} insight templates ready` });
      loadData();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Post-Call Insight Templates</h3>
        <Button size="sm" variant="outline" onClick={createDefaults}>
          <Plus className="h-4 w-4 mr-1" />Create Default Templates
        </Button>
      </div>

      {templates.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No insight templates yet. Create defaults to auto-analyze every call.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {templates.map(t => (
            <Card key={t.id}>
              <CardContent className="py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{t.name}</p>
                    <p className="text-xs text-muted-foreground truncate max-w-[300px]">{t.instructions}</p>
                  </div>
                  {t.json_schema && <Badge variant="secondary" className="text-xs">Structured</Badge>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {insights.length > 0 && (
        <>
          <h3 className="font-semibold pt-4">Recent Call Insights</h3>
          <div className="space-y-2">
            {insights.map(i => (
              <Card key={i.id}>
                <CardContent className="py-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-muted-foreground">{new Date(i.created_at).toLocaleString()}</span>
                    <Badge variant="outline" className="text-xs">{(i.insights || []).length} insights</Badge>
                  </div>
                  {(i.insights || []).map((ins: any, idx: number) => (
                    <div key={idx} className="mt-1 text-sm">
                      <span className="font-medium">{ins.name}: </span>
                      <span className="text-muted-foreground">
                        {typeof ins.result === 'object' ? JSON.stringify(ins.result) : String(ins.result).substring(0, 200)}
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

const ScheduledEventsPanel: React.FC = () => {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadEvents();
  }, []);

  const loadEvents = async () => {
    setLoading(true);
    try {
      const data = await callEdgeFunction('telnyx-scheduled-events', {
        action: 'list_events',
        status: 'scheduled',
      });
      setEvents(data.events || []);
    } catch (err: any) {
      console.error('Failed to load events:', err);
    } finally {
      setLoading(false);
    }
  };

  const cancelEvent = async (eventId: string) => {
    try {
      await callEdgeFunction('telnyx-scheduled-events', {
        action: 'cancel_event',
        event_id: eventId,
      });
      toast({ title: 'Cancelled', description: 'Scheduled event has been cancelled' });
      loadEvents();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Scheduled Callbacks & Follow-ups</h3>
        <Button size="sm" variant="outline" onClick={loadEvents}>
          <RefreshCw className="h-4 w-4 mr-1" />Refresh
        </Button>
      </div>

      {events.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
            No scheduled events. Callbacks and follow-ups will appear here when scheduled.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {events.map(e => (
            <Card key={e.id}>
              <CardContent className="py-3 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    {e.channel === 'phone_call' ? <Phone className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
                    <span className="font-medium">{e.to_number}</span>
                    <Badge variant="outline">{e.channel === 'phone_call' ? 'Call' : 'SMS'}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Scheduled: {new Date(e.scheduled_at).toLocaleString()}
                    {e.from_number && ` from ${e.from_number}`}
                  </p>
                </div>
                <Button variant="ghost" size="sm" className="text-destructive" onClick={() => cancelEvent(e.id)}>Cancel</Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

const KnowledgeBasePanel: React.FC = () => {
  const [kbs, setKbs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKbName, setNewKbName] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    loadKbs();
  }, []);

  const loadKbs = async () => {
    setLoading(true);
    try {
      const data = await callEdgeFunction('telnyx-knowledge-base', { action: 'list_kbs' });
      setKbs(data.knowledge_bases || []);
    } catch (err: any) {
      console.error('Failed to load KBs:', err);
    } finally {
      setLoading(false);
    }
  };

  const createKb = async () => {
    if (!newKbName.trim()) return;
    setCreating(true);
    try {
      await callEdgeFunction('telnyx-knowledge-base', {
        action: 'create_kb',
        name: newKbName,
      });
      toast({ title: 'Created', description: `Knowledge base "${newKbName}" is ready for documents` });
      setNewKbName('');
      loadKbs();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Knowledge Bases (RAG)</h3>
      </div>

      <Card>
        <CardContent className="py-3">
          <div className="flex items-center gap-2">
            <Input
              value={newKbName}
              onChange={e => setNewKbName(e.target.value)}
              placeholder="Knowledge base name (e.g., Solar FAQ)"
              onKeyDown={e => e.key === 'Enter' && createKb()}
            />
            <Button onClick={createKb} disabled={creating || !newKbName.trim()}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>

      {kbs.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Database className="h-8 w-8 mx-auto mb-2 opacity-50" />
            No knowledge bases yet. Create one and upload documents so your AI can reference them during calls.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {kbs.map(kb => (
            <Card key={kb.id}>
              <CardContent className="py-3">
                <div className="flex items-center justify-between mb-1">
                  <h4 className="font-medium">{kb.name}</h4>
                  <Badge variant={kb.status === 'ready' ? 'default' : kb.status === 'embedding' ? 'secondary' : 'outline'}>
                    {kb.status}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Model: {kb.embedding_model} | Bucket: {kb.bucket_name}
                </p>
                {kb.description && <p className="text-xs text-muted-foreground mt-1">{kb.description}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default TelnyxAIManager;
