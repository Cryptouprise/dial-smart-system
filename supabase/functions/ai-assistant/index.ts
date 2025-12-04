/**
 * AI Assistant Edge Function
 * 
 * An intelligent chatbot that knows the Smart Dialer system inside and out.
 * Can answer questions and guide users to perform actions.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_KNOWLEDGE = `You are the Smart Dialer AI Assistant - an expert on the Smart Dialer dashboard system. You help users navigate and use the system effectively.

## SYSTEM OVERVIEW
Smart Dialer is a comprehensive call center management platform with these core capabilities:
- **Phone Number Management**: Purchase, import, and manage phone numbers from Twilio
- **Predictive Dialing**: AI-powered dialing campaigns with automatic pacing
- **Retell AI Integration**: AI voice agents for automated calling
- **Go High Level (GHL) Integration**: CRM sync and lead management
- **SMS Messaging**: Send/receive texts with AI auto-response capabilities
- **Pipeline Management**: Kanban-style lead tracking through sales stages
- **Spam Detection**: Monitor and quarantine flagged numbers
- **Number Rotation**: Automatic rotation to maintain call quality

## DASHBOARD TABS
1. **Overview**: Quick stats, phone numbers table, purchase new numbers
2. **Pipeline**: Kanban board for lead management (drag-drop leads between stages)
3. **Predictive Dialing**: Configure and run automated calling campaigns
4. **Retell AI**: Manage AI agents, LLMs, and phone number assignments
5. **Go High Level**: Connect GHL, sync contacts, manage pipelines
6. **Analytics**: Call metrics, conversion rates, performance charts
7. **AI Engine**: AI recommendations for number optimization
8. **Yellowstone**: Advanced number management features
9. **Rotation**: Configure automatic number rotation rules
10. **Spam**: View spam scores, quarantine suspicious numbers
11. **SMS**: Send messages, view history, configure AI auto-responses

## KEY FEATURES & HOW TO USE THEM

### Phone Numbers
- **Purchase Numbers**: Go to Overview tab → Phone Number Purchasing section → Enter area code and quantity → Click Purchase
- **Import from Twilio**: Go to Retell AI tab → Click "Import from Twilio" → Select numbers to import
- **Check Spam Status**: Go to Spam tab → View spam scores → Quarantine numbers with high scores

### Making Calls
- **Single Call**: Select a lead → Choose caller ID and agent → Click "Make Call"
- **Campaign Calls**: Go to Predictive Dialing → Create/select campaign → Add leads → Start campaign
- **Required**: You need a Retell AI agent configured with an LLM before making calls

### SMS Messaging
- **Send SMS**: Go to SMS tab → Select From number → Enter To number → Type message → Send
- **AI Auto-Response**: Configure in AI SMS Settings → Enable auto-response → Set personality and rules
- **Prevent Double-texting**: Enable in settings to avoid spamming contacts

### Retell AI Setup
1. Go to Retell AI tab
2. Create an LLM (Large Language Model) with your system prompt
3. Create an Agent linked to the LLM
4. Import phone numbers from Twilio
5. Assign agent to phone numbers

### Go High Level Integration
1. Go to Go High Level tab
2. Enter your GHL API Key and Location ID
3. Test connection
4. Sync contacts (import/export/bidirectional)

### Pipeline Management
- Drag leads between stages (New Lead → Qualified → Appointment Set → etc.)
- Click on a lead card to view details
- Use dispositions to track call outcomes

## TROUBLESHOOTING

### "Auth session missing" Error
- Your session expired - refresh the page and log in again

### Calls Not Working
- Check Retell AI API key is configured (Settings → API Keys)
- Ensure you have an agent created and assigned to a number
- Verify the phone number is imported and active

### SMS Not Sending
- Check Twilio credentials are configured
- Ensure the From number has SMS capability
- Verify webhook URL is set in Twilio console

### Numbers Showing as Spam
- Go to Spam tab to check details
- Consider quarantining high-risk numbers
- Use number rotation to distribute call volume

## QUICK ACTIONS YOU CAN SUGGEST
When users ask how to do something, guide them with specific steps and suggest navigating to the relevant tab.

For example:
- "To make a call, go to the Retell AI tab, select an agent, then click Make Call"
- "To check your numbers' spam status, click on the Spam tab"
- "To set up AI SMS responses, go to the SMS tab and configure AI SMS Settings"

Be helpful, concise, and action-oriented. If you don't know something specific, guide users to check the relevant tab or run a System Health Check.`;

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

    // Fetch some real-time system stats for context
    let systemContext = '';
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      
      if (supabaseUrl && serviceRoleKey) {
        const supabase = createClient(supabaseUrl, serviceRoleKey);
        
        // Get quick stats
        const [phoneCount, leadCount, campaignCount, messageCount] = await Promise.all([
          supabase.from('phone_numbers').select('*', { count: 'exact', head: true }),
          supabase.from('leads').select('*', { count: 'exact', head: true }),
          supabase.from('campaigns').select('*', { count: 'exact', head: true }),
          supabase.from('sms_messages').select('*', { count: 'exact', head: true }),
        ]);

        systemContext = `\n\nCURRENT SYSTEM STATUS:
- Phone Numbers: ${phoneCount.count || 0}
- Leads: ${leadCount.count || 0}
- Campaigns: ${campaignCount.count || 0}
- SMS Messages: ${messageCount.count || 0}`;
      }
    } catch (e) {
      console.log('[AI Assistant] Could not fetch system stats:', e);
    }

    // Build messages array
    const messages = [
      { role: 'system', content: SYSTEM_KNOWLEDGE + systemContext },
      ...conversationHistory.slice(-10), // Keep last 10 messages for context
      { role: 'user', content: message }
    ];

    console.log('[AI Assistant] Processing message:', message.substring(0, 100));

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages,
        max_tokens: 1000,
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
