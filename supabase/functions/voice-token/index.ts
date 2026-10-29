/**
 * voice-token: mint a browser-phone token for the caller's company.
 *
 * POST {organization_id, provider:'telnyx'|'twilio'}
 *  -> 200 {token, identity, provider, expires_at, extra}
 *  -> 401 missing/invalid JWT, 403 not a member, 400 bad input, 429 rate limited.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { checkRateLimit, corsHeaders, RateLimitError } from '../_shared/utils.ts';
import { authorizeOrganizationContext } from '../_shared/tenant-context.ts';
import { getProvider, isVoiceProvider } from '../_shared/voice-provider.ts';
import { twilioIdentityForUser } from '../_shared/twilio.ts';

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ success: false, error_code: 'METHOD_NOT_ALLOWED', error: 'POST only' }, 405);
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ success: false, error_code: 'UNAUTHENTICATED', error: 'Missing authorization. Please log in and try again.' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) throw new Error('Supabase configuration missing');

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return json({
        success: false,
        error_code: 'UNAUTHENTICATED',
        error: 'Authentication failed',
        details: authError?.message || 'Invalid or expired session',
      }, 401);
    }

    // One generous per-user limit (house rule): 120/min, surfaced as 429.
    checkRateLimit(`voice-token:${user.id}`, 120, 60000);

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      return json({ success: false, error_code: 'INVALID_JSON', error: 'Request body must be JSON' }, 400);
    }

    const providerName = body?.provider;
    if (!isVoiceProvider(providerName)) {
      return json({ success: false, error_code: 'INVALID_PROVIDER', error: 'provider must be telnyx or twilio' }, 400);
    }

    let organizationId: string;
    try {
      organizationId = await authorizeOrganizationContext(supabaseAdmin, user.id, body?.organization_id);
    } catch (error) {
      return json({ success: false, error_code: 'ORG_FORBIDDEN', error: (error as Error).message }, 403);
    }

    const provider = getProvider(providerName);
    const minted = await provider.mintToken({ organizationId, userId: user.id, supabaseAdmin });

    return json({
      success: true,
      token: minted.token,
      identity: twilioIdentityForUser(user.id),
      provider: providerName,
      organization_id: organizationId,
      expires_at: minted.expires_at,
      extra: minted.extra,
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return json({ success: false, error_code: 'RATE_LIMITED', error: (error as Error).message }, 429);
    }
    console.error('[voice-token] Error:', error);
    return json({ success: false, error_code: 'INTERNAL', error: (error as Error).message }, 500);
  }
});
