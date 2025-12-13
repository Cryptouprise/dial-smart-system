
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SpamDetectionRequest {
  phoneNumber?: string;
  phoneNumberId?: string;
  checkAll?: boolean;
  includeCarrierCheck?: boolean;
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

    const { phoneNumber, phoneNumberId, checkAll, includeCarrierCheck }: SpamDetectionRequest = await req.json();

    if (checkAll) {
      return await checkAllNumbers(supabase);
    } else if (phoneNumber || phoneNumberId) {
      return await checkSingleNumber(supabase, phoneNumber, phoneNumberId, includeCarrierCheck);
    }

    throw new Error('Invalid request parameters');

  } catch (error: unknown) {
    console.error('Advanced spam detection error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function checkAllNumbers(supabase: any) {
  const { data: numbers, error } = await supabase
    .from('phone_numbers')
    .select('*')
    .eq('status', 'active');

  if (error) throw error;

  const results = [];
  for (const number of numbers || []) {
    const result = await performSpamAnalysis(number, supabase);
    results.push(result);
  }

  return new Response(JSON.stringify({
    message: `Analyzed ${results.length} numbers`,
    quarantined: results.filter(r => r.quarantined).length,
    results
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

async function checkSingleNumber(supabase: any, phoneNumber?: string, phoneNumberId?: string, includeCarrierCheck?: boolean) {
  let number;
  
  if (phoneNumberId) {
    const { data, error } = await supabase
      .from('phone_numbers')
      .select('*')
      .eq('id', phoneNumberId)
      .maybeSingle();
    if (error) throw error;
    number = data;
  } else if (phoneNumber) {
    const { data, error } = await supabase
      .from('phone_numbers')
      .select('*')
      .eq('number', phoneNumber)
      .maybeSingle();
    if (error) throw error;
    number = data;
  }

  if (!number) throw new Error('Phone number not found');

  const result = await performSpamAnalysis(number, supabase, includeCarrierCheck);
  
  return new Response(JSON.stringify(result), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

async function performSpamAnalysis(number: any, supabase: any, includeCarrierCheck = false) {
  console.log(`Performing comprehensive spam analysis for ${number.number}`);
  
  let spamScore = 0;
  const reasons = [];
  const analysis = {
    callVolume: false,
    timePattern: false,
    carrierReputation: false,
    userReports: false,
    behaviorPattern: false
  };

  // 1. Call Volume Analysis
  if (number.daily_calls >= 50) {
    spamScore += 50;
    reasons.push('Critical: Daily call limit exceeded');
    analysis.callVolume = true;
  } else if (number.daily_calls > 45) {
    spamScore += 30;
    reasons.push('High daily call volume');
    analysis.callVolume = true;
  }

  // 2. Time Pattern Analysis - check recent call patterns
  const { data: recentCalls } = await supabase
    .from('call_logs')
    .select('timestamp, duration, status')
    .eq('phone_number_id', number.id)
    .gte('timestamp', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order('timestamp', { ascending: false });

  if (recentCalls && recentCalls.length > 20) {
    const rapidCalls = analyzeCallTiming(recentCalls);
    if (rapidCalls.isRapidDialing) {
      spamScore += 25;
      reasons.push(`Rapid dialing detected: ${rapidCalls.averageInterval}s between calls`);
      analysis.timePattern = true;
    }
  }

  // 3. User Spam Reports
  const { data: spamReports } = await supabase
    .from('call_logs')
    .select('*')
    .eq('phone_number_id', number.id)
    .eq('spam_reported', true);

  if (spamReports && spamReports.length > 0) {
    spamScore += spamReports.length * 10;
    reasons.push(`${spamReports.length} spam reports received`);
    analysis.userReports = true;
  }

  // 4. Behavior Pattern Analysis
  const behaviorAnalysis = await analyzeBehaviorPattern(number, recentCalls);
  if (behaviorAnalysis.isSuspicious) {
    spamScore += behaviorAnalysis.score;
    reasons.push(behaviorAnalysis.reason);
    analysis.behaviorPattern = true;
  }

  // 5. Area Code Reputation Check
  const areaCodeAnalysis = await checkAreaCodeReputation(number.area_code, supabase);
  if (areaCodeAnalysis.isHighRisk) {
    spamScore += 15;
    reasons.push(areaCodeAnalysis.reason);
  }

  // 6. Carrier Reputation Check (if enabled)
  if (includeCarrierCheck) {
    const carrierCheck = await checkCarrierReputation(number.number);
    if (carrierCheck.isSpam) {
      spamScore += 30;
      reasons.push('Flagged by carrier spam database');
      analysis.carrierReputation = true;
    }
  }

  // Determine action based on score
  const shouldQuarantine = spamScore >= 50;
  const riskLevel = spamScore >= 75 ? 'critical' : spamScore >= 50 ? 'high' : spamScore >= 25 ? 'medium' : 'low';

  if (shouldQuarantine && number.status === 'active') {
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
    riskLevel,
    reasons,
    analysis,
    quarantined: shouldQuarantine,
    previousStatus: number.status,
    recommendation: getRecommendation(spamScore, riskLevel)
  };
}

function analyzeCallTiming(calls: any[]) {
  if (calls.length < 5) return { isRapidDialing: false };

  const intervals = [];
  for (let i = 1; i < calls.length; i++) {
    const current = new Date(calls[i-1].timestamp).getTime();
    const previous = new Date(calls[i].timestamp).getTime();
    intervals.push(Math.abs(current - previous) / 1000); // seconds
  }

  const averageInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const rapidCallThreshold = 30; // 30 seconds

  return {
    isRapidDialing: averageInterval < rapidCallThreshold,
    averageInterval: Math.round(averageInterval),
    totalCalls: calls.length
  };
}

async function analyzeBehaviorPattern(number: any, recentCalls: any[]) {
  if (!recentCalls || recentCalls.length < 10) {
    return { isSuspicious: false, score: 0, reason: 'Insufficient data' };
  }

  let suspiciousScore = 0;
  const reasons = [];

  // Check for high failure rate
  const failedCalls = recentCalls.filter(c => c.status === 'failed' || c.status === 'no-answer').length;
  const failureRate = failedCalls / recentCalls.length;
  
  if (failureRate > 0.7) {
    suspiciousScore += 20;
    reasons.push('High call failure rate');
  }

  // Check for very short call durations (potential robocalling)
  const shortCalls = recentCalls.filter(c => c.duration && c.duration < 10).length;
  const shortCallRate = shortCalls / recentCalls.length;
  
  if (shortCallRate > 0.8) {
    suspiciousScore += 25;
    reasons.push('Predominantly short duration calls');
  }

  // Check for inactive periods with sudden high activity
  const lastUsed = number.last_used ? new Date(number.last_used) : null;
  const daysSinceUsed = lastUsed ? 
    Math.floor((Date.now() - lastUsed.getTime()) / (1000 * 60 * 60 * 24)) : 999;
  
  if (daysSinceUsed > 7 && number.daily_calls > 30) {
    suspiciousScore += 20;
    reasons.push('Sudden activity after long inactivity');
  }

  return {
    isSuspicious: suspiciousScore > 20,
    score: suspiciousScore,
    reason: reasons.join(', ') || 'Normal behavior pattern'
  };
}

async function checkAreaCodeReputation(areaCode: string, supabase: any) {
  const { data: areaNumbers } = await supabase
    .from('phone_numbers')
    .select('daily_calls, is_spam, status')
    .eq('area_code', areaCode);

  if (!areaNumbers || areaNumbers.length < 3) {
    return { isHighRisk: false, reason: 'Insufficient area code data' };
  }

  const totalNumbers = areaNumbers.length;
  const spamNumbers = areaNumbers.filter((n: any) => n.is_spam || n.daily_calls > 40).length;
  const spamRatio = spamNumbers / totalNumbers;

  return {
    isHighRisk: spamRatio > 0.6,
    reason: spamRatio > 0.6 ? 
      `Area code ${areaCode}: ${Math.round(spamRatio * 100)}% spam rate` : 
      `Area code ${areaCode}: Normal reputation`
  };
}

async function checkCarrierReputation(phoneNumber: string) {
  // This would integrate with carrier spam databases
  // For now, we'll simulate based on number patterns
  const cleanNumber = phoneNumber.replace(/\D/g, '');
  
  // Simulate known spam patterns
  const spamPatterns = [
    /^1800/, // 800 numbers
    /^1888/, // 888 numbers
    /(\d)\1{3,}/, // Repeated digits
  ];

  const isSpam = spamPatterns.some(pattern => pattern.test(cleanNumber));
  
  return {
    isSpam,
    confidence: isSpam ? 0.8 : 0.1,
    source: 'carrier_simulation'
  };
}

function getRecommendation(score: number, riskLevel: string) {
  switch (riskLevel) {
    case 'critical':
      return 'Immediate quarantine recommended. High spam probability.';
    case 'high':
      return 'Quarantine recommended. Monitor closely.';
    case 'medium':
      return 'Increase monitoring. Consider usage restrictions.';
    case 'low':
      return 'Continue normal monitoring.';
    default:
      return 'No action required.';
  }
}
