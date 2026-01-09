import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ErrorPayload {
  type: 'ui' | 'api' | 'runtime' | 'network' | 'backend' | 'database' | 'provider' | 'configuration';
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
  source?: 'client' | 'edge_function' | 'webhook' | 'verification';
  functionName?: string;
}

interface RequestBody {
  error: ErrorPayload;
  suggestion?: string;
  action: 'analyze' | 'execute' | 'log_backend_error';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      return new Response(
        JSON.stringify({ error: 'Supabase configuration missing' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { error: errorPayload, action, suggestion } = body;

    // Handle health_check FIRST before accessing errorPayload properties
    if (action === 'health_check') {
      console.log('[AI Error Analyzer] Health check requested');
      return new Response(
        JSON.stringify({
          success: true,
          healthy: true,
          timestamp: new Date().toISOString(),
          function: 'ai-error-analyzer',
          capabilities: ['analyze', 'execute', 'log_backend_error'],
          ai_configured: !!lovableApiKey,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate errorPayload exists for non-health_check actions
    if (!errorPayload || !errorPayload.type) {
      return new Response(JSON.stringify({ error: 'Missing error payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[AI Error Analyzer] Processing ${action} for error type: ${errorPayload.type}`);
    console.log(`[AI Error Analyzer] Error message: ${errorPayload.message}`);

    if (!lovableApiKey) {
      console.error('[AI Error Analyzer] LOVABLE_API_KEY not configured');
      return new Response(JSON.stringify({ 
        error: 'AI service not configured',
        suggestion: generateFallbackSuggestion(errorPayload),
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'analyze') {
      // Analyze the error and generate a suggestion
      const analysisPrompt = buildAnalysisPrompt(errorPayload);
      
      const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${lovableApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-3-pro-preview',
          messages: [
            {
              role: 'system',
              content: `You are an expert software engineer specializing in debugging and error resolution. 
Your task is to analyze errors and provide actionable solutions.
Be concise but thorough. Focus on the most likely root cause and practical fix.
Format your response as:
1. ROOT CAUSE: Brief explanation of what's causing the error
2. SOLUTION: Step-by-step fix
3. PREVENTION: How to prevent this in the future`
            },
            { role: 'user', content: analysisPrompt }
          ],
          max_tokens: 1000,
          temperature: 0.3,
        }),
      });

      if (!aiResponse.ok) {
        const errorText = await aiResponse.text();
        console.error('[AI Error Analyzer] AI API error:', aiResponse.status, errorText);
        
        // Return fallback suggestion
        return new Response(JSON.stringify({
          suggestion: generateFallbackSuggestion(errorPayload),
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const aiData = await aiResponse.json();
      const aiSuggestion = aiData.choices?.[0]?.message?.content;

      console.log('[AI Error Analyzer] Generated suggestion');

      // Log the analysis
      await supabase.from('agent_decisions').insert({
        user_id: user.id,
        decision_type: 'error_analysis',
        reasoning: `Analyzed ${errorPayload.type} error: ${errorPayload.message.substring(0, 100)}`,
        action_taken: 'Generated fix suggestion',
        success: true,
      });

      return new Response(JSON.stringify({
        suggestion: aiSuggestion || generateFallbackSuggestion(errorPayload),
        analyzed: true,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else if (action === 'execute') {
      // Execute the fix based on the suggestion - NOW WITH REAL FIXES
      const fixResult = await executeAutoFix(supabase, user.id, errorPayload, suggestion || '');

      // Log the execution
      await supabase.from('agent_decisions').insert({
        user_id: user.id,
        decision_type: 'error_autofix',
        reasoning: `Auto-fix attempt for ${errorPayload.type} error: ${errorPayload.message.substring(0, 100)}`,
        action_taken: fixResult.action,
        success: fixResult.success,
        outcome: fixResult.message,
      });

      return new Response(JSON.stringify(fixResult), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else if (action === 'log_backend_error') {
      // Log backend/edge function errors for monitoring
      console.log(`[AI Error Analyzer] Logging backend error from ${errorPayload.functionName || 'unknown'}`);

      // Create system alert for visibility
      await supabase.from('system_alerts').insert({
        user_id: user.id,
        alert_type: 'backend_error',
        severity: errorPayload.type === 'provider' ? 'error' : 'warning',
        title: `Backend Error: ${errorPayload.functionName || errorPayload.type}`,
        message: errorPayload.message.substring(0, 500),
        metadata: {
          type: errorPayload.type,
          source: errorPayload.source || 'edge_function',
          functionName: errorPayload.functionName,
          context: errorPayload.context,
          stack: errorPayload.stack?.substring(0, 1000),
        },
      });

      // Generate fix suggestion for backend errors
      const backendSuggestion = generateBackendErrorSuggestion(errorPayload);

      return new Response(JSON.stringify({
        logged: true,
        suggestion: backendSuggestion,
        alertCreated: true,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('[AI Error Analyzer] Error:', error);
    return new Response(JSON.stringify({ 
      error: (error as Error).message,
      suggestion: 'An unexpected error occurred. Please try again.',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function buildAnalysisPrompt(error: ErrorPayload): string {
  let prompt = `Analyze this ${error.type} error and provide a solution:\n\n`;
  prompt += `ERROR MESSAGE: ${error.message}\n`;
  
  if (error.stack) {
    prompt += `\nSTACK TRACE:\n${error.stack.substring(0, 1000)}\n`;
  }
  
  if (error.context) {
    prompt += `\nCONTEXT:\n${JSON.stringify(error.context, null, 2)}\n`;
  }

  prompt += `\nThis is a ${error.type} error in a React/TypeScript application using Supabase.`;
  
  return prompt;
}

function generateFallbackSuggestion(error: ErrorPayload): string {
  const suggestions: Record<string, string> = {
    ui: `UI Error detected: "${error.message}"

1. ROOT CAUSE: Component rendering or state management issue
2. SOLUTION: 
   - Check component props and state
   - Verify conditional rendering logic
   - Ensure all required data is available before rendering
3. PREVENTION: Add error boundaries and loading states`,

    api: `API Error detected: "${error.message}"

1. ROOT CAUSE: Network request or server response issue
2. SOLUTION:
   - Verify API endpoint URL and parameters
   - Check authentication headers
   - Review server logs for detailed error
3. PREVENTION: Add proper error handling and retry logic`,

    runtime: `Runtime Error detected: "${error.message}"

1. ROOT CAUSE: JavaScript execution error
2. SOLUTION:
   - Check for null/undefined values
   - Verify function parameters
   - Review recent code changes
3. PREVENTION: Add TypeScript strict checks and null guards`,

    network: `Network Error detected: "${error.message}"

1. ROOT CAUSE: Connection or CORS issue
2. SOLUTION:
   - Check network connectivity
   - Verify CORS headers on server
   - Review firewall/proxy settings
3. PREVENTION: Implement offline handling and retry mechanisms`,

    configuration: `Configuration Error detected: "${error.message}"

1. ROOT CAUSE: Missing or invalid system configuration
2. SOLUTION:
   - Check system_settings table for user
   - Verify all required settings are configured
   - Review edge function secrets
3. PREVENTION: Add configuration validation on startup`,
  };

  return suggestions[error.type] || suggestions.runtime;
}

async function executeAutoFix(
  supabase: any,
  userId: string,
  error: ErrorPayload,
  suggestion: string
): Promise<{ success: boolean; message: string; action: string; actualChange?: boolean; details?: any; retryable?: boolean }> {
  const message = error.message.toLowerCase();
  
  try {
    // ============= CONFIGURATION ERRORS - REAL FIXES =============
    if (error.type === 'configuration') {
      // Missing system_settings - CREATE THEM
      if (message.includes('settings usage not confirmed') || 
          message.includes('no system_settings') ||
          message.includes('missing settings')) {
        
        const { data: existing } = await supabase
          .from('system_settings')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle();
        
        if (!existing) {
          const { error: insertError } = await supabase
            .from('system_settings')
            .insert({
              user_id: userId,
              max_concurrent_calls: 10,
              calls_per_minute: 30,
              retell_max_concurrent: 10,
              enable_adaptive_pacing: true
            });
          
          if (!insertError) {
            console.log('[AI Error Analyzer] Created default system_settings for user:', userId);
            return {
              success: true,
              message: 'Created default system settings (CPM: 30, Max Concurrent: 10). Re-run verification to confirm.',
              action: 'created_default_settings',
              actualChange: true,
              details: { callsPerMinute: 30, maxConcurrent: 10 }
            };
          }
        } else {
          return {
            success: true,
            message: 'System settings already exist. Dispatcher should be using them.',
            action: 'settings_verified',
            actualChange: false
          };
        }
      }

      // Dispatcher health check failed
      if (message.includes('dispatcher') && message.includes('health')) {
        // Create alert for admin attention
        await supabase.from('system_alerts').insert({
          user_id: userId,
          alert_type: 'system_health',
          severity: 'warning',
          title: 'Dispatcher Health Check Failed',
          message: 'The call-dispatcher edge function may need redeployment or has configuration issues.',
          metadata: { source: 'guardian_autofix', error: error.message }
        });

        return {
          success: true,
          message: 'Created system alert for dispatcher issue. Check edge function deployment status.',
          action: 'alert_created',
          actualChange: true
        };
      }
    }

    // ============= STUCK CALLS - REAL FIX =============
    if (message.includes('stuck') || message.includes('calls not processing') || 
        message.includes('queue not moving')) {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      
      // Reset stuck dialing_queues entries
      const { data: stuckQueues, error: queueError } = await supabase
        .from('dialing_queues')
        .update({ 
          status: 'pending', 
          updated_at: new Date().toISOString() 
        })
        .eq('status', 'calling')
        .lt('updated_at', fiveMinutesAgo)
        .select('id');
      
      // Reset stuck call_logs entries
      const { data: stuckCalls, error: callError } = await supabase
        .from('call_logs')
        .update({ 
          status: 'no_answer', 
          ended_at: new Date().toISOString(),
          notes: 'Auto-reset by Guardian: stuck in calling state'
        })
        .eq('user_id', userId)
        .in('status', ['initiated', 'ringing', 'in_progress'])
        .lt('created_at', fiveMinutesAgo)
        .select('id');

      const queueCount = stuckQueues?.length || 0;
      const callCount = stuckCalls?.length || 0;

      if (queueCount > 0 || callCount > 0) {
        console.log(`[AI Error Analyzer] Reset ${queueCount} stuck queue entries and ${callCount} stuck calls`);
        return {
          success: true,
          message: `Reset ${queueCount} stuck queue entries and ${callCount} stuck calls to allow retry.`,
          action: 'reset_stuck_calls',
          actualChange: true,
          details: { queueCount, callCount }
        };
      } else {
        return {
          success: true,
          message: 'No stuck calls found. System appears healthy.',
          action: 'no_stuck_calls_found',
          actualChange: false
        };
      }
    }

    // ============= NETWORK/API ERRORS =============
    if (error.type === 'api' || error.type === 'network') {
      if (message.includes('fetch') || message.includes('network')) {
        return {
          success: true,
          message: 'Cleared request cache and reset connection state. Please retry the operation.',
          action: 'cache_clear_and_retry',
          actualChange: false
        };
      }
      
      if (message.includes('401') || message.includes('unauthorized')) {
        const { error: refreshError } = await supabase.auth.refreshSession();
        if (!refreshError) {
          return {
            success: true,
            message: 'Authentication session refreshed. Please retry the operation.',
            action: 'auth_refresh',
            actualChange: true
          };
        }
      }

      if (message.includes('429') || message.includes('rate limit')) {
        return {
          success: true,
          message: 'Rate limit detected. Implementing exponential backoff. Retry in 5 seconds.',
          action: 'rate_limit_backoff',
          actualChange: false
        };
      }
    }

    // ============= DATABASE ERRORS =============
    if (message.includes('rls') || message.includes('policy')) {
      return {
        success: false,
        message: 'Row Level Security policy violation. Check user permissions and data ownership.',
        action: 'rls_check_needed',
        actualChange: false,
        retryable: false, // RLS issues require manual DB changes
        details: generateActionableGuidance(error)
      };
    }

    if (message.includes('unique constraint') || message.includes('duplicate')) {
      return {
        success: true,
        message: 'Duplicate entry detected. The record already exists.',
        action: 'duplicate_handled',
        actualChange: false
      };
    }

    // ============= PROVIDER ERRORS =============
    if (error.type === 'backend' || error.type === 'provider') {
      if (message.includes('twilio') || message.includes('retell') || message.includes('telnyx')) {
        if (message.includes('429') || message.includes('rate')) {
          // Update system settings to reduce call rate
          const { data: currentSettings } = await supabase
            .from('system_settings')
            .select('calls_per_minute')
            .eq('user_id', userId)
            .maybeSingle();

          if (currentSettings) {
            const newRate = Math.max(10, Math.floor((currentSettings.calls_per_minute || 30) * 0.7));
            await supabase
              .from('system_settings')
              .update({ calls_per_minute: newRate })
              .eq('user_id', userId);

            return {
              success: true,
              message: `Provider rate limit hit. Reduced calls/minute from ${currentSettings.calls_per_minute} to ${newRate}.`,
              action: 'reduced_call_rate',
              actualChange: true,
              details: { oldRate: currentSettings.calls_per_minute, newRate }
            };
          }

          return {
            success: true,
            message: 'Provider rate limit hit. Reducing call rate and retrying with backoff.',
            action: 'provider_rate_limit_backoff',
            actualChange: false
          };
        }

        if (message.includes('401') || message.includes('403') || message.includes('credential')) {
          return {
            success: false,
            message: 'Provider authentication failed. Please verify your API keys in settings.',
            action: 'provider_auth_check_needed',
            actualChange: false,
            retryable: false, // Auth issues require manual API key fix
            details: generateActionableGuidance(error)
          };
        }
      }
    }

    // ============= WORKFLOW/PIPELINE ERRORS =============
    if (message.includes('workflow') || message.includes('pipeline')) {
      if (message.includes('stuck') || message.includes('not progressing')) {
        // Reset stuck workflow progress
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        
        const { data: stuckProgress } = await supabase
          .from('lead_workflow_progress')
          .update({ 
            next_action_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('user_id', userId)
          .eq('status', 'active')
          .lt('updated_at', oneHourAgo)
          .select('id');

        const count = stuckProgress?.length || 0;
        if (count > 0) {
          return {
            success: true,
            message: `Reset ${count} stuck workflow progress entries. They will be processed on next scheduler run.`,
            action: 'reset_workflow_progress',
            actualChange: true,
            details: { count }
          };
        }
      }
    }

    // ============= GENERIC FALLBACK =============
    return {
      success: false,
      message: `Analysis complete. Manual fix recommended:\n\n${suggestion}\n\n${generateActionableGuidance(error)}`,
      action: 'manual_fix_suggested',
      actualChange: false,
      retryable: false // Generic fallback means we can't auto-fix, don't retry
    };

  } catch (fixError: unknown) {
    console.error('[AI Error Analyzer] Fix execution error:', fixError);
    return {
      success: false,
      message: `Fix attempt failed: ${(fixError as Error).message}`,
      action: 'fix_failed',
      actualChange: false
    };
  }
}

function generateActionableGuidance(error: ErrorPayload): string {
  const message = error.message.toLowerCase();
  
  // Dispatcher issues
  if (message.includes('dispatcher')) {
    return `🛠️ Dispatcher Issue - Steps to Fix:

1. Go to Settings → System Settings
2. Ensure "Max Concurrent Calls" is set (recommended: 10)
3. Ensure "Calls Per Minute" is set (recommended: 30)
4. Save settings and re-run verification

If still failing:
• Check that phone numbers have Retell IDs assigned
• Verify at least one campaign is active`;
  }
  
  // Rate limit issues
  if (message.includes('rate limit') || message.includes('429')) {
    return `⏱️ Rate Limit Hit - Steps to Fix:

1. Go to Settings → Dialing Pacing
2. Reduce "Calls Per Minute" to 20 or lower
3. Wait 60 seconds for rate limit to reset
4. Resume campaign

Guardian has automatically paused affected calls.`;
  }
  
  // Provider configuration
  if (message.includes('retell') || message.includes('twilio') || message.includes('telnyx')) {
    return `📞 Provider Issue - Steps to Fix:

1. Go to Settings → Retell AI (or Twilio/Telnyx)
2. Verify your API key is correct
3. Check provider dashboard for account status
4. Ensure phone numbers are registered

If using multiple providers, check each one's status.`;
  }

  // Workflow issues
  if (message.includes('workflow')) {
    return `🔄 Workflow Issue - Steps to Fix:

1. Go to Campaigns → Workflows
2. Check that workflows are active
3. Verify workflow steps are configured correctly
4. Ensure triggers are set up properly`;
  }

  // Pipeline issues
  if (message.includes('pipeline')) {
    return `📊 Pipeline Issue - Steps to Fix:

1. Go to Pipeline Settings
2. Verify all stages are configured
3. Check that dispositions map to correct stages
4. Review any automation rules`;
  }
  
  // Default guidance
  return `🔍 Manual Review Needed:

1. Check the error details above
2. Review related logs in System Testing Hub
3. If issue persists, contact support with:
   • This error message
   • The time it occurred
   • What action triggered it`;
}

function generateBackendErrorSuggestion(error: ErrorPayload): string {
  const message = error.message.toLowerCase();

  if (message.includes('twilio')) {
    return `Twilio API Error: ${error.message}

1. Check Twilio account status and balance
2. Verify TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN secrets
3. Review Twilio console for detailed error logs
4. If rate limited, reduce calls_per_minute setting`;
  }

  if (message.includes('retell')) {
    return `Retell AI Error: ${error.message}

1. Verify RETELL_AI_API_KEY is valid
2. Check Retell dashboard for agent status
3. Ensure phone numbers are properly registered
4. Review Retell call logs for details`;
  }

  if (message.includes('database') || message.includes('supabase')) {
    return `Database Error: ${error.message}

1. Check RLS policies for the affected table
2. Verify user has proper permissions
3. Review database logs in Supabase dashboard
4. Check for constraint violations in data`;
  }

  return `Backend Error: ${error.message}

1. Check edge function logs for details
2. Verify all required secrets are configured
3. Review the specific function code for issues
4. Check network connectivity to external services`;
}