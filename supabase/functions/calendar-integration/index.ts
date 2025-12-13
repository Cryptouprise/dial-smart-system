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

    const { action, ...params } = await req.json();
    console.log(`Calendar integration action: ${action}`);

    switch (action) {
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
        const redirectUri = Deno.env.get('GOOGLE_REDIRECT_URI');

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

        // Return HTML that closes the popup
        return new Response(
          `<html><body><script>
            window.opener.postMessage({ type: 'google-calendar-connected' }, '*');
            window.close();
          </script></body></html>`,
          { headers: { ...corsHeaders, 'Content-Type': 'text/html' } }
        );
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

        for (const integration of integrations || []) {
          if (integration.provider === 'google' && integration.access_token_encrypted) {
            try {
              const accessToken = atob(integration.access_token_encrypted);
              
              const event = {
                summary: appointment.title,
                description: appointment.description,
                location: appointment.location,
                start: {
                  dateTime: appointment.start_time,
                  timeZone: appointment.timezone
                },
                end: {
                  dateTime: appointment.end_time,
                  timeZone: appointment.timezone
                }
              };

              const response = await fetch(
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

              if (response.ok) {
                const googleEvent = await response.json();
                results.google = { success: true, eventId: googleEvent.id };
                
                // Update appointment with Google event ID
                await supabase
                  .from('calendar_appointments')
                  .update({ google_event_id: googleEvent.id })
                  .eq('id', appointment.id);
              }
            } catch (error) {
              console.error('Google sync error:', error);
              results.google = { success: false, error: String(error) };
            }
          }

          if (integration.provider === 'ghl') {
            // GHL calendar sync would go here
            results.ghl = { success: true, message: 'GHL sync pending' };
          }
        }

        return new Response(
          JSON.stringify({ success: true, results }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get_available_slots': {
        const { date, duration = 30 } = params;
        
        if (!userId) {
          return new Response(
            JSON.stringify({ error: 'Authentication required' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get user's availability settings
        const { data: availability } = await supabase
          .from('calendar_availability')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();

        if (!availability) {
          return new Response(
            JSON.stringify({ slots: [] }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const targetDate = new Date(date);
        const dayOfWeek = targetDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
        const schedule = availability.weekly_schedule as any;
        const daySlots = schedule[dayOfWeek] || [];

        if (daySlots.length === 0) {
          return new Response(
            JSON.stringify({ slots: [] }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get existing appointments for the day
        const dayStart = new Date(targetDate);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(targetDate);
        dayEnd.setHours(23, 59, 59, 999);

        const { data: existingAppts } = await supabase
          .from('calendar_appointments')
          .select('start_time, end_time')
          .eq('user_id', userId)
          .neq('status', 'cancelled')
          .gte('start_time', dayStart.toISOString())
          .lte('start_time', dayEnd.toISOString());

        const busyTimes = (existingAppts || []).map(a => ({
          start: new Date(a.start_time).getTime(),
          end: new Date(a.end_time).getTime()
        }));

        // Generate available slots
        const slots: { start: string; end: string }[] = [];
        const slotInterval = availability.slot_interval_minutes || 15;
        const bufferBefore = availability.buffer_before_minutes || 0;
        const bufferAfter = availability.buffer_after_minutes || 0;

        for (const window of daySlots) {
          const [startHour, startMin] = window.start.split(':').map(Number);
          const [endHour, endMin] = window.end.split(':').map(Number);

          let current = new Date(targetDate);
          current.setHours(startHour, startMin, 0, 0);

          const windowEnd = new Date(targetDate);
          windowEnd.setHours(endHour, endMin, 0, 0);

          while (current.getTime() + duration * 60000 <= windowEnd.getTime()) {
            const slotStart = current.getTime();
            const slotEnd = slotStart + duration * 60000;

            // Check for conflicts
            const hasConflict = busyTimes.some(busy => {
              const bufferedStart = slotStart - bufferBefore * 60000;
              const bufferedEnd = slotEnd + bufferAfter * 60000;
              return bufferedStart < busy.end && bufferedEnd > busy.start;
            });

            if (!hasConflict) {
              slots.push({
                start: new Date(slotStart).toISOString(),
                end: new Date(slotEnd).toISOString()
              });
            }

            current = new Date(current.getTime() + slotInterval * 60000);
          }
        }

        return new Response(
          JSON.stringify({ slots }),
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
