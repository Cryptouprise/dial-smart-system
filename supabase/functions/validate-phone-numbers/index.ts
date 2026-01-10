import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TwilioNumber {
  sid: string;
  phone_number: string;
  capabilities: {
    voice: boolean;
    sms: boolean;
    mms: boolean;
    fax: boolean;
  };
  status: string;
}

interface ValidationResult {
  number: string;
  valid: boolean;
  twilio_sid?: string;
  capabilities?: Record<string, boolean>;
  error?: string;
}

async function fetchTwilioNumbers(accountSid: string, authToken: string): Promise<TwilioNumber[]> {
  const allNumbers: TwilioNumber[] = [];
  let nextPageUri: string | null = `/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json?PageSize=100`;
  
  while (nextPageUri) {
    const url = nextPageUri.startsWith('http') 
      ? nextPageUri 
      : `https://api.twilio.com${nextPageUri}`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
      },
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Twilio API error: ${response.status} - ${error}`);
    }
    
    const data = await response.json();
    allNumbers.push(...(data.incoming_phone_numbers || []));
    nextPageUri = data.next_page_uri || null;
  }
  
  return allNumbers;
}

function normalizePhoneNumber(phone: string): string {
  // Remove all non-digit characters except leading +
  const cleaned = phone.replace(/[^\d+]/g, '');
  // Ensure E.164 format
  if (cleaned.startsWith('+')) return cleaned;
  if (cleaned.startsWith('1') && cleaned.length === 11) return `+${cleaned}`;
  if (cleaned.length === 10) return `+1${cleaned}`;
  return `+${cleaned}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), { 
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), { 
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const { action, number_ids } = await req.json();

    // Get user's provider credentials
    const { data: credentials } = await supabase
      .from('provider_credentials')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!credentials?.twilio_account_sid || !credentials?.twilio_auth_token) {
      return new Response(JSON.stringify({ 
        error: 'Twilio credentials not configured. Please add your Twilio Account SID and Auth Token in Settings.' 
      }), { 
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    if (action === 'validate') {
      // Fetch all numbers from user's Twilio account
      console.log('Fetching Twilio numbers...');
      const twilioNumbers = await fetchTwilioNumbers(
        credentials.twilio_account_sid,
        credentials.twilio_auth_token
      );
      console.log(`Found ${twilioNumbers.length} numbers in Twilio account`);

      // Create a map for quick lookup (normalized phone -> Twilio data)
      const twilioMap = new Map<string, TwilioNumber>();
      for (const tn of twilioNumbers) {
        const normalized = normalizePhoneNumber(tn.phone_number);
        twilioMap.set(normalized, tn);
      }

      // Get phone numbers to validate from database
      let query = supabase
        .from('phone_numbers')
        .select('id, number, provider, carrier_name, status')
        .eq('user_id', user.id)
        .or('provider.eq.twilio,provider.is.null');

      if (number_ids && number_ids.length > 0) {
        query = query.in('id', number_ids);
      }

      const { data: dbNumbers, error: dbError } = await query;
      if (dbError) throw dbError;

      const results: ValidationResult[] = [];
      let verified = 0;
      let notFound = 0;
      let skipped = 0;

      for (const dbNum of dbNumbers || []) {
        // Skip Retell native numbers
        if (dbNum.provider === 'retell_native' || dbNum.carrier_name?.toLowerCase().includes('retell')) {
          skipped++;
          continue;
        }

        const normalized = normalizePhoneNumber(dbNum.number);
        const twilioData = twilioMap.get(normalized);

        if (twilioData) {
          // Number exists in Twilio - update database
          await supabase
            .from('phone_numbers')
            .update({
              twilio_verified: true,
              twilio_verified_at: new Date().toISOString(),
              twilio_sid: twilioData.sid,
              capabilities: twilioData.capabilities,
              provider: 'twilio',
              status: 'active',
              notes: null // Clear any previous error notes
            })
            .eq('id', dbNum.id);

          results.push({
            number: dbNum.number,
            valid: true,
            twilio_sid: twilioData.sid,
            capabilities: twilioData.capabilities
          });
          verified++;
        } else {
          // Number NOT in Twilio
          await supabase
            .from('phone_numbers')
            .update({
              twilio_verified: false,
              twilio_verified_at: new Date().toISOString(),
              twilio_sid: null,
              notes: 'Not found in Twilio account'
            })
            .eq('id', dbNum.id);

          results.push({
            number: dbNum.number,
            valid: false,
            error: 'Not found in your Twilio account'
          });
          notFound++;
        }
      }

      return new Response(JSON.stringify({
        success: true,
        summary: {
          total_checked: results.length,
          verified,
          not_found: notFound,
          skipped_retell: skipped,
          twilio_account_numbers: twilioNumbers.length
        },
        results
      }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });

    } else if (action === 'sync') {
      // Import ALL numbers from Twilio that aren't already in DB
      console.log('Syncing numbers from Twilio...');
      const twilioNumbers = await fetchTwilioNumbers(
        credentials.twilio_account_sid,
        credentials.twilio_auth_token
      );

      // Get existing numbers in DB
      const { data: existingNumbers } = await supabase
        .from('phone_numbers')
        .select('number')
        .eq('user_id', user.id);

      const existingSet = new Set((existingNumbers || []).map(n => normalizePhoneNumber(n.number)));

      let imported = 0;
      let alreadyExists = 0;
      const importedNumbers: string[] = [];

      for (const tn of twilioNumbers) {
        const normalized = normalizePhoneNumber(tn.phone_number);
        
        if (existingSet.has(normalized)) {
          alreadyExists++;
          continue;
        }

        // Insert new number
        const { error: insertError } = await supabase
          .from('phone_numbers')
          .insert({
            user_id: user.id,
            number: tn.phone_number,
            provider: 'twilio',
            status: 'active',
            twilio_verified: true,
            twilio_verified_at: new Date().toISOString(),
            twilio_sid: tn.sid,
            capabilities: tn.capabilities
          });

        if (!insertError) {
          imported++;
          importedNumbers.push(tn.phone_number);
        } else {
          console.error(`Failed to import ${tn.phone_number}:`, insertError);
        }
      }

      return new Response(JSON.stringify({
        success: true,
        summary: {
          twilio_total: twilioNumbers.length,
          imported,
          already_exists: alreadyExists
        },
        imported_numbers: importedNumbers
      }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });

    } else if (action === 'remove_invalid') {
      // Remove numbers that failed validation
      const { data: invalidNumbers } = await supabase
        .from('phone_numbers')
        .select('id, number')
        .eq('user_id', user.id)
        .eq('twilio_verified', false)
        .not('twilio_verified_at', 'is', null);

      if (!invalidNumbers || invalidNumbers.length === 0) {
        return new Response(JSON.stringify({
          success: true,
          removed: 0,
          message: 'No invalid numbers to remove'
        }), { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      const idsToRemove = invalidNumbers.map(n => n.id);
      const { error: deleteError } = await supabase
        .from('phone_numbers')
        .delete()
        .in('id', idsToRemove);

      if (deleteError) throw deleteError;

      return new Response(JSON.stringify({
        success: true,
        removed: invalidNumbers.length,
        removed_numbers: invalidNumbers.map(n => n.number)
      }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });

    } else {
      return new Response(JSON.stringify({ 
        error: 'Invalid action. Use: validate, sync, or remove_invalid' 
      }), { 
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

  } catch (error) {
    console.error('Error in validate-phone-numbers:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Internal server error' 
    }), { 
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});
