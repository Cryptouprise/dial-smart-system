import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { useVoiceBroadcast, VoiceBroadcast, DTMFAction, parseDTMFActions } from '@/hooks/useVoiceBroadcast';
import { useBroadcastReadiness, BroadcastReadinessResult } from '@/hooks/useBroadcastReadiness';
import { supabase } from '@/integrations/supabase/client';
import { 
  Radio, Play, Pause, Plus, Trash2, Volume2, Users, 
  Phone, PhoneOff, Clock, Settings, BarChart3, 
  MessageSquare, Bot, Hash, RefreshCw, PhoneForwarded, Mic, Gauge, RotateCcw,
  AlertTriangle, CheckCircle2, XCircle, Square, TestTube
} from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import QuickTestBroadcast from '@/components/QuickTestBroadcast';
import BroadcastReadinessChecker from '@/components/BroadcastReadinessChecker';
import BroadcastQueueManager from '@/components/BroadcastQueueManager';

const ELEVENLABS_VOICES = [
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam ⭐' },
  { id: 'zrHiDhphv9ZnVXBqCLjz', name: 'Juniper ⭐' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah' },
  { id: '9BWtsMINqrJLrRacOk9x', name: 'Aria' },
  { id: 'CwhRBWXzGAHq8TQ4Fs17', name: 'Roger' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura' },
  { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George' },
  { id: 'N2lVS1w4EtoT3dr4eOWO', name: 'Callum' },
  { id: 'SAz9YHcvj6GT2YYXdXww', name: 'River' },
  { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte' },
  { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice' },
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda' },
  { id: 'bIHbv24MWmeRgasZH58o', name: 'Will' },
  { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica' },
  { id: 'cjVigY5qzO86Huf0OWal', name: 'Eric' },
  { id: 'iP95p4xoKVk53GoZ742B', name: 'Chris' },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily' },
  { id: 'pqHfZKP75CvOlQylNhV4', name: 'Bill' },
];

const DEFAULT_DTMF_ACTIONS: DTMFAction[] = [
  { digit: '1', action: 'transfer', label: 'Connect to Agent' },
  { 
    digit: '2', 
    action: 'callback', 
    delay_hours: 24, 
    label: 'Schedule Callback',
    callback_options: {
      create_calendar_event: true,
      send_sms_reminder: true,
      auto_callback_call: false,
      sms_reminder_hours_before: 1,
      sms_reminder_template: 'Hi {{first_name}}, just a reminder about our scheduled callback in 1 hour. Talk soon!'
    }
  },
  { digit: '3', action: 'dnc', label: 'Do Not Call' },
];

export const VoiceBroadcastManager: React.FC = () => {
  const { toast } = useToast();
  const {
    broadcasts,
    isLoading,
    loadBroadcasts,
    createBroadcast,
    updateBroadcast,
    deleteBroadcast,
    generateAudio,
    addLeadsToBroadcast,
    resetBroadcastQueue,
    startBroadcast,
    stopBroadcast,
    getBroadcastStats,
    cleanupStuckCalls,
    retryFailedCalls,
  } = useVoiceBroadcast();
  
  const { checkBroadcastReadiness, runTestBatch, emergencyStop, isChecking: isCheckingReadiness } = useBroadcastReadiness();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedBroadcast, setSelectedBroadcast] = useState<VoiceBroadcast | null>(null);
  const [leads, setLeads] = useState<any[]>([]);
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [stats, setStats] = useState<Record<string, any>>({});
  const [addLeadsDialogBroadcastId, setAddLeadsDialogBroadcastId] = useState<string | null>(null);
  const [resultsDialogBroadcastId, setResultsDialogBroadcastId] = useState<string | null>(null);
  const [queueResults, setQueueResults] = useState<any[]>([]);
  const [loadingResults, setLoadingResults] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'settings' | 'results'>('settings');
  const [phoneNumbers, setPhoneNumbers] = useState<any[]>([]);
  
  // New state for queue manager and readiness
  const [queueManagerBroadcastId, setQueueManagerBroadcastId] = useState<string | null>(null);
  const [readinessResults, setReadinessResults] = useState<Record<string, BroadcastReadinessResult>>({});
  const [startingBroadcastId, setStartingBroadcastId] = useState<string | null>(null);
  const [emergencyStopId, setEmergencyStopId] = useState<string | null>(null);
  const [testingBroadcastId, setTestingBroadcastId] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    message_text: '',
    voice_id: 'TX3LPaxmHKxFdv7VOQHJ',
    ivr_enabled: true,
    ivr_mode: 'dtmf',
    ivr_prompt: 'Press 1 to speak with a representative. Press 2 to schedule a callback. Press 3 to opt out.',
    dtmf_actions: DEFAULT_DTMF_ACTIONS,
    ai_system_prompt: 'You are a friendly assistant. If the caller is interested, offer to transfer them.',
    calls_per_minute: 50,
    max_attempts: 1,
    timezone: 'America/New_York',
    calling_hours_start: '09:00',
    calling_hours_end: '17:00',
    use_dialer_features: true, // Enable number rotation & local presence for better deliverability
    enable_local_presence: true,
    enable_number_rotation: true,
    caller_id: '', // Specific phone number to use as caller ID
  });

  useEffect(() => {
    loadBroadcasts();
    loadLeads();
    loadPhoneNumbers();
  }, []);

  const loadPhoneNumbers = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('phone_numbers')
        .select('id, number, friendly_name, status, purpose, retell_phone_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .eq('is_spam', false)
        .order('number');

      if (error) throw error;
      setPhoneNumbers(data || []);
    } catch (error) {
      console.error('Error loading phone numbers:', error);
    }
  };

  useEffect(() => {
    // Load stats for each broadcast - properly handle async operations
    let isMounted = true;
    
    const loadAllStats = async () => {
      const statsPromises = broadcasts.map(async (b) => {
        const s = await getBroadcastStats(b.id);
        return { id: b.id, stats: s };
      });
      
      const results = await Promise.all(statsPromises);
      
      if (isMounted) {
        const newStats: Record<string, any> = {};
        results.forEach(({ id, stats }) => {
          if (stats) {
            newStats[id] = stats;
          }
        });
        setStats(prev => ({ ...prev, ...newStats }));
      }
    };
    
    if (broadcasts.length > 0) {
      loadAllStats();
    }
    
    return () => {
      isMounted = false;
    };
  }, [broadcasts]);

  // Auto-refresh stats for active broadcasts every 5 seconds
  useEffect(() => {
    const hasActiveBroadcast = broadcasts.some(b => b.status === 'active');
    if (!hasActiveBroadcast) return;

    const interval = setInterval(() => {
      loadBroadcasts();
    }, 5000);

    return () => clearInterval(interval);
  }, [broadcasts]);

  const loadLeads = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('leads')
        .select('id, phone_number, first_name, last_name, status')
        .eq('user_id', user.id)
        .eq('do_not_call', false)
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;
      setLeads(data || []);
    } catch (error) {
      console.error('Error loading leads:', error);
    }
  };

  const loadQueueResults = async (broadcastId: string) => {
    try {
      setLoadingResults(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('broadcast_queue')
        .select(`
          id, phone_number, status, dtmf_pressed, lead_name,
          created_at, updated_at, callback_scheduled_at,
          lead:leads(first_name, last_name, phone_number, status)
        `)
        .eq('broadcast_id', broadcastId)
        .order('updated_at', { ascending: false })
        .limit(500);

      if (error) throw error;
      setQueueResults(data || []);
    } catch (error) {
      console.error('Error loading queue results:', error);
    } finally {
      setLoadingResults(false);
    }
  };

  const handleCreate = async () => {
    try {
      await createBroadcast({
        name: formData.name,
        description: formData.description,
        message_text: formData.message_text,
        voice_id: formData.voice_id,
        ivr_enabled: formData.ivr_enabled,
        ivr_mode: formData.ivr_mode,
        ivr_prompt: formData.ivr_prompt,
        dtmf_actions: formData.dtmf_actions,
        ai_system_prompt: formData.ai_system_prompt,
        calls_per_minute: formData.calls_per_minute,
        max_attempts: formData.max_attempts,
        timezone: formData.timezone,
        calling_hours_start: formData.calling_hours_start,
        calling_hours_end: formData.calling_hours_end,
        caller_id: formData.caller_id || null,
      });
      setShowCreateDialog(false);
      resetForm();
    } catch (error) {
      // Error handled in hook
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      message_text: '',
      voice_id: 'TX3LPaxmHKxFdv7VOQHJ',
      ivr_enabled: true,
      ivr_mode: 'dtmf',
      ivr_prompt: 'Press 1 to speak with a representative. Press 2 to schedule a callback. Press 3 to opt out.',
      dtmf_actions: DEFAULT_DTMF_ACTIONS,
      ai_system_prompt: 'You are a friendly assistant. If the caller is interested, offer to transfer them.',
      calls_per_minute: 50,
      max_attempts: 1,
      timezone: 'America/New_York',
      calling_hours_start: '09:00',
      calling_hours_end: '17:00',
      use_dialer_features: true,
      enable_local_presence: true,
      enable_number_rotation: true,
      caller_id: '',
    });
  };

  const handleGenerateAudio = async (broadcast: VoiceBroadcast) => {
    const fullMessage = broadcast.ivr_enabled && broadcast.ivr_prompt
      ? `${broadcast.message_text} ... ${broadcast.ivr_prompt}`
      : broadcast.message_text;
    
    await generateAudio(broadcast.id, fullMessage, broadcast.voice_id || 'TX3LPaxmHKxFdv7VOQHJ');
  };

  const handleAddLeads = async (broadcastId: string) => {
    if (selectedLeads.length === 0) {
      toast({
        title: "No Leads Selected",
        description: "Please select at least one lead to add",
        variant: "destructive",
      });
      return;
    }
    await addLeadsToBroadcast(broadcastId, selectedLeads);
    setSelectedLeads([]);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500';
      case 'paused': return 'bg-yellow-500';
      case 'completed': return 'bg-blue-500';
      case 'draft': return 'bg-gray-500';
      default: return 'bg-gray-500';
    }
  };

  const updateDTMFAction = (index: number, field: keyof DTMFAction, value: any) => {
    const newActions = [...formData.dtmf_actions];
    newActions[index] = { ...newActions[index], [field]: value };
    setFormData({ ...formData, dtmf_actions: newActions });
  };

  return (
    <div className="space-y-6">
      {/* Quick Test Section */}
      <QuickTestBroadcast />
      
      {/* Next Steps Guide */}
      <Card className="border-2 border-dashed border-primary/30 bg-gradient-to-r from-primary/5 via-transparent to-primary/5">
        <CardContent className="py-4">
          <div className="flex items-start gap-4">
            <div className="bg-primary/10 rounded-full p-2 mt-0.5">
              <span className="text-lg font-bold text-primary">?</span>
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-foreground mb-1">What's Next?</h3>
              <p className="text-sm text-muted-foreground mb-3">
                The test tool above lets you try a single call. Ready to broadcast to many contacts?
              </p>
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-xs text-muted-foreground">👇</span>
                <span className="text-sm font-medium">Click the</span>
                <Button size="sm" variant="outline" className="pointer-events-none h-7 px-2">
                  <Plus className="h-3 w-3 mr-1" />
                  New Broadcast
                </Button>
                <span className="text-sm font-medium">button below to create a campaign and add leads</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Radio className="h-6 w-6" />
            Voice Broadcasting
          </h2>
          <p className="text-muted-foreground">
            Send pre-recorded messages with IVR options to thousands of contacts
          </p>
        </div>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Broadcast
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Voice Broadcast</DialogTitle>
              <DialogDescription>
                Set up a new voice broadcast campaign with IVR options
              </DialogDescription>
            </DialogHeader>

            <Tabs defaultValue="message" className="mt-4">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="message">Message</TabsTrigger>
                <TabsTrigger value="ivr">IVR Options</TabsTrigger>
                <TabsTrigger value="settings">Settings</TabsTrigger>
              </TabsList>

              <TabsContent value="message" className="space-y-4">
                <div className="space-y-2">
                  <Label>Campaign Name</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Summer Sale Announcement"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Description (Optional)</Label>
                  <Input
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Brief description of this campaign"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Message Script</Label>
                  <Textarea
                    value={formData.message_text}
                    onChange={(e) => setFormData({ ...formData, message_text: e.target.value })}
                    placeholder="Hello! This is a special announcement from..."
                    rows={5}
                  />
                  <p className="text-xs text-muted-foreground">
                    This will be converted to speech using AI voice technology
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Voice</Label>
                  <Select
                    value={formData.voice_id}
                    onValueChange={(value) => setFormData({ ...formData, voice_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ELEVENLABS_VOICES.map((voice) => (
                        <SelectItem key={voice.id} value={voice.id}>
                          {voice.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </TabsContent>

              <TabsContent value="ivr" className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Enable IVR Options</Label>
                    <p className="text-xs text-muted-foreground">
                      Allow recipients to press keys to take action
                    </p>
                  </div>
                  <Switch
                    checked={formData.ivr_enabled}
                    onCheckedChange={(checked) => setFormData({ ...formData, ivr_enabled: checked })}
                  />
                </div>

                {formData.ivr_enabled && (
                  <>
                    <div className="space-y-2">
                      <Label>IVR Mode</Label>
                      <Select
                        value={formData.ivr_mode}
                        onValueChange={(value) => setFormData({ ...formData, ivr_mode: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="dtmf">
                            <div className="flex items-center gap-2">
                              <Hash className="h-4 w-4" />
                              DTMF (Press 1, 2, 3...)
                            </div>
                          </SelectItem>
                          <SelectItem value="ai_conversational">
                            <div className="flex items-center gap-2">
                              <Bot className="h-4 w-4" />
                              AI Conversational
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {formData.ivr_mode === 'dtmf' && (
                      <>
                        <div className="space-y-2">
                          <Label>IVR Prompt</Label>
                          <Textarea
                            value={formData.ivr_prompt}
                            onChange={(e) => setFormData({ ...formData, ivr_prompt: e.target.value })}
                            placeholder="Press 1 to speak with a representative..."
                            rows={2}
                          />
                        </div>

                        <div className="space-y-3">
                          <Label>DTMF Actions</Label>
                          {formData.dtmf_actions.map((action, index) => (
                            <div key={index} className="p-3 border rounded-lg space-y-2">
                              <div className="flex items-center gap-2">
                                <div className="w-16">
                                  <Input
                                    value={action.digit}
                                    onChange={(e) => updateDTMFAction(index, 'digit', e.target.value)}
                                    placeholder="#"
                                    maxLength={1}
                                  />
                                </div>
                                <Select
                                  value={action.action}
                                  onValueChange={(value) => updateDTMFAction(index, 'action', value)}
                                >
                                  <SelectTrigger className="w-40">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="transfer">Transfer</SelectItem>
                                    <SelectItem value="callback">Schedule Callback</SelectItem>
                                    <SelectItem value="dnc">Add to DNC</SelectItem>
                                    <SelectItem value="replay">Replay Message</SelectItem>
                                  </SelectContent>
                                </Select>
                                <Input
                                  value={action.label}
                                  onChange={(e) => updateDTMFAction(index, 'label', e.target.value)}
                                  placeholder="Button label"
                                  className="flex-1"
                                />
                              </div>
                              {action.action === 'transfer' && (
                                <div className="pl-16 space-y-2">
                                  <div>
                                    <Label className="text-xs text-muted-foreground mb-1 block">Transfer Destination Type</Label>
                                    <Select
                                      value={action.destination_type || 'retell'}
                                      onValueChange={(value) => updateDTMFAction(index, 'destination_type', value)}
                                    >
                                      <SelectTrigger className="w-full">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="retell">Retell AI (concurrency limited)</SelectItem>
                                        <SelectItem value="assistable">Assistable (high concurrency)</SelectItem>
                                        <SelectItem value="external">External/Human Team (no AI limit)</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div>
                                    <Label className="text-xs text-muted-foreground mb-1 block">Transfer To Number</Label>
                                    <Input
                                      value={action.transfer_to || ''}
                                      onChange={(e) => updateDTMFAction(index, 'transfer_to', e.target.value)}
                                      placeholder="e.g., +14695551234"
                                      className="w-full"
                                    />
                                  </div>
                                </div>
                              )}
                              {action.action === 'callback' && (
                                <div className="pl-16 space-y-3 mt-2">
                                  <div className="grid grid-cols-2 gap-3">
                                    <div>
                                      <Label className="text-xs text-muted-foreground mb-1 block">Callback Delay (hours)</Label>
                                      <Input
                                        type="number"
                                        value={action.delay_hours || 24}
                                        onChange={(e) => updateDTMFAction(index, 'delay_hours', parseInt(e.target.value) || 24)}
                                        min={1}
                                        max={168}
                                      />
                                    </div>
                                  </div>
                                  <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                                    <Label className="text-xs font-medium">Callback Automation</Label>
                                    <div className="flex items-center justify-between">
                                      <div>
                                        <Label className="text-xs">Add to Google Calendar</Label>
                                        <p className="text-[10px] text-muted-foreground">Create calendar event for callback</p>
                                      </div>
                                      <Switch
                                        checked={action.callback_options?.create_calendar_event ?? true}
                                        onCheckedChange={(checked) => {
                                          const newOptions = { ...(action.callback_options || {}), create_calendar_event: checked };
                                          updateDTMFAction(index, 'callback_options', newOptions);
                                        }}
                                      />
                                    </div>
                                    <div className="flex items-center justify-between">
                                      <div>
                                        <Label className="text-xs">Send SMS Reminder</Label>
                                        <p className="text-[10px] text-muted-foreground">Text reminder before callback</p>
                                      </div>
                                      <Switch
                                        checked={action.callback_options?.send_sms_reminder ?? true}
                                        onCheckedChange={(checked) => {
                                          const newOptions = { ...(action.callback_options || {}), send_sms_reminder: checked };
                                          updateDTMFAction(index, 'callback_options', newOptions);
                                        }}
                                      />
                                    </div>
                                    <div className="flex items-center justify-between">
                                      <div>
                                        <Label className="text-xs">Auto-Call at Scheduled Time</Label>
                                        <p className="text-[10px] text-muted-foreground">AI calls back automatically</p>
                                      </div>
                                      <Switch
                                        checked={action.callback_options?.auto_callback_call ?? false}
                                        onCheckedChange={(checked) => {
                                          const newOptions = { ...(action.callback_options || {}), auto_callback_call: checked };
                                          updateDTMFAction(index, 'callback_options', newOptions);
                                        }}
                                      />
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </>
                    )}

                    {formData.ivr_mode === 'ai_conversational' && (
                      <div className="space-y-2">
                        <Label>AI System Prompt</Label>
                        <Textarea
                          value={formData.ai_system_prompt}
                          onChange={(e) => setFormData({ ...formData, ai_system_prompt: e.target.value })}
                          placeholder="You are a friendly assistant..."
                          rows={4}
                        />
                        <p className="text-xs text-muted-foreground">
                          The AI will handle the conversation naturally based on this prompt
                        </p>
                      </div>
                    )}
                  </>
                )}
              </TabsContent>

              <TabsContent value="settings" className="space-y-4">
                {/* Dialer Features for Better Deliverability */}
                <Card className="border-green-500/30 bg-green-50/50 dark:bg-green-950/20">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Gauge className="h-4 w-4 text-green-600" />
                      Enhanced Deliverability (Recommended)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Use Dialer Features</Label>
                        <p className="text-xs text-muted-foreground">
                          Enable number rotation & local presence for better answer rates
                        </p>
                      </div>
                      <Switch
                        checked={formData.use_dialer_features}
                        onCheckedChange={(checked) => setFormData({ 
                          ...formData, 
                          use_dialer_features: checked,
                          enable_local_presence: checked,
                          enable_number_rotation: checked
                        })}
                      />
                    </div>
                    
                    {formData.use_dialer_features && (
                      <>
                        <div className="flex items-center justify-between pl-4 border-l-2 border-green-500/30">
                          <div>
                            <Label className="text-sm">Local Presence</Label>
                            <p className="text-xs text-muted-foreground">
                              Use numbers matching recipient's area code
                            </p>
                          </div>
                          <Switch
                            checked={formData.enable_local_presence}
                            onCheckedChange={(checked) => setFormData({ ...formData, enable_local_presence: checked })}
                          />
                        </div>
                        <div className="flex items-center justify-between pl-4 border-l-2 border-green-500/30">
                          <div>
                            <Label className="text-sm">Number Rotation</Label>
                            <p className="text-xs text-muted-foreground">
                              Rotate through numbers to avoid spam flagging
                            </p>
                          </div>
                          <Switch
                            checked={formData.enable_number_rotation}
                            onCheckedChange={(checked) => setFormData({ ...formData, enable_number_rotation: checked })}
                          />
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Calls Per Minute</Label>
                    <Input
                      type="number"
                      value={formData.calls_per_minute}
                      onChange={(e) => setFormData({ ...formData, calls_per_minute: parseInt(e.target.value) || 50 })}
                      min={1}
                      max={500}
                    />
                    <p className="text-xs text-muted-foreground">
                      {formData.use_dialer_features 
                        ? "Dialer will optimize pacing automatically" 
                        : "Fixed rate - consider enabling dialer features"}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Max Attempts</Label>
                    <Input
                      type="number"
                      value={formData.max_attempts}
                      onChange={(e) => setFormData({ ...formData, max_attempts: parseInt(e.target.value) || 1 })}
                      min={1}
                      max={5}
                    />
                  </div>
                </div>

                {/* Calling Window */}
                <Card className="border-border/60">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      Calling Hours
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Timezone</Label>
                      <Select
                        value={formData.timezone}
                        onValueChange={(value) => setFormData({ ...formData, timezone: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="America/New_York">America/New_York</SelectItem>
                          <SelectItem value="America/Chicago">America/Chicago</SelectItem>
                          <SelectItem value="America/Denver">America/Denver</SelectItem>
                          <SelectItem value="America/Los_Angeles">America/Los_Angeles</SelectItem>
                          <SelectItem value="UTC">UTC</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Start / End</Label>
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          type="time"
                          value={formData.calling_hours_start}
                          onChange={(e) => setFormData({ ...formData, calling_hours_start: e.target.value })}
                        />
                        <Input
                          type="time"
                          value={formData.calling_hours_end}
                          onChange={(e) => setFormData({ ...formData, calling_hours_end: e.target.value })}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Calls will only be attempted inside this window (in the selected timezone).
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Caller ID Selection */}
                <Card className="border-blue-500/30 bg-blue-50/50 dark:bg-blue-950/20">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Phone className="h-4 w-4 text-blue-600" />
                      Caller ID (From Number)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-2">
                      <Label>From Number</Label>
                      <Select
                        value={formData.caller_id || 'auto'}
                        onValueChange={(value) =>
                          setFormData({
                            ...formData,
                            caller_id: value === 'auto' ? '' : value,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Choose auto or a single number" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">Auto (use pool / rotate if enabled)</SelectItem>
                          {phoneNumbers
                            .filter(
                              (p) =>
                                !p.retell_phone_id &&
                                typeof p.number === 'string' &&
                                p.number.trim().length > 0
                            )
                            .map((phone) => (
                              <SelectItem key={phone.id} value={phone.number}>
                                {phone.friendly_name || phone.number}
                                {phone.purpose && ` (${phone.purpose})`}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        {formData.caller_id
                          ? 'Single number mode: rotation is off and all calls use this number.'
                          : 'Auto mode: the system chooses from your pool (may rotate numbers for deliverability).'}
                      </p>
                      {phoneNumbers.some(p => p.retell_phone_id) && (
                        <p className="text-xs text-amber-600">
                          ⚠️ Retell-registered numbers are hidden here (use them for AI calling, not broadcasts)
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={isLoading || !formData.name || !formData.message_text}>
                Create Broadcast
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Broadcasts List */}
      <div className="grid gap-4">
        {broadcasts.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Radio className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold">No Broadcasts Yet</h3>
              <p className="text-muted-foreground mb-4">
                Create your first voice broadcast campaign to get started
              </p>
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Broadcast
              </Button>
            </CardContent>
          </Card>
        ) : (
          broadcasts.map((broadcast) => {
            const broadcastStats = stats[broadcast.id] || {};
            // Calculate completed as: answered + transferred + callback + dnc + completed + failed
            const totalCompleted = (broadcastStats.answered || 0) + 
              (broadcastStats.transferred || 0) + 
              (broadcastStats.callback || 0) + 
              (broadcastStats.dnc || 0) + 
              (broadcastStats.completed || 0) + 
              (broadcastStats.failed || 0);
            const progress = broadcast.total_leads 
              ? Math.round((totalCompleted / broadcast.total_leads) * 100) 
              : 0;

            return (
              <Card key={broadcast.id}>
                <CardHeader className="pb-2">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-3">
                      <Badge className={getStatusColor(broadcast.status)}>
                        {broadcast.status}
                      </Badge>
                      <CardTitle className="text-lg">{broadcast.name}</CardTitle>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 justify-start sm:justify-end">
                      {broadcast.status === 'active' ? (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => stopBroadcast(broadcast.id)}
                            disabled={isLoading}
                          >
                            <Pause className="h-4 w-4 mr-1" />
                            Pause
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setEmergencyStopId(broadcast.id)}
                          >
                            <Square className="h-4 w-4 mr-1" />
                            STOP
                          </Button>
                        </>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          {/* Show "Add leads first" if no leads at all */}
                          {(broadcastStats.pending || 0) === 0 && (broadcast.total_leads || 0) === 0 && (
                            <Button
                              variant="link"
                              size="sm"
                              className="text-amber-600 hover:text-amber-700 p-0 h-auto"
                              onClick={() => setAddLeadsDialogBroadcastId(broadcast.id)}
                            >
                              Add leads first →
                            </Button>
                          )}
                          {/* Show "Reset & Run Again" if leads exist but none are pending (all completed) */}
                          {(broadcastStats.pending || 0) === 0 && (broadcast.total_leads || 0) > 0 && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => resetBroadcastQueue(broadcast.id)}
                              disabled={isLoading}
                              title="Reset all leads to pending and run broadcast again"
                            >
                              <RotateCcw className="h-4 w-4 mr-1" />
                              Reset & Run Again
                            </Button>
                          )}
                          {/* Test Batch Button */}
                          {(broadcastStats.pending || 0) > 0 && broadcast.audio_url && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={async () => {
                                setTestingBroadcastId(broadcast.id);
                                const result = await runTestBatch(broadcast.id, 10);
                                if (result.success) {
                                  toast({
                                    title: "Test Batch Started",
                                    description: result.message,
                                  });
                                } else {
                                  toast({
                                    title: "Test Failed",
                                    description: result.message,
                                    variant: "destructive",
                                  });
                                }
                                setTestingBroadcastId(null);
                              }}
                              disabled={isLoading || testingBroadcastId === broadcast.id}
                              title="Test with 10 calls before full launch"
                            >
                              {testingBroadcastId === broadcast.id ? (
                                <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                              ) : (
                                <TestTube className="h-4 w-4 mr-1" />
                              )}
                              Test 10
                            </Button>
                          )}
                          <Button
                            size="sm"
                            onClick={async () => {
                              // Run readiness check before starting
                              setStartingBroadcastId(broadcast.id);
                              const result = await checkBroadcastReadiness(broadcast.id);
                              setReadinessResults(prev => ({ ...prev, [broadcast.id]: result }));
                              if (result.isReady) {
                                // Cleanup stuck calls first
                                await cleanupStuckCalls(broadcast.id);
                                await startBroadcast(broadcast.id);
                              } else {
                                toast({
                                  title: "Broadcast Not Ready",
                                  description: result.blockingReasons.join(', '),
                                  variant: "destructive",
                                });
                              }
                              setStartingBroadcastId(null);
                            }}
                            disabled={isLoading || isCheckingReadiness || startingBroadcastId === broadcast.id || !broadcast.audio_url || (broadcastStats.pending || 0) === 0}
                            title={!broadcast.audio_url ? 'Generate audio first' : (broadcastStats.pending || 0) === 0 ? 'No pending leads - click Reset to run again' : 'Start broadcast'}
                          >
                            {startingBroadcastId === broadcast.id ? (
                              <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                              <Play className="h-4 w-4 mr-1" />
                            )}
                            {startingBroadcastId === broadcast.id ? 'Checking...' : 'Start'}
                          </Button>
                        </div>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleGenerateAudio(broadcast)}
                        disabled={isLoading}
                      >
                        <Volume2 className="h-4 w-4 mr-1" />
                        {broadcast.audio_url ? 'Regenerate' : 'Generate'} Audio
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setResultsDialogBroadcastId(broadcast.id);
                          loadQueueResults(broadcast.id);
                        }}
                        title="View Results"
                      >
                        <BarChart3 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedBroadcast(broadcast);
                          setSettingsTab('settings');
                        }}
                        aria-label="Broadcast settings"
                      >
                        <Settings className="h-4 w-4 mr-1" />
                        Settings
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteBroadcast(broadcast.id)}
                        className="text-destructive"
                        aria-label="Delete broadcast"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {broadcast.description && (
                    <CardDescription>{broadcast.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-6 gap-4 mb-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold">{broadcast.total_leads || 0}</div>
                      <div className="text-xs text-muted-foreground">Total Leads</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold">{broadcast.calls_made || 0}</div>
                      <div className="text-xs text-muted-foreground">Calls Made</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold">{broadcast.calls_answered || 0}</div>
                      <div className="text-xs text-muted-foreground">Answered</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">{broadcast.transfers_completed || 0}</div>
                      <div className="text-xs text-muted-foreground">Transfers</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">{broadcast.callbacks_scheduled || 0}</div>
                      <div className="text-xs text-muted-foreground">Callbacks</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-red-600">{broadcast.dnc_requests || 0}</div>
                      <div className="text-xs text-muted-foreground">DNC</div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>Progress</span>
                      <span>{progress}%</span>
                    </div>
                    <Progress value={progress} />
                  </div>

                  <div className="flex items-center gap-2 mt-4">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">
                        {broadcast.ivr_mode === 'ai_conversational' ? (
                          <><Bot className="h-3 w-3 mr-1" /> AI Mode</>
                        ) : (
                          <><Hash className="h-3 w-3 mr-1" /> DTMF</>
                        )}
                      </Badge>
                      <Badge variant="outline">
                        <Clock className="h-3 w-3 mr-1" />
                        {broadcast.calls_per_minute} CPM
                      </Badge>
                      {broadcast.audio_url && (
                        <Badge variant="outline" className="text-green-600">
                          <Volume2 className="h-3 w-3 mr-1" />
                          Audio Ready
                        </Badge>
                      )}
                    </div>
                    <div className="flex-1" />
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setQueueManagerBroadcastId(broadcast.id)}
                    >
                      <Users className="h-4 w-4 mr-1" />
                      Leads ({broadcast.total_leads || 0})
                    </Button>
                  </div>

                  {/* Error Banner */}
                  {(broadcast as any).last_error && (
                    <div className="mt-3 p-2 bg-destructive/10 border border-destructive/20 rounded-md flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                      <div className="text-xs">
                        <span className="font-medium text-destructive">Last Error: </span>
                        <span className="text-destructive/80">{(broadcast as any).last_error}</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Queue Manager Sheet */}
      {queueManagerBroadcastId && (
        <BroadcastQueueManager
          broadcastId={queueManagerBroadcastId}
          broadcastName={broadcasts.find(b => b.id === queueManagerBroadcastId)?.name || ''}
          isOpen={!!queueManagerBroadcastId}
          onClose={() => setQueueManagerBroadcastId(null)}
          onQueueUpdated={loadBroadcasts}
        />
      )}

      {/* Add Leads Dialog - Controlled */}
      <Dialog 
        open={addLeadsDialogBroadcastId !== null} 
        onOpenChange={(open) => {
          if (!open) {
            setAddLeadsDialogBroadcastId(null);
            setSelectedLeads([]);
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Leads to Broadcast</DialogTitle>
            <DialogDescription>
              Select leads to add to this broadcast queue
            </DialogDescription>
          </DialogHeader>
          
          {leads.length === 0 ? (
            <div className="py-12 text-center">
              <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium mb-2">No leads found</p>
              <p className="text-muted-foreground mb-4">
                Upload leads first, then come back to add them to this broadcast.
              </p>
              <Button 
                variant="outline"
                onClick={() => window.location.href = '/?tab=leads'}
              >
                Go to Leads → Upload
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedLeads(leads.map(l => l.id))}
                >
                  Select All ({leads.length})
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedLeads([])}
                  disabled={selectedLeads.length === 0}
                >
                  Clear
                </Button>
                <span className="text-sm text-muted-foreground ml-auto">
                  {selectedLeads.length} of {leads.length} selected
                </span>
              </div>
              <div className="max-h-[350px] overflow-y-auto border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <input
                          type="checkbox"
                          checked={selectedLeads.length === leads.length && leads.length > 0}
                          onChange={(e) => {
                            setSelectedLeads(e.target.checked ? leads.map(l => l.id) : []);
                          }}
                        />
                      </TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leads.map((lead) => (
                      <TableRow key={lead.id}>
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={selectedLeads.includes(lead.id)}
                            onChange={(e) => {
                              setSelectedLeads(e.target.checked
                                ? [...selectedLeads, lead.id]
                                : selectedLeads.filter(id => id !== lead.id)
                              );
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          {[lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Unknown'}
                        </TableCell>
                        <TableCell>{lead.phone_number}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{lead.status}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex justify-end mt-4">
                <Button 
                  onClick={() => {
                    if (addLeadsDialogBroadcastId) {
                      handleAddLeads(addLeadsDialogBroadcastId);
                      setAddLeadsDialogBroadcastId(null);
                    }
                  }}
                  disabled={selectedLeads.length === 0 || isLoading}
                >
                  Add {selectedLeads.length} Leads to Queue
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog 
        open={selectedBroadcast !== null} 
        onOpenChange={(open) => {
          if (!open) setSelectedBroadcast(null);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Broadcast Settings: {selectedBroadcast?.name}
            </DialogTitle>
            <DialogDescription>
              Configure voice, transfer number, and other broadcast settings
            </DialogDescription>
          </DialogHeader>
          
          {selectedBroadcast && (
            <div className="space-y-6 mt-4">
              {/* Voice Settings */}
              <div className="space-y-4">
                <h3 className="font-semibold flex items-center gap-2">
                  <Mic className="h-4 w-4 text-purple-500" />
                  Voice Settings
                </h3>
                <div className="space-y-2">
                  <Label>Voice</Label>
                  <Select
                    value={selectedBroadcast.voice_id || 'TX3LPaxmHKxFdv7VOQHJ'}
                    onValueChange={async (value) => {
                      await updateBroadcast(selectedBroadcast.id, { voice_id: value });
                      setSelectedBroadcast({ ...selectedBroadcast, voice_id: value });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ELEVENLABS_VOICES.map((voice) => (
                        <SelectItem key={voice.id} value={voice.id}>
                          {voice.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Voice Speed */}
                <div className="space-y-2">
                  <Label>Voice Speed: {((selectedBroadcast as any).voice_speed || 1.0).toFixed(2)}x</Label>
                  <Slider
                    defaultValue={[(selectedBroadcast as any).voice_speed || 1.0]}
                    min={0.5}
                    max={1.5}
                    step={0.05}
                    onValueCommit={async (values) => {
                      await updateBroadcast(selectedBroadcast.id, { voice_speed: values[0] } as any);
                      setSelectedBroadcast({ ...selectedBroadcast, voice_speed: values[0] } as any);
                    }}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Slower (0.5x)</span>
                    <span>Normal (1.0x)</span>
                    <span>Faster (1.5x)</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Adjust how fast the AI voice speaks. Regenerate audio after changing.
                  </p>
                </div>
              </div>

              {/* Transfer Settings */}
              <div className="space-y-4">
                <h3 className="font-semibold flex items-center gap-2">
                  <PhoneForwarded className="h-4 w-4 text-blue-500" />
                  Transfer Settings (Press 1)
                </h3>
                <div className="space-y-2">
                  <Label>Transfer To Number</Label>
                  <Input
                    defaultValue={
                      parseDTMFActions(selectedBroadcast.dtmf_actions as any)
                        .find(a => a.digit === '1' && a.action === 'transfer')?.transfer_to || ''
                    }
                    placeholder="e.g., +14695551234 (your AI agent or call center)"
                    onBlur={async (e) => {
                      const currentActions = parseDTMFActions(selectedBroadcast.dtmf_actions as any);
                      const updatedActions = currentActions.map(a => 
                        a.digit === '1' && a.action === 'transfer' 
                          ? { ...a, transfer_to: e.target.value }
                          : a
                      );
                      await updateBroadcast(selectedBroadcast.id, { dtmf_actions: updatedActions });
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    When a recipient presses 1, they will be transferred to this number (Retell AI agent, call center, etc.)
                  </p>
                </div>
              </div>

              {/* Calling Settings */}
              <div className="space-y-4">
                <h3 className="font-semibold flex items-center gap-2">
                  <Gauge className="h-4 w-4 text-green-500" />
                  Calling Settings
                </h3>

                {/* Calling Hours */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Timezone</Label>
                    <Select
                      value={selectedBroadcast.timezone || 'America/New_York'}
                      onValueChange={async (value) => {
                        await updateBroadcast(selectedBroadcast.id, { timezone: value } as any);
                        setSelectedBroadcast({ ...selectedBroadcast, timezone: value } as any);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="America/New_York">America/New_York</SelectItem>
                        <SelectItem value="America/Chicago">America/Chicago</SelectItem>
                        <SelectItem value="America/Denver">America/Denver</SelectItem>
                        <SelectItem value="America/Los_Angeles">America/Los_Angeles</SelectItem>
                        <SelectItem value="UTC">UTC</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Calling Hours (Start / End)</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        type="time"
                        defaultValue={((selectedBroadcast.calling_hours_start as any) || '09:00').slice(0, 5)}
                        onBlur={async (e) => {
                          const value = e.target.value;
                          if (!value) return;
                          await updateBroadcast(selectedBroadcast.id, { calling_hours_start: value } as any);
                          setSelectedBroadcast({ ...selectedBroadcast, calling_hours_start: value } as any);
                        }}
                      />
                      <Input
                        type="time"
                        defaultValue={((selectedBroadcast.calling_hours_end as any) || '17:00').slice(0, 5)}
                        onBlur={async (e) => {
                          const value = e.target.value;
                          if (!value) return;
                          await updateBroadcast(selectedBroadcast.id, { calling_hours_end: value } as any);
                          setSelectedBroadcast({ ...selectedBroadcast, calling_hours_end: value } as any);
                        }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Calls will only be attempted inside this window (in the selected timezone).
                    </p>
                  </div>
                </div>

                {/* Bypass Calling Hours Toggle */}
                <div className="flex items-center justify-between p-3 rounded-lg border border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20">
                  <div>
                    <Label className="text-sm font-medium">Bypass Calling Hours</Label>
                    <p className="text-xs text-muted-foreground">
                      Allow calls to run outside the configured calling hours window
                    </p>
                  </div>
                  <Switch
                    checked={(selectedBroadcast as any).bypass_calling_hours || false}
                    onCheckedChange={async (checked) => {
                      await updateBroadcast(selectedBroadcast.id, { bypass_calling_hours: checked } as any);
                      setSelectedBroadcast({ ...selectedBroadcast, bypass_calling_hours: checked } as any);
                    }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Calls Per Minute: {selectedBroadcast.calls_per_minute || 50}</Label>
                    <Slider
                      defaultValue={[selectedBroadcast.calls_per_minute || 50]}
                      min={1}
                      max={200}
                      step={5}
                      onValueCommit={async (values) => {
                        await updateBroadcast(selectedBroadcast.id, {
                          calls_per_minute: values[0]
                        });
                        setSelectedBroadcast({ ...selectedBroadcast, calls_per_minute: values[0] });
                      }}
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>1</span>
                      <span>100</span>
                      <span>200</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Max Attempts per Lead</Label>
                    <Input
                      type="number"
                      defaultValue={selectedBroadcast.max_attempts || 1}
                      onBlur={async (e) => {
                        await updateBroadcast(selectedBroadcast.id, {
                          max_attempts: parseInt(e.target.value) || 1
                        });
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Caller ID (From Number) */}
              <div className="space-y-4">
                <h3 className="font-semibold flex items-center gap-2">
                  <Phone className="h-4 w-4 text-blue-500" />
                  Caller ID
                </h3>

                <div className="space-y-2">
                  <Label>From Number</Label>
                  <Select
                    value={selectedBroadcast.caller_id || 'auto'}
                    onValueChange={async (value) => {
                      const callerId = value === 'auto' ? null : value;
                      await updateBroadcast(selectedBroadcast.id, { caller_id: callerId });
                      setSelectedBroadcast({ ...selectedBroadcast, caller_id: callerId });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose auto or a single number" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto (use pool / rotate if enabled)</SelectItem>
                      {phoneNumbers
                        .filter(
                          (p) =>
                            !p.retell_phone_id &&
                            typeof p.number === 'string' &&
                            p.number.trim().length > 0
                        )
                        .map((phone) => (
                          <SelectItem key={phone.id} value={phone.number}>
                            {phone.friendly_name || phone.number}
                            {phone.purpose && ` (${phone.purpose})`}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>

                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      {selectedBroadcast.caller_id
                        ? 'Single number mode: rotation is off and all calls use this number.'
                        : 'Auto mode: the system chooses from your pool (may rotate numbers for deliverability).'}
                    </p>
                    <Button asChild variant="outline" size="sm">
                      <a href="/?tab=overview#phone-numbers" target="_blank" rel="noreferrer">
                        Manage numbers
                      </a>
                    </Button>
                  </div>
                </div>
              </div>

              {/* Message Preview */}
              <div className="space-y-4">
                <h3 className="font-semibold flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-orange-500" />
                  Message
                </h3>
                <div className="p-4 bg-muted/50 rounded-lg">
                  <p className="text-sm">{selectedBroadcast.message_text}</p>
                  {selectedBroadcast.ivr_enabled && selectedBroadcast.ivr_prompt && (
                    <p className="text-sm text-muted-foreground mt-2 italic">
                      {selectedBroadcast.ivr_prompt}
                    </p>
                  )}
                </div>
                {selectedBroadcast.audio_url && (
                  <div className="flex items-center gap-2">
                    <Volume2 className="h-4 w-4 text-green-500" />
                    <span className="text-sm text-green-600">Audio generated</span>
                    <audio controls src={selectedBroadcast.audio_url} className="h-8 flex-1" />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button 
                  variant="outline" 
                  onClick={() => setSelectedBroadcast(null)}
                >
                  Close
                </Button>
                <Button
                  variant="outline"
                  onClick={() => resetBroadcastQueue(selectedBroadcast.id)}
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Reset Queue
                </Button>
                <Button 
                  onClick={() => {
                    handleGenerateAudio(selectedBroadcast);
                    setSelectedBroadcast(null);
                  }}
                >
                  <Volume2 className="h-4 w-4 mr-2" />
                  Regenerate Audio
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Results Dialog */}
      <Dialog 
        open={resultsDialogBroadcastId !== null} 
        onOpenChange={(open) => {
          if (!open) {
            setResultsDialogBroadcastId(null);
            setQueueResults([]);
          }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Broadcast Results: {broadcasts.find(b => b.id === resultsDialogBroadcastId)?.name || 'Unknown'}
            </DialogTitle>
            <DialogDescription>
              View detailed results for each lead in this broadcast campaign
            </DialogDescription>
          </DialogHeader>
          
          {loadingResults ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : queueResults.length === 0 ? (
            <div className="py-12 text-center">
              <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No results yet. Start the broadcast to see results here.</p>
            </div>
          ) : (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-5 gap-3 mb-4">
                <Card className="p-3 text-center">
                  <div className="text-xl font-bold">{queueResults.length}</div>
                  <div className="text-xs text-muted-foreground">Total</div>
                </Card>
                <Card className="p-3 text-center">
                  <div className="text-xl font-bold text-green-600">
                    {queueResults.filter(r => r.status === 'transferred').length}
                  </div>
                  <div className="text-xs text-muted-foreground">Transferred</div>
                </Card>
                <Card className="p-3 text-center">
                  <div className="text-xl font-bold text-blue-600">
                    {queueResults.filter(r => r.status === 'callback').length}
                  </div>
                  <div className="text-xs text-muted-foreground">Callbacks</div>
                </Card>
                <Card className="p-3 text-center">
                  <div className="text-xl font-bold text-red-600">
                    {queueResults.filter(r => r.status === 'dnc').length}
                  </div>
                  <div className="text-xs text-muted-foreground">DNC</div>
                </Card>
                <Card className="p-3 text-center">
                  <div className="text-xl font-bold text-muted-foreground">
                    {queueResults.filter(r => r.status === 'pending').length}
                  </div>
                  <div className="text-xs text-muted-foreground">Pending</div>
                </Card>
              </div>

              {/* Results Table */}
              <div className="max-h-[400px] overflow-y-auto border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Lead</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>DTMF</TableHead>
                      <TableHead>Updated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {queueResults.map((result) => (
                      <TableRow key={result.id}>
                        <TableCell>
                          {result.lead?.first_name || result.lead_name || 'Unknown'} {result.lead?.last_name || ''}
                        </TableCell>
                        <TableCell className="font-mono text-sm">{result.phone_number}</TableCell>
                        <TableCell>
                          <Badge 
                            variant="outline"
                            className={
                              result.status === 'transferred' ? 'bg-green-100 text-green-800 border-green-300' :
                              result.status === 'callback' ? 'bg-blue-100 text-blue-800 border-blue-300' :
                              result.status === 'dnc' ? 'bg-red-100 text-red-800 border-red-300' :
                              result.status === 'answered' ? 'bg-purple-100 text-purple-800 border-purple-300' :
                              result.status === 'completed' ? 'bg-gray-100 text-gray-800 border-gray-300' :
                              result.status === 'failed' ? 'bg-orange-100 text-orange-800 border-orange-300' :
                              ''
                            }
                          >
                            {result.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {result.dtmf_pressed ? (
                            <Badge variant="secondary">
                              Pressed {result.dtmf_pressed}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {result.updated_at ? new Date(result.updated_at).toLocaleString() : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Emergency Stop Confirmation Dialog */}
      <AlertDialog open={emergencyStopId !== null} onOpenChange={(open) => !open && setEmergencyStopId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Emergency Stop Confirmation
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will immediately stop all active calls and pause the campaign. 
              Calls currently in progress may be disconnected. Are you sure you want to proceed?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (emergencyStopId) {
                  const result = await emergencyStop(emergencyStopId);
                  if (result.success) {
                    toast({
                      title: "Emergency Stop Executed",
                      description: "All calls have been stopped",
                    });
                    loadBroadcasts();
                  } else {
                    toast({
                      title: "Stop Failed",
                      description: result.message,
                      variant: "destructive",
                    });
                  }
                }
                setEmergencyStopId(null);
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Yes, Stop All Calls
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Refresh Button */}
      <div className="flex justify-center">
        <Button variant="outline" onClick={loadBroadcasts} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>
    </div>
  );
};

export default VoiceBroadcastManager;
