import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Phone,
  PhoneOutgoing,
  Webhook,
  RotateCcw,
  UserCheck,
  GitBranch,
  Kanban,
  Workflow,
  Globe,
  DollarSign,
  ChevronDown,
  ChevronRight,
  Brain,
  Zap,
  Clock,
  BarChart3,
  MessageSquare,
  Shield,
  Target,
  TrendingUp,
  Activity,
  Settings,
  Lightbulb,
  BookOpen,
  Users,
  Bot,
  FileBarChart,
  ArrowDown,
} from 'lucide-react';

interface LifecycleStep {
  number: number;
  title: string;
  icon: React.ReactNode;
  edgeFunction: string;
  summary: string;
  details: string[];
  uiLocation: string;
}

const lifecycleSteps: LifecycleStep[] = [
  {
    number: 1,
    title: 'Call Dispatcher',
    icon: <Phone className="h-5 w-5" />,
    edgeFunction: 'call-dispatcher',
    summary: 'Picks leads from campaign queue, checks calling hours per timezone, selects phone number via round-robin (lowest daily usage first), checks DNC list.',
    details: [
      'Loads leads from dialing_queues with status=pending',
      'Validates calling hours per lead timezone (state → timezone map)',
      'Round-robin selects phone number with lowest daily_calls count',
      'Checks DNC list before dispatch',
      'Increments phone number daily_calls counter',
      'Provider-aware: Retell campaigns only use Retell numbers, Telnyx only uses Telnyx numbers',
    ],
    uiLocation: 'Campaign status monitor, dialing_queues table',
  },
  {
    number: 2,
    title: 'Outbound Calling',
    icon: <PhoneOutgoing className="h-5 w-5" />,
    edgeFunction: 'outbound-calling',
    summary: 'Places the actual call via Retell or Telnyx API. Injects lead variables, selects A/B script variant, reserves credits.',
    details: [
      'Places call via Retell API or Telnyx TeXML AI Calls',
      'Injects lead dynamic variables (first_name, address, etc.)',
      'If A/B testing enabled: picks script variant via Thompson Sampling',
      'If billing enabled: reserves credits pre-call',
      'Creates call_logs row with status=calling',
      'Passes agent_id, campaign_id, caller_id metadata',
    ],
    uiLocation: 'Call History table (new row appears)',
  },
  {
    number: 3,
    title: 'Retell Call Webhook',
    icon: <Webhook className="h-5 w-5" />,
    edgeFunction: 'retell-call-webhook',
    summary: 'The BIG one. Fires when call ends. Handles voicemail detection, transcript analysis, A/B variant stats, and lead score outcomes.',
    details: [
      '3a. Voicemail Detection — Retell AMD + transcript-based fallback (pattern + duration scoring)',
      '3b. Call Log Update — Upserts with transcript, duration, outcome, recording_url, sentiment, summary',
      '3c. Transcript Analysis (AI) — If transcript > 50 chars: runs AI disposition analysis extracting disposition, sentiment, key_points, objections',
      '3d. A/B Variant Stats — Updates variant success rates in call_variant_assignments',
      '3e. Lead Score Outcomes — Updates lead_score_outcomes for ML feedback loop',
      '3f. Cost Tracking — Fetches actual cost from Retell API (GET /get-call), saves retell_cost_cents + cost_breakdown',
    ],
    uiLocation: 'Call History (full row), Campaign Results',
  },
  {
    number: 4,
    title: 'Dialing Queue Update',
    icon: <RotateCcw className="h-5 w-5" />,
    edgeFunction: 'retell-call-webhook (inline)',
    summary: 'Handles retry logic. If retry-eligible AND under max attempts: reschedules in 30 min. Otherwise marks completed/failed.',
    details: [
      'Retry-eligible outcomes: no_answer, voicemail, busy, failed',
      'If attempts < max_attempts: reschedule in 30 min',
      'If callback attempt missed: backoff retry (5min, 15min)',
      'If max attempts reached: mark queue as failed/completed',
      'If terminal disposition (appointment, DNC): mark completed immediately',
    ],
    uiLocation: 'Campaign live status (remaining/completed counts)',
  },
  {
    number: 5,
    title: 'Lead Status Update',
    icon: <UserCheck className="h-5 w-5" />,
    edgeFunction: 'retell-call-webhook (inline)',
    summary: 'Updates lead record with new status, last_contacted_at, structured call notes, and callback scheduling.',
    details: [
      'Updates leads.status (new → contacted/callback/not_interested)',
      'Updates leads.last_contacted_at timestamp',
      'Appends structured call note to leads.notes',
      'If callback: sets leads.next_callback_at + pauses workflow + queues callback + sends confirmation SMS',
      'If DNC: sets leads.do_not_call = true',
    ],
    uiLocation: 'Lead Manager (status column, notes, last call)',
  },
  {
    number: 6,
    title: 'Disposition Router',
    icon: <GitBranch className="h-5 w-5" />,
    edgeFunction: 'disposition-router',
    summary: 'The traffic cop. Reads outcome and triggers: auto-actions, DNC checks, campaign removal, workflow pause, pipeline moves, reachability events, metrics.',
    details: [
      '6a. User Auto-Actions — Custom rules per disposition (disposition_auto_actions table)',
      '6b. DNC Check — Matches stop/remove/hostile keywords → adds to dnc_list',
      '6c. Campaign Removal — Terminal outcomes remove from ALL active workflows + queues',
      '6d. Workflow Pause — Follow-up/nurture dispositions pause (not remove) workflows',
      '6e. Negative Sentiment Auto-DNC — Scans transcript for "stop calling", "lawyer", etc.',
      '6f. Pipeline Board Move — Maps disposition to pipeline stage, auto-creates board if needed',
      '6g. Reachability Event — Records to reachability_events table',
      '6h. Disposition Metrics — Full snapshot to disposition_metrics table',
    ],
    uiLocation: 'Pipeline Manager, Lead Manager, Analytics',
  },
  {
    number: 7,
    title: 'Pipeline Position',
    icon: <Kanban className="h-5 w-5" />,
    edgeFunction: 'retell-call-webhook (inline)',
    summary: 'Redundant safety net — webhook also directly updates pipeline position. Cards move between columns on the Pipeline board.',
    details: [
      'Maps outcome → pipeline stage name',
      'Upserts lead_pipeline_positions',
      'Acts as backup in case disposition-router fails',
    ],
    uiLocation: 'Pipeline Manager (cards move between columns)',
  },
  {
    number: 8,
    title: 'Workflow Engine',
    icon: <Workflow className="h-5 w-5" />,
    edgeFunction: 'workflow-executor',
    summary: 'Terminal outcomes stop workflows. Non-terminal outcomes advance to next step (could trigger SMS, wait, branch, etc.).',
    details: [
      'Terminal (appointment, converted, DNC): stops workflow, removes from campaign queues',
      'Non-terminal (contacted, voicemail, no_answer): advances to next step',
      'Supports branching with 13 condition operators (equals, gt, contains, in, between, exists)',
      'Loop support with perpetual mode for nurture sequences',
    ],
    uiLocation: 'AI Workflows page, Lead workflow progress',
  },
  {
    number: 9,
    title: 'External Syncs',
    icon: <Globe className="h-5 w-5" />,
    edgeFunction: 'ghl-integration',
    summary: 'Pushes disposition, transcript, duration to GoHighLevel CRM. Sends manager SMS alerts for transfers/appointments.',
    details: [
      'GHL: Updates tags, pipeline stages, contact fields',
      'Manager SMS: Alert notifications for transfers and appointments',
      'Calendar: Books appointments via Google Calendar / GHL Calendar',
    ],
    uiLocation: 'GHL dashboard, your phone (SMS alerts)',
  },
  {
    number: 10,
    title: 'Cost Tracking & Credits',
    icon: <DollarSign className="h-5 w-5" />,
    edgeFunction: 'retell-call-webhook + credit-management',
    summary: 'Fetches actual cost from Retell API, saves cost breakdown, finalizes credit reservation, checks low balance alerts.',
    details: [
      'Fetches actual cost from Retell API (GET /get-call)',
      'Saves retell_cost_cents + cost_breakdown to call_logs',
      'If billing enabled: finalizes credit reservation (reserve → deduct actual)',
      'If low balance: triggers system alert + auto-recharge check',
    ],
    uiLocation: 'Call History (cost column), Campaign Results (total cost)',
  },
];

const autonomousSteps = [
  { name: 'Goal Assessment', desc: 'Checks daily call/appointment/conversation targets vs progress' },
  { name: 'Lead Rescoring', desc: 'Server-side ML scoring with engagement/recency/answer rate/status weights' },
  { name: 'Pacing Analysis', desc: 'Auto-adjusts calls_per_minute based on error rate and answer rate' },
  { name: 'Decision Making', desc: 'Queues actions (lead calling, follow-up SMS, number quarantine, pacing changes)' },
  { name: 'Calling Time Optimizer', desc: 'Learns best hours from answered call patterns (optimal_calling_windows)' },
  { name: 'Lead Score Calibration', desc: 'Weekly recalibration of scoring weights based on actual call outcomes' },
  { name: 'Script A/B Rebalancing', desc: 'UCB1 algorithm shifts traffic toward winning script variants' },
  { name: 'Adaptive Pacing', desc: 'Writes optimal pace to adaptive_pacing table for broadcast engine' },
  { name: 'Journey Management', desc: 'Syncs all leads into journey states, applies 18-rule sales psychology playbook' },
  { name: 'Funnel Analysis', desc: 'Portfolio-level thinking: stage counts, conversion rates, cost per appointment' },
  { name: 'Number Health Prediction', desc: 'Proactive spam risk detection, auto-quarantines unhealthy numbers' },
  { name: 'Transcript Intent Parsing', desc: 'LLM extracts buying signals, timelines, decision makers from transcripts' },
  { name: 'Playbook Self-Optimization', desc: 'Tracks rule performance, flags underperformers, rewrites via AI' },
  { name: 'SMS Copy A/B Testing', desc: 'UCB1 bandit algorithm selects best SMS variants, generates improved copy' },
  { name: 'Message Effectiveness Tracking', desc: 'Chi-square significance testing on SMS performance' },
  { name: 'ML Conversion Model Training', desc: 'Weekly logistic regression from 500 call outcomes (9 features)' },
  { name: 'Lead Conversion Scoring', desc: 'Scores 2,000+ active leads with conversion probability segments' },
  { name: 'Churn Risk Detection', desc: '6-factor risk scoring, auto-queues reengagement for critical leads' },
  { name: 'Daily Battle Plan', desc: 'AI generates complete daily resource allocation plan (time blocks, budget, priority)' },
  { name: 'Strategic Pattern Detection', desc: '6 statistical algorithms: timing, gap, sequence, source, decay, number patterns' },
  { name: 'Save Operational Memory', desc: 'Persists significant events for cross-session context' },
];

const uiDataMapping = [
  { page: 'Campaign Results Dashboard', source: 'call_logs aggregates: total calls, answered, voicemail, cost, answer rate' },
  { page: 'Call History Table', source: 'call_logs rows: transcript, duration, outcome, cost, recording, agent' },
  { page: 'Lead Manager', source: 'leads table: status, last_contacted_at, notes, next_callback_at' },
  { page: 'Pipeline Manager', source: 'lead_pipeline_positions: cards move by disposition' },
  { page: 'Analytics Page', source: 'disposition_metrics: counts, time-to-disposition, conversion rates' },
  { page: 'Script Analytics', source: 'opener_analytics + call_opener_logs: opener effectiveness, time wasted' },
  { page: 'Autonomous Agent', source: 'ai_action_queue: follow-ups, journey states, battle plans' },
  { page: 'Daily Report', source: 'generate-daily-report: aggregated call_logs summary' },
  { page: 'AI Workflows', source: 'lead_workflow_progress: step position, paused/active/removed' },
];

function StepCard({ step }: { step: LifecycleStep }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="border-border/50">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors py-4">
            <div className="flex items-start gap-3">
              <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 text-primary shrink-0 text-sm font-bold">
                {step.number}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {step.icon}
                  <CardTitle className="text-sm font-semibold">{step.title}</CardTitle>
                  <Badge variant="outline" className="text-[10px] font-mono shrink-0">
                    {step.edgeFunction}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{step.summary}</p>
              </div>
              {isOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 pb-4">
            <ul className="space-y-1.5 ml-11">
              {step.details.map((detail, i) => (
                <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  <span>{detail}</span>
                </li>
              ))}
            </ul>
            <div className="ml-11 mt-3">
              <Badge variant="secondary" className="text-[10px]">
                📍 {step.uiLocation}
              </Badge>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

export default function CallLifecycleReference() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <BookOpen className="h-6 w-6 text-primary" />
        <div>
          <h2 className="text-lg font-bold">How It Works — Full System Reference</h2>
          <p className="text-sm text-muted-foreground">Every step from call dispatch to final reporting, plus the autonomous engine loop.</p>
        </div>
      </div>

      {/* 10-Step Call Lifecycle */}
      <div>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Phone className="h-4 w-4 text-primary" />
          Call Lifecycle — 10 Steps (click to expand)
        </h3>
        <div className="space-y-2">
          {lifecycleSteps.map((step, i) => (
            <React.Fragment key={step.number}>
              <StepCard step={step} />
              {i < lifecycleSteps.length - 1 && (
                <div className="flex justify-center">
                  <ArrowDown className="h-4 w-4 text-muted-foreground/40" />
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Retry Protocol */}
      <Card>
        <CardHeader className="py-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-primary" />
            Retry Protocol
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 text-xs space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-muted/30 rounded-lg p-3">
              <p className="font-semibold text-primary mb-1">Retry-Eligible</p>
              <p className="text-muted-foreground">no_answer, voicemail, busy, failed</p>
              <p className="mt-1">→ Reschedule 30 min later if attempts &lt; max_attempts</p>
            </div>
            <div className="bg-muted/30 rounded-lg p-3">
              <p className="font-semibold text-accent-foreground mb-1">Exhausted</p>
              <p className="text-muted-foreground">attempts ≥ max_attempts</p>
              <p className="mt-1">→ Queue marked "failed", lead stays in system</p>
            </div>
            <div className="bg-muted/30 rounded-lg p-3">
              <p className="font-semibold text-primary mb-1">Terminal</p>
              <p className="text-muted-foreground">appointment, DNC, not_interested, converted</p>
              <p className="mt-1">→ Queue "completed", removed from all campaigns</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Autonomous Engine */}
      <Card>
        <CardHeader className="py-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            Autonomous Engine — 21-Step Loop (runs every 5 minutes)
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {autonomousSteps.map((step, i) => (
              <div key={i} className="flex items-start gap-2 text-xs p-2 rounded bg-muted/20">
                <span className="font-mono text-primary font-bold w-5 shrink-0 text-right">{i + 1}.</span>
                <div>
                  <span className="font-semibold">{step.name}</span>
                  <p className="text-muted-foreground mt-0.5">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Autonomy Modes */}
      <Card>
        <CardHeader className="py-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            Autonomy Modes
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="border rounded-lg p-3 border-primary/30 bg-primary/5">
              <p className="font-semibold text-primary">Full Auto</p>
              <p className="text-muted-foreground mt-1">AI executes all actions immediately without approval. Best for high-confidence operations with established patterns.</p>
            </div>
            <div className="border rounded-lg p-3 border-accent/30 bg-accent/5">
              <p className="font-semibold text-accent-foreground">Approval Required</p>
              <p className="text-muted-foreground mt-1">AI suggests actions and stages them in the Actions queue. You approve or reject before execution.</p>
            </div>
            <div className="border rounded-lg p-3 border-secondary/30 bg-secondary/5">
              <p className="font-semibold text-secondary-foreground">Suggestions Only</p>
              <p className="text-muted-foreground mt-1">AI provides recommendations and logs insights. No actions are queued or executed automatically.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* AI Managers */}
      <Card>
        <CardHeader className="py-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            AI Managers & Intelligence Systems
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {[
              { icon: <Users className="h-3 w-3" />, name: 'Lead Journey Intelligence', desc: '10-stage journey tracking with 18-rule sales psychology playbook. Learns preferred contact times/channels per lead.' },
              { icon: <Target className="h-3 w-3" />, name: 'Campaign Strategist', desc: 'Daily Battle Plans with resource allocation. 6 statistical pattern detectors. Auto-creates playbook rules from insights.' },
              { icon: <Activity className="h-3 w-3" />, name: 'Adaptive Pacing', desc: '3-layer pacing: base CPM → adaptive table → broadcast override. Throttles based on error/answer rates.' },
              { icon: <FileBarChart className="h-3 w-3" />, name: 'Script A/B Testing', desc: 'Thompson Sampling + UCB1 algorithm. 20-call significance threshold. 10% min traffic to all variants.' },
              { icon: <TrendingUp className="h-3 w-3" />, name: 'ML Conversion Model', desc: 'Logistic regression on 9 features. Segments: high_value (>0.7), nurture (0.4-0.7), at_risk (0.2-0.4), low_priority.' },
              { icon: <Shield className="h-3 w-3" />, name: 'Number Health Monitor', desc: 'Velocity + answer rate + voicemail rate scoring. Auto-quarantine at health < 20. Proactive rest recommendations.' },
              { icon: <MessageSquare className="h-3 w-3" />, name: 'SMS Copy Optimization', desc: 'UCB1 bandit selection. Auto-generates improved copy for <5% reply rate variants. Capped at 4 variants per context.' },
              { icon: <Lightbulb className="h-3 w-3" />, name: 'Churn Risk Detection', desc: '6-factor scoring: days since response, missed callbacks, negative sentiment, consecutive no-answers. Auto-queues reengagement.' },
            ].map((manager, i) => (
              <div key={i} className="flex items-start gap-2 p-3 rounded-lg bg-muted/20">
                <span className="text-primary mt-0.5">{manager.icon}</span>
                <div>
                  <p className="font-semibold">{manager.name}</p>
                  <p className="text-muted-foreground mt-0.5">{manager.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* UI Data Mapping */}
      <Card>
        <CardHeader className="py-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Where Each UI Page Gets Its Data
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-1.5">
            {uiDataMapping.map((item, i) => (
              <div key={i} className="flex items-start gap-3 text-xs py-1.5 border-b border-border/30 last:border-0">
                <span className="font-semibold w-44 shrink-0">{item.page}</span>
                <span className="text-muted-foreground">{item.source}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
