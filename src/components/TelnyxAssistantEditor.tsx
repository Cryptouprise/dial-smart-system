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
  PhoneCall, Shield, Volume2, Clock, AlertCircle,
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
  const [maxCallDuration, setMaxCallDuration] = useState(assistant.metadata?.max_call_duration_seconds || 1800);
  const [userIdleTimeout, setUserIdleTimeout] = useState(assistant.metadata?.user_idle_timeout_seconds || 30);
  const [amdAction, setAmdAction] = useState(assistant.metadata?.amd_settings?.action || 'leave_message_stop');
  const [vmMessageType, setVmMessageType] = useState(assistant.metadata?.amd_settings?.voicemail_message_type || 'message');
  const [vmMessage, setVmMessage] = useState(assistant.metadata?.amd_settings?.voicemail_message || '');
  const [recordingChannels, setRecordingChannels] = useState(assistant.metadata?.recording_settings?.channels || 'dual');
  const [recordingFormat, setRecordingFormat] = useState(assistant.metadata?.recording_settings?.format || 'mp3');

  // Analysis tab  
  const [conversations, setConversations] = useState<any[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(false);

  // Load full Telnyx data on mount
  useEffect(() => {
    (async () => {
      try {
        const data = await callEdgeFunction('telnyx-ai-assistant', {
          action: 'get_assistant',
          assistant_id: assistant.id,
        });
        setTelnyxData(data.telnyx);
        
        // Populate from Telnyx live data if available
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
      // Query call_logs for this assistant
      const { data } = await supabase
        .from('call_logs')
        .select('id, phone_number, status, outcome, duration_seconds, created_at, transcript, call_summary, telnyx_conversation_id')
        .or(`telnyx_assistant_id.eq.${assistant.telnyx_assistant_id},agent_id.eq.${assistant.telnyx_assistant_id}`)
        .order('created_at', { ascending: false })
        .limit(20);
      setConversations(data || []);
    } catch { /* ignore */ }
    setLoadingConversations(false);
  }, [assistant.telnyx_assistant_id]);

  useEffect(() => {
    if (activeTab === 'analysis') loadConversations();
  }, [activeTab, loadConversations]);

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
          <TabsList className="grid w-full grid-cols-4 mb-4">
            <TabsTrigger value="agent" className="gap-1"><Bot className="h-3 w-3" />Agent</TabsTrigger>
            <TabsTrigger value="voice" className="gap-1"><Mic className="h-3 w-3" />Voice</TabsTrigger>
            <TabsTrigger value="calling" className="gap-1"><Phone className="h-3 w-3" />Calling</TabsTrigger>
            <TabsTrigger value="analysis" className="gap-1"><BarChart3 className="h-3 w-3" />Analysis</TabsTrigger>
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

            <div className="space-y-2">
              <Label>Instructions * (system prompt)</Label>
              <Textarea
                value={instructions}
                onChange={e => setInstructions(e.target.value)}
                className="min-h-[300px] font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                {instructions.length} chars · Use {"{{variable_name}}"} for personalization
              </p>
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
                  <p className="text-sm text-muted-foreground">Calendar booking tool is auto-added on creation.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== VOICE TAB ===== */}
          <TabsContent value="voice" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Voice</Label>
                <Select value={voice} onValueChange={setVoice}>
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
              <div className="space-y-2">
                <Label>Voice Speed</Label>
                <Input type="number" value={voiceSpeed} onChange={e => setVoiceSpeed(parseFloat(e.target.value) || 1)} min={0.5} max={2} step={0.1} />
              </div>
            </div>

            {/* Transcription */}
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

            {/* Noise Suppression */}
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

            {/* Background Audio */}
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

          {/* ===== CALLING TAB ===== */}
          <TabsContent value="calling" className="space-y-4">
            <h4 className="font-semibold text-sm">Settings</h4>
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

            {/* Voicemail Detection */}
            <h4 className="font-semibold text-sm pt-4 flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Voicemail Detection (AMD)
            </h4>
            <Card className="border-blue-500/20 bg-blue-500/5">
              <CardContent className="py-3 text-xs text-muted-foreground">
                <AlertCircle className="h-3 w-3 inline mr-1" />
                Answering Machine Detection (AMD) must be enabled on the call for voicemail detection to work. 
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
                <Textarea
                  value={vmMessage}
                  onChange={e => setVmMessage(e.target.value)}
                  placeholder="Hey, sorry we were trying to get a hold of you..."
                  className="min-h-[80px]"
                />
                <p className="text-xs text-muted-foreground">Supports {"{{variables}}"} like {"{{first_name}}"}</p>
              </div>
            )}

            {/* Recording Settings */}
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
                    <SelectItem value="dual">Dual (stereo - separate channels)</SelectItem>
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

          {/* ===== ANALYSIS TAB ===== */}
          <TabsContent value="analysis" className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-sm">Conversation History</h4>
              <Button variant="outline" size="sm" onClick={loadConversations} disabled={loadingConversations}>
                {loadingConversations ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
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
              <div className="space-y-2">
                {conversations.map(c => (
                  <Card key={c.id}>
                    <CardContent className="py-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <PhoneCall className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium">{c.phone_number}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(c.created_at).toLocaleString()} · {c.duration_seconds ? `${Math.round(c.duration_seconds / 60)}min` : '—'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={c.status === 'completed' ? 'default' : 'secondary'}>{c.outcome || c.status}</Badge>
                          {c.telnyx_conversation_id && (
                            <code className="text-[10px] text-muted-foreground">{c.telnyx_conversation_id.slice(0, 12)}...</code>
                          )}
                        </div>
                      </div>
                      {c.call_summary && (
                        <p className="text-xs text-muted-foreground mt-2 border-t pt-2">{c.call_summary}</p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default TelnyxAssistantEditor;
