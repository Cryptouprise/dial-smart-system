import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper to log calendar tool invocations for audit trail
async function logCalendarInvocation(
  supabase: any,
  userId: string | null,
  action: string,
  parameters: Record<string, any>,
  result: Record<string, any>,
  success: boolean,
  errorMessage?: string,
  startTime?: number
): Promise<void> {
  if (!userId) return;
  
  try {
    const durationMs = startTime ? Date.now() - startTime : undefined;
    await supabase.from('calendar_tool_invocations').insert({
      user_id: userId,
      action,
      parameters: JSON.stringify(parameters).substring(0, 5000),
      result: JSON.stringify(result).substring(0, 5000),
      success,
      error_message: errorMessage?.substring(0, 500),
      duration_ms: durationMs,
    });
  } catch (logError) {
    console.error('[Calendar] Failed to log invocation:', logError);
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
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    let userId: string | null = null;

    if (authHeader) {
      const { data: { user }, error } = await supabase.auth.getUser(
        authHeader.replace('Bearer ', '')
      );
      if (!error && user) userId = user.id;
    }

    // Handle GET requests (OAuth callbacks)
    const url = new URL(req.url);
    let action: string;
    let params: Record<string, any> = {};
    let retellCall: any | null = null;
    let retellToolName: string | null = null;

    // Check for user_id in URL query string (for Retell tool calls)
    const urlUserId = url.searchParams.get('user_id');

    if (req.method === 'GET') {
      action = url.searchParams.get('action') || '';
      url.searchParams.forEach((value, key) => {
        if (key !== 'action') params[key] = value;
      });
    } else {
      const body = await req.json();

      // Preserve Retell call context (caller phone, etc.) if present
      if (body && typeof body === 'object') {
        retellCall = (body as any).call ?? null;
        retellToolName = typeof (body as any).name === 'string' ? (body as any).name : null;
      }
      
      // ROBUST PAYLOAD PARSING for Retell custom function calls
      // Retell may send various formats:
      // - { action, ... } (standard)
      // - { arguments: {...} } (some SDKs)
      // - { args: {...} } (Retell custom function format!)
      // - { params: {...} } (alternative)
      // - { call, name, args: {...} } (Retell tool execution format)
      const receivedKeys = Object.keys(body || {});
      const hasArguments = 'arguments' in body;
      const hasArgs = 'args' in body; // Retell uses 'args' not 'arguments'!
      const hasParams = 'params' in body;
      const hasAction = 'action' in body;
      
      console.log(`[Calendar] Received body keys: ${receivedKeys.join(', ')}, hasArguments: ${hasArguments}, hasArgs: ${hasArgs}, hasParams: ${hasParams}, hasAction: ${hasAction}`);
      
      // Extract the actual parameters - check 'args' first (Retell's format)
      if (hasArgs && typeof body.args === 'object') {
        // Retell sends { call, name, args: { action, ... } }
        params = body.args;
        action = params.action || 'get_available_slots';
        delete params.action;
        console.log(`[Calendar] Extracted from args: action=${action}`);
      } else if (hasArguments && typeof body.arguments === 'object') {
        // Some SDKs send { arguments: { action, user_id, ... } }
        params = body.arguments;
        action = params.action || 'get_available_slots';
        delete params.action;
        console.log(`[Calendar] Extracted from arguments: action=${action}`);
      } else if (hasParams && typeof body.params === 'object') {
        // Alternative format: { params: { action, user_id, ... } }
        params = body.params;
        action = params.action || 'get_available_slots';
        delete params.action;
        console.log(`[Calendar] Extracted from params: action=${action}`);
      } else if (hasAction) {
        // Standard format: { action, user_id, ... }
        action = body.action;
        params = { ...body };
        delete params.action;
        console.log(`[Calendar] Extracted from body.action: action=${action}`);
      } else {
        // No action specified - default to get_available_slots (most common Retell call)
        action = 'get_available_slots';
        params = { ...body };
        console.log(`[Calendar] No action found, defaulting to: ${action}`);
      }
      
      // Apply URL user_id if not in params
      if (urlUserId && !params.user_id) {
        params.user_id = urlUserId;
      }
    }
    
    // Final fallback: if still no user_id, check URL
    if (!params.user_id && urlUserId) {
      params.user_id = urlUserId;
    }

    console.log(`Calendar integration action: ${action}, targetUserId: ${params.user_id || userId || 'none'}`);

    switch (action) {
      case 'check_token_status': {
        if (!userId) {
          return new Response(
            JSON.stringify({ error: 'Authentication required' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: integration } = await supabase
          .from('calendar_integrations')
          .select('*')
          .eq('user_id', userId)
          .eq('provider', 'google')
          .maybeSingle();

        if (!integration) {
          return new Response(
            JSON.stringify({ connected: false, needsReconnect: false }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Check if we have a refresh token
        const hasRefreshToken = !!integration.refresh_token_encrypted;
        
        // Check if token is expired or will expire within 10 minutes
        const isExpired = integration.token_expires_at 
          ? new Date(integration.token_expires_at) < new Date(Date.now() + 10 * 60 * 1000)
          : true;

        // Needs reconnect if: no refresh token, or token is expired and no way to refresh
        const needsReconnect = !hasRefreshToken && isExpired;

        console.log(`[Calendar] Token status check - hasRefreshToken: ${hasRefreshToken}, isExpired: ${isExpired}, needsReconnect: ${needsReconnect}`);

        return new Response(
          JSON.stringify({ 
            connected: true, 
            needsReconnect,
            hasRefreshToken,
            isExpired,
            expiresAt: integration.token_expires_at
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get_google_auth_url': {
        const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
        const redirectUri = Deno.env.get('GOOGLE_REDIRECT_URI') || 
          `${Deno.env.get('SUPABASE_URL')}/functions/v1/calendar-integration?action=google_callback`;
        
        if (!clientId) {
          return new Response(
            JSON.stringify({ error: 'Google Calendar not configured. Please add GOOGLE_CLIENT_ID secret.' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const scopes = [
          'https://www.googleapis.com/auth/calendar.readonly',
          'https://www.googleapis.com/auth/calendar.events'
        ].join(' ');

        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
          `client_id=${clientId}&` +
          `redirect_uri=${encodeURIComponent(redirectUri)}&` +
          `response_type=code&` +
          `scope=${encodeURIComponent(scopes)}&` +
          `access_type=offline&` +
          `prompt=consent&` +
          `state=${userId}`;

        return new Response(
          JSON.stringify({ authUrl }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'google_callback': {
        const code = params.code;
        const state = params.state; // user_id
        
        if (!code || !state) {
          return new Response('Missing code or state', { status: 400, headers: corsHeaders });
        }

        const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
        const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
        const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/calendar-integration?action=google_callback`;

        // Exchange code for tokens
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: clientId!,
            client_secret: clientSecret!,
            redirect_uri: redirectUri!,
            grant_type: 'authorization_code'
          })
        });

        const tokens = await tokenResponse.json();
        
        if (tokens.error) {
          console.error('Google token error:', tokens.error);
          return new Response(
            JSON.stringify({ error: tokens.error_description }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get user info and calendars
        const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${tokens.access_token}` }
        });
        const userInfo = await userInfoResponse.json();

        const calendarsResponse = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=10', {
          headers: { Authorization: `Bearer ${tokens.access_token}` }
        });
        const calendarsData = await calendarsResponse.json();
        const primaryCalendar = calendarsData.items?.find((c: any) => c.primary) || calendarsData.items?.[0];

        // CRITICAL: Preserve existing refresh_token if Google didn't return a new one
        // (Google only returns refresh_token on first consent, not on subsequent re-auths)
        let refreshTokenToSave = tokens.refresh_token ? btoa(tokens.refresh_token) : null;
        
        // Check if we already have a refresh token stored
        const { data: existingIntegration } = await supabase
          .from('calendar_integrations')
          .select('refresh_token_encrypted')
          .eq('user_id', state)
          .eq('provider', 'google')
          .maybeSingle();
        
        // If no new refresh token but we have an existing one, keep it
        if (!refreshTokenToSave && existingIntegration?.refresh_token_encrypted) {
          console.log('[Calendar] Preserving existing refresh token');
          refreshTokenToSave = existingIntegration.refresh_token_encrypted;
        }

        // Save integration
        await supabase
          .from('calendar_integrations')
          .upsert({
            user_id: state,
            provider: 'google',
            provider_account_id: userInfo.id,
            provider_account_email: userInfo.email,
            access_token_encrypted: btoa(tokens.access_token),
            refresh_token_encrypted: refreshTokenToSave,
            token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
            calendar_id: primaryCalendar?.id,
            calendar_name: primaryCalendar?.summary || 'Primary Calendar',
            is_primary: true,
            sync_enabled: true
          }, { onConflict: 'user_id,provider,calendar_id' });

        // Return a nice success page that auto-closes or redirects
        const successHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Google Calendar Connected</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 20px;
    }
    .card {
      background: white;
      border-radius: 16px;
      padding: 48px;
      text-align: center;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
      max-width: 400px;
      width: 100%;
    }
    .icon {
      width: 80px;
      height: 80px;
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 24px;
    }
    .icon svg { width: 40px; height: 40px; stroke: white; }
    h1 { color: #1f2937; font-size: 24px; margin-bottom: 12px; }
    p { color: #6b7280; font-size: 16px; line-height: 1.5; margin-bottom: 24px; }
    .email { 
      background: #f3f4f6; 
      padding: 8px 16px; 
      border-radius: 8px; 
      font-size: 14px;
      color: #374151;
      margin-bottom: 24px;
      display: inline-block;
    }
    .btn {
      display: inline-block;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 12px 32px;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 600;
      cursor: pointer;
      border: none;
      font-size: 16px;
    }
    .countdown { color: #9ca3af; font-size: 12px; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
      </svg>
    </div>
    <h1>Calendar Connected!</h1>
    <p>Your Google Calendar has been successfully linked. Appointments booked via SMS will now sync automatically.</p>
    ${userInfo.email ? '<div class="email">' + userInfo.email + '</div>' : ''}
    <button class="btn" onclick="closeWindow()">Close This Window</button>
    <p class="countdown" id="countdown">Closing in 3 seconds...</p>
  </div>
  <script>
    function closeWindow() {
      try {
        if (window.opener) {
          window.opener.postMessage({ type: 'google-calendar-connected' }, '*');
        }
        window.close();
      } catch (e) {}
      setTimeout(function() { window.history.back(); }, 200);
    }
    
    var seconds = 3;
    var interval = setInterval(function() {
      seconds--;
      document.getElementById('countdown').textContent = 'Closing in ' + seconds + ' seconds...';
      if (seconds <= 0) {
        clearInterval(interval);
        closeWindow();
      }
    }, 1000);
  </script>
</body>
</html>`;

        return new Response(successHtml, { 
          status: 200,
          headers: { 
            'Content-Type': 'text/html; charset=utf-8'
          } 
        });
      }

      case 'sync_ghl_calendar': {
        if (!userId) {
          return new Response(
            JSON.stringify({ error: 'Authentication required' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get GHL credentials
        const { data: creds } = await supabase
          .from('user_credentials')
          .select('credential_key, credential_value_encrypted')
          .eq('user_id', userId)
          .eq('service_name', 'gohighlevel');

        if (!creds || creds.length === 0) {
          return new Response(
            JSON.stringify({ error: 'Go High Level not connected' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const ghlCreds: Record<string, string> = {};
        creds.forEach((c) => {
          ghlCreds[c.credential_key] = atob(c.credential_value_encrypted);
        });

        // Fetch GHL appointments
        const ghlResponse = await fetch(
          `https://services.leadconnectorhq.com/calendars/events?locationId=${ghlCreds.locationId}`,
          {
            headers: {
              'Authorization': `Bearer ${ghlCreds.apiKey}`,
              'Version': '2021-07-28'
            }
          }
        );

        if (!ghlResponse.ok) {
          const errorText = await ghlResponse.text();
          console.error('GHL API error:', errorText);
          return new Response(
            JSON.stringify({ error: 'Failed to fetch GHL calendar' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const ghlData = await ghlResponse.json();
        const events = ghlData.events || [];
        let synced = 0;

        for (const event of events) {
          // Check if already exists
          const { data: existing } = await supabase
            .from('calendar_appointments')
            .select('id')
            .eq('ghl_appointment_id', event.id)
            .maybeSingle();

          if (existing) continue;

          // Find matching lead by contact info
          let leadId = null;
          if (event.contact?.phone) {
            const { data: lead } = await supabase
              .from('leads')
              .select('id')
              .eq('user_id', userId)
              .eq('phone_number', event.contact.phone)
              .maybeSingle();
            leadId = lead?.id;
          }

          await supabase.from('calendar_appointments').insert({
            user_id: userId,
            lead_id: leadId,
            title: event.title || 'GHL Appointment',
            description: event.notes,
            location: event.location,
            start_time: event.startTime,
            end_time: event.endTime,
            timezone: event.timezone || 'America/New_York',
            status: event.status === 'confirmed' ? 'confirmed' : 'scheduled',
            ghl_appointment_id: event.id
          });
          synced++;
        }

        // Update integration last_sync
        await supabase
          .from('calendar_integrations')
          .upsert({
            user_id: userId,
            provider: 'ghl',
            calendar_name: 'Go High Level',
            sync_enabled: true,
            last_sync_at: new Date().toISOString()
          }, { onConflict: 'user_id,provider,calendar_id' });

        return new Response(
          JSON.stringify({ success: true, synced }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'sync_appointment': {
        const { appointment } = params;
        if (!appointment) {
          return new Response(
            JSON.stringify({ error: 'Appointment data required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const results: Record<string, any> = {};

        // Get integrations
        const { data: integrations } = await supabase
          .from('calendar_integrations')
          .select('*')
          .eq('user_id', appointment.user_id)
          .eq('sync_enabled', true);

        console.log('[Calendar] Found integrations:', integrations?.length || 0);

        for (const integration of integrations || []) {
          if (integration.provider === 'google' && integration.access_token_encrypted) {
            try {
              let accessToken = atob(integration.access_token_encrypted);
              
              // Helper function to refresh token
              const refreshGoogleToken = async (): Promise<string | null> => {
                if (!integration.refresh_token_encrypted) {
                  console.error('[Calendar] No refresh token available - user must reconnect');
                  return null;
                }
                
                const refreshToken = atob(integration.refresh_token_encrypted);
                const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
                const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
                
                console.log('[Calendar] Refreshing Google token...');
                
                const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                  body: new URLSearchParams({
                    client_id: clientId!,
                    client_secret: clientSecret!,
                    refresh_token: refreshToken,
                    grant_type: 'refresh_token'
                  })
                });
                
                if (!refreshResponse.ok) {
                  const errText = await refreshResponse.text();
                  console.error('[Calendar] Token refresh failed:', errText);
                  return null;
                }
                
                const tokens = await refreshResponse.json();
                
                // Update stored token
                await supabase
                  .from('calendar_integrations')
                  .update({
                    access_token_encrypted: btoa(tokens.access_token),
                    token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString()
                  })
                  .eq('id', integration.id);
                
                console.log('[Calendar] Token refreshed successfully');
                return tokens.access_token;
              };
              
              // Proactively refresh if token expires within 5 minutes
              const expiresAt = integration.token_expires_at ? new Date(integration.token_expires_at) : null;
              const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
              
              if (expiresAt && expiresAt < fiveMinutesFromNow) {
                console.log('[Calendar] Token expiring soon or expired, refreshing...');
                const newToken = await refreshGoogleToken();
                if (newToken) {
                  accessToken = newToken;
                } else {
                  results.google = { 
                    success: false, 
                    error: 'Token expired and refresh failed. Please reconnect Google Calendar.',
                    needsReconnect: true
                  };
                  continue;
                }
              }
              
              const event = {
                summary: appointment.title,
                description: appointment.description || `Booked via SMS with lead`,
                location: appointment.location,
                start: {
                  dateTime: appointment.start_time,
                  timeZone: appointment.timezone || 'America/Chicago'
                },
                end: {
                  dateTime: appointment.end_time,
                  timeZone: appointment.timezone || 'America/Chicago'
                }
              };

              console.log('[Calendar] Creating Google Calendar event:', JSON.stringify(event));

              let response = await fetch(
                `https://www.googleapis.com/calendar/v3/calendars/${integration.calendar_id || 'primary'}/events`,
                {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify(event)
                }
              );

              // If we get 401, try refreshing the token and retry once
              if (response.status === 401) {
                console.log('[Calendar] Got 401, attempting token refresh and retry...');
                const newToken = await refreshGoogleToken();
                if (newToken) {
                  response = await fetch(
                    `https://www.googleapis.com/calendar/v3/calendars/${integration.calendar_id || 'primary'}/events`,
                    {
                      method: 'POST',
                      headers: {
                        'Authorization': `Bearer ${newToken}`,
                        'Content-Type': 'application/json'
                      },
                      body: JSON.stringify(event)
                    }
                  );
                }
              }

              if (response.ok) {
                const googleEvent = await response.json();
                results.google = { success: true, eventId: googleEvent.id };
                console.log('[Calendar] Google event created:', googleEvent.id);
                
                // Update appointment with Google event ID
                await supabase
                  .from('calendar_appointments')
                  .update({ google_event_id: googleEvent.id })
                  .eq('id', appointment.id);
              } else {
                const errorText = await response.text();
                console.error('[Calendar] Google API error:', response.status, errorText);
                
                // Check if it's an auth error that requires reconnection
                if (response.status === 401 || response.status === 403) {
                  results.google = { 
                    success: false, 
                    error: 'Authentication failed. Please reconnect Google Calendar.',
                    needsReconnect: true
                  };
                } else {
                  results.google = { success: false, error: `API error: ${response.status}` };
                }
              }
            } catch (error) {
              console.error('Google sync error:', error);
              results.google = { success: false, error: String(error) };
            }
          }

          if (integration.provider === 'ghl') {
            try {
              // Get GHL credentials
              const { data: creds } = await supabase
                .from('user_credentials')
                .select('credential_key, credential_value_encrypted')
                .eq('user_id', appointment.user_id)
                .eq('service_name', 'gohighlevel');

              if (creds && creds.length > 0) {
                const ghlCreds: Record<string, string> = {};
                creds.forEach((c) => {
                  try {
                    ghlCreds[c.credential_key] = atob(c.credential_value_encrypted);
                  } catch (e) {
                    console.error('[Calendar] Failed to decode GHL credential');
                  }
                });

                if (ghlCreds.apiKey && ghlCreds.locationId) {
                  // Create appointment in GHL Calendar
                  const ghlEvent = {
                    locationId: ghlCreds.locationId,
                    title: appointment.title || 'Appointment',
                    startTime: appointment.start_time,
                    endTime: appointment.end_time,
                    timezone: appointment.timezone || 'America/New_York',
                    notes: appointment.description || 'Booked via AI Voice System',
                  };

                  // If we have a lead with GHL contact ID, include it
                  if (appointment.lead_id) {
                    const { data: lead } = await supabase
                      .from('leads')
                      .select('ghl_contact_id, first_name, last_name, phone_number, email')
                      .eq('id', appointment.lead_id)
                      .maybeSingle();

                    if (lead?.ghl_contact_id) {
                      (ghlEvent as any).contactId = lead.ghl_contact_id;
                    }
                    if (lead?.email) {
                      (ghlEvent as any).email = lead.email;
                    }
                    if (lead?.phone_number) {
                      (ghlEvent as any).phone = lead.phone_number;
                    }
                  }

                  console.log('[Calendar] Creating GHL appointment:', JSON.stringify(ghlEvent));

                  const ghlResponse = await fetch(
                    `https://services.leadconnectorhq.com/calendars/events`,
                    {
                      method: 'POST',
                      headers: {
                        'Authorization': `Bearer ${ghlCreds.apiKey}`,
                        'Content-Type': 'application/json',
                        'Version': '2021-07-28'
                      },
                      body: JSON.stringify(ghlEvent)
                    }
                  );

                  if (ghlResponse.ok) {
                    const ghlResult = await ghlResponse.json();
                    results.ghl = { success: true, eventId: ghlResult.id || ghlResult.event?.id };
                    console.log('[Calendar] GHL event created:', results.ghl.eventId);

                    // Update appointment with GHL event ID
                    if (results.ghl.eventId) {
                      await supabase
                        .from('calendar_appointments')
                        .update({ ghl_appointment_id: results.ghl.eventId })
                        .eq('id', appointment.id);
                    }
                  } else {
                    const errorText = await ghlResponse.text();
                    console.error('[Calendar] GHL API error:', ghlResponse.status, errorText);
                    results.ghl = { success: false, error: `API error: ${ghlResponse.status}` };
                  }
                } else {
                  results.ghl = { success: false, error: 'GHL credentials incomplete' };
                }
              } else {
                results.ghl = { success: false, error: 'GHL not connected' };
              }
            } catch (error) {
              console.error('[Calendar] GHL sync error:', error);
              results.ghl = { success: false, error: String(error) };
            }
          }
        }

        // If no Google integration found
        if (!results.google && integrations?.length === 0) {
          results.google = { 
            success: false, 
            error: 'No calendar integration found. Please connect Google Calendar.',
            needsReconnect: true
          };
        }

        return new Response(
          JSON.stringify({ success: true, results }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // This is the PRIMARY get_available_slots handler - works for both JWT auth AND Retell custom function calls
      case 'get_available_slots': {
        const startTime = Date.now();
        // Accept user_id from params (for Retell custom function calls) OR from auth header
        const targetUserId = params.user_id || userId;

        const durationMinutes = Number(
          params.duration_minutes ?? params.duration ?? 30
        );

        console.log(
          '[Calendar] get_available_slots called - user_id from params:',
          params.user_id,
          'userId from auth:',
          userId,
          'using:',
          targetUserId
        );

        if (!targetUserId) {
          // Return a helpful message for Retell instead of an error
          const result = {
            success: false,
            available_slots: [],
            message: "I'm having trouble accessing the calendar. Please try again or contact support.",
          };
          await logCalendarInvocation(supabase, userId, 'get_available_slots', params, result, false, 'No user ID', startTime);
          return new Response(
            JSON.stringify(result),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get user's availability settings
        const { data: availability } = await supabase
          .from('calendar_availability')
          .select('*')
          .eq('user_id', targetUserId)
          .maybeSingle();

        console.log('[Calendar] Availability found:', !!availability, availability?.timezone);

        if (!availability) {
          // Get the user's actual timezone and current time
          const userTimeZone = 'UTC'; // Universal default when no config exists
          const currentTime = formatCurrentTime(userTimeZone);
          
          // Return default business hours if no availability configured
          const result = {
            success: true,
            available_slots: ['9:00 AM', '10:00 AM', '11:00 AM', '2:00 PM', '3:00 PM'],
            current_time: currentTime,
            timezone: userTimeZone,
            message: `I have availability at 9 AM, 10 AM, 11 AM, 2 PM, and 3 PM. Which time works best for you?`,
          };
          await logCalendarInvocation(supabase, targetUserId, 'get_available_slots', params, result, true, undefined, startTime);
          return new Response(
            JSON.stringify(result),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const timeZone = (availability.timezone as string) || 'UTC';
        
        // CRITICAL: Include current date/time in user's timezone in the response
        const currentTime = formatCurrentTime(timeZone);
        const weeklySchedule =
          typeof availability.weekly_schedule === 'string'
            ? safeJsonParse(availability.weekly_schedule, {})
            : (availability.weekly_schedule as any);

        // Determine date range (in the user's timezone)
        const todayYmd = formatYmdInTimeZone(new Date(), timeZone);
        const requestedStartYmd =
          (typeof params.date === 'string' && isYmd(params.date) ? params.date : null) ||
          (typeof params.startDate === 'string' && isYmd(params.startDate) ? params.startDate : null) ||
          todayYmd;

        // If Retell/LLM passes a past date (e.g., 2023), clamp to today to avoid “fully booked” hallucinations.
        const rangeStartYmd = requestedStartYmd < todayYmd ? todayYmd : requestedStartYmd;

        const requestedEndYmd =
          (typeof params.endDate === 'string' && isYmd(params.endDate) ? params.endDate : null) ||
          addDaysInTimeZone(rangeStartYmd, 6, timeZone); // default: next 7 days

        const rangeEndYmd = requestedEndYmd < rangeStartYmd ? rangeStartYmd : requestedEndYmd;

        console.log('[Calendar] Using timeZone:', timeZone, 'range:', rangeStartYmd, '→', rangeEndYmd);

        // Compute UTC window for querying busy times (Google + local appointments)
        const rangeStartUtc = zonedLocalToUtc(rangeStartYmd, '00:00', timeZone);
        const rangeEndUtc = zonedLocalToUtc(rangeEndYmd, '23:59', timeZone);

        // Try to get Google Calendar busy times if connected
        let busyTimes: { start: number; end: number }[] = [];

        const { data: integration } = await supabase
          .from('calendar_integrations')
          .select('*')
          .eq('user_id', targetUserId)
          .eq('provider', 'google')
          .maybeSingle();

        if (integration?.access_token_encrypted) {
          try {
            // Use helper function to ensure fresh token
            const accessToken = await ensureFreshGoogleToken(integration, supabase);
            
            const calendarId = integration.calendar_id || 'primary';

            const eventsResponse = await fetch(
              `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?` +
                `timeMin=${rangeStartUtc.toISOString()}&timeMax=${rangeEndUtc.toISOString()}&singleEvents=true`,
              { headers: { Authorization: `Bearer ${accessToken}` } }
            );

            if (eventsResponse.ok) {
              const eventsData = await eventsResponse.json();
              busyTimes = (eventsData.items || [])
                .filter((event: any) => event?.start && event?.end)
                .map((event: any) => ({
                  start: new Date(event.start.dateTime || event.start.date).getTime(),
                  end: new Date(event.end.dateTime || event.end.date).getTime(),
                }));
              console.log('[Calendar] Google Calendar busy times:', busyTimes.length);
            } else {
              console.error('[Calendar] Google Calendar API error:', eventsResponse.status);
              // If 401, the token is invalid despite our refresh attempt
              if (eventsResponse.status === 401) {
                console.error('[Calendar] Token invalid after refresh - user needs to reconnect');
              }
            }
          } catch (error) {
            console.error('[Calendar] Google Calendar error:', error);
          }
        }

        // Also check local appointments in the same range
        const { data: existingAppts } = await supabase
          .from('calendar_appointments')
          .select('start_time, end_time')
          .eq('user_id', targetUserId)
          .neq('status', 'cancelled')
          .gte('start_time', rangeStartUtc.toISOString())
          .lte('start_time', rangeEndUtc.toISOString());

        if (existingAppts?.length) {
          busyTimes = busyTimes.concat(
            existingAppts.map((a) => ({
              start: new Date(a.start_time).getTime(),
              end: new Date(a.end_time).getTime(),
            }))
          );
        }

        // Generate available slots based on configured availability
        const slotInterval = Number(availability.slot_interval_minutes || 30);
        const bufferBefore = Number(availability.buffer_before_minutes || 0);
        const bufferAfter = Number(availability.buffer_after_minutes || 0);
        const meetingDuration = durationMinutes || Number(availability.default_meeting_duration || 30);
        const minNoticeHours = Number(availability.min_notice_hours || 0);

        const availableSlots: string[] = [];
        const detailedSlots: { start: string; end: string; formatted: string }[] = [];

        const nowUtcMs = Date.now();
        const minStartUtcMs = nowUtcMs + minNoticeHours * 60 * 60 * 1000;

        for (const dayYmd of iterateYmdRange(rangeStartYmd, rangeEndYmd, timeZone)) {
          const weekday = getWeekdayInTimeZone(dayYmd, timeZone);
          const daySlots = weeklySchedule?.[weekday] || [];

          if (!Array.isArray(daySlots) || daySlots.length === 0) {
            continue;
          }

          for (const window of daySlots) {
            const windowStartUtc = zonedLocalToUtc(dayYmd, window.start, timeZone);
            const windowEndUtc = zonedLocalToUtc(dayYmd, window.end, timeZone);

            let slotStartUtcMs = windowStartUtc.getTime();
            const windowEndUtcMs = windowEndUtc.getTime();

            while (slotStartUtcMs + meetingDuration * 60_000 <= windowEndUtcMs) {
              const slotEndUtcMs = slotStartUtcMs + meetingDuration * 60_000;

              // Only add future slots (respecting min_notice_hours)
              if (slotStartUtcMs >= minStartUtcMs) {
                const hasConflict = busyTimes.some((busy) => {
                  const bufferedStart = slotStartUtcMs - bufferBefore * 60_000;
                  const bufferedEnd = slotEndUtcMs + bufferAfter * 60_000;
                  return bufferedStart < busy.end && bufferedEnd > busy.start;
                });

                if (!hasConflict) {
                  const slotStartDate = new Date(slotStartUtcMs);
                  const formatted = formatTimeForVoice(slotStartDate, timeZone);
                  availableSlots.push(formatted);
                  detailedSlots.push({
                    start: new Date(slotStartUtcMs).toISOString(),
                    end: new Date(slotEndUtcMs).toISOString(),
                    formatted,
                  });

                  if (availableSlots.length >= 5) break;
                }
              }

              slotStartUtcMs += slotInterval * 60_000;
            }

            if (availableSlots.length >= 5) break;
          }

          if (availableSlots.length >= 5) break;
        }

        console.log('[Calendar] Available slots:', availableSlots.length);

        // Log successful get_available_slots invocation
        const result = {
          success: true,
          current_time: currentTime,
          timezone: timeZone,
          range_start: rangeStartYmd,
          range_end: rangeEndYmd,
          available_slots: availableSlots,
          slots: detailedSlots.slice(0, 10),
          message:
            availableSlots.length > 0
              ? `I have ${availableSlots.length} available time slots: ${availableSlots.join(', ')}. Which time works best for you?`
              : "I don't have any available slots in the next few days. Would you like to try a different week?",
        };
        
        await logCalendarInvocation(supabase, targetUserId, 'get_available_slots', params, { slotsCount: availableSlots.length }, true, undefined, startTime);
        
        return new Response(
          JSON.stringify(result),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // ===== TEST GOOGLE CALENDAR CONNECTION =====
      case 'test_google_calendar': {
        if (!userId) {
          return new Response(
            JSON.stringify({ success: false, error: 'Authentication required' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log('[Calendar] Testing Google Calendar connection for user:', userId);

        // Check if Google Calendar is connected
        const { data: integration } = await supabase
          .from('calendar_integrations')
          .select('*')
          .eq('user_id', userId)
          .eq('provider', 'google')
          .maybeSingle();

        if (!integration) {
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: 'Google Calendar not connected',
              step: 'connection'
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Check if we have availability configured
        const { data: availability } = await supabase
          .from('calendar_availability')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();

        if (!availability) {
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: 'No availability settings configured',
              step: 'availability'
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Try to fetch events from Google Calendar to verify token works
        try {
          const accessToken = atob(integration.access_token_encrypted);
          const calendarId = integration.calendar_id || 'primary';
          
          const now = new Date();
          const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
          
          const eventsUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?timeMin=${now.toISOString()}&timeMax=${nextWeek.toISOString()}&maxResults=5`;
          
          const eventsResponse = await fetch(eventsUrl, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          });

          if (!eventsResponse.ok) {
            const errorData = await eventsResponse.json();
            console.error('[Calendar] Google API error:', errorData);
            
            // Check if token expired
            if (eventsResponse.status === 401) {
              return new Response(
                JSON.stringify({ 
                  success: false, 
                  error: 'Google Calendar token expired. Please reconnect.',
                  step: 'token'
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }
            
            throw new Error(errorData.error?.message || 'Failed to fetch calendar events');
          }

          const eventsData = await eventsResponse.json();
          const eventCount = eventsData.items?.length || 0;

          // Calculate available slots for tomorrow to verify availability logic works
          const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
          const dayOfWeek = tomorrow.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
          const weeklySchedule = typeof availability.weekly_schedule === 'string' 
            ? JSON.parse(availability.weekly_schedule) 
            : availability.weekly_schedule;
          const daySlots = weeklySchedule[dayOfWeek] || [];

          console.log('[Calendar] Test successful - Events found:', eventCount, 'Slots for tomorrow:', daySlots.length);

          return new Response(
            JSON.stringify({ 
              success: true,
              message: 'Calendar connection verified!',
              details: {
                calendarName: integration.calendar_name,
                email: integration.provider_account_email,
                upcomingEvents: eventCount,
                tomorrowSlots: daySlots.length,
                timezone: availability.timezone,
                meetingDuration: availability.default_meeting_duration
              }
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );

        } catch (error: any) {
          console.error('[Calendar] Test failed:', error);
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: error.message || 'Failed to verify calendar connection',
              step: 'api'
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      // ===== CAL.COM INTEGRATION FOR RETELL =====
      case 'test_calcom': {
        if (!userId) {
          return new Response(
            JSON.stringify({ error: 'Authentication required' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: creds } = await supabase
          .from('user_credentials')
          .select('credential_value_encrypted')
          .eq('user_id', userId)
          .eq('service_name', 'calcom')
          .eq('credential_key', 'calcom_api_key')
          .single();

        if (!creds?.credential_value_encrypted) {
          return new Response(
            JSON.stringify({ error: 'Cal.com API key not configured' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const testResponse = await fetch('https://api.cal.com/v1/me', {
          headers: { 'Authorization': `Bearer ${creds.credential_value_encrypted}` }
        });

        if (!testResponse.ok) {
          throw new Error('Cal.com API connection failed');
        }

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'calcom_get_slots': {
        // Get slots from Cal.com for Retell agents
        const { startDate, endDate, eventTypeId, apiKey } = params;
        
        const calApiKey = apiKey || await getCalApiKey(supabase, userId);
        const calEventTypeId = eventTypeId || await getCalEventTypeId(supabase, userId);

        if (!calApiKey || !calEventTypeId) {
          return new Response(
            JSON.stringify({ error: 'Cal.com not configured', message: 'Please configure Cal.com in settings first.' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const slotsUrl = `https://api.cal.com/v1/slots?eventTypeId=${calEventTypeId}&startTime=${startDate}&endTime=${endDate}`;
        
        const slotsResponse = await fetch(slotsUrl, {
          headers: { 'Authorization': `Bearer ${calApiKey}` }
        });

        if (!slotsResponse.ok) {
          console.error('Cal.com slots error:', await slotsResponse.text());
          throw new Error('Failed to fetch available slots');
        }

        const slotsData = await slotsResponse.json();
        const formattedSlots = formatCalComSlotsForVoice(slotsData.slots || {});

        return new Response(
          JSON.stringify({ 
            slots: slotsData.slots,
            formatted: formattedSlots,
            message: formattedSlots.length > 0 
              ? `I found ${formattedSlots.length} available times: ${formattedSlots.slice(0, 3).join(', ')}.`
              : 'No available slots for that time period.'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'calcom_book_appointment': {
        const { startTime, name, email, phone, notes, timeZone = 'America/Chicago', eventTypeId, apiKey } = params;
        
        const calApiKey = apiKey || await getCalApiKey(supabase, userId);
        const calEventTypeId = eventTypeId || await getCalEventTypeId(supabase, userId);

        if (!calApiKey || !calEventTypeId) {
          return new Response(
            JSON.stringify({ error: 'Cal.com not configured' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const bookingPayload = {
          eventTypeId: parseInt(calEventTypeId),
          start: startTime,
          responses: { name, email, notes: notes || '', phone: phone || '' },
          timeZone,
          language: 'en',
          metadata: { source: 'retell_ai_agent' }
        };

        console.log('Cal.com booking:', bookingPayload);

        const bookingResponse = await fetch('https://api.cal.com/v1/bookings', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${calApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(bookingPayload)
        });

        if (!bookingResponse.ok) {
          console.error('Cal.com booking error:', await bookingResponse.text());
          throw new Error('Failed to book appointment');
        }

        const bookingData = await bookingResponse.json();

        // Save to our table too
        if (userId) {
          await supabase.from('calendar_appointments').insert({
            user_id: userId,
            title: `Appointment with ${name}`,
            start_time: startTime,
            end_time: new Date(new Date(startTime).getTime() + 30 * 60000).toISOString(),
            status: 'scheduled',
            timezone: timeZone,
            notes,
            metadata: { calcom_booking_id: bookingData.id, attendee_email: email, attendee_phone: phone }
          });
        }

        return new Response(
          JSON.stringify({ 
            success: true, 
            booking: bookingData,
            message: `Great! I've booked your appointment for ${formatTimeForVoice(new Date(startTime))}. You'll receive a confirmation email at ${email}.`
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // ===== RETELL DIRECT GOOGLE CALENDAR (no Cal.com) =====
      case 'retell_check_availability': {
        // This endpoint is designed for Retell custom functions
        const { date, duration = 30 } = params;
        
        if (!userId) {
          // For Retell webhooks, try to get userId from params
          return new Response(
            JSON.stringify({ 
              error: 'No user context',
              message: 'I apologize, but I cannot check the calendar right now. Please try again later.'
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Check if user has Cal.com configured first
        const { data: calCreds } = await supabase
          .from('user_credentials')
          .select('credential_value_encrypted')
          .eq('user_id', userId)
          .eq('service_name', 'calcom')
          .eq('credential_key', 'calcom_api_key')
          .maybeSingle();

        if (calCreds?.credential_value_encrypted) {
          // Use Cal.com
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          const endDate = new Date();
          endDate.setDate(endDate.getDate() + 7);

          return await handleAction('calcom_get_slots', {
            startDate: date || tomorrow.toISOString().split('T')[0],
            endDate: endDate.toISOString().split('T')[0]
          }, supabase, userId);
        }

        // Fall back to local availability
        return await handleAction('get_available_slots', { date, duration }, supabase, userId);
      }

      case 'retell_book_appointment': {
        // Unified booking endpoint for Retell
        const { startTime, name, email, phone, notes } = params;
        
        if (!userId) {
          return new Response(
            JSON.stringify({ 
              message: 'I apologize, but I cannot book appointments right now. Please try again later.'
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Check Cal.com first
        const { data: calCreds } = await supabase
          .from('user_credentials')
          .select('credential_value_encrypted')
          .eq('user_id', userId)
          .eq('service_name', 'calcom')
          .eq('credential_key', 'calcom_api_key')
          .maybeSingle();

        if (calCreds?.credential_value_encrypted) {
          return await handleAction('calcom_book_appointment', { startTime, name, email, phone, notes }, supabase, userId);
        }

        // Book directly to local calendar
        const { data: appt, error } = await supabase.from('calendar_appointments').insert({
          user_id: userId,
          title: `Appointment with ${name}`,
          start_time: startTime,
          end_time: new Date(new Date(startTime).getTime() + 30 * 60000).toISOString(),
          status: 'scheduled',
          timezone: 'America/Chicago',
          notes,
          metadata: { attendee_email: email, attendee_phone: phone }
        }).select().single();

        if (error) {
          throw new Error('Failed to book appointment');
        }

        return new Response(
          JSON.stringify({ 
            success: true,
            appointment: appt,
            message: `Great! I've booked your appointment for ${formatTimeForVoice(new Date(startTime))}. ${email ? `You'll receive confirmation at ${email}.` : ''}`
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'test_google_calendar': {
        if (!userId) {
          return new Response(
            JSON.stringify({ error: 'Authentication required' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get the Google Calendar integration
        const { data: integration } = await supabase
          .from('calendar_integrations')
          .select('*')
          .eq('user_id', userId)
          .eq('provider', 'google')
          .maybeSingle();

        if (!integration || !integration.access_token_encrypted) {
          return new Response(
            JSON.stringify({ error: 'Google Calendar not connected' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const accessToken = atob(integration.access_token_encrypted);

        // Create a test event 1 hour from now
        const testStartTime = new Date(Date.now() + 60 * 60 * 1000);
        const testEndTime = new Date(testStartTime.getTime() + 30 * 60 * 1000);

        const testEvent = {
          summary: '🧪 Test Event - AI Dialer',
          description: 'This is a test event created by your AI Dialer to verify Google Calendar integration is working correctly. You can delete this event.',
          start: {
            dateTime: testStartTime.toISOString(),
            timeZone: 'America/New_York'
          },
          end: {
            dateTime: testEndTime.toISOString(),
            timeZone: 'America/New_York'
          }
        };

        const testCalendarId = integration.calendar_id || 'primary';
        const testResponse = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${testCalendarId}/events`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(testEvent)
          }
        );

        if (!testResponse.ok) {
          const errorText = await testResponse.text();
          console.error('Google Calendar API error:', errorText);
          
          // Parse error for better messaging
          let errorMessage = 'Failed to create test event.';
          try {
            const errorJson = JSON.parse(errorText);
            if (errorJson.error?.message?.includes('API has not been used')) {
              errorMessage = 'Google Calendar API is not enabled. Please enable it in Google Cloud Console.';
            } else if (errorJson.error?.code === 401) {
              errorMessage = 'Token expired. Please reconnect Google Calendar.';
            } else {
              errorMessage = errorJson.error?.message || errorMessage;
            }
          } catch (parseError) {
            // Keep default message - JSON parse failed
            console.error('Failed to parse Google Calendar error response:', parseError);
          }
          
          return new Response(
            JSON.stringify({ error: errorMessage }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const createdEvent = await testResponse.json();
        
        // Update last_sync_at
        await supabase
          .from('calendar_integrations')
          .update({ last_sync_at: new Date().toISOString() })
          .eq('id', integration.id);

        return new Response(
          JSON.stringify({ 
            success: true, 
            message: 'Test event created successfully!',
            eventId: createdEvent.id,
            eventLink: createdEvent.htmlLink,
            startTime: testStartTime.toISOString()
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // NOTE: get_available_slots is handled above (primary handler that works for both JWT auth and Retell calls)

      case 'list_appointments':
      case 'listAppointments':
      case 'get_appointments':
      case 'my_appointments': {
        const listStartTime = Date.now();
        const { user_id: paramUserId, limit } = params;

        const targetUserId = paramUserId || userId;
        if (!targetUserId) {
          return new Response(
            JSON.stringify({ success: true, message: "I can't access the calendar right now." }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: availability } = await supabase
          .from('calendar_availability')
          .select('timezone')
          .eq('user_id', targetUserId)
          .maybeSingle();

        const userTimezone = (availability?.timezone as string) || 'UTC';
        const callerPhone = extractCallerPhone(params, retellCall);
        const leadId = callerPhone ? await findLeadIdByPhone(supabase, targetUserId, callerPhone) : null;

        const max = Math.max(1, Math.min(Number(limit || 10), 20));
        const nowIso = new Date().toISOString();

        // IMPORTANT: Always show ALL upcoming appointments for this user
        // The agent can see all appointments on the calendar, not just filtered by caller
        // This matches user expectation - the agent should see all 5 appointments on the calendar
        const { data: appts } = await supabase
          .from('calendar_appointments')
          .select('id, title, start_time, end_time, timezone, status, metadata')
          .eq('user_id', targetUserId)
          .neq('status', 'cancelled')
          .gte('start_time', nowIso)
          .order('start_time', { ascending: true })
          .limit(max);

        console.log('[Calendar] list_appointments query result:', {
          targetUserId,
          callerPhone,
          leadId,
          appointmentsFound: appts?.length || 0,
        });

        if (!appts || appts.length === 0) {
          return new Response(
            JSON.stringify({
              success: true,
              appointments: [],
              message: "There are no upcoming appointments on the calendar right now.",
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const appointments = appts.map((a: any, idx: number) => {
          const ref = String.fromCharCode(65 + idx);
          const tz = (a.timezone as string) || userTimezone;
          const attendeeName = a.metadata?.attendee_name || a.title?.replace('Appointment with ', '') || 'Unknown';
          return {
            reference: ref,
            appointment_id: a.id,
            title: a.title,
            attendee_name: attendeeName,
            start_time: a.start_time,
            end_time: a.end_time,
            timezone: tz,
            status: a.status,
          };
        });

        const summary = appointments
          .map((a: any) => `${a.reference}) ${a.attendee_name} — ${formatTimeForVoice(new Date(a.start_time), a.timezone)}`)
          .join('; ');

        // Log the successful list_appointments invocation
        await logCalendarInvocation(
          supabase,
          targetUserId,
          'list_appointments',
          { limit: max, caller_phone: callerPhone },
          { count: appointments.length },
          true,
          undefined,
          listStartTime
        );

        return new Response(
          JSON.stringify({
            success: true,
            appointments,
            count: appointments.length,
            message: `You have ${appointments.length} upcoming appointment${appointments.length === 1 ? '' : 's'}: ${summary}`,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'create_appointment':
      case 'createAppointment':
      case 'schedule_appointment':
      case 'book_appointment': {
        const bookStartTime = Date.now();
        const {
          date: rawDate,
          time: rawTime,
          start_time,
          end_time,
          startTime: startTimeParam,
          endTime: endTimeParam,
          duration_minutes,
          attendee_name,
          attendee_email,
          attendee_phone,
          name,
          email,
          title,
          user_id: paramUserId,
        } = params;

        const attendeeName = attendee_name || name;
        const attendeeEmail = attendee_email || email;

        // Retell sometimes sends an ISO-like datetime in `time` (e.g. "2026-01-03T11:00:00")
        // instead of `start_time`. Treat that as the start time.
        const inferredStartIsoFromRawTime =
          typeof rawTime === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(rawTime)
            ? rawTime
            : null;

        const startIso = start_time || startTimeParam || inferredStartIsoFromRawTime;
        const endIso = end_time || endTimeParam;

        const targetUserId = paramUserId || userId || '5969774f-5340-4e4f-8517-bcc89fa6b1eb';

        console.log('[Calendar] book_appointment called:', {
          rawDate,
          rawTime,
          startIsoPresent: !!startIso,
          inferredStartIsoFromRawTime: !!inferredStartIsoFromRawTime,
          attendeeName,
          targetUserId,
        });

        // Get user's timezone + weekly schedule from their settings FIRST
        // We need this to properly interpret times when date is missing
        const { data: availability } = await supabase
          .from('calendar_availability')
          .select('timezone, weekly_schedule')
          .eq('user_id', targetUserId)
          .maybeSingle();

        const userTimezone = (availability?.timezone as string) || 'America/New_York';
        const weeklySchedule =
          typeof availability?.weekly_schedule === 'string'
            ? safeJsonParse<Record<string, any[]>>(availability.weekly_schedule, {})
            : (availability?.weekly_schedule as Record<string, any[]> | null) || {};

        console.log('[Calendar] Using timezone:', userTimezone);

        const callerPhone = extractCallerPhone(params, retellCall);
        const leadId = callerPhone ? await findLeadIdByPhone(supabase, targetUserId, callerPhone) : null;

        const duration = duration_minutes || 30;

        // SMART DATE INFERENCE: If we have a time but no date, infer today or tomorrow
        // This is crucial for half-hour bookings where Retell sends time="15:30" but no date
        let inferredDate = rawDate;
        if (!rawDate && rawTime && !startIso) {
          // Parse the time to determine if it's still available today
          let hours: number, minutes: number;
          if (rawTime.includes(':')) {
            [hours, minutes] = rawTime.split(':').map(Number);
          } else {
            const timeMatch = rawTime.match(/(\d+)(?::(\d+))?\s*(am|pm)?/i);
            if (timeMatch) {
              hours = parseInt(timeMatch[1]);
              minutes = parseInt(timeMatch[2] || '0');
              if (timeMatch[3]?.toLowerCase() === 'pm' && hours < 12) hours += 12;
              if (timeMatch[3]?.toLowerCase() === 'am' && hours === 12) hours = 0;
            } else {
              hours = 12;
              minutes = 0;
            }
          }

          // Get current time in user's timezone
          const now = new Date();
          const userNow = new Date(now.toLocaleString('en-US', { timeZone: userTimezone }));
          const currentHours = userNow.getHours();
          const currentMinutes = userNow.getMinutes();

          // If the requested time is still in the future today, use today; otherwise tomorrow
          const requestedTimeInMinutes = hours * 60 + minutes;
          const currentTimeInMinutes = currentHours * 60 + currentMinutes;

          if (requestedTimeInMinutes > currentTimeInMinutes + 30) {
            // Use today
            inferredDate = userNow.toISOString().split('T')[0];
          } else {
            // Use tomorrow
            const tomorrow = new Date(userNow);
            tomorrow.setDate(tomorrow.getDate() + 1);
            inferredDate = tomorrow.toISOString().split('T')[0];
          }

          console.log('[Calendar] Inferred date from time:', {
            rawTime,
            parsedHours: hours,
            parsedMinutes: minutes,
            currentTimeInMinutes,
            requestedTimeInMinutes,
            inferredDate,
          });
        }

        // If we STILL have no date and no startIso, ask for clarification
        if ((!inferredDate && !rawTime) && !startIso) {
          return new Response(
            JSON.stringify({
              success: false,
              message:
                "I need a date and time to book the appointment. What date and time works for you?",
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const date = inferredDate || (startIso ? new Date(startIso).toISOString().split('T')[0] : undefined);
        const time = inferredStartIsoFromRawTime ? undefined : rawTime;

        let appointmentTime: Date;
        let endTime: Date;

        if (startIso) {
          const isBareIsoLocal =
            typeof startIso === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(startIso);

          if (isBareIsoLocal) {
            // Retell sometimes provides a datetime without timezone ("YYYY-MM-DDTHH:mm:ss").
            // That string is ambiguous: it could be a wall-clock time in the user's timezone OR a UTC time copied from slots.
            // Disambiguate by picking the interpretation that falls inside the user's configured weekly schedule.
            const [datePart, timePart] = startIso.split('T');
            const [y, m, d] = datePart.split('-').map(Number);
            const [hh, mm, ss = '0'] = timePart.split(':');
            const ymd = datePart;
            const hm = `${hh}:${mm}`;

            const candidateAssumeUtc = new Date(Date.UTC(y, m - 1, d, Number(hh), Number(mm), Number(ss)));
            const candidateAssumeLocal = (() => {
              const base = zonedLocalToUtc(ymd, hm, userTimezone);
              const withSeconds = new Date(base.getTime());
              withSeconds.setUTCSeconds(Number(ss), 0);
              return withSeconds;
            })();

            const inScheduleUtc = isWithinWeeklySchedule(candidateAssumeUtc, userTimezone, weeklySchedule);
            const inScheduleLocal = isWithinWeeklySchedule(candidateAssumeLocal, userTimezone, weeklySchedule);

            // Prefer the candidate that's inside schedule; default to local if both/none match.
            appointmentTime = inScheduleUtc && !inScheduleLocal ? candidateAssumeUtc : candidateAssumeLocal;

            console.log('[Calendar] Parsed bare ISO time:', {
              startIso,
              picked: appointmentTime.toISOString(),
              pickedInterpretation: inScheduleUtc && !inScheduleLocal ? 'assume_utc' : 'assume_user_timezone',
              inScheduleUtc,
              inScheduleLocal,
              userTimezone,
            });
          } else {
            appointmentTime = new Date(startIso);
          }

          if (Number.isNaN(appointmentTime.getTime())) {
            return new Response(
              JSON.stringify({
                success: false,
                message:
                  "I couldn't understand that appointment time. Could you tell me the date and time again?",
              }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          if (endIso) {
            endTime = new Date(endIso);
            if (Number.isNaN(endTime.getTime())) {
              return new Response(
                JSON.stringify({
                  success: false,
                  message:
                    "I couldn't understand the end time for that appointment. What time should it end?",
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }
          } else {
            endTime = new Date(appointmentTime.getTime() + duration * 60000);
          }
        } else {
          // Parse date and time separately - PROPERLY handle timezone!
          let hours: number, minutes: number;
          if ((time || '').includes(':')) {
            [hours, minutes] = (time || '').split(':').map(Number);
          } else {
            // Handle "2 PM", "10 AM" format
            const timeMatch = (time || '').match(/(\d+)(?::(\d+))?\s*(am|pm)?/i);
            if (timeMatch) {
              hours = parseInt(timeMatch[1]);
              minutes = parseInt(timeMatch[2] || '0');
              if (timeMatch[3]?.toLowerCase() === 'pm' && hours < 12) hours += 12;
              if (timeMatch[3]?.toLowerCase() === 'am' && hours === 12) hours = 0;
            } else {
              return new Response(
                JSON.stringify({
                  success: false,
                  message:
                    "I couldn't understand that time. Could you say it like '2 PM' or '10:30 AM'?",
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }
          }

          // CRITICAL FIX: Use zonedLocalToUtc to properly convert user's local time to UTC
          // This ensures half-hour times like "15:30" are preserved correctly
          const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
          appointmentTime = zonedLocalToUtc(date as string, timeStr, userTimezone);
          endTime = new Date(appointmentTime.getTime() + duration * 60000);

          console.log('[Calendar] Parsed date+time using timezone:', {
            date,
            time,
            hours,
            minutes,
            timeStr,
            userTimezone,
            appointmentTimeUtc: appointmentTime.toISOString(),
          });
        }

        // CRITICAL: Validate appointment is not in the past
        const now = new Date();
        const currentTimeInUserTz = new Date(now.toLocaleString('en-US', { timeZone: userTimezone }));
        const appointmentTimeInUserTz = new Date(
          appointmentTime.toLocaleString('en-US', { timeZone: userTimezone })
        );

        console.log('[Calendar] Time validation - Now:', currentTimeInUserTz, 'Appointment:', appointmentTimeInUserTz);

        if (appointmentTime <= now) {
          console.log('[Calendar] Rejected past appointment:', appointmentTime, 'vs now:', now);
          return new Response(
            JSON.stringify({
              success: false,
              message:
                'That time has already passed. Let me check what times I have available today or tomorrow. When would you prefer - morning or afternoon?',
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Check for conflicts with existing appointments
        const appointmentDate = (date || appointmentTime.toISOString()).split('T')[0]; // Get YYYY-MM-DD
        const { data: existingAppts } = await supabase
          .from('calendar_appointments')
          .select('*')
          .eq('user_id', targetUserId)
          .gte('start_time', `${appointmentDate}T00:00:00`)
          .lte('start_time', `${appointmentDate}T23:59:59`)
          .in('status', ['confirmed', 'scheduled']);

        // Check for time conflicts
        const hasConflict = existingAppts?.some((appt) => {
          const apptStart = new Date(appt.start_time);
          const apptEnd = new Date(appt.end_time);
          // Check if appointment overlaps
          return (
            (appointmentTime >= apptStart && appointmentTime < apptEnd) ||
            (endTime > apptStart && endTime <= apptEnd) ||
            (appointmentTime <= apptStart && endTime >= apptEnd)
          );
        });

        if (hasConflict) {
          const conflicting = existingAppts?.find((appt) => {
            const apptStart = new Date(appt.start_time);
            const apptEnd = new Date(appt.end_time);
            return (
              (appointmentTime >= apptStart && appointmentTime < apptEnd) ||
              (endTime > apptStart && endTime <= apptEnd) ||
              (appointmentTime <= apptStart && endTime >= apptEnd)
            );
          });

          // If the agent repeats the booking call, treat an exact overlap as "already booked"
          // so it doesn't say it "hit a snag" after we successfully created the appointment.
          if (conflicting) {
            const diffMs = Math.abs(new Date(conflicting.start_time).getTime() - appointmentTime.getTime());
            const attendeeText = String(attendeeName || '').trim().toLowerCase();
            const titleText = String(conflicting.title || '').toLowerCase();
            const looksSame = diffMs <= 2 * 60 * 1000 && (!attendeeText || titleText.includes(attendeeText));

            if (looksSame) {
              return new Response(
                JSON.stringify({
                  success: true,
                  appointment_id: conflicting.id,
                  event_id: conflicting.google_event_id,
                  message: `You're all set — I already have you booked for ${formatTimeForVoice(new Date(conflicting.start_time), conflicting.timezone || userTimezone)}.`,
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }
          }

          console.log('[Calendar] Time slot conflict detected');
          return new Response(
            JSON.stringify({
              success: false,
              message:
                "I'm sorry, that time slot is no longer available. Would you like me to check what other times I have open today?",
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get user's calendar preference
        const { data: syncSettings } = await supabase
          .from('ghl_sync_settings')
          .select('calendar_preference')
          .eq('user_id', targetUserId)
          .maybeSingle();

        const calendarPreference = syncSettings?.calendar_preference || 'both';
        console.log('[Calendar] User calendar preference:', calendarPreference);

        // Try to sync with Google Calendar if connected and preference allows
        let googleEventId: string | null = null;

        if (calendarPreference === 'google' || calendarPreference === 'both') {
          const { data: integration } = await supabase
            .from('calendar_integrations')
            .select('*')
            .eq('user_id', targetUserId)
            .eq('provider', 'google')
            .maybeSingle();

        if (integration?.access_token_encrypted) {
          try {
            // Use helper function to ensure fresh token
            const accessToken = await ensureFreshGoogleToken(integration, supabase);

            const event = {
              summary: title || `Appointment with ${attendeeName || 'Lead'}`,
              description: `Booked via AI Dialer\nAttendee: ${attendeeName || 'Unknown'}\nEmail: ${attendeeEmail || 'Not provided'}`,
              start: { dateTime: appointmentTime.toISOString(), timeZone: userTimezone },
              end: { dateTime: endTime.toISOString(), timeZone: userTimezone },
              attendees: attendeeEmail ? [{ email: attendeeEmail }] : [],
            };

            const calendarId = integration.calendar_id || 'primary';
            const createResponse = await fetch(
              `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?sendUpdates=all`,
              {
                method: 'POST',
                headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(event),
              }
            );

            if (createResponse.ok) {
              const createdEvent = await createResponse.json();
              googleEventId = createdEvent.id;
              console.log('[Calendar] Google event created:', googleEventId);
            } else {
              const errorText = await createResponse.text();
              console.error(
                '[Calendar] Google Calendar creation failed:',
                createResponse.status,
                errorText
              );
            }
          } catch (error) {
            console.error('[Calendar] Google Calendar error:', error);
          }
        }
        }

        // Try to sync with GHL Calendar if connected and preference allows
        let ghlAppointmentId: string | null = null;

        if (calendarPreference === 'ghl' || calendarPreference === 'both') {
          const { data: ghlCreds } = await supabase
            .from('user_credentials')
            .select('credential_key, credential_value_encrypted')
            .eq('user_id', targetUserId)
            .eq('service_name', 'gohighlevel');

          if (ghlCreds && ghlCreds.length > 0) {
          try {
            const credentials: Record<string, string> = {};
            ghlCreds.forEach((c) => {
              try {
                credentials[c.credential_key] = atob(c.credential_value_encrypted);
              } catch (e) {}
            });

            if (credentials.apiKey && credentials.locationId) {
              // Get lead's GHL contact ID if available
              let ghlContactId: string | null = null;
              if (leadId) {
                const { data: lead } = await supabase
                  .from('leads')
                  .select('ghl_contact_id')
                  .eq('id', leadId)
                  .maybeSingle();
                ghlContactId = lead?.ghl_contact_id || null;
              }

              const ghlEvent = {
                locationId: credentials.locationId,
                title: title || `Appointment with ${attendeeName || 'Lead'}`,
                startTime: appointmentTime.toISOString(),
                endTime: endTime.toISOString(),
                timezone: userTimezone,
                notes: `Booked via AI Voice System${attendeeName ? ` - ${attendeeName}` : ''}${attendeeEmail ? ` - ${attendeeEmail}` : ''}`,
                ...(ghlContactId && { contactId: ghlContactId }),
              };

              console.log('[Calendar] Creating GHL Calendar appointment...');

              const ghlResponse = await fetch(
                `https://services.leadconnectorhq.com/calendars/events`,
                {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${credentials.apiKey}`,
                    'Content-Type': 'application/json',
                    'Version': '2021-07-28'
                  },
                  body: JSON.stringify(ghlEvent)
                }
              );

              if (ghlResponse.ok) {
                const ghlResult = await ghlResponse.json();
                ghlAppointmentId = ghlResult.id || ghlResult.event?.id;
                console.log('[Calendar] GHL appointment created:', ghlAppointmentId);
              } else {
                const errorText = await ghlResponse.text();
                console.error('[Calendar] GHL Calendar creation failed:', ghlResponse.status, errorText);
              }
            }
          } catch (ghlError) {
            console.error('[Calendar] GHL Calendar error:', ghlError);
          }
          }
        }

        // Always save to our local appointments table
        const { data: appt, error } = await supabase
          .from('calendar_appointments')
          .insert({
            user_id: targetUserId,
            lead_id: leadId,
            title: title || `Appointment with ${attendeeName || 'Lead'}`,
            start_time: appointmentTime.toISOString(),
            end_time: endTime.toISOString(),
            google_event_id: googleEventId,
            ghl_appointment_id: ghlAppointmentId,
            status: 'confirmed',
            timezone: userTimezone,
            metadata: {
              attendee_name: attendeeName,
              attendee_email: attendeeEmail,
              attendee_phone: callerPhone || attendee_phone || null,
              caller_phone: callerPhone || null,
              source: 'retell_ai',
              synced_to_google: !!googleEventId,
              synced_to_ghl: !!ghlAppointmentId,
            },
          })
          .select()
          .single();

        if (error) {
          console.error('[Calendar] Error saving appointment:', error);
          return new Response(
            JSON.stringify({
              success: false,
              message: 'I had trouble booking that appointment. Let me try again. What time works for you?',
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log('[Calendar] Appointment booked:', appt?.id);

        // Log the successful book_appointment invocation
        await logCalendarInvocation(
          supabase,
          targetUserId,
          'book_appointment',
          { attendee_name: attendeeName, attendee_email: attendeeEmail, start_time: appointmentTime.toISOString() },
          { appointment_id: appt?.id, google_event_id: googleEventId, ghl_appointment_id: ghlAppointmentId },
          true,
          undefined,
          bookStartTime
        );

        return new Response(
          JSON.stringify({
            success: true,
            appointment_id: appt?.id,
            event_id: googleEventId,
            message: `Perfect! I've booked your appointment for ${formatTimeForVoice(appointmentTime, userTimezone)}. ${attendeeEmail ? `You should receive a confirmation at ${attendeeEmail}.` : 'Looking forward to speaking with you!'}`,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'cancel_appointment':
      case 'cancelAppointment':
      case 'delete_appointment': {
        const cancelStartTime = Date.now();
        const {
          appointment_id,
          id,
          event_id,
          google_event_id,
          user_id: paramUserId,
          date,
          time,
          cancel_all,
          all,
        } = params;

        const targetUserId = paramUserId || userId;

        if (!targetUserId) {
          return new Response(
            JSON.stringify({
              success: true,
              message: "I can't access the calendar right now. Which user should I cancel for?",
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get timezone for interpreting any date/time the caller provides
        const { data: tzRow } = await supabase
          .from('calendar_availability')
          .select('timezone')
          .eq('user_id', targetUserId)
          .maybeSingle();
        const userTimezone = (tzRow?.timezone as string) || 'UTC';

        // Retell sometimes sends a full local datetime in the `time` field (e.g. "2026-01-03T16:00:00")
        // Normalize that into { date: YYYY-MM-DD, time: HH:MM } in the user's timezone.
        let requestedDate: string | undefined = date as string | undefined;
        let requestedTime: any = time;

        const inferredStartIsoFromTime =
          typeof requestedTime === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(requestedTime)
            ? requestedTime
            : null;

        if (!requestedDate && inferredStartIsoFromTime) {
          const [dPart, tPart] = inferredStartIsoFromTime.split('T');
          if (isYmd(dPart)) {
            requestedDate = dPart;
            requestedTime = tPart.slice(0, 5);
          }
        }

        // Scope actions to the caller (by phone/lead) so we never require reading long IDs aloud.
        const callerPhone = extractCallerPhone(params, retellCall);
        const leadId = callerPhone ? await findLeadIdByPhone(supabase, targetUserId, callerPhone) : null;
        const hasCallerScope = !!leadId || !!callerPhone;

        const boolish = (v: any) => {
          if (v === true) return true;
          if (v === false || v == null) return false;
          const s = String(v).trim().toLowerCase();
          return s === 'true' || s === '1' || s === 'yes' || s === 'y';
        };

        const cancelAll =
          boolish(cancel_all) || boolish(all) || boolish((params as any).cancelAll);

        let appointmentId: string | null = (appointment_id || id || null) as string | null;
        const eventIdParam: string | null = (event_id || google_event_id || null) as string | null;

        console.log('[Calendar] cancel_appointment called', {
          targetUserId,
          appointmentId,
          eventIdParam,
          rawDate: date,
          rawTime: time,
          date: requestedDate,
          time: requestedTime,
          cancelAll,
          userTimezone,
        });

        // If we don't have an ID/eventId AND the caller didn't give us a time/date AND we can't scope by phone/lead,
        // we can't safely identify which appointment to cancel.
        if (!cancelAll && !appointmentId && !eventIdParam && !requestedDate && !requestedTime && !hasCallerScope) {
          return new Response(
            JSON.stringify({
              success: true,
              message:
                "I can do that — I just need the phone number on the booking (or tell me the appointment time) so I cancel the right one.",
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Cancel ALL upcoming appointments
        if (cancelAll) {
          const nowIso = new Date().toISOString();

          const baseUpcomingAllQuery = () =>
            supabase
              .from('calendar_appointments')
              .select('id, title, start_time, end_time, timezone, status, google_event_id')
              .eq('user_id', targetUserId)
              .neq('status', 'cancelled')
              .gte('start_time', nowIso)
              .order('start_time', { ascending: true })
              .limit(25);

          let upcomingAll: any[] = [];

          // Try the most specific match first, but always fall back to ALL upcoming
          // (some appointments are not linked to a lead_id even if we can identify the caller).
          if (leadId) {
            const { data } = await baseUpcomingAllQuery().eq('lead_id', leadId);
            upcomingAll = Array.isArray(data) ? data : [];
          }

          if (upcomingAll.length === 0 && callerPhone) {
            // First try caller_phone, then attendee_phone (older records may not have caller_phone)
            const { data } = await baseUpcomingAllQuery().contains('metadata', { caller_phone: callerPhone });
            upcomingAll = Array.isArray(data) ? data : [];

            if (upcomingAll.length === 0) {
              const { data: data2 } = await baseUpcomingAllQuery().contains('metadata', { attendee_phone: callerPhone });
              upcomingAll = Array.isArray(data2) ? data2 : [];
            }
          }

          if (upcomingAll.length === 0) {
            const { data } = await baseUpcomingAllQuery();
            upcomingAll = Array.isArray(data) ? data : [];
          }

          console.log('[Calendar] cancel_all selection result:', {
            targetUserId,
            leadId,
            callerPhone,
            upcomingAll: upcomingAll.length,
          });

          if (upcomingAll.length === 0) {
            return new Response(
              JSON.stringify({ success: true, cancelled: 0, message: "I don't see any upcoming appointments to cancel." }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          // Fetch Google integration once (best-effort)
          const { data: integration } = await supabase
            .from('calendar_integrations')
            .select('*')
            .eq('user_id', targetUserId)
            .eq('provider', 'google')
            .maybeSingle();

          let accessToken: string | null = null;
          const calendarId = integration?.calendar_id || 'primary';

          if (integration?.access_token_encrypted) {
            try {
              accessToken = await ensureFreshGoogleToken(integration, supabase);
            } catch (e) {
              console.error('[Calendar] Failed to refresh Google token for cancel_all:', e);
            }
          }

          // Best-effort delete in Google; always mark cancelled locally.
          for (const appt of upcomingAll) {
            if (appt.google_event_id && accessToken) {
              try {
                const resp = await fetch(
                  `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${appt.google_event_id}?sendUpdates=all`,
                  { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } }
                );

                if (!resp.ok && resp.status !== 204 && resp.status !== 404) {
                  const errorText = await resp.text();
                  console.error('[Calendar] Google cancel_all failed:', resp.status, errorText);
                }
              } catch (e) {
                console.error('[Calendar] Google cancel_all error:', e);
              }
            }
          }

          const ids = upcomingAll.map((a) => a.id);
          const { error: updateError } = await supabase
            .from('calendar_appointments')
            .update({ status: 'cancelled' })
            .eq('user_id', targetUserId)
            .in('id', ids);

          if (updateError) {
            console.error('[Calendar] cancel_all DB update failed:', updateError);
            return new Response(
              JSON.stringify({ success: false, message: "I couldn't update the calendar right now. Please try again." }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          // Log the successful cancel_all invocation
          await logCalendarInvocation(
            supabase,
            targetUserId,
            'cancel_appointment',
            { cancel_all: true, caller_phone: callerPhone },
            { cancelled: ids.length, appointment_ids: ids },
            true,
            undefined,
            cancelStartTime
          );

          return new Response(
            JSON.stringify({
              success: true,
              cancelled: ids.length,
              appointment_ids: ids,
              message: `Done — I cancelled ${ids.length} appointment${ids.length === 1 ? '' : 's'}.`,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // If they provided only a time (e.g., "noon"), find the closest upcoming appointment at that time.
        if (!appointmentId && !eventIdParam && requestedTime && !requestedDate) {
          const minutesOnly = parseTimeToMinutes(String(requestedTime));

          if (minutesOnly != null) {
            let upcomingQuery = supabase
              .from('calendar_appointments')
              .select('id, title, start_time, timezone, status, google_event_id')
              .eq('user_id', targetUserId)
              .neq('status', 'cancelled')
              .gte('start_time', new Date().toISOString())
              .order('start_time', { ascending: true })
              .limit(25);

            if (leadId) {
              upcomingQuery = upcomingQuery.eq('lead_id', leadId);
            } else if (callerPhone) {
              upcomingQuery = upcomingQuery.contains('metadata', { caller_phone: callerPhone });
            }

            const { data: upcoming } = await upcomingQuery;

            const matches = (upcoming || []).filter((a) => {
              const tz = (a.timezone as string) || userTimezone;
              const hm = formatHmInTimeZone(new Date(a.start_time), tz);
              const mins = parseTimeToMinutes(hm);
              return mins === minutesOnly;
            });

            // If multiple match, cancel the soonest one (no reading long IDs aloud).
            if (matches.length >= 1) {
              appointmentId = matches[0].id;
            }
          }
        }

        // Extract title_contains from the request for natural language matching (e.g., "cancel the one with John")
        const titleContains = body.title_contains || body.titleContains || null;

        // If no specific appointment is provided, find the right one to cancel
        if (!appointmentId && !eventIdParam && !(requestedDate && requestedTime)) {
          // Base query for all upcoming appointments for this user
          const baseUpcomingQuery = () => supabase
            .from('calendar_appointments')
            .select('id, title, start_time, timezone, status, google_event_id, metadata')
            .eq('user_id', targetUserId)
            .neq('status', 'cancelled')
            .gte('start_time', new Date().toISOString())
            .order('start_time', { ascending: true })
            .limit(25);

          let upcoming: any[] = [];

          // Priority 1: Try lead_id match
          if (leadId) {
            const { data } = await baseUpcomingQuery().eq('lead_id', leadId);
            upcoming = Array.isArray(data) ? data : [];
          }

          // Priority 2: Try caller_phone match
          if (upcoming.length === 0 && callerPhone) {
            const { data } = await baseUpcomingQuery().contains('metadata', { caller_phone: callerPhone });
            upcoming = Array.isArray(data) ? data : [];

            if (upcoming.length === 0) {
              const { data: data2 } = await baseUpcomingQuery().contains('metadata', { attendee_phone: callerPhone });
              upcoming = Array.isArray(data2) ? data2 : [];
            }
          }

          // Priority 3: Fall back to ALL upcoming for this user (CRITICAL - prevents "I don't see any" when list shows appointments)
          if (upcoming.length === 0) {
            const { data } = await baseUpcomingQuery();
            upcoming = Array.isArray(data) ? data : [];
          }

          console.log('[Calendar] cancel single selection:', {
            targetUserId,
            leadId,
            callerPhone,
            titleContains,
            upcomingCount: upcoming.length,
          });

          if (!upcoming || upcoming.length === 0) {
            return new Response(
              JSON.stringify({ success: true, message: "I don't see any upcoming appointments to cancel." }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          // If title_contains is provided, filter by name/title match
          if (titleContains) {
            const searchTerm = String(titleContains).toLowerCase();
            const matched = upcoming.filter((a) => {
              const title = String(a.title || '').toLowerCase();
              const attendeeName = String((a.metadata as any)?.attendee_name || '').toLowerCase();
              return title.includes(searchTerm) || attendeeName.includes(searchTerm);
            });

            if (matched.length > 0) {
              appointmentId = matched[0].id;
              console.log('[Calendar] Matched by title_contains:', titleContains, '→', appointmentId);
            } else {
              // No match by name - tell the user
              return new Response(
                JSON.stringify({
                  success: true,
                  message: `I couldn't find an appointment matching "${titleContains}". Would you like me to list your appointments?`,
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }
          } else {
            // No title filter - cancel the next upcoming appointment (soonest)
            appointmentId = upcoming[0].id;
            console.log('[Calendar] Cancelling soonest appointment:', appointmentId);
          }
        }

        // Find the appointment record
        let appointment: any = null;

        if (appointmentId) {
          const { data } = await supabase
            .from('calendar_appointments')
            .select('*')
            .eq('user_id', targetUserId)
            .eq('id', appointmentId)
            .maybeSingle();
          appointment = data;
        } else if (eventIdParam) {
          const { data } = await supabase
            .from('calendar_appointments')
            .select('*')
            .eq('user_id', targetUserId)
            .eq('google_event_id', eventIdParam)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          appointment = data;
        } else if (requestedDate && requestedTime) {
          const minutes = parseTimeToMinutes(String(requestedTime));
          if (minutes == null || !isYmd(String(requestedDate))) {
            return new Response(
              JSON.stringify({
                success: true,
                message: "I couldn't understand that date/time. Can you repeat the appointment date and time?",
              }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
          const mm = String(minutes % 60).padStart(2, '0');
          const targetUtc = zonedLocalToUtc(String(requestedDate), `${hh}:${mm}`, userTimezone);

          const windowStart = new Date(targetUtc.getTime() - 2 * 60 * 60 * 1000).toISOString();
          const windowEnd = new Date(targetUtc.getTime() + 2 * 60 * 60 * 1000).toISOString();

          const baseDateQuery = () =>
            supabase
              .from('calendar_appointments')
              .select('*')
              .eq('user_id', targetUserId)
              .neq('status', 'cancelled')
              .gte('start_time', windowStart)
              .lte('start_time', windowEnd)
              .order('start_time', { ascending: true })
              .limit(10);

          let candidates: any[] = [];

          if (leadId) {
            const { data } = await baseDateQuery().eq('lead_id', leadId);
            candidates = Array.isArray(data) ? data : [];
          } else if (callerPhone) {
            const { data } = await baseDateQuery().contains('metadata', { caller_phone: callerPhone });
            candidates = Array.isArray(data) ? data : [];

            if (candidates.length === 0) {
              const { data: data2 } = await baseDateQuery().contains('metadata', { attendee_phone: callerPhone });
              candidates = Array.isArray(data2) ? data2 : [];
            }

            // If we still can't match by phone, fall back to the user's calendar within the requested time window.
            if (candidates.length === 0) {
              const { data: data3 } = await baseDateQuery();
              candidates = Array.isArray(data3) ? data3 : [];
            }
          } else {
            const { data } = await baseDateQuery();
            candidates = Array.isArray(data) ? data : [];
          }

          if (candidates.length > 0) {
            candidates.sort(
              (a, b) =>
                Math.abs(new Date(a.start_time).getTime() - targetUtc.getTime()) -
                Math.abs(new Date(b.start_time).getTime() - targetUtc.getTime())
            );
            appointment = candidates[0];
          }
        }

        if (!appointment) {
          return new Response(
            JSON.stringify({
              success: true,
              message: "I couldn't find that appointment. If you tell me the date and time, I can cancel it.",
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (String(appointment.status || '').toLowerCase() === 'cancelled') {
          return new Response(
            JSON.stringify({
              success: true,
              appointment_id: appointment.id,
              event_id: appointment.google_event_id,
              message: `That appointment is already cancelled.`,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Try to cancel in Google Calendar (if linked)
        if (appointment.google_event_id) {
          const { data: integration } = await supabase
            .from('calendar_integrations')
            .select('*')
            .eq('user_id', targetUserId)
            .eq('provider', 'google')
            .maybeSingle();

          if (integration?.access_token_encrypted) {
            try {
              const accessToken = await ensureFreshGoogleToken(integration, supabase);
              const calendarId = integration.calendar_id || 'primary';

              const deleteResponse = await fetch(
                `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${appointment.google_event_id}?sendUpdates=all`,
                { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } }
              );

              if (!deleteResponse.ok && deleteResponse.status !== 204 && deleteResponse.status !== 404) {
                const errorText = await deleteResponse.text();
                console.error('[Calendar] Google cancel failed:', deleteResponse.status, errorText);
              }
            } catch (e) {
              console.error('[Calendar] Google cancel error:', e);
            }
          }
        }

        const { error: updateError } = await supabase
          .from('calendar_appointments')
          .update({ status: 'cancelled' })
          .eq('user_id', targetUserId)
          .eq('id', appointment.id);

        if (updateError) {
          console.error('[Calendar] cancel DB update failed:', updateError);
          return new Response(
            JSON.stringify({
              success: false,
              message: "I hit a snag updating that appointment. Please try again in a moment.",
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Log the successful cancel_appointment invocation
        await logCalendarInvocation(
          supabase,
          targetUserId,
          'cancel_appointment',
          { appointment_id: appointment.id, caller_phone: callerPhone },
          { appointment_id: appointment.id, event_id: appointment.google_event_id },
          true,
          undefined,
          cancelStartTime
        );

        return new Response(
          JSON.stringify({
            success: true,
            appointment_id: appointment.id,
            event_id: appointment.google_event_id,
            message: `Done — I cancelled ${appointment.title || 'the appointment'} scheduled for ${formatTimeForVoice(new Date(appointment.start_time), appointment.timezone || userTimezone)}.`,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'reschedule_appointment':
      case 'rescheduleAppointment':
      case 'update_appointment': {
        const rescheduleStartTime = Date.now();
        const {
          appointment_id,
          id,
          event_id,
          google_event_id,
          user_id: paramUserId,

          // new time fields
          date,
          time,
          new_date,
          new_time,
          start_time,
          end_time,
          startTime,
          endTime,
          duration_minutes,
        } = params;

        const targetUserId = paramUserId || userId;

        if (!targetUserId) {
          return new Response(
            JSON.stringify({ success: false, message: "I can't access the calendar right now." }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Load timezone + schedule for disambiguation
        const { data: availability } = await supabase
          .from('calendar_availability')
          .select('timezone, weekly_schedule')
          .eq('user_id', targetUserId)
          .maybeSingle();

        const userTimezone = (availability?.timezone as string) || 'UTC';
        const weeklySchedule =
          typeof availability?.weekly_schedule === 'string'
            ? safeJsonParse<Record<string, any[]>>(availability.weekly_schedule, {})
            : (availability?.weekly_schedule as Record<string, any[]> | null) || {};

        const callerPhone = extractCallerPhone(params, retellCall);
        const leadId = callerPhone ? await findLeadIdByPhone(supabase, targetUserId, callerPhone) : null;
        const hasCallerScope = !!leadId || !!callerPhone;

        // Identify appointment
        const appointmentId = appointment_id || id;
        const eventIdParam = event_id || google_event_id;

        let appointment: any = null;
        if (appointmentId) {
          const { data } = await supabase
            .from('calendar_appointments')
            .select('*')
            .eq('user_id', targetUserId)
            .eq('id', appointmentId)
            .maybeSingle();
          appointment = data;
        } else if (eventIdParam) {
          const { data } = await supabase
            .from('calendar_appointments')
            .select('*')
            .eq('user_id', targetUserId)
            .eq('google_event_id', eventIdParam)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          appointment = data;
        } else {
          let upcomingQuery = supabase
            .from('calendar_appointments')
            .select('*')
            .eq('user_id', targetUserId)
            .neq('status', 'cancelled')
            .gte('start_time', new Date().toISOString())
            .order('start_time', { ascending: true })
            .limit(5);

          if (leadId) {
            upcomingQuery = upcomingQuery.eq('lead_id', leadId);
          } else if (callerPhone) {
            upcomingQuery = upcomingQuery.contains('metadata', { caller_phone: callerPhone });
          }

          const { data: upcoming } = await upcomingQuery;

          if (!upcoming || upcoming.length === 0) {
            return new Response(
              JSON.stringify({
                success: true,
                message: "I don't see any upcoming appointments to reschedule.",
              }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          // Reschedule the soonest one (no reading long IDs).
          appointment = upcoming[0];
        }

        if (!appointment) {
          return new Response(
            JSON.stringify({ success: false, message: "I couldn't find that appointment to reschedule." }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const duration = Number(duration_minutes || 30);

        const rawDate = new_date || date;
        const rawTime = new_time || time;
        const startIso = start_time || startTime;
        const endIso = end_time || endTime;
        const inferredStartIsoFromRawTime =
          typeof rawTime === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(rawTime)
            ? rawTime
            : null;

        let newStart: Date | null = null;
        let newEnd: Date | null = null;

        const chosenStartIso = startIso || inferredStartIsoFromRawTime;

        if (chosenStartIso) {
          const isBare = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(chosenStartIso);
          if (isBare) {
            const [datePart, timePart] = chosenStartIso.split('T');
            const [y, m, d] = datePart.split('-').map(Number);
            const [hh, mm, ss = '0'] = timePart.split(':');
            const hm = `${hh}:${mm}`;

            const candidateAssumeUtc = new Date(Date.UTC(y, m - 1, d, Number(hh), Number(mm), Number(ss)));
            const candidateAssumeLocal = (() => {
              const base = zonedLocalToUtc(datePart, hm, userTimezone);
              const withSeconds = new Date(base.getTime());
              withSeconds.setUTCSeconds(Number(ss), 0);
              return withSeconds;
            })();

            const inScheduleUtc = isWithinWeeklySchedule(candidateAssumeUtc, userTimezone, weeklySchedule);
            const inScheduleLocal = isWithinWeeklySchedule(candidateAssumeLocal, userTimezone, weeklySchedule);
            newStart = inScheduleUtc && !inScheduleLocal ? candidateAssumeUtc : candidateAssumeLocal;
          } else {
            newStart = new Date(chosenStartIso);
          }
        } else if (rawDate && rawTime && isYmd(String(rawDate))) {
          const minutes = parseTimeToMinutes(String(rawTime));
          if (minutes != null) {
            const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
            const mm = String(minutes % 60).padStart(2, '0');
            newStart = zonedLocalToUtc(String(rawDate), `${hh}:${mm}`, userTimezone);
          }
        }

        if (!newStart || Number.isNaN(newStart.getTime())) {
          return new Response(
            JSON.stringify({ success: false, message: "What date and time would you like to move it to?" }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (endIso) {
          newEnd = new Date(endIso);
          if (Number.isNaN(newEnd.getTime())) newEnd = null;
        }
        if (!newEnd) {
          newEnd = new Date(newStart.getTime() + duration * 60_000);
        }

        // Update Google event if linked
        if (appointment.google_event_id) {
          const { data: integration } = await supabase
            .from('calendar_integrations')
            .select('*')
            .eq('user_id', targetUserId)
            .eq('provider', 'google')
            .maybeSingle();

          if (integration?.access_token_encrypted) {
            try {
              const accessToken = await ensureFreshGoogleToken(integration, supabase);
              const calendarId = integration.calendar_id || 'primary';

              const patchBody = {
                start: { dateTime: newStart.toISOString(), timeZone: userTimezone },
                end: { dateTime: newEnd.toISOString(), timeZone: userTimezone },
              };

              const patchResp = await fetch(
                `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${appointment.google_event_id}?sendUpdates=all`,
                {
                  method: 'PATCH',
                  headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify(patchBody),
                }
              );

              if (!patchResp.ok) {
                const errorText = await patchResp.text();
                console.error('[Calendar] Google reschedule failed:', patchResp.status, errorText);
              }
            } catch (e) {
              console.error('[Calendar] Google reschedule error:', e);
            }
          }
        }

        await supabase
          .from('calendar_appointments')
          .update({
            start_time: newStart.toISOString(),
            end_time: newEnd.toISOString(),
            timezone: userTimezone,
            status: 'confirmed',
          })
          .eq('user_id', targetUserId)
          .eq('id', appointment.id);

        // Log the successful reschedule_appointment invocation
        await logCalendarInvocation(
          supabase,
          targetUserId,
          'reschedule_appointment',
          { appointment_id: appointment.id, new_start: newStart.toISOString() },
          { appointment_id: appointment.id, event_id: appointment.google_event_id },
          true,
          undefined,
          rescheduleStartTime
        );

        return new Response(
          JSON.stringify({
            success: true,
            appointment_id: appointment.id,
            event_id: appointment.google_event_id,
            message: `Done — I've rescheduled it to ${formatTimeForVoice(newStart, userTimezone)}.`,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'delete_event': {
        // Delete a Google Calendar event by event ID
        const eventUserIdParam = params.user_id;
        const eventId = params.event_id;
        
        if (!eventId) {
          return new Response(
            JSON.stringify({ error: 'event_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get integration
        const { data: integration } = await supabase
          .from('calendar_integrations')
          .select('*')
          .eq('user_id', eventUserIdParam || userId)
          .eq('provider', 'google')
          .maybeSingle();

        if (!integration?.access_token_encrypted) {
          return new Response(
            JSON.stringify({ error: 'Google Calendar not connected' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const accessToken = atob(integration.access_token_encrypted);
        const calendarId = integration.calendar_id || 'primary';

        const deleteResponse = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}`,
          {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${accessToken}` }
          }
        );

        if (!deleteResponse.ok && deleteResponse.status !== 204) {
          console.error('[Calendar] Delete event failed:', deleteResponse.status);
          return new Response(
            JSON.stringify({ success: false, error: 'Failed to delete event' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log('[Calendar] Event deleted:', eventId);
        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'update_event': {
        // Update a Google Calendar event by event ID
        const updateUserIdParam = params.user_id;
        const updateEventId = params.event_id;
        const updates = params.updates || {};
        
        if (!updateEventId) {
          return new Response(
            JSON.stringify({ error: 'event_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get integration
        const { data: updateIntegration } = await supabase
          .from('calendar_integrations')
          .select('*')
          .eq('user_id', updateUserIdParam || userId)
          .eq('provider', 'google')
          .maybeSingle();

        if (!updateIntegration?.access_token_encrypted) {
          return new Response(
            JSON.stringify({ error: 'Google Calendar not connected' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const updateAccessToken = atob(updateIntegration.access_token_encrypted);
        const updateCalendarId = updateIntegration.calendar_id || 'primary';

        // Build event update payload
        const eventUpdate: any = {};
        if (updates.start_time) {
          eventUpdate.start = { 
            dateTime: updates.start_time, 
            timeZone: updates.timezone || 'America/Chicago' 
          };
        }
        if (updates.end_time) {
          eventUpdate.end = { 
            dateTime: updates.end_time, 
            timeZone: updates.timezone || 'America/Chicago' 
          };
        }
        if (updates.title) {
          eventUpdate.summary = updates.title;
        }
        if (updates.description) {
          eventUpdate.description = updates.description;
        }

        const patchResponse = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${updateCalendarId}/events/${updateEventId}`,
          {
            method: 'PATCH',
            headers: { 
              'Authorization': `Bearer ${updateAccessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(eventUpdate)
          }
        );

        if (!patchResponse.ok) {
          console.error('[Calendar] Update event failed:', patchResponse.status);
          return new Response(
            JSON.stringify({ success: false, error: 'Failed to update event' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log('[Calendar] Event updated:', updateEventId);
        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('Calendar integration error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Helper function to proactively refresh Google Calendar token if expiring soon
async function ensureFreshGoogleToken(integration: any, supabase: any): Promise<string> {
  let accessToken = atob(integration.access_token_encrypted);
  
  // Check if token expires within 10 minutes and refresh if needed
  const expiresAt = integration.token_expires_at ? new Date(integration.token_expires_at) : null;
  const tenMinutesFromNow = new Date(Date.now() + 10 * 60 * 1000);
  
  if (expiresAt && expiresAt < tenMinutesFromNow && integration.refresh_token_encrypted) {
    console.log('[Calendar] Token expiring soon, proactively refreshing...');
    
    const refreshToken = atob(integration.refresh_token_encrypted);
    const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
    
    if (!clientId || !clientSecret) {
      console.error('[Calendar] Missing Google OAuth credentials (GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET)');
      return accessToken; // Return existing token if we can't refresh
    }
    
    try {
      const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token'
        })
      });
      
      if (refreshResponse.ok) {
        const tokens = await refreshResponse.json();
        accessToken = tokens.access_token;
        
        // Update stored token
        await supabase
          .from('calendar_integrations')
          .update({
            access_token_encrypted: btoa(tokens.access_token),
            token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString()
          })
          .eq('id', integration.id);
        
        console.log('[Calendar] Token refreshed proactively');
      } else {
        const errorText = await refreshResponse.text().catch(() => 'Unable to read error response');
        console.error('[Calendar] Proactive token refresh failed:', errorText);
      }
    } catch (error) {
      console.error('[Calendar] Token refresh error:', error);
    }
  }
  
  return accessToken;
}

// Helper function to format current time for voice agents
function formatCurrentTime(timeZone: string): string {
  return new Date().toLocaleString('en-US', {
    timeZone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  });
}

// Helper functions
async function getCalApiKey(supabase: any, userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const { data } = await supabase
    .from('user_credentials')
    .select('credential_value_encrypted')
    .eq('user_id', userId)
    .eq('service_name', 'calcom')
    .eq('credential_key', 'calcom_api_key')
    .single();
  return data?.credential_value_encrypted || null;
}

async function getCalEventTypeId(supabase: any, userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const { data } = await supabase
    .from('user_credentials')
    .select('credential_value_encrypted')
    .eq('user_id', userId)
    .eq('service_name', 'calcom')
    .eq('credential_key', 'calcom_event_type_id')
    .single();
  return data?.credential_value_encrypted || null;
}

function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch (error) {
    // JSON parse failed, return fallback - expected for invalid JSON
    return fallback;
  }
}

function isYmd(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function formatYmdInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
  const y = get('year');
  const m = get('month');
  const d = get('day');
  return `${y}-${m}-${d}`;
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  // Convert `date` to what the wall-clock time would be in `timeZone`, then compare to UTC.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);

  const asUtc = Date.UTC(
    get('year'),
    (get('month') || 1) - 1,
    get('day') || 1,
    get('hour') || 0,
    get('minute') || 0,
    get('second') || 0
  );

  return asUtc - date.getTime();
}

function zonedLocalToUtc(ymd: string, hm: string, timeZone: string): Date {
  // Interprets `ymd hm` as a wall-clock time in `timeZone` and returns the corresponding UTC Date.
  const [y, m, d] = ymd.split('-').map(Number);
  const [hour, minute] = hm.split(':').map(Number);

  // Start with a naive UTC date and correct by the zone offset at that instant.
  const naiveUtcMs = Date.UTC(y, m - 1, d, hour, minute, 0, 0);
  const naiveUtc = new Date(naiveUtcMs);
  const offsetMs = getTimeZoneOffsetMs(naiveUtc, timeZone);
  return new Date(naiveUtcMs - offsetMs);
}

function addDaysInTimeZone(ymd: string, days: number, timeZone: string): string {
  // Use noon to avoid DST edge cases.
  const base = zonedLocalToUtc(ymd, '12:00', timeZone);
  const next = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
  return formatYmdInTimeZone(next, timeZone);
}

function* iterateYmdRange(startYmd: string, endYmd: string, timeZone: string): Generator<string> {
  let current = startYmd;
  let guard = 0;
  while (current <= endYmd && guard < 60) {
    yield current;
    current = addDaysInTimeZone(current, 1, timeZone);
    guard++;
  }
}

function getWeekdayInTimeZone(ymd: string, timeZone: string): string {
  const date = zonedLocalToUtc(ymd, '12:00', timeZone);
  return date.toLocaleDateString('en-US', { weekday: 'long', timeZone }).toLowerCase();
}

function formatHmInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value || '00';
  return `${get('hour')}:${get('minute')}`;
}

function parseTimeToMinutes(value: string): number | null {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return null;

  // Common natural language times
  if (v === 'noon' || v === 'midday') return 12 * 60;
  if (v === 'midnight') return 0;

  // HH:MM (24h)
  if (/^\d{1,2}:\d{2}$/.test(v)) {
    const [h, m] = v.split(':').map(Number);
    return h * 60 + m;
  }

  // H or HH (assume :00)
  if (/^\d{1,2}$/.test(v)) {
    return Number(v) * 60;
  }

  // 10am, 10:30 pm
  const match = v.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (match) {
    let h = Number(match[1]);
    const m = Number(match[2] || '0');
    const ap = match[3].toLowerCase();
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    return h * 60 + m;
  }

  return null;
}

function isWithinWeeklySchedule(
  utcDate: Date,
  timeZone: string,
  weeklySchedule: Record<string, any[]>
): boolean {
  if (!weeklySchedule || Object.keys(weeklySchedule).length === 0) return false;

  const ymd = formatYmdInTimeZone(utcDate, timeZone);
  const weekday = getWeekdayInTimeZone(ymd, timeZone);
  const windows = weeklySchedule?.[weekday] || [];
  if (!Array.isArray(windows) || windows.length === 0) return false;

  const hm = formatHmInTimeZone(utcDate, timeZone);
  const tMin = parseTimeToMinutes(hm);
  if (tMin == null) return false;

  return windows.some((w: any) => {
    const startMin = parseTimeToMinutes(w?.start);
    const endMin = parseTimeToMinutes(w?.end);
    if (startMin == null || endMin == null) return false;
    return tMin >= startMin && tMin < endMin;
  });
}

function formatTimeForVoice(date: Date, timeZone?: string): string {
  const opts = timeZone ? { timeZone } : {};
  const dayName = date.toLocaleDateString('en-US', { weekday: 'long', ...opts });
  const monthDay = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', ...opts });
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', ...opts });
  return `${dayName}, ${monthDay} at ${time}`;
}

function formatCalComSlotsForVoice(slots: Record<string, { time: string }[]>): string[] {
  const formatted: string[] = [];
  for (const [, daySlots] of Object.entries(slots)) {
    for (const slot of daySlots) {
      formatted.push(formatTimeForVoice(new Date(slot.time)));
    }
  }
  return formatted.slice(0, 10);
}

async function handleAction(action: string, params: any, supabase: any, userId: string | null) {
  // This is a simplified re-routing for internal calls
  // In production, you'd want to refactor to avoid code duplication
  console.log(`[Calendar] Re-routing to ${action}`);
  return new Response(
    JSON.stringify({ redirect: action, params }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}

// ---------------------------------------------------------------------------
// extractCallerPhone: Pulls the inbound caller's phone from the Retell payload
// ---------------------------------------------------------------------------
function extractCallerPhone(params: Record<string, any>, retellCall: any): string | null {
  // 1. Explicit param the agent might have sent
  const fromParams =
    params.attendee_phone ||
    params.phone ||
    params.caller_phone ||
    params.from_number ||
    null;
  if (fromParams) {
    return normalizePhone(String(fromParams));
  }

  // 2. Retell's call object contains the inbound caller in `from_number` (their phone)
  if (retellCall) {
    const fromCall = retellCall.from_number || retellCall.caller_number || retellCall.phone || null;
    if (fromCall) {
      return normalizePhone(String(fromCall));
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// findLeadIdByPhone: Looks up a lead by phone number (normalized).
// ---------------------------------------------------------------------------
async function findLeadIdByPhone(
  supabase: any,
  userId: string,
  phone: string
): Promise<string | null> {
  const norm = normalizePhone(phone);
  if (!norm) return null;

  // Try exact match first
  const { data } = await supabase
    .from('leads')
    .select('id')
    .eq('user_id', userId)
    .eq('phone_number', norm)
    .limit(1)
    .maybeSingle();

  if (data?.id) return data.id;

  // Also try without +1 prefix in case stored differently
  const alt = norm.startsWith('+1') ? norm.slice(2) : `+1${norm.replace(/\D/g, '')}`;
  const { data: data2 } = await supabase
    .from('leads')
    .select('id')
    .eq('user_id', userId)
    .eq('phone_number', alt)
    .limit(1)
    .maybeSingle();

  return data2?.id ?? null;
}

// ---------------------------------------------------------------------------
// normalizePhone: Removes non-digits and ensures E.164-ish format
// ---------------------------------------------------------------------------
function normalizePhone(raw: string): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 7) return null;
  // Ensure leading +
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}

