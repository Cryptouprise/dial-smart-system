
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SpamCheckRequest {
  phoneNumberId?: string;
  checkAll?: boolean;
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

    const { phoneNumberId, checkAll }: SpamCheckRequest = await req.json();

    if (checkAll) {
      // Check all active numbers for spam indicators
      const { data: numbers, error: fetchError } = await supabase
        .from('phone_numbers')
        .select('*')
        .eq('status', 'active');

      if (fetchError) throw fetchError;

      const results = [];
      for (const number of numbers || []) {
        const spamResult = await checkSpamIndicators(number, supabase);
        results.push(spamResult);
      }

      return new Response(JSON.stringify({ 
        message: `Checked ${results.length} numbers`,
        quarantined: results.filter(r => r.quarantined).length,
        results 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } else if (phoneNumberId) {
      // Check specific number
      const { data: number, error: fetchError } = await supabase
        .from('phone_numbers')
        .select('*')
        .eq('id', phoneNumberId)
        .single();

      if (fetchError) throw fetchError;

      const result = await checkSpamIndicators(number, supabase);
      
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    throw new Error('Either phoneNumberId or checkAll must be provided');

  } catch (error) {
    console.error('Spam detection error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function checkSpamIndicators(number: any, supabase: any) {
  console.log(`Checking spam indicators for ${number.number}`);
  
  let spamScore = 0;
  const reasons = [];

  // 1. High daily call volume (above 45 calls)
  if (number.daily_calls > 45) {
    spamScore += 30;
    reasons.push(`High daily call volume: ${number.daily_calls} calls`);
  }

  // 2. Very high daily call volume (above 50 calls - immediate quarantine)
  if (number.daily_calls >= 50) {
    spamScore += 50;
    reasons.push(`Critical call volume: ${number.daily_calls} calls (max exceeded)`);
  }

  // 3. Already flagged as spam previously
  if (number.is_spam) {
    spamScore += 20;
    reasons.push('Previously flagged as spam');
  }

  // 4. Number hasn't been used recently but has high call count
  const lastUsed = number.last_used ? new Date(number.last_used) : null;
  const daysSinceUsed = lastUsed ? 
    Math.floor((Date.now() - lastUsed.getTime()) / (1000 * 60 * 60 * 24)) : 999;
  
  if (daysSinceUsed > 7 && number.daily_calls > 30) {
    spamScore += 25;
    reasons.push(`Inactive for ${daysSinceUsed} days with ${number.daily_calls} calls`);
  }

  // 5. Pattern detection - numbers from same area code with similar patterns
  const areaCodePattern = await checkAreaCodePattern(number.area_code, supabase);
  if (areaCodePattern.isSpammy) {
    spamScore += 15;
    reasons.push(areaCodePattern.reason);
  }

  // Determine if number should be quarantined (score >= 50)
  const shouldQuarantine = spamScore >= 50;

  if (shouldQuarantine && number.status === 'active') {
    // Quarantine the number
    const quarantineDate = new Date();
    quarantineDate.setDate(quarantineDate.getDate() + 30);
    
    const { error: updateError } = await supabase
      .from('phone_numbers')
      .update({
        status: 'quarantined',
        quarantine_until: quarantineDate.toISOString().split('T')[0],
        is_spam: true
      })
      .eq('id', number.id);

    if (updateError) {
      console.error('Error quarantining number:', updateError);
    } else {
      console.log(`Quarantined number ${number.number} (score: ${spamScore})`);
    }
  }

  return {
    numberId: number.id,
    number: number.number,
    spamScore,
    reasons,
    quarantined: shouldQuarantine,
    previousStatus: number.status
  };
}

async function checkAreaCodePattern(areaCode: string, supabase: any) {
  // Check if area code has multiple numbers with high spam scores
  const { data: areaNumbers, error } = await supabase
    .from('phone_numbers')
    .select('daily_calls, is_spam, status')
    .eq('area_code', areaCode);

  if (error || !areaNumbers) {
    return { isSpammy: false, reason: 'Unable to check area code pattern' };
  }

  const totalNumbers = areaNumbers.length;
  const spamNumbers = areaNumbers.filter(n => n.is_spam || n.daily_calls > 40).length;
  const spamRatio = totalNumbers > 0 ? spamNumbers / totalNumbers : 0;

  return {
    isSpammy: spamRatio > 0.6 && totalNumbers >= 3,
    reason: spamRatio > 0.6 ? 
      `Area code ${areaCode}: ${Math.round(spamRatio * 100)}% spam rate (${spamNumbers}/${totalNumbers})` : 
      `Area code ${areaCode}: Normal pattern (${Math.round(spamRatio * 100)}% spam rate)`
  };
}
