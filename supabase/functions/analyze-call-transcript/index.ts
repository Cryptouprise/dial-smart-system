
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    const authHeader = req.headers.get('Authorization')!
    const token = authHeader.replace('Bearer ', '')
    const { data: { user } } = await supabaseClient.auth.getUser(token)

    if (!user) {
      throw new Error('Unauthorized')
    }

    const { callId, transcript, openaiApiKey } = await req.json()

    if (!callId || !transcript || !openaiApiKey) {
      throw new Error('Missing required parameters: callId, transcript, or openaiApiKey')
    }

    // Analyze transcript with OpenAI
    const analysisResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `You are an expert call analyzer for sales and lead qualification calls. Analyze the conversation transcript and determine the most appropriate disposition.

Available dispositions:
- Interested: Lead showed genuine interest and wants to proceed
- Not Interested: Lead explicitly stated they're not interested
- Appointment Booked: Successfully scheduled an appointment or meeting
- Wrong Number: Incorrect contact info or wrong person reached
- Callback Requested: Lead asked to be called back at a specific time
- Voicemail: Left voicemail message (no conversation)
- Do Not Call: Lead requested to be removed from calling list

Respond with a JSON object containing:
{
  "disposition": "one of the above dispositions",
  "confidence": 0.95,
  "reasoning": "brief explanation of why this disposition was chosen",
  "key_points": ["array", "of", "important", "conversation", "highlights"],
  "next_action": "recommended follow-up action",
  "sentiment": "positive/neutral/negative",
  "pain_points": ["identified", "pain", "points"],
  "objections": ["any", "objections", "raised"]
}`
          },
          {
            role: 'user',
            content: `Please analyze this call transcript and provide the disposition:\n\n${transcript}`
          }
        ],
        temperature: 0.1,
        max_tokens: 1000,
      }),
    })

    if (!analysisResponse.ok) {
      throw new Error(`OpenAI API error: ${analysisResponse.statusText}`)
    }

    const analysisData = await analysisResponse.json()
    const aiAnalysis = JSON.parse(analysisData.choices[0].message.content)

    // Update call log with analysis
    const { error: updateError } = await supabaseClient
      .from('call_logs')
      .update({
        transcript,
        ai_analysis: aiAnalysis,
        auto_disposition: aiAnalysis.disposition,
        confidence_score: aiAnalysis.confidence,
        outcome: aiAnalysis.disposition
      })
      .eq('id', callId)
      .eq('user_id', user.id)

    if (updateError) {
      throw updateError
    }

    // Get the lead associated with this call
    const { data: callData } = await supabaseClient
      .from('call_logs')
      .select('lead_id')
      .eq('id', callId)
      .eq('user_id', user.id)
      .single()

    if (callData?.lead_id) {
      // Get the appropriate pipeline board for this disposition
      const { data: dispositionData } = await supabaseClient
        .from('dispositions')
        .select('id, pipeline_stage')
        .eq('name', aiAnalysis.disposition)
        .eq('user_id', user.id)
        .single()

      if (dispositionData) {
        const { data: pipelineBoard } = await supabaseClient
          .from('pipeline_boards')
          .select('id')
          .eq('disposition_id', dispositionData.id)
          .eq('user_id', user.id)
          .single()

        if (pipelineBoard) {
          // Move lead to appropriate pipeline position
          await supabaseClient
            .from('lead_pipeline_positions')
            .upsert({
              user_id: user.id,
              lead_id: callData.lead_id,
              pipeline_board_id: pipelineBoard.id,
              position: 0,
              moved_by_user: false,
              notes: `Auto-moved based on AI analysis: ${aiAnalysis.reasoning}`
            })
        }
      }

      // Update lead status and next callback if needed
      const leadUpdate: any = {
        status: aiAnalysis.disposition.toLowerCase().replace(' ', '_'),
        last_contacted_at: new Date().toISOString(),
        notes: aiAnalysis.key_points.join('; ')
      }

      if (aiAnalysis.disposition === 'Callback Requested') {
        // Set callback for tomorrow at 2 PM
        const tomorrow = new Date()
        tomorrow.setDate(tomorrow.getDate() + 1)
        tomorrow.setHours(14, 0, 0, 0)
        leadUpdate.next_callback_at = tomorrow.toISOString()
      }

      await supabaseClient
        .from('leads')
        .update(leadUpdate)
        .eq('id', callData.lead_id)
        .eq('user_id', user.id)
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        analysis: aiAnalysis,
        message: 'Call analyzed and processed successfully'
      }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    )

  } catch (error) {
    console.error('Error analyzing transcript:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: 'Failed to analyze call transcript'
      }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        }, 
        status: 400 
      }
    )
  }
})
