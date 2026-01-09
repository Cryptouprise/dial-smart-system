/**
 * AI SMS Agent Generator
 * 
 * Converts voice agent prompts to SMS-optimized prompts
 * with configurable follow-up aggression levels
 */

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MessageSquare, Sparkles, Loader2, Calendar, Clock, Zap, Settings2, Bot } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface AiSmsAgentGeneratorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  campaignName: string;
  agentId?: string;
  agentName?: string;
  workflowId?: string;
  onGenerated?: (smsPrompt: string) => void;
}

// Aggression level presets
const AGGRESSION_PRESETS = {
  gentle: {
    label: 'Gentle',
    description: 'Patient follow-ups, respects boundaries',
    initialDelay: 24, // hours
    followUpInterval: 48, // hours
    maxFollowUps: 3,
    toneSuffix: 'Be very patient and understanding. Never pressure the lead. Only follow up if appropriate.',
  },
  balanced: {
    label: 'Balanced',
    description: 'Regular check-ins, professional persistence',
    initialDelay: 12,
    followUpInterval: 24,
    maxFollowUps: 5,
    toneSuffix: 'Be friendly and professional. Follow up consistently but respectfully.',
  },
  persistent: {
    label: 'Persistent',
    description: 'Frequent touchpoints, urgency-focused',
    initialDelay: 4,
    followUpInterval: 12,
    maxFollowUps: 7,
    toneSuffix: 'Be proactive and create urgency. Follow up frequently to keep engagement high.',
  },
  aggressive: {
    label: 'Aggressive',
    description: 'High-frequency, deal-closing focus',
    initialDelay: 1,
    followUpInterval: 6,
    maxFollowUps: 10,
    toneSuffix: 'Be assertive and push for quick decisions. Follow up very frequently to close deals fast.',
  },
};

export const AiSmsAgentGenerator: React.FC<AiSmsAgentGeneratorProps> = ({
  open,
  onOpenChange,
  campaignId,
  campaignName,
  agentId,
  agentName,
  workflowId,
  onGenerated,
}) => {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('generate');
  
  // Configuration state
  const [aggressionLevel, setAggressionLevel] = useState<keyof typeof AGGRESSION_PRESETS>('balanced');
  const [customAggressionValue, setCustomAggressionValue] = useState([50]);
  const [useCustomAggression, setUseCustomAggression] = useState(false);
  
  // Generated content
  const [originalVoicePrompt, setOriginalVoicePrompt] = useState('');
  const [generatedSmsPrompt, setGeneratedSmsPrompt] = useState('');
  const [followUpSettings, setFollowUpSettings] = useState({
    autoFollowUp: true,
    initialDelayHours: 12,
    followUpIntervalHours: 24,
    maxFollowUps: 5,
    respectQuietHours: true,
    quietHoursStart: '21:00',
    quietHoursEnd: '09:00',
    linkToCalendar: true,
    linkToPipeline: true,
  });

  // Fetch voice agent prompt from Retell
  const fetchVoiceAgentPrompt = async () => {
    if (!agentId) {
      toast({
        title: 'No Agent',
        description: 'This campaign has no voice agent assigned',
        variant: 'destructive',
      });
      return null;
    }

    try {
      const { data, error } = await supabase.functions.invoke('retell-agent-management', {
        body: { action: 'get', agentId }
      });

      if (error) throw error;

      // Extract prompt from agent config
      const prompt = data?.llm_websocket_url 
        ? 'Voice agent uses custom LLM' 
        : (data?.general_prompt || data?.response_engine?.llm_config?.general_prompt || 'No prompt found');
      
      setOriginalVoicePrompt(prompt);
      return prompt;
    } catch (error) {
      console.error('Error fetching agent:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch voice agent configuration',
        variant: 'destructive',
      });
      return null;
    }
  };

  // Generate SMS-optimized prompt using AI
  const generateSmsPrompt = async () => {
    setIsGenerating(true);
    try {
      // First fetch the voice prompt if we don't have it
      let voicePrompt = originalVoicePrompt;
      if (!voicePrompt) {
        voicePrompt = await fetchVoiceAgentPrompt() || '';
      }

      const preset = AGGRESSION_PRESETS[aggressionLevel];
      
      // Call AI to convert the prompt
      const { data, error } = await supabase.functions.invoke('ai-sms-processor', {
        body: {
          action: 'convert_voice_to_sms',
          voicePrompt,
          aggressionLevel,
          aggressionTone: preset.toneSuffix,
          campaignName,
          settings: {
            initialDelayHours: useCustomAggression 
              ? Math.round(24 - (customAggressionValue[0] / 100 * 23)) 
              : preset.initialDelay,
            followUpIntervalHours: useCustomAggression
              ? Math.round(48 - (customAggressionValue[0] / 100 * 42))
              : preset.followUpInterval,
            maxFollowUps: useCustomAggression
              ? Math.round(3 + (customAggressionValue[0] / 100 * 7))
              : preset.maxFollowUps,
          }
        }
      });

      if (error) throw error;

      if (data?.smsPrompt) {
        setGeneratedSmsPrompt(data.smsPrompt);
        
        // Update follow-up settings based on aggression
        if (!useCustomAggression) {
          setFollowUpSettings(prev => ({
            ...prev,
            initialDelayHours: preset.initialDelay,
            followUpIntervalHours: preset.followUpInterval,
            maxFollowUps: preset.maxFollowUps,
          }));
        }
        
        toast({
          title: 'SMS Agent Generated',
          description: 'Review and customize the generated prompt below',
        });
      } else {
        // Fallback: generate locally if edge function doesn't support this action
        const fallbackPrompt = generateLocalSmsPrompt(voicePrompt, preset);
        setGeneratedSmsPrompt(fallbackPrompt);
      }
    } catch (error) {
      console.error('Error generating SMS prompt:', error);
      // Generate locally as fallback
      const preset = AGGRESSION_PRESETS[aggressionLevel];
      const fallbackPrompt = generateLocalSmsPrompt(originalVoicePrompt || 'Professional sales agent', preset);
      setGeneratedSmsPrompt(fallbackPrompt);
    } finally {
      setIsGenerating(false);
    }
  };

  // Local fallback prompt generator
  const generateLocalSmsPrompt = (voicePrompt: string, preset: typeof AGGRESSION_PRESETS[keyof typeof AGGRESSION_PRESETS]) => {
    return `You are an AI SMS assistant for ${campaignName}. Your role is to engage leads via text message.

CORE PERSONALITY (adapted from voice agent):
${voicePrompt}

SMS-SPECIFIC GUIDELINES:
- Keep messages concise (under 160 characters when possible)
- Use casual, text-friendly language (contractions, simple words)
- Don't use phone-specific phrases like "let me transfer you" or "hold on"
- Include clear calls-to-action
- Ask one question at a time
- Use emojis sparingly and appropriately

FOLLOW-UP STYLE: ${preset.label}
${preset.toneSuffix}

TIMING RULES:
- Initial follow-up after ${preset.initialDelay} hours of no response
- Subsequent follow-ups every ${preset.followUpInterval} hours
- Maximum ${preset.maxFollowUps} follow-up attempts

CALENDAR INTEGRATION:
- When a lead expresses interest in scheduling, offer available time slots
- Confirm appointments via text
- Send reminders before scheduled calls/meetings

PIPELINE AWARENESS:
- Track lead engagement and update their status accordingly
- Escalate hot leads who show buying signals
- Tag leads based on their responses for better segmentation`;
  };

  // Save the SMS agent configuration
  const saveSmsAgentConfig = async () => {
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Update AI SMS settings with the new prompt
      const { error: settingsError } = await supabase
        .from('ai_sms_settings')
        .upsert({
          user_id: user.id,
          custom_instructions: generatedSmsPrompt,
          auto_response_enabled: followUpSettings.autoFollowUp,
          enabled: true,
          include_lead_context: followUpSettings.linkToPipeline,
          include_call_history: true,
          include_sms_history: true,
        }, { onConflict: 'user_id' });

      if (settingsError) throw settingsError;

      // Store campaign-specific SMS config - fetch description first, then update
      const { data: campaignData } = await supabase
        .from('campaigns')
        .select('description')
        .eq('id', campaignId)
        .maybeSingle();
      
      const existingDescription = campaignData?.description || '';
      const { error: campaignError } = await supabase
        .from('campaigns')
        .update({
          description: existingDescription + '\n\n[SMS Agent: Enabled with ' + aggressionLevel + ' follow-up style]'
        })
        .eq('id', campaignId);

      // Create follow-up automation rules if auto follow-up is enabled
      if (followUpSettings.autoFollowUp) {
        await supabase.from('campaign_automation_rules').upsert({
          user_id: user.id,
          campaign_id: campaignId,
          name: `SMS Auto Follow-up - ${campaignName}`,
          rule_type: 'sms_follow_up',
          enabled: true,
          conditions: {
            noResponseHours: followUpSettings.initialDelayHours,
            maxAttempts: followUpSettings.maxFollowUps,
          },
          actions: {
            type: 'send_ai_sms',
            intervalHours: followUpSettings.followUpIntervalHours,
            respectQuietHours: followUpSettings.respectQuietHours,
            quietHoursStart: followUpSettings.quietHoursStart,
            quietHoursEnd: followUpSettings.quietHoursEnd,
          },
          time_windows: followUpSettings.respectQuietHours ? [{
            start: followUpSettings.quietHoursEnd,
            end: followUpSettings.quietHoursStart,
          }] : null,
        }, { onConflict: 'campaign_id,name' });
      }

      toast({
        title: 'SMS Agent Saved',
        description: 'AI SMS agent has been configured for this campaign',
      });

      onGenerated?.(generatedSmsPrompt);
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving SMS agent:', error);
      toast({
        title: 'Error',
        description: 'Failed to save SMS agent configuration',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const currentPreset = AGGRESSION_PRESETS[aggressionLevel];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            AI SMS Agent Generator
          </DialogTitle>
          <DialogDescription>
            Convert your voice agent into an SMS-optimized AI agent for {campaignName}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="generate">Generate</TabsTrigger>
            <TabsTrigger value="followup">Follow-up</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
          </TabsList>

          <TabsContent value="generate" className="space-y-4">
            {/* Voice Agent Info */}
            {agentName && (
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Source: {agentName}
                  </CardTitle>
                </CardHeader>
              </Card>
            )}

            {/* Aggression Level */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Follow-up Aggression Style</Label>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={useCustomAggression}
                    onCheckedChange={setUseCustomAggression}
                  />
                  <span className="text-xs text-muted-foreground">Custom</span>
                </div>
              </div>

              {!useCustomAggression ? (
                <Select value={aggressionLevel} onValueChange={(v) => setAggressionLevel(v as keyof typeof AGGRESSION_PRESETS)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(AGGRESSION_PRESETS).map(([key, preset]) => (
                      <SelectItem key={key} value={key}>
                        <div className="flex items-center gap-2">
                          <span>{preset.label}</span>
                          <span className="text-xs text-muted-foreground">- {preset.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="space-y-2">
                  <Slider
                    value={customAggressionValue}
                    onValueChange={setCustomAggressionValue}
                    max={100}
                    step={10}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Gentle</span>
                    <span>Balanced</span>
                    <span>Aggressive</span>
                  </div>
                </div>
              )}

              <div className="flex gap-2 flex-wrap">
                <Badge variant="outline">
                  <Clock className="h-3 w-3 mr-1" />
                  First follow-up: {currentPreset.initialDelay}h
                </Badge>
                <Badge variant="outline">
                  <Zap className="h-3 w-3 mr-1" />
                  Interval: {currentPreset.followUpInterval}h
                </Badge>
                <Badge variant="outline">
                  Max: {currentPreset.maxFollowUps} attempts
                </Badge>
              </div>
            </div>

            {/* Generate Button */}
            <Button
              onClick={generateSmsPrompt}
              disabled={isGenerating}
              className="w-full"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating SMS Agent...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate SMS Agent from Voice Agent
                </>
              )}
            </Button>

            {/* Generated Prompt */}
            {generatedSmsPrompt && (
              <div className="space-y-2">
                <Label>Generated SMS Prompt (editable)</Label>
                <Textarea
                  value={generatedSmsPrompt}
                  onChange={(e) => setGeneratedSmsPrompt(e.target.value)}
                  rows={10}
                  className="font-mono text-sm"
                />
              </div>
            )}
          </TabsContent>

          <TabsContent value="followup" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Smart Follow-up Settings</CardTitle>
                <CardDescription>Configure when and how the AI follows up with leads</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Enable Auto Follow-up</Label>
                  <Switch
                    checked={followUpSettings.autoFollowUp}
                    onCheckedChange={(v) => setFollowUpSettings(prev => ({ ...prev, autoFollowUp: v }))}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs">Initial Delay (hours)</Label>
                    <Select
                      value={followUpSettings.initialDelayHours.toString()}
                      onValueChange={(v) => setFollowUpSettings(prev => ({ ...prev, initialDelayHours: parseInt(v) }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 4, 6, 12, 24, 48].map(h => (
                          <SelectItem key={h} value={h.toString()}>{h} hours</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Follow-up Interval (hours)</Label>
                    <Select
                      value={followUpSettings.followUpIntervalHours.toString()}
                      onValueChange={(v) => setFollowUpSettings(prev => ({ ...prev, followUpIntervalHours: parseInt(v) }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[6, 12, 24, 48, 72].map(h => (
                          <SelectItem key={h} value={h.toString()}>{h} hours</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label className="text-xs">Max Follow-up Attempts</Label>
                  <Slider
                    value={[followUpSettings.maxFollowUps]}
                    onValueChange={([v]) => setFollowUpSettings(prev => ({ ...prev, maxFollowUps: v }))}
                    min={1}
                    max={15}
                    step={1}
                  />
                  <div className="text-xs text-muted-foreground text-center mt-1">
                    {followUpSettings.maxFollowUps} attempts
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <Label>Respect Quiet Hours</Label>
                  <Switch
                    checked={followUpSettings.respectQuietHours}
                    onCheckedChange={(v) => setFollowUpSettings(prev => ({ ...prev, respectQuietHours: v }))}
                  />
                </div>

                {followUpSettings.respectQuietHours && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs">Quiet Hours Start</Label>
                      <Select
                        value={followUpSettings.quietHoursStart}
                        onValueChange={(v) => setFollowUpSettings(prev => ({ ...prev, quietHoursStart: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {['18:00', '19:00', '20:00', '21:00', '22:00'].map(t => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Quiet Hours End</Label>
                      <Select
                        value={followUpSettings.quietHoursEnd}
                        onValueChange={(v) => setFollowUpSettings(prev => ({ ...prev, quietHoursEnd: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {['07:00', '08:00', '09:00', '10:00'].map(t => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="integrations" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Calendar Integration
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Link to Calendar</Label>
                    <p className="text-xs text-muted-foreground">
                      AI can schedule appointments directly via SMS
                    </p>
                  </div>
                  <Switch
                    checked={followUpSettings.linkToCalendar}
                    onCheckedChange={(v) => setFollowUpSettings(prev => ({ ...prev, linkToCalendar: v }))}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Settings2 className="h-4 w-4" />
                  Pipeline Integration
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Link to Pipeline</Label>
                    <p className="text-xs text-muted-foreground">
                      Auto-update lead stages based on SMS responses
                    </p>
                  </div>
                  <Switch
                    checked={followUpSettings.linkToPipeline}
                    onCheckedChange={(v) => setFollowUpSettings(prev => ({ ...prev, linkToPipeline: v }))}
                  />
                </div>
              </CardContent>
            </Card>

            {workflowId && (
              <Card className="border-primary/50">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-sm text-primary">
                    <Zap className="h-4 w-4" />
                    Linked to workflow - SMS agent will coordinate with workflow steps
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={saveSmsAgentConfig} 
            disabled={!generatedSmsPrompt || isSaving}
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save SMS Agent'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AiSmsAgentGenerator;
