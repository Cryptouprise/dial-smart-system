import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Actor = 'agent' | 'customer';
type Channel = 'voice' | 'sms';
type PersonaKey = 'appointment_ready' | 'time_sensitive' | 'skeptical' | 'price_sensitive' | 'neutral';

type SimulationEvent = {
  index: number;
  offset_minutes: number;
  channel: Channel;
  actor: Actor;
  label: string;
  text: string;
};

type SimulatorRequest = {
  organizationId?: string;
  agentPersona?: PersonaKey;
  customerPersona?: PersonaKey;
  stepLapseMinutes?: number | string;
  stepLapseHours?: number | string;
  forceDisposition?: string;
  customerTransferPhrases?: string[];
  customReplyText?: string;
  campaignProgressTest?: boolean;
  seed?: string | number;
};

type SimulatorResponse = {
  success: true;
  runId: string;
  seedUsed: string;
  leadId: string;
  callLogId: string;
  organizationId: string;
  disposition: string;
  forceDispositionUsed: boolean;
  callDispositionApplied: boolean;
  callDispositionActions: string[];
  workflowProgressRemoved: boolean;
  workflowProgressId: string | null;
  workflowId: string | null;
  campaignId: string | null;
  pipelineMoved: boolean;
  pipelineStageBefore: string | null;
  pipelineStageAfter: string | null;
  leadStatusBefore: string | null;
  leadStatusAfter: string | null;
  totalMinutesSimulated: number;
  events: SimulationEvent[];
  transcript: string;
  recommendations: Array<{
    category: 'disposition' | 'persona' | 'timing' | 'content';
    title: string;
    rationale: string;
    nextAction: string;
  }>;
  warning?: string;
};

type PersonaDefinition = {
  openingLine: string;
  outcomeWeights: Array<{ name: string; weight: number }>;
  smsTemplates: string[];
  objectionReplies: string[];
};

const personas: Record<PersonaKey, PersonaDefinition> = {
  appointment_ready: {
    openingLine:
      'Hi, this is a quick follow-up from Elite Solar. We helped similar homeowners reduce contract risk and lock in better terms. Do you have 2 minutes?',
    outcomeWeights: [
      { name: 'Appointment Set', weight: 0.6 },
      { name: 'Callback Requested', weight: 0.2 },
      { name: 'Interested', weight: 0.1 },
      { name: 'Not Interested', weight: 0.05 },
      { name: 'DNC', weight: 0.05 },
    ],
    smsTemplates: [
      'Thanks for listening. I can send you a quick overview and available windows.',
      'Do you want me to send a quick sample pricing range first?',
      'Want to lock in a consult for next week?',
    ],
    objectionReplies: [
      'This sounds useful. Can we schedule quick consult?',
      'Can I get details emailed? yes please.',
      'Let me book a time that works.',
    ],
  },
  time_sensitive: {
    openingLine:
      "Hey, I know this is a busy time. I can keep this under 30 seconds. Is this a bad time or should I call back?",
    outcomeWeights: [
      { name: 'Callback Requested', weight: 0.25 },
      { name: 'Not Interested', weight: 0.35 },
      { name: 'No Answer', weight: 0.2 },
      { name: 'Interested', weight: 0.15 },
      { name: 'DNC', weight: 0.05 },
    ],
    smsTemplates: [
      'No pressure—want a callback at a better time?',
      'I can send a short breakdown if now is not good.',
      'Totally understand. Say when it is convenient.',
    ],
    objectionReplies: [
      'I do not want this right now, please call later.',
      'Not interested, thanks.',
      'Put me in callback.',
    ],
  },
  skeptical: {
    openingLine:
      'Hi, this is a quick audit offer on solar contracts. I know calls like this can be annoying, so I will just ask one question.',
    outcomeWeights: [
      { name: 'Interested', weight: 0.25 },
      { name: 'Not Interested', weight: 0.45 },
      { name: 'Human Transferred', weight: 0.1 },
      { name: 'Callback Requested', weight: 0.12 },
      { name: 'DNC', weight: 0.08 },
    ],
    smsTemplates: [
      'Totally get it. If you are curious I can share the exact comparison quickly.',
      'I can prove this in 60 seconds and no pressure.',
      'Want me to drop a simple script template in case it helps?',
    ],
    objectionReplies: [
      'I do not care right now.',
      'I only speak with my partner.',
      'Please transfer me to a human and end this.',
    ],
  },
  price_sensitive: {
    openingLine:
      'Hi, quick heads up: if this is too expensive right now, tell me so and I will stop calling immediately.',
    outcomeWeights: [
      { name: 'Not Interested', weight: 0.35 },
      { name: 'Callback Requested', weight: 0.28 },
      { name: 'Interested', weight: 0.15 },
      { name: 'No Answer', weight: 0.12 },
      { name: 'DNC', weight: 0.1 },
    ],
    smsTemplates: [
      'If price is the only blocker I can run a quick side-by-side scenario.',
      'No hard sell—just a free check on whether this is even worth discussing.',
      'Want just the quick estimate range instead of a call?',
    ],
    objectionReplies: [
      'No thanks, we are trying to budget.',
      'I am not interested at this price point.',
      'Can you text me a number range?',
    ],
  },
  neutral: {
    openingLine:
      'Hi, we help homeowners with solar contract options. Can we do a 45-second qualification?',
    outcomeWeights: [
      { name: 'Interested', weight: 0.3 },
      { name: 'No Answer', weight: 0.2 },
      { name: 'Callback Requested', weight: 0.25 },
      { name: 'Not Interested', weight: 0.2 },
      { name: 'DNC', weight: 0.05 },
    ],
    smsTemplates: [
      'Here is a quick summary.',
      'I can explain in 2 minutes if useful.',
      'Want to hold off for a better time?',
    ],
    objectionReplies: [
      'Can we take this later?',
      'No thanks.',
      'Please transfer me to a person.',
    ],
  },
};

const seedHash = (value: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const makeRng = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    return state / 0x1_0000_0000;
  };
};

const pickWeighted = (
  values: Array<{ name: string; weight: number }>,
  random: () => number,
) => {
  let total = 0;
  for (const item of values) total += Math.max(0, item.weight);
  const cursor = random() * Math.max(1, total);
  let running = 0;
  for (const item of values) {
    running += Math.max(0, item.weight);
    if (cursor <= running) return item.name;
  }
  return values[values.length - 1]?.name || 'Not Interested';
};

const pickPhrase = (items: string[], random: () => number, index: number) => {
  if (!items.length) return '';
  const idx = Math.max(0, Math.min(items.length - 1, Math.floor(random() * 1000 + index) % items.length));
  return items[idx];
};

const buildRecommendations = (
  disposition: string,
  forceDisposition: string,
  agentDef: PersonaDefinition,
  customerDef: PersonaDefinition,
  events: SimulationEvent[],
) => {
  const latestCustomer = [...events]
    .filter((event) => event.actor === 'customer')
    .slice(-1)[0]
    ?.text.toLowerCase() || '';

  const recommendations: Array<{
    category: 'disposition' | 'persona' | 'timing' | 'content';
    title: string;
    rationale: string;
    nextAction: string;
  }> = [];

  if (forceDisposition) {
    recommendations.push({
      category: 'disposition',
      title: 'Forced outcome path validated',
      rationale: `You forced "${forceDisposition}" and the workflow still processed this path.`,
      nextAction: 'Keep this setting for deterministic QA and production dry runs.',
    });
    return recommendations;
  }

  if (disposition === 'DNC' || /not for me|not interested|no thanks|remove/.test(latestCustomer)) {
    recommendations.push({
      category: 'timing',
      title: 'Increase trust before intent asks',
      rationale: 'The customer moved away quickly without engaging the value proposition.',
      nextAction: 'Slow first ask and add one empathy line before any close.',
    });
  }

  if (disposition === 'Appointment Set' || /appointment|calendar|book|schedule/.test(latestCustomer)) {
    recommendations.push({
      category: 'content',
      title: 'Positive conversion path',
      rationale: 'Customer language shows buy-in, so this persona is converting for this branch.',
      nextAction: 'Increase this branch in script weight and reduce wait delay.',
    });
  }

  if (disposition === 'Human Transferred') {
    recommendations.push({
      category: 'persona',
      title: 'Handoff guardrail is active',
      rationale: 'Customer requested a human and path moved predictably.',
      nextAction: 'Keep this behavior for safety, but try one extra clarification question before transfer.',
    });
  }

  if (customerDef.openingLine.includes('price') || /price/.test(agentDef.openingLine.toLowerCase())) {
    recommendations.push({
      category: 'content',
      title: 'Value-first framing',
      rationale: 'Price-sensitive customer style is sensitive to pressure and urgency.',
      nextAction: 'Lead with one outcome-based result before price discussion.',
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      category: 'content',
      title: 'Stable baseline',
      rationale: 'No obvious friction found in this run.',
      nextAction: 'Run 5+ seeds for this same pair to validate consistency.',
    });
  }

  return recommendations;
};

const parseMinutes = (...inputs: Array<number | string | undefined>) => {
  for (const input of inputs) {
    if (input == null) continue;
    const n = Number(input);
    if (Number.isFinite(n)) {
      return Math.round(Math.min(12 * 60, Math.max(1, n)));
    }
  }
  return 240;
};

const getBoardName = (row: unknown): string | null => {
  if (!row || typeof row !== 'object') return null;
  const boards = (row as { pipeline_boards?: unknown }).pipeline_boards;
  if (!boards) return null;
  if (Array.isArray(boards)) return (boards[0] as { name?: string } | undefined)?.name || null;
  return (boards as { name?: string })?.name || null;
};

const mapDispositionFromReply = (text: string) => {
  const clean = text.toLowerCase().trim();
  if (!clean) return null;
  if (/(human|agent|speak|representative|person|live)/.test(clean) && /(transfer|talk|talk to|speak|rep)/.test(clean)) {
    return 'Human Transferred';
  }
  if (/(dont call|do not call|dnc|not call|remove|stop calling|unsubscribe|spam)/.test(clean)) {
    return 'DNC';
  }
  if (/(callback|call back|later|bad time|other time|try another day)/.test(clean)) {
    return 'Callback Requested';
  }
  if (/(not interested|no thanks|not now|nope|no thank|not a good fit|not for me)/.test(clean)) {
    return 'Not Interested';
  }
  if (/(appointment|schedule|book|calendar|meet|time)/.test(clean)) {
    return 'Appointment Set';
  }
  if (/(interested|sounds good|yes|sounds right|i do)/.test(clean)) {
    return 'Interested';
  }
  return null;
};

serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ success: false, error: 'Missing authorization header' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const token = authHeader.slice(7);
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ success: false, error: 'Supabase configuration missing' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    return new Response(JSON.stringify({ success: false, error: 'Invalid user session' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: SimulatorRequest = {};
  try {
    body = (await request.json()) as SimulatorRequest;
  } catch {
    body = {};
  }

  const organizationId = body.organizationId?.trim();
  if (!organizationId) {
    return new Response(
      JSON.stringify({ success: false, error: 'organizationId is required. Provide organizationId explicitly.' }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }

  const orgMember = await supabase
    .from('organization_users')
    .select('role')
    .eq('user_id', userData.user.id)
    .eq('organization_id', organizationId)
    .limit(1)
    .maybeSingle();

  if (orgMember.error || !orgMember.data) {
    return new Response(
      JSON.stringify({ success: false, error: 'Current user is not a member of that organization' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const agentPersona: PersonaKey = body.agentPersona && body.agentPersona in personas ? body.agentPersona : 'neutral';
  const customerPersona: PersonaKey = body.customerPersona && body.customerPersona in personas ? body.customerPersona : 'neutral';
  const stepLapseMinutes = parseMinutes(
    body.stepLapseMinutes,
    body.stepLapseHours ? Number(body.stepLapseHours) * 60 : undefined,
  );
  const forceDisposition = body.forceDisposition?.trim() || '';
  const explicitSeed = body.seed == null ? '' : String(body.seed).trim();
  const runSeed = explicitSeed || `${userData.user.id}:${organizationId}:${agentPersona}:${customerPersona}:${Date.now()}`;

  const seed = seedHash(runSeed);
  const rng = makeRng(seed);

  const events: SimulationEvent[] = [];
  const pushEvent = (entry: Omit<SimulationEvent, 'index'>) => {
    events.push({
      index: events.length + 1,
      ...entry,
      offset_minutes: Math.round(entry.offset_minutes),
    });
  };

  const randomPhone = `${Math.abs(seed % 10000000000).toString().padStart(10, '0')}`;
  const leadInsert = await supabase
    .from('leads')
    .insert({
      user_id: userData.user.id,
      organization_id: organizationId,
      phone_number: `+1${randomPhone}`,
      first_name: 'Simulation',
      last_name: 'Customer',
      status: 'new',
      source: 'simulation',
      tags: ['dual-agent-simulator'],
      notes: 'Created by agent-dual-simulator for pipeline/disposition verification.',
      user_notes: `agent=${agentPersona} customer=${customerPersona}`,
    })
    .select('id')
    .single();

  if (leadInsert.error || !leadInsert.data?.id) {
    return new Response(
      JSON.stringify({ success: false, error: `Failed to create simulation lead: ${leadInsert.error?.message || 'unknown error'}` }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }

  const leadId = leadInsert.data.id;

  const workflowCandidate = await supabase
    .from('campaigns')
    .select('id, workflow_id')
    .eq('user_id', userData.user.id)
    .eq('organization_id', organizationId)
    .eq('status', 'active')
    .not('workflow_id', 'is', null)
    .limit(1)
    .maybeSingle();
  const workflowId = workflowCandidate.data?.workflow_id || null;
  const campaignId = workflowCandidate.data?.id || null;
  let workflowProgressId: string | null = null;

  if (body.campaignProgressTest && workflowId) {
    const workflowInsert = await supabase
      .from('lead_workflow_progress')
      .insert({
        user_id: userData.user.id,
        lead_id: leadId,
        workflow_id: workflowId,
        campaign_id: campaignId,
        status: 'active',
      })
      .select('id')
      .single();

    if (!workflowInsert.error) {
      workflowProgressId = workflowInsert.data?.id || null;
    }
  }

  const agentDef = personas[agentPersona];
  const customerDef = personas[customerPersona];

  const firstCustomerReply = body.customReplyText?.trim()
    || pickPhrase(customerDef.objectionReplies, rng, 0);
  const finalCustomerReply = body.customerTransferPhrases?.[0]
    || pickPhrase(customerDef.objectionReplies, rng, 1);

  const weightedDisposition = pickWeighted(agentDef.outcomeWeights, rng);
  const mappedDisposition = mapDispositionFromReply(firstCustomerReply);
  const finalDisposition = forceDisposition || mappedDisposition || weightedDisposition;
  const totalMinutes = stepLapseMinutes * 3 + 5;

  const addLeadPipeline = async () => {
    const { data: current } = await supabase
      .from('lead_pipeline_positions')
      .select('pipeline_boards(name)')
      .eq('lead_id', leadId)
      .order('moved_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return getBoardName(current);
  };

  const pipelineBefore = await addLeadPipeline();
  const leadBefore = await supabase
    .from('leads')
    .select('status')
    .eq('id', leadId)
    .single();
  const workflowProgressBefore = await supabase
    .from('lead_workflow_progress')
    .select('id')
    .eq('lead_id', leadId)
    .eq('user_id', userData.user.id)
    .eq('status', 'active');

  pushEvent({
    offset_minutes: 0,
    channel: 'voice',
    actor: 'agent',
    label: 'Call Attempt (agent)',
    text: agentDef.openingLine,
  });

  pushEvent({
    offset_minutes: Math.max(1, stepLapseMinutes * 0.2),
    channel: 'voice',
    actor: 'customer',
    label: 'Customer Response',
    text: firstCustomerReply,
  });

  pushEvent({
    offset_minutes: stepLapseMinutes,
    channel: 'sms',
    actor: 'agent',
    label: 'Follow-up SMS',
    text: pickPhrase(agentDef.smsTemplates, rng, 1),
  });

  pushEvent({
    offset_minutes: stepLapseMinutes * 2,
    channel: 'sms',
    actor: 'customer',
    label: 'Customer SMS Response',
    text: finalCustomerReply,
  });

  pushEvent({
    offset_minutes: stepLapseMinutes * 3 + 5,
    channel: 'sms',
    actor: 'agent',
    label: 'Wrap-up SMS',
    text: pickPhrase(agentDef.smsTemplates, rng, 2),
  });

  const callLogInsert = await supabase
    .from('call_logs')
    .insert({
      user_id: userData.user.id,
      organization_id: organizationId,
      lead_id: leadId,
      status: 'completed',
      outcome: finalDisposition,
      provider: 'simulator',
      call_type: 'simulation',
      duration_seconds: 180,
      started_at: new Date(Date.now() - totalMinutes * 60_000).toISOString(),
      ended_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (callLogInsert.error) {
    return new Response(
      JSON.stringify({ success: false, error: `Failed to create simulation call log: ${callLogInsert.error.message}` }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }

  const callLogId = callLogInsert.data?.id || '';
  let dispositionApplied = false;
  let actions: string[] = [];

  const dispositionResponse = await fetch(`${supabaseUrl}/functions/v1/disposition-router`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'process_disposition',
      leadId,
      userId: userData.user.id,
      dispositionName: finalDisposition,
      dispositionId: null,
      callId: callLogId,
      callOutcome: finalDisposition,
      transcript: events.map((event) => `${event.actor}: ${event.text}`).join('\n'),
      setBy: 'ai',
    }),
  });

  if (!dispositionResponse.ok) {
    const statusText = await dispositionResponse.text().catch(() => '');
    return new Response(
      JSON.stringify({ success: false, error: `disposition-router returned ${dispositionResponse.status}: ${statusText}` }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }

  const dispositionBody = await dispositionResponse.json().catch(() => null);
  if (dispositionBody?.success) {
    dispositionApplied = true;
    actions = Array.isArray(dispositionBody.actions) ? dispositionBody.actions : [];
  }

  if (!dispositionApplied) {
    const fallbackStatus = finalDisposition.toLowerCase().replace(/\s+/g, '_');
    const fallback = await supabase
      .from('leads')
      .update({ status: fallbackStatus })
      .eq('id', leadId);

    if (fallback.error) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Fallback disposition write failed: ${fallback.error.message}`,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    actions.push('Fallback status update applied');
  }

  const pipelineAfter = await addLeadPipeline();
  const leadAfter = await supabase
    .from('leads')
    .select('status')
    .eq('id', leadId)
    .single();

  const workflowProgressAfter = await supabase
    .from('lead_workflow_progress')
    .select('status')
    .eq('lead_id', leadId)
    .eq('user_id', userData.user.id);
  const activeAfter = (workflowProgressAfter.data || []).filter((row: { status: string }) => row.status === 'active');
  const workflowProgressRemoved = ((workflowProgressBefore.data || []).length > 0) && activeAfter.length === 0;
  const transcript = events.map((event) => {
    const actor = event.actor === 'agent' ? '[Agent]' : '[Customer]';
    return `${event.offset_minutes}m ${event.channel.toUpperCase()} ${actor} ${event.text}`;
  }).join('\n');
  const recommendations = buildRecommendations(finalDisposition, forceDisposition, agentDef, customerDef, events);

  return new Response(
    JSON.stringify({
      success: true,
      runId: `sim-${seed}-${Date.now()}`,
      seedUsed: explicitSeed || String(seed),
      leadId,
      callLogId,
      organizationId,
      disposition: finalDisposition,
      forceDispositionUsed: Boolean(forceDisposition),
      callDispositionApplied: dispositionApplied,
      callDispositionActions: actions,
      workflowProgressRemoved,
      workflowProgressId,
      workflowId,
      campaignId,
      pipelineMoved: pipelineBefore !== pipelineAfter,
      pipelineStageBefore: pipelineBefore,
      pipelineStageAfter: pipelineAfter,
      leadStatusBefore: leadBefore.data?.status || null,
      leadStatusAfter: leadAfter.data?.status || null,
      totalMinutesSimulated: totalMinutes,
      events,
      transcript,
      recommendations,
      warning:
        (!dispositionBody?.success && dispositionBody
          ? `disposition-router returned no success flag: ${JSON.stringify(dispositionBody)}`
          : undefined),
    } satisfies SimulatorResponse),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    },
  );
});
