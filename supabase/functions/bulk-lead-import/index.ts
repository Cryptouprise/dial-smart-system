/**
 * Bulk Lead Import Edge Function
 *
 * Production-grade bulk import that handles 100K+ leads without crashing.
 * Uses ON CONFLICT for server-side dedup — no client-side phone fetching.
 *
 * Accepts up to 5,000 leads per request.
 * Returns: { inserted, skipped, errors[] }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_BATCH_SIZE = 5000;

interface LeadInput {
  phone_number: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  company?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  timezone?: string;
  notes?: string;
  tags?: string[];
  custom_fields?: Record<string, any>;
}

interface ImportRequest {
  action: 'import';
  userId: string;
  campaign_id?: string;
  tags?: string[];
  lead_source?: string;
  leads: LeadInput[];
}

function normalizePhone(phone: string): string | null {
  if (!phone) return null;
  // Strip everything except digits
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  // Already has country code or international
  if (digits.length >= 11 && digits.length <= 15) return `+${digits}`;
  return null;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: ImportRequest = await req.json();

    if (body.action !== 'import') {
      return new Response(
        JSON.stringify({ error: 'Invalid action. Use "import".' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!body.userId) {
      return new Response(
        JSON.stringify({ error: 'userId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!body.leads || !Array.isArray(body.leads) || body.leads.length === 0) {
      return new Response(
        JSON.stringify({ error: 'leads array is required and must not be empty' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (body.leads.length > MAX_BATCH_SIZE) {
      return new Response(
        JSON.stringify({ error: `Maximum ${MAX_BATCH_SIZE} leads per request. Got ${body.leads.length}.` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = body.userId;
    const globalTags = body.tags || [];
    const leadSource = body.lead_source || null;
    const campaignId = body.campaign_id || null;
    const errors: string[] = [];
    let inserted = 0;
    let skipped = 0;

    // Build rows for insertion
    const rows: any[] = [];
    const seenPhones = new Set<string>(); // dedup within this batch

    for (let i = 0; i < body.leads.length; i++) {
      const lead = body.leads[i];
      if (!lead.phone_number) {
        errors.push(`Row ${i + 1}: missing phone_number`);
        continue;
      }

      const normalized = normalizePhone(lead.phone_number);
      if (!normalized) {
        errors.push(`Row ${i + 1}: invalid phone '${lead.phone_number}'`);
        continue;
      }

      // Skip duplicates within this batch
      if (seenPhones.has(normalized)) {
        skipped++;
        continue;
      }
      seenPhones.add(normalized);

      // Merge tags: global tags + per-lead tags
      const mergedTags = [
        ...globalTags,
        ...(lead.tags || [])
      ].filter(Boolean);

      rows.push({
        user_id: userId,
        phone_number: normalized,
        first_name: lead.first_name || null,
        last_name: lead.last_name || null,
        email: lead.email || null,
        company: lead.company || null,
        address: lead.address || null,
        city: lead.city || null,
        state: lead.state || null,
        zip_code: lead.zip_code || null,
        timezone: lead.timezone || 'America/New_York',
        notes: lead.notes || null,
        tags: mergedTags.length > 0 ? mergedTags : null,
        custom_fields: lead.custom_fields || {},
        lead_source: leadSource,
        status: 'new',
      });
    }

    if (rows.length === 0) {
      return new Response(
        JSON.stringify({ inserted: 0, skipped, errors }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use supabase upsert with ignoreDuplicates for ON CONFLICT DO NOTHING
    // Process in sub-batches of 500 for payload size safety
    const SUB_BATCH = 500;
    const insertedIds: string[] = [];

    for (let i = 0; i < rows.length; i += SUB_BATCH) {
      const batch = rows.slice(i, i + SUB_BATCH);

      try {
        const { data: upsertData, error: upsertError } = await supabase
          .from('leads')
          .upsert(batch, {
            onConflict: 'phone_number,user_id',
            ignoreDuplicates: true
          })
          .select('id');

        if (upsertError) {
          errors.push(`Batch ${Math.floor(i / SUB_BATCH) + 1}: ${upsertError.message}`);
          skipped += batch.length;
        } else {
          const batchInserted = upsertData?.length || 0;
          inserted += batchInserted;
          skipped += batch.length - batchInserted;
          if (upsertData) {
            insertedIds.push(...upsertData.map((r: any) => r.id));
          }
        }
      } catch (batchError: any) {
        errors.push(`Batch ${Math.floor(i / SUB_BATCH) + 1}: ${batchError.message}`);
        skipped += batch.length;
      }
    }

    // Link to campaign if specified
    if (campaignId && insertedIds.length > 0) {
      const campaignLinks = insertedIds.map(leadId => ({
        campaign_id: campaignId,
        lead_id: leadId
      }));

      // Insert in sub-batches
      for (let i = 0; i < campaignLinks.length; i += SUB_BATCH) {
        const linkBatch = campaignLinks.slice(i, i + SUB_BATCH);
        const { error: linkError } = await supabase
          .from('campaign_leads')
          .upsert(linkBatch, { onConflict: 'campaign_id,lead_id', ignoreDuplicates: true });

        if (linkError) {
          errors.push(`Campaign link batch: ${linkError.message}`);
        }
      }
    }

    return new Response(
      JSON.stringify({ inserted, skipped, errors }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    console.error('bulk-lead-import error:', err);
    return new Response(
      JSON.stringify({ error: err.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
