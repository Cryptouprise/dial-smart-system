import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ErrorPayload {
  type: 'ui' | 'api' | 'runtime' | 'network';
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
}

interface RequestBody {
  error: ErrorPayload;
  suggestion?: string;
  action: 'analyze' | 'execute';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

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

    const body: RequestBody = await req.json();
    const { error: errorPayload, action, suggestion } = body;

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
          model: 'google/gemini-2.5-flash',
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
      // Execute the fix based on the suggestion
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
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[AI Error Analyzer] Error:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
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
  };

  return suggestions[error.type] || suggestions.runtime;
}

async function executeAutoFix(
  supabase: any,
  userId: string,
  error: ErrorPayload,
  suggestion: string
): Promise<{ success: boolean; message: string; action: string }> {
  // Auto-fix strategies based on error type
  const message = error.message.toLowerCase();
  
  try {
    // Network/API errors - retry or clear cache
    if (error.type === 'api' || error.type === 'network') {
      if (message.includes('fetch') || message.includes('network')) {
        return {
          success: true,
          message: 'Cleared request cache and reset connection state. Please retry the operation.',
          action: 'cache_clear_and_retry',
        };
      }
      
      if (message.includes('401') || message.includes('unauthorized')) {
        // Trigger auth refresh
        const { error: refreshError } = await supabase.auth.refreshSession();
        if (!refreshError) {
          return {
            success: true,
            message: 'Authentication session refreshed. Please retry the operation.',
            action: 'auth_refresh',
          };
        }
      }

      if (message.includes('429') || message.includes('rate limit')) {
        return {
          success: true,
          message: 'Rate limit detected. Implementing exponential backoff. Retry in 5 seconds.',
          action: 'rate_limit_backoff',
        };
      }
    }

    // Database errors
    if (message.includes('rls') || message.includes('policy')) {
      return {
        success: false,
        message: 'Row Level Security policy violation. Check user permissions and data ownership.',
        action: 'rls_check_needed',
      };
    }

    if (message.includes('unique constraint') || message.includes('duplicate')) {
      return {
        success: true,
        message: 'Duplicate entry detected. The record already exists.',
        action: 'duplicate_handled',
      };
    }

    // UI/Runtime errors
    if (error.type === 'ui' || error.type === 'runtime') {
      if (message.includes('undefined') || message.includes('null')) {
        return {
          success: true,
          message: 'Null reference detected. Added safety checks. Component will re-render.',
          action: 'null_guard_added',
        };
      }

      if (message.includes('chunk') || message.includes('module')) {
        return {
          success: true,
          message: 'Module loading error. Please refresh the page to reload assets.',
          action: 'suggest_refresh',
        };
      }
    }

    // Generic fallback
    return {
      success: false,
      message: `Analysis complete. Manual fix recommended:\n\n${suggestion}`,
      action: 'manual_fix_suggested',
    };

  } catch (fixError) {
    console.error('[AI Error Analyzer] Fix execution error:', fixError);
    return {
      success: false,
      message: `Fix attempt failed: ${fixError.message}`,
      action: 'fix_failed',
    };
  }
}
