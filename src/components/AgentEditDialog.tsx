import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Plus, Trash2, DollarSign, Mic, MessageSquare, Play, Volume2, Phone, PhoneOff, Upload, FileText, Book, Square, Copy, Wand2, CheckCircle2, Calendar, ExternalLink, AlertCircle, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface AgentEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent: any;
  onSave: (agentConfig: any) => Promise<void>;
  isLoading: boolean;
}

// Voice samples for preview
const VOICE_SAMPLES: Record<string, string> = {
  '11labs-Adrian': 'https://retell-utils-public.s3.us-west-2.amazonaws.com/adrian.wav',
  '11labs-Rachel': 'https://retell-utils-public.s3.us-west-2.amazonaws.com/rachel.wav',
  'openai-Alloy': 'https://cdn.openai.com/API/docs/audio/alloy.wav',
  'openai-Echo': 'https://cdn.openai.com/API/docs/audio/echo.wav',
  'openai-Fable': 'https://cdn.openai.com/API/docs/audio/fable.wav',
  'openai-Onyx': 'https://cdn.openai.com/API/docs/audio/onyx.wav',
  'openai-Nova': 'https://cdn.openai.com/API/docs/audio/nova.wav',
  'openai-Shimmer': 'https://cdn.openai.com/API/docs/audio/shimmer.wav',
};

// Pricing data based on Retell AI's pricing page
const PRICING = {
  voice: {
    'elevenlabs': 0.07,
    'cartesia': 0.07,
    'openai': 0.08,
  },
  llm: {
    'gpt-5': 0.04,
    'gpt-5-mini': 0.012,
    'gpt-5-nano': 0.003,
    'gpt-4.1': 0.045,
    'gpt-4.1-mini': 0.016,
    'gpt-4.1-nano': 0.004,
    'gpt-4o': 0.05,
    'gpt-4o-mini': 0.006,
    'claude-4.5-sonnet': 0.08,
    'claude-4.5-haiku': 0.025,
    'claude-3.7-sonnet': 0.06,
    'claude-3.5-haiku': 0.02,
    'gemini-2.0-flash': 0.006,
    'gemini-2.0-flash-lite': 0.003,
  },
  telephony: {
    'retell': 0.015,
    'custom': 0,
  },
  addons: {
    'knowledge_base': 0.005,
    'advanced_denoising': 0.005,
    'pii_removal': 0.01,
  }
};

export const AgentEditDialog: React.FC<AgentEditDialogProps> = ({
  open,
  onOpenChange,
  agent,
  onSave,
  isLoading
}) => {
  const { toast } = useToast();
  const [config, setConfig] = useState<any>({});
  const [testMessage, setTestMessage] = useState('');
  const [testResponse, setTestResponse] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  
  // Voice preview state
  const [isPlayingVoice, setIsPlayingVoice] = useState(false);
  const [voicePreviewText, setVoicePreviewText] = useState('Hello! I am your AI assistant. How can I help you today?');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  // Call simulator state
  const [isCallActive, setIsCallActive] = useState(false);
  const [callPhoneNumber, setCallPhoneNumber] = useState('');
  const [callStatus, setCallStatus] = useState<string>('');
  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  
  // Knowledge base state
  const [knowledgeBase, setKnowledgeBase] = useState<any[]>([]);
  const [newKbName, setNewKbName] = useState('');
  const [newKbContent, setNewKbContent] = useState('');
  const [isUploadingKb, setIsUploadingKb] = useState(false);

  // Calendar test state
  const [calendarTestStatus, setCalendarTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [calendarTestMessage, setCalendarTestMessage] = useState('');

  useEffect(() => {
    if (agent) {
      setConfig({
        agent_name: agent.agent_name || '',
        response_engine: agent.response_engine || {},
        voice_id: agent.voice_id || '11labs-Adrian',
        voice_model: agent.voice_model || 'eleven_turbo_v2',
        fallback_voice_ids: agent.fallback_voice_ids || [],
        voice_temperature: agent.voice_temperature || 1,
        voice_speed: agent.voice_speed || 1,
        volume: agent.volume || 1,
        responsiveness: agent.responsiveness || 1,
        interruption_sensitivity: agent.interruption_sensitivity || 1,
        enable_backchannel: agent.enable_backchannel ?? true,
        backchannel_frequency: agent.backchannel_frequency || 0.9,
        backchannel_words: agent.backchannel_words || ['yeah', 'uh-huh'],
        language: agent.language || 'en-US',
        ambient_sound: agent.ambient_sound || 'off',
        ambient_sound_volume: agent.ambient_sound_volume || 1,
        webhook_url: agent.webhook_url || '',
        webhook_timeout_ms: agent.webhook_timeout_ms || 10000,
        boosted_keywords: agent.boosted_keywords || [],
        pronunciation_dictionary: agent.pronunciation_dictionary || [],
        voicemail_detection: agent.voicemail_detection ?? true,
        voicemail_option: agent.voicemail_option || { action: { type: 'hangup' } },
        post_call_analysis_data: agent.post_call_analysis_data || [],
        post_call_analysis_model: agent.post_call_analysis_model || 'gpt-4o-mini',
        end_call_after_silence_ms: agent.end_call_after_silence_ms || 600000,
        max_call_duration_ms: agent.max_call_duration_ms || 3600000,
        normalize_for_speech: agent.normalize_for_speech ?? true,
        reminder_trigger_ms: agent.reminder_trigger_ms || 10000,
        reminder_max_count: agent.reminder_max_count || 2,
        begin_message_delay_ms: agent.begin_message_delay_ms || 1000,
        ring_duration_ms: agent.ring_duration_ms || 30000,
        stt_mode: agent.stt_mode || 'fast',
        vocab_specialization: agent.vocab_specialization || 'general',
        allow_user_dtmf: agent.allow_user_dtmf ?? true,
        user_dtmf_options: agent.user_dtmf_options || {
          digit_limit: 25,
          termination_key: '#',
          timeout_ms: 8000
        },
        denoising_mode: agent.denoising_mode || 'noise-cancellation',
        enable_realtime_transcription: agent.enable_realtime_transcription ?? true,
        data_storage_setting: agent.data_storage_setting || 'everything',
        opt_in_signed_url: agent.opt_in_signed_url ?? true,
        mcp_servers: agent.mcp_servers || [],
        pii_config: agent.pii_config || { mode: 'off', categories: [] },
      });
    }
  }, [agent]);

  const handleSave = async () => {
    await onSave(config);
  };

  const updateConfig = (field: string, value: any) => {
    setConfig((prev: any) => ({ ...prev, [field]: value }));
  };

  // Calculate estimated cost per minute
  const calculateCostPerMinute = () => {
    let voiceCost = 0.07; // default elevenlabs
    if (config.voice_id?.includes('openai')) {
      voiceCost = PRICING.voice.openai;
    }

    let llmCost = PRICING.llm['gpt-4o-mini']; // default
    const llmId = config.response_engine?.llm_id || '';
    // Try to match LLM from response engine
    if (llmId.includes('gpt-4o-mini')) llmCost = PRICING.llm['gpt-4o-mini'];
    else if (llmId.includes('gpt-4o')) llmCost = PRICING.llm['gpt-4o'];
    else if (llmId.includes('gpt-4.1-mini')) llmCost = PRICING.llm['gpt-4.1-mini'];
    else if (llmId.includes('claude')) llmCost = PRICING.llm['claude-3.7-sonnet'];
    else if (llmId.includes('gemini')) llmCost = PRICING.llm['gemini-2.0-flash'];

    const telephonyCost = PRICING.telephony.retell;
    
    let addonsCost = 0;
    if (config.denoising_mode === 'krisp') addonsCost += PRICING.addons.advanced_denoising;
    if (config.pii_config?.mode !== 'off') addonsCost += PRICING.addons.pii_removal;

    return {
      voice: voiceCost,
      llm: llmCost,
      telephony: telephonyCost,
      addons: addonsCost,
      total: voiceCost + llmCost + telephonyCost + addonsCost
    };
  };

  const handleTestChat = async () => {
    if (!testMessage.trim()) return;
    setIsTesting(true);
    try {
      // Call Retell's test chat API through our edge function
      const { data, error } = await supabase.functions.invoke('retell-agent-management', {
        body: {
          action: 'test_chat',
          agentId: agent?.agent_id,
          message: testMessage
        }
      });
      
      if (error) throw error;
      setTestResponse(data?.response || 'No response received');
    } catch (error: any) {
      console.error('Test chat error:', error);
      // Fallback to simulated response
      setTestResponse(`[Simulated Response] Agent "${config.agent_name}" would respond to: "${testMessage}"\n\nNote: Live testing requires the agent to be deployed. Use the Retell dashboard for full testing.`);
    } finally {
      setIsTesting(false);
    }
  };

  // Voice preview functions
  const playVoicePreview = async () => {
    const voiceId = config.voice_id || '';
    const sampleUrl = VOICE_SAMPLES[voiceId];
    
    if (sampleUrl) {
      // Play pre-recorded sample
      if (audioRef.current) {
        audioRef.current.pause();
      }
      audioRef.current = new Audio(sampleUrl);
      audioRef.current.onended = () => setIsPlayingVoice(false);
      audioRef.current.onerror = () => {
        setIsPlayingVoice(false);
        toast({ title: 'Error', description: 'Could not load voice sample', variant: 'destructive' });
      };
      setIsPlayingVoice(true);
      await audioRef.current.play();
    } else {
      // Generate preview via Retell API
      setIsPlayingVoice(true);
      try {
        const { data, error } = await supabase.functions.invoke('retell-agent-management', {
          body: {
            action: 'preview_voice',
            voiceId: voiceId,
            text: voicePreviewText,
            voiceModel: config.voice_model
          }
        });
        
        if (error) throw error;
        
        if (data?.audio_url) {
          audioRef.current = new Audio(data.audio_url);
          audioRef.current.onended = () => setIsPlayingVoice(false);
          await audioRef.current.play();
        } else {
          toast({ title: 'Voice Preview', description: 'Voice preview generated. Check Retell dashboard for audio.', variant: 'default' });
          setIsPlayingVoice(false);
        }
      } catch (error: any) {
        console.error('Voice preview error:', error);
        toast({ title: 'Error', description: 'Could not generate voice preview', variant: 'destructive' });
        setIsPlayingVoice(false);
      }
    }
  };
  
  const stopVoicePreview = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsPlayingVoice(false);
  };

  // Call simulator functions
  const startTestCall = async () => {
    if (!callPhoneNumber.trim()) {
      toast({ title: 'Error', description: 'Please enter a phone number', variant: 'destructive' });
      return;
    }
    
    setIsCallActive(true);
    setCallStatus('Initiating call...');
    
    try {
      const { data, error } = await supabase.functions.invoke('outbound-calling', {
        body: {
          action: 'create_call',
          agentId: agent?.agent_id,
          phoneNumber: callPhoneNumber,
          callerId: agent?.inbound_phone_number || '+15551234567' // Use agent's phone or placeholder
        }
      });
      
      if (error) throw error;
      
      setActiveCallId(data?.call_id || null);
      setCallStatus(`Call active: ${data?.call_id || 'Connected'}`);
      toast({ title: 'Call Started', description: 'Test call initiated successfully' });
    } catch (error: any) {
      console.error('Call error:', error);
      setCallStatus('Call failed');
      toast({ title: 'Call Failed', description: error.message || 'Could not initiate call', variant: 'destructive' });
      setIsCallActive(false);
      setActiveCallId(null);
    }
  };
  
  const endTestCall = async () => {
    if (!activeCallId) {
      setIsCallActive(false);
      setCallStatus('');
      return;
    }
    
    setCallStatus('Ending call...');
    try {
      await supabase.functions.invoke('outbound-calling', {
        body: {
          action: 'end_call',
          retellCallId: activeCallId
        }
      });
      toast({ title: 'Call Ended', description: 'Test call ended' });
    } catch (error: any) {
      console.error('End call error:', error);
    }
    setIsCallActive(false);
    setCallStatus('');
    setActiveCallId(null);
  };

  // Knowledge base functions
  const addKnowledgeBase = () => {
    if (!newKbName.trim()) {
      toast({ title: 'Error', description: 'Please enter a knowledge base name', variant: 'destructive' });
      return;
    }
    
    const newKb = {
      id: `kb_${Date.now()}`,
      name: newKbName,
      content: newKbContent,
      type: 'text',
      created_at: new Date().toISOString()
    };
    
    setKnowledgeBase([...knowledgeBase, newKb]);
    updateConfig('knowledge_base_ids', [...(config.knowledge_base_ids || []), newKb.id]);
    setNewKbName('');
    setNewKbContent('');
    toast({ title: 'Knowledge Base Added', description: `"${newKbName}" has been added` });
  };
  
  const removeKnowledgeBase = (id: string) => {
    setKnowledgeBase(knowledgeBase.filter(kb => kb.id !== id));
    updateConfig('knowledge_base_ids', (config.knowledge_base_ids || []).filter((kbId: string) => kbId !== id));
  };
  
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setIsUploadingKb(true);
    try {
      const text = await file.text();
      const newKb = {
        id: `kb_${Date.now()}`,
        name: file.name,
        content: text.substring(0, 10000), // Limit content
        type: file.type.includes('pdf') ? 'pdf' : 'text',
        created_at: new Date().toISOString()
      };
      
      setKnowledgeBase([...knowledgeBase, newKb]);
      updateConfig('knowledge_base_ids', [...(config.knowledge_base_ids || []), newKb.id]);
      toast({ title: 'File Uploaded', description: `"${file.name}" has been added to knowledge base` });
    } catch (error: any) {
      toast({ title: 'Upload Failed', description: error.message, variant: 'destructive' });
    } finally {
      setIsUploadingKb(false);
    }
  };

  const addMcpServer = () => {
    updateConfig('mcp_servers', [
      ...config.mcp_servers,
      { url: '', name: '', description: '' }
    ]);
  };

  const removeMcpServer = (index: number) => {
    const newServers = [...config.mcp_servers];
    newServers.splice(index, 1);
    updateConfig('mcp_servers', newServers);
  };

  const updateMcpServer = (index: number, field: string, value: string) => {
    const newServers = [...config.mcp_servers];
    newServers[index] = { ...newServers[index], [field]: value };
    updateConfig('mcp_servers', newServers);
  };

  // Calendar connection test
  const testCalendarConnection = async () => {
    setCalendarTestStatus('testing');
    setCalendarTestMessage('Testing calendar connection...');
    
    try {
      const { data, error } = await supabase.functions.invoke('calendar-integration', {
        body: { action: 'test_google_calendar' }
      });
      
      if (error) throw error;
      
      if (data?.success) {
        setCalendarTestStatus('success');
        setCalendarTestMessage(data.message || 'Calendar connected successfully!');
        toast({ title: 'Calendar Connected', description: data.message || 'Your Google Calendar is working correctly' });
      } else {
        setCalendarTestStatus('error');
        setCalendarTestMessage(data?.message || 'Calendar connection failed');
        toast({ title: 'Connection Failed', description: data?.message || 'Please check your calendar setup', variant: 'destructive' });
      }
    } catch (error: any) {
      console.error('Calendar test error:', error);
      setCalendarTestStatus('error');
      setCalendarTestMessage(error.message || 'Failed to test calendar connection');
      toast({ title: 'Test Failed', description: error.message || 'Could not test calendar connection', variant: 'destructive' });
    }
  };

  const costs = calculateCostPerMinute();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0 pb-2">
          <DialogTitle className="flex items-center gap-2">
            Edit Agent: {agent?.agent_name}
            <Badge variant="outline" className="ml-2">
              <DollarSign className="h-3 w-3 mr-1" />
              ${costs.total.toFixed(3)}/min
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Configure all aspects of your Retell AI agent
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto pr-2">
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-10 mb-4">
              <TabsTrigger value="basic">Basic</TabsTrigger>
              <TabsTrigger value="llm">LLM</TabsTrigger>
              <TabsTrigger value="voice">Voice</TabsTrigger>
              <TabsTrigger value="speech">Speech</TabsTrigger>
              <TabsTrigger value="transcription">STT</TabsTrigger>
              <TabsTrigger value="call">Call</TabsTrigger>
              <TabsTrigger value="calendar">Calendar</TabsTrigger>
              <TabsTrigger value="knowledge">Knowledge</TabsTrigger>
              <TabsTrigger value="mcp">MCP</TabsTrigger>
              <TabsTrigger value="test">Test</TabsTrigger>
            </TabsList>

            {/* Basic Tab */}
            <TabsContent value="basic" className="space-y-4">
              {/* Pricing Card */}
              <Card className="border-primary/20 bg-primary/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Estimated Cost Per Minute
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-5 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Voice</p>
                      <p className="font-semibold">${costs.voice.toFixed(3)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">LLM</p>
                      <p className="font-semibold">${costs.llm.toFixed(3)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Telephony</p>
                      <p className="font-semibold">${costs.telephony.toFixed(3)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Add-ons</p>
                      <p className="font-semibold">${costs.addons.toFixed(3)}</p>
                    </div>
                    <div className="bg-primary/10 rounded p-2 -m-2">
                      <p className="text-muted-foreground">Total</p>
                      <p className="font-bold text-primary">${costs.total.toFixed(3)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-2">
                <Label htmlFor="agent_name">Agent Name</Label>
                <Input
                  id="agent_name"
                  value={config.agent_name || ''}
                  onChange={(e) => updateConfig('agent_name', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="language">Language</Label>
                <Select value={config.language} onValueChange={(v) => updateConfig('language', v)}>
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
                    <SelectItem value="zh-CN">Chinese</SelectItem>
                    <SelectItem value="ja-JP">Japanese</SelectItem>
                    <SelectItem value="ko-KR">Korean</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="webhook_url">Webhook URL</Label>
                <div className="flex gap-2">
                  <Input
                    id="webhook_url"
                    value={config.webhook_url || ''}
                    onChange={(e) => updateConfig('webhook_url', e.target.value)}
                    placeholder="https://your-webhook-url.com"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const defaultUrl = 'https://emonjusymdripmkvtttc.supabase.co/functions/v1/call-tracking-webhook';
                      updateConfig('webhook_url', defaultUrl);
                      toast({
                        title: 'Webhook Auto-filled',
                        description: 'Call tracking webhook URL has been set',
                      });
                    }}
                    className="shrink-0"
                  >
                    <Wand2 className="h-4 w-4 mr-1" />
                    Auto-fill
                  </Button>
                  {config.webhook_url && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(config.webhook_url);
                        toast({
                          title: 'Copied!',
                          description: 'Webhook URL copied to clipboard',
                        });
                      }}
                      className="shrink-0"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                {config.webhook_url === 'https://emonjusymdripmkvtttc.supabase.co/functions/v1/call-tracking-webhook' && (
                  <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1 mt-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Using auto-configured call tracking webhook
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="webhook_timeout_ms">Webhook Timeout (ms)</Label>
                <Input
                  id="webhook_timeout_ms"
                  type="number"
                  value={config.webhook_timeout_ms || 10000}
                  onChange={(e) => updateConfig('webhook_timeout_ms', parseInt(e.target.value))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="data_storage">Data Storage Setting</Label>
                <Select value={config.data_storage_setting} onValueChange={(v) => updateConfig('data_storage_setting', v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="everything">Everything</SelectItem>
                    <SelectItem value="call_only">Call Data Only</SelectItem>
                    <SelectItem value="none">None</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>

            {/* LLM/Script Tab */}
            <TabsContent value="llm" className="space-y-4">
              <div className="space-y-2">
                <Label>Response Engine Type</Label>
                <Badge variant="outline">{config.response_engine?.type || 'Not configured'}</Badge>
              </div>

              {config.response_engine?.type === 'retell-llm' && (
                <div className="space-y-2">
                  <Label>LLM ID</Label>
                  <Input
                    value={config.response_engine?.llm_id || ''}
                    onChange={(e) => updateConfig('response_engine', { 
                      ...config.response_engine, 
                      llm_id: e.target.value 
                    })}
                    placeholder="llm_xxxxxxxxxxxxx"
                  />
                  <p className="text-xs text-muted-foreground">
                    The LLM configuration contains your agent's script and prompts.
                  </p>
                </div>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Post-Call Analysis</CardTitle>
                  <CardDescription>Configure what data to extract after calls</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Analysis Model</Label>
                    <Select 
                      value={config.post_call_analysis_model} 
                      onValueChange={(v) => updateConfig('post_call_analysis_model', v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gpt-4o-mini">GPT-4o Mini ($0.006/min)</SelectItem>
                        <SelectItem value="gpt-4o">GPT-4o ($0.05/min)</SelectItem>
                        <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Data to Extract (JSON)</Label>
                    <Textarea
                      value={JSON.stringify(config.post_call_analysis_data || [], null, 2)}
                      onChange={(e) => {
                        try {
                          const parsed = JSON.parse(e.target.value);
                          updateConfig('post_call_analysis_data', parsed);
                        } catch {}
                      }}
                      placeholder='[{"type":"string","name":"customer_name","description":"Customer name"}]'
                      rows={5}
                      className="font-mono text-xs"
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Voice Tab */}
            <TabsContent value="voice" className="space-y-4">
              {/* Voice Preview Card */}
              <Card className="border-primary/20 bg-primary/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Volume2 className="h-4 w-4" />
                    Voice Preview
                  </CardTitle>
                  <CardDescription>Listen to how your agent's voice sounds</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Preview Text</Label>
                    <Textarea
                      value={voicePreviewText}
                      onChange={(e) => setVoicePreviewText(e.target.value)}
                      placeholder="Enter text to preview..."
                      rows={2}
                    />
                  </div>
                  <div className="flex gap-2">
                    {!isPlayingVoice ? (
                      <Button onClick={playVoicePreview} variant="default">
                        <Play className="h-4 w-4 mr-2" />
                        Play Voice Sample
                      </Button>
                    ) : (
                      <Button onClick={stopVoicePreview} variant="destructive">
                        <Square className="h-4 w-4 mr-2" />
                        Stop
                      </Button>
                    )}
                  </div>
                  {VOICE_SAMPLES[config.voice_id] && (
                    <p className="text-xs text-muted-foreground">
                      ✓ Pre-recorded sample available for {config.voice_id}
                    </p>
                  )}
                </CardContent>
              </Card>

              <div className="space-y-2">
                <Label htmlFor="voice_id">Voice ID</Label>
                <Select value={config.voice_id} onValueChange={(v) => updateConfig('voice_id', v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a voice" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="11labs-Adrian">11Labs - Adrian</SelectItem>
                    <SelectItem value="11labs-Rachel">11Labs - Rachel</SelectItem>
                    <SelectItem value="openai-Alloy">OpenAI - Alloy</SelectItem>
                    <SelectItem value="openai-Echo">OpenAI - Echo</SelectItem>
                    <SelectItem value="openai-Fable">OpenAI - Fable</SelectItem>
                    <SelectItem value="openai-Onyx">OpenAI - Onyx</SelectItem>
                    <SelectItem value="openai-Nova">OpenAI - Nova</SelectItem>
                    <SelectItem value="openai-Shimmer">OpenAI - Shimmer</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  ElevenLabs/Cartesia: $0.07/min | OpenAI: $0.08/min
                </p>
              </div>

              <div className="space-y-2">
                <Label>Fallback Voice IDs (comma separated)</Label>
                <Input
                  value={config.fallback_voice_ids?.join(', ') || ''}
                  onChange={(e) => updateConfig('fallback_voice_ids', e.target.value.split(',').map((v: string) => v.trim()).filter(Boolean))}
                  placeholder="openai-Alloy, deepgram-Angus"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="voice_model">Voice Model</Label>
                <Select value={config.voice_model} onValueChange={(v) => updateConfig('voice_model', v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="eleven_turbo_v2">Eleven Turbo V2</SelectItem>
                    <SelectItem value="eleven_flash_v2">Eleven Flash V2</SelectItem>
                    <SelectItem value="eleven_turbo_v2_5">Eleven Turbo V2.5</SelectItem>
                    <SelectItem value="eleven_flash_v2_5">Eleven Flash V2.5</SelectItem>
                    <SelectItem value="eleven_multilingual_v2">Eleven Multilingual V2</SelectItem>
                    <SelectItem value="tts-1">OpenAI TTS-1</SelectItem>
                    <SelectItem value="gpt-4o-mini-tts">GPT-4o Mini TTS</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Voice Temperature: {config.voice_temperature}</Label>
                <Slider
                  value={[config.voice_temperature || 1]}
                  onValueChange={([v]) => updateConfig('voice_temperature', v)}
                  min={0}
                  max={2}
                  step={0.1}
                />
                <p className="text-xs text-muted-foreground">Controls voice expressiveness</p>
              </div>

              <div className="space-y-2">
                <Label>Voice Speed: {config.voice_speed}</Label>
                <Slider
                  value={[config.voice_speed || 1]}
                  onValueChange={([v]) => updateConfig('voice_speed', v)}
                  min={0.5}
                  max={2}
                  step={0.1}
                />
              </div>

              <div className="space-y-2">
                <Label>Volume: {config.volume}</Label>
                <Slider
                  value={[config.volume || 1]}
                  onValueChange={([v]) => updateConfig('volume', v)}
                  min={0}
                  max={2}
                  step={0.1}
                />
              </div>
            </TabsContent>

            {/* Speech Settings Tab */}
            <TabsContent value="speech" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Background Sound</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Ambient Sound</Label>
                    <Select value={config.ambient_sound} onValueChange={(v) => updateConfig('ambient_sound', v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="off">Off</SelectItem>
                        <SelectItem value="coffee-shop">Coffee Shop</SelectItem>
                        <SelectItem value="convention-hall">Convention Hall</SelectItem>
                        <SelectItem value="summer-outdoor">Summer Outdoor</SelectItem>
                        <SelectItem value="mountain-outdoor">Mountain Outdoor</SelectItem>
                        <SelectItem value="static-noise">Static Noise</SelectItem>
                        <SelectItem value="call-center">Call Center</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {config.ambient_sound !== 'off' && (
                    <div className="space-y-2">
                      <Label>Ambient Sound Volume: {config.ambient_sound_volume}</Label>
                      <Slider
                        value={[config.ambient_sound_volume || 1]}
                        onValueChange={([v]) => updateConfig('ambient_sound_volume', v)}
                        min={0}
                        max={2}
                        step={0.1}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Responsiveness & Interruption</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Responsiveness: {config.responsiveness}</Label>
                    <Slider
                      value={[config.responsiveness || 1]}
                      onValueChange={([v]) => updateConfig('responsiveness', v)}
                      min={0}
                      max={1}
                      step={0.1}
                    />
                    <p className="text-xs text-muted-foreground">How quickly agent responds (0 = slow, 1 = fast)</p>
                  </div>

                  <div className="space-y-2">
                    <Label>Interruption Sensitivity: {config.interruption_sensitivity}</Label>
                    <Slider
                      value={[config.interruption_sensitivity || 1]}
                      onValueChange={([v]) => updateConfig('interruption_sensitivity', v)}
                      min={0}
                      max={1}
                      step={0.1}
                    />
                    <p className="text-xs text-muted-foreground">How easily user can interrupt (0 = hard, 1 = easy)</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Backchannel</CardTitle>
                  <CardDescription>Agent acknowledgments while listening</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>Enable Backchannel</Label>
                    <Switch
                      checked={config.enable_backchannel}
                      onCheckedChange={(v) => updateConfig('enable_backchannel', v)}
                    />
                  </div>

                  {config.enable_backchannel && (
                    <>
                      <div className="space-y-2">
                        <Label>Backchannel Frequency: {config.backchannel_frequency}</Label>
                        <Slider
                          value={[config.backchannel_frequency || 0.9]}
                          onValueChange={([v]) => updateConfig('backchannel_frequency', v)}
                          min={0}
                          max={1}
                          step={0.1}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Backchannel Words (comma separated)</Label>
                        <Input
                          value={config.backchannel_words?.join(', ') || ''}
                          onChange={(e) => updateConfig('backchannel_words', e.target.value.split(',').map((w: string) => w.trim()))}
                          placeholder="yeah, uh-huh, I see, right"
                        />
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Speech Normalization & Reminders</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Enable Speech Normalization</Label>
                      <p className="text-xs text-muted-foreground">Convert numbers, dates to spoken form</p>
                    </div>
                    <Switch
                      checked={config.normalize_for_speech}
                      onCheckedChange={(v) => updateConfig('normalize_for_speech', v)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Reminder Trigger (ms)</Label>
                    <Input
                      type="number"
                      value={config.reminder_trigger_ms || 10000}
                      onChange={(e) => updateConfig('reminder_trigger_ms', parseInt(e.target.value))}
                    />
                    <p className="text-xs text-muted-foreground">Silence duration before agent prompts user</p>
                  </div>

                  <div className="space-y-2">
                    <Label>Max Reminder Count</Label>
                    <Input
                      type="number"
                      value={config.reminder_max_count || 2}
                      onChange={(e) => updateConfig('reminder_max_count', parseInt(e.target.value))}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Pronunciation Dictionary</CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={JSON.stringify(config.pronunciation_dictionary || [], null, 2)}
                    onChange={(e) => {
                      try {
                        const parsed = JSON.parse(e.target.value);
                        updateConfig('pronunciation_dictionary', parsed);
                      } catch {}
                    }}
                    placeholder='[{"word":"actually","alphabet":"ipa","phoneme":"ˈæktʃuəli"}]'
                    rows={4}
                    className="font-mono text-xs"
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* Transcription Tab */}
            <TabsContent value="transcription" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Real-time Transcription</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Enable Real-time Transcription</Label>
                      <p className="text-xs text-muted-foreground">Stream transcription during calls</p>
                    </div>
                    <Switch
                      checked={config.enable_realtime_transcription}
                      onCheckedChange={(v) => updateConfig('enable_realtime_transcription', v)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Denoising Mode</Label>
                    <Select value={config.denoising_mode} onValueChange={(v) => updateConfig('denoising_mode', v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="off">Off</SelectItem>
                        <SelectItem value="noise-cancellation">Noise Cancellation (Free)</SelectItem>
                        <SelectItem value="krisp">Krisp Advanced (+$0.005/min)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Transcript Mode (STT)</Label>
                    <Select value={config.stt_mode} onValueChange={(v) => updateConfig('stt_mode', v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fast">Fast (Lower latency)</SelectItem>
                        <SelectItem value="accurate">Accurate (Higher quality)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Vocabulary Specialization</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Domain Specialization</Label>
                    <Select value={config.vocab_specialization} onValueChange={(v) => updateConfig('vocab_specialization', v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="general">General</SelectItem>
                        <SelectItem value="medical">Medical</SelectItem>
                        <SelectItem value="legal">Legal</SelectItem>
                        <SelectItem value="finance">Finance</SelectItem>
                        <SelectItem value="technology">Technology</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Boosted Keywords (comma separated)</Label>
                    <Textarea
                      value={config.boosted_keywords?.join(', ') || ''}
                      onChange={(e) => updateConfig('boosted_keywords', e.target.value.split(',').map((k: string) => k.trim()).filter(Boolean))}
                      placeholder="company name, product names, industry terms"
                      rows={3}
                    />
                    <p className="text-xs text-muted-foreground">Words the transcription should recognize more accurately</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">PII Configuration</CardTitle>
                  <CardDescription>Personal Identifiable Information handling (+$0.01/min if enabled)</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>PII Mode</Label>
                    <Select 
                      value={config.pii_config?.mode || 'off'} 
                      onValueChange={(v) => updateConfig('pii_config', { ...config.pii_config, mode: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="off">Off</SelectItem>
                        <SelectItem value="post_call">Post-Call Removal</SelectItem>
                        <SelectItem value="realtime">Real-time Removal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Call Settings Tab */}
            <TabsContent value="call" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Voicemail Detection</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Enable Voicemail Detection</Label>
                      <p className="text-xs text-muted-foreground">Detect when call goes to voicemail</p>
                    </div>
                    <Switch
                      checked={config.voicemail_detection}
                      onCheckedChange={(v) => updateConfig('voicemail_detection', v)}
                    />
                  </div>

                  {config.voicemail_detection && (
                    <>
                      <div className="space-y-2">
                        <Label>Voicemail Action</Label>
                        <Select 
                          value={config.voicemail_option?.action?.type || 'hangup'} 
                          onValueChange={(v) => updateConfig('voicemail_option', {
                            action: { type: v, text: config.voicemail_option?.action?.text || '' }
                          })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="hangup">Hang Up</SelectItem>
                            <SelectItem value="static_text">Leave a Message</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {config.voicemail_option?.action?.type === 'static_text' && (
                        <div className="space-y-2">
                          <Label>Voicemail Message</Label>
                          <Textarea
                            value={config.voicemail_option?.action?.text || ''}
                            onChange={(e) => updateConfig('voicemail_option', {
                              action: { type: 'static_text', text: e.target.value }
                            })}
                            placeholder="Hi, this is [Agent Name]. Please call us back at your earliest convenience."
                            rows={3}
                          />
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">User Keypad Input (DTMF)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Allow User DTMF</Label>
                      <p className="text-xs text-muted-foreground">Enable keypad input during calls</p>
                    </div>
                    <Switch
                      checked={config.allow_user_dtmf}
                      onCheckedChange={(v) => updateConfig('allow_user_dtmf', v)}
                    />
                  </div>

                  {config.allow_user_dtmf && (
                    <>
                      <div className="space-y-2">
                        <Label>Digit Limit</Label>
                        <Input
                          type="number"
                          value={config.user_dtmf_options?.digit_limit || 25}
                          onChange={(e) => updateConfig('user_dtmf_options', {
                            ...config.user_dtmf_options,
                            digit_limit: parseInt(e.target.value)
                          })}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Termination Key</Label>
                        <Input
                          value={config.user_dtmf_options?.termination_key || '#'}
                          onChange={(e) => updateConfig('user_dtmf_options', {
                            ...config.user_dtmf_options,
                            termination_key: e.target.value
                          })}
                          maxLength={1}
                          placeholder="#"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Timeout (ms)</Label>
                        <Input
                          type="number"
                          value={config.user_dtmf_options?.timeout_ms || 8000}
                          onChange={(e) => updateConfig('user_dtmf_options', {
                            ...config.user_dtmf_options,
                            timeout_ms: parseInt(e.target.value)
                          })}
                        />
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Call Timing</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Begin Message Delay (ms)</Label>
                    <Input
                      type="number"
                      value={config.begin_message_delay_ms || 1000}
                      onChange={(e) => updateConfig('begin_message_delay_ms', parseInt(e.target.value))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Ring Duration (ms)</Label>
                    <Input
                      type="number"
                      value={config.ring_duration_ms || 30000}
                      onChange={(e) => updateConfig('ring_duration_ms', parseInt(e.target.value))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>End Call After Silence (ms)</Label>
                    <Input
                      type="number"
                      value={config.end_call_after_silence_ms || 600000}
                      onChange={(e) => updateConfig('end_call_after_silence_ms', parseInt(e.target.value))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Max Call Duration (ms)</Label>
                    <Input
                      type="number"
                      value={config.max_call_duration_ms || 3600000}
                      onChange={(e) => updateConfig('max_call_duration_ms', parseInt(e.target.value))}
                    />
                    <p className="text-xs text-muted-foreground">Default: 1 hour (3600000ms)</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Calendar Tab */}
            <TabsContent value="calendar" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Google Calendar Integration
                  </CardTitle>
                  <CardDescription>
                    Enable your AI agent to check availability and book appointments
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                    <h4 className="font-semibold text-green-800 dark:text-green-200 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4" />
                      Setup Instructions
                    </h4>
                    <ol className="mt-2 text-sm text-green-700 dark:text-green-300 space-y-2 list-decimal list-inside">
                      <li>Go to <strong>Settings → Calendar</strong> and connect your Google Calendar</li>
                      <li>Click <strong>Test Calendar Connection</strong> below</li>
                      <li>If the test fails, click <strong>Fix in Settings</strong> and then re-test</li>
                      <li>Once it passes, you&apos;re ready to let the agent book appointments</li>
                    </ol>
                  </div>

                  {/* Calendar Test Button (moved up so it&apos;s always visible) */}
                  <div className="p-4 border rounded-lg space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <div className="space-y-1">
                        <Label className="font-medium">Test Calendar Connection</Label>
                        <p className="text-xs text-muted-foreground">
                          One-click test to confirm your Google Calendar is connected and returning availability
                        </p>
                      </div>
                      <Button
                        variant={calendarTestStatus === 'success' ? 'default' : 'outline'}
                        onClick={testCalendarConnection}
                        disabled={calendarTestStatus === 'testing'}
                        className={calendarTestStatus === 'success' ? 'bg-green-600 hover:bg-green-700' : ''}
                      >
                        {calendarTestStatus === 'testing' ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Testing...
                          </>
                        ) : calendarTestStatus === 'success' ? (
                          <>
                            <CheckCircle2 className="h-4 w-4 mr-2" />
                            Connected
                          </>
                        ) : calendarTestStatus === 'error' ? (
                          <>
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Retry Test
                          </>
                        ) : (
                          <>
                            <Play className="h-4 w-4 mr-2" />
                            Test Connection
                          </>
                        )}
                      </Button>
                    </div>
                    
                    {calendarTestMessage && (
                      <div className={`text-sm p-2 rounded ${
                        calendarTestStatus === 'success' 
                          ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300' 
                          : calendarTestStatus === 'error'
                          ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'
                          : 'bg-muted text-muted-foreground'
                      }`}>
                        {calendarTestStatus === 'error' && <AlertCircle className="h-4 w-4 inline mr-1" />}
                        {calendarTestStatus === 'success' && <CheckCircle2 className="h-4 w-4 inline mr-1" />}
                        {calendarTestMessage}

                        {calendarTestStatus === 'error' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="ml-2"
                            onClick={() => window.open('/settings', '_blank')}
                          >
                            <Calendar className="h-3 w-3 mr-1" />
                            Fix in Settings
                          </Button>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Custom Function URL</Label>
                    <div className="flex gap-2">
                      <Input
                        readOnly
                        value="https://emonjusymdripmkvtttc.supabase.co/functions/v1/calendar-integration"
                        className="font-mono text-xs"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          navigator.clipboard.writeText('https://emonjusymdripmkvtttc.supabase.co/functions/v1/calendar-integration');
                          toast({ title: 'Copied!', description: 'URL copied to clipboard' });
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Function Configuration for Retell</Label>
                    <div className="bg-slate-900 text-slate-100 p-3 rounded-lg overflow-x-auto max-h-48">
                      <pre className="text-xs font-mono whitespace-pre">{`{
  "name": "manage_calendar",
  "description": "Check availability and book appointments",
  "url": "https://emonjusymdripmkvtttc.supabase.co/functions/v1/calendar-integration",
  "parameters": {
    "type": "object",
    "properties": {
      "action": {
        "type": "string",
        "enum": ["get_available_slots", "book_appointment"]
      },
      "date": { "type": "string" },
      "time": { "type": "string" },
      "attendee_name": { "type": "string" },
      "attendee_email": { "type": "string" }
    },
    "required": ["action"]
  }
}`}</pre>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(`{
  "name": "manage_calendar",
  "description": "Check availability and book appointments",
  "url": "https://emonjusymdripmkvtttc.supabase.co/functions/v1/calendar-integration",
  "parameters": {
    "type": "object",
    "properties": {
      "action": { "type": "string", "enum": ["get_available_slots", "book_appointment"] },
      "date": { "type": "string" },
      "time": { "type": "string" },
      "attendee_name": { "type": "string" },
      "attendee_email": { "type": "string" }
    },
    "required": ["action"]
  }
}`);
                        toast({ title: 'Copied!', description: 'Configuration copied to clipboard' });
                      }}
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      Copy Configuration
                    </Button>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => window.open('/settings', '_blank')}
                    >
                      <Calendar className="h-4 w-4 mr-2" />
                      Setup Google Calendar
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => window.open('https://dashboard.retellai.com', '_blank')}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Open Retell Dashboard
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Callback Automation Options */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    Callback Automation
                  </CardTitle>
                  <CardDescription>
                    Configure what happens when leads request callbacks via voice broadcasts or AI calls
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4">
                    <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div>
                        <Label className="font-medium">Create Calendar Event</Label>
                        <p className="text-xs text-muted-foreground">
                          Automatically add callbacks to your Google Calendar
                        </p>
                      </div>
                      <Switch
                        checked={config.callback_create_calendar ?? true}
                        onCheckedChange={(checked) => setConfig({...config, callback_create_calendar: checked})}
                      />
                    </div>
                    
                    <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div>
                        <Label className="font-medium">Send SMS Reminder</Label>
                        <p className="text-xs text-muted-foreground">
                          Text the lead before the scheduled callback
                        </p>
                      </div>
                      <Switch
                        checked={config.callback_send_sms ?? true}
                        onCheckedChange={(checked) => setConfig({...config, callback_send_sms: checked})}
                      />
                    </div>
                    
                    <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div>
                        <Label className="font-medium">Auto-Call at Scheduled Time</Label>
                        <p className="text-xs text-muted-foreground">
                          AI automatically calls back at the scheduled time
                        </p>
                      </div>
                      <Switch
                        checked={config.callback_auto_call ?? false}
                        onCheckedChange={(checked) => setConfig({...config, callback_auto_call: checked})}
                      />
                    </div>
                  </div>
                  
                  {config.callback_send_sms && (
                    <div className="space-y-2">
                      <Label>SMS Reminder Template</Label>
                      <Textarea
                        value={config.callback_sms_template || 'Hi {{first_name}}, just a reminder about our scheduled callback in {{hours}} hour(s). Talk soon!'}
                        onChange={(e) => setConfig({...config, callback_sms_template: e.target.value})}
                        placeholder="Use {{first_name}}, {{hours}} as placeholders"
                        rows={2}
                      />
                      <p className="text-xs text-muted-foreground">
                        Available variables: {'{{first_name}}'}, {'{{hours}}'}, {'{{date}}'}, {'{{time}}'}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* MCP Tools Tab */}
            <TabsContent value="mcp" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    MCP Tools (Model Context Protocol)
                  </CardTitle>
                  <CardDescription>
                    Connect external tools and APIs to extend your agent's capabilities
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {config.mcp_servers?.map((server: any, index: number) => (
                    <div key={index} className="p-4 border rounded-lg space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="font-semibold">MCP Server {index + 1}</Label>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeMcpServer(index)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                      <div className="space-y-2">
                        <Label>Server Name</Label>
                        <Input
                          value={server.name || ''}
                          onChange={(e) => updateMcpServer(index, 'name', e.target.value)}
                          placeholder="e.g., Calendar, CRM, Database"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Server URL</Label>
                        <Input
                          value={server.url || ''}
                          onChange={(e) => updateMcpServer(index, 'url', e.target.value)}
                          placeholder="https://your-mcp-server.com"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Description</Label>
                        <Textarea
                          value={server.description || ''}
                          onChange={(e) => updateMcpServer(index, 'description', e.target.value)}
                          placeholder="What does this MCP server do?"
                          rows={2}
                        />
                      </div>
                    </div>
                  ))}

                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={addMcpServer}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add MCP Server
                  </Button>

                  <div className="p-4 bg-muted/50 rounded-lg">
                    <p className="text-sm text-muted-foreground">
                      MCP (Model Context Protocol) allows your agent to interact with external systems like calendars, CRMs, databases, and more during calls. 
                      <a href="https://docs.retellai.com" target="_blank" rel="noopener noreferrer" className="text-primary ml-1 hover:underline">
                        Learn more →
                      </a>
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Knowledge Base Tab */}
            <TabsContent value="knowledge" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Book className="h-4 w-4" />
                    Knowledge Base
                  </CardTitle>
                  <CardDescription>
                    Add documents and information for your agent to reference during calls (+$0.005/min)
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {knowledgeBase.map((kb) => (
                    <div key={kb.id} className="p-4 border rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{kb.name}</span>
                          <Badge variant="outline" className="text-xs">{kb.type}</Badge>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeKnowledgeBase(kb.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {kb.content?.substring(0, 100)}...
                      </p>
                    </div>
                  ))}

                  <div className="border-t pt-4 space-y-4">
                    <div className="space-y-2">
                      <Label>Add New Knowledge Base</Label>
                      <Input
                        value={newKbName}
                        onChange={(e) => setNewKbName(e.target.value)}
                        placeholder="Knowledge base name (e.g., Product FAQ)"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Content</Label>
                      <Textarea
                        value={newKbContent}
                        onChange={(e) => setNewKbContent(e.target.value)}
                        placeholder="Enter text content or paste information..."
                        rows={4}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={addKnowledgeBase} disabled={!newKbName.trim()}>
                        <Plus className="h-4 w-4 mr-2" />
                        Add Knowledge Base
                      </Button>
                      <div className="relative">
                        <input
                          type="file"
                          accept=".txt,.md,.pdf,.doc,.docx"
                          onChange={handleFileUpload}
                          className="absolute inset-0 opacity-0 cursor-pointer"
                          disabled={isUploadingKb}
                        />
                        <Button variant="outline" disabled={isUploadingKb}>
                          {isUploadingKb ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Upload className="h-4 w-4 mr-2" />
                          )}
                          Upload File
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-muted/50 rounded-lg">
                    <p className="text-sm text-muted-foreground">
                      Knowledge bases allow your agent to access specific information during calls, such as product details, FAQs, pricing, and company policies.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Test Tab */}
            <TabsContent value="test" className="space-y-4">
              {/* Call Simulator */}
              <Card className="border-primary/20 bg-primary/5">
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    Call Simulator
                  </CardTitle>
                  <CardDescription>Make a test call to your phone to test the agent</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Your Phone Number</Label>
                    <Input
                      value={callPhoneNumber}
                      onChange={(e) => setCallPhoneNumber(e.target.value)}
                      placeholder="+1 (555) 123-4567"
                      disabled={isCallActive}
                    />
                    <p className="text-xs text-muted-foreground">
                      Enter your phone number to receive a test call from the agent
                    </p>
                  </div>
                  
                  {callStatus && (
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-sm font-medium">{callStatus}</p>
                    </div>
                  )}
                  
                  <div className="flex gap-2">
                    {!isCallActive ? (
                      <Button onClick={startTestCall} disabled={!callPhoneNumber.trim()}>
                        <Phone className="h-4 w-4 mr-2" />
                        Start Test Call
                      </Button>
                    ) : (
                      <Button onClick={endTestCall} variant="destructive">
                        <PhoneOff className="h-4 w-4 mr-2" />
                        End Call
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Test Chat */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Test Agent Chat
                  </CardTitle>
                  <CardDescription>Send a test message to see how your agent would respond</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Test Message</Label>
                    <Textarea
                      value={testMessage}
                      onChange={(e) => setTestMessage(e.target.value)}
                      placeholder="Enter a test message..."
                      rows={3}
                    />
                  </div>
                  <Button 
                    onClick={handleTestChat} 
                    disabled={isTesting || !testMessage.trim()}
                  >
                    {isTesting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    <Play className="mr-2 h-4 w-4" />
                    Send Test Message
                  </Button>
                  {testResponse && (
                    <div className="p-4 bg-muted rounded-lg">
                      <Label className="text-xs text-muted-foreground">Response:</Label>
                      <p className="mt-2 text-sm whitespace-pre-wrap">{testResponse}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Configuration Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Configuration Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Voice</p>
                      <p className="font-medium">{config.voice_id}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Voice Model</p>
                      <p className="font-medium">{config.voice_model}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Language</p>
                      <p className="font-medium">{config.language}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Est. Cost</p>
                      <p className="font-medium text-primary">${costs.total.toFixed(3)}/min</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Knowledge Bases</p>
                      <p className="font-medium">{knowledgeBase.length} items</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">MCP Servers</p>
                      <p className="font-medium">{config.mcp_servers?.length || 0} configured</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* External Dashboard Link */}
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground mb-4">
                      For advanced testing features, use the Retell AI dashboard
                    </p>
                    <Button variant="outline" asChild>
                      <a 
                        href="https://beta.re-tell.ai/dashboard" 
                        target="_blank" 
                        rel="noopener noreferrer"
                      >
                        Open Retell Dashboard
                      </a>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
