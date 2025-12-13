
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get('Authorization')!
    const token = authHeader.replace('Bearer ', '')
    const { data: { user } } = await supabaseAdmin.auth.getUser(token)

    if (!user) {
      throw new Error('Unauthorized')
    }

    const { callId, transcript } = await req.json()

    if (!callId || !transcript) {
      throw new Error('Missing required parameters: callId and transcript')
    }

    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY not configured')
    }

    // Analyze transcript with Lovable AI
    const analysisResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
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
      }),
    })

    if (!analysisResponse.ok) {
      const errorText = await analysisResponse.text();
      console.error('[Analyze Transcript] AI API error:', errorText);
      throw new Error(`AI API error: ${analysisResponse.status}`)
    }

    const analysisData = await analysisResponse.json()
    const content = analysisData.choices?.[0]?.message?.content;
    
    // Parse JSON from response (handle markdown code blocks)
    let aiAnalysis;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      aiAnalysis = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(content);
    } catch (parseError) {
      console.error('[Analyze Transcript] Failed to parse AI response:', content);
      throw new Error('Failed to parse AI analysis response');
    }

    // Update call log with analysis
    const { error: updateError } = await supabaseAdmin
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
    const { data: callData } = await supabaseAdmin
      .from('call_logs')
      .select('lead_id')
      .eq('id', callId)
      .eq('user_id', user.id)
      .single()

    if (callData?.lead_id) {
      // Get the appropriate pipeline board for this disposition
      const { data: dispositionData } = await supabaseAdmin
        .from('dispositions')
        .select('id, pipeline_stage')
        .eq('name', aiAnalysis.disposition)
        .eq('user_id', user.id)
        .maybeSingle()

      if (dispositionData) {
        const { data: pipelineBoard } = await supabaseAdmin
          .from('pipeline_boards')
          .select('id')
          .eq('disposition_id', dispositionData.id)
          .eq('user_id', user.id)
          .maybeSingle()

        if (pipelineBoard) {
          // Move lead to appropriate pipeline position
          await supabaseAdmin
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

      await supabaseAdmin
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

  } catch (error: unknown) {
    console.error('Error analyzing transcript:', error)
    return new Response(
      JSON.stringify({ 
        error: (error as Error).message,
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
