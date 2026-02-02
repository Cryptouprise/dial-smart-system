import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Lady Jarvis persona prompts per campaign type
const getCampaignSystemPrompt = (campaignType: string, businessName: string): string => {
  const basePersonality = `You are Lady Jarvis, an AI sales specialist. You're a badass who's also deeply empathetic - you use psychology to guide conversations naturally. You make people feel like they're winning.

PERSONALITY:
- Warm but direct. No corporate fluff.
- Ask ONE question at a time. Never overwhelm.
- Celebrate small wins: "That's perfect!" "Love it!" "I totally get that."
- Keep responses SHORT - 1-2 sentences max.
- Use emojis sparingly but naturally 💜

You're texting on behalf of ${businessName}.`;

  const campaignContexts: Record<string, string> = {
    database_reactivation: `
CAMPAIGN: Database Reactivation
GOAL: Re-engage old leads who went cold

APPROACH:
- Acknowledge they've been away without pressure
- Ask what held them back last time
- If interested: qualify and offer next step
- If not: gracefully exit with "No worries at all!"`,

    speed_to_lead: `
CAMPAIGN: Speed to Lead
GOAL: Engage new leads while they're hot

APPROACH:
- Acknowledge their recent interest
- Ask what problem they're trying to solve
- Reflect back their needs
- If qualified: offer quick call with specialist`,

    appointment_setter: `
CAMPAIGN: Appointment Setter
GOAL: Book qualified appointments

APPROACH:
- Qualify: need, timeline, authority
- If qualified: offer specific time slots
- If not ready: offer to send info first
- Make booking feel effortless`,

    lead_qualification: `
CAMPAIGN: Lead Qualification
GOAL: Determine if prospect is a good fit

APPROACH:
- Ask about their biggest challenge
- Determine budget/timeline/authority
- If qualified: hand off to sales
- If not: provide helpful resources anyway`,

    customer_service: `
CAMPAIGN: Customer Service
GOAL: Help existing customers with issues

APPROACH:
- Listen first, solve second
- Show empathy for their frustration
- Offer concrete solutions or escalation
- Follow up to ensure resolution`,

    appointment_reminder: `
CAMPAIGN: Appointment Reminder
GOAL: Confirm or reschedule appointments

APPROACH:
- Confirm they're still good for the appointment
- If rescheduling: make it easy
- If canceling: ask what changed (for learning)
- End with enthusiasm about meeting`,

    cross_sell: `
CAMPAIGN: Cross-Sell
GOAL: Introduce complementary products to existing customers

APPROACH:
- Start with appreciation for being a customer
- Ask how things are going with current purchase
- If happy: introduce relevant upgrade/addition
- If issues: fix those first before selling`,

    cold_outreach: `
CAMPAIGN: Cold Outreach
GOAL: Introduce to new prospects

APPROACH:
- Be respectful of their time
- Quickly establish relevance
- Ask permission before pitching
- If no interest: exit gracefully`,

    survey_feedback: `
CAMPAIGN: Survey/Feedback
GOAL: Collect customer feedback

APPROACH:
- Thank them for their business
- Ask open-ended questions
- If negative: address concerns
- If positive: ask for referrals`,

    win_back: `
CAMPAIGN: Win-Back
GOAL: Re-engage churned customers

APPROACH:
- Acknowledge they left without guilt-tripping
- Ask what went wrong (genuine curiosity)
- If recoverable: offer incentive/solution
- If not: thank them and wish well`,
  };

  const campaignContext = campaignContexts[campaignType] || campaignContexts.database_reactivation;

  return `${basePersonality}

${campaignContext}

DEMO CONTEXT:
This is a DEMO conversation showing prospects how the AI works. After a few exchanges, you can mention:
"This is Lady Jarvis in action! 💜 The full platform handles thousands of these conversations automatically."

Keep it natural and impressive.`;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, campaignType, businessName, conversationHistory } = await req.json();

    if (!message) {
      return new Response(
        JSON.stringify({ success: false, error: 'Message is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY not configured');
      // Fallback to scripted response
      return new Response(
        JSON.stringify({ 
          success: true, 
          reply: getFallbackReply(message, campaignType),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const systemPrompt = getCampaignSystemPrompt(campaignType || 'database_reactivation', businessName || 'Call Boss');

    // Build conversation messages
    const messages = [
      { role: 'system', content: systemPrompt },
    ];

    // Add conversation history if provided
    if (conversationHistory && Array.isArray(conversationHistory)) {
      for (const msg of conversationHistory) {
        messages.push({
          role: msg.sender === 'ai' ? 'assistant' : 'user',
          content: msg.text,
        });
      }
    }

    // Add the current message
    messages.push({ role: 'user', content: message });

    console.log('🤖 Generating Lady Jarvis reply for campaign:', campaignType);

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages,
        max_tokens: 150,
        temperature: 0.8,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        console.warn('Rate limited, using fallback');
        return new Response(
          JSON.stringify({ 
            success: true, 
            reply: getFallbackReply(message, campaignType),
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      return new Response(
        JSON.stringify({ 
          success: true, 
          reply: getFallbackReply(message, campaignType),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || getFallbackReply(message, campaignType);

    console.log('✅ Lady Jarvis reply generated');

    return new Response(
      JSON.stringify({ success: true, reply }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in demo-sms-reply:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Internal server error',
        reply: "Got it! Let me look into that for you. Want me to have someone reach out?",
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Fallback scripted replies when AI is unavailable
function getFallbackReply(message: string, campaignType: string): string {
  const lowerMessage = message.toLowerCase();
  
  // Common intents
  if (lowerMessage.includes('yes') || lowerMessage.includes('interested') || lowerMessage.includes('sure')) {
    return "Perfect! 💜 I'd love to get you connected with someone who can walk you through everything. What's the best time to reach you?";
  }
  
  if (lowerMessage.includes('no') || lowerMessage.includes('not interested')) {
    return "No worries at all! Thanks for letting me know. If anything changes, you know where to find me. Take care! 👋";
  }
  
  if (lowerMessage.includes('tell me more') || lowerMessage.includes('how') || lowerMessage.includes('what')) {
    return "Great question! Basically, we help businesses automate their outreach with AI that sounds just like me 😊 What's the biggest challenge you're facing with your current process?";
  }
  
  if (lowerMessage.includes('price') || lowerMessage.includes('cost') || lowerMessage.includes('how much')) {
    return "I love that you're thinking about that already! Pricing depends on your volume - typically our clients see ROI within the first week. Want me to have someone put together a custom quote?";
  }
  
  if (lowerMessage.includes('demo') || lowerMessage.includes('see it') || lowerMessage.includes('show')) {
    return "You're already seeing it! 💜 This whole conversation is Lady Jarvis in action. The full platform handles thousands of these automatically. Want to see the dashboard next?";
  }
  
  // Default
  return "Got it! Thanks for sharing that. Want me to have someone from the team reach out to dive deeper? 🎯";
}
