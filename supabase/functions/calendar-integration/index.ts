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
          `prompt=select_account&` +
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

        // Return HTML that closes the popup (or shows a success message if opened in a full tab)
        return new Response(
          `<!DOCTYPE html><html><head><title>Google Calendar Connected</title></head><body style="font-family: system-ui; text-align: center; padding: 40px;">
            <h2>Google Calendar Connected</h2>
            <p>You can close this window and return to the app.</p>
            <script>
              try {
                if (window.opener && !window.opener.closed) {
                  window.opener.postMessage({ type: 'google-calendar-connected' }, '*');
                  window.close();
                }
              } catch (e) {
                console.error('PostMessage error', e);
              }
            </script>
          </body></html>`,
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
        const { date, duration = 30, startDate, endDate } = params;
        
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

        const targetDate = new Date(date || startDate);
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
        const slots: { start: string; end: string; formatted?: string }[] = [];
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
              const startDate = new Date(slotStart);
              slots.push({
                start: startDate.toISOString(),
                end: new Date(slotEnd).toISOString(),
                formatted: formatTimeForVoice(startDate)
              });
            }

            current = new Date(current.getTime() + slotInterval * 60000);
          }
        }

        // For Retell, return a voice-friendly message
        const limitedSlots = slots.slice(0, 5);
        const message = limitedSlots.length > 0
          ? `I have ${limitedSlots.length} available times: ${limitedSlots.map(s => s.formatted).join(', ')}.`
          : 'I don\'t have any available slots for that day.';

        return new Response(
          JSON.stringify({ slots, message }),
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
          } catch {
            // Keep default message
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

      // Retell Custom Function Actions - these are called by the AI agent
      case 'get_available_slots': {
        // Accept user_id from params (for Retell webhook calls) or from auth
        const targetUserId = params.user_id || userId;
        const { date } = params;
        
        console.log('[Calendar] get_available_slots called, user_id:', targetUserId, 'date:', date);
        
        // Default to today if no date provided
        const searchDate = date ? new Date(date) : new Date();
        const dayOfWeek = searchDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
        
        // Get user's availability settings first
        const { data: availability } = await supabase
          .from('calendar_availability')
          .select('*')
          .eq('user_id', targetUserId || '5969774f-5340-4e4f-8517-bcc89fa6b1eb') // Fallback to default user
          .maybeSingle();

        console.log('[Calendar] Availability found:', !!availability);

        if (!availability) {
          // Return default business hours if no availability configured
          return new Response(
            JSON.stringify({ 
              success: true, 
              available_slots: ['9:00 AM', '10:00 AM', '11:00 AM', '2:00 PM', '3:00 PM'],
              message: "I have availability at 9 AM, 10 AM, 11 AM, 2 PM, and 3 PM. Which time works best for you?"
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const schedule = availability.weekly_schedule as any;
        const daySlots = schedule[dayOfWeek] || [];
        
        console.log('[Calendar] Day:', dayOfWeek, 'Slots config:', daySlots);

        if (daySlots.length === 0) {
          return new Response(
            JSON.stringify({ 
              success: true, 
              available_slots: [],
              message: `I don't have availability on ${searchDate.toLocaleDateString('en-US', { weekday: 'long' })}. Would you like to try a different day?`
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Try to get Google Calendar busy times if connected
        let busyTimes: { start: number; end: number }[] = [];
        
        if (targetUserId) {
          const { data: integration } = await supabase
            .from('calendar_integrations')
            .select('*')
            .eq('user_id', targetUserId)
            .eq('provider', 'google')
            .maybeSingle();

          if (integration?.access_token_encrypted) {
            try {
              const accessToken = atob(integration.access_token_encrypted);
              const startOfDay = new Date(searchDate);
              startOfDay.setHours(0, 0, 0, 0);
              const endOfDay = new Date(searchDate);
              endOfDay.setHours(23, 59, 59, 999);

              const calendarId = integration.calendar_id || 'primary';
              const eventsResponse = await fetch(
                `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?` +
                `timeMin=${startOfDay.toISOString()}&timeMax=${endOfDay.toISOString()}&singleEvents=true`,
                { headers: { 'Authorization': `Bearer ${accessToken}` } }
              );

              if (eventsResponse.ok) {
                const eventsData = await eventsResponse.json();
                busyTimes = (eventsData.items || []).map((event: any) => ({
                  start: new Date(event.start.dateTime || event.start.date).getTime(),
                  end: new Date(event.end.dateTime || event.end.date).getTime()
                }));
                console.log('[Calendar] Google Calendar busy times:', busyTimes.length);
              }
            } catch (error) {
              console.error('[Calendar] Google Calendar error:', error);
            }
          }
        }

        // Also check local appointments
        const dayStart = new Date(searchDate);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(searchDate);
        dayEnd.setHours(23, 59, 59, 999);

        const { data: existingAppts } = await supabase
          .from('calendar_appointments')
          .select('start_time, end_time')
          .eq('user_id', targetUserId || '5969774f-5340-4e4f-8517-bcc89fa6b1eb')
          .neq('status', 'cancelled')
          .gte('start_time', dayStart.toISOString())
          .lte('start_time', dayEnd.toISOString());

        if (existingAppts) {
          busyTimes = busyTimes.concat(existingAppts.map(a => ({
            start: new Date(a.start_time).getTime(),
            end: new Date(a.end_time).getTime()
          })));
        }

        // Generate available slots based on configured availability
        const slotInterval = availability.slot_interval_minutes || 30;
        const bufferBefore = availability.buffer_before_minutes || 0;
        const bufferAfter = availability.buffer_after_minutes || 0;
        const duration = availability.default_meeting_duration || 30;

        const availableSlots: string[] = [];
        const now = new Date();

        for (const window of daySlots) {
          const [startHour, startMin] = window.start.split(':').map(Number);
          const [endHour, endMin] = window.end.split(':').map(Number);

          const current = new Date(searchDate);
          current.setHours(startHour, startMin, 0, 0);

          const windowEnd = new Date(searchDate);
          windowEnd.setHours(endHour, endMin, 0, 0);

          while (current.getTime() + duration * 60000 <= windowEnd.getTime()) {
            const slotStart = current.getTime();
            const slotEnd = slotStart + duration * 60000;

            // Check for conflicts with buffer
            const hasConflict = busyTimes.some(busy => {
              const bufferedStart = slotStart - bufferBefore * 60000;
              const bufferedEnd = slotEnd + bufferAfter * 60000;
              return bufferedStart < busy.end && bufferedEnd > busy.start;
            });

            // Only add future slots
            if (!hasConflict && current > now) {
              availableSlots.push(formatTimeForVoice(current));
            }

            current.setMinutes(current.getMinutes() + slotInterval);
          }
        }

        const slotsToShow = availableSlots.slice(0, 5);
        console.log('[Calendar] Available slots:', slotsToShow);
        
        return new Response(
          JSON.stringify({
            success: true,
            available_slots: slotsToShow,
            message: slotsToShow.length > 0 
              ? `I have ${slotsToShow.length} available time slots. They are: ${slotsToShow.join(', ')}.`
              : "I don't have any available slots for that date. Would you like to try a different day?"
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

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

        const startTime = new Date(date);
        startTime.setHours(hours, minutes, 0, 0);
        
        const duration = duration_minutes || 30;
        const endTime = new Date(startTime.getTime() + duration * 60000);

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
            const accessToken = atob(integration.access_token_encrypted);
            const event = {
              summary: title || `Appointment with ${attendee_name || 'Lead'}`,
              description: `Booked via AI Dialer\nAttendee: ${attendee_name || 'Unknown'}\nEmail: ${attendee_email || 'Not provided'}`,
              start: { dateTime: startTime.toISOString(), timeZone: 'America/Chicago' },
              end: { dateTime: endTime.toISOString(), timeZone: 'America/Chicago' },
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
            }
          } catch (error) {
            console.error('[Calendar] Google Calendar error:', error);
          }
        }

        // Always save to our local appointments table
        const { data: appt, error } = await supabase.from('calendar_appointments').insert({
          user_id: targetUserId,
          title: title || `Appointment with ${attendee_name || 'Lead'}`,
          start_time: startTime.toISOString(),
          end_time: endTime.toISOString(),
          google_event_id: googleEventId,
          status: 'confirmed',
          timezone: 'America/Chicago',
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
            message: `Perfect! I've booked your appointment for ${formatTimeForVoice(startTime)}. ${attendee_email ? `You should receive a confirmation at ${attendee_email}.` : 'Looking forward to speaking with you!'}`
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'cancel_appointment': {
        const { event_id, date, time } = body;

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

function formatTimeForVoice(date: Date): string {
  const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
  const monthDay = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
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
