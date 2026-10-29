/**
 * Ringba Enrich Proxy
 *
 * Retell's custom tools can't substitute LLM-provided parameters into URL query strings.
 * This proxy solves that: Retell POSTs LLM args here, we construct the full Ringba URL
 * with ALL values filled in, then forward to Ringba.
 *
 * Protects against LLM hallucination: for fields that should come from the lead record
 * (email, last_name, etc.), we look up the lead in the DB by phone and prefer DB values
 * over whatever the LLM provided.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RINGBA_BASE = 'https://display.ringba.com/enrich';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const urlParams: Record<string, string> = {};
    url.searchParams.forEach((v, k) => { urlParams[k] = v; });

    // Robust payload parsing — accept args at root, under wrapper keys, or as form-encoded
    const rawText = await req.text();
    console.log('[Ringba Proxy] method:', req.method, 'url:', req.url);
    console.log('[Ringba Proxy] content-type:', req.headers.get('content-type'));
    console.log('[Ringba Proxy] raw body (first 2000 chars):', rawText.slice(0, 2000));

    let body: Record<string, unknown> = {};
    if (rawText) {
      try {
        const parsed = JSON.parse(rawText);
        if (parsed && typeof parsed === 'object') {
          body = { ...parsed };
          for (const wrapper of ['args', 'arguments', 'parameters', 'data', 'payload', 'input']) {
            const inner = (parsed as any)[wrapper];
            if (inner && typeof inner === 'object') {
              body = { ...inner, ...body };
            }
          }
        }
      } catch (_) {
        try {
          const params = new URLSearchParams(rawText);
          params.forEach((v, k) => { body[k] = v; });
        } catch (_) {}
      }
    }

    console.log('[Ringba Proxy] URL params:', JSON.stringify(urlParams));
    console.log('[Ringba Proxy] merged body keys:', Object.keys(body));

    // Look in URL params first, then body - URL is more reliable (call-level dynamic vars)
    const g = (key: string, ...fallbacks: string[]): string => {
      for (const k of [key, ...fallbacks]) {
        const urlVal = urlParams[k];
        if (urlVal && String(urlVal).trim() !== '') return String(urlVal).trim();
        const v = (body as any)[k];
        if (v !== null && v !== undefined && String(v).trim() !== '') {
          return String(v).trim();
        }
      }
      return '';
    };

    const poolId = body.pool_id || body.poolId || '2927133494310078143';

    // Look up lead by phone to get authoritative lead data (protects against LLM hallucination)
    let leadData: any = null;
    try {
      const phone = g('phone', 'Phone', 'callerid');
      if (phone) {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, serviceKey);
        // Try various phone format normalizations
        const digits = phone.replace(/\D/g, '');
        const variants = [phone, `+${digits}`, `+1${digits.slice(-10)}`, digits];
        const { data } = await supabase
          .from('leads')
          .select('first_name,last_name,email,address,city,state,zip_code,phone_number,custom_fields')
          .in('phone_number', variants)
          .limit(1)
          .maybeSingle();
        if (data) leadData = data;
      }
    } catch (_) {
      // Lead lookup is best-effort
    }

    // Prefer lead DB data for identity fields (LLM may hallucinate these)
    // If lead was found in DB, use DB values ONLY (empty if missing) to prevent LLM hallucination
    // If lead NOT found, fall back to LLM-provided values
    const leadField = (dbField: string, llmKey: string, ...fallbacks: string[]): string => {
      if (leadData) {
        // Lead was found — trust the DB, even if field is empty
        const val = leadData[dbField];
        return val ? String(val).trim() : '';
      }
      // No lead found — accept LLM values as last resort
      return g(llmKey, ...fallbacks);
    };

    // Qualification fields: prefer LLM body args (most fresh), fall back to
    // custom_fields JSONB on the lead (in case Grace saved via update_lead_info
    // but didn't pass them again to enrich_ringba — common pattern).
    const cf = (leadData && leadData.custom_fields && typeof leadData.custom_fields === 'object')
      ? (leadData.custom_fields as Record<string, unknown>)
      : {};
    const qualField = (keys: string[]): string => {
      // 1) try LLM-provided body/URL value
      const fromBody = g(...keys);
      if (fromBody) return fromBody;
      // 2) fall back to custom_fields DB key (match first of the provided keys)
      for (const k of keys) {
        const v = cf[k];
        if (v !== null && v !== undefined && String(v).trim() !== '') return String(v).trim();
      }
      return '';
    };

    // Build query parameters — lead data + qualification answers
    const params: Record<string, string> = {
      callerid: g('callerid', 'phone', 'Phone'),
      Phone: g('phone', 'Phone', 'callerid'),
      FirstName: leadField('first_name', 'first_name', 'FirstName', 'firstName'),
      LastName: leadField('last_name', 'last_name', 'LastName', 'lastName'),
      Address: leadField('address', 'address', 'Address'),
      City: leadField('city', 'city', 'City'),
      State: leadField('state', 'state', 'State'),
      Zip: leadField('zip_code', 'zip', 'zip_code', 'Zip', 'zipCode'),
      Email: leadField('email', 'email', 'Email'),
      // Qualification answers (LLM body wins; else pull from custom_fields JSONB)
      Homeowner: qualField(['Homeowner', 'homeowner']),
      ElectricBill: qualField(['ElectricBill', 'electric_bill', 'electricBill']),
      RoofType: qualField(['RoofType', 'roof_type', 'roofType']),
      RoofCondition: qualField(['RoofCondition', 'roof_condition', 'roofCondition']),
      CreditScore: qualField(['CreditScore', 'credit_score', 'creditScore']),
      UtilityProvider: qualField(['UtilityProvider', 'utility_provider', 'utilityProvider']),
      Qualified: qualField(['Qualified', 'qualified']),
      Notes: qualField(['Notes', 'notes', 'summary']),
    };

    // Build URL with ALL fields filled in (skip empty ones)
    const queryString = Object.entries(params)
      .filter(([_, v]) => v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');

    const ringbaUrl = `${RINGBA_BASE}/${poolId}?${queryString}`;
    console.log('[Ringba Proxy] Forwarding to:', ringbaUrl);

    const ringbaRes = await fetch(ringbaUrl, { method: 'GET' });
    const ringbaText = await ringbaRes.text();
    console.log('[Ringba Proxy] Ringba responded:', ringbaRes.status, ringbaText.slice(0, 200));

    return new Response(
      JSON.stringify({
        success: ringbaRes.ok,
        status: ringbaRes.status,
        ringba_response: ringbaText,
        fields_sent: Object.keys(params).filter(k => params[k] !== ''),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('[Ringba Proxy] Error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
