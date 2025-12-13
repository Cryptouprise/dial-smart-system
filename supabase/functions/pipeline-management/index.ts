
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
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      console.error('No authorization header provided')
      throw new Error('Authorization header is required')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Supabase configuration missing');
    }
    
    const supabaseClient = createClient(supabaseUrl, serviceRoleKey);
    
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      console.error('Authentication failed:', authError)
      throw new Error('Invalid authentication token')
    }

    console.log('Authenticated user:', user.id)

    const { action, ...params } = await req.json()
    console.log('Processing action:', action)

    let result

    switch (action) {
      case 'get_dispositions':
        result = await supabaseClient
          .from('dispositions')
          .select('*')
          .eq('user_id', user.id)
          .order('name')
        break

      case 'get_pipeline_boards':
        result = await supabaseClient
          .from('pipeline_boards')
          .select(`
            *,
            disposition:dispositions(*)
          `)
          .eq('user_id', user.id)
          .order('position')
        break

      case 'get_lead_positions':
        result = await supabaseClient
          .from('lead_pipeline_positions')
          .select(`
            *,
            lead:leads(*)
          `)
          .eq('user_id', user.id)
          .order('moved_at', { ascending: false })
        break

      case 'create_disposition':
        console.log('Creating disposition with data:', params.disposition_data)
        result = await supabaseClient
          .from('dispositions')
          .insert({ 
            ...params.disposition_data, 
            user_id: user.id,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select()
          .maybeSingle()
        break

      case 'create_pipeline_board':
        console.log('Creating pipeline board with data:', params.board_data)
        result = await supabaseClient
          .from('pipeline_boards')
          .insert({ 
            ...params.board_data, 
            user_id: user.id,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select()
          .maybeSingle()
        break

      case 'move_lead_to_pipeline':
        result = await supabaseClient
          .from('lead_pipeline_positions')
          .upsert({
            user_id: user.id,
            lead_id: params.lead_id,
            pipeline_board_id: params.pipeline_board_id,
            position: params.position || 0,
            moved_by_user: params.moved_by_user || true,
            notes: params.notes || '',
            moved_at: new Date().toISOString(),
            created_at: new Date().toISOString()
          })
        break

      case 'check_dispositions_exist':
        const { data: existingDispositions } = await supabaseClient
          .from('dispositions')
          .select('id')
          .eq('user_id', user.id)
          .limit(1)
        
        result = { data: existingDispositions && existingDispositions.length > 0 }
        break

      case 'insert_default_dispositions':
        const dispositionsWithUserId = params.dispositions.map((d: any) => ({
          ...d,
          user_id: user.id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }))
        
        result = await supabaseClient
          .from('dispositions')
          .insert(dispositionsWithUserId)
        break

      default:
        throw new Error(`Invalid action: ${action}`)
    }

    if (result.error) {
      console.error(`Database error for action ${action}:`, result.error)
      throw result.error
    }

    console.log(`Successfully processed action ${action}`)
    return new Response(
      JSON.stringify({ success: true, data: result.data }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    )

  } catch (error) {
    console.error('Error in pipeline management function:', error)
    
    return new Response(
      JSON.stringify({ 
        error: 'An error occurred processing your request',
        code: 'PIPELINE_ERROR'
      }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        }, 
        status: 500 
      }
    )
  }
})
