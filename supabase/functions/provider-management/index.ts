/**
 * Provider Management Edge Function
 * 
 * Unified API for managing multi-carrier providers:
 * - Add/update/delete provider configurations
 * - Test provider connections
 * - Import numbers from providers
 * - List available numbers
 * 
 * This function serves as the backend for the Provider Management UI.
 * 
 * TODO: Complete implementation in PR E
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type ProviderType = 'retell' | 'telnyx' | 'twilio' | 'custom';

interface ProviderManagementRequest {
  action: 
    | 'list_providers'
    | 'add_provider' 
    | 'update_provider' 
    | 'delete_provider'
    | 'test_connection'
    | 'list_numbers'
    | 'import_number'
    | 'import_all_numbers'
    | 'sync_numbers';
  provider_type?: ProviderType;
  provider_id?: string;
  config?: {
    display_name?: string;
    priority?: number;
    active?: boolean;
    api_key?: string; // Will be stored in Supabase secrets
    config_json?: Record<string, unknown>;
  };
  number?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase clients
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Supabase configuration missing');
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    
    // Verify the JWT token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Authentication failed' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[Provider Management] User authenticated:', user.id);

    const request: ProviderManagementRequest = await req.json();
    console.log('[Provider Management] Action:', request.action);

    let result: unknown;

    switch (request.action) {
      case 'list_providers': {
        // List all configured providers for the user
        const { data, error } = await supabaseAdmin
          .from('phone_providers')
          .select('*')
          .eq('user_id', user.id)
          .order('priority', { ascending: true });
        
        if (error) throw error;
        result = { providers: data };
        break;
      }

      case 'add_provider': {
        if (!request.provider_type || !request.config) {
          throw new Error('Provider type and config required');
        }

        // TODO: Store API key securely in Supabase secrets
        // For now, store reference in the database
        const apiKeyRef = request.config.api_key 
          ? `${request.provider_type.toUpperCase()}_API_KEY_${user.id}`
          : null;

        const { data, error } = await supabaseAdmin
          .from('phone_providers')
          .insert({
            user_id: user.id,
            name: request.provider_type,
            display_name: request.config.display_name || request.provider_type,
            priority: request.config.priority || 1,
            active: request.config.active !== false,
            api_key_reference: apiKeyRef,
            config_json: request.config.config_json || {},
          })
          .select()
          .single();
        
        if (error) throw error;
        result = { provider: data, message: 'Provider added successfully' };
        break;
      }

      case 'update_provider': {
        if (!request.provider_id) {
          throw new Error('Provider ID required');
        }

        const updateData: Record<string, unknown> = {};
        if (request.config?.display_name) updateData.display_name = request.config.display_name;
        if (request.config?.priority !== undefined) updateData.priority = request.config.priority;
        if (request.config?.active !== undefined) updateData.active = request.config.active;
        if (request.config?.config_json) updateData.config_json = request.config.config_json;

        const { data, error } = await supabaseAdmin
          .from('phone_providers')
          .update(updateData)
          .eq('id', request.provider_id)
          .eq('user_id', user.id)
          .select()
          .single();
        
        if (error) throw error;
        result = { provider: data, message: 'Provider updated successfully' };
        break;
      }

      case 'delete_provider': {
        if (!request.provider_id) {
          throw new Error('Provider ID required');
        }

        const { error } = await supabaseAdmin
          .from('phone_providers')
          .delete()
          .eq('id', request.provider_id)
          .eq('user_id', user.id);
        
        if (error) throw error;
        result = { success: true, message: 'Provider deleted successfully' };
        break;
      }

      case 'test_connection': {
        if (!request.provider_type) {
          throw new Error('Provider type required');
        }

        // TODO: Implement actual connection tests for each provider
        // For now, return stub response
        console.log('[Provider Management] Testing connection for:', request.provider_type);
        result = { 
          success: false, 
          message: `Connection test for ${request.provider_type} not implemented yet`
        };
        break;
      }

      case 'list_numbers': {
        if (!request.provider_type && !request.provider_id) {
          // List all provider numbers for user
          const { data, error } = await supabaseAdmin
            .from('provider_numbers')
            .select('*, phone_providers(name, display_name)')
            .eq('user_id', user.id);
          
          if (error) throw error;
          result = { numbers: data };
        } else {
          // List numbers for specific provider
          let query = supabaseAdmin
            .from('provider_numbers')
            .select('*')
            .eq('user_id', user.id);
          
          if (request.provider_id) {
            query = query.eq('provider_id', request.provider_id);
          } else if (request.provider_type) {
            query = query.eq('provider_type', request.provider_type);
          }
          
          const { data, error } = await query;
          if (error) throw error;
          result = { numbers: data };
        }
        break;
      }

      case 'import_number': {
        if (!request.provider_type || !request.number) {
          throw new Error('Provider type and number required');
        }

        // TODO: Implement actual number import from provider
        // This should call the provider API to verify the number exists
        console.log('[Provider Management] Importing number:', request.number, 'from:', request.provider_type);
        
        // Get provider config
        const { data: provider } = await supabaseAdmin
          .from('phone_providers')
          .select('id')
          .eq('user_id', user.id)
          .eq('name', request.provider_type)
          .single();

        if (!provider) {
          throw new Error(`Provider ${request.provider_type} not configured`);
        }

        // Insert number record
        const { data, error } = await supabaseAdmin
          .from('provider_numbers')
          .insert({
            user_id: user.id,
            provider_id: provider.id,
            provider_type: request.provider_type,
            number: request.number,
            capabilities_json: ['voice'], // TODO: Get actual capabilities from provider
            verified: false,
            last_synced: new Date().toISOString(),
          })
          .select()
          .single();
        
        if (error) throw error;
        result = { number: data, message: 'Number imported successfully' };
        break;
      }

      case 'sync_numbers': {
        if (!request.provider_type && !request.provider_id) {
          throw new Error('Provider type or ID required');
        }

        // TODO: Implement sync from provider API
        console.log('[Provider Management] Syncing numbers for provider');
        result = { 
          success: false, 
          message: 'Number sync not implemented yet'
        };
        break;
      }

      default:
        throw new Error(`Unknown action: ${request.action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[Provider Management] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
