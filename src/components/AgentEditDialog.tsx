import React, { useState, useEffect } from 'react';
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
import { Loader2 } from 'lucide-react';

interface AgentEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent: any;
  onSave: (agentConfig: any) => Promise<void>;
  isLoading: boolean;
}

export const AgentEditDialog: React.FC<AgentEditDialogProps> = ({
  open,
  onOpenChange,
  agent,
  onSave,
  isLoading
}) => {
  const [config, setConfig] = useState<any>({});

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
        data_storage_setting: agent.data_storage_setting || 'everything',
        opt_in_signed_url: agent.opt_in_signed_url ?? true,
      });
    }
  }, [agent]);

  const handleSave = async () => {
    await onSave(config);
  };

  const updateConfig = (field: string, value: any) => {
    setConfig((prev: any) => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Edit Agent: {agent?.agent_name}</DialogTitle>
          <DialogDescription>
            Configure all aspects of your Retell AI agent
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[600px] pr-4">
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-6">
              <TabsTrigger value="basic">Basic</TabsTrigger>
              <TabsTrigger value="llm">LLM/Script</TabsTrigger>
              <TabsTrigger value="voice">Voice</TabsTrigger>
              <TabsTrigger value="behavior">Behavior</TabsTrigger>
              <TabsTrigger value="features">Features</TabsTrigger>
              <TabsTrigger value="advanced">Advanced</TabsTrigger>
            </TabsList>

            {/* Basic Tab */}
            <TabsContent value="basic" className="space-y-4">
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
                <Input
                  id="webhook_url"
                  value={config.webhook_url || ''}
                  onChange={(e) => updateConfig('webhook_url', e.target.value)}
                  placeholder="https://your-webhook-url.com"
                />
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
                    The LLM configuration contains your agent's script and prompts. Edit the LLM in the LLMs tab.
                  </p>
                </div>
              )}

              <div className="p-4 border rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">
                  The agent's conversation script and prompts are configured in the associated Retell LLM. 
                  To edit the script, go to the LLMs tab and modify the LLM directly.
                </p>
              </div>
            </TabsContent>

            {/* Voice Tab */}
            <TabsContent value="voice" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="voice_id">Voice ID</Label>
                <Input
                  id="voice_id"
                  value={config.voice_id || ''}
                  onChange={(e) => updateConfig('voice_id', e.target.value)}
                  placeholder="e.g., 11labs-Adrian, openai-Alloy"
                />
              </div>

              <div className="space-y-2">
                <Label>Fallback Voice IDs (comma separated)</Label>
                <Input
                  value={config.fallback_voice_ids?.join(', ') || ''}
                  onChange={(e) => updateConfig('fallback_voice_ids', e.target.value.split(',').map((v: string) => v.trim()).filter(Boolean))}
                  placeholder="openai-Alloy, deepgram-Angus"
                />
                <p className="text-xs text-muted-foreground">Backup voices if primary fails</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="voice_model">Voice Model</Label>
                <Select value={config.voice_model} onValueChange={(v) => updateConfig('voice_model', v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="eleven_turbo_v2">Eleven Turbo V2</SelectItem>
                    <SelectItem value="eleven_multilingual_v2">Eleven Multilingual V2</SelectItem>
                    <SelectItem value="eleven_turbo_v2_5">Eleven Turbo V2.5</SelectItem>
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
                <p className="text-xs text-muted-foreground">Controls voice expressiveness (0 = stable, 2 = expressive)</p>
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

              <div className="space-y-2">
                <Label htmlFor="ambient_sound">Ambient Sound</Label>
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
            </TabsContent>

            {/* Behavior Tab */}
            <TabsContent value="behavior" className="space-y-4">
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

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Enable Backchannel</Label>
                  <p className="text-xs text-muted-foreground">Agent says "uh-huh", "yeah" while listening</p>
                </div>
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
                      placeholder="yeah, uh-huh, I see"
                    />
                  </div>
                </>
              )}

              <div className="space-y-2">
                <Label htmlFor="reminder_trigger_ms">Reminder Trigger (ms)</Label>
                <Input
                  id="reminder_trigger_ms"
                  type="number"
                  value={config.reminder_trigger_ms || 10000}
                  onChange={(e) => updateConfig('reminder_trigger_ms', parseInt(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">After this silence, agent will prompt user</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="reminder_max_count">Max Reminder Count</Label>
                <Input
                  id="reminder_max_count"
                  type="number"
                  value={config.reminder_max_count || 2}
                  onChange={(e) => updateConfig('reminder_max_count', parseInt(e.target.value))}
                />
              </div>
            </TabsContent>

            {/* Features Tab */}
            <TabsContent value="features" className="space-y-4">
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold mb-3">Voicemail Configuration</h4>
                  <div className="space-y-3 pl-4 border-l-2">
                    <div className="space-y-2">
                      <Label htmlFor="voicemail_action_type">Voicemail Action Type</Label>
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
                          <SelectItem value="static_text">Static Text Message</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {config.voicemail_option?.action?.type === 'static_text' && (
                      <div className="space-y-2">
                        <Label htmlFor="voicemail_text">Voicemail Message</Label>
                        <Textarea
                          id="voicemail_text"
                          value={config.voicemail_option?.action?.text || ''}
                          onChange={(e) => updateConfig('voicemail_option', {
                            action: { type: 'static_text', text: e.target.value }
                          })}
                          placeholder="Please give us a callback tomorrow at 10am."
                          rows={3}
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold mb-3">Pronunciation Dictionary</h4>
                  <div className="space-y-3 pl-4 border-l-2">
                    <p className="text-xs text-muted-foreground mb-2">
                      Add custom pronunciations for specific words (JSON format)
                    </p>
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
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold mb-3">Post-Call Analysis</h4>
                  <div className="space-y-3 pl-4 border-l-2">
                    <div className="space-y-2">
                      <Label htmlFor="post_call_model">Analysis Model</Label>
                      <Select 
                        value={config.post_call_analysis_model} 
                        onValueChange={(v) => updateConfig('post_call_analysis_model', v)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                          <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                          <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Data to Extract (JSON format)</Label>
                      <Textarea
                        value={JSON.stringify(config.post_call_analysis_data || [], null, 2)}
                        onChange={(e) => {
                          try {
                            const parsed = JSON.parse(e.target.value);
                            updateConfig('post_call_analysis_data', parsed);
                          } catch {}
                        }}
                        placeholder='[{"type":"string","name":"customer_name","description":"The name of the customer","examples":["John Doe"]}]'
                        rows={6}
                        className="font-mono text-xs"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold mb-3">DTMF (Keypad) Options</h4>
                  <div className="space-y-3 pl-4 border-l-2">
                    <div className="flex items-center justify-between">
                      <Label>Allow User DTMF</Label>
                      <Switch
                        checked={config.allow_user_dtmf}
                        onCheckedChange={(v) => updateConfig('allow_user_dtmf', v)}
                      />
                    </div>

                    {config.allow_user_dtmf && (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="dtmf_digit_limit">Digit Limit</Label>
                          <Input
                            id="dtmf_digit_limit"
                            type="number"
                            value={config.user_dtmf_options?.digit_limit || 25}
                            onChange={(e) => updateConfig('user_dtmf_options', {
                              ...config.user_dtmf_options,
                              digit_limit: parseInt(e.target.value)
                            })}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="dtmf_termination">Termination Key</Label>
                          <Input
                            id="dtmf_termination"
                            value={config.user_dtmf_options?.termination_key || '#'}
                            onChange={(e) => updateConfig('user_dtmf_options', {
                              ...config.user_dtmf_options,
                              termination_key: e.target.value
                            })}
                            maxLength={1}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="dtmf_timeout">Timeout (ms)</Label>
                          <Input
                            id="dtmf_timeout"
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
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Advanced Tab */}
            <TabsContent value="advanced" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="stt_mode">Speech-to-Text Mode</Label>
                <Select value={config.stt_mode} onValueChange={(v) => updateConfig('stt_mode', v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fast">Fast</SelectItem>
                    <SelectItem value="accurate">Accurate</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="vocab_specialization">Vocabulary Specialization</Label>
                <Select value={config.vocab_specialization} onValueChange={(v) => updateConfig('vocab_specialization', v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="medical">Medical</SelectItem>
                    <SelectItem value="legal">Legal</SelectItem>
                    <SelectItem value="finance">Finance</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="denoising_mode">Denoising Mode</Label>
                <Select value={config.denoising_mode} onValueChange={(v) => updateConfig('denoising_mode', v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="off">Off</SelectItem>
                    <SelectItem value="noise-cancellation">Noise Cancellation</SelectItem>
                    <SelectItem value="krisp">Krisp</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="boosted_keywords">Boosted Keywords (comma separated)</Label>
                <Textarea
                  id="boosted_keywords"
                  value={config.boosted_keywords?.join(', ') || ''}
                  onChange={(e) => updateConfig('boosted_keywords', e.target.value.split(',').map((k: string) => k.trim()))}
                  placeholder="retell, product names, company names"
                  rows={3}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Normalize for Speech</Label>
                  <p className="text-xs text-muted-foreground">Convert numbers, dates to spoken form</p>
                </div>
                <Switch
                  checked={config.normalize_for_speech}
                  onCheckedChange={(v) => updateConfig('normalize_for_speech', v)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Allow User DTMF</Label>
                  <p className="text-xs text-muted-foreground">Enable keypad input during call</p>
                </div>
                <Switch
                  checked={config.opt_in_signed_url}
                  onCheckedChange={(v) => updateConfig('opt_in_signed_url', v)}
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

              <div className="space-y-2">
                <Label htmlFor="begin_message_delay_ms">Begin Message Delay (ms)</Label>
                <Input
                  id="begin_message_delay_ms"
                  type="number"
                  value={config.begin_message_delay_ms || 1000}
                  onChange={(e) => updateConfig('begin_message_delay_ms', parseInt(e.target.value))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ring_duration_ms">Ring Duration (ms)</Label>
                <Input
                  id="ring_duration_ms"
                  type="number"
                  value={config.ring_duration_ms || 30000}
                  onChange={(e) => updateConfig('ring_duration_ms', parseInt(e.target.value))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="end_call_after_silence_ms">End Call After Silence (ms)</Label>
                <Input
                  id="end_call_after_silence_ms"
                  type="number"
                  value={config.end_call_after_silence_ms || 600000}
                  onChange={(e) => updateConfig('end_call_after_silence_ms', parseInt(e.target.value))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="max_call_duration_ms">Max Call Duration (ms)</Label>
                <Input
                  id="max_call_duration_ms"
                  type="number"
                  value={config.max_call_duration_ms || 3600000}
                  onChange={(e) => updateConfig('max_call_duration_ms', parseInt(e.target.value))}
                />
              </div>
            </TabsContent>
          </Tabs>
        </ScrollArea>

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