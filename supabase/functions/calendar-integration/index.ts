import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    if (req.method === 'GET') {
      action = url.searchParams.get('action') || '';
      url.searchParams.forEach((value, key) => {
        if (key !== 'action') params[key] = value;
      });
    } else {
      const body = await req.json();
      action = body.action;
      params = body;
      delete params.action;
    }

    console.log(`Calendar integration action: ${action}`);

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

        // Save integration
        await supabase
          .from('calendar_integrations')
          .upsert({
            user_id: state,
            provider: 'google',
            provider_account_id: userInfo.id,
            provider_account_email: userInfo.email,
            access_token_encrypted: btoa(tokens.access_token),
            refresh_token_encrypted: tokens.refresh_token ? btoa(tokens.refresh_token) : null,
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
            results.ghl = { success: true, message: 'GHL sync pending' };
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
          return new Response(
            JSON.stringify({
              success: false,
              available_slots: [],
              message: "I'm having trouble accessing the calendar. Please try again or contact support.",
            }),
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
          const userTimeZone = 'America/New_York'; // Default fallback
          const currentTime = new Date().toLocaleString('en-US', {
            timeZone: userTimeZone,
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZoneName: 'short'
          });
          
          // Return default business hours if no availability configured
          return new Response(
            JSON.stringify({
              success: true,
              available_slots: ['9:00 AM', '10:00 AM', '11:00 AM', '2:00 PM', '3:00 PM'],
              current_time: currentTime,
              timezone: userTimeZone,
              message: `I have availability at 9 AM, 10 AM, 11 AM, 2 PM, and 3 PM. Which time works best for you?`,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const timeZone = (availability.timezone as string) || 'America/Chicago';
        
        // CRITICAL: Include current date/time in user's timezone in the response
        const currentTime = new Date().toLocaleString('en-US', {
          timeZone,
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          timeZoneName: 'short'
        });
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
            let accessToken = atob(integration.access_token_encrypted);
            
            // PROACTIVE TOKEN REFRESH: Check if token expires within 10 minutes and refresh if needed
            const expiresAt = integration.token_expires_at ? new Date(integration.token_expires_at) : null;
            const tenMinutesFromNow = new Date(Date.now() + 10 * 60 * 1000);
            
            if (expiresAt && expiresAt < tenMinutesFromNow && integration.refresh_token_encrypted) {
              console.log('[Calendar] Token expiring soon, proactively refreshing...');
              
              const refreshToken = atob(integration.refresh_token_encrypted);
              const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
              const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
              
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
                console.error('[Calendar] Proactive token refresh failed:', await refreshResponse.text());
              }
            }
            
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

        return new Response(
          JSON.stringify({
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
          }),
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

      case 'book_appointment': {
        const { date, time, duration_minutes, attendee_name, attendee_email, title, user_id: paramUserId } = params;
        const targetUserId = paramUserId || userId || '5969774f-5340-4e4f-8517-bcc89fa6b1eb';

        console.log('[Calendar] book_appointment called:', { date, time, attendee_name, targetUserId });

        if (!date || !time) {
          return new Response(
            JSON.stringify({ 
              success: false, 
              message: "I need the date and time to book the appointment. What date and time works for you?" 
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get user's timezone from their settings
        const { data: availability } = await supabase
          .from('calendar_availability')
          .select('timezone')
          .eq('user_id', targetUserId)
          .maybeSingle();

        const userTimezone = availability?.timezone || 'America/New_York';
        console.log('[Calendar] Using timezone:', userTimezone);

        // Parse date and time
        let hours: number, minutes: number;
        if (time.includes(':')) {
          [hours, minutes] = time.split(':').map(Number);
        } else {
          // Handle "2 PM", "10 AM" format
          const timeMatch = time.match(/(\d+)(?::(\d+))?\s*(am|pm)?/i);
          if (timeMatch) {
            hours = parseInt(timeMatch[1]);
            minutes = parseInt(timeMatch[2] || '0');
            if (timeMatch[3]?.toLowerCase() === 'pm' && hours < 12) hours += 12;
            if (timeMatch[3]?.toLowerCase() === 'am' && hours === 12) hours = 0;
          } else {
            return new Response(
              JSON.stringify({ 
                success: false, 
                message: "I couldn't understand that time. Could you say it like '2 PM' or '10:30 AM'?" 
              }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }

        const appointmentTime = new Date(date);
        appointmentTime.setHours(hours, minutes, 0, 0);

        // CRITICAL: Validate appointment is not in the past
        const now = new Date();
        const currentTimeInUserTz = new Date(now.toLocaleString('en-US', { timeZone: userTimezone }));
        const appointmentTimeInUserTz = new Date(appointmentTime.toLocaleString('en-US', { timeZone: userTimezone }));
        
        console.log('[Calendar] Time validation - Now:', currentTimeInUserTz, 'Appointment:', appointmentTimeInUserTz);

        if (appointmentTime <= now) {
          console.log('[Calendar] Rejected past appointment:', appointmentTime, 'vs now:', now);
          return new Response(
            JSON.stringify({ 
              success: false, 
              message: "That time has already passed. Let me check what times I have available today or tomorrow. When would you prefer - morning or afternoon?" 
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Check for conflicts with existing appointments
        const appointmentDate = date.split('T')[0]; // Get YYYY-MM-DD
        const { data: existingAppts } = await supabase
          .from('calendar_appointments')
          .select('*')
          .eq('user_id', targetUserId)
          .gte('start_time', `${appointmentDate}T00:00:00`)
          .lte('start_time', `${appointmentDate}T23:59:59`)
          .in('status', ['confirmed', 'scheduled']);

        // Check for time conflicts
        const duration = duration_minutes || 30;
        const endTime = new Date(appointmentTime.getTime() + duration * 60000);
        
        const hasConflict = existingAppts?.some(appt => {
          const apptStart = new Date(appt.start_time);
          const apptEnd = new Date(appt.end_time);
          // Check if appointment overlaps
          return (appointmentTime >= apptStart && appointmentTime < apptEnd) ||
                 (endTime > apptStart && endTime <= apptEnd) ||
                 (appointmentTime <= apptStart && endTime >= apptEnd);
        });

        if (hasConflict) {
          console.log('[Calendar] Time slot conflict detected');
          return new Response(
            JSON.stringify({ 
              success: false, 
              message: "I'm sorry, that time slot is no longer available. Would you like me to check what other times I have open today?" 
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Try to sync with Google Calendar if connected
        let googleEventId: string | null = null;
        
        const { data: integration } = await supabase
          .from('calendar_integrations')
          .select('*')
          .eq('user_id', targetUserId)
          .eq('provider', 'google')
          .maybeSingle();

        if (integration?.access_token_encrypted) {
          try {
            let accessToken = atob(integration.access_token_encrypted);
            
            // PROACTIVE TOKEN REFRESH: Check if token expires within 10 minutes and refresh if needed
            const expiresAt = integration.token_expires_at ? new Date(integration.token_expires_at) : null;
            const tenMinutesFromNow = new Date(Date.now() + 10 * 60 * 1000);
            
            if (expiresAt && expiresAt < tenMinutesFromNow && integration.refresh_token_encrypted) {
              console.log('[Calendar] Token expiring soon, proactively refreshing before booking...');
              
              const refreshToken = atob(integration.refresh_token_encrypted);
              const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
              const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
              
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
                
                console.log('[Calendar] Token refreshed proactively before booking');
              } else {
                console.error('[Calendar] Proactive token refresh failed:', await refreshResponse.text());
              }
            }
            
            const event = {
              summary: title || `Appointment with ${attendee_name || 'Lead'}`,
              description: `Booked via AI Dialer\nAttendee: ${attendee_name || 'Unknown'}\nEmail: ${attendee_email || 'Not provided'}`,
              start: { dateTime: appointmentTime.toISOString(), timeZone: userTimezone },
              end: { dateTime: endTime.toISOString(), timeZone: userTimezone },
              attendees: attendee_email ? [{ email: attendee_email }] : []
            };

            const calendarId = integration.calendar_id || 'primary';
            const createResponse = await fetch(
              `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?sendUpdates=all`,
              {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(event)
              }
            );

            if (createResponse.ok) {
              const createdEvent = await createResponse.json();
              googleEventId = createdEvent.id;
              console.log('[Calendar] Google event created:', googleEventId);
            } else {
              const errorText = await createResponse.text();
              console.error('[Calendar] Google Calendar creation failed:', createResponse.status, errorText);
            }
          } catch (error) {
            console.error('[Calendar] Google Calendar error:', error);
          }
        }

        // Always save to our local appointments table
        const { data: appt, error } = await supabase.from('calendar_appointments').insert({
          user_id: targetUserId,
          title: title || `Appointment with ${attendee_name || 'Lead'}`,
          start_time: appointmentTime.toISOString(),
          end_time: endTime.toISOString(),
          google_event_id: googleEventId,
          status: 'confirmed',
          timezone: userTimezone,
          metadata: { attendee_name, attendee_email, source: 'retell_ai' }
        }).select().single();

        if (error) {
          console.error('[Calendar] Error saving appointment:', error);
          return new Response(
            JSON.stringify({ 
              success: false, 
              message: "I had trouble booking that appointment. Let me try again. What time works for you?" 
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log('[Calendar] Appointment booked:', appt?.id);

        return new Response(
          JSON.stringify({
            success: true,
            appointment_id: appt?.id,
            event_id: googleEventId,
            message: `Perfect! I've booked your appointment for ${formatTimeForVoice(appointmentTime)}. ${attendee_email ? `You should receive a confirmation at ${attendee_email}.` : 'Looking forward to speaking with you!'}`
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'cancel_appointment': {
        const { event_id, date, time } = requestBody;

        // Get user's Google Calendar integration
        const { data: integrations } = await supabase
          .from('calendar_integrations')
          .select('*')
          .eq('provider', 'google')
          .limit(1);

        if (!integrations || integrations.length === 0) {
          return new Response(
            JSON.stringify({ 
              success: false, 
              message: "Calendar is not connected." 
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const integration = integrations[0];
        const accessToken = atob(integration.access_token_encrypted);
        const calendarId = integration.calendar_id || 'primary';

        let eventIdToCancel = event_id;

        // If no event_id, try to find by date/time
        if (!eventIdToCancel && date && time) {
          const [hours, minutes] = time.split(':').map(Number);
          const searchTime = new Date(date);
          searchTime.setHours(hours, minutes, 0, 0);
          
          const timeMin = new Date(searchTime.getTime() - 5 * 60000);
          const timeMax = new Date(searchTime.getTime() + 5 * 60000);

          const eventsResponse = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?` +
            `timeMin=${timeMin.toISOString()}&timeMax=${timeMax.toISOString()}&singleEvents=true`,
            {
              headers: { 'Authorization': `Bearer ${accessToken}` }
            }
          );

          if (eventsResponse.ok) {
            const eventsData = await eventsResponse.json();
            if (eventsData.items && eventsData.items.length > 0) {
              eventIdToCancel = eventsData.items[0].id;
            }
          }
        }

        if (!eventIdToCancel) {
          return new Response(
            JSON.stringify({ 
              success: false, 
              message: "I couldn't find that appointment. Can you confirm the date and time?" 
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Delete the event
        const deleteResponse = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventIdToCancel}`,
          {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${accessToken}` }
          }
        );

        if (!deleteResponse.ok && deleteResponse.status !== 204) {
          return new Response(
            JSON.stringify({ 
              success: false, 
              message: "I wasn't able to cancel that appointment. Please try again." 
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Update our appointments table
        await supabase
          .from('calendar_appointments')
          .update({ status: 'cancelled' })
          .eq('google_event_id', eventIdToCancel);

        return new Response(
          JSON.stringify({
            success: true,
            message: "Done! I've cancelled that appointment for you."
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

