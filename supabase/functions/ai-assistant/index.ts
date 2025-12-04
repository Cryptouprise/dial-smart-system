/**
 * AI Assistant Edge Function
 * 
 * An intelligent chatbot with FULL analytics access to the Smart Dialer system.
 * Can answer questions, provide analytics, and guide users to perform actions.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_KNOWLEDGE = `You are the Smart Dialer AI Assistant - an expert analyst with FULL ACCESS to the system's database and analytics.

## YOUR CAPABILITIES
You have real-time access to:
- All call logs (status, duration, outcomes, timestamps)
- All leads and their pipeline positions
- All SMS messages sent/received
- All campaigns and their performance
- Phone number health and spam status
- Appointment bookings and conversion rates

## ANALYTICS YOU CAN PROVIDE
When users ask analytical questions, use the LIVE DATA provided below to give accurate answers:
- "How many calls today?" → Use the call_logs data
- "What's our answer rate?" → Calculate from calls_connected / calls_attempted
- "How many appointments booked?" → Count leads with 'appointment_set' or 'booked' status
- "Rate the appointments" → Analyze lead quality based on notes, call duration, follow-ups
- "Campaign performance?" → Use campaign stats and call outcomes
- "SMS response rate?" → Calculate from inbound vs outbound messages

## HOW TO INTERPRET DATA
- **Call Outcomes**: 'connected', 'no_answer', 'busy', 'voicemail', 'callback', 'appointment_set', 'not_interested', 'dnc'
- **Lead Status**: 'new', 'contacted', 'qualified', 'appointment_set', 'closed_won', 'closed_lost'
- **Call Quality**: Longer duration (>60s) typically means engaged conversation
- **Good Appointment**: Has notes, has follow-up scheduled, lead status is 'appointment_set' or better

## RATING SYSTEM (1-10)
When asked to rate appointments or leads:
- 10: Closed deal, payment received
- 8-9: Appointment confirmed, high engagement, detailed notes
- 6-7: Appointment set, moderate engagement
- 4-5: Callback scheduled, showed interest
- 2-3: Brief contact, minimal interest
- 1: No answer or not interested

## SYSTEM OVERVIEW
Smart Dialer is a comprehensive call center management platform:
- **Phone Number Management**: Purchase, import, manage numbers from Twilio
- **Predictive Dialing**: AI-powered campaigns with automatic pacing
- **Retell AI Integration**: AI voice agents for automated calling
- **Go High Level (GHL) Integration**: CRM sync and lead management
- **SMS Messaging**: Send/receive texts with AI auto-response
- **Pipeline Management**: Kanban-style lead tracking

## DASHBOARD TABS
1. **Overview**: Quick stats, phone numbers, purchase new numbers
2. **Pipeline**: Kanban board for lead management
3. **Predictive Dialing**: Configure and run campaigns
4. **Retell AI**: Manage AI agents and LLMs
5. **Go High Level**: CRM connection and sync
6. **Analytics**: Call metrics and performance charts
7. **AI Engine**: AI recommendations for optimization
8. **Rotation**: Configure number rotation rules
9. **Spam**: View spam scores, quarantine numbers
10. **SMS**: Send messages, AI auto-responses

Be analytical, precise, and data-driven. When users ask for numbers, give exact figures from the data. When asked to rate or analyze, explain your reasoning.`;

interface AnalyticsData {
  callsToday: any[];
  callsThisWeek: any[];
  allCalls: any[];
  leads: any[];
  leadsWithAppointments: any[];
  campaigns: any[];
  smsMessages: any[];
  phoneNumbers: any[];
  pipelinePositions: any[];
  summary: {
    totalCalls: number;
    callsToday: number;
    callsThisWeek: number;
    connectedCalls: number;
    answerRate: number;
    avgCallDuration: number;
    appointmentsSet: number;
    totalLeads: number;
    activeLeads: number;
    smsSent: number;
    smsReceived: number;
    activeCampaigns: number;
    activeNumbers: number;
    quarantinedNumbers: number;
  };
}

async function fetchAnalytics(supabase: any, userId?: string): Promise<AnalyticsData> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Fetch all data in parallel
  const [
    callsToday,
    callsThisWeek,
    allCalls,
    leads,
    campaigns,
    smsMessages,
    phoneNumbers,
    pipelinePositions
  ] = await Promise.all([
    supabase.from('call_logs').select('*').gte('created_at', todayStart).order('created_at', { ascending: false }),
    supabase.from('call_logs').select('*').gte('created_at', weekStart).order('created_at', { ascending: false }),
    supabase.from('call_logs').select('*').order('created_at', { ascending: false }).limit(500),
    supabase.from('leads').select('*').order('updated_at', { ascending: false }),
    supabase.from('campaigns').select('*'),
    supabase.from('sms_messages').select('*').order('created_at', { ascending: false }).limit(500),
    supabase.from('phone_numbers').select('*'),
    supabase.from('lead_pipeline_positions').select('*, pipeline_boards(name)').order('moved_at', { ascending: false })
  ]);

  const callsTodayData = callsToday.data || [];
  const callsThisWeekData = callsThisWeek.data || [];
  const allCallsData = allCalls.data || [];
  const leadsData = leads.data || [];
  const campaignsData = campaigns.data || [];
  const smsData = smsMessages.data || [];
  const numbersData = phoneNumbers.data || [];
  const pipelineData = pipelinePositions.data || [];

  // Calculate metrics
  const connectedCalls = allCallsData.filter((c: any) => 
    c.status === 'completed' || c.outcome === 'connected' || c.outcome === 'appointment_set'
  ).length;
  
  const appointmentsSet = leadsData.filter((l: any) => 
    l.status === 'appointment_set' || l.status === 'qualified' || l.status === 'closed_won'
  ).length;

  const totalDuration = allCallsData.reduce((sum: number, c: any) => sum + (c.duration_seconds || 0), 0);

  return {
    callsToday: callsTodayData,
    callsThisWeek: callsThisWeekData,
    allCalls: allCallsData,
    leads: leadsData,
    leadsWithAppointments: leadsData.filter((l: any) => 
      l.status === 'appointment_set' || l.next_callback_at
    ),
    campaigns: campaignsData,
    smsMessages: smsData,
    phoneNumbers: numbersData,
    pipelinePositions: pipelineData,
    summary: {
      totalCalls: allCallsData.length,
      callsToday: callsTodayData.length,
      callsThisWeek: callsThisWeekData.length,
      connectedCalls,
      answerRate: allCallsData.length > 0 ? Math.round((connectedCalls / allCallsData.length) * 100) : 0,
      avgCallDuration: allCallsData.length > 0 ? Math.round(totalDuration / allCallsData.length) : 0,
      appointmentsSet,
      totalLeads: leadsData.length,
      activeLeads: leadsData.filter((l: any) => l.status !== 'closed_lost' && l.status !== 'dnc').length,
      smsSent: smsData.filter((m: any) => m.direction === 'outbound').length,
      smsReceived: smsData.filter((m: any) => m.direction === 'inbound').length,
      activeCampaigns: campaignsData.filter((c: any) => c.status === 'active' || c.status === 'running').length,
      activeNumbers: numbersData.filter((n: any) => n.status === 'active' && !n.is_spam).length,
      quarantinedNumbers: numbersData.filter((n: any) => n.quarantine_until || n.is_spam).length
    }
  };
}

function formatAnalyticsContext(analytics: AnalyticsData): string {
  const { summary, callsToday, leadsWithAppointments, allCalls } = analytics;
  
  // Get recent call outcomes breakdown
  const outcomeBreakdown = allCalls.reduce((acc: any, call: any) => {
    const outcome = call.outcome || call.status || 'unknown';
    acc[outcome] = (acc[outcome] || 0) + 1;
    return acc;
  }, {});

  // Get today's detailed breakdown
  const todayOutcomes = callsToday.reduce((acc: any, call: any) => {
    const outcome = call.outcome || call.status || 'unknown';
    acc[outcome] = (acc[outcome] || 0) + 1;
    return acc;
  }, {});

  // Rate appointments
  const ratedAppointments = leadsWithAppointments.map((lead: any) => {
    let rating = 5; // Base rating
    if (lead.status === 'closed_won') rating = 10;
    else if (lead.status === 'appointment_set') rating = 7;
    else if (lead.status === 'qualified') rating = 6;
    if (lead.notes && lead.notes.length > 50) rating += 1;
    if (lead.next_callback_at) rating += 1;
    return {
      name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || 'Unknown',
      phone: lead.phone_number,
      status: lead.status,
      rating: Math.min(rating, 10),
      notes: lead.notes?.substring(0, 100),
      nextCallback: lead.next_callback_at
    };
  });

  return `

## LIVE ANALYTICS DATA (Real-time from database)

### SUMMARY STATS
- **Total Calls (all time)**: ${summary.totalCalls}
- **Calls Today**: ${summary.callsToday}
- **Calls This Week**: ${summary.callsThisWeek}
- **Connected Calls**: ${summary.connectedCalls}
- **Answer Rate**: ${summary.answerRate}%
- **Avg Call Duration**: ${summary.avgCallDuration} seconds
- **Appointments Set**: ${summary.appointmentsSet}
- **Total Leads**: ${summary.totalLeads}
- **Active Leads**: ${summary.activeLeads}
- **SMS Sent**: ${summary.smsSent}
- **SMS Received**: ${summary.smsReceived}
- **Active Campaigns**: ${summary.activeCampaigns}
- **Active Phone Numbers**: ${summary.activeNumbers}
- **Quarantined Numbers**: ${summary.quarantinedNumbers}

### TODAY'S CALLS BREAKDOWN
${Object.entries(todayOutcomes).map(([outcome, count]) => `- ${outcome}: ${count}`).join('\n') || '- No calls today yet'}

### ALL-TIME OUTCOME BREAKDOWN
${Object.entries(outcomeBreakdown).map(([outcome, count]) => `- ${outcome}: ${count}`).join('\n') || '- No call data available'}

### APPOINTMENTS & RATED LEADS (${ratedAppointments.length} total)
${ratedAppointments.slice(0, 10).map((apt: any) => 
  `- **${apt.name}** (${apt.phone}): Status=${apt.status}, Rating=${apt.rating}/10${apt.nextCallback ? ', Callback scheduled' : ''}`
).join('\n') || '- No appointments found'}

### RECENT CALL DETAILS (Last 5)
${callsToday.slice(0, 5).map((call: any) => 
  `- ${call.phone_number}: ${call.outcome || call.status}, Duration: ${call.duration_seconds || 0}s, ${new Date(call.created_at).toLocaleTimeString()}`
).join('\n') || '- No recent calls'}
`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, conversationHistory = [] } = await req.json();

    if (!message) {
      return new Response(
        JSON.stringify({ error: 'Message is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      console.error('[AI Assistant] LOVABLE_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch comprehensive analytics
    let analyticsContext = '';
    let analytics: AnalyticsData | null = null;
    
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      
      if (supabaseUrl && serviceRoleKey) {
        const supabase = createClient(supabaseUrl, serviceRoleKey);
        analytics = await fetchAnalytics(supabase);
        analyticsContext = formatAnalyticsContext(analytics);
        console.log('[AI Assistant] Analytics fetched:', analytics.summary);
      }
    } catch (e) {
      console.error('[AI Assistant] Analytics fetch error:', e);
      analyticsContext = '\n\n[Analytics temporarily unavailable]';
    }

    // Build messages array with full context
    const messages = [
      { role: 'system', content: SYSTEM_KNOWLEDGE + analyticsContext },
      ...conversationHistory.slice(-10),
      { role: 'user', content: message }
    ];

    console.log('[AI Assistant] Processing:', message.substring(0, 100));

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages,
        max_tokens: 1500,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits depleted. Please add credits to continue.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errorText = await response.text();
      console.error('[AI Assistant] AI gateway error:', response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const assistantMessage = data.choices?.[0]?.message?.content || 'Sorry, I could not generate a response.';

    console.log('[AI Assistant] Response generated successfully');

    return new Response(
      JSON.stringify({ 
        response: assistantMessage,
        analytics: analytics?.summary,
        usage: data.usage 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[AI Assistant] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'An error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
