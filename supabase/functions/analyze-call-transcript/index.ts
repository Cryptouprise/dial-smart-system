
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ============================================================================
// SCRIPT ANALYTICS HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate time wasted score for a call
 * Returns a score (0-100) and reason for time waste
 */
function calculateTimeWastedScore(
  duration: number,
  amdResult: string | null,
  outcome: string | null,
  autoDisposition: string | null,
  answeredAt: string | null,
  createdAt: string | null
): { score: number; reason: string | null } {
  let score = 0;
  let reason: string | null = null;

  // Calculate time to answer
  let timeToAnswer = 0;
  if (answeredAt && createdAt) {
    timeToAnswer = (new Date(answeredAt).getTime() - new Date(createdAt).getTime()) / 1000;
  }

  // Scenario 1: Hit voicemail after 30+ seconds of ringing (wasted 30s waiting)
  if (amdResult?.startsWith('machine') && timeToAnswer > 30) {
    score = 70;
    reason = 'vm_too_late';
  }
  // Scenario 2: Short call with no outcome (< 15s, likely immediate hangup or wrong number)
  else if (duration < 15 && (!outcome || ['no_answer', 'failed', 'unknown'].includes(outcome))) {
    score = 40;
    reason = 'short_no_outcome';
  }
  // Scenario 3: Long call with no conversion (> 5 min, no appointment)
  else if (duration > 300 && !['appointment_booked', 'interested', 'callback', 'Appointment Booked', 'Hot Lead', 'Interested', 'Callback Requested'].includes(autoDisposition || '')) {
    score = 60;
    reason = 'long_no_conversion';
  }
  // Scenario 4: Voicemail left but message too long (implied by duration > 60s on VM)
  else if (amdResult?.startsWith('machine') && duration > 60) {
    score = 50;
    reason = 'vm_message_too_long';
  }
  // Scenario 5: Human answered but hung up quickly (< 20s)
  else if (amdResult === 'human' && duration < 20) {
    score = 55;
    reason = 'quick_hangup';
  }
  // Scenario 6: Failed/busy calls (infrastructure waste)
  else if (outcome && ['failed', 'busy'].includes(outcome)) {
    score = 30;
    reason = 'call_failed';
  }

  return { score, reason };
}

/**
 * Extract the opener (first few agent lines) from a transcript
 */
function extractOpenerFromTranscript(transcript: string): string | null {
  if (!transcript || transcript.length < 10) {
    return null;
  }

  const lines = transcript.split('\n');
  let agentLines = '';
  let count = 0;

  for (const line of lines) {
    // Look for agent speech patterns
    const isAgentLine = /^(agent|assistant|ai|bot|rep):/i.test(line) ||
                        (count === 0 && line.length > 10 && !line.startsWith('Customer:') && !line.startsWith('Prospect:'));

    if (isAgentLine) {
      agentLines += ' ' + line;
      count++;
      if (count >= 3) break;
    }
  }

  // If no agent lines found, take first 500 chars
  if (agentLines.length < 10) {
    return transcript.substring(0, 500);
  }

  return agentLines.trim().substring(0, 500);
}

/**
 * Normalize opener text for comparison (lowercase, trim, remove extra spaces)
 */
function normalizeOpenerText(opener: string): string {
  if (!opener) return '';
  return opener.toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s.]/g, '')
    .trim();
}

// Map AI disposition names to valid database outcome values
// DB constraint allows: interested, not_interested, callback, callback_requested, converted, do_not_call, contacted, appointment_set, dnc, completed, voicemail, no_answer, busy, failed, unknown
function mapDispositionToOutcome(disposition: string): string {
  const mapping: Record<string, string> = {
    // Positive outcomes
    'Appointment Booked': 'appointment_set',
    'Hot Lead': 'interested',
    'Interested': 'interested',
    // Callback/Follow-up
    'Callback Requested': 'callback_requested',
    'Follow Up': 'callback',
    'Potential Prospect': 'contacted',
    // Neutral/No contact
    'Voicemail': 'voicemail',
    'Not Connected': 'no_answer',
    'Dropped Call': 'failed',
    // Negative/Disqualified
    'Not Interested': 'not_interested',
    'Wrong Number': 'failed',
    'Already Has Solar': 'not_interested',
    'Renter': 'not_interested',
    'Do Not Call': 'do_not_call',
    // Special
    'Dial Tree Workflow': 'contacted',
    // Fallbacks
    'Connected - Manual Review Needed': 'contacted',
    'No Answer': 'no_answer',
  };
  
  return mapping[disposition] || 'unknown';
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
    
    const body = await req.json();
    const { action, callId, transcript, script, transcripts, userId: bodyUserId } = body;
    
    // Support both JWT auth (user calls) and service role auth (internal calls)
    const token = authHeader.replace('Bearer ', '');
    let userId: string;
    
    if (token === serviceRoleKey) {
      // Service role call from another edge function
      if (!bodyUserId) {
        return new Response(
          JSON.stringify({ error: 'userId required for service role calls' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      userId = bodyUserId;
      console.log('[Analyze Transcript] Service role auth - userId from body:', userId);
    } else {
      // User JWT call
      const { data: { user } } = await supabaseAdmin.auth.getUser(token);
      if (!user) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized - invalid token' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      userId = user.id;
      console.log('[Analyze Transcript] JWT auth - userId:', userId);
    }

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
              content: `You are an expert AI voice agent script optimizer. Analyze multiple call transcripts and compare them against the intended agent script. Identify patterns, deviations, and suggest improvements.

IMPORTANT: Provide structured, actionable improvements categorized by script section with priority levels.

Respond with a JSON object (no markdown):
{
  "script_adherence_score": 0.75,
  "sections_analysis": {
    "opening": { "score": 0.8, "issues": ["list of issues"], "strengths": ["what works well"] },
    "qualification": { "score": 0.6, "issues": [], "strengths": [] },
    "objection_handling": { "score": 0.5, "issues": [], "strengths": [] },
    "value_proposition": { "score": 0.7, "issues": [], "strengths": [] },
    "closing": { "score": 0.7, "issues": [], "strengths": [] }
  },
  "improvements": [
    {
      "section": "opening|qualification|objection_handling|value_proposition|closing",
      "priority": "critical|important|nice-to-have",
      "title": "Short descriptive title",
      "suggestion": "Detailed explanation of the improvement needed",
      "example": "Exact script text to add or modify",
      "ai_voice_notes": "Specific guidance for AI voice delivery - tone, pacing, emphasis, pauses"
    }
  ],
  "common_deviations": ["List of common ways calls deviate from script"],
  "best_practices": ["What's working well in calls that should be kept"],
  "objection_patterns": ["Common objections that script doesn't address well"],
  "tone_analysis": "Analysis of tone differences between script and actual calls",
  "voice_agent_recommendations": {
    "pacing_issues": ["Issues with speaking speed or pauses"],
    "tone_suggestions": ["Suggestions for emotional tone adjustments"],
    "branching_opportunities": ["Where conditional logic could improve responses"]
  }
}

Priority Levels:
- critical: Must fix - causing lost conversions or negative reactions
- important: Should fix - impacts call quality significantly
- nice-to-have: Could improve - minor enhancements

Section Categories:
- opening: Introduction, building rapport, setting context
- qualification: Asking discovery questions, understanding needs
- objection_handling: Responding to concerns, price objections, timing objections
- value_proposition: Presenting benefits, differentiators, ROI
- closing: Booking appointments, next steps, call to action`
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
        // Strip markdown code blocks first if present
        let cleanContent = content || '';
        if (cleanContent.includes('```json')) {
          cleanContent = cleanContent.replace(/```json\s*/g, '').replace(/```\s*/g, '');
        } else if (cleanContent.includes('```')) {
          cleanContent = cleanContent.replace(/```\s*/g, '');
        }
        
        // Try to extract JSON object
        const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
        comparison = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(cleanContent);
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
      
      // Update with fallback - use mapped outcome for DB constraint
      await supabaseAdmin
        .from('call_logs')
        .update({
          transcript,
          ai_analysis: fallbackAnalysis,
          auto_disposition: fallbackAnalysis.disposition,
          confidence_score: fallbackAnalysis.confidence,
          outcome: mapDispositionToOutcome(fallbackAnalysis.disposition)
        })
        .eq('id', callId);
      
      // Log error
      await supabaseAdmin.from('edge_function_errors').insert({
        function_name: 'analyze-call-transcript',
        action: 'ai_analysis',
        user_id: userId,
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

    // Get existing call data for analytics calculations
    const { data: existingCall } = await supabaseAdmin
      .from('call_logs')
      .select('duration_seconds, amd_result, created_at, answered_at, agent_id, retell_agent_name')
      .eq('id', callId)
      .maybeSingle();

    const callDuration = existingCall?.duration_seconds || 0;
    const amdResult = existingCall?.amd_result || null;
    const createdAt = existingCall?.created_at || null;
    const answeredAt = existingCall?.answered_at || null;

    // Calculate time wasted score
    const timeWasted = calculateTimeWastedScore(
      callDuration,
      amdResult,
      mapDispositionToOutcome(aiAnalysis.disposition),
      aiAnalysis.disposition,
      answeredAt,
      createdAt
    );

    // Extract opener from transcript
    const extractedOpener = extractOpenerFromTranscript(transcript);

    console.log(`[Analyze Transcript] Analytics - Time Wasted: ${timeWasted.score} (${timeWasted.reason}), Opener extracted: ${extractedOpener?.length || 0} chars`);

    // Update call log with analysis including all new columns
    // Use mapDispositionToOutcome for the outcome column to satisfy DB constraint
    const { error: updateError } = await supabaseAdmin
      .from('call_logs')
      .update({
        transcript,
        ai_analysis: aiAnalysis,
        auto_disposition: aiAnalysis.disposition,
        confidence_score: aiAnalysis.confidence,
        sentiment: aiAnalysis.sentiment || null,
        call_summary: aiAnalysis.key_points?.join('. ') || null,
        outcome: mapDispositionToOutcome(aiAnalysis.disposition),
        // New analytics columns
        time_wasted_score: timeWasted.score,
        time_wasted_reason: timeWasted.reason,
        opener_extracted: extractedOpener
      })
      .eq('id', callId)
      .eq('user_id', userId)

    if (updateError) {
      throw updateError
    }

    // ========================================================================
    // SCRIPT ANALYTICS: Update opener analytics if opener was extracted
    // ========================================================================
    if (extractedOpener && extractedOpener.length > 10) {
      try {
        const wasAnswered = amdResult === 'human' || callDuration > 10;
        const wasEngaged = callDuration > 30 && amdResult === 'human';
        const wasConverted = ['Appointment Booked', 'Hot Lead', 'Interested'].includes(aiAnalysis.disposition);

        // Call the database function to update opener analytics
        const { error: openerError } = await supabaseAdmin.rpc('update_opener_analytics', {
          p_user_id: userId,
          p_agent_id: existingCall?.agent_id || null,
          p_agent_name: existingCall?.retell_agent_name || 'Unknown Agent',
          p_opener_text: extractedOpener,
          p_was_answered: wasAnswered,
          p_was_engaged: wasEngaged,
          p_was_converted: wasConverted,
          p_call_duration: callDuration,
          p_call_id: callId
        });

        if (openerError) {
          console.error('[Analyze Transcript] Failed to update opener analytics:', openerError);
        } else {
          console.log('[Analyze Transcript] ✅ Opener analytics updated');
        }
      } catch (openerAnalyticsError) {
        console.error('[Analyze Transcript] Opener analytics error:', openerAnalyticsError);
        // Don't fail the main operation
      }
    }

    // ========================================================================
    // SCRIPT ANALYTICS: Update voicemail analytics if this was a voicemail
    // ========================================================================
    if (amdResult?.startsWith('machine')) {
      try {
        // Check if we have broadcast info
        const { data: queueItem } = await supabaseAdmin
          .from('broadcast_queue')
          .select('broadcast_id, voice_broadcasts(voicemail_audio_url)')
          .eq('call_id', callId)
          .maybeSingle();

        if (queueItem?.broadcast_id) {
          const vmAudioUrl = (queueItem.voice_broadcasts as any)?.voicemail_audio_url || null;

          // Call the database function to update voicemail analytics
          const { error: vmError } = await supabaseAdmin.rpc('update_voicemail_analytics', {
            p_user_id: userId,
            p_broadcast_id: queueItem.broadcast_id,
            p_voicemail_audio_url: vmAudioUrl,
            p_voicemail_duration: callDuration,
            p_is_callback: false,
            p_callback_within_1h: false,
            p_callback_within_24h: false,
            p_resulted_in_appointment: false
          });

          if (vmError) {
            console.error('[Analyze Transcript] Failed to update voicemail analytics:', vmError);
          } else {
            console.log('[Analyze Transcript] ✅ Voicemail analytics updated');
          }

          // Create callback tracking record so we can match future callbacks
          const { data: callLogData } = await supabaseAdmin
            .from('call_logs')
            .select('lead_id, to_number')
            .eq('id', callId)
            .maybeSingle();

          if (callLogData?.lead_id) {
            await supabaseAdmin
              .from('voicemail_callback_tracking')
              .insert({
                user_id: userId,
                voicemail_call_id: callId,
                voicemail_left_at: new Date().toISOString(),
                lead_id: callLogData.lead_id,
                phone_number: callLogData.to_number || '',
                broadcast_id: queueItem.broadcast_id,
                status: 'waiting',
                expired_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString() // 48 hours
              });
            console.log('[Analyze Transcript] ✅ Voicemail callback tracking created');
          }
        }
      } catch (vmAnalyticsError) {
        console.error('[Analyze Transcript] Voicemail analytics error:', vmAnalyticsError);
        // Don't fail the main operation
      }
    }

    // Get the lead associated with this call
    const { data: callData } = await supabaseAdmin
      .from('call_logs')
      .select('lead_id')
      .eq('id', callId)
      .eq('user_id', userId)
      .maybeSingle()

    if (callData?.lead_id) {
      // Get the appropriate pipeline board for this disposition
      const { data: dispositionData } = await supabaseAdmin
        .from('dispositions')
        .select('id, pipeline_stage')
        .eq('name', aiAnalysis.disposition)
        .eq('user_id', userId)
        .maybeSingle()

      if (dispositionData) {
        const { data: pipelineBoard } = await supabaseAdmin
          .from('pipeline_boards')
          .select('id')
          .eq('disposition_id', dispositionData.id)
          .eq('user_id', userId)
          .maybeSingle()

        if (pipelineBoard) {
          // Move lead to appropriate pipeline position
          console.log(`[Analyze Transcript] Moving lead ${callData.lead_id} to pipeline board: ${pipelineBoard.id}`);
          const { error: pipelineError } = await supabaseAdmin
            .from('lead_pipeline_positions')
            .upsert({
              user_id: userId,
              lead_id: callData.lead_id,
              pipeline_board_id: pipelineBoard.id,
              position: 0,
              moved_at: new Date().toISOString(),
              moved_by_user: false,
              notes: `Auto-moved based on AI analysis: ${aiAnalysis.reasoning}`
            }, { onConflict: 'lead_id,user_id' });
          
          if (pipelineError) {
            console.error(`[Analyze Transcript] Pipeline update FAILED:`, pipelineError);
          } else {
            console.log(`[Analyze Transcript] ✅ Pipeline updated successfully`);
          }
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
        .eq('user_id', userId)

      // Record learning data for continuous improvement
      try {
        await supabaseAdmin
          .from('ml_learning_data')
          .insert({
            user_id: userId,
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
          userId: userId,
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
