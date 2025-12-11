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
import { supabase } from '@/integrations/supabase/client';
import { 
  Radio, Play, Pause, Plus, Trash2, Volume2, Users, 
  Phone, PhoneOff, Clock, Settings, BarChart3, 
  MessageSquare, Bot, Hash, RefreshCw
} from 'lucide-react';
import QuickTestBroadcast from '@/components/QuickTestBroadcast';

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
  { digit: '2', action: 'callback', delay_hours: 24, label: 'Schedule Callback' },
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
    startBroadcast,
    stopBroadcast,
    getBroadcastStats,
  } = useVoiceBroadcast();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedBroadcast, setSelectedBroadcast] = useState<VoiceBroadcast | null>(null);
  const [leads, setLeads] = useState<any[]>([]);
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [stats, setStats] = useState<Record<string, any>>({});

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
  });

  useEffect(() => {
    loadBroadcasts();
    loadLeads();
  }, []);

  useEffect(() => {
    // Load stats for each broadcast
    broadcasts.forEach(async (b) => {
      const s = await getBroadcastStats(b.id);
      if (s) {
        setStats(prev => ({ ...prev, [b.id]: s }));
      }
    });
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
                            <div key={index} className="flex items-center gap-2 p-3 border rounded-lg">
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
            const progress = broadcast.total_leads 
              ? Math.round(((broadcastStats.completed || 0) / broadcast.total_leads) * 100) 
              : 0;

            return (
              <Card key={broadcast.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Badge className={getStatusColor(broadcast.status)}>
                        {broadcast.status}
                      </Badge>
                      <CardTitle className="text-lg">{broadcast.name}</CardTitle>
                    </div>
                    <div className="flex items-center gap-2">
                      {broadcast.status === 'active' ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => stopBroadcast(broadcast.id)}
                          disabled={isLoading}
                        >
                          <Pause className="h-4 w-4 mr-1" />
                          Pause
                        </Button>
                      ) : (
                        <div className="flex items-center gap-2">
                          {(broadcastStats.pending || 0) === 0 && (broadcast.total_leads || 0) === 0 && (
                            <span className="text-xs text-amber-600 mr-1">Add leads first →</span>
                          )}
                          <Button
                            size="sm"
                            onClick={() => startBroadcast(broadcast.id)}
                            disabled={isLoading || !broadcast.audio_url || ((broadcastStats.pending || 0) === 0 && (broadcast.total_leads || 0) === 0)}
                            title={!broadcast.audio_url ? 'Generate audio first' : ((broadcastStats.pending || 0) === 0 && (broadcast.total_leads || 0) === 0) ? 'Add leads to the broadcast first' : 'Start broadcast'}
                          >
                            <Play className="h-4 w-4 mr-1" />
                            Start
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
                        onClick={() => setSelectedBroadcast(broadcast)}
                      >
                        <Settings className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteBroadcast(broadcast.id)}
                        className="text-destructive"
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
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Users className="h-4 w-4 mr-1" />
                          Add Leads
                        </Button>
                      </DialogTrigger>
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
                                onClick={() => handleAddLeads(broadcast.id)}
                                disabled={selectedLeads.length === 0 || isLoading}
                              >
                                Add {selectedLeads.length} Leads to Queue
                              </Button>
                            </div>
                          </>
                        )}
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

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
