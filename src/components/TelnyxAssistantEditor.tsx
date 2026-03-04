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
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  Save, X, Loader2, Bot, Mic, Phone, BarChart3, Settings,
  PhoneCall, Shield, Volume2, Clock, AlertCircle, MessageSquare,
  Globe, Puzzle, FlaskConical, Wrench, ExternalLink, Eye,
  Play, RefreshCw, Search, ChevronDown, Info,
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
  call_direction: 'inbound' | 'outbound' | 'both';
  created_at: string;
  updated_at: string;
  metadata?: any;
  dynamic_variables?: any;
}

interface EditorProps {
  assistant: TelnyxAssistant;
  models: { id: string; name: string; provider: string; cost: string; recommended?: boolean }[];
  voices: { id: string; name: string; provider: string; tier: string; gender: string }[];
  onSave: () => void;
  onClose: () => void;
}

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

const TelnyxAssistantEditor: React.FC<EditorProps> = ({ assistant, models, voices, onSave, onClose }) => {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [previewingVoice, setPreviewingVoice] = useState(false);
  const [loadingTelnyx, setLoadingTelnyx] = useState(true);
  const [activeTab, setActiveTab] = useState('agent');
  const [telnyxData, setTelnyxData] = useState<any>(null);

  // Agent tab
  const [name, setName] = useState(assistant.name);
  const [description, setDescription] = useState(assistant.description || '');
  const [model, setModel] = useState(assistant.model);
  const [instructions, setInstructions] = useState(assistant.instructions);
  const [greeting, setGreeting] = useState(assistant.greeting || '');
  const [greetingMode, setGreetingMode] = useState(assistant.metadata?.greeting_mode || 'assistant_speaks_first');
  const [dynamicVars, setDynamicVars] = useState<Record<string, string>>(
    assistant.dynamic_variables || {}
  );
  const [dynamicVarsWebhook, setDynamicVarsWebhook] = useState('');

  // Voice tab
  const [voice, setVoice] = useState(assistant.voice);
  const [voiceSpeed, setVoiceSpeed] = useState(assistant.metadata?.voice_speed || 1);
  const [transcriptionModel, setTranscriptionModel] = useState(assistant.transcription_model);
  const [endOfTurnThreshold, setEndOfTurnThreshold] = useState(assistant.metadata?.end_of_turn_threshold || 0.7);
  const [endOfTurnTimeout, setEndOfTurnTimeout] = useState(assistant.metadata?.end_of_turn_timeout_ms || 5000);
  const [eagerEndOfTurn, setEagerEndOfTurn] = useState(assistant.metadata?.eager_end_of_turn_threshold || 0.3);
  const [noiseSuppressionEnabled, setNoiseSuppressionEnabled] = useState(
    assistant.metadata?.noise_suppression?.enabled ?? true
  );
  const [noiseSuppressionEngine, setNoiseSuppressionEngine] = useState(
    assistant.metadata?.noise_suppression?.engine || 'krisp'
  );
  const [bgAudioType, setBgAudioType] = useState(assistant.metadata?.background_audio?.type || 'none');
  const [bgAudioMedia, setBgAudioMedia] = useState(assistant.metadata?.background_audio?.media || 'office');
  const [bgAudioVolume, setBgAudioVolume] = useState(assistant.metadata?.background_audio?.volume || 0.5);

  // Calling tab
  const [callDirection, setCallDirection] = useState<'inbound' | 'outbound' | 'both'>(assistant.call_direction || 'outbound');
  const [maxCallDuration, setMaxCallDuration] = useState(assistant.metadata?.max_call_duration_seconds || 1800);
  const [userIdleTimeout, setUserIdleTimeout] = useState(assistant.metadata?.user_idle_timeout_seconds || 30);
  const [amdAction, setAmdAction] = useState(assistant.metadata?.amd_settings?.action || 'leave_message_stop');
  const [vmMessageType, setVmMessageType] = useState(assistant.metadata?.amd_settings?.voicemail_message_type || 'message');
  const [vmMessage, setVmMessage] = useState(assistant.metadata?.amd_settings?.voicemail_message || '');
  const [recordingChannels, setRecordingChannels] = useState(assistant.metadata?.recording_settings?.channels || 'dual');
  const [recordingFormat, setRecordingFormat] = useState(assistant.metadata?.recording_settings?.format || 'mp3');

  // Messaging tab
  const [messagingEnabled, setMessagingEnabled] = useState(assistant.metadata?.messaging?.enabled ?? false);
  const [smsGreeting, setSmsGreeting] = useState(assistant.metadata?.messaging?.greeting || '');
  const [smsInstructions, setSmsInstructions] = useState(assistant.metadata?.messaging?.instructions || '');

  // Widget tab
  const [widgetEnabled, setWidgetEnabled] = useState(assistant.metadata?.widget?.enabled ?? false);

  // Advanced tab
  const [temperature, setTemperature] = useState(assistant.metadata?.temperature ?? 0.7);
  const [maxTokens, setMaxTokens] = useState(assistant.metadata?.max_tokens ?? 1024);
  const [interruptSensitivity, setInterruptSensitivity] = useState(assistant.metadata?.interrupt_sensitivity ?? 0.5);
  const [silenceTimeout, setSilenceTimeout] = useState(assistant.metadata?.silence_timeout_ms ?? 10000);

  // Analysis tab  
  const [conversations, setConversations] = useState<any[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [analysisSubTab, setAnalysisSubTab] = useState<'history' | 'insights'>('history');
  const [conversationInsights, setConversationInsights] = useState<any[]>([]);

  // Load full Telnyx data on mount
  useEffect(() => {
    (async () => {
      try {
        const data = await callEdgeFunction('telnyx-ai-assistant', {
          action: 'get_assistant',
          assistant_id: assistant.id,
        });
        setTelnyxData(data.telnyx);
        
        if (data.telnyx) {
          const t = data.telnyx;
          if (t.instructions) setInstructions(t.instructions);
          if (t.greeting) setGreeting(t.greeting);
          if (t.model) setModel(t.model);
          if (t.name) setName(t.name);
          if (t.voice_settings?.voice) setVoice(t.voice_settings.voice);
          if (t.voice_settings?.speed) setVoiceSpeed(t.voice_settings.speed);
          if (t.transcription?.model) setTranscriptionModel(t.transcription.model);
          if (t.transcription?.end_of_turn_threshold) setEndOfTurnThreshold(t.transcription.end_of_turn_threshold);
          if (t.transcription?.end_of_turn_timeout_ms) setEndOfTurnTimeout(t.transcription.end_of_turn_timeout_ms);
          if (t.transcription?.eager_end_of_turn_threshold) setEagerEndOfTurn(t.transcription.eager_end_of_turn_threshold);
          if (t.dynamic_variables) setDynamicVars(t.dynamic_variables);
          if (t.dynamic_variables_webhook_url) setDynamicVarsWebhook(t.dynamic_variables_webhook_url);
          if (t.greeting_mode) setGreetingMode(t.greeting_mode);
          if (t.noise_suppression) {
            setNoiseSuppressionEnabled(t.noise_suppression.enabled ?? true);
            setNoiseSuppressionEngine(t.noise_suppression.engine || 'krisp');
          }
          if (t.background_audio) {
            setBgAudioType(t.background_audio.type || 'none');
            setBgAudioMedia(t.background_audio.media || 'office');
            setBgAudioVolume(t.background_audio.volume ?? 0.5);
          }
          if (t.telephony_settings) {
            if (t.telephony_settings.max_call_duration_seconds) setMaxCallDuration(t.telephony_settings.max_call_duration_seconds);
            if (t.telephony_settings.user_idle_timeout_seconds) setUserIdleTimeout(t.telephony_settings.user_idle_timeout_seconds);
          }
          if (t.amd_settings) {
            setAmdAction(t.amd_settings.action || 'leave_message_stop');
            setVmMessageType(t.amd_settings.voicemail_message_type || 'message');
            setVmMessage(t.amd_settings.voicemail_message || '');
          }
          if (t.recording_settings) {
            setRecordingChannels(t.recording_settings.channels || 'dual');
            setRecordingFormat(t.recording_settings.format || 'mp3');
          }
        }
      } catch (err: any) {
        console.error('Failed to load Telnyx data:', err);
      }
      setLoadingTelnyx(false);
    })();
  }, [assistant.id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await callEdgeFunction('telnyx-ai-assistant', {
        action: 'update_assistant',
        assistant_id: assistant.id,
        name,
        description: description || null,
        model,
        instructions,
        greeting: greeting || null,
        greeting_mode: greetingMode,
        voice,
        voice_speed: voiceSpeed,
        transcription_model: transcriptionModel,
        end_of_turn_threshold: endOfTurnThreshold,
        end_of_turn_timeout_ms: endOfTurnTimeout,
        eager_end_of_turn_threshold: eagerEndOfTurn,
        noise_suppression: { enabled: noiseSuppressionEnabled, engine: noiseSuppressionEngine },
        background_audio: bgAudioType !== 'none'
          ? { type: bgAudioType, media: bgAudioMedia, volume: bgAudioVolume }
          : { type: 'none' },
        max_call_duration_seconds: maxCallDuration,
        user_idle_timeout_seconds: userIdleTimeout,
        amd_settings: {
          action: amdAction,
          voicemail_message_type: vmMessageType,
          voicemail_message: vmMessage,
        },
        recording_settings: { channels: recordingChannels, format: recordingFormat },
        dynamic_variables: dynamicVars,
        call_direction: callDirection,
        messaging: { enabled: messagingEnabled, greeting: smsGreeting, instructions: smsInstructions },
        widget: { enabled: widgetEnabled },
        temperature,
        max_tokens: maxTokens,
        interrupt_sensitivity: interruptSensitivity,
        silence_timeout_ms: silenceTimeout,
      });

      toast({ title: 'Saved', description: `${name} updated successfully` });
      onSave();
    } catch (err: any) {
      toast({ title: 'Save Failed', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const loadConversations = useCallback(async () => {
    if (!assistant.telnyx_assistant_id) return;
    setLoadingConversations(true);
    try {
      const { data } = await supabase
        .from('call_logs')
        .select('id, phone_number, status, outcome, duration_seconds, created_at, transcript, call_summary, telnyx_conversation_id, sentiment')
        .or(`telnyx_assistant_id.eq.${assistant.telnyx_assistant_id},agent_id.eq.${assistant.telnyx_assistant_id}`)
        .order('created_at', { ascending: false })
        .limit(20);
      setConversations(data || []);
    } catch { /* ignore */ }
    setLoadingConversations(false);
  }, [assistant.telnyx_assistant_id]);

  const loadInsights = useCallback(async () => {
    try {
      const data = await callEdgeFunction('telnyx-insights', { action: 'list_insights', limit: 20 });
      setConversationInsights(data.insights || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (activeTab === 'analysis') {
      loadConversations();
      loadInsights();
    }
  }, [activeTab, loadConversations, loadInsights]);

  if (loadingTelnyx) {
    return (
      <Card className="border-2 border-primary/20">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          Loading assistant configuration from Telnyx...
        </CardContent>
      </Card>
    );
  }

  const telnyxPortalUrl = assistant.telnyx_assistant_id 
    ? `https://portal.telnyx.com/#/ai/assistants/edit/assistant-${assistant.telnyx_assistant_id}`
    : null;

  return (
    <Card className="border-2 border-primary/20">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              Editing: {assistant.name}
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              ID: {assistant.telnyx_assistant_id || 'Not synced'}
              {telnyxData?.telephony_settings?.default_texml_app_id && (
                <> · TeXML: {telnyxData.telephony_settings.default_texml_app_id}</>
              )}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {telnyxPortalUrl && (
              <Button variant="ghost" size="sm" onClick={() => window.open(telnyxPortalUrl, '_blank')}>
                <ExternalLink className="h-4 w-4 mr-1" />Portal
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={onClose}>
              <X className="h-4 w-4 mr-1" />Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
              Save to Telnyx
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-9 mb-4">
            <TabsTrigger value="agent" className="gap-1 text-xs"><Bot className="h-3 w-3" />Agent</TabsTrigger>
            <TabsTrigger value="voice" className="gap-1 text-xs"><Mic className="h-3 w-3" />Voice</TabsTrigger>
            <TabsTrigger value="integrations" className="gap-1 text-xs"><Puzzle className="h-3 w-3" />Integrations</TabsTrigger>
            <TabsTrigger value="analysis" className="gap-1 text-xs"><BarChart3 className="h-3 w-3" />Analysis</TabsTrigger>
            <TabsTrigger value="calling" className="gap-1 text-xs"><Phone className="h-3 w-3" />Calling</TabsTrigger>
            <TabsTrigger value="messaging" className="gap-1 text-xs"><MessageSquare className="h-3 w-3" />Messaging</TabsTrigger>
            <TabsTrigger value="widget" className="gap-1 text-xs"><Globe className="h-3 w-3" />Widget</TabsTrigger>
            <TabsTrigger value="advanced" className="gap-1 text-xs"><Wrench className="h-3 w-3" />Advanced</TabsTrigger>
            <TabsTrigger value="simulation" className="gap-1 text-xs"><FlaskConical className="h-3 w-3" />Simulation</TabsTrigger>
          </TabsList>

          {/* ===== AGENT TAB ===== */}
          <TabsContent value="agent" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Model</Label>
                <Select value={model} onValueChange={setModel}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {models.map(m => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name} ({m.cost}){m.recommended ? ' ★' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Instructions * (system prompt)</Label>
              <Textarea
                value={instructions}
                onChange={e => setInstructions(e.target.value)}
                className="min-h-[300px] font-mono text-sm"
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {instructions.length} chars · Use {"{{variable_name}}"} for personalization
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={() => {
                    // Extract all {{var}} from instructions + greeting
                    const allText = `${instructions} ${greeting}`;
                    const regex = /\{\{([^}]+)\}\}/g;
                    const foundVars = new Set<string>();
                    let match;
                    while ((match = regex.exec(allText)) !== null) {
                      foundVars.add(match[1].trim());
                    }

                    const definedKeys = new Set(Object.keys(dynamicVars));
                    const missingInDefs = [...foundVars].filter(v => !definedKeys.has(v));
                    const unusedDefs = [...definedKeys].filter(k => !foundVars.has(k));

                    if (missingInDefs.length === 0 && unusedDefs.length === 0) {
                      toast({ title: '✅ All variables match', description: `${foundVars.size} variable(s) found — all have default values defined.` });
                      return;
                    }

                    let msg = '';
                    if (missingInDefs.length > 0) {
                      msg += `Used in script but missing defaults:\n• ${missingInDefs.join('\n• ')}\n\n`;
                    }
                    if (unusedDefs.length > 0) {
                      msg += `Defined but not used in script:\n• ${unusedDefs.join('\n• ')}`;
                    }

                    const shouldFix = missingInDefs.length > 0
                      ? confirm(`${msg}\n\nAdd missing variables with empty defaults?`)
                      : (alert(msg), false);

                    if (shouldFix) {
                      const next = { ...dynamicVars };
                      missingInDefs.forEach(k => { next[k] = ''; });
                      setDynamicVars(next);
                      toast({ title: 'Variables added', description: `Added ${missingInDefs.length} missing variable(s) with empty defaults.` });
                    }
                  }}
                >
                  <Search className="h-3 w-3" /> Check Variables
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Greeting Mode</Label>
              <Select value={greetingMode} onValueChange={setGreetingMode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="assistant_speaks_first">Assistant speaks first</SelectItem>
                  <SelectItem value="assistant_waits">Assistant waits for user</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Greeting (spoken at call start — supports {"{{variables}}"})</Label>
              <Input value={greeting} onChange={e => setGreeting(e.target.value)} />
            </div>

            {/* Dynamic Variables */}
            <Card className="border-dashed">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Dynamic Variables</CardTitle>
                <CardDescription className="text-xs">Default values for {"{{variable}}"} placeholders</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(dynamicVars).map(([key, val]) => (
                  <div key={key} className="flex items-center gap-2">
                    <code className="text-xs bg-muted px-2 py-1 rounded min-w-[140px]">{key}</code>
                    <Input
                      value={val}
                      onChange={e => setDynamicVars(prev => ({ ...prev, [key]: e.target.value }))}
                      className="text-sm"
                    />
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                      const next = { ...dynamicVars };
                      delete next[key];
                      setDynamicVars(next);
                    }}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => {
                  const key = prompt('Variable name (e.g. contact_first_name):');
                  if (key) setDynamicVars(prev => ({ ...prev, [key]: '' }));
                }}>
                  + Add Variable
                </Button>
                {dynamicVarsWebhook && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Webhook: <code className="bg-muted px-1 rounded">{dynamicVarsWebhook}</code>
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Tools */}
            <Card className="border-dashed">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Tools</CardTitle>
              </CardHeader>
              <CardContent>
                {assistant.tools && assistant.tools.length > 0 ? (
                  <div className="space-y-2">
                    {assistant.tools.map((tool: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <Badge variant="secondary">{tool.type || 'webhook'}</Badge>
                        <span className="font-medium">{tool.name}</span>
                        <span className="text-muted-foreground text-xs truncate">{tool.description}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Calendar booking tools are auto-added on creation. Add more tools via the Telnyx portal.</p>
                )}
                {telnyxPortalUrl && (
                  <Button variant="outline" size="sm" className="mt-3 gap-1" onClick={() => window.open(telnyxPortalUrl, '_blank')}>
                    <ExternalLink className="h-3 w-3" />Manage Tools in Telnyx Portal
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Knowledge Bases */}
            <Card className="border-dashed">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Knowledge Bases</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-2">
                  Attach knowledge bases from the <strong>Knowledge</strong> tab in the main Telnyx AI section, or manage directly in the Telnyx portal.
                </p>
                {telnyxPortalUrl && (
                  <Button variant="outline" size="sm" className="gap-1" onClick={() => window.open(telnyxPortalUrl, '_blank')}>
                    <ExternalLink className="h-3 w-3" />Manage Knowledge Bases
                  </Button>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== VOICE TAB ===== */}
          <TabsContent value="voice" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label>Voice</Label>
                <div className="flex gap-2">
                  <Select value={voice} onValueChange={setVoice}>
                    <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {voices.map(v => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.name} ({v.provider}, {v.gender})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={previewingVoice}
                    onClick={async () => {
                      setPreviewingVoice(true);
                      try {
                        const sampleText = greeting
                          ? greeting.replace(/\{\{[^}]+\}\}/g, 'there')
                          : `Hi there! My name is ${voices.find(v => v.id === voice)?.name || 'your assistant'}. How can I help you today?`;

                        const res = await callEdgeFunction('telnyx-ai-assistant', {
                          action: 'preview_voice',
                          params: { voice_id: voice, text: sampleText },
                        });

                        if (res.audio_url) {
                          const audio = new Audio(res.audio_url);
                          audio.play();
                        } else if (res.audio_base64) {
                          const audio = new Audio(`data:audio/mpeg;base64,${res.audio_base64}`);
                          audio.play();
                        } else {
                          toast({ title: 'Preview not available', description: 'Voice preview requires Telnyx TTS. Voice ID has been set — test with a live call.', variant: 'default' });
                        }
                      } catch (err: any) {
                        toast({ title: 'Preview failed', description: err.message, variant: 'destructive' });
                      } finally {
                        setPreviewingVoice(false);
                      }
                    }}
                    title="Preview voice sample"
                  >
                    {previewingVoice ? <Loader2 className="h-4 w-4 animate-spin" /> : <Volume2 className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {voices.find(v => v.id === voice)?.tier === 'premium' && '⭐ Premium HD voice'}
                  {voices.find(v => v.id === voice)?.tier === 'enhanced' && '✨ Enhanced voice'}
                  {voices.find(v => v.id === voice)?.tier === 'basic' && '🎤 Free Kokoro voice'}
                  {voices.find(v => v.id === voice)?.tier === 'neural' && '🧠 Neural voice'}
                </p>
              </div>
              <div className="space-y-2">
                <Label>Voice Speed: {voiceSpeed}x</Label>
                <Slider
                  value={[voiceSpeed]}
                  onValueChange={([v]) => setVoiceSpeed(v)}
                  min={0.5} max={2} step={0.1}
                />
              </div>
            </div>

            <h4 className="font-semibold text-sm pt-2">Transcription</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Transcription Model</Label>
                <Select value={transcriptionModel} onValueChange={setTranscriptionModel}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="telnyx_deepgram_nova3">Deepgram Nova 3</SelectItem>
                    <SelectItem value="deepgram/flux">Deepgram Flux</SelectItem>
                    <SelectItem value="google/chirp2">Google Chirp 2</SelectItem>
                    <SelectItem value="openai/whisper">OpenAI Whisper</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>End-of-turn Threshold</Label>
                <Input type="number" value={endOfTurnThreshold} onChange={e => setEndOfTurnThreshold(parseFloat(e.target.value))} min={0} max={1} step={0.1} />
              </div>
              <div className="space-y-2">
                <Label>End-of-turn Timeout (ms)</Label>
                <Input type="number" value={endOfTurnTimeout} onChange={e => setEndOfTurnTimeout(parseInt(e.target.value))} min={500} max={30000} step={500} />
              </div>
              <div className="space-y-2">
                <Label>Eager End-of-turn Threshold</Label>
                <Input type="number" value={eagerEndOfTurn} onChange={e => setEagerEndOfTurn(parseFloat(e.target.value))} min={0} max={1} step={0.1} />
              </div>
            </div>

            <h4 className="font-semibold text-sm pt-2">Noise Suppression</h4>
            <div className="flex items-center gap-3">
              <Switch checked={noiseSuppressionEnabled} onCheckedChange={setNoiseSuppressionEnabled} />
              <Label>Enable Noise Suppression</Label>
            </div>
            {noiseSuppressionEnabled && (
              <div className="space-y-2">
                <Label>Engine</Label>
                <Select value={noiseSuppressionEngine} onValueChange={setNoiseSuppressionEngine}>
                  <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="krisp">Krisp (recommended)</SelectItem>
                    <SelectItem value="rnnoise">RNNoise</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <h4 className="font-semibold text-sm pt-2">Background Audio</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={bgAudioType} onValueChange={setBgAudioType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="predefined_media">Predefined Media</SelectItem>
                    <SelectItem value="custom_url">Custom URL</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {bgAudioType === 'predefined_media' && (
                <div className="space-y-2">
                  <Label>Predefined Media</Label>
                  <Select value={bgAudioMedia} onValueChange={setBgAudioMedia}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="office">Office</SelectItem>
                      <SelectItem value="cafe">Café</SelectItem>
                      <SelectItem value="rain">Rain</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {bgAudioType !== 'none' && (
                <div className="space-y-2">
                  <Label>Volume: {bgAudioVolume}</Label>
                  <Slider
                    value={[bgAudioVolume]}
                    onValueChange={([v]) => setBgAudioVolume(v)}
                    min={0.1} max={1} step={0.1}
                  />
                </div>
              )}
            </div>
          </TabsContent>

          {/* ===== INTEGRATIONS TAB ===== */}
          <TabsContent value="integrations" className="space-y-4">
            <h4 className="font-semibold">Integrations</h4>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Connected Integrations</CardTitle>
              </CardHeader>
              <CardContent>
                {(telnyxData?.integrations && telnyxData.integrations.length > 0) ? (
                  <div className="space-y-2">
                    {telnyxData.integrations.map((int: any, i: number) => (
                      <div key={i} className="flex items-center gap-2">
                        <Badge variant="default">{int.name || int.type}</Badge>
                        <span className="text-sm text-muted-foreground">{int.tools_count || '?'} tools</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Card className="border-amber-500/20 bg-amber-500/5">
                    <CardContent className="py-3 text-sm">
                      <AlertCircle className="h-4 w-4 inline mr-2 text-amber-600" />
                      There are no integrations connected to this assistant
                    </CardContent>
                  </Card>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Add Integration</CardTitle>
                <CardDescription className="text-xs">
                  Connect third-party tools to give your assistant access to external data and actions. Manage integrations in the Telnyx portal.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2 mb-4">
                  {['All', 'sales_crm', 'scheduling', 'customer_support', 'knowledge_documentation'].map(cat => (
                    <Badge key={cat} variant="outline" className="cursor-pointer hover:bg-accent capitalize">
                      {cat.replace(/_/g, ' ')}
                    </Badge>
                  ))}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { name: 'Airtable', tools: 23 },
                    { name: 'Asana', tools: 52 },
                    { name: 'Calendly', tools: 35 },
                    { name: 'Confluence', tools: 25 },
                    { name: 'GitHub', tools: 71, available: true },
                    { name: 'Gong', tools: 15 },
                    { name: 'HubSpot', tools: 24 },
                    { name: 'Intercom', tools: 31 },
                    { name: 'Jira', tools: 40 },
                    { name: 'Notion', tools: 28 },
                    { name: 'Salesforce', tools: 45 },
                    { name: 'Slack', tools: 20 },
                  ].map(int => (
                    <Card key={int.name} className="cursor-pointer hover:border-primary/50 transition-colors">
                      <CardContent className="py-3 px-3">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm">{int.name}</span>
                          {int.available && <Badge variant="default" className="text-[10px]">Available</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{int.tools} tools</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                {telnyxPortalUrl && (
                  <Button variant="outline" size="sm" className="mt-4 gap-1" onClick={() => window.open(telnyxPortalUrl + '?tab=integrations', '_blank')}>
                    <ExternalLink className="h-3 w-3" />Manage in Telnyx Portal
                  </Button>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== ANALYSIS TAB ===== */}
          <TabsContent value="analysis" className="space-y-4">
            <div className="flex gap-2 mb-2">
              <Button
                variant={analysisSubTab === 'history' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setAnalysisSubTab('history')}
              >
                Conversation History
              </Button>
              <Button
                variant={analysisSubTab === 'insights' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setAnalysisSubTab('insights')}
              >
                Insights
              </Button>
            </div>

            {analysisSubTab === 'history' && (
              <>
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-sm">Conversation History</h4>
                  <Button variant="outline" size="sm" onClick={loadConversations} disabled={loadingConversations}>
                    {loadingConversations ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                    Refresh
                  </Button>
                </div>

                {conversations.length === 0 ? (
                  <Card>
                    <CardContent className="py-8 text-center text-muted-foreground">
                      No conversations found for this assistant yet. Make a test call to see data here.
                    </CardContent>
                  </Card>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left py-2 px-3 font-medium">ID</th>
                          <th className="text-left py-2 px-3 font-medium">Channel</th>
                          <th className="text-left py-2 px-3 font-medium">User</th>
                          <th className="text-left py-2 px-3 font-medium">Duration</th>
                          <th className="text-left py-2 px-3 font-medium">Outcome</th>
                          <th className="text-left py-2 px-3 font-medium">Created at</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {conversations.map(c => (
                          <tr key={c.id} className="hover:bg-muted/30">
                            <td className="py-2 px-3">
                              <code className="text-xs">{c.telnyx_conversation_id ? c.telnyx_conversation_id.slice(0, 16) + '...' : c.id.slice(0, 8)}</code>
                            </td>
                            <td className="py-2 px-3">
                              <Badge variant="outline" className="text-xs">phone call</Badge>
                            </td>
                            <td className="py-2 px-3 text-xs">{c.phone_number}</td>
                            <td className="py-2 px-3 text-xs">{c.duration_seconds ? `${Math.round(c.duration_seconds / 60)}m ${c.duration_seconds % 60}s` : '—'}</td>
                            <td className="py-2 px-3">
                              <Badge variant={c.status === 'completed' ? 'default' : 'secondary'} className="text-xs">
                                {c.outcome || c.status}
                              </Badge>
                            </td>
                            <td className="py-2 px-3 text-xs text-muted-foreground">{new Date(c.created_at).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {analysisSubTab === 'insights' && (
              <>
                <h4 className="font-semibold text-sm">Insights</h4>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Insight Group</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Select defaultValue="default">
                      <SelectTrigger><SelectValue placeholder="Select insight group" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">Default</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="flex gap-2 mt-2 text-xs">
                      <Button variant="link" size="sm" className="text-xs p-0 h-auto">Create new</Button>
                      <span className="text-muted-foreground">·</span>
                      <Button variant="link" size="sm" className="text-xs p-0 h-auto">Edit selected</Button>
                    </div>
                  </CardContent>
                </Card>

                <div className="space-y-3">
                  {[
                    { name: 'Summary', desc: 'Summarize the conversation for use as future context. Include key facts, decisions, preferences, or goals that could help continue or complete future tasks.' },
                    { name: 'Disposition', desc: 'Classify the call outcome: appointment_set, interested, callback, not_interested, no_answer, voicemail, wrong_number.' },
                    { name: 'Intent', desc: 'Identify the primary intent of the lead: buying, researching, comparing, not interested, or undecided.' },
                    { name: 'Appointment Check', desc: 'Did the lead agree to book an appointment? Extract the date/time if mentioned.' },
                  ].map(insight => (
                    <Card key={insight.name}>
                      <CardContent className="py-3">
                        <h5 className="font-medium text-sm">{insight.name}</h5>
                        <p className="text-xs text-muted-foreground mt-1">{insight.desc}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </>
            )}
          </TabsContent>

          {/* ===== CALLING TAB ===== */}
          <TabsContent value="calling" className="space-y-4">
            <h4 className="font-semibold text-sm flex items-center gap-2">
              <PhoneCall className="h-4 w-4" />
              Call Direction
            </h4>
            <div className="space-y-2">
              <Label>How should this assistant be used?</Label>
              <Select value={callDirection} onValueChange={(v) => setCallDirection(v as 'inbound' | 'outbound' | 'both')}>
                <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="outbound">↑ Outbound — Makes calls to leads</SelectItem>
                  <SelectItem value="inbound">↓ Inbound — Answers incoming calls</SelectItem>
                  <SelectItem value="both">↕ Both — Inbound &amp; outbound</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <h4 className="font-semibold text-sm pt-2">Settings</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Max Call Duration (seconds)</Label>
                <Input type="number" value={maxCallDuration} onChange={e => setMaxCallDuration(parseInt(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label>User Idle Timeout (seconds)</Label>
                <Input type="number" value={userIdleTimeout} onChange={e => setUserIdleTimeout(parseInt(e.target.value))} />
              </div>
            </div>

            <h4 className="font-semibold text-sm pt-4 flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Voicemail Detection (AMD)
            </h4>
            <Card className="border-blue-500/20 bg-blue-500/5">
              <CardContent className="py-3 text-xs text-muted-foreground">
                <AlertCircle className="h-3 w-3 inline mr-1" />
                Standard AMD is free, Premium is $0.0065/call with 97% accuracy.
              </CardContent>
            </Card>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Action on Voicemail Detected</Label>
                <Select value={amdAction} onValueChange={setAmdAction}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="leave_message_stop">Leave message and stop assistant</SelectItem>
                    <SelectItem value="hangup">Hang up immediately</SelectItem>
                    <SelectItem value="continue">Continue with assistant</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Voicemail Message Type</Label>
                <Select value={vmMessageType} onValueChange={setVmMessageType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="message">Text Message (TTS)</SelectItem>
                    <SelectItem value="audio_url">Audio URL</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {amdAction === 'leave_message_stop' && (
              <div className="space-y-2">
                <Label>Voicemail Message</Label>
                <Textarea value={vmMessage} onChange={e => setVmMessage(e.target.value)} placeholder="Hey, sorry we were trying to get a hold of you..." className="min-h-[80px]" />
              </div>
            )}

            <h4 className="font-semibold text-sm pt-4 flex items-center gap-2">
              <Volume2 className="h-4 w-4" />
              Recording Settings
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Channels</Label>
                <Select value={recordingChannels} onValueChange={setRecordingChannels}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dual">Dual (stereo)</SelectItem>
                    <SelectItem value="single">Single (mono)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Format</Label>
                <Select value={recordingFormat} onValueChange={setRecordingFormat}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mp3">MP3</SelectItem>
                    <SelectItem value="wav">WAV</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </TabsContent>

          {/* ===== MESSAGING TAB ===== */}
          <TabsContent value="messaging" className="space-y-4">
            <h4 className="font-semibold">Messaging</h4>
            <p className="text-sm text-muted-foreground">
              Enable SMS/MMS messaging for this assistant. When enabled, the assistant can send and receive text messages using the same AI personality.
            </p>

            <div className="flex items-center gap-3">
              <Switch checked={messagingEnabled} onCheckedChange={setMessagingEnabled} />
              <Label>Enable SMS Messaging</Label>
            </div>

            {messagingEnabled && (
              <>
                <div className="space-y-2">
                  <Label>SMS Greeting</Label>
                  <Input
                    value={smsGreeting}
                    onChange={e => setSmsGreeting(e.target.value)}
                    placeholder="Hi {{first_name}}, this is {{assistant_name}}. How can I help you?"
                  />
                  <p className="text-xs text-muted-foreground">First message sent when a conversation starts via SMS</p>
                </div>
                <div className="space-y-2">
                  <Label>SMS Instructions (override)</Label>
                  <Textarea
                    value={smsInstructions}
                    onChange={e => setSmsInstructions(e.target.value)}
                    placeholder="Leave blank to use the same instructions as voice calls"
                    className="min-h-[120px] font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Optional: Provide separate instructions for SMS conversations. If blank, the agent's main instructions are used.
                  </p>
                </div>
                <Card className="border-blue-500/20 bg-blue-500/5">
                  <CardContent className="py-3 text-xs text-muted-foreground">
                    <Info className="h-3 w-3 inline mr-1" />
                    SMS messages are sent via your Telnyx phone numbers. Make sure you have at least one number with messaging enabled.
                    Telnyx SMS pricing: ~$0.004/message.
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* ===== WIDGET TAB ===== */}
          <TabsContent value="widget" className="space-y-4">
            <h4 className="font-semibold">Widget</h4>

            <Card className="border-amber-500/20 bg-amber-500/5">
              <CardContent className="py-4 text-sm">
                <AlertCircle className="h-4 w-4 inline mr-2 text-amber-600" />
                Widgets only work with assistants that have telephony enabled and support for unauthenticated web calls.
                This allows users to interact with your AI assistant directly from your website without requiring authentication.
                <br /><br />
                You can manage these settings in the <strong>Calling</strong> tab or you can click the button below to enable these settings now.
              </CardContent>
            </Card>

            <div className="flex items-center gap-3">
              <Switch checked={widgetEnabled} onCheckedChange={setWidgetEnabled} />
              <Label>Enable Web Widget</Label>
            </div>

            {widgetEnabled && assistant.telnyx_assistant_id && (
              <>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Embed Code</CardTitle>
                    <CardDescription className="text-xs">Add this to your website to enable the AI voice widget</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <pre className="bg-muted p-3 rounded text-xs overflow-x-auto">
{`<script src="https://cdn.telnyx.com/ai-widget/v1/widget.js"></script>
<script>
  TelnyxAI.init({
    assistantId: "${assistant.telnyx_assistant_id}",
    theme: "light",
    position: "bottom-right"
  });
</script>`}
                    </pre>
                    <Button variant="outline" size="sm" className="mt-2" onClick={() => {
                      navigator.clipboard.writeText(`<script src="https://cdn.telnyx.com/ai-widget/v1/widget.js"></script>\n<script>\n  TelnyxAI.init({\n    assistantId: "${assistant.telnyx_assistant_id}",\n    theme: "light",\n    position: "bottom-right"\n  });\n</script>`);
                      toast({ title: 'Copied', description: 'Widget code copied to clipboard' });
                    }}>
                      Copy Code
                    </Button>
                  </CardContent>
                </Card>
                <p className="text-xs text-muted-foreground">
                  For full widget customization options, visit the{' '}
                  <a href="https://telnyx.com/docs/ai/widgets" target="_blank" rel="noreferrer" className="text-primary underline">
                    Telnyx Widget documentation
                  </a>.
                </p>
              </>
            )}
          </TabsContent>

          {/* ===== ADVANCED TAB ===== */}
          <TabsContent value="advanced" className="space-y-4">
            <h4 className="font-semibold">Advanced Settings</h4>
            <p className="text-sm text-muted-foreground">Fine-tune the AI model behavior and conversation dynamics.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>Temperature: {temperature}</Label>
                <Slider
                  value={[temperature]}
                  onValueChange={([v]) => setTemperature(v)}
                  min={0} max={1.5} step={0.05}
                />
                <p className="text-xs text-muted-foreground">
                  Lower = more deterministic, higher = more creative. Default: 0.7
                </p>
              </div>

              <div className="space-y-2">
                <Label>Max Tokens: {maxTokens}</Label>
                <Slider
                  value={[maxTokens]}
                  onValueChange={([v]) => setMaxTokens(v)}
                  min={128} max={4096} step={64}
                />
                <p className="text-xs text-muted-foreground">
                  Maximum tokens per response. Default: 1024
                </p>
              </div>

              <div className="space-y-2">
                <Label>Interrupt Sensitivity: {interruptSensitivity}</Label>
                <Slider
                  value={[interruptSensitivity]}
                  onValueChange={([v]) => setInterruptSensitivity(v)}
                  min={0} max={1} step={0.05}
                />
                <p className="text-xs text-muted-foreground">
                  How easily the user can interrupt the AI. Lower = harder to interrupt.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Silence Timeout: {(silenceTimeout / 1000).toFixed(1)}s</Label>
                <Slider
                  value={[silenceTimeout]}
                  onValueChange={([v]) => setSilenceTimeout(v)}
                  min={3000} max={30000} step={1000}
                />
                <p className="text-xs text-muted-foreground">
                  How long to wait in silence before the AI prompts the user. Default: 10s
                </p>
              </div>
            </div>

            <Card className="border-dashed mt-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Version Management</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-2">
                  Telnyx supports assistant versioning. You can create new versions, switch between them, and A/B test performance.
                </p>
                {telnyxPortalUrl && (
                  <Button variant="outline" size="sm" className="gap-1" onClick={() => window.open(telnyxPortalUrl, '_blank')}>
                    <ExternalLink className="h-3 w-3" />Manage Versions in Portal
                  </Button>
                )}
              </CardContent>
            </Card>

            <Card className="border-dashed">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Flowchart</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-2">
                  View and manage the conversation flow of your assistant. The flowchart shows how agents hand off between each other.
                </p>
                {telnyxPortalUrl && (
                  <Button variant="outline" size="sm" className="gap-1" onClick={() => window.open(telnyxPortalUrl + '/flowchart', '_blank')}>
                    <ExternalLink className="h-3 w-3" />Open Flowchart in Portal
                  </Button>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== SIMULATION TAB ===== */}
          <TabsContent value="simulation" className="space-y-4">
            <h4 className="font-semibold">Simulation</h4>

            <p className="text-sm text-muted-foreground">
              Link this assistant to a Coval agent to enable simulation testing. Simulations let you test your AI against
              predefined personas and scenarios without making real calls.
            </p>

            <Button variant="outline" className="gap-1" onClick={() => window.open('https://www.coval.dev/', '_blank')}>
              <ExternalLink className="h-4 w-4" />Open in Coval
            </Button>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
              <div>
                <h5 className="font-medium text-sm mb-2">Select Simulated User</h5>
                <p className="text-xs text-muted-foreground">Link an agent to view personas.</p>
              </div>
              <div>
                <h5 className="font-medium text-sm mb-2">Simulation Runs</h5>
                <p className="text-xs text-muted-foreground">Link an agent to view simulation runs.</p>
                <Button variant="outline" size="sm" className="mt-2 gap-1" disabled>
                  <RefreshCw className="h-3 w-3" />Refresh
                </Button>
              </div>
            </div>

            <div>
              <h5 className="font-medium text-sm mb-2">Select Test Case</h5>
              <p className="text-xs text-muted-foreground">Link an agent to view test cases.</p>
            </div>

            <div>
              <h5 className="font-medium text-sm mb-2">Select Metrics to Evaluate Performance</h5>
              <p className="text-xs text-muted-foreground">Link an agent to view metrics.</p>
            </div>

            <Button disabled className="w-full md:w-auto opacity-50">
              Run Simulation
            </Button>

            {telnyxPortalUrl && (
              <p className="text-xs text-muted-foreground mt-2">
                Full simulation features available in the{' '}
                <a href={telnyxPortalUrl + '?tab=simulation'} target="_blank" rel="noreferrer" className="text-primary underline">
                  Telnyx Portal
                </a>
              </p>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default TelnyxAssistantEditor;
