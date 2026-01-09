
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: 'Supabase configuration missing' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);

    if (!user) {
      throw new Error('Unauthorized')
    }

    const body = await req.json();
    const { action, callId, transcript, script, transcripts } = body;

    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY not configured')
    }

    // Handle script comparison action
    if (action === 'compare_to_script') {
      if (!script || !transcripts || transcripts.length === 0) {
        throw new Error('Missing required parameters: script and transcripts');
      }

      const comparisonResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
              content: `You are an expert sales script optimizer. Analyze multiple call transcripts and compare them against the intended agent script. Identify patterns, deviations, and suggest improvements.

Respond with a JSON object:
{
  "script_adherence_score": 0.75, // 0-1 score of how well calls follow the script
  "improvements": [
    {
      "title": "Improvement title",
      "suggestion": "Detailed suggestion for script improvement",
      "example": "Example script text to add/modify"
    }
  ],
  "common_deviations": ["List of common ways calls deviate from script"],
  "best_practices": ["What's working well in calls that should be kept"],
  "objection_patterns": ["Common objections that script doesn't address"],
  "tone_analysis": "Analysis of tone differences between script and actual calls"
}`
            },
            {
              role: 'user',
              content: `AGENT SCRIPT:\n${script}\n\nCALL TRANSCRIPTS (${transcripts.length} calls):\n${transcripts.map((t: any, i: number) => 
                `--- Call ${i + 1} (${t.sentiment || 'unknown'} sentiment, outcome: ${t.outcome || 'unknown'}, ${t.duration || 0}s) ---\n${t.transcript}`
              ).join('\n\n')}`
            }
          ],
        }),
      });

      if (!comparisonResponse.ok) {
        throw new Error(`AI API error: ${comparisonResponse.status}`);
      }

      const comparisonData = await comparisonResponse.json();
      const content = comparisonData.choices?.[0]?.message?.content;
      
      let comparison;
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        comparison = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(content);
      } catch (parseError) {
        console.error('[Script Comparison] Failed to parse AI response:', content);
        throw new Error('Failed to parse AI comparison response');
      }

      return new Response(
        JSON.stringify(comparison),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Standard transcript analysis
    if (!callId || !transcript) {
      throw new Error('Missing required parameters: callId and transcript')
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

Available dispositions (choose the most accurate one):

POSITIVE OUTCOMES:
- Appointment Booked: Successfully scheduled an appointment or meeting
- Hot Lead: Extremely interested, wants to move forward immediately, high urgency
- Interested: Showed genuine interest, wants more information

CALLBACK/FOLLOW-UP:
- Callback Requested: Lead asked to be called back at a specific time
- Follow Up: Needs more time to think, research, or discuss with family - but not a firm callback request
- Potential Prospect: Lukewarm interest, may be worth nurturing over time

NEUTRAL/NO CONTACT:
- Voicemail: Left voicemail or reached answering machine
- Not Connected: Line rang but no answer, busy signal, or call failed
- Dropped Call: Call connected but dropped/disconnected unexpectedly

NEGATIVE/DISQUALIFIED:
- Not Interested: Explicitly stated not interested
- Wrong Number: Incorrect contact info or wrong person reached
- Already Has Solar: Lead already has solar panels installed (or already has the service being offered)
- Renter: Lead is renting, not the homeowner - cannot make installation decisions
- Do Not Call: Lead requested to be removed from calling list (DNC)

SPECIAL:
- Dial Tree Workflow: Reached an IVR/automated system, transferred, or in process

Respond with a JSON object containing:
{
  "disposition": "one of the above dispositions",
  "confidence": 0.95,
  "reasoning": "brief explanation of why this disposition was chosen",
  "key_points": ["array", "of", "important", "conversation", "highlights"],
  "next_action": "recommended follow-up action",
  "sentiment": "positive/neutral/negative",
  "pain_points": ["identified", "pain", "points"],
  "objections": ["any", "objections", "raised"],
  "disqualification_reason": "only if disqualified - e.g., 'renter', 'already_has_solar', 'wrong_number'"
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
      
      // FALLBACK: Set disposition based on call duration if AI fails
      const { data: callData } = await supabaseAdmin
        .from('call_logs')
        .select('duration_seconds, status')
        .eq('id', callId)
        .maybeSingle();
      
      const duration = callData?.duration_seconds || 0;
      const fallbackAnalysis = {
        disposition: duration > 30 ? 'Connected - Manual Review Needed' : 'No Answer',
        confidence: 0.3,
        reasoning: `AI analysis failed (${analysisResponse.status}). Auto-classified by duration: ${duration}s`,
        key_points: ['AI analysis unavailable - manual review recommended'],
        next_action: 'Manual review required',
        sentiment: 'neutral',
        pain_points: [],
        objections: []
      };
      
      // Update with fallback
      await supabaseAdmin
        .from('call_logs')
        .update({
          transcript,
          ai_analysis: fallbackAnalysis,
          auto_disposition: fallbackAnalysis.disposition,
          confidence_score: fallbackAnalysis.confidence,
          outcome: fallbackAnalysis.disposition,
          ai_analysis_error: errorText
        })
        .eq('id', callId);
      
      // Log error
      await supabaseAdmin.from('edge_function_errors').insert({
        function_name: 'analyze-call-transcript',
        action: 'ai_analysis',
        user_id: user.id,
        error_message: `AI API error ${analysisResponse.status}`,
        error_stack: errorText,
        request_payload: { callId, transcriptLength: transcript?.length },
        severity: 'warning'
      });
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          analysis: fallbackAnalysis,
          message: 'Call analyzed with fallback disposition (AI unavailable)',
          ai_failed: true
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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

    // Update call log with analysis including all new columns
    const { error: updateError } = await supabaseAdmin
      .from('call_logs')
      .update({
        transcript,
        ai_analysis: aiAnalysis,
        auto_disposition: aiAnalysis.disposition,
        confidence_score: aiAnalysis.confidence,
        sentiment: aiAnalysis.sentiment || null,
        call_summary: aiAnalysis.key_points?.join('. ') || null,
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
      .maybeSingle()

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

      // Record learning data for continuous improvement
      try {
        await supabaseAdmin
          .from('ml_learning_data')
          .insert({
            user_id: user.id,
            call_id: callId,
            lead_id: callData.lead_id,
            call_outcome: aiAnalysis.disposition,
            disposition: aiAnalysis.disposition,
            sentiment_score: aiAnalysis.sentiment === 'positive' ? 0.8 : aiAnalysis.sentiment === 'negative' ? 0.2 : 0.5,
            confidence_score: aiAnalysis.confidence,
            key_points: aiAnalysis.key_points,
            objections: aiAnalysis.objections,
            pain_points: aiAnalysis.pain_points,
            created_at: new Date().toISOString()
          });
      } catch (learningError) {
        console.error('Error recording learning data:', learningError);
        // Don't fail the main operation if learning fails
      }
      
      // Call disposition-router to handle auto-actions and metrics tracking
      const dispositionRouterResult = await supabaseAdmin.functions.invoke('disposition-router', {
        body: {
          action: 'process_disposition',
          leadId: callData.lead_id,
          userId: user.id,
          dispositionName: aiAnalysis.disposition,
          dispositionId: dispositionData?.id || null,
          callOutcome: aiAnalysis.disposition,
          transcript: transcript,
          callId: callId,
          aiConfidence: aiAnalysis.confidence,
          setBy: 'ai', // This disposition was set by AI
        },
      });
      
      if (dispositionRouterResult.error) {
        console.error('[Analyze Transcript] disposition-router error:', dispositionRouterResult.error);
        // Don't fail the whole request, just log the error
      } else {
        console.log('[Analyze Transcript] Disposition actions processed:', dispositionRouterResult.data);
      }
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
