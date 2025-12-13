
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SERVICES_TO_MONITOR = [
  { name: 'retell-ai', url: 'https://api.retellai.com/health' },
  { name: 'supabase-db', url: 'internal' },
  { name: 'edge-functions', url: 'internal' },
  { name: 'phone-provisioning', url: 'internal' }
];

async function checkServiceHealth(service: { name: string; url: string }) {
  const startTime = Date.now();
  
  try {
    if (service.url === 'internal') {
      // Internal service checks
      if (service.name === 'supabase-db') {
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        
        if (!supabaseUrl || !supabaseServiceKey) {
          throw new Error('Missing Supabase environment variables');
        }
        
        const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);
        
        await supabaseClient.from('system_health_logs').select('id').limit(1);
        return {
          status: 'online',
          response_time: Date.now() - startTime,
          error: null
        };
      }
      
      return {
        status: 'online',
        response_time: Date.now() - startTime,
        error: null
      };
    }

    const response = await fetch(service.url, {
      method: 'GET',
      headers: { 'User-Agent': 'CallCenter-HealthCheck/1.0' },
      signal: AbortSignal.timeout(5000) // 5 second timeout
    });

    return {
      status: response.ok ? 'online' : 'degraded',
      response_time: Date.now() - startTime,
      error: response.ok ? null : `HTTP ${response.status}`
    };

  } catch (error) {
    return {
      status: 'offline',
      response_time: Date.now() - startTime,
      error: (error as Error).message
    };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing required environment variables: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }
    
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    if (req.method === 'POST') {
      // Run health checks
      console.log('Running system health checks...');
      
      const healthChecks = await Promise.all(
        SERVICES_TO_MONITOR.map(async (service) => {
          const result = await checkServiceHealth(service);
          
          // Log the result
          await supabaseClient
            .from('system_health_logs')
            .insert({
              service_name: service.name,
              status: result.status,
              response_time_ms: result.response_time,
              error_message: result.error,
              metadata: {
                checked_at: new Date().toISOString(),
                url: service.url !== 'internal' ? service.url : null
              }
            });

          return {
            service: service.name,
            ...result
          };
        })
      );

      const overallStatus = healthChecks.every(check => check.status === 'online') 
        ? 'healthy' 
        : healthChecks.some(check => check.status === 'offline') 
        ? 'critical' 
        : 'degraded';

      console.log(`Health check completed. Overall status: ${overallStatus}`);

      return new Response(JSON.stringify({
        overall_status: overallStatus,
        services: healthChecks,
        checked_at: new Date().toISOString()
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (req.method === 'GET') {
      // Get recent health logs
      const { data: logs, error } = await supabaseClient
        .from('system_health_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        console.error('Health logs fetch error:', error);
        return new Response(JSON.stringify({ error: 'Failed to fetch health logs' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Group by service and get latest status
      const serviceStatus = logs?.reduce((acc, log) => {
        if (!acc[log.service_name] || new Date(log.created_at) > new Date(acc[log.service_name].created_at)) {
          acc[log.service_name] = log;
        }
        return acc;
      }, {} as Record<string, any>) || {};

      return new Response(JSON.stringify({
        current_status: serviceStatus,
        recent_logs: logs?.slice(0, 20) || []
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response('Method not allowed', { status: 405, headers: corsHeaders });

  } catch (error) {
    console.error('Function error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
