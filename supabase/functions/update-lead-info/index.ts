/**
 * Update Lead Info — AI tool for updating lead records mid-call
 *
 * When a lead corrects their info ("my last name is Michaelson") or provides
 * new info (email, company), the AI calls this tool to save it to the CRM.
 * Then enrich_ringba (or any subsequent tool) reads the updated lead record.
 *
 * Only allows updating identity fields — not status, not do_not_call, etc.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Identity fields go to proper columns
const ALLOWED_IDENTITY_FIELDS = [
  'first_name', 'last_name', 'email', 'company',
  'address', 'city', 'state', 'zip_code',
] as const;

// Qualification answers go into custom_fields JSONB
const ALLOWED_QUALIFICATION_FIELDS = [
  'Homeowner', 'ElectricBill', 'RoofType', 'RoofCondition',
  'CreditScore', 'UtilityProvider', 'Qualified', 'AppointmentInterest',
  'Notes', 'Timeline', 'CurrentlyShopping',
] as const;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const urlParams: Record<string, string> = {};
    url.searchParams.forEach((v, k) => { urlParams[k] = v; });

    // Robust payload parsing: Retell/other callers may send args in many shapes.
    // Read the raw text first, then try multiple parsing paths.
    const rawText = await req.text();
    console.log('[Update Lead] method:', req.method, 'url:', req.url);
    console.log('[Update Lead] content-type:', req.headers.get('content-type'));
    console.log('[Update Lead] raw body (first 2000 chars):', rawText.slice(0, 2000));

    let body: Record<string, unknown> = {};
    if (rawText) {
      try {
        const parsed = JSON.parse(rawText);
        // If args are nested under common wrapper keys, unwrap them.
        // Retell sometimes sends: {args: {...}} or {parameters: {...}} or {data: {...}}
        if (parsed && typeof parsed === 'object') {
          body = { ...parsed };
          for (const wrapper of ['args', 'arguments', 'parameters', 'data', 'payload', 'input']) {
            const inner = (parsed as any)[wrapper];
            if (inner && typeof inner === 'object') {
              body = { ...inner, ...body }; // body already-flat keys win; wrapper fills gaps
            }
          }
        }
      } catch (_) {
        // Maybe it's URL-encoded form data
        try {
          const params = new URLSearchParams(rawText);
          params.forEach((v, k) => { body[k] = v; });
        } catch (_) {}
      }
    }
    console.log('[Update Lead] merged body keys:', Object.keys(body));

    const pickStr = (k: string): string =>
      String(urlParams[k] || (body as any)[k] || '').trim();

    const phone = pickStr('phone');
    const leadId = pickStr('lead_id');

    if (!phone && !leadId) {
      return new Response(
        JSON.stringify({ success: false, error: 'phone or lead_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Find the lead (include custom_fields for merging)
    let leadQuery = supabase.from('leads').select('id, user_id, phone_number, custom_fields').limit(1);
    if (leadId) {
      leadQuery = leadQuery.eq('id', leadId);
    } else {
      const digits = phone.replace(/\D/g, '');
      const variants = [phone, `+${digits}`, `+1${digits.slice(-10)}`, digits];
      leadQuery = leadQuery.in('phone_number', variants);
    }
    const { data: lead, error: findErr } = await leadQuery.maybeSingle();

    if (findErr) throw findErr;
    if (!lead) {
      return new Response(
        JSON.stringify({ success: false, error: 'Lead not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Split updates into identity (proper columns) and qualification (custom_fields JSONB)
    const identityUpdates: Record<string, string> = {};
    const qualificationUpdates: Record<string, string> = {};

    const isRealValue = (v: unknown): boolean =>
      v !== null && v !== undefined && String(v).trim() !== '' && String(v).toLowerCase() !== 'unknown';

    for (const field of ALLOWED_IDENTITY_FIELDS) {
      const val = (body as any)[field];
      if (isRealValue(val)) identityUpdates[field] = String(val).trim();
    }

    for (const field of ALLOWED_QUALIFICATION_FIELDS) {
      const val = (body as any)[field];
      if (isRealValue(val)) qualificationUpdates[field] = String(val).trim();
    }

    if (Object.keys(identityUpdates).length === 0 && Object.keys(qualificationUpdates).length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No updates provided', lead_id: lead.id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update identity fields (proper columns) via normal update
    if (Object.keys(identityUpdates).length > 0) {
      const { error: idErr } = await supabase
        .from('leads')
        .update({ ...identityUpdates, updated_at: new Date().toISOString() })
        .eq('id', lead.id);
      if (idErr) throw idErr;
    }

    // Qualification fields → atomic JSONB merge at DB level (race-safe)
    // Uses PostgreSQL's `||` JSONB concat operator so concurrent writes
    // from parallel tool calls don't clobber each other's fields.
    if (Object.keys(qualificationUpdates).length > 0) {
      const { error: mergeErr } = await supabase.rpc('merge_custom_fields', {
        p_lead_id: lead.id,
        p_updates: qualificationUpdates,
      });
      if (mergeErr) {
        // Fallback: if RPC doesn't exist, do read-merge-write (racy but functional)
        console.warn('[Update Lead] merge_custom_fields RPC missing, falling back:', mergeErr.message);
        const existingCustom = (lead.custom_fields && typeof lead.custom_fields === 'object') ? lead.custom_fields : {};
        const { error: fbErr } = await supabase
          .from('leads')
          .update({ custom_fields: { ...existingCustom, ...qualificationUpdates }, updated_at: new Date().toISOString() })
          .eq('id', lead.id);
        if (fbErr) throw fbErr;
      }
    }

    console.log('[Update Lead] Updated', lead.id,
      'identity:', Object.keys(identityUpdates),
      'qualification:', Object.keys(qualificationUpdates));

    return new Response(
      JSON.stringify({
        success: true,
        lead_id: lead.id,
        identity_updated: Object.keys(identityUpdates),
        qualification_updated: Object.keys(qualificationUpdates),
        values: { ...identityUpdates, ...qualificationUpdates },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('[Update Lead] Error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
