import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const ALLOWED_EVENTS = new Set([
  'law_firm_landing_view',
  'website_submitted',
  'scrape_completed',
  'scrape_failed',
  'legal_setup_viewed',
  'legal_setup_completed',
  'demo_call_viewed',
  'demo_call_initiated',
  'demo_call_skipped',
  'legal_simulation_viewed',
  'legal_simulation_completed',
  'legal_roi_viewed',
  'legal_vision_viewed',
  'legal_vsl_started',
  'legal_vsl_completed',
  'interest_selected',
  'beta_lead_submitted',
]);

const ALLOWED_METADATA_KEYS = new Set([
  'interest',
  'campaign_type',
  'has_demo_call',
  'has_email',
  'has_phone',
  'video_available',
]);

function reply(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function safeString(value: unknown, max = 300) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function safeMetadata(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const output: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!ALLOWED_METADATA_KEYS.has(key)) continue;
    if (typeof value === 'string') output[key] = value.slice(0, 100);
    else if (typeof value === 'number' && Number.isFinite(value)) output[key] = value;
    else if (typeof value === 'boolean' || value === null) output[key] = value;
  }
  return output;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return reply({ success: false, error: 'Method not allowed.' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) return reply({ success: false }, 503);

    const body = await req.json();
    const eventName = safeString(body?.eventName, 100);
    if (!ALLOWED_EVENTS.has(eventName)) return reply({ success: false, error: 'Invalid event.' }, 400);

    const sessionId = safeString(body?.sessionId, 80) || null;
    const funnel = safeString(body?.funnel, 40) || 'generic';
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('cf-connecting-ip')
      || 'unknown';
    const userAgent = safeString(req.headers.get('user-agent'), 500) || null;

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    let verifiedSessionId: string | null = null;
    if (sessionId) {
      const { data } = await supabase.from('demo_sessions').select('id').eq('id', sessionId).maybeSingle();
      verifiedSessionId = data?.id || null;
    }

    const { error } = await supabase.from('demo_funnel_events').insert({
      demo_session_id: verifiedSessionId,
      funnel,
      event_name: eventName,
      source: safeString(body?.source, 100) || null,
      utm_source: safeString(body?.utmSource, 200) || null,
      utm_medium: safeString(body?.utmMedium, 200) || null,
      utm_campaign: safeString(body?.utmCampaign, 200) || null,
      utm_content: safeString(body?.utmContent, 200) || null,
      utm_term: safeString(body?.utmTerm, 200) || null,
      metadata: safeMetadata(body?.metadata),
      ip_address: clientIp,
      user_agent: userAgent,
    });

    if (error) {
      console.error('demo-funnel-track insert failed', error.message);
      return reply({ success: false }, 500);
    }

    return reply({ success: true });
  } catch (error) {
    console.error('demo-funnel-track unexpected error', (error as Error).message);
    return reply({ success: false }, 500);
  }
});
