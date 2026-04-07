import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Rocket, ChevronRight, ChevronLeft, Check, Loader2, Phone,
  Target, Users, TrendingUp, MessageSquare, ArrowRight, Sparkles, Plus,
  Bot, Zap, Globe, Split, AlertCircle, Info, Upload, RefreshCw, Tag, FileSpreadsheet,
  TestTube, PhoneCall, CheckCircle2, XCircle, Pencil, Clock, Eye
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAIBrainContext } from '@/contexts/AIBrainContext';
import { toast } from 'sonner';

// ── Types ──────────────────────────────────────────────────────────────

type PlatformId = 'retell' | 'telnyx' | 'assistable';

interface PlatformConfig {
  enabled: boolean;
  agentId: string;
  trafficPct: number;
}

interface LeadImportConfig {
  method: 'csv' | 'ghl' | 'both' | 'skip';
  csvFile: File | null;
  csvPreviewCount: number;
  ghlTagFilter: string;
  ghlSyncAll: boolean;
  campaignTag: string;
  autoTag: boolean;
}

type DispositionAction = 'move_pipeline' | 'stop_calling' | 'schedule_callback' | 'send_sms' | 'transfer_live' | 'add_to_dnc' | 'do_nothing';

interface EventHandlingConfig {
  appointmentBooked: DispositionAction[];
  transferSuccess: DispositionAction[];
  interested: DispositionAction[];
  notInterested: DispositionAction[];
  voicemail: DispositionAction[];
  callbackRequested: DispositionAction[];
  wrongNumber: DispositionAction[];
  doNotCall: DispositionAction[];
}

type CampaignPriority = 'speed' | 'quality' | 'volume' | 'cost' | 'custom';
type GoalType = 'appointments' | 'qualify' | 'callbacks' | 'transfers' | 'custom';
type FollowUpStrategy = 'aggressive' | 'balanced' | 'gentle' | 'calls_only' | 'sms_only' | 'custom';
type TransferType = 'warm' | 'cold';

interface WizardData {
  businessDescription: string;
  goalType: GoalType;
  customGoalText: string;
  dailyTarget: number;
  maxCostPerResult: number;
  startingLeads: number;
  rampUpTarget: number;
  dailyCalls: number;
  rampUpBehavior: 'conservative' | 'moderate' | 'aggressive';
  followUpStrategy: FollowUpStrategy;
  customStrategyText: string;
  splitTest: boolean;
  platforms: Record<PlatformId, PlatformConfig>;
  assistableWebhookUrl: string;
  assistableAssistantId: string;
  assistableLocationId: string;
  assistableNumberPoolId: string;
  leadImport: LeadImportConfig;
  campaignPriority: CampaignPriority;
  customPriorityText: string;
  eventHandling: EventHandlingConfig;
  transferPhoneNumber: string;
  transferType: TransferType;
  transferTrigger: string;
  callingHoursStart: string;
  callingHoursEnd: string;
  timezone: string;
  bypassCallingHours: boolean;
  workflowSteps: WorkflowStep[];
}

interface WorkflowStep {
  id: string;
  type: 'call' | 'sms' | 'ai_sms' | 'wait';
  label: string;
  enabled: boolean;
  waitHours?: number;
}

interface AgentOption {
  id: string;
  name: string;
  platform: PlatformId;
}

interface CreatedResource {
  type: string;
  name: string;
  id: string;
  tab: string;
}

// ── Constants ──────────────────────────────────────────────────────────

const INITIAL_LEAD_IMPORT: LeadImportConfig = {
  method: 'csv',
  csvFile: null,
  csvPreviewCount: 0,
  ghlTagFilter: '',
  ghlSyncAll: false,
  campaignTag: '',
  autoTag: true,
};

const DEFAULT_EVENT_HANDLING: EventHandlingConfig = {
  appointmentBooked: ['move_pipeline', 'stop_calling', 'send_sms'],
  transferSuccess: ['move_pipeline', 'stop_calling'],
  interested: ['move_pipeline', 'send_sms'],
  notInterested: ['stop_calling', 'move_pipeline'],
  voicemail: ['send_sms'],
  callbackRequested: ['schedule_callback', 'move_pipeline'],
  wrongNumber: ['stop_calling', 'move_pipeline'],
  doNotCall: ['add_to_dnc', 'stop_calling'],
};

const INITIAL_DATA: WizardData = {
  businessDescription: '',
  goalType: 'appointments',
  customGoalText: '',
  dailyTarget: 10,
  maxCostPerResult: 20,
  startingLeads: 500,
  rampUpTarget: 5000,
  dailyCalls: 200,
  rampUpBehavior: 'moderate',
  followUpStrategy: 'balanced',
  customStrategyText: '',
  splitTest: false,
  platforms: {
    retell: { enabled: true, agentId: '', trafficPct: 100 },
    telnyx: { enabled: false, agentId: '', trafficPct: 0 },
    assistable: { enabled: false, agentId: '', trafficPct: 0 },
  },
  assistableWebhookUrl: '',
  assistableAssistantId: '',
  assistableLocationId: '',
  assistableNumberPoolId: '',
  leadImport: { ...INITIAL_LEAD_IMPORT },
  campaignPriority: 'quality',
  customPriorityText: '',
  eventHandling: { ...DEFAULT_EVENT_HANDLING },
  transferPhoneNumber: '',
  transferType: 'warm',
  transferTrigger: '',
  callingHoursStart: '09:00',
  callingHoursEnd: '21:00',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York',
  bypassCallingHours: false,
  workflowSteps: [],
};

const GOAL_LABELS: Record<string, string> = {
  appointments: 'Book appointments / meetings',
  qualify: 'Collect info / qualify leads',
  callbacks: 'Drive to landing page / generate callbacks',
  transfers: 'Live transfers to sales agents',
  custom: 'Other (describe below)',
};

const RAMP_LABELS: Record<string, { label: string; desc: string }> = {
  conservative: { label: 'Conservative', desc: '+20%/day when results are good' },
  moderate: { label: 'Moderate', desc: '+50%/day as results come in' },
  aggressive: { label: 'Aggressive', desc: 'Double daily until target hit' },
};

const STRATEGY_LABELS: Record<string, { label: string; desc: string }> = {
  aggressive: { label: 'Aggressive', desc: 'Call fast, follow up hard — calls + texts' },
  balanced: { label: 'Balanced', desc: 'Professional cadence, calls + texts' },
  gentle: { label: 'Gentle', desc: 'Spaced out, relationship-building — calls + texts' },
  calls_only: { label: 'Calls Only', desc: 'No SMS — just call-wait-call-wait' },
  sms_only: { label: 'SMS Only', desc: 'Text-based outreach only — no calls' },
  custom: { label: 'Custom', desc: 'Describe your ideal cadence below' },
};

const DEFAULT_PIPELINE_STAGES: Record<string, string[]> = {
  appointments: ['New Lead', 'Contacted', 'Interested', 'Appointment Set', 'Completed'],
  qualify: ['New Lead', 'Contacted', 'Qualified', 'Sent to Team', 'Closed'],
  callbacks: ['New Lead', 'Contacted', 'Callback Requested', 'Converted', 'Closed'],
  transfers: ['New Lead', 'Contacted', 'Interested', 'Transferred', 'Sale Closed', 'Completed'],
  custom: ['New Lead', 'Contacted', 'In Progress', 'Completed'],
};

const PLATFORM_META: Record<PlatformId, { label: string; icon: React.ReactNode; color: string }> = {
  retell: { label: 'Retell AI', icon: <Bot className="h-4 w-4" />, color: 'text-blue-600' },
  telnyx: { label: 'Telnyx', icon: <Zap className="h-4 w-4" />, color: 'text-emerald-600' },
  assistable: { label: 'Assistable', icon: <Globe className="h-4 w-4" />, color: 'text-purple-600' },
};

const PRIORITY_OPTIONS: Record<CampaignPriority, { label: string; desc: string }> = {
  speed: { label: 'Speed to Contact', desc: 'Reach every lead ASAP — fastest response wins' },
  quality: { label: 'Conversation Quality', desc: 'Longer, better conversations that convert' },
  volume: { label: 'Maximum Volume', desc: 'Blast through the list — quantity over depth' },
  cost: { label: 'Cost Efficiency', desc: 'Minimize spend per result, optimize ROI' },
  custom: { label: 'Other', desc: 'Describe your priority below' },
};

const EVENT_LABELS: Record<keyof EventHandlingConfig, { label: string; icon: string; desc: string }> = {
  appointmentBooked: { label: 'Appointment Booked', icon: '📅', desc: 'Lead agrees to a meeting' },
  transferSuccess: { label: 'Successful Transfer', icon: '📲', desc: 'Call transferred to a live agent' },
  interested: { label: 'Interested', icon: '🔥', desc: 'Shows buying intent but no appointment yet' },
  notInterested: { label: 'Not Interested', icon: '❌', desc: 'Declines or says no' },
  voicemail: { label: 'Voicemail', icon: '📞', desc: 'Reached answering machine' },
  callbackRequested: { label: 'Callback Requested', icon: '🔁', desc: 'Asked to be called back later' },
  wrongNumber: { label: 'Wrong Number', icon: '🚫', desc: 'Number is invalid or wrong person' },
  doNotCall: { label: 'Do Not Call', icon: '🛑', desc: 'Explicitly asked to stop contact' },
};

const ACTION_OPTIONS: { value: DispositionAction; label: string }[] = [
  { value: 'move_pipeline', label: 'Move to pipeline stage' },
  { value: 'stop_calling', label: 'Stop all outreach' },
  { value: 'schedule_callback', label: 'Schedule callback' },
  { value: 'send_sms', label: 'Send follow-up SMS' },
  { value: 'transfer_live', label: 'Transfer to live agent' },
  { value: 'add_to_dnc', label: 'Add to Do Not Call list' },
  { value: 'do_nothing', label: 'No action (log only)' },
];

const TIMEZONE_OPTIONS = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Phoenix', 'America/Anchorage', 'Pacific/Honolulu', 'America/Puerto_Rico',
];

// Generate default workflow steps based on strategy
function generateWorkflowSteps(strategy: FollowUpStrategy): WorkflowStep[] {
  const id = () => Math.random().toString(36).slice(2, 8);
  switch (strategy) {
    case 'aggressive':
      return [
        { id: id(), type: 'call', label: 'Initial Call', enabled: true },
        { id: id(), type: 'wait', label: 'Wait 5 min', enabled: true, waitHours: 0.08 },
        { id: id(), type: 'sms', label: 'Follow-up SMS', enabled: true },
        { id: id(), type: 'wait', label: 'Wait 30 min', enabled: true, waitHours: 0.5 },
        { id: id(), type: 'call', label: 'Second Call', enabled: true },
        { id: id(), type: 'wait', label: 'Wait 2 hours', enabled: true, waitHours: 2 },
        { id: id(), type: 'call', label: 'Third Call', enabled: true },
        { id: id(), type: 'wait', label: 'Wait 1 day', enabled: true, waitHours: 24 },
        { id: id(), type: 'ai_sms', label: 'AI Follow-up SMS', enabled: true },
      ];
    case 'balanced':
      return [
        { id: id(), type: 'call', label: 'Initial Call', enabled: true },
        { id: id(), type: 'wait', label: 'Wait 2 min', enabled: true, waitHours: 0.03 },
        { id: id(), type: 'sms', label: 'Intro SMS', enabled: true },
        { id: id(), type: 'wait', label: 'Wait 4 hours', enabled: true, waitHours: 4 },
        { id: id(), type: 'call', label: 'Second Call', enabled: true },
        { id: id(), type: 'wait', label: 'Wait 1 day', enabled: true, waitHours: 24 },
        { id: id(), type: 'call', label: 'Third Call', enabled: true },
        { id: id(), type: 'wait', label: 'Wait 2 days', enabled: true, waitHours: 48 },
        { id: id(), type: 'ai_sms', label: 'Value SMS', enabled: true },
      ];
    case 'gentle':
      return [
        { id: id(), type: 'call', label: 'Initial Call', enabled: true },
        { id: id(), type: 'wait', label: 'Wait 1 day', enabled: true, waitHours: 24 },
        { id: id(), type: 'sms', label: 'Friendly SMS', enabled: true },
        { id: id(), type: 'wait', label: 'Wait 3 days', enabled: true, waitHours: 72 },
        { id: id(), type: 'call', label: 'Second Call', enabled: true },
        { id: id(), type: 'wait', label: 'Wait 1 week', enabled: true, waitHours: 168 },
        { id: id(), type: 'ai_sms', label: 'Check-in SMS', enabled: true },
      ];
    case 'calls_only':
      return [
        { id: id(), type: 'call', label: 'First Call', enabled: true },
        { id: id(), type: 'wait', label: 'Wait 30 min', enabled: true, waitHours: 0.5 },
        { id: id(), type: 'call', label: 'Second Call', enabled: true },
        { id: id(), type: 'wait', label: 'Wait 4 hours', enabled: true, waitHours: 4 },
        { id: id(), type: 'call', label: 'Third Call', enabled: true },
        { id: id(), type: 'wait', label: 'Wait 1 day', enabled: true, waitHours: 24 },
        { id: id(), type: 'call', label: 'Final Call', enabled: true },
      ];
    case 'sms_only':
      return [
        { id: id(), type: 'sms', label: 'Intro Text', enabled: true },
        { id: id(), type: 'wait', label: 'Wait 4 hours', enabled: true, waitHours: 4 },
        { id: id(), type: 'ai_sms', label: 'AI Follow-up', enabled: true },
        { id: id(), type: 'wait', label: 'Wait 1 day', enabled: true, waitHours: 24 },
        { id: id(), type: 'sms', label: 'Value Text', enabled: true },
        { id: id(), type: 'wait', label: 'Wait 3 days', enabled: true, waitHours: 72 },
        { id: id(), type: 'ai_sms', label: 'Final Text', enabled: true },
      ];
    case 'custom':
      return [
        { id: id(), type: 'call', label: 'Step 1', enabled: true },
        { id: id(), type: 'wait', label: 'Wait', enabled: true, waitHours: 1 },
        { id: id(), type: 'sms', label: 'Step 2', enabled: true },
      ];
    default:
      return [];
  }
}

const STEP_TYPE_ICONS: Record<string, string> = {
  call: '📞',
  sms: '💬',
  ai_sms: '🤖',
  wait: '⏳',
};

// ── Component ──────────────────────────────────────────────────────────

const MissionBriefingWizard: React.FC = () => {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<WizardData>(INITIAL_DATA);
  const [isBuilding, setIsBuilding] = useState(false);
  const [buildComplete, setBuildComplete] = useState(false);
  const [currentNumbers, setCurrentNumbers] = useState(0);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [csvParsing, setCsvParsing] = useState(false);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [ghlSyncing, setGhlSyncing] = useState(false);
  const [testPhoneNumber, setTestPhoneNumber] = useState('');
  const [isTestCalling, setIsTestCalling] = useState(false);
  const [testCallResult, setTestCallResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testCallCount, setTestCallCount] = useState(0);
  const [customPipelineStages, setCustomPipelineStages] = useState<string[]>([]);
  const [newStageName, setNewStageName] = useState('');
  const [buyingNumbers, setBuyingNumbers] = useState(false);
  const [buyAreaCode, setBuyAreaCode] = useState('');
  const [buyQuantity, setBuyQuantity] = useState(5);
  const [buyProvider, setBuyProvider] = useState<'retell' | 'telnyx'>('retell');
  const [createdResources, setCreatedResources] = useState<CreatedResource[]>([]);
  const [loadingResources, setLoadingResources] = useState(false);
  const [returnToReview, setReturnToReview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { sendMessage } = useAIBrainContext();

  useEffect(() => {
    (async () => {
      const { count } = await supabase
        .from('phone_numbers')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');
      setCurrentNumbers(count ?? 0);
    })();

    (async () => {
      setLoadingAgents(true);
      const agentList: AgentOption[] = [];
      try {
        const { data: retellData } = await supabase
          .from('campaigns')
          .select('agent_id')
          .not('agent_id', 'is', null);
        const uniqueRetellIds = [...new Set((retellData || []).map(c => c.agent_id).filter(Boolean))];
        uniqueRetellIds.forEach(id => {
          agentList.push({ id: id!, name: `Retell Agent (${id!.slice(-8)})`, platform: 'retell' });
        });
      } catch { /* non-critical */ }
      try {
        const { data: telnyxData } = await (supabase as any)
          .from('telnyx_assistants')
          .select('id, name, telnyx_assistant_id')
          .eq('status', 'active');
        (telnyxData || []).forEach((a: any) => {
          agentList.push({ id: a.telnyx_assistant_id || a.id, name: a.name || 'Telnyx Assistant', platform: 'telnyx' });
        });
      } catch { /* table may not exist */ }
      setAgents(agentList);
      setLoadingAgents(false);
    })();
  }, []);

  // Auto-generate campaign tag from business description
  useEffect(() => {
    if (data.leadImport.autoTag && data.businessDescription.trim().length > 3) {
      const words = data.businessDescription.trim().toLowerCase().split(/\s+/).slice(0, 3);
      const tag = `campaign_${words.join('_').replace(/[^a-z0-9_]/g, '')}_${Date.now().toString(36).slice(-4)}`;
      updateLeadImport({ campaignTag: tag });
    }
  }, [data.businessDescription, data.leadImport.autoTag]);

  // Generate workflow steps when strategy changes
  useEffect(() => {
    setData(prev => ({ ...prev, workflowSteps: generateWorkflowSteps(prev.followUpStrategy) }));
  }, [data.followUpStrategy]);

  const numbersNeeded = useMemo(() => Math.ceil(data.dailyCalls / 80), [data.dailyCalls]);
  const deficit = useMemo(() => Math.max(0, numbersNeeded - currentNumbers), [numbersNeeded, currentNumbers]);

  const pipelineStages = useMemo(() => {
    if (customPipelineStages.length > 0) return customPipelineStages;
    return DEFAULT_PIPELINE_STAGES[data.goalType] || DEFAULT_PIPELINE_STAGES.appointments;
  }, [customPipelineStages, data.goalType]);

  useEffect(() => {
    setCustomPipelineStages([]);
  }, [data.goalType]);

  const enabledPlatforms = useMemo(() =>
    (Object.entries(data.platforms) as [PlatformId, PlatformConfig][]).filter(([, c]) => c.enabled),
    [data.platforms]
  );

  // Steps: 0=desc, 1=goal, 2=leads, 3=import, 4=calls+hours, 5=agents, 6=followup, 7=workflow preview, 8=priorities+events, 9=review+test
  const totalSteps = 10;
  const progressPct = ((step + 1) / totalSteps) * 100;

  const needsTransferConfig = data.goalType === 'transfers' || data.eventHandling.transferSuccess.includes('transfer_live');

  const STEP_NAMES: Record<number, string> = {
    0: 'Business Description',
    1: 'Campaign Goal',
    2: 'Leads & Numbers',
    3: 'Lead Import',
    4: 'Daily Calls & Hours',
    5: 'AI Agents',
    6: 'Follow-up Strategy',
    7: 'Workflow Preview',
    8: 'Priorities & Events',
    9: 'Review & Build',
  };

  const canAdvance = () => {
    if (step === 0) return data.businessDescription.trim().length > 10;
    if (step === 1) {
      if (data.goalType === 'custom') return data.customGoalText.trim().length > 5;
      return true;
    }
    if (step === 3) {
      const m = data.leadImport.method;
      if (m === 'skip') return true;
      if (m === 'csv') return data.leadImport.csvFile !== null;
      if (m === 'ghl') return true;
      if (m === 'both') return data.leadImport.csvFile !== null;
      return true;
    }
    if (step === 5) {
      return enabledPlatforms.length > 0 && enabledPlatforms.every(([pid, cfg]) => {
        if (pid === 'assistable') return data.assistableAssistantId.trim().length > 3 && data.assistableLocationId.trim().length > 3;
        return cfg.agentId.length > 0;
      });
    }
    if (step === 6) {
      if (data.followUpStrategy === 'custom') return data.customStrategyText.trim().length > 5;
      return true;
    }
    return true;
  };

  const update = (partial: Partial<WizardData>) => setData(prev => ({ ...prev, ...partial }));
  const updateLeadImport = (partial: Partial<LeadImportConfig>) =>
    setData(prev => ({ ...prev, leadImport: { ...prev.leadImport, ...partial } }));

  const toggleEventAction = (event: keyof EventHandlingConfig, action: DispositionAction) => {
    setData(prev => {
      const current = prev.eventHandling[event];
      const next = current.includes(action) ? current.filter(a => a !== action) : [...current, action];
      return { ...prev, eventHandling: { ...prev.eventHandling, [event]: next } };
    });
  };

  const updatePlatform = (pid: PlatformId, partial: Partial<PlatformConfig>) => {
    setData(prev => ({
      ...prev,
      platforms: { ...prev.platforms, [pid]: { ...prev.platforms[pid], ...partial } },
    }));
  };

  const togglePlatform = (pid: PlatformId, enabled: boolean) => {
    setData(prev => {
      const next = { ...prev.platforms, [pid]: { ...prev.platforms[pid], enabled } };
      const active = (Object.entries(next) as [PlatformId, PlatformConfig][]).filter(([, c]) => c.enabled);
      const share = active.length > 0 ? Math.floor(100 / active.length) : 0;
      let remainder = 100 - share * active.length;
      for (const [key, cfg] of Object.entries(next) as [PlatformId, PlatformConfig][]) {
        if (cfg.enabled) {
          next[key] = { ...cfg, trafficPct: share + (remainder > 0 ? 1 : 0) };
          if (remainder > 0) remainder--;
        } else {
          next[key] = { ...cfg, trafficPct: 0 };
        }
      }
      return { ...prev, platforms: next, splitTest: active.length > 1 };
    });
  };

  const handleNextStep = () => {
    if (returnToReview) {
      setReturnToReview(false);
      setStep(9); // go back to review
    } else {
      setStep(s => s + 1);
    }
  };

  const jumpToStep = (targetStep: number) => {
    setReturnToReview(true);
    setStep(targetStep);
  };

  const retellAgents = useMemo(() => agents.filter(a => a.platform === 'retell'), [agents]);
  const telnyxAgents = useMemo(() => agents.filter(a => a.platform === 'telnyx'), [agents]);

  // ── CSV parsing ─────────────────────────────────────────────────────

  const handleCsvSelect = async (file: File) => {
    setCsvParsing(true);
    updateLeadImport({ csvFile: file });
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(l => l.trim());
      const rows = lines.slice(0, 6).map(l => l.split(',').map(c => c.trim().replace(/^"|"$/g, '')));
      setCsvRows(rows);
      updateLeadImport({ csvPreviewCount: Math.max(0, lines.length - 1) });
    } catch {
      toast.error('Failed to parse CSV');
    } finally {
      setCsvParsing(false);
    }
  };

  // ── GHL sync trigger ───────────────────────────────────────────────

  const handleGhlSync = async () => {
    setGhlSyncing(true);
    try {
      const { data: result, error } = await supabase.functions.invoke('ghl-integration', {
        body: {
          action: 'sync_contacts',
          tags: data.leadImport.ghlTagFilter ? [data.leadImport.ghlTagFilter] : undefined,
          campaignTag: data.leadImport.campaignTag || undefined,
        },
      });
      if (error) throw error;
      const count = result?.imported || result?.total || 0;
      toast.success(`Synced ${count} leads from GoHighLevel`);
      update({ startingLeads: count });
    } catch (err: any) {
      toast.error(err.message || 'GHL sync failed');
    } finally {
      setGhlSyncing(false);
    }
  };

  // ── Test Call ──────────────────────────────────────────────────────────

  const handleTestCall = async () => {
    if (!testPhoneNumber.trim()) {
      toast.error('Enter your phone number to test');
      return;
    }

    setIsTestCalling(true);
    setTestCallResult(null);

    try {
      const primary = enabledPlatforms[0];
      if (!primary) throw new Error('No platform configured');

      const [pid, cfg] = primary;

      if (pid === 'telnyx') {
        const { data: result, error } = await supabase.functions.invoke('telnyx-ai-assistant', {
          body: { action: 'test_call', assistantId: cfg.agentId, toNumber: testPhoneNumber.trim(), isTestMode: true },
        });
        if (error) throw error;
        if (result?.error) throw new Error(result.error);
        setTestCallResult({ success: true, message: `Telnyx test call initiated to ${testPhoneNumber}` });
      } else if (pid === 'assistable') {
        const { data: result, error } = await supabase.functions.invoke('assistable-make-call', {
          body: {
            assistant_id: data.assistableAssistantId,
            location_id: data.assistableLocationId,
            number_pool_id: data.assistableNumberPoolId || undefined,
            phone_number: testPhoneNumber.trim(),
            is_test: true,
          },
        });
        if (error) throw error;
        if (result?.error) throw new Error(result.error);
        setTestCallResult({ success: true, message: `Assistable test call initiated to ${testPhoneNumber}` });
      } else {
        let callerId = '';
        try {
          const { data: numbers } = await supabase
            .from('phone_numbers')
            .select('number')
            .eq('status', 'active')
            .limit(1);
          callerId = numbers?.[0]?.number || '';
        } catch { /* will fail gracefully below */ }

        if (!callerId) {
          throw new Error('No active phone numbers found. Please purchase numbers first.');
        }

        const { data: result, error } = await supabase.functions.invoke('outbound-calling', {
          body: {
            action: 'create_call',
            agentId: cfg.agentId,
            phoneNumber: testPhoneNumber.trim(),
            callerId,
            isTestCall: true,
            skipDncCheck: true,
            skipCreditCheck: true,
          },
        });
        if (error) throw error;
        if (result?.error) throw new Error(result.error);
        setTestCallResult({ success: true, message: `Retell test call initiated to ${testPhoneNumber}` });
      }

      setTestCallCount(prev => prev + 1);
      toast.success('Test call initiated! Check your phone.');
    } catch (err: any) {
      const msg = err.message || 'Test call failed';
      setTestCallResult({ success: false, message: msg });
      toast.error(msg);
    } finally {
      setIsTestCalling(false);
    }
  };

  // ── Post-build: fetch created resources ──────────────────────────────

  const fetchCreatedResources = async () => {
    setLoadingResources(true);
    const resources: CreatedResource[] = [];
    try {
      // Get latest campaign
      const { data: campaigns } = await supabase
        .from('campaigns')
        .select('id, name, status')
        .order('created_at', { ascending: false })
        .limit(1);
      if (campaigns?.[0]) {
        resources.push({ type: 'Campaign', name: campaigns[0].name, id: campaigns[0].id, tab: 'campaigns' });
      }

      // Get latest workflow
      const { data: workflows } = await supabase
        .from('campaign_workflows')
        .select('id, name')
        .order('created_at', { ascending: false })
        .limit(1);
      if (workflows?.[0]) {
        resources.push({ type: 'Workflow', name: workflows[0].name, id: workflows[0].id, tab: 'workflows' });
      }

      // Get latest pipeline
      const { data: pipelines } = await (supabase as any)
        .from('pipeline_boards')
        .select('id, name')
        .order('created_at', { ascending: false })
        .limit(1);
      if (pipelines?.[0]) {
        resources.push({ type: 'Pipeline', name: pipelines[0].name, id: pipelines[0].id, tab: 'pipelines' });
      }
    } catch { /* non-critical */ }
    setCreatedResources(resources);
    setLoadingResources(false);
  };

  // ── Build prompt ──────────────────────────────────────────────────────

  const handleBuild = async () => {
    setIsBuilding(true);
    try {
      // If CSV was selected, upload leads first
      if ((data.leadImport.method === 'csv' || data.leadImport.method === 'both') && data.leadImport.csvFile) {
        toast.info('Uploading CSV leads…');
        const formData = new FormData();
        formData.append('file', data.leadImport.csvFile);
        if (data.leadImport.campaignTag) {
          formData.append('campaignTag', data.leadImport.campaignTag);
        }
        const { error: uploadErr } = await supabase.functions.invoke('lead-csv-import', { body: formData });
        if (uploadErr) {
          toast.error('CSV upload failed: ' + uploadErr.message);
        } else {
          toast.success(`CSV uploaded with tag: ${data.leadImport.campaignTag}`);
        }
      }

      if ((data.leadImport.method === 'ghl' || data.leadImport.method === 'both') && !ghlSyncing) {
        await handleGhlSync();
      }

      const enableSms = data.followUpStrategy !== 'calls_only';
      const enableCalls = data.followUpStrategy !== 'sms_only';
      const platformLines = enabledPlatforms.map(([pid, cfg]) => {
        const meta = PLATFORM_META[pid];
        if (pid === 'assistable') {
          return `- ${meta.label}: ${cfg.trafficPct}% traffic, assistant_id: ${data.assistableAssistantId}, location_id: ${data.assistableLocationId}${data.assistableNumberPoolId ? `, number_pool_id: ${data.assistableNumberPoolId}` : ''}${data.assistableWebhookUrl ? `, extraction webhook: ${data.assistableWebhookUrl}` : ''}`;
        }
        return `- ${meta.label}: ${cfg.trafficPct}% traffic, agent ID: ${cfg.agentId}`;
      });

      const activeSteps = data.workflowSteps.filter(s => s.enabled);
      const workflowDesc = activeSteps.length > 0
        ? `Workflow sequence (user-configured): ${activeSteps.map(s => `${s.type}${s.waitHours ? ` (${s.waitHours}h)` : ''}`).join(' → ')}`
        : '';

      const goalLabel = data.goalType === 'custom' ? data.customGoalText : GOAL_LABELS[data.goalType];
      const strategyLabel = data.followUpStrategy === 'custom' ? data.customStrategyText : STRATEGY_LABELS[data.followUpStrategy].label;
      const priorityLabel = data.campaignPriority === 'custom' ? data.customPriorityText : PRIORITY_OPTIONS[data.campaignPriority].label;

      const prompt = [
        `BUILD A CAMPAIGN FROM THIS MISSION BRIEFING:`,
        ``,
        `Business: ${data.businessDescription}`,
        `Goal: ${goalLabel}`,
        `Daily target: ${data.dailyTarget} results/day`,
        `Max cost per result: $${data.maxCostPerResult}`,
        `Starting leads: ${data.startingLeads}, ramping to ${data.rampUpTarget}`,
        `Daily calls to start: ${data.dailyCalls}`,
        `Ramp-up: ${RAMP_LABELS[data.rampUpBehavior].label} (${RAMP_LABELS[data.rampUpBehavior].desc})`,
        `Follow-up strategy: ${strategyLabel}`,
        `Enable SMS: ${enableSms}`,
        `Enable Calls: ${enableCalls}`,
        ``,
        `CALLING HOURS: ${data.callingHoursStart} to ${data.callingHoursEnd} (${data.timezone})${data.bypassCallingHours ? ' [BYPASS FOR TESTING]' : ''}`,
        ``,
        `LEAD IMPORT:`,
        `Campaign tag: ${data.leadImport.campaignTag || 'none'}`,
        `Import method: ${data.leadImport.method}`,
        data.leadImport.method !== 'skip' ? `Use campaign tag "${data.leadImport.campaignTag}" to filter leads.` : '',
        ``,
        `PLATFORMS (${data.splitTest ? 'SPLIT TEST' : 'SINGLE'}):`,
        ...platformLines,
        data.splitTest ? `Split traffic across platforms for volume diversification and A/B comparison.` : '',
        ``,
        needsTransferConfig ? [
          `TRANSFER CONFIGURATION:`,
          `Transfer number: ${data.transferPhoneNumber}`,
          `Transfer type: ${data.transferType === 'warm' ? 'Warm (AI stays on line)' : 'Cold (AI disconnects)'}`,
          data.transferTrigger ? `Transfer trigger: ${data.transferTrigger}` : '',
          `Include transfer instructions in the agent prompt. The AI should transfer calls to ${data.transferPhoneNumber} when the lead shows interest.`,
        ].filter(Boolean).join('\n') : '',
        ``,
        `CAMPAIGN PRIORITY: ${priorityLabel}`,
        ``,
        workflowDesc,
        ``,
        `EVENT HANDLING (disposition automation rules):`,
        ...Object.entries(data.eventHandling).map(([event, actions]) => {
          const eventLabel = EVENT_LABELS[event as keyof EventHandlingConfig]?.label || event;
          const actionLabels = (actions as DispositionAction[]).map(a => ACTION_OPTIONS.find(o => o.value === a)?.label || a);
          return `- ${eventLabel}: ${actionLabels.join(', ') || 'No action'}`;
        }),
        `Create disposition automation rules in the disposition-router for each of these events.`,
        ``,
        `Pipeline stages to create: ${pipelineStages.join(' → ')}`,
        `Create pipeline boards for each stage and link dispositions to the appropriate stages.`,
        ``,
        enableSms && enableCalls
          ? `Use a mix of call and SMS steps in the workflow.`
          : enableSms
            ? `Use SMS steps only in the workflow. No calls.`
            : `Only use call and wait steps in the workflow. No SMS at all.`,
        data.platforms.assistable.enabled
          ? `Include an assistable_call workflow step for Assistable using assistant_id: ${data.assistableAssistantId}, location_id: ${data.assistableLocationId}${data.assistableNumberPoolId ? `, number_pool_id: ${data.assistableNumberPoolId}` : ''}.`
          : '',
        ``,
        `Set autonomous settings: daily_goal_calls=${data.dailyCalls}, daily_goal_appointments=${data.dailyTarget}.`,
        `Set calling_hours_start='${data.callingHoursStart}', calling_hours_end='${data.callingHoursEnd}', timezone='${data.timezone}'.`,
        `Enable lead journeys, calling time optimization, and adaptive pacing.`,
        `Create this campaign now using setup_full_campaign.`,
      ].filter(Boolean).join('\n');

      await sendMessage(prompt);
      setBuildComplete(true);
      toast.success('Campaign build initiated! Check the AI chat for progress.');

      // Fetch created resources after a delay
      setTimeout(fetchCreatedResources, 5000);
    } catch (err) {
      toast.error('Failed to start campaign build. Please try again.');
      console.error('Mission briefing build error:', err);
    } finally {
      setIsBuilding(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────

  if (buildComplete) {
    return (
      <div className="space-y-6">
        {/* Success header */}
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center">
                <Rocket className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-lg font-bold text-foreground">🎉 Mission Launched!</p>
                <p className="text-sm text-muted-foreground">
                  The AI is building your campaign. Resources will appear below as they're created.
                </p>
              </div>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
              <div className="rounded-lg border bg-background p-3 text-center">
                <p className="text-2xl font-bold text-primary">{data.dailyCalls}</p>
                <p className="text-xs text-muted-foreground">Daily Calls</p>
              </div>
              <div className="rounded-lg border bg-background p-3 text-center">
                <p className="text-2xl font-bold text-primary">{data.dailyTarget}</p>
                <p className="text-xs text-muted-foreground">Daily {GOAL_LABELS[data.goalType]?.split(' ')[0] || 'Results'} Goal</p>
              </div>
              <div className="rounded-lg border bg-background p-3 text-center">
                <p className="text-lg font-bold text-primary">{STRATEGY_LABELS[data.followUpStrategy]?.label || data.customStrategyText.slice(0, 20)}</p>
                <p className="text-xs text-muted-foreground">Strategy</p>
              </div>
            </div>

            {/* Created resources with edit links */}
            {createdResources.length > 0 && (
              <div className="space-y-2 mb-4">
                <p className="text-sm font-semibold text-foreground">✅ Created Resources</p>
                {createdResources.map(r => (
                  <div key={r.id} className="flex items-center justify-between p-2 rounded-lg border bg-background">
                    <div>
                      <p className="text-sm font-medium">{r.type}: {r.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{r.id.slice(0, 12)}…</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        window.location.href = `/?tab=${r.tab}`;
                      }}
                    >
                      <Pencil className="h-3 w-3 mr-1" /> Edit
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {loadingResources && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading created resources…
              </div>
            )}

            {!loadingResources && createdResources.length === 0 && (
              <Button variant="outline" size="sm" onClick={fetchCreatedResources} className="mb-4">
                <RefreshCw className="h-3 w-3 mr-1" /> Check for created resources
              </Button>
            )}

            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
              💡 <strong>Tip:</strong> Open the <strong>AI Assistant chat</strong> (bottom-right bubble) to watch the build in real-time.
            </div>
          </CardContent>
        </Card>

        {/* Quick nav */}
        <div>
          <p className="text-sm font-semibold text-foreground mb-3">📍 Where to Go Next</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {[
              { label: 'Campaigns', tab: 'campaigns', icon: '📋', desc: 'View & manage your campaign' },
              { label: 'Pipelines', tab: 'pipelines', icon: '🔀', desc: 'Check pipeline stages' },
              { label: 'Workflows', tab: 'workflows', icon: '⚡', desc: 'Review the call/SMS sequence' },
              { label: 'Autonomous Agent', tab: 'autonomous-agent', icon: '🤖', desc: 'Goals & engine settings' },
              { label: 'SMS', tab: 'sms-conversations', icon: '💬', desc: 'Monitor AI SMS threads' },
              { label: 'Analytics', tab: 'analytics', icon: '📊', desc: 'Track performance' },
            ].map(item => (
              <button
                key={item.tab}
                onClick={() => { window.location.href = `/?tab=${item.tab}`; }}
                className="flex items-center gap-3 rounded-lg border bg-background p-3 text-left hover:bg-accent/50 transition-colors"
              >
                <span className="text-xl">{item.icon}</span>
                <div>
                  <p className="text-sm font-medium text-foreground">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={() => { setBuildComplete(false); setStep(0); setData(INITIAL_DATA); setCsvRows([]); setCustomPipelineStages([]); setCreatedResources([]); }}>
            <Plus className="h-4 w-4 mr-1" /> Create Another Mission
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Card className="border-primary/30 relative z-0 overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Mission Briefing</CardTitle>
          </div>
          <Badge variant="secondary" className="text-xs">
            Step {step + 1} of {totalSteps}
          </Badge>
        </div>
        <Progress value={progressPct} className="h-1.5 mt-2" />
        {returnToReview && (
          <p className="text-xs text-primary mt-1">
            Editing — press Next to return to Review
          </p>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* ── Step 0: Business Description ── */}
        {step === 0 && (
          <div className="space-y-3">
            <Label className="text-base font-semibold">What are you selling?</Label>
            <Textarea
              value={data.businessDescription}
              onChange={e => update({ businessDescription: e.target.value })}
              placeholder="e.g. Solar panel installations for homeowners in Florida. We offer free consultations and financing options."
              className="min-h-[100px] resize-none"
            />
            <p className="text-xs text-muted-foreground">
              Describe your business, product, or service in plain English. The AI uses this to craft your campaign script and strategy.
            </p>
          </div>
        )}

        {/* ── Step 1: Goal ── */}
        {step === 1 && (
          <div className="space-y-4">
            <Label className="text-base font-semibold">What's your goal?</Label>
            <RadioGroup value={data.goalType} onValueChange={(v) => update({ goalType: v as GoalType })}>
              {Object.entries(GOAL_LABELS).map(([key, label]) => (
                <div key={key} className="flex items-center space-x-2 p-3 rounded-lg border hover:bg-accent/50 transition-colors">
                  <RadioGroupItem value={key} id={`goal-${key}`} />
                  <Label htmlFor={`goal-${key}`} className="cursor-pointer flex-1">{label}</Label>
                </div>
              ))}
            </RadioGroup>
            {data.goalType === 'custom' && (
              <Textarea
                value={data.customGoalText}
                onChange={e => update({ customGoalText: e.target.value })}
                placeholder="Describe your campaign goal in detail…"
                className="min-h-[60px] resize-none"
              />
            )}

            {/* Transfer config shows when goal is transfers */}
            {(data.goalType === 'transfers') && (
              <div className="p-4 rounded-lg border border-primary/30 bg-primary/5 space-y-3">
                <Label className="text-sm font-semibold flex items-center gap-2">
                  📲 Transfer Configuration
                </Label>
                <div>
                  <Label className="text-sm">Transfer Phone Number <span className="text-destructive">*</span></Label>
                  <Input
                    placeholder="+1 (555) 123-4567"
                    value={data.transferPhoneNumber}
                    onChange={e => update({ transferPhoneNumber: e.target.value })}
                    className="mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">The number your AI will transfer interested leads to</p>
                </div>
                <div>
                  <Label className="text-sm">Transfer Type</Label>
                  <RadioGroup value={data.transferType} onValueChange={(v) => update({ transferType: v as TransferType })} className="mt-1">
                    <div className="flex items-center space-x-2 p-2 rounded border hover:bg-accent/50">
                      <RadioGroupItem value="warm" id="transfer-warm" />
                      <Label htmlFor="transfer-warm" className="cursor-pointer flex-1">
                        <span className="font-medium">Warm Transfer</span>
                        <span className="text-muted-foreground text-sm ml-2">— AI stays on and introduces the lead</span>
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2 p-2 rounded border hover:bg-accent/50">
                      <RadioGroupItem value="cold" id="transfer-cold" />
                      <Label htmlFor="transfer-cold" className="cursor-pointer flex-1">
                        <span className="font-medium">Cold Transfer</span>
                        <span className="text-muted-foreground text-sm ml-2">— AI disconnects after connecting</span>
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
                <div>
                  <Label className="text-sm">Transfer Trigger <span className="text-muted-foreground">(optional)</span></Label>
                  <Input
                    placeholder="e.g. When lead says they're interested in a quote"
                    value={data.transferTrigger}
                    onChange={e => update({ transferTrigger: e.target.value })}
                    className="mt-1"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <Label className="text-sm">Daily target</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Input type="number" value={data.dailyTarget} onChange={e => update({ dailyTarget: parseInt(e.target.value) || 1 })} min={1} max={500} className="w-24" />
                  <span className="text-sm text-muted-foreground">results/day</span>
                </div>
              </div>
              <div>
                <Label className="text-sm">Max cost per result</Label>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-muted-foreground">$</span>
                  <Input type="number" value={data.maxCostPerResult} onChange={e => update({ maxCostPerResult: parseInt(e.target.value) || 1 })} min={1} max={500} className="w-24" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 2: Leads & Phone Numbers ── */}
        {step === 2 && (
          <div className="space-y-4">
            <Label className="text-base font-semibold">How many leads are you starting with?</Label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm">Starting leads</Label>
                <Input type="number" value={data.startingLeads} onChange={e => update({ startingLeads: parseInt(e.target.value) || 100 })} min={10} className="mt-1" />
              </div>
              <div>
                <Label className="text-sm">Ramp-up target</Label>
                <Input type="number" value={data.rampUpTarget} onChange={e => update({ rampUpTarget: parseInt(e.target.value) || 500 })} min={100} className="mt-1" />
                <p className="text-xs text-muted-foreground mt-1">Where you want to be in 2 weeks</p>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-accent/30 border space-y-1">
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm">Phone Number Recommendation</span>
              </div>
              <p className="text-sm text-muted-foreground">
                For <strong>{data.dailyCalls}</strong> calls/day you'll need ~<strong>{numbersNeeded}</strong> numbers.
                You currently have <strong>{currentNumbers}</strong>.
                {deficit > 0 && (
                  <span className="text-destructive font-medium"> Need {deficit} more.</span>
                )}
              </p>

              {deficit > 0 && (
                <div className="mt-3 p-3 rounded border bg-background space-y-2">
                  <Label className="text-xs font-semibold">Buy Numbers Now</Label>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Select value={buyProvider} onValueChange={(v) => setBuyProvider(v as 'retell' | 'telnyx')}>
                      <SelectTrigger className="w-28 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="retell">Retell</SelectItem>
                        <SelectItem value="telnyx">Telnyx</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      placeholder="Area code"
                      value={buyAreaCode}
                      onChange={e => setBuyAreaCode(e.target.value)}
                      className="w-24 h-8 text-xs"
                    />
                    <Input
                      type="number"
                      value={buyQuantity}
                      onChange={e => setBuyQuantity(parseInt(e.target.value) || 1)}
                      min={1}
                      max={50}
                      className="w-16 h-8 text-xs"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      disabled={buyingNumbers}
                      onClick={async () => {
                        setBuyingNumbers(true);
                        try {
                          const { data: result, error } = await supabase.functions.invoke('phone-number-purchasing', {
                            body: { provider: buyProvider, areaCode: buyAreaCode || undefined, quantity: buyQuantity },
                          });
                          if (error) throw error;
                          const purchased = result?.purchased || result?.count || buyQuantity;
                          toast.success(`Purchased ${purchased} numbers!`);
                          setCurrentNumbers(prev => prev + purchased);
                        } catch (err: any) {
                          toast.error(err.message || 'Failed to buy numbers');
                        } finally {
                          setBuyingNumbers(false);
                        }
                      }}
                    >
                      {buyingNumbers ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Buy'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Step 3: Lead Import ── */}
        {step === 3 && (
          <div className="space-y-4">
            <Label className="text-base font-semibold">How do you want to import leads?</Label>
            <RadioGroup value={data.leadImport.method} onValueChange={(v) => updateLeadImport({ method: v as LeadImportConfig['method'] })}>
              {[
                { key: 'csv', label: 'Upload CSV', icon: <FileSpreadsheet className="h-4 w-4" /> },
                { key: 'ghl', label: 'Sync from GoHighLevel', icon: <RefreshCw className="h-4 w-4" /> },
                { key: 'both', label: 'CSV + GHL', icon: <Plus className="h-4 w-4" /> },
                { key: 'skip', label: 'Skip — I already have leads in the system', icon: <Check className="h-4 w-4" /> },
              ].map(({ key, label, icon }) => (
                <div key={key} className="flex items-center space-x-2 p-3 rounded-lg border hover:bg-accent/50 transition-colors">
                  <RadioGroupItem value={key} id={`import-${key}`} />
                  <Label htmlFor={`import-${key}`} className="cursor-pointer flex-1 flex items-center gap-2">
                    {icon} {label}
                  </Label>
                </div>
              ))}
            </RadioGroup>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={e => e.target.files?.[0] && handleCsvSelect(e.target.files[0])}
            />

            {/* CSV upload section */}
            {(data.leadImport.method === 'csv' || data.leadImport.method === 'both') && (
              <div className="p-4 rounded-lg border space-y-3">
                <Label className="text-sm font-semibold">CSV File</Label>
                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={csvParsing} className="w-full">
                  {csvParsing ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Parsing…</>
                  ) : data.leadImport.csvFile ? (
                    <><Check className="h-4 w-4 mr-2 text-primary" /> {data.leadImport.csvFile.name}</>
                  ) : (
                    <><Upload className="h-4 w-4 mr-2" /> Choose CSV file</>
                  )}
                </Button>

                {csvRows.length > 0 && (
                  <div className="overflow-x-auto max-h-32">
                    <table className="text-xs w-full">
                      <thead>
                        <tr className="border-b">
                          {csvRows[0].map((h, i) => (
                            <th key={i} className="text-left p-1 font-semibold text-muted-foreground">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {csvRows.slice(1, 4).map((row, ri) => (
                          <tr key={ri} className="border-b border-border/50">
                            {row.map((cell, ci) => (
                              <td key={ci} className="p-1 truncate max-w-[120px]">{cell}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Expected columns: first_name, last_name, phone_number, email, company, address, city, state, zip_code
                </p>
              </div>
            )}

            {/* GHL sync section */}
            {(data.leadImport.method === 'ghl' || data.leadImport.method === 'both') && (
              <div className="p-4 rounded-lg border space-y-3">
                <Label className="text-sm font-semibold">GoHighLevel Sync</Label>
                <div>
                  <Label className="text-xs text-muted-foreground">Filter by GHL tag (optional)</Label>
                  <Input
                    placeholder="e.g. solar_leads, florida_homeowners"
                    value={data.leadImport.ghlTagFilter}
                    onChange={e => updateLeadImport({ ghlTagFilter: e.target.value })}
                    className="mt-1 text-sm"
                  />
                </div>
                <Button variant="outline" size="sm" onClick={handleGhlSync} disabled={ghlSyncing} className="w-full">
                  {ghlSyncing ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Syncing…</>
                  ) : (
                    <><RefreshCw className="h-4 w-4 mr-2" /> Sync Now</>
                  )}
                </Button>
              </div>
            )}

            {/* Campaign tagging */}
            {data.leadImport.method !== 'skip' && (
              <div className="p-4 rounded-lg border border-primary/30 bg-primary/5 space-y-3">
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4 text-primary" />
                  <Label className="text-sm font-semibold">Campaign Tag</Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  All imported leads will be tagged with this identifier for isolated analytics.
                </p>
                <div className="flex items-center gap-2">
                  <Input
                    value={data.leadImport.campaignTag}
                    onChange={e => updateLeadImport({ campaignTag: e.target.value, autoTag: false })}
                    placeholder="solar_fl_apr2026"
                    className="text-sm font-mono"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      updateLeadImport({ autoTag: true });
                      const words = data.businessDescription.trim().toLowerCase().split(/\s+/).slice(0, 3);
                      const tag = `campaign_${words.join('_').replace(/[^a-z0-9_]/g, '')}_${Date.now().toString(36).slice(-4)}`;
                      updateLeadImport({ campaignTag: tag });
                    }}
                  >
                    <RefreshCw className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Step 4: Daily Calls, Ramp-up & Calling Hours ── */}
        {step === 4 && (
          <div className="space-y-4">
            <Label className="text-base font-semibold">How many calls per day to start?</Label>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Daily calls</span>
                <span className="font-semibold text-primary">{data.dailyCalls}</span>
              </div>
              <Slider
                value={[data.dailyCalls]}
                onValueChange={([v]) => update({ dailyCalls: v })}
                min={50}
                max={5000}
                step={50}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>50</span><span>5,000</span>
              </div>
            </div>

            <Label className="text-base font-semibold pt-2">How should we ramp up?</Label>
            <RadioGroup value={data.rampUpBehavior} onValueChange={(v) => update({ rampUpBehavior: v as WizardData['rampUpBehavior'] })}>
              {Object.entries(RAMP_LABELS).map(([key, { label, desc }]) => (
                <div key={key} className="flex items-center space-x-2 p-3 rounded-lg border hover:bg-accent/50 transition-colors">
                  <RadioGroupItem value={key} id={`ramp-${key}`} />
                  <Label htmlFor={`ramp-${key}`} className="cursor-pointer flex-1">
                    <span className="font-medium">{label}</span>
                    <span className="text-muted-foreground text-sm ml-2">— {desc}</span>
                  </Label>
                </div>
              ))}
            </RadioGroup>

            {/* Calling Hours & Timezone */}
            <div className="p-4 rounded-lg border bg-accent/10 space-y-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                <Label className="text-sm font-semibold">Calling Hours & Timezone</Label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Start time</Label>
                  <Input type="time" value={data.callingHoursStart} onChange={e => update({ callingHoursStart: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">End time</Label>
                  <Input type="time" value={data.callingHoursEnd} onChange={e => update({ callingHoursEnd: e.target.value })} className="mt-1" />
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Timezone</Label>
                <Select value={data.timezone} onValueChange={v => update({ timezone: v })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONE_OPTIONS.map(tz => (
                      <SelectItem key={tz} value={tz}>{tz.replace('America/', '').replace('Pacific/', '').replace(/_/g, ' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={data.bypassCallingHours} onCheckedChange={v => update({ bypassCallingHours: v })} />
                <Label className="text-xs text-muted-foreground">Bypass calling hours for testing</Label>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 5: Agent & Platform Setup ── */}
        {step === 5 && (
          <div className="space-y-4">
            <Label className="text-base font-semibold">Which AI agents should we use?</Label>

            <div className="p-3 rounded-lg bg-accent/20 border text-sm text-muted-foreground flex items-start gap-2">
              <Info className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
              <span>
                You can run one platform or <strong>split test</strong> multiple platforms on the same campaign.
              </span>
            </div>

            <div className="space-y-3">
              {(Object.keys(PLATFORM_META) as PlatformId[]).map(pid => {
                const meta = PLATFORM_META[pid];
                const cfg = data.platforms[pid];
                const platformAgents = pid === 'retell' ? retellAgents : pid === 'telnyx' ? telnyxAgents : [];

                return (
                  <div key={pid} className={`p-4 rounded-lg border transition-colors ${cfg.enabled ? 'border-primary/40 bg-primary/5' : 'border-border'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={meta.color}>{meta.icon}</span>
                        <Label className="font-semibold">{meta.label}</Label>
                        {pid === 'assistable' && <Badge variant="outline" className="text-[10px]">GHL-Safe API</Badge>}
                      </div>
                      <Switch checked={cfg.enabled} onCheckedChange={v => togglePlatform(pid, v)} />
                    </div>

                    {cfg.enabled && (
                      <div className="space-y-3 mt-3">
                        {pid !== 'assistable' && (
                          <div>
                            <Label className="text-sm">Select Agent</Label>
                            {loadingAgents ? (
                              <p className="text-xs text-muted-foreground mt-1">Loading agents…</p>
                            ) : platformAgents.length === 0 ? (
                              <div className="mt-1 space-y-1">
                                <p className="text-xs text-muted-foreground">
                                  No {meta.label} agents found. Enter the agent ID manually:
                                </p>
                                <Input
                                  placeholder={pid === 'retell' ? 'agent_abc123...' : 'Telnyx assistant UUID'}
                                  value={cfg.agentId}
                                  onChange={e => updatePlatform(pid, { agentId: e.target.value })}
                                  className="text-sm"
                                />
                              </div>
                            ) : (
                              <Select value={cfg.agentId} onValueChange={v => updatePlatform(pid, { agentId: v })}>
                                <SelectTrigger className="mt-1">
                                  <SelectValue placeholder={`Choose a ${meta.label} agent`} />
                                </SelectTrigger>
                                <SelectContent>
                                  {platformAgents.map(a => (
                                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                                  ))}
                                  <SelectItem value="__manual__">Enter ID manually…</SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                            {cfg.agentId === '__manual__' && (
                              <Input
                                placeholder="Paste agent ID"
                                value=""
                                onChange={e => updatePlatform(pid, { agentId: e.target.value })}
                                className="mt-2 text-sm"
                              />
                            )}
                          </div>
                        )}

                        {pid === 'assistable' && (
                          <div className="space-y-3">
                            <div>
                              <Label className="text-sm">Assistant ID <span className="text-destructive">*</span></Label>
                              <Input placeholder="asst_12345" value={data.assistableAssistantId} onChange={e => update({ assistableAssistantId: e.target.value })} className="mt-1 text-sm" />
                            </div>
                            <div>
                              <Label className="text-sm">Location ID <span className="text-destructive">*</span></Label>
                              <Input placeholder="loc_98765" value={data.assistableLocationId} onChange={e => update({ assistableLocationId: e.target.value })} className="mt-1 text-sm" />
                            </div>
                            <div>
                              <Label className="text-sm">Number Pool ID <span className="text-muted-foreground">(optional)</span></Label>
                              <Input placeholder="pool_abc123" value={data.assistableNumberPoolId} onChange={e => update({ assistableNumberPoolId: e.target.value })} className="mt-1 text-sm" />
                            </div>
                            <div>
                              <Label className="text-sm">Extraction Webhook URL <span className="text-muted-foreground">(optional)</span></Label>
                              <Input placeholder="https://api.assistable.ai/webhook/..." value={data.assistableWebhookUrl} onChange={e => update({ assistableWebhookUrl: e.target.value })} className="mt-1 text-sm" />
                            </div>
                          </div>
                        )}

                        {enabledPlatforms.length > 1 && (
                          <div>
                            <Label className="text-xs text-muted-foreground">Traffic share</Label>
                            <div className="flex items-center gap-2 mt-1">
                              <Slider
                                value={[cfg.trafficPct]}
                                onValueChange={([v]) => {
                                  const others = enabledPlatforms.filter(([k]) => k !== pid);
                                  const remaining = 100 - v;
                                  const share = others.length > 0 ? Math.floor(remaining / others.length) : 0;
                                  let rem = remaining - share * others.length;
                                  const nextPlatforms = { ...data.platforms, [pid]: { ...cfg, trafficPct: v } };
                                  others.forEach(([k], i) => {
                                    nextPlatforms[k] = { ...nextPlatforms[k], trafficPct: share + (i === 0 ? rem : 0) };
                                  });
                                  setData(prev => ({ ...prev, platforms: nextPlatforms }));
                                }}
                                min={10}
                                max={90}
                                step={5}
                              />
                              <span className="text-sm font-semibold w-12 text-right">{cfg.trafficPct}%</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {enabledPlatforms.length > 1 && (
              <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 text-sm flex items-start gap-2">
                <Split className="h-4 w-4 mt-0.5 shrink-0 text-emerald-600" />
                <span>
                  <strong>Split test active.</strong> Volume will be distributed across {enabledPlatforms.length} platforms ({enabledPlatforms.map(([, c]) => `${c.trafficPct}%`).join(' / ')}).
                </span>
              </div>
            )}
          </div>
        )}

        {/* ── Step 6: Follow-up Strategy ── */}
        {step === 6 && (
          <div className="space-y-4">
            <Label className="text-base font-semibold">How should we follow up?</Label>
            <RadioGroup value={data.followUpStrategy} onValueChange={(v) => update({ followUpStrategy: v as FollowUpStrategy })}>
              {Object.entries(STRATEGY_LABELS).map(([key, { label, desc }]) => (
                <div key={key} className="flex items-center space-x-2 p-3 rounded-lg border hover:bg-accent/50 transition-colors">
                  <RadioGroupItem value={key} id={`strat-${key}`} />
                  <Label htmlFor={`strat-${key}`} className="cursor-pointer flex-1">
                    <span className="font-medium">{label}</span>
                    <span className="text-muted-foreground text-sm ml-2">— {desc}</span>
                  </Label>
                </div>
              ))}
            </RadioGroup>
            {data.followUpStrategy === 'custom' && (
              <Textarea
                value={data.customStrategyText}
                onChange={e => update({ customStrategyText: e.target.value })}
                placeholder="Describe your ideal follow-up cadence… e.g. 'Call once, wait 2 hours, text, wait 1 day, call again, then weekly texts for a month'"
                className="min-h-[80px] resize-none"
              />
            )}
          </div>
        )}

        {/* ── Step 7: Workflow Preview ── */}
        {step === 7 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" />
              <Label className="text-base font-semibold">Workflow Preview</Label>
            </div>
            <p className="text-sm text-muted-foreground">
              This is the exact sequence that will be built. Toggle steps on/off to customize.
            </p>

            <div className="space-y-1">
              {data.workflowSteps.map((ws, i) => (
                <div
                  key={ws.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${ws.enabled ? 'bg-background' : 'bg-muted/30 opacity-50'}`}
                >
                  <Switch
                    checked={ws.enabled}
                    onCheckedChange={v => {
                      setData(prev => ({
                        ...prev,
                        workflowSteps: prev.workflowSteps.map((s, idx) => idx === i ? { ...s, enabled: v } : s),
                      }));
                    }}
                  />
                  <span className="text-lg">{STEP_TYPE_ICONS[ws.type] || '❓'}</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{ws.label}</p>
                    <p className="text-xs text-muted-foreground capitalize">{ws.type}{ws.waitHours ? ` — ${ws.waitHours >= 24 ? `${Math.round(ws.waitHours / 24)} day(s)` : ws.waitHours >= 1 ? `${ws.waitHours} hour(s)` : `${Math.round(ws.waitHours * 60)} min`}` : ''}</p>
                  </div>
                  {i < data.workflowSteps.length - 1 && ws.enabled && (
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  )}
                </div>
              ))}
            </div>

            <div className="p-3 rounded-lg bg-accent/20 border text-xs text-muted-foreground">
              💡 Active steps: {data.workflowSteps.filter(s => s.enabled).length} of {data.workflowSteps.length}. 
              The AI will build this exact sequence as your campaign workflow.
            </div>
          </div>
        )}

        {/* ── Step 8: Campaign Priorities & Event Handling ── */}
        {step === 8 && (
          <div className="space-y-4">
            <Label className="text-base font-semibold">What matters most for this campaign?</Label>
            <RadioGroup value={data.campaignPriority} onValueChange={(v) => update({ campaignPriority: v as CampaignPriority })}>
              {Object.entries(PRIORITY_OPTIONS).map(([key, { label, desc }]) => (
                <div key={key} className="flex items-center space-x-2 p-3 rounded-lg border hover:bg-accent/50 transition-colors">
                  <RadioGroupItem value={key} id={`prio-${key}`} />
                  <Label htmlFor={`prio-${key}`} className="cursor-pointer flex-1">
                    <span className="font-medium">{label}</span>
                    <span className="text-muted-foreground text-sm ml-2">— {desc}</span>
                  </Label>
                </div>
              ))}
            </RadioGroup>
            {data.campaignPriority === 'custom' && (
              <Input
                value={data.customPriorityText}
                onChange={e => update({ customPriorityText: e.target.value })}
                placeholder="Describe your campaign priority…"
              />
            )}

            {/* Transfer config reminder */}
            {needsTransferConfig && !data.transferPhoneNumber && data.goalType !== 'transfers' && (
              <div className="p-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 space-y-2">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">⚠️ Transfer number needed</p>
                <p className="text-xs text-muted-foreground">You have "Transfer to live agent" in your event handling but no transfer number configured.</p>
                <Input
                  placeholder="+1 (555) 123-4567"
                  value={data.transferPhoneNumber}
                  onChange={e => update({ transferPhoneNumber: e.target.value })}
                  className="mt-1"
                />
              </div>
            )}

            <div className="pt-2">
              <Label className="text-base font-semibold">What should happen when…</Label>
              <p className="text-xs text-muted-foreground mb-3">
                Configure how the autonomous engine handles each call outcome. Toggle actions on/off for each event.
              </p>

              <div className="space-y-3">
                {(Object.entries(EVENT_LABELS) as [keyof EventHandlingConfig, typeof EVENT_LABELS[keyof EventHandlingConfig]][]).map(([eventKey, { label, icon, desc }]) => (
                  <div key={eventKey} className="p-3 rounded-lg border space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{icon}</span>
                      <div>
                        <p className="text-sm font-semibold">{label}</p>
                        <p className="text-xs text-muted-foreground">{desc}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {ACTION_OPTIONS.map(({ value, label: actionLabel }) => {
                        const isActive = data.eventHandling[eventKey].includes(value);
                        return (
                          <Badge
                            key={value}
                            variant={isActive ? 'default' : 'outline'}
                            className={`cursor-pointer text-xs transition-colors ${isActive ? '' : 'opacity-60 hover:opacity-100'}`}
                            onClick={() => toggleEventAction(eventKey, value)}
                          >
                            {actionLabel}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Step 9: Review & Build ── */}
        {step === 9 && (
          <div className="space-y-4">
            <Label className="text-base font-semibold">Review & Build</Label>
            <p className="text-xs text-muted-foreground">Click any row to edit that section.</p>

            <div className="space-y-2 text-sm">
              {[
                { label: 'Business', value: data.businessDescription.slice(0, 80) + (data.businessDescription.length > 80 ? '…' : ''), stepNum: 0 },
                { label: 'Goal', value: data.goalType === 'custom' ? data.customGoalText.slice(0, 50) : GOAL_LABELS[data.goalType], stepNum: 1 },
                { label: 'Daily target', value: `${data.dailyTarget} results @ ≤$${data.maxCostPerResult} each`, stepNum: 1 },
                { label: 'Leads', value: `${data.startingLeads.toLocaleString()} → ${data.rampUpTarget.toLocaleString()}`, stepNum: 2 },
                { label: 'Import method', value: data.leadImport.method, stepNum: 3 },
                { label: 'Daily calls', value: `${data.dailyCalls} (${RAMP_LABELS[data.rampUpBehavior].label} ramp)`, stepNum: 4 },
                { label: 'Calling hours', value: `${data.callingHoursStart}–${data.callingHoursEnd} ${data.timezone.split('/').pop()?.replace(/_/g, ' ')}${data.bypassCallingHours ? ' ⚠️ BYPASS' : ''}`, stepNum: 4 },
                { label: 'Strategy', value: data.followUpStrategy === 'custom' ? data.customStrategyText.slice(0, 40) : STRATEGY_LABELS[data.followUpStrategy].label, stepNum: 6 },
                { label: 'Workflow', value: `${data.workflowSteps.filter(s => s.enabled).length} active steps`, stepNum: 7 },
                { label: 'Priority', value: data.campaignPriority === 'custom' ? data.customPriorityText.slice(0, 40) : PRIORITY_OPTIONS[data.campaignPriority].label, stepNum: 8 },
              ].map(({ label, value, stepNum }) => (
                <div
                  key={label}
                  className="flex justify-between items-center p-2 rounded bg-accent/20 cursor-pointer hover:bg-accent/40 transition-colors group"
                  onClick={() => jumpToStep(stepNum)}
                >
                  <span className="text-muted-foreground flex items-center gap-1">
                    {label}
                    <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity" />
                  </span>
                  <span className="font-medium text-right max-w-[60%] truncate">{value}</span>
                </div>
              ))}

              {/* Platforms row */}
              <div
                className="flex justify-between items-center p-2 rounded bg-accent/20 cursor-pointer hover:bg-accent/40 transition-colors group"
                onClick={() => jumpToStep(5)}
              >
                <span className="text-muted-foreground flex items-center gap-1">
                  Platforms
                  <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity" />
                </span>
                <span className="font-medium flex items-center gap-1">
                  {enabledPlatforms.map(([pid, cfg]) => (
                    <Badge key={pid} variant="secondary" className="text-xs">
                      {PLATFORM_META[pid].label} {enabledPlatforms.length > 1 ? `(${cfg.trafficPct}%)` : ''}
                    </Badge>
                  ))}
                </span>
              </div>

              {/* Transfer info */}
              {needsTransferConfig && data.transferPhoneNumber && (
                <div
                  className="flex justify-between items-center p-2 rounded bg-accent/20 cursor-pointer hover:bg-accent/40 transition-colors group"
                  onClick={() => jumpToStep(1)}
                >
                  <span className="text-muted-foreground flex items-center gap-1">
                    Transfer
                    <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity" />
                  </span>
                  <span className="font-medium">{data.transferType === 'warm' ? '🔥 Warm' : '❄️ Cold'} → {data.transferPhoneNumber}</span>
                </div>
              )}

              <div className="flex justify-between p-2 rounded bg-accent/20">
                <span className="text-muted-foreground">Numbers</span>
                <span className="font-medium">{currentNumbers} owned / {numbersNeeded} recommended</span>
              </div>
            </div>

            {/* Pipeline stages - editable inline */}
            <div className="p-3 rounded-lg border bg-accent/10 space-y-2">
              <p className="font-medium text-sm flex items-center gap-1">
                <Sparkles className="h-4 w-4 text-primary" /> Pipeline Stages
              </p>
              <div className="flex flex-wrap items-center gap-1">
                {pipelineStages.map((stage, i) => (
                  <React.Fragment key={stage}>
                    <Badge
                      variant="secondary"
                      className="text-xs cursor-pointer hover:bg-destructive/20 group relative"
                      onClick={() => {
                        const updated = pipelineStages.filter((_, idx) => idx !== i);
                        setCustomPipelineStages(updated);
                      }}
                      title="Click to remove"
                    >
                      {stage} <span className="ml-1 opacity-0 group-hover:opacity-100 text-destructive">×</span>
                    </Badge>
                    {i < pipelineStages.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
                  </React.Fragment>
                ))}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <Input
                  placeholder="Add custom stage…"
                  value={newStageName}
                  onChange={e => setNewStageName(e.target.value)}
                  className="h-7 text-xs flex-1"
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newStageName.trim()) {
                      e.preventDefault();
                      const stages = customPipelineStages.length > 0 ? [...customPipelineStages] : [...(DEFAULT_PIPELINE_STAGES[data.goalType] || [])];
                      stages.splice(stages.length - 1, 0, newStageName.trim());
                      setCustomPipelineStages(stages);
                      setNewStageName('');
                    }
                  }}
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs px-2"
                  disabled={!newStageName.trim()}
                  onClick={() => {
                    const stages = customPipelineStages.length > 0 ? [...customPipelineStages] : [...(DEFAULT_PIPELINE_STAGES[data.goalType] || [])];
                    stages.splice(stages.length - 1, 0, newStageName.trim());
                    setCustomPipelineStages(stages);
                    setNewStageName('');
                  }}
                >
                  <Plus className="h-3 w-3 mr-1" /> Add
                </Button>
              </div>
            </div>

            {/* Event handling summary - clickable to edit */}
            <div
              className="p-3 rounded-lg border bg-accent/10 space-y-2 cursor-pointer hover:bg-accent/20 transition-colors"
              onClick={() => jumpToStep(8)}
            >
              <p className="font-medium text-sm flex items-center gap-1">
                Event Handling Rules
                <Pencil className="h-3 w-3 text-muted-foreground" />
              </p>
              <div className="space-y-1 text-xs">
                {(Object.entries(EVENT_LABELS) as [keyof EventHandlingConfig, typeof EVENT_LABELS[keyof EventHandlingConfig]][]).map(([key, { label, icon }]) => (
                  <div key={key} className="flex items-center gap-2">
                    <span>{icon}</span>
                    <span className="text-muted-foreground">{label}:</span>
                    <span className="font-medium">{data.eventHandling[key].map(a => ACTION_OPTIONS.find(o => o.value === a)?.label).join(', ') || 'No action'}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Test Call Panel ── */}
            <div className="p-4 rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 space-y-3">
              <div className="flex items-center gap-2">
                <TestTube className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-semibold text-sm">Test Your Agent Before Launch</p>
                  <p className="text-xs text-muted-foreground">
                    Call yourself unlimited times — no limits, no DNC checks, no credit deductions.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Input
                  placeholder="+1 (214) 529-1531"
                  value={testPhoneNumber}
                  onChange={e => setTestPhoneNumber(e.target.value)}
                  className="flex-1"
                />
                <Button
                  onClick={handleTestCall}
                  disabled={isTestCalling || !testPhoneNumber.trim() || enabledPlatforms.length === 0}
                  size="sm"
                  className="gap-1.5 shrink-0"
                >
                  {isTestCalling ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Calling…</>
                  ) : (
                    <><PhoneCall className="h-4 w-4" /> Test Call</>
                  )}
                </Button>
              </div>

              {testCallResult && (
                <div className={`flex items-center gap-2 text-sm p-2 rounded ${testCallResult.success ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400' : 'bg-destructive/10 text-destructive'}`}>
                  {testCallResult.success ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
                  <span>{testCallResult.message}</span>
                </div>
              )}

              {testCallCount > 0 && (
                <p className="text-xs text-muted-foreground">
                  {testCallCount} test call{testCallCount !== 1 ? 's' : ''} made this session.
                </p>
              )}

              {enabledPlatforms.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Testing with: <span className="font-medium">{PLATFORM_META[enabledPlatforms[0][0]].label}</span>
                  {enabledPlatforms[0][1].agentId || data.assistableAssistantId ?
                    <> · Agent: <span className="font-mono text-xs">{enabledPlatforms[0][0] === 'assistable' ? data.assistableAssistantId : enabledPlatforms[0][1].agentId}</span></> : null
                  }
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── Navigation ── */}
        <div className="flex items-center justify-between pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (returnToReview) {
                setReturnToReview(false);
                setStep(9);
              } else {
                setStep(s => s - 1);
              }
            }}
            disabled={step === 0}
          >
            <ChevronLeft className="h-4 w-4 mr-1" /> {returnToReview ? 'Back to Review' : 'Back'}
          </Button>

          {step < totalSteps - 1 ? (
            <Button size="sm" onClick={handleNextStep} disabled={!canAdvance()}>
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button size="sm" onClick={handleBuild} disabled={isBuilding} className="gap-2">
              {isBuilding ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Building…</>
              ) : (
                <><Rocket className="h-4 w-4" /> Build My Campaign</>
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default MissionBriefingWizard;
