
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

    const { action, ...params } = await req.json()

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
        result = await supabaseClient
          .from('dispositions')
          .insert({ ...params.disposition_data, user_id: user.id })
          .select()
          .single()
        break

      case 'create_pipeline_board':
        result = await supabaseClient
          .from('pipeline_boards')
          .insert({ ...params.board_data, user_id: user.id })
          .select()
          .single()
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
            notes: params.notes || ''
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
        result = await supabaseClient
          .from('dispositions')
          .insert(params.dispositions)
        break

      default:
        throw new Error('Invalid action')
    }

    if (result.error) {
      throw result.error
    }

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
        error: error.message,
        details: 'Failed to process pipeline management request'
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
