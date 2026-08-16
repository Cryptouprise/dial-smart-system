import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const ALLOWED_INTERESTS = new Set(['start_beta', 'talk', 'lead_recovery']);
const MAX_PER_IP_PER_DAY = 10;
const MAX_PER_EMAIL_PER_DAY = 4;

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function safeString(value: unknown, max: number) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

function normalizeEmail(value: unknown) {
  return safeString(value, 320).toLowerCase();
}

function normalizePhone(value: unknown) {
  const raw = safeString(value, 40);
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return `+${digits}`;
  return raw.slice(0, 40);
}

function looksLikeEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return response({ success: false, error: 'Method not allowed.' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      return response({ success: false, error: 'Beta intake is not configured.' }, 503);
    }

    const body = await req.json();
    const interest = safeString(body?.interest, 40) || 'start_beta';
    if (!ALLOWED_INTERESTS.has(interest)) {
      return response({ success: false, error: 'Invalid next-step selection.' }, 400);
    }

    const sessionId = safeString(body?.sessionId, 80) || null;
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('cf-connecting-ip')
      || 'unknown';
    const userAgent = safeString(req.headers.get('user-agent'), 500) || null;
    const startOfDay = `${new Date().toISOString().slice(0, 10)}T00:00:00Z`;

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    let session: any = null;
    if (sessionId) {
      const { data } = await supabase
        .from('demo_sessions')
        .select('id, website_url, scraped_data, prospect_phone, retell_call_id')
        .eq('id', sessionId)
        .maybeSingle();
      if (!data) {
        return response({ success: false, error: 'Demo session could not be verified. Please restart the demo.' }, 400);
      }
      session = data;
    }

    const email = normalizeEmail(body?.email);
    const phone = normalizePhone(body?.phone) || normalizePhone(session?.prospect_phone);
    if (!email && !phone) {
      return response({ success: false, error: 'Please provide an email address or phone number.' }, 400);
    }
    if (email && !looksLikeEmail(email)) {
      return response({ success: false, error: 'Please provide a valid email address.' }, 400);
    }

    const rateChecks = [
      supabase
        .from('law_firm_beta_leads')
        .select('id', { count: 'exact', head: true })
        .eq('ip_address', clientIp)
        .gte('created_at', startOfDay),
    ];

    if (email) {
      rateChecks.push(
        supabase
          .from('law_firm_beta_leads')
          .select('id', { count: 'exact', head: true })
          .eq('email', email)
          .gte('created_at', startOfDay),
      );
    }

    const rateResults = await Promise.all(rateChecks);
    const ipCount = rateResults[0]?.count || 0;
    const emailCount = email ? (rateResults[1]?.count || 0) : 0;

    if (ipCount >= MAX_PER_IP_PER_DAY || emailCount >= MAX_PER_EMAIL_PER_DAY) {
      return response({
        success: false,
        limitReached: true,
        error: 'We already received your beta request. We will use the contact information you provided.',
      }, 429);
    }

    const legalInboundConfig = body?.legalInboundConfig && typeof body.legalInboundConfig === 'object'
      ? body.legalInboundConfig
      : {};
    const scrapedData = session?.scraped_data && typeof session.scraped_data === 'object'
      ? session.scraped_data
      : {};

    const { data: lead, error } = await supabase
      .from('law_firm_beta_leads')
      .insert({
        demo_session_id: sessionId,
        website_url: safeString(body?.websiteUrl, 1000) || safeString(session?.website_url, 1000) || null,
        firm_name: safeString(body?.firmName, 300) || safeString(scrapedData?.business_name, 300) || null,
        contact_name: safeString(body?.contactName, 200) || null,
        email: email || null,
        phone: phone || null,
        interest,
        source: safeString(body?.source, 100) || 'law_firm_demo',
        legal_inbound_config: legalInboundConfig,
        retell_call_id: safeString(body?.retellCallId, 200) || safeString(session?.retell_call_id, 200) || null,
        ip_address: clientIp,
        user_agent: userAgent,
      })
      .select('id')
      .single();

    if (error || !lead) {
      console.error('law-firm-beta-submit: insert failed', error?.message);
      return response({ success: false, error: 'We could not save your request. Please try again.' }, 500);
    }

    console.log('law-firm-beta-submit: lead captured', { leadId: lead.id, interest });

    return response({
      success: true,
      leadId: lead.id,
      interest,
      message: interest === 'start_beta'
        ? 'Your Law Firm AI Intake Beta request is in.'
        : interest === 'lead_recovery'
          ? 'Your Lead Recovery request is in.'
          : 'Your request to talk through the setup is in.',
    });
  } catch (error) {
    console.error('law-firm-beta-submit: unexpected error', (error as Error).message);
    return response({ success: false, error: 'Unable to save your request right now.' }, 500);
  }
});
