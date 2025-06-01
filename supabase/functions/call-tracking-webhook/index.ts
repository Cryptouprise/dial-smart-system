
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CallTrackingData {
  phone_number: string;
  call_type: 'inbound' | 'outbound';
  duration?: number;
  status: 'completed' | 'busy' | 'failed' | 'no-answer';
  timestamp?: string;
  caller_id?: string;
  recipient?: string;
  call_sid?: string;
  cost?: number;
  spam_reported?: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const callData: CallTrackingData = await req.json();
    console.log('Received call tracking data:', callData);

    // Clean phone number format for consistent matching
    const cleanPhoneNumber = callData.phone_number.replace(/\D/g, '');
    
    // Find the phone number record with flexible matching
    const { data: phoneNumbers, error: phoneError } = await supabase
      .from('phone_numbers')
      .select('*')
      .or(`number.eq.${callData.phone_number},number.ilike.%${cleanPhoneNumber}%`);

    if (phoneError) {
      console.error('Database error:', phoneError);
      return new Response(JSON.stringify({ 
        error: 'Database error',
        details: phoneError.message 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!phoneNumbers || phoneNumbers.length === 0) {
      console.log('Phone number not found, creating new record:', callData.phone_number);
      
      // Extract area code from phone number
      const areaCodeMatch = cleanPhoneNumber.match(/^1?(\d{3})/);
      const areaCode = areaCodeMatch ? areaCodeMatch[1] : '000';
      
      // Create new phone number record
      const { data: newPhoneNumber, error: createError } = await supabase
        .from('phone_numbers')
        .insert({
          number: callData.phone_number,
          area_code: areaCode,
          daily_calls: 1,
          status: 'active',
          last_used: new Date().toISOString()
        })
        .select()
        .single();

      if (createError) {
        console.error('Error creating phone number:', createError);
        return new Response(JSON.stringify({ 
          error: 'Failed to create phone number record',
          details: createError.message 
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Log the call
      await supabase.from('call_logs').insert({
        phone_number_id: newPhoneNumber.id,
        phone_number: callData.phone_number,
        call_type: callData.call_type,
        duration: callData.duration || 0,
        status: callData.status,
        caller_id: callData.caller_id,
        recipient: callData.recipient,
        call_sid: callData.call_sid,
        cost: callData.cost,
        spam_reported: callData.spam_reported || false,
        timestamp: callData.timestamp || new Date().toISOString()
      });

      return new Response(JSON.stringify({
        success: true,
        phone_number: callData.phone_number,
        daily_calls: 1,
        spam_check_triggered: false,
        new_record_created: true,
        timestamp: new Date().toISOString()
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const phoneNumber = phoneNumbers[0];
    const newDailyCount = phoneNumber.daily_calls + 1;
    
    // Update phone number record
    const { error: updateError } = await supabase
      .from('phone_numbers')
      .update({
        daily_calls: newDailyCount,
        last_used: new Date().toISOString()
      })
      .eq('id', phoneNumber.id);

    if (updateError) {
      console.error('Error updating phone number:', updateError);
      return new Response(JSON.stringify({ 
        error: 'Failed to update phone number',
        details: updateError.message 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Log the call in call history
    const { error: logError } = await supabase
      .from('call_logs')
      .insert({
        phone_number_id: phoneNumber.id,
        phone_number: callData.phone_number,
        call_type: callData.call_type,
        duration: callData.duration || 0,
        status: callData.status,
        caller_id: callData.caller_id,
        recipient: callData.recipient,
        call_sid: callData.call_sid,
        cost: callData.cost,
        spam_reported: callData.spam_reported || false,
        timestamp: callData.timestamp || new Date().toISOString()
      });

    if (logError) console.error('Error logging call:', logError);

    // Trigger spam detection if call count is getting high
    if (newDailyCount >= 40) {
      console.log(`High call volume detected for ${callData.phone_number}: ${newDailyCount} calls`);
      
      // Trigger spam detection
      const { data: spamResult, error: spamError } = await supabase.functions.invoke('spam-detection', {
        body: { phoneNumberId: phoneNumber.id }
      });

      if (spamError) {
        console.error('Error running spam detection:', spamError);
      } else {
        console.log('Spam detection result:', spamResult);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      phone_number: callData.phone_number,
      daily_calls: newDailyCount,
      spam_check_triggered: newDailyCount >= 40,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Call tracking webhook error:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Unknown error occurred',
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
