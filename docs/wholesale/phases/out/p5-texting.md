=== FILE: supabase/migrations/20261029040000_sms_per_organization.sql ===
-- P5: Texting becomes per-company.
--
-- Adds organization_id to the four SMS tables, backfills it where it can be
-- proven, replaces the per-user RLS policies with organization policies (keeping
-- a transitional auth.uid() = user_id OR for rows that are still NULL), and
-- installs a BEFORE INSERT trigger that refuses to create SMS rows without a
-- resolvable tenant.
--
-- Live facts used (docs/wholesale/audit/phase1/LIVE-SCHEMA.md):
--   sms_conversations: id, user_id, contact_phone, contact_name, last_from_number,
--                      last_message_at, unread_count, context_summary, metadata,
--                      created_at, updated_at   (NO lead_id)
--   sms_messages:      id, user_id, conversation_id, lead_id, direction,
--                      from_number, to_number, body, status, provider_type,
--                      provider_message_id, ... (NO organization_id)
--   sms_context_history: id, user_id, conversation_id, context_window, summary,
--                      token_count, created_at
--   ai_sms_settings:   id, user_id (UNIQUE), enabled, auto_response_enabled, ...
--   phone_numbers:     id, user_id, organization_id, number, ...
--   leads:             id, user_id, organization_id, phone_number, ...
--   organizations:     id, ..., settings jsonb default '{}'
--   organization_users: id, organization_id, user_id, role, joined_at
--
-- Per-company AI-reply switch: organizations.settings -> 'sms_ai_reply' (boolean).
-- Absent means true. No schema change is required for the switch; the key is
-- documented here and read by ai-sms-processor.

-- =========================================================================
-- 1. Columns + indexes
-- =========================================================================

ALTER TABLE public.sms_conversations
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);

ALTER TABLE public.sms_messages
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);

ALTER TABLE public.sms_context_history
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);

ALTER TABLE public.ai_sms_settings
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);

CREATE INDEX IF NOT EXISTS idx_sms_conversations_organization_id
  ON public.sms_conversations(organization_id)
  WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sms_messages_organization_id
  ON public.sms_messages(organization_id)
  WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sms_context_history_organization_id
  ON public.sms_context_history(organization_id)
  WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_sms_settings_organization_id
  ON public.ai_sms_settings(organization_id)
  WHERE organization_id IS NOT NULL;

-- =========================================================================
-- 2. Backfill
-- =========================================================================

-- sms_conversations has NO lead_id live, so the lead path is skipped.
-- Path A: from the phone number used as our side of the conversation.
-- The live column that stores our from-number on a conversation is
-- last_from_number (LIVE-SCHEMA.md line 13). Match it against
-- phone_numbers.number using the canonical normalizer from
-- 20260712040000_sms_delivery_safety.sql.
-- expect: rows whose last_from_number matches exactly one phone_numbers row
--         get that row's organization_id.
UPDATE public.sms_conversations c
SET organization_id = pn.organization_id
FROM public.phone_numbers pn
WHERE c.organization_id IS NULL
  AND c.last_from_number IS NOT NULL
  AND pn.organization_id IS NOT NULL
  AND public.normalize_contact_phone(pn.number) = public.normalize_contact_phone(c.last_from_number)
  AND (
    SELECT count(*) FROM public.phone_numbers pn2
    WHERE pn2.organization_id IS NOT NULL
      AND public.normalize_contact_phone(pn2.number) = public.normalize_contact_phone(c.last_from_number)
  ) = 1;

-- Path B: from the user's single membership.
-- expect: rows whose user_id has exactly one organization_users row get that
--         organization_id.
WITH one_membership AS (
  SELECT user_id, min(organization_id::text)::uuid AS organization_id
  FROM public.organization_users
  GROUP BY user_id
  HAVING count(DISTINCT organization_id) = 1
)
UPDATE public.sms_conversations c
SET organization_id = m.organization_id
FROM one_membership m
WHERE c.organization_id IS NULL
  AND c.user_id = m.user_id;

-- sms_messages: from its conversation.
-- expect: rows with a conversation_id whose conversation now has an
--         organization_id inherit it.
UPDATE public.sms_messages m
SET organization_id = c.organization_id
FROM public.sms_conversations c
WHERE m.organization_id IS NULL
  AND m.conversation_id IS NOT NULL
  AND c.id = m.conversation_id
  AND c.organization_id IS NOT NULL;

-- sms_messages: from the lead when the conversation path did not resolve.
-- expect: rows with a lead_id whose lead has an organization_id inherit it.
UPDATE public.sms_messages m
SET organization_id = l.organization_id
FROM public.leads l
WHERE m.organization_id IS NULL
  AND m.lead_id IS NOT NULL
  AND l.id = m.lead_id
  AND l.organization_id IS NOT NULL;

-- sms_messages: from the user's single membership.
-- expect: remaining rows whose user_id has exactly one membership get it.
WITH one_membership AS (
  SELECT user_id, min(organization_id::text)::uuid AS organization_id
  FROM public.organization_users
  GROUP BY user_id
  HAVING count(DISTINCT organization_id) = 1
)
UPDATE public.sms_messages m
SET organization_id = mm.organization_id
FROM one_membership mm
WHERE m.organization_id IS NULL
  AND m.user_id = mm.user_id;

-- sms_context_history: from its conversation first.
-- expect: rows with a conversation_id inherit the conversation's org.
UPDATE public.sms_context_history h
SET organization_id = c.organization_id
FROM public.sms_conversations c
WHERE h.organization_id IS NULL
  AND h.conversation_id IS NOT NULL
  AND c.id = h.conversation_id
  AND c.organization_id IS NOT NULL;

-- sms_context_history: from the user's single membership.
-- expect: remaining rows whose user_id has exactly one membership get it.
WITH one_membership AS (
  SELECT user_id, min(organization_id::text)::uuid AS organization_id
  FROM public.organization_users
  GROUP BY user_id
  HAVING count(DISTINCT organization_id) = 1
)
UPDATE public.sms_context_history h
SET organization_id = m.organization_id
FROM one_membership m
WHERE h.organization_id IS NULL
  AND h.user_id = m.user_id;

-- ai_sms_settings: from the user's single membership.
-- expect: rows whose user_id has exactly one membership get it.
WITH one_membership AS (
  SELECT user_id, min(organization_id::text)::uuid AS organization_id
  FROM public.organization_users
  GROUP BY user_id
  HAVING count(DISTINCT organization_id) = 1
)
UPDATE public.ai_sms_settings s
SET organization_id = m.organization_id
FROM one_membership m
WHERE s.organization_id IS NULL
  AND s.user_id = m.user_id;

-- =========================================================================
-- 3. RLS
-- =========================================================================
-- Existing policy names come from 20251201051159_81f3b9b8-a855-40ad-b8ac-25f295546a9c.sql
-- (lines 80-129). LIVE-SCHEMA.md line 30-33 shows the same names in the
-- pluralized form ("Users can view/create/update/delete their own ..."). Both
-- spellings are dropped defensively; DROP POLICY IF EXISTS is a no-op when the
-- name is absent.

-- sms_conversations
DROP POLICY IF EXISTS "Users can view their own conversations" ON public.sms_conversations;
DROP POLICY IF EXISTS "Users can create their own conversations" ON public.sms_conversations;
DROP POLICY IF EXISTS "Users can update their own conversations" ON public.sms_conversations;
DROP POLICY IF EXISTS "Users can delete their own conversations" ON public.sms_conversations;
DROP POLICY IF EXISTS "Users can view/create/update/delete their own conversations" ON public.sms_conversations;

-- sms_messages
DROP POLICY IF EXISTS "Users can view their own messages" ON public.sms_messages;
DROP POLICY IF EXISTS "Users can create their own messages" ON public.sms_messages;
DROP POLICY IF EXISTS "Users can update their own messages" ON public.sms_messages;
DROP POLICY IF EXISTS "Users can view/create/update their own messages" ON public.sms_messages;

-- sms_context_history
DROP POLICY IF EXISTS "Users can view their own context" ON public.sms_context_history;
DROP POLICY IF EXISTS "Users can create their own context" ON public.sms_context_history;
DROP POLICY IF EXISTS "Users can view/create their own context" ON public.sms_context_history;

-- ai_sms_settings
DROP POLICY IF EXISTS "Users can view their own settings" ON public.ai_sms_settings;
DROP POLICY IF EXISTS "Users can create their own settings" ON public.ai_sms_settings;
DROP POLICY IF EXISTS "Users can update their own settings" ON public.ai_sms_settings;
DROP POLICY IF EXISTS "Users can view/create/update their own settings" ON public.ai_sms_settings;

-- New organization policies. Transitional OR (organization_id IS NULL AND
-- user_id = auth.uid()) is on SELECT only; remove it once the NULL count
-- reported at the bottom of this file is 0.

-- sms_conversations
CREATE POLICY "Organization members can view SMS conversations"
  ON public.sms_conversations FOR SELECT TO authenticated
  USING (
    (organization_id IS NOT NULL AND public.user_in_organization(organization_id))
    OR (organization_id IS NULL AND user_id = auth.uid())
  );

CREATE POLICY "Organization members can insert SMS conversations"
  ON public.sms_conversations FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IS NOT NULL
    AND public.user_in_organization(organization_id)
  );

CREATE POLICY "Organization members can update SMS conversations"
  ON public.sms_conversations FOR UPDATE TO authenticated
  USING (organization_id IS NOT NULL AND public.user_in_organization(organization_id))
  WITH CHECK (organization_id IS NOT NULL AND public.user_in_organization(organization_id));

CREATE POLICY "Organization admins can delete SMS conversations"
  ON public.sms_conversations FOR DELETE TO authenticated
  USING (organization_id IS NOT NULL AND public.is_org_admin(organization_id));

-- sms_messages
CREATE POLICY "Organization members can view SMS messages"
  ON public.sms_messages FOR SELECT TO authenticated
  USING (
    (organization_id IS NOT NULL AND public.user_in_organization(organization_id))
    OR (organization_id IS NULL AND user_id = auth.uid())
  );

CREATE POLICY "Organization members can insert SMS messages"
  ON public.sms_messages FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IS NOT NULL
    AND public.user_in_organization(organization_id)
  );

CREATE POLICY "Organization members can update SMS messages"
  ON public.sms_messages FOR UPDATE TO authenticated
  USING (organization_id IS NOT NULL AND public.user_in_organization(organization_id))
  WITH CHECK (organization_id IS NOT NULL AND public.user_in_organization(organization_id));

CREATE POLICY "Organization admins can delete SMS messages"
  ON public.sms_messages FOR DELETE TO authenticated
  USING (organization_id IS NOT NULL AND public.is_org_admin(organization_id));

-- sms_context_history
CREATE POLICY "Organization members can view SMS context"
  ON public.sms_context_history FOR SELECT TO authenticated
  USING (
    (organization_id IS NOT NULL AND public.user_in_organization(organization_id))
    OR (organization_id IS NULL AND user_id = auth.uid())
  );

CREATE POLICY "Organization members can insert SMS context"
  ON public.sms_context_history FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IS NOT NULL
    AND public.user_in_organization(organization_id)
  );

CREATE POLICY "Organization members can update SMS context"
  ON public.sms_context_history FOR UPDATE TO authenticated
  USING (organization_id IS NOT NULL AND public.user_in_organization(organization_id))
  WITH CHECK (organization_id IS NOT NULL AND public.user_in_organization(organization_id));

CREATE POLICY "Organization admins can delete SMS context"
  ON public.sms_context_history FOR DELETE TO authenticated
  USING (organization_id IS NOT NULL AND public.is_org_admin(organization_id));

-- ai_sms_settings
CREATE POLICY "Organization members can view AI SMS settings"
  ON public.ai_sms_settings FOR SELECT TO authenticated
  USING (
    (organization_id IS NOT NULL AND public.user_in_organization(organization_id))
    OR (organization_id IS NULL AND user_id = auth.uid())
  );

CREATE POLICY "Organization members can insert AI SMS settings"
  ON public.ai_sms_settings FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IS NOT NULL
    AND public.user_in_organization(organization_id)
  );

CREATE POLICY "Organization members can update AI SMS settings"
  ON public.ai_sms_settings FOR UPDATE TO authenticated
  USING (organization_id IS NOT NULL AND public.user_in_organization(organization_id))
  WITH CHECK (organization_id IS NOT NULL AND public.user_in_organization(organization_id));

CREATE POLICY "Organization admins can delete AI SMS settings"
  ON public.ai_sms_settings FOR DELETE TO authenticated
  USING (organization_id IS NOT NULL AND public.is_org_admin(organization_id));

-- =========================================================================
-- 4. BEFORE INSERT trigger: refuse SMS rows without a resolvable tenant
-- =========================================================================
-- Skips when current_user = 'postgres' so the backfill above (and any
-- service_role inserts that already carry organization_id) are unaffected.
-- service_role inserts that omit organization_id are still rejected unless
-- the row can be derived from lead_id or the from-number.

CREATE OR REPLACE FUNCTION public.sms_rows_require_org()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org uuid;
BEGIN
  IF NEW.organization_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF current_user = 'postgres' THEN
    RETURN NEW;
  END IF;

  -- sms_messages: derive from lead_id when present.
  IF TG_TABLE_NAME = 'sms_messages' AND NEW.lead_id IS NOT NULL THEN
    SELECT organization_id INTO v_org
    FROM public.leads
    WHERE id = NEW.lead_id;
    IF v_org IS NOT NULL THEN
      NEW.organization_id := v_org;
      RETURN NEW;
    END IF;
  END IF;

  -- sms_messages: derive from the from-number (our side).
  IF TG_TABLE_NAME = 'sms_messages' AND NEW.from_number IS NOT NULL THEN
    SELECT pn.organization_id INTO v_org
    FROM public.phone_numbers pn
    WHERE pn.organization_id IS NOT NULL
      AND public.normalize_contact_phone(pn.number) = public.normalize_contact_phone(NEW.from_number)
    LIMIT 1;
    IF v_org IS NOT NULL THEN
      NEW.organization_id := v_org;
      RETURN NEW;
    END IF;
  END IF;

  -- sms_conversations: derive from last_from_number (our side).
  IF TG_TABLE_NAME = 'sms_conversations' AND NEW.last_from_number IS NOT NULL THEN
    SELECT pn.organization_id INTO v_org
    FROM public.phone_numbers pn
    WHERE pn.organization_id IS NOT NULL
      AND public.normalize_contact_phone(pn.number) = public.normalize_contact_phone(NEW.last_from_number)
    LIMIT 1;
    IF v_org IS NOT NULL THEN
      NEW.organization_id := v_org;
      RETURN NEW;
    END IF;
  END IF;

  RAISE EXCEPTION 'organization_id required' USING ERRCODE = '23502';
END;
$$;

DROP TRIGGER IF EXISTS sms_rows_require_org ON public.sms_conversations;
CREATE TRIGGER sms_rows_require_org
  BEFORE INSERT ON public.sms_conversations
  FOR EACH ROW EXECUTE FUNCTION public.sms_rows_require_org();

DROP TRIGGER IF EXISTS sms_rows_require_org ON public.sms_messages;
CREATE TRIGGER sms_rows_require_org
  BEFORE INSERT ON public.sms_messages
  FOR EACH ROW EXECUTE FUNCTION public.sms_rows_require_org();

-- =========================================================================
-- 5. NULL report
-- =========================================================================
-- expect: four rows, one per table, with the count of rows still missing
--         organization_id. These are the rows the transitional SELECT OR
--         covers; once all four counts are 0 the OR can be dropped.
SELECT 'sms_conversations' AS table_name, count(*) AS null_org_rows
FROM public.sms_conversations WHERE organization_id IS NULL
UNION ALL
SELECT 'sms_messages', count(*) FROM public.sms_messages WHERE organization_id IS NULL
UNION ALL
SELECT 'sms_context_history', count(*) FROM public.sms_context_history WHERE organization_id IS NULL
UNION ALL
SELECT 'ai_sms_settings', count(*) FROM public.ai_sms_settings WHERE organization_id IS NULL;
=== FILE: supabase/functions/twilio-sms-webhook/index.ts ===
/**
 * Twilio SMS Webhook
 *
 * Receives inbound SMS messages from Twilio and stores them in the database.
 * Configure this URL in your Twilio Console under Phone Numbers > Messaging webhook.
 *
 * Webhook URL: https://emonjusymdripmkvtttc.supabase.co/functions/v1/twilio-sms-webhook
 *
 * P5: tenant resolution is now strictly by phone_numbers.number -> organization_id.
 * The legacy "most recent user" fallback (material lines 468-483) and the
 * "existing conversation by contact phone" fallback (material lines 452-466)
 * are removed. If the To number is not a phone_numbers row, nothing is written.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { assertAcceptedSmsEnvelope } from '../sms-messaging/sms-boundary.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============= SMS DISPOSITION CATEGORIES =============

// OPT-OUT / DNC (highest priority - immediate removal)
const OPT_OUT_KEYWORDS = [
  'stop', 'unsubscribe', 'remove me', 'take me off',
  'do not contact', 'stop texting', 'stop messaging',
  'stop calling', 'leave me alone', 'remove my number',
  'quit texting', 'opt out', 'dnc', 'cancel'
];

// DISQUALIFICATION patterns (industry-specific)
const DISQUALIFICATION_PATTERNS: Record<string, string[]> = {
  'already_has_solar': [
    'i already have solar', 'already got solar', 'have solar panels',
    'already have panels', 'we have solar', 'got solar last year',
    'just got solar', 'already installed', 'already have it',
    'already got it', 'solar already', 'panels already'
  ],
  'renter': [
    "i'm a renter", 'im a renter', 'i rent', "don't own",
    'not a homeowner', 'i lease', 'renting', 'tenant',
    'apartment', 'not my house', "landlord's decision",
    'dont own', 'not the owner', 'not the homeowner'
  ],
  'wrong_number': [
    'wrong number', 'wrong person', 'you have the wrong',
    "that's not me", 'never called', 'who is this',
    'dont know you', "don't know you", 'never signed up'
  ],
  'deceased': [
    'passed away', 'no longer with us', 'deceased', 'died'
  ],
  'business_closed': [
    'out of business', 'closed down', 'no longer in business',
    'company closed', 'business closed'
  ]
};

// NOT INTERESTED (explicit rejection)
const NOT_INTERESTED_KEYWORDS = [
  'not interested', 'no thanks', 'no thank you',
  'pass', "i'm good", 'im good', "don't need",
  'not right now', 'maybe later', 'not for me',
  'no way', 'absolutely not', 'hard pass', 'no',
  'nope', 'never', 'go away', 'dont want', "don't want"
];

// POSITIVE SIGNALS (engagement & interest)
const POSITIVE_PATTERNS: Record<string, string[]> = {
  'appointment_booked': [
    'booked', 'scheduled', 'see you then', 'appointment set',
    'looking forward', 'confirmed', 'on the calendar',
    'appointment confirmed', 'i booked', "i've booked"
  ],
  'interested': [
    "i'm interested", 'im interested', 'tell me more',
    'sounds good', 'sounds great', "let's do it",
    'sign me up', 'yes please', 'absolutely', 'definitely',
    'count me in', "i'd like to", 'more info', 'more information'
  ],
  'hot_lead': [
    'asap', 'immediately', 'right away', 'urgent',
    'today if possible', 'call me now', 'ready to go',
    'where do i sign', 'take my money', 'ready to start'
  ],
  'callback_requested': [
    'call me back', 'call me later', 'busy right now',
    'call tomorrow', 'call next week', 'not a good time',
    'in a meeting', 'call after', 'give me a call',
    'call me at', 'try me later'
  ]
};

// SMS Disposition Result interface
interface SmsDispositionResult {
  disposition: string | null;
  category: 'opt_out' | 'disqualified' | 'not_interested' | 'positive' | null;
  subcategory: string | null;
  confidence: number;
  reason: string | null;
  shouldStopAutoReply: boolean;
  shouldRemoveFromWorkflows: boolean;
  shouldAddToDnc: boolean;
  suggestedStatus: string | null;
}

// Analyze SMS for disposition
function analyzeSmsForDisposition(messageBody: string): SmsDispositionResult {
  const lowerBody = messageBody.toLowerCase().trim();

  // Check OPT-OUT first (highest priority)
  for (const keyword of OPT_OUT_KEYWORDS) {
    if (lowerBody.includes(keyword) || lowerBody === keyword) {
      return {
        disposition: 'Do Not Call',
        category: 'opt_out',
        subcategory: 'opt_out',
        confidence: 0.95,
        reason: `Opt-out keyword detected: "${keyword}"`,
        shouldStopAutoReply: true,
        shouldRemoveFromWorkflows: true,
        shouldAddToDnc: true,
        suggestedStatus: 'dnc'
      };
    }
  }

  // Check DISQUALIFICATIONS
  for (const [disqType, patterns] of Object.entries(DISQUALIFICATION_PATTERNS)) {
    for (const pattern of patterns) {
      if (lowerBody.includes(pattern)) {
        const dispositionMap: Record<string, string> = {
          'already_has_solar': 'Already Has Solar',
          'renter': 'Renter',
          'wrong_number': 'Wrong Number',
          'deceased': 'Deceased',
          'business_closed': 'Business Closed'
        };
        return {
          disposition: dispositionMap[disqType] || 'Disqualified',
          category: 'disqualified',
          subcategory: disqType,
          confidence: 0.9,
          reason: `Disqualification detected: ${disqType} - "${pattern}"`,
          shouldStopAutoReply: false,
          shouldRemoveFromWorkflows: true,
          shouldAddToDnc: disqType === 'wrong_number' || disqType === 'deceased',
          suggestedStatus: 'closed_lost'
        };
      }
    }
  }

  // Check NOT INTERESTED
  for (const keyword of NOT_INTERESTED_KEYWORDS) {
    if (lowerBody.includes(keyword) || lowerBody === keyword) {
      return {
        disposition: 'Not Interested',
        category: 'not_interested',
        subcategory: 'not_interested',
        confidence: 0.85,
        reason: `Not interested keyword: "${keyword}"`,
        shouldStopAutoReply: false,
        shouldRemoveFromWorkflows: true,
        shouldAddToDnc: false,
        suggestedStatus: 'closed_lost'
      };
    }
  }

  // Check POSITIVE signals
  for (const [positiveType, patterns] of Object.entries(POSITIVE_PATTERNS)) {
    for (const pattern of patterns) {
      if (lowerBody.includes(pattern)) {
        const dispositionMap: Record<string, string> = {
          'appointment_booked': 'Appointment Set',
          'interested': 'Interested',
          'hot_lead': 'Hot Lead',
          'callback_requested': 'Callback Requested'
        };
        const statusMap: Record<string, string> = {
          'appointment_booked': 'appointment_scheduled',
          'interested': 'qualified',
          'hot_lead': 'qualified',
          'callback_requested': 'callback_requested'
        };
        return {
          disposition: dispositionMap[positiveType] || 'Interested',
          category: 'positive',
          subcategory: positiveType,
          confidence: 0.8,
          reason: `Positive signal: ${positiveType} - "${pattern}"`,
          shouldStopAutoReply: false,
          shouldRemoveFromWorkflows: positiveType === 'appointment_booked', // Remove when appointment is set
          shouldAddToDnc: false,
          suggestedStatus: statusMap[positiveType] || 'qualified'
        };
      }
    }
  }

  // No disposition detected
  return {
    disposition: null,
    category: null,
    subcategory: null,
    confidence: 0,
    reason: null,
    shouldStopAutoReply: false,
    shouldRemoveFromWorkflows: false,
    shouldAddToDnc: false,
    suggestedStatus: null
  };
}

// Input validation schema for Twilio webhook data
interface TwilioWebhookData {
  MessageSid?: string;
  From?: string;
  To?: string;
  Body?: string;
  NumMedia?: string;
  MediaUrl0?: string;
  MediaContentType0?: string;
  AccountSid?: string;
  ApiVersion?: string;
  FromCity?: string;
  FromState?: string;
  FromZip?: string;
  FromCountry?: string;
  ToCity?: string;
  ToState?: string;
  ToZip?: string;
  ToCountry?: string;
}

// Validation function for Twilio webhook payload
function validateTwilioPayload(data: Record<string, string>): { valid: boolean; error?: string; data?: TwilioWebhookData } {
  // Basic structure validation
  if (typeof data !== 'object' || data === null) {
    return { valid: false, error: 'Invalid payload: expected object' };
  }

  // Validate phone number formats if present
  const phoneRegex = /^\+?[1-9]\d{1,14}$/;

  if (data.From && !phoneRegex.test(data.From.replace(/\s/g, ''))) {
    return { valid: false, error: 'Invalid From phone number format' };
  }

  if (data.To && !phoneRegex.test(data.To.replace(/\s/g, ''))) {
    return { valid: false, error: 'Invalid To phone number format' };
  }

  // Validate MessageSid format if present (Twilio SIDs start with SM or MM)
  if (data.MessageSid && !/^(SM|MM)[a-f0-9]{32}$/i.test(data.MessageSid)) {
    console.warn('[Twilio SMS Webhook] Unusual MessageSid format:', data.MessageSid);
    // Don't reject - Twilio might change formats
  }

  // Validate NumMedia is a valid number if present
  if (data.NumMedia && isNaN(parseInt(data.NumMedia))) {
    return { valid: false, error: 'Invalid NumMedia value' };
  }

  // Sanitize body length (prevent extremely large payloads)
  if (data.Body && data.Body.length > 10000) {
    return { valid: false, error: 'Message body too large' };
  }

  // Validate MediaUrl if present
  if (data.MediaUrl0) {
    try {
      const url = new URL(data.MediaUrl0);
      // Twilio media URLs should come from Twilio's domain
      if (!url.hostname.includes('twilio.com') && !url.hostname.includes('cloudfront.net')) {
        console.warn('[Twilio SMS Webhook] Non-Twilio media URL:', url.hostname);
      }
    } catch (error) {
      console.error('Invalid MediaUrl0 format:', error);
      return { valid: false, error: 'Invalid MediaUrl0 format' };
    }
  }

  return {
    valid: true,
    data: {
      MessageSid: data.MessageSid,
      From: data.From,
      To: data.To,
      Body: data.Body,
      NumMedia: data.NumMedia,
      MediaUrl0: data.MediaUrl0,
      MediaContentType0: data.MediaContentType0,
      AccountSid: data.AccountSid,
      ApiVersion: data.ApiVersion,
      FromCity: data.FromCity,
      FromState: data.FromState,
      FromZip: data.FromZip,
      FromCountry: data.FromCountry,
      ToCity: data.ToCity,
      ToState: data.ToState,
      ToZip: data.ToZip,
      ToCountry: data.ToCountry,
    }
  };
}

// Canonical phone normalizer. Mirrors public.normalize_contact_phone(text) from
// 20260712040000_sms_delivery_safety.sql so the webhook matches phone_numbers
// rows the same way the DB does.
function canonicalPhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/[^0-9]/g, '');
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  if (digits.length >= 8 && digits.length <= 15) return '+' + digits;
  return null;
}

// Twilio request signature validation (HMAC-SHA1 over the full URL + sorted
// POST params, base64). VERIFY: TWILIO_AUTH_TOKEN must be set in the function
// environment; if it is missing we fail closed (503) rather than accept an
// unsigned callback.
async function validateTwilioSignature(
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>,
): Promise<boolean> {
  const sortedKeys = Object.keys(params).sort();
  let data = url;
  for (const key of sortedKeys) data += key + params[key];
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(authToken),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  // Constant-time-ish compare
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[Twilio SMS Webhook] Received webhook request');

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Supabase configuration missing');
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Parse the webhook data - Twilio sends form-urlencoded data
    const contentType = req.headers.get('content-type') || '';
    let rawData: Record<string, string> = {};

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await req.formData();
      formData.forEach((value, key) => {
        rawData[key] = value.toString();
      });
    } else if (contentType.includes('application/json')) {
      rawData = await req.json();
    } else {
      // Try to parse as text and decode
      const text = await req.text();
      const params = new URLSearchParams(text);
      params.forEach((value, key) => {
        rawData[key] = value;
      });
    }

    // Signature validation. Fail closed if the token is not configured.
    if (!twilioAuthToken) {
      console.error('[Twilio SMS Webhook] TWILIO_AUTH_TOKEN not configured; refusing unsigned webhook');
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'text/xml' } },
      );
    }
    const signature = req.headers.get('X-Twilio-Signature') || '';
    const signatureValid = await validateTwilioSignature(twilioAuthToken, signature, req.url, rawData);
    if (!signatureValid) {
      console.error('[Twilio SMS Webhook] Invalid X-Twilio-Signature');
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'text/xml' } },
      );
    }

    // Validate the webhook payload
    const validation = validateTwilioPayload(rawData);
    if (!validation.valid) {
      console.error('[Twilio SMS Webhook] Validation failed:', validation.error);
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        { headers: { ...corsHeaders, 'Content-Type': 'text/xml' } }
      );
    }

    const webhookData = validation.data!;
    console.log('[Twilio SMS Webhook] Validated webhook data:', JSON.stringify({
      MessageSid: webhookData.MessageSid,
      From: webhookData.From,
      To: webhookData.To,
      BodyLength: webhookData.Body?.length || 0,
      NumMedia: webhookData.NumMedia,
    }));

    // Extract SMS data from Twilio webhook
    const {
      MessageSid,
      From,
      To,
      Body,
      NumMedia,
      MediaUrl0,
      MediaContentType0,
    } = webhookData;

    // Allow messages with media but no body (MMS images)
    const hasMedia = NumMedia && parseInt(NumMedia) > 0;
    if (!From || !To || (!Body && !hasMedia)) {
      console.log('[Twilio SMS Webhook] Missing required fields');
      // Return TwiML response even for incomplete data
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        {
          headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
        }
      );
    }

    // Use a placeholder for empty body with media
    const messageBody = Body || (hasMedia ? '[Image]' : '');

    console.log(`[Twilio SMS Webhook] Inbound SMS from ${From} to ${To}: ${messageBody.substring(0, 50)}${hasMedia ? ' [with media]' : ''}`);

    // ============= TENANT RESOLUTION =============
    // The ONLY source of tenant identity is phone_numbers. If the To number is
    // not a phone_numbers row with an organization_id, we do not guess a tenant
    // and we write nothing. (Removed: material lines 435-450 "previous outbound
    // message" fallback, 452-466 "existing conversation by contact phone"
    // fallback, 468-483 "most recent active user" fallback.)
    const normalizedTo = canonicalPhone(To);
    if (!normalizedTo) {
      console.error('[Twilio SMS Webhook] Could not normalize To number:', To);
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        { headers: { ...corsHeaders, 'Content-Type': 'text/xml' } }
      );
    }

    const { data: phoneRows, error: phoneLookupError } = await supabaseAdmin
      .from('phone_numbers')
      .select('id, user_id, organization_id, number')
      .eq('status', 'active');

    if (phoneLookupError) {
      console.error('[Twilio SMS Webhook] phone_numbers lookup failed:', phoneLookupError);
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        { headers: { ...corsHeaders, 'Content-Type': 'text/xml' } }
      );
    }

    const matchingPhones = (phoneRows || []).filter((row: any) =>
      canonicalPhone(row.number) === normalizedTo && row.organization_id
    );

    if (matchingPhones.length === 0) {
      console.warn('[Twilio SMS Webhook] No phone_numbers row with organization_id for To:', To, '- message will not be stored');
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        { headers: { ...corsHeaders, 'Content-Type': 'text/xml' } }
      );
    }
    if (matchingPhones.length > 1) {
      // Ambiguous tenant: refuse rather than guess.
      console.error('[Twilio SMS Webhook] Multiple phone_numbers rows match To:', To, '- refusing to guess tenant');
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        { headers: { ...corsHeaders, 'Content-Type': 'text/xml' } }
      );
    }

    const phoneRow = matchingPhones[0];
    const userId: string = phoneRow.user_id;
    const organizationId: string = phoneRow.organization_id;

    console.log('[Twilio SMS Webhook] Resolved tenant:', { userId, organizationId });

    // Find or create conversation (scoped to organization_id + contact_phone)
    let conversationId: string | null = null;

    const { data: existingConv } = await supabaseAdmin
      .from('sms_conversations')
      .select('id, unread_count')
      .eq('organization_id', organizationId)
      .eq('contact_phone', From)
      .maybeSingle();

    if (existingConv) {
      conversationId = existingConv.id;
      console.log('[Twilio SMS Webhook] Found existing conversation:', conversationId);

      // Update conversation
      await supabaseAdmin
        .from('sms_conversations')
        .update({
          last_message_at: new Date().toISOString(),
          last_from_number: To,
          unread_count: existingConv.unread_count ? existingConv.unread_count + 1 : 1,
        })
        .eq('id', conversationId)
        .eq('organization_id', organizationId);
    } else {
      // Create new conversation
      const { data: newConv, error: convError } = await supabaseAdmin
        .from('sms_conversations')
        .insert({
          user_id: userId,
          organization_id: organizationId,
          contact_phone: From,
          last_from_number: To,
          last_message_at: new Date().toISOString(),
          unread_count: 1,
        })
        .select('id')
        .maybeSingle();

      if (newConv) {
        conversationId = newConv.id;
        console.log('[Twilio SMS Webhook] Created new conversation:', conversationId);
      } else {
        console.error('[Twilio SMS Webhook] Failed to create conversation:', convError);
      }
    }

    // Check for duplicate webhook (Twilio retries)
    if (MessageSid) {
      const { data: existingMessage } = await supabaseAdmin
        .from('sms_messages')
        .select('id')
        .eq('provider_message_id', MessageSid)
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (existingMessage) {
        console.log('[Twilio SMS Webhook] Duplicate webhook detected, skipping:', MessageSid);
        return new Response(
          '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
          { headers: { ...corsHeaders, 'Content-Type': 'text/xml' } }
        );
      }
    }

    // Store the inbound message
    const { data: message, error: msgError } = await supabaseAdmin
      .from('sms_messages')
      .insert({
        user_id: userId,
        organization_id: organizationId,
        conversation_id: conversationId,
        to_number: To,
        from_number: From,
        body: messageBody,
        direction: 'inbound',
        status: 'received',
        provider_type: 'twilio',
        provider_message_id: MessageSid,
        has_image: hasMedia,
        image_url: hasMedia ? MediaUrl0 : null,
        metadata: {
          media_content_type: MediaContentType0,
          num_media: NumMedia,
        },
      })
      .select()
      .maybeSingle();

    if (msgError) {
      console.error('[Twilio SMS Webhook] Failed to store message:', msgError);
    } else {
      console.log('[Twilio SMS Webhook] Message stored successfully:', message.id);
    }

    // ============= SMS DISPOSITION DETECTION =============
    // Analyze the incoming message for disposition signals BEFORE any other processing
    const smsDisposition = analyzeSmsForDisposition(messageBody);

    // Check AI SMS settings for auto-response (scoped to organization_id)
    const { data: globalSettings } = await supabaseAdmin
      .from('ai_sms_settings')
      .select('*')
      .eq('organization_id', organizationId)
      .maybeSingle();

    // Check for workflow-specific auto-reply settings
    // 1. Find lead by phone number
    // 2. Check if lead is in an active workflow with auto_reply_settings enabled
    let workflowAutoReply: {
      enabled: boolean;
      ai_instructions?: string;
      knowledge_base?: string;
      response_delay_seconds?: number;
      stop_on_human_reply?: boolean;
      calendar_enabled?: boolean;
      booking_link?: string;
    } | null = null;
    let workflowName: string | null = null;

    const { data: lead } = await supabaseAdmin
      .from('leads')
      .select('id, notes, status, name')
      .eq('organization_id', organizationId)
      .eq('phone_number', From)
      .maybeSingle();

    // ============= PROCESS SMS DISPOSITION =============
    if (smsDisposition.disposition && lead?.id) {
      console.log('[Twilio SMS Webhook] SMS Disposition detected:', JSON.stringify(smsDisposition));

      // 1. Call disposition-router to handle workflow removal & metrics
      try {
        const dispositionResponse = await fetch(`${supabaseUrl}/functions/v1/disposition-router`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            action: 'process_disposition',
            leadId: lead.id,
            userId: userId,
            organizationId: organizationId,
            dispositionName: smsDisposition.disposition,
            setBy: 'ai_sms',
            transcript: messageBody,
            metadata: {
              source: 'sms',
              message_id: message?.id,
              confidence: smsDisposition.confidence,
              category: smsDisposition.category,
              subcategory: smsDisposition.subcategory
            }
          }),
        });

        if (dispositionResponse.ok) {
          console.log('[Twilio SMS Webhook] Disposition processed via router successfully');
        } else {
          console.error('[Twilio SMS Webhook] Disposition router error:', await dispositionResponse.text());
        }
      } catch (dispError) {
        console.error('[Twilio SMS Webhook] Disposition routing error:', dispError);
      }

      // 2. Update lead status & add notes to contact card
      const existingNotes = lead.notes || '';
      const timestamp = new Date().toISOString();
      const truncatedMessage = messageBody.length > 100 ? messageBody.substring(0, 100) + '...' : messageBody;
      const newNote = `[${timestamp}] SMS Disposition: ${smsDisposition.disposition} (${smsDisposition.category}) - "${truncatedMessage}"`;

      const updateData: Record<string, any> = {
        notes: existingNotes ? `${existingNotes}\n${newNote}` : newNote,
        updated_at: new Date().toISOString()
      };

      // Update status based on disposition
      if (smsDisposition.suggestedStatus) {
        updateData.status = smsDisposition.suggestedStatus;
      }

      // Add to DNC if needed
      if (smsDisposition.shouldAddToDnc) {
        updateData.do_not_call = true;
      }

      await supabaseAdmin
        .from('leads')
        .update(updateData)
        .eq('id', lead.id)
        .eq('organization_id', organizationId);

      console.log('[Twilio SMS Webhook] Lead updated with SMS disposition:', {
        leadId: lead.id,
        disposition: smsDisposition.disposition,
        newStatus: smsDisposition.suggestedStatus
      });

      // 3. Log to agent_decisions for dashboard visibility
      await supabaseAdmin
        .from('agent_decisions')
        .insert({
          user_id: userId,
          lead_id: lead.id,
          lead_name: lead.name || 'Unknown',
          decision_type: 'sms_disposition',
          reasoning: smsDisposition.reason,
          action_taken: `Applied "${smsDisposition.disposition}" from SMS. ${smsDisposition.shouldRemoveFromWorkflows ? 'Removed from workflows.' : ''} ${smsDisposition.shouldAddToDnc ? 'Added to DNC.' : ''}`,
          success: true,
          executed_at: new Date().toISOString(),
        });

      console.log('[Twilio SMS Webhook] Agent decision logged for SMS disposition');

      // 4. If opt-out, skip AI auto-reply entirely
      if (smsDisposition.shouldStopAutoReply) {
        console.log('[Twilio SMS Webhook] Opt-out detected, skipping auto-reply');
        return new Response(
          '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
          { headers: { ...corsHeaders, 'Content-Type': 'text/xml' } }
        );
      }
    } else if (smsDisposition.disposition && !lead?.id) {
      // Log disposition detected but no lead found
      console.log('[Twilio SMS Webhook] SMS Disposition detected but no lead found for phone:', From, 'Disposition:', smsDisposition.disposition);
    }

    // UPDATE NUDGE TRACKING: Mark that lead has responded (THIS IS KEY FOR FOLLOW-UP LOGIC)
    if (lead?.id) {
      console.log('[Twilio SMS Webhook] Updating nudge tracking - lead responded:', lead.id);

      // Calculate next nudge time (only if lead goes silent again)
      // Default: 24 hours after lead response
      const nextNudgeAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      await supabaseAdmin
        .from('lead_nudge_tracking')
        .upsert({
          lead_id: lead.id,
          user_id: userId,
          last_lead_response_at: new Date().toISOString(),
          is_engaged: true, // Lead is now engaged since they responded
          next_nudge_at: nextNudgeAt, // Schedule follow-up if they go silent
          sequence_paused: false, // Unpause if paused
        }, {
          onConflict: 'lead_id',
        });
    }

    if (lead?.id) {
      // Check if this lead is in an active workflow with auto-reply enabled
      const { data: workflowProgress } = await supabaseAdmin
        .from('lead_workflow_progress')
        .select(`
          id,
          workflow_id,
          status,
          campaign_workflows:workflow_id (
            id,
            name,
            auto_reply_settings
          )
        `)
        .eq('lead_id', lead.id)
        .eq('user_id', userId)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();

      if (workflowProgress?.campaign_workflows) {
        const workflow = workflowProgress.campaign_workflows as any;
        const autoReplySettings = workflow.auto_reply_settings;

        if (autoReplySettings?.enabled) {
          workflowAutoReply = autoReplySettings;
          workflowName = workflow.name;
          console.log('[Twilio SMS Webhook] Found workflow auto-reply settings for workflow:', workflowName);
        }
      }
    }

    // Determine which settings to use (workflow overrides global)
    const useWorkflowSettings = !!workflowAutoReply?.enabled;
    const shouldAutoRespond = useWorkflowSettings
      ? true
      : (globalSettings?.enabled && globalSettings?.auto_response_enabled);

    console.log('[Twilio SMS Webhook] Auto-response config:', JSON.stringify({
      useWorkflowSettings,
      workflowName,
      globalEnabled: globalSettings?.enabled,
      globalAutoResponse: globalSettings?.auto_response_enabled,
      shouldAutoRespond
    }));

    // Double-texting prevention: Check if we've recently sent an AI message
    const preventDoubleTxt = useWorkflowSettings
      ? true // Workflow auto-reply always prevents double texting
      : globalSettings?.prevent_double_texting;
    const delaySeconds = useWorkflowSettings
      ? (workflowAutoReply?.response_delay_seconds || 60)
      : (globalSettings?.double_text_delay_seconds || 60);

    if (shouldAutoRespond && preventDoubleTxt && conversationId) {
      const preventionWindowMs = delaySeconds * 1000;
      const cutoffTime = new Date(Date.now() - preventionWindowMs).toISOString();

      const { data: recentAiMessage } = await supabaseAdmin
        .from('sms_messages')
        .select('id, created_at')
        .eq('conversation_id', conversationId)
        .eq('organization_id', organizationId)
        .eq('direction', 'outbound')
        .eq('is_ai_generated', true)
        .gt('created_at', cutoffTime)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (recentAiMessage) {
        console.log('[Twilio SMS Webhook] Double-texting prevention: AI message sent recently, skipping auto-response');
        return new Response(
          '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
          { headers: { ...corsHeaders, 'Content-Type': 'text/xml' } }
        );
      }
    }

    // Rapid message batching: Wait briefly then check if more messages arrived
    if (shouldAutoRespond && conversationId) {
      // Wait a moment to allow rapid messages to be stored
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Check if this is the most recent inbound message
      const { data: latestInbound } = await supabaseAdmin
        .from('sms_messages')
        .select('id')
        .eq('conversation_id', conversationId)
        .eq('organization_id', organizationId)
        .eq('direction', 'inbound')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestInbound && message && latestInbound.id !== message.id) {
        console.log('[Twilio SMS Webhook] Newer inbound message exists, skipping auto-response for this one');
        return new Response(
          '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
          { headers: { ...corsHeaders, 'Content-Type': 'text/xml' } }
        );
      }
    }

    // Check if auto-response should be generated
    if (shouldAutoRespond && conversationId) {
      console.log('[Twilio SMS Webhook] Auto-response enabled, generating AI response...' +
        (useWorkflowSettings ? ` (using workflow: ${workflowName})` : ' (using global settings)'));

      // SMART REACTION DETECTION
      // Only skip responses for TRUE reactions (emoji-only, iMessage reactions)
      // NEVER skip text responses - they almost always need a reply

      // TRUE reactions are ONLY emoji-only messages or iMessage reaction patterns
      const trueReactionPatterns = [
        /^(👍|👎|❤️|😀|😊|🙏|👌|✅|😂|😮|😢|🔥|💯|👏|🎉)$/,  // Single emoji only
        /^Liked ".*"$/i,   // iMessage "Liked" reaction
        /^Loved ".*"$/i,   // iMessage "Loved" reaction
        /^Emphasized ".*"$/i,  // iMessage "Emphasized" reaction
        /^Laughed at ".*"$/i,  // iMessage laugh reaction
        /^Questioned ".*"$/i,  // iMessage question reaction
        /^Disliked ".*"$/i,    // iMessage dislike reaction
      ];

      const isTrueReaction = trueReactionPatterns.some(pattern => pattern.test(messageBody.trim()));

      // Log what we detected
      console.log('[Twilio SMS Webhook] Reaction check:', {
        message: messageBody.substring(0, 30),
        isTrueReaction,
        reactionDetectionEnabled: globalSettings?.enable_reaction_detection
      });

      // ONLY skip for TRUE reactions (emojis and iMessage reactions)
      // Text like "ok", "thanks", "yes", "no" should ALWAYS get responses
      if (isTrueReaction && globalSettings?.enable_reaction_detection) {
        console.log('[Twilio SMS Webhook] True reaction detected (emoji/iMessage), skipping auto-response');

        // Mark the message as a reaction
        await supabaseAdmin
          .from('sms_messages')
          .update({ is_reaction: true, reaction_type: 'emoji_reaction' })
          .eq('id', message?.id)
          .eq('organization_id', organizationId);

        return new Response(
          '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
          { headers: { ...corsHeaders, 'Content-Type': 'text/xml' } }
        );
      }

      // Merge settings: workflow settings override global settings where available
      const effectiveSettings = {
        // Use workflow AI instructions if available, otherwise global
        ai_personality: useWorkflowSettings && workflowAutoReply?.ai_instructions
          ? workflowAutoReply.ai_instructions
          : globalSettings?.ai_personality,
        custom_instructions: useWorkflowSettings && workflowAutoReply?.ai_instructions
          ? workflowAutoReply.ai_instructions
          : globalSettings?.custom_instructions,
        knowledge_base: useWorkflowSettings && workflowAutoReply?.knowledge_base
          ? workflowAutoReply.knowledge_base
          : globalSettings?.knowledge_base,
        // Calendar settings - workflow can override
        enable_calendar_integration: useWorkflowSettings
          ? workflowAutoReply?.calendar_enabled
          : globalSettings?.enable_calendar_integration,
        calendar_booking_link: useWorkflowSettings && workflowAutoReply?.booking_link
          ? workflowAutoReply.booking_link
          : globalSettings?.calendar_booking_link,
        // Other settings from global (workflow doesn't override these)
        include_lead_context: globalSettings?.include_lead_context ?? true,
        include_call_history: globalSettings?.include_call_history ?? true,
        include_sms_history: globalSettings?.include_sms_history ?? true,
        max_history_items: globalSettings?.max_history_items || 5,
        context_window_size: globalSettings?.context_window_size || 20,
        dynamic_variables_enabled: globalSettings?.dynamic_variables_enabled ?? true,
      };

      console.log('[Twilio SMS Webhook] Using effective settings:', JSON.stringify({
        source: useWorkflowSettings ? `workflow:${workflowName}` : 'global',
        hasInstructions: !!effectiveSettings.ai_personality,
        hasKnowledgeBase: !!effectiveSettings.knowledge_base,
        calendarEnabled: effectiveSettings.enable_calendar_integration
      }));

      try {
        // Fetch lead info for context if enabled
        let leadContext = '';
        let leadData: any = null;

        if (effectiveSettings.include_lead_context) {
          const { data: leadInfo } = await supabaseAdmin
            .from('leads')
            .select('*')
            .eq('organization_id', organizationId)
            .eq('phone_number', From)
            .maybeSingle();

          if (leadInfo) {
            leadData = leadInfo;
            leadContext = `\n\nLEAD INFORMATION:
- Name: ${leadInfo.first_name || ''} ${leadInfo.last_name || ''}
- Email: ${leadInfo.email || 'Not provided'}
- Company: ${leadInfo.company || 'Not provided'}
- Status: ${leadInfo.status || 'Unknown'}
- Lead Source: ${leadInfo.lead_source || 'Unknown'}
- Notes: ${leadInfo.notes || 'None'}
- Tags: ${leadInfo.tags?.join(', ') || 'None'}`;
            console.log('[Twilio SMS Webhook] Found lead context');
          }
        }

        // Fetch call history if enabled
        let callHistoryContext = '';
        if (effectiveSettings.include_call_history) {
          const maxHistoryItems = effectiveSettings.max_history_items || 5;
          const { data: calls } = await supabaseAdmin
            .from('call_logs')
            .select('*')
            .eq('organization_id', organizationId)
            .eq('phone_number', From)
            .order('created_at', { ascending: false })
            .limit(maxHistoryItems);

          if (calls && calls.length > 0) {
            callHistoryContext = `\n\nRECENT CALL HISTORY:`;
            calls.forEach((call: any) => {
              const date = new Date(call.created_at).toLocaleDateString();
              callHistoryContext += `\n- ${date}: ${call.status} (${call.duration_seconds || 0}s) - Outcome: ${call.outcome || 'N/A'}${call.notes ? ` - Notes: ${call.notes}` : ''}`;
            });
            console.log('[Twilio SMS Webhook] Added call history context');
          }
        }

        // Get conversation history for context
        const { data: historyMessages } = await supabaseAdmin
          .from('sms_messages')
          .select('*')
          .eq('conversation_id', conversationId)
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false })
          .limit(effectiveSettings.context_window_size || 20);

        // Build conversation history (text only for history)
        const conversationHistory = (historyMessages || [])
          .reverse()
          .slice(0, -1) // Exclude the current message, we'll add it with image
          .map((msg: any) => ({
            role: msg.direction === 'inbound' ? 'user' : 'assistant',
            content: msg.body
          }));

        // Generate AI response using Lovable AI
        const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
        if (!lovableApiKey) {
          console.error('[Twilio SMS Webhook] LOVABLE_API_KEY not configured');
        } else {
          // Helper function to replace dynamic variables
          const replaceDynamicVariables = (text: string): string => {
            if (!text || !effectiveSettings.dynamic_variables_enabled) return text || '';

            const variables: Record<string, string> = {
              '{{first_name}}': leadData?.first_name || 'there',
              '{{last_name}}': leadData?.last_name || '',
              '{{email}}': leadData?.email || '',
              '{{company}}': leadData?.company || '',
              '{{phone}}': From || '',
              '{{status}}': leadData?.status || '',
            };

            let result = text;
            Object.entries(variables).forEach(([key, value]) => {
              result = result.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
            });
            return result;
          };

          // Build comprehensive system prompt with current date/time awareness
          // First, fetch user's timezone from calendar availability
          const { data: userAvailability } = await supabaseAdmin
            .from('calendar_availability')
            .select('timezone')
            .eq('user_id', userId)
            .maybeSingle();

          const userTimezone = userAvailability?.timezone || 'America/Denver'; // Default to Mountain Time

          // Get current time in user's timezone
          const now = new Date();
          const timeFormatter = new Intl.DateTimeFormat('en-US', {
            timeZone: userTimezone,
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
          });
          const dateFormatter = new Intl.DateTimeFormat('en-US', {
            timeZone: userTimezone,
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          });
          const yearFormatter = new Intl.DateTimeFormat('en-US', {
            timeZone: userTimezone,
            year: 'numeric'
          });

          const currentTime = timeFormatter.format(now);
          const currentDate = dateFormatter.format(now);
          const currentYear = parseInt(yearFormatter.format(now));

          // Calculate tomorrow in user's timezone
          const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
          const tomorrowDate = dateFormatter.format(tomorrow);

          console.log('[Twilio SMS Webhook] Using timezone:', userTimezone, 'Current time:', currentTime);

          let systemPrompt = `You are an AI SMS assistant.

CURRENT DATE & TIME (${userTimezone}):
- Today is: ${currentDate}
- Current time: ${currentTime}
- Current year: ${currentYear}
- IMPORTANT: When booking appointments, ALWAYS use the year ${currentYear} or later. Never book appointments in past years.
- IMPORTANT: All times should be in ${userTimezone} timezone.
- When someone says "tomorrow", that means ${tomorrowDate}.
- When someone says "next week", calculate from today (${currentDate}).
- If the user asks for the current date or time, answer directly using the CURRENT DATE & TIME above (do not guess).


PERSONALITY:
${effectiveSettings.ai_personality || 'professional and helpful'}`;

          // Add custom instructions if provided
          if (effectiveSettings.custom_instructions) {
            const processedInstructions = replaceDynamicVariables(effectiveSettings.custom_instructions);
            systemPrompt += `\n\nRULES & GUIDELINES:
${processedInstructions}`;
          }

          // Add knowledge base if provided
          if (effectiveSettings.knowledge_base) {
            const processedKnowledge = replaceDynamicVariables(effectiveSettings.knowledge_base);
            systemPrompt += `\n\nKNOWLEDGE BASE:
${processedKnowledge}`;
          }

          // Add lead context
          if (leadContext) {
            systemPrompt += leadContext;
          }

          // Add call history context
          if (callHistoryContext) {
            systemPrompt += callHistoryContext;
          }

          // Add calendar availability context if enabled
          if (effectiveSettings.enable_calendar_integration) {
            // Fetch calendar availability
            const { data: availability } = await supabaseAdmin
              .from('calendar_availability')
              .select('*')
              .eq('user_id', userId)
              .maybeSingle();

            // Fetch upcoming appointments (exclude cancelled)
            const now = new Date().toISOString();
            const { data: appointments } = await supabaseAdmin
              .from('calendar_appointments')
              .select('*')
              .eq('user_id', userId)
              .gte('start_time', now)
              .neq('status', 'cancelled')
              .order('start_time', { ascending: true })
              .limit(10);

            if (availability || appointments?.length) {
              systemPrompt += `\n\nCALENDAR INTEGRATION:`;

              if (availability) {
                const schedule = availability.weekly_schedule || {};
                const workingDays = Object.entries(schedule)
                  .filter(([_, slots]: [string, any]) => slots && slots.length > 0)
                  .map(([day, slots]: [string, any]) => {
                    const slot = slots[0];
                    return `${day.charAt(0).toUpperCase() + day.slice(1)}: ${slot.start}-${slot.end}`;
                  });

                if (workingDays.length > 0) {
                  systemPrompt += `\n- Available hours: ${workingDays.join(', ')}`;
                  systemPrompt += `\n- Timezone: ${availability.timezone || userTimezone}`;
                  systemPrompt += `\n- Meeting duration: ${availability.default_meeting_duration || 30} minutes`;
                }
              }

              if (appointments?.length) {
                systemPrompt += `\n- Upcoming booked slots:`;
                const apptDateFormatter = new Intl.DateTimeFormat('en-US', {
                  timeZone: userTimezone,
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                  weekday: 'long',
                });
                const apptTimeFormatter = new Intl.DateTimeFormat('en-US', {
                  timeZone: userTimezone,
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: true,
                });

                appointments.slice(0, 5).forEach((apt: any) => {
                  const startDate = new Date(apt.start_time);
                  const dateStr = apptDateFormatter.format(startDate);
                  const timeStr = apptTimeFormatter.format(startDate);
                  systemPrompt += `\n  * ${dateStr} at ${timeStr} - ${apt.title}`;
                });
              }

              if (effectiveSettings.calendar_booking_link) {
                systemPrompt += `\n- Booking link to share: ${effectiveSettings.calendar_booking_link}`;
              }

              systemPrompt += `\n- You CAN check availability and suggest specific open times`;
              systemPrompt += `\n- When the lead confirms they want to book, USE THE book_appointment TOOL to actually create the appointment`;
              systemPrompt += `\n- When scheduling, confirm the date, time, and timezone with the lead BEFORE booking`;
              systemPrompt += `\n- If they want to cancel, USE THE cancel_appointment TOOL`;
              console.log('[Twilio SMS Webhook] Added calendar context');
            }
          }

          // Add general SMS guidelines
          systemPrompt += `\n\nSMS GUIDELINES:
- Keep responses concise and appropriate for SMS (under 300 characters when possible)
- Be conversational and natural
- Don't use markdown formatting
- If asked about scheduling, be helpful and suggest specific times
- Never pretend to be human - you can acknowledge you're an AI assistant if asked
- Be direct and get to the point
- IMPORTANT: When you have tools available, USE THEM to take actions. Don't just say you did something - actually do it by calling the appropriate tool.`;

          console.log('[Twilio SMS Webhook] System prompt length:', systemPrompt.length);

          // Build messages array for AI with image support
          const aiMessages: any[] = [
            { role: 'system', content: systemPrompt },
            ...conversationHistory
          ];

          // Add current message with image if present
          if (hasMedia && MediaUrl0) {
            console.log('[Twilio SMS Webhook] Including image in AI request');
            aiMessages.push({
              role: 'user',
              content: [
                {
                  type: 'image_url',
                  image_url: { url: MediaUrl0 }
                },
                {
                  type: 'text',
                  text: messageBody || 'What is this image?'
                }
              ]
            });
          } else {
            aiMessages.push({
              role: 'user',
              content: messageBody
            });
          }

          console.log('[Twilio SMS Webhook] Sending request to Lovable AI Gateway with tool support');

          // Define available tools for the AI
          const tools = effectiveSettings.enable_calendar_integration ? [
            {
              type: 'function',
              function: {
                name: 'check_appointments',
                description: 'Check what appointments are scheduled for this lead. Use this when they ask about their upcoming appointments or want to know what is booked.',
                parameters: {
                  type: 'object',
                  properties: {},
                  required: []
                }
              }
            },
            {
              type: 'function',
              function: {
                name: 'book_appointment',
                description: 'Book an appointment/meeting with the lead. Use this when the lead confirms they want to schedule.',
                parameters: {
                  type: 'object',
                  properties: {
                    title: {
                      type: 'string',
                      description: 'Title of the appointment (e.g., "Demo Call", "Consultation")'
                    },
                    date: {
                      type: 'string',
                      description: 'Date in YYYY-MM-DD format'
                    },
                    time: {
                      type: 'string',
                      description: 'Time in HH:MM format (24-hour)'
                    },
                    duration_minutes: {
                      type: 'number',
                      description: 'Duration in minutes (default 30)'
                    },
                    timezone: {
                      type: 'string',
                      description: 'Timezone (e.g., "America/Denver", "America/Chicago")'
                    }
                  },
                  required: ['title', 'date', 'time']
                }
              }
            },
            {
              type: 'function',
              function: {
                name: 'reschedule_appointment',
                description: 'Reschedule an existing appointment to a new date/time. Use this when the lead wants to change their appointment time.',
                parameters: {
                  type: 'object',
                  properties: {
                    new_date: {
                      type: 'string',
                      description: 'New date in YYYY-MM-DD format'
                    },
                    new_time: {
                      type: 'string',
                      description: 'New time in HH:MM format (24-hour)'
                    },
                    timezone: {
                      type: 'string',
                      description: 'Timezone (e.g., "America/Denver", "America/Chicago")'
                    }
                  },
                  required: ['new_date', 'new_time']
                }
              }
            },
            {
              type: 'function',
              function: {
                name: 'cancel_appointment',
                description: 'Cancel an existing appointment for the lead. Use when they want to cancel completely.',
                parameters: {
                  type: 'object',
                  properties: {
                    reason: {
                      type: 'string',
                      description: 'Reason for cancellation'
                    }
                  }
                }
              }
            }
          ] : [];

          const aiRequestBody: any = {
            model: 'google/gemini-2.5-flash',
            messages: aiMessages,
          };

          if (tools.length > 0) {
            aiRequestBody.tools = tools;
            aiRequestBody.tool_choice = 'auto';
          }

          const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${lovableApiKey}`,
            },
            body: JSON.stringify(aiRequestBody),
          });

          if (!aiResponse.ok) {
            const errorText = await aiResponse.text();
            console.error('[Twilio SMS Webhook] Lovable AI error:', aiResponse.status, errorText);
          } else {
            const aiData = await aiResponse.json();
            const aiMessage = aiData.choices?.[0]?.message;

            // Check if AI wants to call a tool
            let aiReply = aiMessage?.content || '';
            const toolCalls = aiMessage?.tool_calls;

            if (toolCalls && toolCalls.length > 0) {
              console.log('[Twilio SMS Webhook] AI requested tool calls:', toolCalls.length);
              const toolResults: { function: string; result: string }[] = [];

              for (const toolCall of toolCalls) {
                const functionName = toolCall.function?.name;
                const functionArgs = JSON.parse(toolCall.function?.arguments || '{}');

                console.log('[Twilio SMS Webhook] Processing tool call:', functionName, functionArgs);

                if (functionName === 'check_appointments') {
                  try {
                    // Find all upcoming appointments for this lead
                    let appointmentsInfo = 'No upcoming appointments found.';

                    if (lead?.id) {
                      const now = new Date().toISOString();
                      const { data: appointments } = await supabaseAdmin
                        .from('calendar_appointments')
                        .select('*')
                        .eq('lead_id', lead.id)
                        .eq('status', 'scheduled')
                        .gte('start_time', now)
                        .order('start_time', { ascending: true })
                        .limit(5);

                      if (appointments && appointments.length > 0) {
                        appointmentsInfo = `Found ${appointments.length} upcoming appointment(s):\n`;
                        appointments.forEach((apt: any, index: number) => {
                          const startDate = new Date(apt.start_time);
                          const dateStr = startDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
                          const timeStr = startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                          appointmentsInfo += `${index + 1}. ${apt.title} - ${dateStr} at ${timeStr}\n`;
                        });
                      }
                    }

                    // Add this info to the tool response
                    toolResults.push({ function: 'check_appointments', result: appointmentsInfo });
                    console.log('[Twilio SMS Webhook] Checked appointments:', appointmentsInfo);
                  } catch (checkError) {
                    console.error('[Twilio SMS Webhook] Check appointments error:', checkError);
                  }
                }

                if (functionName === 'book_appointment') {
                  try {
                    // Parse the date and time
                    const appointmentDateStr = functionArgs.date;
                    const appointmentTime = functionArgs.time || '09:00';
                    const duration = functionArgs.duration_minutes || 30;
                    const timezone = functionArgs.timezone || 'America/Chicago';

                    // Build initial Date from the AI-provided string
                    let startDateTime = new Date(`${appointmentDateStr}T${appointmentTime}:00`);
                    const now = new Date();

                    // If the parsed date is in the past, roll it forward by years
                    let safetyCounter = 0;
                    while (startDateTime.getTime() <= now.getTime() && safetyCounter < 5) {
                      startDateTime = new Date(
                        startDateTime.getFullYear() + 1,
                        startDateTime.getMonth(),
                        startDateTime.getDate(),
                        startDateTime.getHours(),
                        startDateTime.getMinutes(),
                        startDateTime.getSeconds(),
                      );
                      safetyCounter++;
                    }

                    const endDateTime = new Date(startDateTime.getTime() + duration * 60 * 1000);
                    console.log('[Twilio SMS Webhook] Normalized appointment time:', {
                      requestedDate: appointmentDateStr,
                      finalStart: startDateTime.toISOString(),
                      timezone,
                    });
                    let appointmentLeadId = lead?.id || null;
                    if (!appointmentLeadId) {
                      // Create a new lead for this phone number
                      const { data: newLead } = await supabaseAdmin
                        .from('leads')
                        .insert({
                          user_id: userId,
                          organization_id: organizationId,
                          phone_number: From,
                          status: 'appointment_scheduled'
                        })
                        .select('id')
                        .maybeSingle();
                      appointmentLeadId = newLead?.id;
                    }

                    // Create the appointment
                    const { data: appointment, error: apptError } = await supabaseAdmin
                      .from('calendar_appointments')
                      .insert({
                        user_id: userId,
                        lead_id: appointmentLeadId,
                        title: functionArgs.title || 'Appointment',
                        start_time: startDateTime.toISOString(),
                        end_time: endDateTime.toISOString(),
                        timezone: timezone,
                        status: 'scheduled',
                        notes: `Booked via AI SMS conversation with ${From}`
                      })
                      .select()
                      .maybeSingle();

                    if (apptError) {
                      console.error('[Twilio SMS Webhook] Failed to create appointment:', apptError);
                    } else {
                      console.log('[Twilio SMS Webhook] Appointment created:', appointment.id);

                      // Update lead status
                      if (appointmentLeadId) {
                        await supabaseAdmin
                          .from('leads')
                          .update({
                            status: 'appointment_scheduled',
                            next_callback_at: startDateTime.toISOString()
                          })
                          .eq('id', appointmentLeadId)
                          .eq('organization_id', organizationId);
                      }

                      // Sync to Google Calendar
                      try {
                        const syncResponse = await fetch(`${supabaseUrl}/functions/v1/calendar-integration`, {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${serviceRoleKey}`,
                          },
                          body: JSON.stringify({
                            action: 'sync_appointment',
                            appointment: appointment
                          }),
                        });

                        if (syncResponse.ok) {
                          console.log('[Twilio SMS Webhook] Appointment synced to calendar');
                        } else {
                          console.error('[Twilio SMS Webhook] Calendar sync failed');
                        }
                      } catch (syncError) {
                        console.error('[Twilio SMS Webhook] Calendar sync error:', syncError);
                      }
                    }
                  } catch (bookingError) {
                    console.error('[Twilio SMS Webhook] Booking error:', bookingError);
                  }
                }

                if (functionName === 'reschedule_appointment') {
                  try {
                    const now = new Date().toISOString();
                    let existingAppt = null;

                    // First try to find by lead_id
                    if (lead?.id) {
                      const { data: apptByLead } = await supabaseAdmin
                        .from('calendar_appointments')
                        .select('*')
                        .eq('lead_id', lead.id)
                        .in('status', ['scheduled', 'confirmed']) // Accept both statuses
                        .gte('start_time', now)
                        .order('start_time', { ascending: true })
                        .limit(1)
                        .maybeSingle();
                      existingAppt = apptByLead;
                      if (existingAppt) {
                        console.log('[Twilio SMS Webhook] Found appointment by lead_id:', existingAppt.id);
                      }
                    }

                    // If not found by lead_id, try to find by phone number in notes
                    if (!existingAppt) {
                      const { data: apptByPhone } = await supabaseAdmin
                        .from('calendar_appointments')
                        .select('*')
                        .eq('user_id', userId)
                        .in('status', ['scheduled', 'confirmed']) // Accept both statuses
                        .gte('start_time', now)
                        .ilike('notes', `%${From}%`)
                        .order('start_time', { ascending: true })
                        .limit(1)
                        .maybeSingle();
                      existingAppt = apptByPhone;
                      if (existingAppt) {
                        console.log('[Twilio SMS Webhook] Found appointment by phone in notes:', existingAppt.id);
                      }
                    }

                    // If still not found, try to find by phone in metadata
                    if (!existingAppt) {
                      // Search for any upcoming appointment with matching caller_phone or attendee_phone in metadata
                      const { data: allUpcoming } = await supabaseAdmin
                        .from('calendar_appointments')
                        .select('*')
                        .eq('user_id', userId)
                        .in('status', ['scheduled', 'confirmed'])
                        .gte('start_time', now)
                        .order('start_time', { ascending: true })
                        .limit(10);

                      if (allUpcoming) {
                        // Check metadata for matching phone
                        const cleanFrom = From.replace(/\D/g, '').slice(-10);
                        existingAppt = allUpcoming.find((apt: any) => {
                          const metadata = apt.metadata || {};
                          const callerPhone = (metadata.caller_phone || '').replace(/\D/g, '').slice(-10);
                          const attendeePhone = (metadata.attendee_phone || '').replace(/\D/g, '').slice(-10);
                          return callerPhone === cleanFrom || attendeePhone === cleanFrom;
                        });

                        if (existingAppt) {
                          console.log('[Twilio SMS Webhook] Found appointment by phone in metadata:', existingAppt.id);
                        }
                      }
                    }

                    // Last resort: find most recent upcoming appointment for this user
                    if (!existingAppt) {
                      const { data: mostRecent } = await supabaseAdmin
                        .from('calendar_appointments')
                        .select('*')
                        .eq('user_id', userId)
                        .in('status', ['scheduled', 'confirmed'])
                        .gte('start_time', now)
                        .order('start_time', { ascending: true })
                        .limit(1)
                        .maybeSingle();
                      existingAppt = mostRecent;
                      if (existingAppt) {
                        console.log('[Twilio SMS Webhook] Found most recent upcoming appointment as fallback:', existingAppt.id);
                      }
                    }

                    console.log('[Twilio SMS Webhook] Searched for appointment to reschedule, found:', existingAppt?.id || 'none');

                    if (existingAppt) {
                      const newDateStr = functionArgs.new_date;
                      const newTime = functionArgs.new_time || '09:00';
                      const timezone = functionArgs.timezone || existingAppt.timezone || 'America/Chicago';

                      // Calculate new start time
                      let newStartDateTime = new Date(`${newDateStr}T${newTime}:00`);
                      const currentNow = new Date();

                      // Roll forward if in past
                      let safetyCounter = 0;
                      while (newStartDateTime.getTime() <= currentNow.getTime() && safetyCounter < 5) {
                        newStartDateTime = new Date(
                          newStartDateTime.getFullYear() + 1,
                          newStartDateTime.getMonth(),
                          newStartDateTime.getDate(),
                          newStartDateTime.getHours(),
                          newStartDateTime.getMinutes(),
                          newStartDateTime.getSeconds(),
                        );
                        safetyCounter++;
                      }

                      // Calculate duration from original appointment
                      const originalStart = new Date(existingAppt.start_time);
                      const originalEnd = new Date(existingAppt.end_time);
                      const duration = (originalEnd.getTime() - originalStart.getTime()) / (60 * 1000);
                      const newEndDateTime = new Date(newStartDateTime.getTime() + duration * 60 * 1000);

                      // Update the appointment
                      const { error: updateError } = await supabaseAdmin
                        .from('calendar_appointments')
                        .update({
                          start_time: newStartDateTime.toISOString(),
                          end_time: newEndDateTime.toISOString(),
                          timezone: timezone,
                          notes: `${existingAppt.notes || ''}\nRescheduled via SMS on ${new Date().toLocaleDateString()}`
                        })
                        .eq('id', existingAppt.id);

                      if (!updateError) {
                        console.log('[Twilio SMS Webhook] Appointment rescheduled:', existingAppt.id);

                        // Update lead's next callback if we have a lead
                        if (lead?.id) {
                          await supabaseAdmin
                            .from('leads')
                            .update({ next_callback_at: newStartDateTime.toISOString() })
                            .eq('id', lead.id)
                            .eq('organization_id', organizationId);
                        }

                        // Sync update to Google Calendar
                        if (existingAppt.google_event_id) {
                          try {
                            await fetch(`${supabaseUrl}/functions/v1/calendar-integration`, {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${serviceRoleKey}`,
                              },
                              body: JSON.stringify({
                                action: 'update_event',
                                user_id: userId,
                                event_id: existingAppt.google_event_id,
                                updates: {
                                  start_time: newStartDateTime.toISOString(),
                                  end_time: newEndDateTime.toISOString(),
                                  timezone: timezone
                                }
                              }),
                            });
                            console.log('[Twilio SMS Webhook] Google Calendar event updated');
                          } catch (syncError) {
                            console.error('[Twilio SMS Webhook] Calendar update error:', syncError);
                          }
                        }
                      }
                    } else {
                      console.log('[Twilio SMS Webhook] No appointment to reschedule for:', From);
                    }
                  } catch (rescheduleError) {
                    console.error('[Twilio SMS Webhook] Reschedule error:', rescheduleError);
                  }
                }

                if (functionName === 'cancel_appointment') {
                  try {
                    const now = new Date().toISOString();
                    let existingAppt = null;

                    // First try to find by lead_id
                    if (lead?.id) {
                      const { data: apptByLead } = await supabaseAdmin
                        .from('calendar_appointments')
                        .select('id, google_event_id, title, start_time')
                        .eq('lead_id', lead.id)
                        .in('status', ['scheduled', 'confirmed']) // Accept both statuses
                        .gte('start_time', now)
                        .order('start_time', { ascending: true })
                        .limit(1)
                        .maybeSingle();
                      existingAppt = apptByLead;
                    }

                    // If not found by lead_id, try to find by phone number in notes
                    if (!existingAppt) {
                      const { data: apptByPhone } = await supabaseAdmin
                        .from('calendar_appointments')
                        .select('id, google_event_id, title, start_time, metadata')
                        .eq('user_id', userId)
                        .in('status', ['scheduled', 'confirmed']) // Accept both statuses
                        .gte('start_time', now)
                        .ilike('notes', `%${From}%`)
                        .order('start_time', { ascending: true })
                        .limit(1)
                        .maybeSingle();
                      existingAppt = apptByPhone;
                    }

                    // If still not found, try to find by phone in metadata or as fallback
                    if (!existingAppt) {
                      const { data: allUpcoming } = await supabaseAdmin
                        .from('calendar_appointments')
                        .select('id, google_event_id, title, start_time, metadata')
                        .eq('user_id', userId)
                        .in('status', ['scheduled', 'confirmed'])
                        .gte('start_time', now)
                        .order('start_time', { ascending: true })
                        .limit(10);

                      if (allUpcoming) {
                        const cleanFrom = From.replace(/\D/g, '').slice(-10);
                        existingAppt = allUpcoming.find((apt: any) => {
                          const metadata = apt.metadata || {};
                          const callerPhone = (metadata.caller_phone || '').replace(/\D/g, '').slice(-10);
                          const attendeePhone = (metadata.attendee_phone || '').replace(/\D/g, '').slice(-10);
                          return callerPhone === cleanFrom || attendeePhone === cleanFrom;
                        });

                        // Last resort: use first upcoming
                        if (!existingAppt && allUpcoming.length > 0) {
                          existingAppt = allUpcoming[0];
                        }
                      }
                    }

                    if (existingAppt) {
                      await supabaseAdmin
                        .from('calendar_appointments')
                        .update({
                          status: 'cancelled',
                          notes: `Cancelled via SMS: ${functionArgs.reason || 'No reason provided'}`
                        })
                        .eq('id', existingAppt.id);

                      console.log('[Twilio SMS Webhook] Appointment cancelled:', existingAppt.id);

                      // Update lead status if we have a lead
                      if (lead?.id) {
                        await supabaseAdmin
                          .from('leads')
                          .update({ status: 'callback_requested', next_callback_at: null })
                          .eq('id', lead.id)
                          .eq('organization_id', organizationId);
                      }

                      // Delete from Google Calendar if synced
                      if (existingAppt.google_event_id) {
                        try {
                          await fetch(`${supabaseUrl}/functions/v1/calendar-integration`, {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json',
                              'Authorization': `Bearer ${serviceRoleKey}`,
                            },
                            body: JSON.stringify({
                              action: 'delete_event',
                              user_id: userId,
                              event_id: existingAppt.google_event_id
                            }),
                          });
                          console.log('[Twilio SMS Webhook] Google Calendar event deleted');
                        } catch (syncError) {
                          console.error('[Twilio SMS Webhook] Calendar delete error:', syncError);
                        }
                      }
                    } else {
                      console.log('[Twilio SMS Webhook] No appointment found to cancel for:', From);
                    }
                  } catch (cancelError) {
                    console.error('[Twilio SMS Webhook] Cancel error:', cancelError);
                  }
                }
              }

              // If AI provided content alongside tool calls, use that as the reply
              // Otherwise, make another call to get a confirmation message
              if (!aiReply) {
                const confirmMessages = [
                  ...aiMessages,
                  { role: 'assistant', content: null, tool_calls: toolCalls },
                  { role: 'tool', tool_call_id: toolCalls[0].id, content: 'Action completed successfully' }
                ];

                const confirmResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${lovableApiKey}`,
                  },
                  body: JSON.stringify({
                    model: 'google/gemini-2.5-flash',
                    messages: confirmMessages,
                  }),
                });

                if (confirmResponse.ok) {
                  const confirmData = await confirmResponse.json();
                  aiReply = confirmData.choices?.[0]?.message?.content || 'Done!';
                }
              }
            }

            if (aiReply) {
              console.log('[Twilio SMS Webhook] AI response generated:', aiReply.substring(0, 100));

              // Store AI response
              const { data: storedMessage, error: aiMsgError } = await supabaseAdmin
                .from('sms_messages')
                .insert({
                  user_id: userId,
                  organization_id: organizationId,
                  conversation_id: conversationId,
                  to_number: From, // Reply to sender
                  from_number: To, // From our number
                  body: aiReply,
                  direction: 'outbound',
                  status: 'pending',
                  provider_type: 'twilio',
                  is_ai_generated: true,
                })
                .select()
                .maybeSingle();

              if (aiMsgError) {
                console.error('[Twilio SMS Webhook] Failed to store AI message:', aiMsgError);
              } else {
                console.log('[Twilio SMS Webhook] AI message stored:', storedMessage.id);

                // Send via SMS messaging function (skip DB insert since we already stored the message)
                try {
                  const smsResponse = await fetch(`${supabaseUrl}/functions/v1/sms-messaging`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${serviceRoleKey}`,
                    },
                    body: JSON.stringify({
                      action: 'send_sms',
                      to: From,
                      from: To,
                      body: aiReply,
                      user_id: userId,
                      organization_id: organizationId,
                      conversation_id: conversationId,
                      skip_db_insert: true,
                      existing_message_id: storedMessage.id,
                      idempotency_key: `sms-record:${storedMessage.id}`,
                    }),
                  });

                  if (!smsResponse.ok) {
                    const smsError = await smsResponse.text();
                    throw new Error(`sms-messaging returned HTTP ${smsResponse.status}: ${smsError}`);
                  }

                  const smsResult = await smsResponse.json();
                  assertAcceptedSmsEnvelope(smsResult);
                  console.log(
                    '[Twilio SMS Webhook] SMS provider accepted message:',
                    smsResult.provider_message_id,
                  );
                } catch (sendError) {
                  console.error('[Twilio SMS Webhook] Error sending SMS:', sendError);
                  await supabaseAdmin
                    .from('sms_messages')
                    .update({
                      status: 'failed',
                      error_message: sendError instanceof Error ? sendError.message : 'SMS send failed',
                    })
                    .eq('id', storedMessage.id)
                    .eq('organization_id', organizationId);
                }
              }
            }
          }
        }
      } catch (aiError) {
        console.error('[Twilio SMS Webhook] AI processing error:', aiError);
      }
    }

    // Return TwiML response (empty response - we handle replies ourselves)
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      {
        headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
      }
    );

  } catch (error) {
    console.error('[Twilio SMS Webhook] Error:', error);

    // Return TwiML response even on error
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      {
        status: 200, // Return 200 to prevent Twilio retries
        headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
      }
    );
  }
});
=== FILE: supabase/functions/sms-messaging/index.ts ===
/**
 * SMS Messaging Edge Function
 *
 * Handles SMS messaging operations via Twilio:
 * - Send SMS messages
 * - Get message history
 * - Get available SMS-enabled numbers
 *
 * P5: every insert carries organization_id. The organization is resolved from
 * the explicit request.organization_id via requireExplicitOrganizationId +
 * membership check (see _shared/tenant-context.ts). The from-number must be a
 * phone_numbers row with that organization_id, else CALLER_ID_NOT_OWNED.
 *
 * Removed: the SMS_EGRESS_NOT_CERTIFIED 503 gate that was at material lines
 * 124-136 (send_sms) and the PROVIDER_ADMIN_NOT_CERTIFIED 503 gate at material
 * lines 138-148 (get_available_numbers / check_webhook_status /
 * configure_webhook). The live deployed function does not have these gates.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import {
  canonicalSmsPhone,
  requireSmsIdempotencyKey,
  sameSmsPhone,
  selectOwnedSmsNumber,
  smsClaimDisposition,
  type SmsProvider,
} from './sms-boundary.ts';
import {
  authorizeOrganizationContext,
  requireExplicitOrganizationId,
} from '../_shared/tenant-context.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SmsRequest {
  action: 'send_sms' | 'get_messages' | 'get_available_numbers' | 'check_webhook_status' | 'configure_webhook' | 'health_check';
  to?: string;
  from?: string;
  body?: string;
  lead_id?: string;
  conversation_id?: string;
  limit?: number;
  phoneNumber?: string; // For single number webhook config
  skip_db_insert?: boolean; // Skip DB insert if message already stored (e.g., from twilio-sms-webhook)
  existing_message_id?: string; // ID of already-stored message to update
  user_id?: string; // Required with the service-role token for internal calls
  organization_id?: string; // Explicit tenant context for multi-org users
  campaign_id?: string;
  is_ai_generated?: boolean;
  idempotency_key?: string;
}

class SmsBoundaryError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 400,
    readonly retryable = false,
    readonly reconciliationRequired = false,
  ) {
    super(message);
    this.name = 'SmsBoundaryError';
  }
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase admin client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Supabase configuration missing');
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Parse request early so we can check action type
    const request: SmsRequest = await req.json();

    // Every action requires an authenticated user or an internal service-role
    // request carrying the user whose resources are being operated.
    const authHeader = req.headers.get('Authorization');
    let userId: string | null = null;
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized - Please log in to perform this action' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      const bearer = authHeader.match(/^Bearer\s+(.+)$/i);
      if (!bearer) {
        return new Response(
          JSON.stringify({ success: false, error: 'Authorization must use a Bearer token', code: 'INVALID_AUTH_HEADER' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      const token = bearer[1].trim();

      if (token === serviceRoleKey && request.user_id) {
        // Internal service-to-service call (e.g. from workflow-executor)
        userId = request.user_id;
        console.log('[SMS Messaging] Internal call for user:', userId);
      } else {
        // Standard JWT-based auth (frontend calls)
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

        if (authError || !user) {
          return new Response(
            JSON.stringify({ error: 'Authentication failed - Please log in again' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        userId = user.id;
        console.log('[SMS Messaging] User authenticated:', userId);
      }
    }

    console.log('[SMS Messaging] Action:', request.action);

    // Get Twilio credentials
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');

    // Helper function to encode credentials
    const encodeCredentials = (accountSid: string, authToken: string): string => {
      const credentials = `${accountSid}:${authToken}`;
      return btoa(credentials);
    };

    // Get Telnyx credentials (for health check)
    const telnyxApiKey = Deno.env.get('TELNYX_API_KEY')?.trim().replace(/[^\x20-\x7E]/g, '') || null;
    if (!userId) throw new SmsBoundaryError('Authenticated user context is required', 'UNAUTHORIZED', 401);

    const loadOwnedActiveNumber = async (phone: string, organizationId: string, expectedProvider?: SmsProvider) => {
      const lookup = await supabaseAdmin
        .from('phone_numbers')
        .select('id, number, provider, status, capabilities, allowed_uses, organization_id')
        .eq('organization_id', organizationId)
        .eq('status', 'active');
      if (lookup.error) {
        throw new SmsBoundaryError(`Owned number lookup failed: ${lookup.error.message}`, 'FROM_NUMBER_LOOKUP_FAILED', 503);
      }
      let selected: ReturnType<typeof selectOwnedSmsNumber>;
      try {
        selected = selectOwnedSmsNumber(
          (lookup.data || []).filter((row: any) => sameSmsPhone(row.number, phone)),
          phone,
        );
      } catch (error) {
        throw new SmsBoundaryError((error as Error).message, 'CALLER_ID_NOT_OWNED', 403);
      }
      if (expectedProvider && selected.provider !== expectedProvider) {
        throw new SmsBoundaryError(`Phone number is not an owned ${expectedProvider} number`, 'FROM_NUMBER_PROVIDER_MISMATCH', 403);
      }
      return selected;
    };

    let result: Record<string, unknown>;

    switch (request.action as SmsRequest['action']) {
      case 'health_check': {
        console.log('[SMS Messaging] Health check requested');
        result = {
          success: true,
          healthy: true,
          timestamp: new Date().toISOString(),
          function: 'sms-messaging',
          capabilities: ['send_sms', 'get_messages', 'get_available_numbers', 'check_webhook_status', 'configure_webhook'],
          twilio_configured: !!(twilioAccountSid && twilioAuthToken),
          telnyx_configured: !!telnyxApiKey,
        };
        break;
      }

      case 'send_sms': {
        if (!request.to || !request.from || !request.body) {
          throw new SmsBoundaryError('To, from, and body are required for sending SMS', 'INVALID_SMS_REQUEST');
        }
        let idempotencyKey: string;
        try {
          idempotencyKey = requireSmsIdempotencyKey(request.idempotency_key);
        } catch (error) {
          throw new SmsBoundaryError((error as Error).message, 'IDEMPOTENCY_KEY_REQUIRED', 400);
        }
        if (!userId) throw new SmsBoundaryError('Authenticated user context is required', 'UNAUTHORIZED', 401);

        // Explicit tenant context. No "first membership" fallback.
        let organizationId: string;
        try {
          organizationId = await authorizeOrganizationContext(supabaseAdmin, userId, request.organization_id);
        } catch (error) {
          throw new SmsBoundaryError((error as Error).message, 'TENANT_CONTEXT_REJECTED', 403);
        }

        const cleanTo = canonicalSmsPhone(request.to);
        const cleanFrom = canonicalSmsPhone(request.from);
        console.log('[SMS Messaging] Preparing SMS boundary', { userId, organizationId, cleanFrom, cleanTo });

        // From-number must be a phone_numbers row with this organization_id.
        const phoneResult = await supabaseAdmin
          .from('phone_numbers')
          .select('id, number, provider, status, capabilities, allowed_uses, organization_id')
          .eq('organization_id', organizationId)
          .eq('status', 'active');
        if (phoneResult.error) {
          throw new SmsBoundaryError(`From-number lookup failed: ${phoneResult.error.message}`, 'FROM_NUMBER_LOOKUP_FAILED', 503);
        }
        const matchingPhones = (phoneResult.data || []).filter((row: any) => sameSmsPhone(row.number, cleanFrom));
        if (matchingPhones.length === 0) {
          throw new SmsBoundaryError('From number is not an active number owned by this organization', 'CALLER_ID_NOT_OWNED', 403);
        }

        if (request.lead_id) {
          const leadResult = await supabaseAdmin
            .from('leads')
            .select('id, user_id, organization_id, phone_number, phone_number_normalized, do_not_call')
            .eq('id', request.lead_id)
            .eq('organization_id', organizationId)
            .maybeSingle();
          if (leadResult.error) {
            throw new SmsBoundaryError(`Lead safety lookup failed: ${leadResult.error.message}`, 'LEAD_LOOKUP_FAILED', 503);
          }
          if (!leadResult.data) {
            throw new SmsBoundaryError('Lead is not owned by this organization', 'LEAD_NOT_OWNED', 403);
          }
          if (leadResult.data.phone_number_normalized !== cleanTo
            || !sameSmsPhone(leadResult.data.phone_number, cleanTo)) {
            throw new SmsBoundaryError('SMS destination does not match the owned lead', 'LEAD_DESTINATION_MISMATCH', 409);
          }
        }

        if (request.campaign_id) {
          const campaignResult = await supabaseAdmin
            .from('campaigns')
            .select('id')
            .eq('id', request.campaign_id)
            .eq('organization_id', organizationId)
            .maybeSingle();
          if (campaignResult.error) {
            throw new SmsBoundaryError(`Campaign tenant lookup failed: ${campaignResult.error.message}`, 'CAMPAIGN_LOOKUP_FAILED', 503);
          }
          if (!campaignResult.data) {
            throw new SmsBoundaryError('Campaign is not owned by this organization', 'CAMPAIGN_NOT_OWNED', 403);
          }
        }

        let phoneRecord: ReturnType<typeof selectOwnedSmsNumber>;
        try {
          phoneRecord = selectOwnedSmsNumber(matchingPhones, cleanFrom);
        } catch (error) {
          throw new SmsBoundaryError((error as Error).message, 'CALLER_ID_NOT_OWNED', 403);
        }
        const provider: SmsProvider = phoneRecord.provider;

        if (provider === 'telnyx' && !telnyxApiKey) {
          throw new SmsBoundaryError('Telnyx API key is not configured', 'PROVIDER_NOT_CONFIGURED', 503);
        }
        if (provider === 'twilio' && (!twilioAccountSid || !twilioAuthToken)) {
          throw new SmsBoundaryError('Twilio credentials are not configured', 'PROVIDER_NOT_CONFIGURED', 503);
        }

        const assertContactAllowed = async () => {
          const stopResult = await supabaseAdmin.rpc('evaluate_contact_stop', {
            p_user_id: userId,
            p_organization_id: organizationId,
            p_campaign_id: request.campaign_id || null,
            p_provider: provider,
            p_channel: 'sms',
          });
          if (stopResult.error) {
            throw new SmsBoundaryError(`Contact stop evaluation failed: ${stopResult.error.message}`, 'CONTACT_STOP_CHECK_FAILED', 503);
          }
          const stopDecision = Array.isArray(stopResult.data) ? stopResult.data[0] : stopResult.data;
          if (!stopDecision || typeof stopDecision.allowed !== 'boolean') {
            throw new SmsBoundaryError('Contact stop evaluation returned an invalid decision', 'CONTACT_STOP_CHECK_FAILED', 503);
          }
          if (!stopDecision.allowed) {
            throw new SmsBoundaryError(stopDecision.reason || 'SMS sending is stopped by policy', 'SMS_STOPPED', 423);
          }

          let leadSafetyQuery = supabaseAdmin
            .from('leads')
            .select('id, phone_number, phone_number_normalized, do_not_call')
            .eq('organization_id', organizationId)
            .eq('phone_number_normalized', cleanTo);
          if (request.lead_id) leadSafetyQuery = leadSafetyQuery.eq('id', request.lead_id);
          const leadResult = await leadSafetyQuery;
          if (leadResult.error) {
            throw new SmsBoundaryError(`Lead safety recheck failed: ${leadResult.error.message}`, 'LEAD_SAFETY_CHECK_FAILED', 503);
          }
          const destinationLeads = (leadResult.data || []).filter((lead: any) =>
            lead.phone_number_normalized === cleanTo && sameSmsPhone(lead.phone_number, cleanTo));
          if (request.lead_id && destinationLeads.length !== 1) {
            throw new SmsBoundaryError('Owned lead context changed before SMS send', 'LEAD_CONTEXT_CHANGED', 409);
          }
          if (destinationLeads.some((lead: any) => lead.do_not_call)) {
            throw new SmsBoundaryError('Lead is marked do_not_call', 'LEAD_DO_NOT_CALL', 423);
          }

          const dncResult = await supabaseAdmin
            .from('dnc_list')
            .select('id')
            .eq('organization_id', organizationId)
            .eq('phone_number_normalized', cleanTo)
            .limit(1);
          if (dncResult.error) {
            throw new SmsBoundaryError(`DNC lookup failed: ${dncResult.error.message}`, 'DNC_CHECK_FAILED', 503);
          }
          if ((dncResult.data || []).length > 0) {
            throw new SmsBoundaryError('Destination is on the organization DNC list', 'DESTINATION_DNC', 423);
          }
        };

        await assertContactAllowed();

        if (request.conversation_id) {
          const conversationResult = await supabaseAdmin
            .from('sms_conversations')
            .select('id, contact_phone')
            .eq('id', request.conversation_id)
            .eq('organization_id', organizationId)
            .maybeSingle();
          if (conversationResult.error) {
            throw new SmsBoundaryError(`Conversation lookup failed: ${conversationResult.error.message}`, 'CONVERSATION_LOOKUP_FAILED', 503);
          }
          if (!conversationResult.data || !sameSmsPhone(conversationResult.data.contact_phone, cleanTo)) {
            throw new SmsBoundaryError('Conversation is not owned or does not match the destination', 'CONVERSATION_REJECTED', 403);
          }
        }

        let smsRecordId: string | null = null;
        if (request.skip_db_insert && request.existing_message_id) {
          const existingResult = await supabaseAdmin
            .from('sms_messages')
            .select('id, to_number, from_number, direction, status')
            .eq('id', request.existing_message_id)
            .eq('organization_id', organizationId)
            .maybeSingle();
          if (existingResult.error) {
            throw new SmsBoundaryError(`Existing SMS lookup failed: ${existingResult.error.message}`, 'SMS_RECORD_LOOKUP_FAILED', 503);
          }
          const existing = existingResult.data;
          if (!existing || existing.direction !== 'outbound'
            || !sameSmsPhone(existing.to_number, cleanTo)
            || !sameSmsPhone(existing.from_number, cleanFrom)
            || !['pending', 'failed'].includes(existing.status)) {
            throw new SmsBoundaryError('Existing SMS record is not eligible for this send', 'SMS_RECORD_REJECTED', 403);
          }
          smsRecordId = existing.id;
        } else {
          const { data: smsRecord, error: insertError } = await supabaseAdmin
            .from('sms_messages')
            .insert({
              user_id: userId,
              organization_id: organizationId,
              to_number: cleanTo,
              from_number: cleanFrom,
              body: request.body,
              direction: 'outbound',
              status: 'pending',
              lead_id: request.lead_id || null,
              conversation_id: request.conversation_id || null,
              provider_type: provider,
              is_ai_generated: request.is_ai_generated ?? false,
              metadata: {
                organization_id: organizationId,
                campaign_id: request.campaign_id || null,
                safety_checked_at: new Date().toISOString(),
              },
            })
            .select('id')
            .maybeSingle();
          if (insertError || !smsRecord) {
            throw new SmsBoundaryError(`Failed to create SMS record: ${insertError?.message || 'no row returned'}`, 'SMS_RECORD_CREATE_FAILED', 503);
          }
          smsRecordId = smsRecord.id;
        }

        const updateMessageStatus = async (status: string, message: string | null, providerMessageId?: string | null) => {
          if (!smsRecordId) return;
          const updateResult = await supabaseAdmin.from('sms_messages')
            .update({
              status,
              error_message: message,
              ...(providerMessageId ? { provider_message_id: providerMessageId } : {}),
            })
            .eq('id', smsRecordId)
            .eq('organization_id', organizationId);
          if (updateResult.error) console.error('[SMS Messaging] Failed to persist message state:', updateResult.error);
        };

        if (provider === 'twilio') {
          await assertContactAllowed();
          const verifyUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(cleanFrom)}`;
          let verifyResponse: Response;
          try {
            verifyResponse = await fetch(verifyUrl, {
              headers: { 'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid!, twilioAuthToken!) },
              signal: AbortSignal.timeout(15_000),
            });
          } catch (error) {
            throw new SmsBoundaryError(`Twilio number verification failed: ${(error as Error).message}`, 'PROVIDER_VERIFICATION_UNAVAILABLE', 503, true);
          }
          const verifyData = await verifyResponse.json().catch(() => ({}));
          if (verifyResponse.status >= 500 || verifyResponse.status === 408) {
            throw new SmsBoundaryError(
              `Twilio number verification is unavailable (HTTP ${verifyResponse.status})`,
              'PROVIDER_VERIFICATION_UNAVAILABLE',
              503,
              true,
            );
          }
          const twilioNumber = verifyData.incoming_phone_numbers?.[0];
          if (!verifyResponse.ok || !twilioNumber) {
            throw new SmsBoundaryError('From number is not registered in the configured Twilio account', 'PROVIDER_NUMBER_NOT_OWNED', 403);
          }
          if (twilioNumber.capabilities?.sms === false) {
            throw new SmsBoundaryError('From number is not SMS capable in Twilio', 'PROVIDER_NUMBER_NOT_SMS_CAPABLE', 409);
          }
        }

        // Final database ownership/capability check immediately before the
        // durable attempt claim and physical provider mutation.
        const finalPhoneResult = await supabaseAdmin
          .from('phone_numbers')
          .select('id, number, provider, status, capabilities, allowed_uses, organization_id')
          .eq('organization_id', organizationId)
          .eq('status', 'active');
        if (finalPhoneResult.error) {
          throw new SmsBoundaryError(`Final from-number recheck failed: ${finalPhoneResult.error.message}`, 'FROM_NUMBER_RECHECK_FAILED', 503, true);
        }
        let finalPhoneRecord: ReturnType<typeof selectOwnedSmsNumber>;
        try {
          finalPhoneRecord = selectOwnedSmsNumber(
            (finalPhoneResult.data || []).filter((row: any) => sameSmsPhone(row.number, cleanFrom)),
            cleanFrom,
          );
        } catch (error) {
          throw new SmsBoundaryError((error as Error).message, 'FROM_NUMBER_RECHECK_REJECTED', 403);
        }
        if (finalPhoneRecord.id !== phoneRecord.id || finalPhoneRecord.provider !== provider) {
          throw new SmsBoundaryError('From-number provider ownership changed before send', 'FROM_NUMBER_CONTEXT_CHANGED', 409);
        }
        await assertContactAllowed();

        const bodySha256 = await sha256Hex(request.body);
        const claimResult = await supabaseAdmin.rpc('claim_sms_delivery_attempt', {
          p_idempotency_key: idempotencyKey,
          p_user_id: userId,
          p_organization_id: organizationId,
          p_sms_message_id: smsRecordId,
          p_provider: provider,
          p_from_number_normalized: cleanFrom,
          p_to_number_normalized: cleanTo,
          p_body_sha256: bodySha256,
          p_metadata: {
            lead_id: request.lead_id || null,
            campaign_id: request.campaign_id || null,
            conversation_id: request.conversation_id || null,
          },
        });
        if (claimResult.error) {
          throw new SmsBoundaryError(`SMS delivery claim failed: ${claimResult.error.message}`, 'DELIVERY_CLAIM_FAILED', 503, true);
        }
        const claim = Array.isArray(claimResult.data) ? claimResult.data[0] : claimResult.data;
        if (!claim?.attempt_id || typeof claim.claimed !== 'boolean') {
          throw new SmsBoundaryError('SMS delivery claim returned an invalid result', 'DELIVERY_CLAIM_FAILED', 503, true);
        }
        const claimDisposition = smsClaimDisposition(claim);
        if (claimDisposition !== 'send') {
          if (claimDisposition === 'accepted_replay') {
            if (smsRecordId !== claim.existing_sms_message_id) await updateMessageStatus('duplicate_suppressed', 'Replayed accepted idempotency key');
            result = {
              success: true,
              sent: true,
              status: 'sent',
              provider,
              message_id: claim.existing_sms_message_id,
              provider_message_id: claim.existing_provider_message_id,
              idempotent_replay: true,
            };
            break;
          }
          if (claimDisposition === 'reconcile') {
            if (smsRecordId !== claim.existing_sms_message_id) {
              await updateMessageStatus('duplicate_suppressed', 'Duplicate suppressed; original delivery requires reconciliation');
            }
            throw new SmsBoundaryError(
              'SMS delivery is already in progress or has unknown provider acceptance; reconciliation is required',
              'DELIVERY_RECONCILIATION_REQUIRED',
              409,
              false,
              true,
            );
          }
          await updateMessageStatus('failed', 'Prior attempt for this idempotency key was rejected');
          throw new SmsBoundaryError('SMS delivery was already rejected for this idempotency key', 'DELIVERY_ALREADY_REJECTED', 409);
        }

        const finalizeAttempt = async (
          status: 'accepted' | 'rejected' | 'acceptance_unknown',
          providerMessageId: string | null,
          lastError: string | null,
          providerResponse: unknown,
        ): Promise<boolean> => {
          const finalizeResult = await supabaseAdmin.rpc('finalize_sms_delivery_attempt', {
            p_attempt_id: claim.attempt_id,
            p_user_id: userId,
            p_status: status,
            p_provider_message_id: providerMessageId,
            p_last_error: lastError,
            p_provider_response: providerResponse && typeof providerResponse === 'object' ? providerResponse : null,
          });
          if (finalizeResult.error || finalizeResult.data !== true) {
            console.error('[SMS Messaging] Failed to finalize delivery attempt:', finalizeResult.error || finalizeResult.data);
            return false;
          }
          return true;
        };

        let providerResponse: Response;
        try {
          if (provider === 'telnyx') {
            providerResponse = await fetch('https://api.telnyx.com/v2/messages', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${telnyxApiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ from: cleanFrom, to: cleanTo, text: request.body, type: 'SMS' }),
              signal: AbortSignal.timeout(20_000),
            });
          } else {
            providerResponse = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`, {
              method: 'POST',
              headers: {
                'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid!, twilioAuthToken!),
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: new URLSearchParams({ To: cleanTo, From: cleanFrom, Body: request.body }).toString(),
              signal: AbortSignal.timeout(20_000),
            });
          }
        } catch (error) {
          const detail = `${provider} delivery response was not received: ${(error as Error).message}`;
          await finalizeAttempt('acceptance_unknown', null, detail, null);
          await updateMessageStatus('acceptance_unknown', detail);
          throw new SmsBoundaryError(detail, 'PROVIDER_ACCEPTANCE_UNKNOWN', 502, false, true);
        }

        let providerText: string;
        try {
          providerText = await providerResponse.text();
        } catch (error) {
          // The provider returned an HTTP response, but the response body could
          // not be read. At this point we cannot prove whether it accepted the
          // message, so quarantine the attempt instead of leaving it claimed or
          // encouraging an unsafe retry.
          const detail = `${provider} response body could not be read; acceptance is unknown: ${(error as Error).message}`;
          await finalizeAttempt('acceptance_unknown', null, detail, null);
          await updateMessageStatus('acceptance_unknown', detail);
          throw new SmsBoundaryError(detail, 'PROVIDER_ACCEPTANCE_UNKNOWN', 502, false, true);
        }
        let providerData: any = null;
        try {
          providerData = providerText ? JSON.parse(providerText) : null;
        } catch {
          providerData = null;
        }

        if (providerResponse.status >= 500 || providerResponse.status === 408) {
          const detail = `${provider} returned HTTP ${providerResponse.status}; acceptance is unknown`;
          await finalizeAttempt('acceptance_unknown', null, detail, providerData);
          await updateMessageStatus('acceptance_unknown', detail);
          throw new SmsBoundaryError(detail, 'PROVIDER_ACCEPTANCE_UNKNOWN', 502, false, true);
        }
        if (!providerResponse.ok) {
          const detail = provider === 'telnyx'
            ? providerData?.errors?.[0]?.detail || `Telnyx rejected the SMS (${providerResponse.status})`
            : providerData?.message || `Twilio rejected the SMS (${providerResponse.status})`;
          await finalizeAttempt('rejected', null, detail, providerData);
          await updateMessageStatus('failed', detail);
          throw new SmsBoundaryError(detail, 'PROVIDER_REJECTED', 422);
        }

        const providerMessageId = provider === 'telnyx' ? providerData?.data?.id : providerData?.sid;
        if (!providerData || !providerMessageId) {
          const detail = `${provider} returned an ambiguous success response without a message id`;
          await finalizeAttempt('acceptance_unknown', null, detail, providerData);
          await updateMessageStatus('acceptance_unknown', detail);
          throw new SmsBoundaryError(detail, 'PROVIDER_ACCEPTANCE_UNKNOWN', 502, false, true);
        }

        const ledgerFinalized = await finalizeAttempt('accepted', providerMessageId, null, providerData);
        const sentAt = new Date().toISOString();
        const sentUpdate = await supabaseAdmin.from('sms_messages')
          .update({ status: 'sent', provider_message_id: providerMessageId, sent_at: sentAt, error_message: null })
          .eq('id', smsRecordId)
          .eq('organization_id', organizationId);
        if (sentUpdate.error) {
          // The provider already accepted the physical message. Report that
          // truthfully and surface persistence degradation without inviting a
          // duplicate automatic send.
          console.error('[SMS Messaging] Provider accepted SMS but sent status persistence failed:', sentUpdate.error);
        }

        if (request.conversation_id) {
          const conversationUpdate = await supabaseAdmin.from('sms_conversations')
            .update({ last_message_at: sentAt })
            .eq('id', request.conversation_id)
            .eq('organization_id', organizationId);
          if (conversationUpdate.error) console.error('[SMS Messaging] Conversation update failed:', conversationUpdate.error);
        }

        result = {
          success: true,
          sent: true,
          status: 'sent',
          provider,
          message_id: smsRecordId,
          provider_message_id: providerMessageId,
          persistence_warning: sentUpdate.error?.message || null,
          reconciliation_required: !ledgerFinalized,
          retryable: false,
        };
        break;
      }

      case 'get_messages': {
        const limit = request.limit || 50;

        let organizationId: string;
        try {
          organizationId = await authorizeOrganizationContext(supabaseAdmin, userId, request.organization_id);
        } catch (error) {
          throw new SmsBoundaryError((error as Error).message, 'TENANT_CONTEXT_REJECTED', 403);
        }

        const { data: messages, error: fetchError } = await supabaseAdmin
          .from('sms_messages')
          .select('*')
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (fetchError) {
          console.error('[SMS Messaging] Fetch error:', fetchError);
          throw new Error('Failed to fetch messages');
        }

        result = { messages: messages || [] };
        break;
      }

      case 'get_available_numbers': {
        if (!twilioAccountSid || !twilioAuthToken) {
          throw new Error('Twilio credentials not configured');
        }

        let organizationId: string;
        try {
          organizationId = await authorizeOrganizationContext(supabaseAdmin, userId, request.organization_id);
        } catch (error) {
          throw new SmsBoundaryError((error as Error).message, 'TENANT_CONTEXT_REJECTED', 403);
        }

        const ownedNumbersResult = await supabaseAdmin
          .from('phone_numbers')
          .select('number')
          .eq('organization_id', organizationId)
          .eq('status', 'active')
          .eq('provider', 'twilio');
        if (ownedNumbersResult.error) {
          throw new SmsBoundaryError(`Owned number inventory failed: ${ownedNumbersResult.error.message}`, 'NUMBER_INVENTORY_FAILED', 503);
        }
        const ownedNumbers = ownedNumbersResult.data || [];
        if (ownedNumbers.length === 0) {
          result = { success: true, numbers: [] };
          break;
        }

        // Fetch provider state, but only return numbers already owned by the
        // authenticated organization in the local resource table.
        console.log('[SMS Messaging] Fetching available numbers from Twilio...');

        const twilioNumbersUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/IncomingPhoneNumbers.json?PageSize=100`;
        const twilioResponse = await fetch(twilioNumbersUrl, {
          headers: {
            'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken),
          },
        });

        if (!twilioResponse.ok) {
          console.error('[SMS Messaging] Failed to fetch Twilio numbers');
          throw new Error('Failed to fetch numbers from Twilio');
        }

        const twilioData = await twilioResponse.json();
        const twilioNumbers = twilioData.incoming_phone_numbers || [];

        const expectedWebhook = `${supabaseUrl}/functions/v1/twilio-sms-webhook`;

        // Fetch messaging services to check A2P registration
        console.log('[SMS Messaging] Checking A2P messaging services...');
        const messagingServiceNumbers: Set<string> = new Set();

        try {
          const messagingServicesUrl = `https://messaging.twilio.com/v1/Services`;
          const msResponse = await fetch(messagingServicesUrl, {
            headers: {
              'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken),
            },
          });

          if (msResponse.ok) {
            const msData = await msResponse.json();
            const services = msData.services || [];

            // For each messaging service, get the phone numbers assigned to it
            for (const service of services) {
              try {
                const phoneNumbersUrl = `https://messaging.twilio.com/v1/Services/${service.sid}/PhoneNumbers`;
                const pnResponse = await fetch(phoneNumbersUrl, {
                  headers: {
                    'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken),
                  },
                });

                if (pnResponse.ok) {
                  const pnData = await pnResponse.json();
                  const phoneNumbers = pnData.phone_numbers || [];
                  phoneNumbers.forEach((pn: any) => {
                    messagingServiceNumbers.add(pn.phone_number);
                  });
                }
              } catch (pnError) {
                console.error('[SMS Messaging] Error fetching service numbers:', pnError);
              }
            }
          }
          console.log('[SMS Messaging] Found', messagingServiceNumbers.size, 'numbers in messaging services (A2P registered)');
        } catch (msError) {
          console.error('[SMS Messaging] Error checking messaging services:', msError);
        }

        // Filter for SMS-capable numbers and include webhook + A2P status
        const smsCapableNumbers = twilioNumbers
          .filter((num: any) => num.capabilities?.sms === true
            && ownedNumbers.some((owned: any) => sameSmsPhone(owned.number, num.phone_number)))
          .map((num: any) => {
            const webhookConfigured = num.sms_url === expectedWebhook;
            const a2pRegistered = messagingServiceNumbers.has(num.phone_number);
            const isReady = webhookConfigured && a2pRegistered;

            return {
              number: num.phone_number,
              friendly_name: num.friendly_name,
              capabilities: num.capabilities,
              sms_url: num.sms_url,
              webhook_configured: webhookConfigured,
              a2p_registered: a2pRegistered,
              is_ready: isReady,
              status_details: !webhookConfigured && !a2pRegistered
                ? 'Needs webhook & A2P'
                : !webhookConfigured
                  ? 'Needs webhook'
                  : !a2pRegistered
                    ? 'Needs A2P registration'
                    : 'Ready',
            };
          });

        console.log('[SMS Messaging] Found', smsCapableNumbers.length, 'SMS-capable numbers in Twilio');
        console.log('[SMS Messaging] Ready numbers:', smsCapableNumbers.filter((n: any) => n.is_ready).length);

        result = { success: true, numbers: smsCapableNumbers };
        break;
      }

      case 'check_webhook_status': {
        if (!twilioAccountSid || !twilioAuthToken) {
          throw new Error('Twilio credentials not configured');
        }

        const phoneNumber = request.phoneNumber || request.from;
        if (!phoneNumber) {
          throw new Error('Phone number is required');
        }

        let organizationId: string;
        try {
          organizationId = await authorizeOrganizationContext(supabaseAdmin, userId, request.organization_id);
        } catch (error) {
          throw new SmsBoundaryError((error as Error).message, 'TENANT_CONTEXT_REJECTED', 403);
        }

        const ownedNumber = await loadOwnedActiveNumber(phoneNumber, organizationId, 'twilio');
        console.log('[SMS Messaging] Checking webhook status for owned number:', ownedNumber.id);

        const cleanNumber = canonicalSmsPhone(phoneNumber);
        const verifyUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(cleanNumber)}`;

        const verifyResponse = await fetch(verifyUrl, {
          headers: {
            'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken),
          },
        });

        const verifyData = await verifyResponse.json();

        if (!verifyResponse.ok || !verifyData.incoming_phone_numbers?.length) {
          throw new Error('Phone number not found in Twilio account');
        }

        const twilioNumber = verifyData.incoming_phone_numbers[0];
        const expectedWebhook = `${supabaseUrl}/functions/v1/twilio-sms-webhook`;

        result = {
          phone_number: twilioNumber.phone_number,
          current_sms_url: twilioNumber.sms_url,
          expected_webhook: expectedWebhook,
          webhook_configured: twilioNumber.sms_url === expectedWebhook,
        };
        break;
      }

      case 'configure_webhook': {
        if (!twilioAccountSid || !twilioAuthToken) {
          throw new Error('Twilio credentials not configured');
        }

        const phoneNumber = request.phoneNumber || request.from;
        if (!phoneNumber) {
          throw new Error('Phone number is required');
        }

        let organizationId: string;
        try {
          organizationId = await authorizeOrganizationContext(supabaseAdmin, userId, request.organization_id);
        } catch (error) {
          throw new SmsBoundaryError((error as Error).message, 'TENANT_CONTEXT_REJECTED', 403);
        }

        const ownedNumber = await loadOwnedActiveNumber(phoneNumber, organizationId, 'twilio');
        console.log('[SMS Messaging] Configuring webhook for owned number:', ownedNumber.id);

        const cleanNumber = canonicalSmsPhone(phoneNumber);

        // Get the phone number SID
        const findUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(cleanNumber)}`;

        const findResponse = await fetch(findUrl, {
          headers: {
            'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken),
          },
        });

        const findData = await findResponse.json();

        if (!findResponse.ok || !findData.incoming_phone_numbers?.length) {
          throw new Error('Phone number not found in Twilio account');
        }

        const twilioNumber = findData.incoming_phone_numbers[0];
        const webhookUrl = `${supabaseUrl}/functions/v1/twilio-sms-webhook`;

        // Revalidate local ownership/capability immediately before mutating the
        // provider configuration. A stale lookup cannot authorize this write.
        const finalOwnedNumber = await loadOwnedActiveNumber(phoneNumber, organizationId, 'twilio');
        if (finalOwnedNumber.id !== ownedNumber.id || !sameSmsPhone(twilioNumber.phone_number, phoneNumber)) {
          throw new SmsBoundaryError('Phone number ownership changed before webhook configuration', 'FROM_NUMBER_CONTEXT_CHANGED', 409);
        }

        // Update the webhook
        const updateUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/IncomingPhoneNumbers/${twilioNumber.sid}.json`;

        const updateResponse = await fetch(updateUrl, {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: `SmsUrl=${encodeURIComponent(webhookUrl)}&SmsMethod=POST`,
        });

        if (!updateResponse.ok) {
          const errorText = await updateResponse.text();
          console.error('[SMS Messaging] Failed to configure webhook:', errorText);
          throw new Error('Failed to configure SMS webhook in Twilio');
        }

        console.log('[SMS Messaging] Webhook configured successfully for:', phoneNumber);

        result = {
          success: true,
          phone_number: phoneNumber,
          webhook_url: webhookUrl,
          message: 'SMS webhook configured. Inbound messages will now trigger auto-replies.',
        };
        break;
      }

      default:
        throw new Error(`Unknown action: ${request.action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    console.error('[SMS Messaging] Error:', error);
    const boundaryError = error instanceof SmsBoundaryError ? error : null;
    return new Response(JSON.stringify({
      success: false,
      sent: false,
      error: errorMessage,
      code: boundaryError?.code || 'SMS_MESSAGING_ERROR',
      retryable: boundaryError?.retryable ?? false,
      reconciliation_required: boundaryError?.reconciliationRequired ?? false,
    }), {
      status: boundaryError?.status || 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
=== FILE: supabase/functions/ai-sms-processor/index.ts ===
/**
 * AI SMS Processor Edge Function
 *
 * Handles incoming SMS messages and generates AI-powered responses using:
 * - Retell AI integration for conversation management
 * - Lovable AI for image analysis and text generation
 * - Context management with summarization
 * - Reaction detection
 * - Double-texting prevention
 *
 * P5: every insert carries organization_id. The organization is resolved from
 * the explicit request.organizationId via authorizeOrganizationContext
 * (_shared/tenant-context.ts). The per-company AI-reply switch is read from
 * organizations.settings -> 'sms_ai_reply' (boolean, default true when absent).
 *
 * Removed: the AI_SMS_PROCESSOR_NOT_TENANT_CERTIFIED 503 gate that was at
 * material lines 30-52 (isAiSmsProcessorTenantCertified + early return).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { assertAcceptedSmsEnvelope, requireSmsIdempotencyKey } from '../sms-messaging/sms-boundary.ts';
import { authorizeOrganizationContext } from '../_shared/tenant-context.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WebhookMessage {
  From: string;
  To: string;
  Body: string;
  NumMedia?: string;
  MediaUrl0?: string;
  MediaContentType0?: string;
}

// Reads organizations.settings -> 'sms_ai_reply'. Absent means true.
async function isOrgAiReplyEnabled(supabaseAdmin: any, organizationId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('organizations')
    .select('settings')
    .eq('id', organizationId)
    .maybeSingle();
  if (error) {
    console.error('[AI SMS] organizations.settings lookup failed:', error);
    // Fail closed: if we cannot prove the switch is on, do not auto-reply.
    return false;
  }
  const value = data?.settings?.sms_ai_reply;
  if (typeof value === 'boolean') return value;
  return true;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    const retellApiKey = Deno.env.get('RETELL_AI_API_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured');
    }

    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY not configured - required for AI SMS responses');
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Parse request early so we can support internal calls with explicit user_id
    const request = await req.json();
    const action = request.action;

    const token = authHeader.replace('Bearer ', '');
    let userId: string | null = null;

    // Check if this is a service-to-service call (from workflow-executor)
    if (token === serviceRoleKey && request.userId) {
      // Internal service-to-service call
      userId = request.userId;
      console.log('[AI SMS] Internal call for user:', userId);
    } else {
      // Standard JWT-based auth (frontend calls)
      const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: 'Authentication failed' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      userId = user.id;
    }

    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'Authenticated user context is required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Explicit tenant context. No "first membership" fallback.
    let organizationId: string;
    try {
      organizationId = await authorizeOrganizationContext(supabaseAdmin, userId, request.organizationId);
    } catch (error) {
      return new Response(
        JSON.stringify({ success: false, error: (error as Error).message, code: 'TENANT_CONTEXT_REJECTED' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[AI SMS] Action:', action, 'User:', userId, 'Org:', organizationId);

    if (action === 'process_webhook') {
      // Handle incoming SMS from Twilio webhook
      const message: WebhookMessage = request.message;

      // Per-company AI-reply switch. If off, we still store the inbound message
      // but never generate a reply.
      const aiReplyEnabled = await isOrgAiReplyEnabled(supabaseAdmin, organizationId);

      // Check DNC list before auto-responding
      const { data: dncEntry } = await supabaseAdmin
        .from('dnc_list')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('phone_number', message.From)
        .maybeSingle();

      if (dncEntry) {
        console.log('[AI SMS] Skipping - contact is on DNC list:', message.From);
        return new Response(JSON.stringify({ success: false, skipped: true, error: 'Contact is on DNC list' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Get or create conversation
      const { data: conversation, error: convError } = await supabaseAdmin
        .from('sms_conversations')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('contact_phone', message.From)
        .maybeSingle();

      if (convError) throw convError;

      let conversationId = conversation?.id;

      if (!conversation) {
        const { data: newConv, error: createError } = await supabaseAdmin
          .from('sms_conversations')
          .insert({
            user_id: userId,
            organization_id: organizationId,
            contact_phone: message.From,
            last_from_number: message.To,
            last_message_at: new Date().toISOString(),
          })
          .select()
          .maybeSingle();

        if (createError) throw createError;
        if (!newConv) {
          throw new Error('SMS conversation insert returned no data');
        }
        conversationId = newConv.id;
      }

      // Check if it's a reaction (common patterns)
      const isReaction = await detectReaction(message.Body);

      // Check if message has image
      const hasImage = message.NumMedia && parseInt(message.NumMedia) > 0;
      let imageAnalysis = null;

      if (hasImage && message.MediaUrl0) {
        imageAnalysis = await analyzeImage(message.MediaUrl0, lovableApiKey);
      }

      // Save incoming message
      const { data: savedMessage, error: saveError } = await supabaseAdmin
        .from('sms_messages')
        .insert({
          user_id: userId,
          organization_id: organizationId,
          conversation_id: conversationId,
          to_number: message.To,
          from_number: message.From,
          body: message.Body,
          direction: 'inbound',
          status: 'received',
          has_image: hasImage,
          image_url: message.MediaUrl0 || null,
          image_analysis: imageAnalysis,
          is_reaction: isReaction.isReaction,
          reaction_type: isReaction.reactionType,
        })
        .select()
        .maybeSingle();

      if (saveError) throw saveError;

      // WORKFLOW AUTO-REPLY INTEGRATION
      // Check if this phone number is associated with an active workflow that has auto-reply enabled
      let workflowAutoReplySettings = null;
      let leadId = null;

      // First, find the lead by phone number
      const { data: lead } = await supabaseAdmin
        .from('leads')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('phone_number', message.From)
        .maybeSingle();

      leadId = lead?.id;

      if (leadId) {
        // Check if lead is in an active workflow with auto-reply enabled
        const { data: activeWorkflow } = await supabaseAdmin
          .from('lead_workflow_progress')
          .select(`
            id,
            campaign_workflows!inner(
              id,
              name,
              auto_reply_settings
            )
          `)
          .eq('lead_id', leadId)
          .eq('status', 'active')
          .not('campaign_workflows.auto_reply_settings', 'is', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (activeWorkflow?.campaign_workflows?.auto_reply_settings?.enabled) {
          workflowAutoReplySettings = activeWorkflow.campaign_workflows.auto_reply_settings;
          console.log('[AI SMS] Using workflow auto-reply settings from workflow:', activeWorkflow.campaign_workflows.name);
        }
      }

      // Get global AI settings (fallback if no workflow auto-reply)
      const { data: globalSettings } = await supabaseAdmin
        .from('ai_sms_settings')
        .select('*')
        .eq('organization_id', organizationId)
        .maybeSingle();

      // Determine which settings to use
      let settings = globalSettings;
      let shouldAutoRespond = false;

      if (workflowAutoReplySettings) {
        // Use workflow-specific auto-reply settings
        settings = {
          ...globalSettings,
          enabled: true,
          auto_response_enabled: true,
          custom_instructions: workflowAutoReplySettings.ai_instructions || globalSettings?.custom_instructions,
          response_delay: workflowAutoReplySettings.response_delay_seconds || globalSettings?.response_delay || 5,
          prevent_double_texting: globalSettings?.prevent_double_texting ?? true,
          double_text_delay_seconds: globalSettings?.double_text_delay_seconds || 60,
          // Add workflow-specific fields
          workflow_knowledge_base: workflowAutoReplySettings.knowledge_base,
          workflow_calendar_enabled: workflowAutoReplySettings.calendar_enabled,
          workflow_booking_link: workflowAutoReplySettings.booking_link,
          stop_on_human_reply: workflowAutoReplySettings.stop_on_human_reply ?? true,
        };
        shouldAutoRespond = true;
        console.log('[AI SMS] Auto-reply enabled via workflow settings');
      } else {
        // Use global settings
        shouldAutoRespond = globalSettings?.enabled && globalSettings?.auto_response_enabled;
        console.log('[AI SMS] Using global auto-reply settings');
      }

      // Per-company switch overrides everything.
      if (!aiReplyEnabled) {
        console.log('[AI SMS] Organization sms_ai_reply is false; skipping auto-reply');
        shouldAutoRespond = false;
      }

      if (shouldAutoRespond && !isReaction.isReaction) {
        // Check if we should stop auto-reply on human reply
        if (settings?.stop_on_human_reply) {
          // Check if there are any manual (non-AI) outbound messages from user in this conversation
          const { data: manualMessages } = await supabaseAdmin
            .from('sms_messages')
            .select('id, created_at')
            .eq('conversation_id', conversationId)
            .eq('organization_id', organizationId)
            .eq('direction', 'outbound')
            .eq('is_ai_generated', false)
            .order('created_at', { ascending: false })
            .limit(1);

          if (manualMessages && manualMessages.length > 0) {
            const lastManualMessage = manualMessages[0];
            // Configurable threshold - default 24 hours, can be overridden in workflow settings
            const pauseThresholdHours = settings.human_reply_pause_hours || 24;
            const timeSinceManual = (Date.now() - new Date(lastManualMessage.created_at).getTime()) / (1000 * 60); // minutes

            // If human replied within threshold, pause AI auto-reply for this conversation
            if (timeSinceManual < pauseThresholdHours * 60) {
              console.log(`[AI SMS] Skipping auto-reply - human replied manually within last ${pauseThresholdHours}h`);

              // Mark conversation to indicate AI is paused
              await supabaseAdmin
                .from('sms_conversations')
                .update({
                  ai_paused: true,
                  ai_pause_reason: 'human_reply_detected',
                  ai_paused_at: new Date().toISOString() // Use current timestamp when AI is paused
                })
                .eq('id', conversationId)
                .eq('organization_id', organizationId);

              return new Response(JSON.stringify({
                success: true,
                message: 'Processed without response - AI paused due to human reply'
              }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }
          }
        }

        // Check double-texting prevention
        const canSend = await checkDoubleTextingPrevention(
          supabaseAdmin,
          conversationId,
          organizationId,
          settings?.prevent_double_texting,
          settings?.double_text_delay_seconds
        );

        if (canSend) {
          // Generate AI response
          const response = await generateAIResponse(
            supabaseAdmin,
            lovableApiKey,
            retellApiKey,
            conversationId,
            userId,
            organizationId,
            message,
            imageAnalysis,
            settings
          );

          return new Response(JSON.stringify({
            success: true,
            message: 'Processed and responded',
            response
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      return new Response(JSON.stringify({
        success: true,
        message: 'Processed without response'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'generate_response') {
      // Manually generate AI response
      const { conversationId, prompt } = request;

      const { data: settings } = await supabaseAdmin
        .from('ai_sms_settings')
        .select('*')
        .eq('organization_id', organizationId)
        .maybeSingle();

      const response = await generateAIResponse(
        supabaseAdmin,
        lovableApiKey,
        retellApiKey,
        conversationId,
        userId,
        organizationId,
        { Body: prompt } as WebhookMessage,
        null,
        settings
      );

      return new Response(JSON.stringify({ success: true, response }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'generate_and_send') {
      // Generate AI SMS and send it (called from workflow executor)
      const { leadId, userId: targetUserId, fromNumber, context, prompt } = request;

      if (!targetUserId || targetUserId !== userId) {
        return new Response(JSON.stringify({ success: false, error: 'Target user does not match authenticated user' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      try {
        requireSmsIdempotencyKey(request.idempotency_key);
      } catch {
        return new Response(JSON.stringify({ success: false, sent: false, error: 'A stable idempotency_key is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Per-company switch also gates outbound AI sends.
      const aiReplyEnabled = await isOrgAiReplyEnabled(supabaseAdmin, organizationId);
      if (!aiReplyEnabled) {
        return new Response(JSON.stringify({ success: false, skipped: true, error: 'Organization sms_ai_reply is false' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log('[AI SMS] Generate and send for lead:', leadId, 'from:', fromNumber);

      // Get lead data
      const { data: lead, error: leadError } = await supabaseAdmin
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (leadError || !lead) {
        throw new Error('Lead not found: ' + (leadError?.message || 'Unknown'));
      }

      // Check DNC / do_not_call before sending
      if (lead.do_not_call) {
        console.log('[AI SMS] Skipping - lead has do_not_call flag:', leadId);
        return new Response(JSON.stringify({ success: false, skipped: true, error: 'Lead marked do_not_call' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Get or create conversation
      const { data: conversation, error: conversationError } = await supabaseAdmin
        .from('sms_conversations')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('contact_phone', lead.phone_number)
        .maybeSingle();
      if (conversationError) throw new Error(`Conversation lookup failed: ${conversationError.message}`);

      let conversationId = conversation?.id;

      if (!conversation) {
        const { data: newConv, error: createError } = await supabaseAdmin
          .from('sms_conversations')
          .insert({
            user_id: targetUserId,
            organization_id: organizationId,
            contact_phone: lead.phone_number,
            contact_name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || null,
            last_from_number: fromNumber || null,
            last_message_at: new Date().toISOString(),
          })
          .select()
          .maybeSingle();

        if (createError) throw createError;
        if (!newConv) throw new Error('Conversation creation returned no row');
        conversationId = newConv?.id;
      }

      // Get organization AI SMS settings
      const { data: settings, error: settingsError } = await supabaseAdmin
        .from('ai_sms_settings')
        .select('*')
        .eq('organization_id', organizationId)
        .maybeSingle();
      if (settingsError) throw new Error(`AI SMS settings lookup failed: ${settingsError.message}`);

      // Build context for AI
      const aiPrompt = prompt || settings?.custom_instructions || 'You are a helpful AI assistant reaching out to follow up.';

      // Add lead context
      const leadContext = `Lead info: ${lead.first_name || 'Unknown'} ${lead.last_name || ''}, Status: ${lead.status}, Phone: ${lead.phone_number}`;

      // Generate AI message
      const systemPrompt = `${aiPrompt}

LEAD CONTEXT:
${leadContext}

CONTEXT: ${context || 'follow_up'}

Generate a natural, conversational SMS message to this lead. Keep it brief (under 160 characters if possible), friendly, and include a clear call-to-action. Do not use placeholder brackets like [Name] - use the actual lead name.`;

      const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${lovableApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Generate a follow-up SMS for ${lead.first_name || 'this lead'}.` }
          ],
        }),
      });

      if (!aiResponse.ok) {
        const errorText = await aiResponse.text();
        console.error('[AI SMS] AI generation failed:', errorText);
        throw new Error(`AI generation failed: ${aiResponse.status}`);
      }

      const aiData = await aiResponse.json();
      const generatedMessage = aiData.choices?.[0]?.message?.content?.trim();

      if (!generatedMessage) {
        throw new Error('AI did not generate a message');
      }

      console.log('[AI SMS] Generated message:', generatedMessage);

      if (request.toNumber && request.toNumber.replace(/\D/g, '').slice(-10) !== String(lead.phone_number).replace(/\D/g, '').slice(-10)) {
        throw new Error('Requested AI SMS destination does not match the owned lead');
      }

      // One transport boundary owns every physical provider send. It performs
      // tenant, number ownership, stop-control, lead DNC, and user DNC checks
      // again immediately before calling Twilio or Telnyx.
      const transportResponse = await fetch(`${supabaseUrl}/functions/v1/sms-messaging`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'send_sms',
          user_id: targetUserId,
          organization_id: organizationId,
          campaign_id: typeof context?.campaignId === 'string' ? context.campaignId : undefined,
          idempotency_key: request.idempotency_key,
          lead_id: leadId,
          conversation_id: conversationId,
          to: lead.phone_number,
          from: fromNumber,
          body: generatedMessage,
          is_ai_generated: true,
        }),
      });

      let transportData: unknown;
      try {
        transportData = await transportResponse.json();
      } catch {
        throw new Error(`sms-messaging returned invalid JSON (HTTP ${transportResponse.status})`);
      }
      if (!transportResponse.ok) {
        const transportError = transportData && typeof transportData === 'object'
          ? (transportData as Record<string, unknown>).error
          : null;
        throw new Error(`SMS send failed: ${String(transportError || `HTTP ${transportResponse.status}`)}`);
      }
      assertAcceptedSmsEnvelope(transportData);

      return new Response(JSON.stringify({
        success: true,
        sent: true,
        message_id: transportData.message_id || null,
        message_sid: transportData.provider_message_id,
        generated_message: generatedMessage,
        provider: transportData.provider,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'convert_voice_to_sms') {
      // Convert voice agent prompt to SMS-optimized prompt
      const { voicePrompt, aggressionLevel, aggressionTone, campaignName, settings: conversionSettings } = request;

      console.log('[AI SMS] Converting voice prompt to SMS for campaign:', campaignName);

      const conversionPrompt = `You are an expert at converting AI voice agent scripts into SMS-optimized text agent scripts.

Given a voice agent script/prompt, convert it to work well for SMS text messaging while preserving the core personality and goals.

VOICE AGENT PROMPT TO CONVERT:
${voicePrompt}

CONVERSION GUIDELINES:
1. Remove all voice-specific instructions (tone of voice, pacing, interruption handling)
2. Replace call-specific phrases ("transfer to", "hold on", "let me check") with text-appropriate alternatives
3. Keep messages concise - SMS should be under 160 characters when possible
4. Convert verbal acknowledgments to brief text responses
5. Add clear call-to-action in each message
6. Include instructions for handling:
   - Appointment scheduling via text
   - Question handling with single-question-at-a-time approach
   - Follow-up timing based on lead responses
   - Emoji usage (sparingly)

FOLLOW-UP STYLE: ${aggressionLevel || 'balanced'}
${aggressionTone || ''}

TIMING CONFIGURATION:
- Initial follow-up after ${conversionSettings?.initialDelayHours || 12} hours of no response
- Subsequent follow-ups every ${conversionSettings?.followUpIntervalHours || 24} hours
- Maximum ${conversionSettings?.maxFollowUps || 5} follow-up attempts

Generate a complete SMS agent system prompt that:
1. Captures the original personality and objectives
2. Is optimized for text-based conversation
3. Includes the follow-up timing rules
4. Includes calendar/appointment handling instructions
5. Includes pipeline/status update awareness

Return ONLY the SMS agent prompt, no explanations or meta-commentary.`;

      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${lovableApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'user', content: conversionPrompt }
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[AI SMS] Conversion failed:', errorText);
        throw new Error(`AI conversion failed: ${response.status}`);
      }

      const data = await response.json();
      const smsPrompt = data.choices?.[0]?.message?.content;

      if (!smsPrompt) {
        throw new Error('Failed to generate SMS prompt');
      }

      console.log('[AI SMS] Successfully converted voice prompt to SMS');

      return new Response(JSON.stringify({ success: true, smsPrompt }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    throw new Error(`Unknown action: ${action}`);

  } catch (error) {
    console.error('[AI SMS] Error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Helper function to clean repeated text patterns from AI output
function cleanRepeatedText(text: string): string {
  if (!text || text.length < 50) return text;

  // Split by common separators (newlines, periods followed by space)
  const lines = text.split(/\n+/);

  // If we have very few lines, try splitting by sentences
  if (lines.length <= 2) {
    // Check for sentence-level repetition
    const sentences = text.split(/(?<=[.!?])\s+/);
    if (sentences.length > 3) {
      const uniqueSentences: string[] = [];
      const seenNormalized = new Set<string>();

      for (const sentence of sentences) {
        const normalized = sentence.toLowerCase().trim();
        if (normalized.length > 10 && !seenNormalized.has(normalized)) {
          seenNormalized.add(normalized);
          uniqueSentences.push(sentence);
        } else if (normalized.length <= 10) {
          uniqueSentences.push(sentence);
        }
      }

      if (uniqueSentences.length < sentences.length) {
        console.log('[AI SMS] Cleaned repeated sentences:', sentences.length, '->', uniqueSentences.length);
        return uniqueSentences.join(' ').trim();
      }
    }
    return text;
  }

  // Check for line-level repetition
  const uniqueLines: string[] = [];
  const seenNormalized = new Set<string>();

  for (const line of lines) {
    const normalized = line.toLowerCase().trim();
    if (normalized.length > 20 && seenNormalized.has(normalized)) {
      // Skip duplicate line
      continue;
    }
    if (normalized.length > 20) {
      seenNormalized.add(normalized);
    }
    uniqueLines.push(line);
  }

  if (uniqueLines.length < lines.length) {
    console.log('[AI SMS] Cleaned repeated lines:', lines.length, '->', uniqueLines.length);
    return uniqueLines.join('\n').trim();
  }

  return text;
}

// SMART REACTION DETECTION
// Only TRUE reactions (emoji-only, iMessage reactions) should skip AI responses
// Text responses like "ok", "thanks", "yes" should ALWAYS get responses
async function detectReaction(body: string): Promise<{ isReaction: boolean; reactionType: string | null }> {
  const trimmedBody = body.trim();

  // TRUE reactions are ONLY emoji-only or iMessage reaction patterns
  const reactions = [
    // Single emoji reactions
    { pattern: /^👍$/, type: 'thumbs_up' },
    { pattern: /^👎$/, type: 'thumbs_down' },
    { pattern: /^❤️$/, type: 'heart' },
    { pattern: /^😂$/, type: 'laugh' },
    { pattern: /^😮$/, type: 'wow' },
    { pattern: /^😢$/, type: 'sad' },
    { pattern: /^🙏$/, type: 'pray' },
    { pattern: /^👌$/, type: 'ok_hand' },
    { pattern: /^✅$/, type: 'check' },
    { pattern: /^🔥$/, type: 'fire' },
    { pattern: /^💯$/, type: 'hundred' },
    { pattern: /^👏$/, type: 'clap' },
    { pattern: /^🎉$/, type: 'celebration' },
    // iMessage reaction patterns
    { pattern: /^Liked ".*"$/i, type: 'imessage_like' },
    { pattern: /^Loved ".*"$/i, type: 'imessage_love' },
    { pattern: /^Emphasized ".*"$/i, type: 'imessage_emphasis' },
    { pattern: /^Laughed at ".*"$/i, type: 'imessage_laugh' },
    { pattern: /^Questioned ".*"$/i, type: 'imessage_question' },
    { pattern: /^Disliked ".*"$/i, type: 'imessage_dislike' },
  ];

  for (const reaction of reactions) {
    if (reaction.pattern.test(trimmedBody)) {
      console.log('[AI SMS] Detected true reaction:', reaction.type);
      return { isReaction: true, reactionType: reaction.type };
    }
  }

  // IMPORTANT: Text like "ok", "thanks", "yes", "no" are NOT reactions
  // They are meaningful responses that should get AI replies
  return { isReaction: false, reactionType: null };
}

async function analyzeImage(imageUrl: string, lovableApiKey: string): Promise<any> {
  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Analyze this image in detail. Describe what you see, any text present, and any relevant context that would be useful for understanding the sender\'s intent.'
              },
              {
                type: 'image_url',
                image_url: { url: imageUrl }
              }
            ]
          }
        ],
      }),
    });

    const data = await response.json();
    return {
      description: data.choices?.[0]?.message?.content || 'Unable to analyze image',
      analyzed_at: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[AI SMS] Image analysis failed:', error);
    return {
      description: 'Image analysis failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function checkDoubleTextingPrevention(
  supabase: any,
  conversationId: string,
  organizationId: string,
  enabled: boolean = true,
  delaySeconds: number = 300
): Promise<boolean> {
  if (!enabled) return true;

  const { data: recentMessages } = await supabase
    .from('sms_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .eq('organization_id', organizationId)
    .eq('direction', 'outbound')
    .eq('is_ai_generated', true)
    .order('created_at', { ascending: false })
    .limit(1);

  if (!recentMessages || recentMessages.length === 0) return true;

  const lastMessage = recentMessages[0];
  const timeSinceLastMessage = (Date.now() - new Date(lastMessage.created_at).getTime()) / 1000;

  return timeSinceLastMessage >= delaySeconds;
}

async function generateAIResponse(
  supabase: any,
  lovableApiKey: string,
  retellApiKey: string | undefined,
  conversationId: string,
  userId: string,
  organizationId: string,
  incomingMessage: WebhookMessage,
  imageAnalysis: any,
  settings: any
): Promise<string> {
  // Get conversation history with context window
  const contextWindow = settings?.context_window_size || 20;
  const { data: messages } = await supabase
    .from('sms_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(contextWindow);

  // Build context for AI
  const conversationHistory = (messages || [])
    .reverse()
    .map((msg: any) => ({
      role: msg.direction === 'inbound' ? 'user' : 'assistant',
      content: msg.body + (msg.image_analysis ? `\n[Image: ${msg.image_analysis.description}]` : '')
    }));

  // Add current message
  let currentContent = incomingMessage.Body;
  if (imageAnalysis) {
    currentContent += `\n[User sent an image: ${imageAnalysis.description}]`;
  }

  conversationHistory.push({
    role: 'user',
    content: currentContent
  });

  // Build system prompt with workflow-specific knowledge if available
  const customInstructions = settings?.custom_instructions || settings?.ai_personality || 'professional and helpful';

  // Add workflow-specific knowledge base if provided
  let knowledgeBase = '';
  if (settings?.workflow_knowledge_base) {
    knowledgeBase = `\n\nKNOWLEDGE BASE:\n${settings.workflow_knowledge_base}`;
    console.log('[AI SMS] Using workflow-specific knowledge base');
  }

  // Add calendar/booking capabilities if enabled
  let calendarInfo = '';
  let availableSlots: string[] = [];

  if (settings?.workflow_calendar_enabled || settings?.calendar_enabled || settings?.enable_calendar_integration) {
    // Fetch real availability from calendar-integration function
    try {
      console.log('[AI SMS] Fetching calendar availability for user:', userId);

      const calendarResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/calendar-integration`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'get_available_slots',
          user_id: userId,
          organization_id: organizationId,
          duration_minutes: 30,
        }),
      });

      if (calendarResponse.ok) {
        const calendarData = await calendarResponse.json();
        if (calendarData.available_slots && calendarData.available_slots.length > 0) {
          availableSlots = calendarData.available_slots.slice(0, 5);
          console.log('[AI SMS] Got available slots:', availableSlots);
        }
      }
    } catch (calErr) {
      console.error('[AI SMS] Calendar fetch error:', calErr);
    }

    calendarInfo = `\n\nIMPORTANT CALENDAR/APPOINTMENT CAPABILITIES:
- You CAN schedule appointments directly - do NOT share any booking links
- If the user asks about availability, tell them: "${availableSlots.length > 0 ? `I have openings at: ${availableSlots.join(', ')}` : 'Let me check the calendar for you.'}"
- When they want to book a specific time, confirm it and say you'll schedule it
- If they mention times like "tomorrow at 2pm" or "next Monday", acknowledge and confirm the booking
- NEVER mention Cal.com or any external booking system - you book directly`;
    console.log('[AI SMS] Calendar booking enabled with real availability');
  }

  const systemPrompt = `You are an AI SMS assistant with the following personality: ${customInstructions}${knowledgeBase}${calendarInfo}

Keep responses concise and appropriate for SMS (under 300 characters when possible). Be natural and conversational.
If the user sends an image, acknowledge it and respond appropriately based on the image analysis.
DO NOT include any special characters or formatting that may not work well in SMS.`;

  // Check if message is about appointments/scheduling
  const appointmentKeywords = ['appointment', 'schedule', 'book', 'available', 'meet', 'calendar', 'time slot', 'when can', 'what time', 'set up', 'come by'];
  const isAppointmentRelated = appointmentKeywords.some(kw =>
    currentContent.toLowerCase().includes(kw)
  );

  // Check if message is about RESCHEDULING (change existing appointment)
  const rescheduleKeywords = ['reschedule', 'change time', 'move it', 'switch it', 'different time', 'different day', 'change the time', 'change the day', 'move my', 'can you change', 'can we change', 'make it'];
  const isRescheduleRequest = rescheduleKeywords.some(kw =>
    currentContent.toLowerCase().includes(kw)
  );

  // Handle RESCHEDULE requests - actually update the calendar
  if (isRescheduleRequest && settings?.enabled) {
    try {
      console.log('[AI SMS] Detected reschedule request:', currentContent);

      // Parse new date/time from message
      const dateMatch = currentContent.match(/(\d{1,2}[/-]\d{1,2}[/-]?\d{0,4}|\btomorrow\b|\btoday\b|\bnext\s+\w+day\b|\bmonday\b|\btuesday\b|\bwednesday\b|\bthursday\b|\bfriday\b|\bsaturday\b|\bsunday\b)/i);
      const timeMatch = currentContent.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);

      // Get lead info and find their upcoming appointment
      const { data: leadForReschedule } = await supabase
        .from('leads')
        .select('id, first_name, last_name, phone_number')
        .eq('organization_id', organizationId)
        .eq('phone_number', incomingMessage.From)
        .maybeSingle();

      if (leadForReschedule && (dateMatch || timeMatch)) {
        console.log('[AI SMS] Attempting reschedule for lead:', leadForReschedule.id, 'to:', dateMatch?.[0], timeMatch?.[0]);

        const rescheduleResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/calendar-integration`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'reschedule_appointment',
            user_id: userId,
            organization_id: organizationId,
            caller_phone: incomingMessage.From,
            lead_id: leadForReschedule.id,
            date: dateMatch?.[0],
            time: timeMatch?.[0],
            new_date: dateMatch?.[0],
            new_time: timeMatch?.[0],
          }),
        });

        if (rescheduleResponse.ok) {
          const rescheduleData = await rescheduleResponse.json();
          console.log('[AI SMS] Reschedule response:', rescheduleData);

          if (rescheduleData.success) {
            // Add confirmation to context so AI confirms the reschedule
            conversationHistory.unshift({
              role: 'system',
              content: `IMPORTANT: You just successfully RESCHEDULED the appointment. ${rescheduleData.message || 'The appointment has been moved to the new time.'}. Confirm this to the user in a friendly way and mention you've sent an updated calendar invite.`
            });
          } else if (rescheduleData.message) {
            // Calendar function returned a message (like asking for more info)
            conversationHistory.unshift({
              role: 'system',
              content: `Calendar system response: ${rescheduleData.message}. Relay this to the user naturally.`
            });
          }
        } else {
          console.error('[AI SMS] Reschedule API failed:', await rescheduleResponse.text());
        }
      } else if (!dateMatch && !timeMatch) {
        // User wants to reschedule but didn't provide new time
        conversationHistory.unshift({
          role: 'system',
          content: `The user wants to reschedule their appointment but hasn't specified when. Ask them what day and time would work better. Available slots: ${availableSlots.length > 0 ? availableSlots.join(', ') : 'flexible'}`
        });
      }
    } catch (e) {
      console.error('[AI SMS] Reschedule error:', e);
    }
  }
  // Handle NEW appointment booking
  else if (isAppointmentRelated && settings?.enabled) {
    try {
      // Try to parse date/time from message for booking
      const dateMatch = currentContent.match(/(\d{1,2}[/-]\d{1,2}[/-]?\d{0,4}|\btomorrow\b|\btoday\b|\bnext\s+\w+day\b|\bmonday\b|\btuesday\b|\bwednesday\b|\bthursday\b|\bfriday\b|\bsaturday\b|\bsunday\b)/i);
      const timeMatch = currentContent.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);

      if (dateMatch && timeMatch) {
        // User provided both date and time - attempt to book!
        console.log('[AI SMS] User wants to book:', dateMatch[0], timeMatch[0]);

        // Get lead info for booking (lookup by phone number)
        const { data: leadForBooking } = await supabase
          .from('leads')
          .select('id, first_name, last_name, email, phone_number')
          .eq('organization_id', organizationId)
          .eq('phone_number', incomingMessage.From)
          .maybeSingle();

        if (leadForBooking) {
          const bookingResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/calendar-integration`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              action: 'book_appointment',
              user_id: userId,
              organization_id: organizationId,
              date: dateMatch[0],
              time: timeMatch[0],
              attendee_name: `${leadForBooking.first_name || ''} ${leadForBooking.last_name || ''}`.trim(),
              attendee_email: leadForBooking.email,
              attendee_phone: leadForBooking.phone_number,
              duration_minutes: 30,
            }),
          });

          if (bookingResponse.ok) {
            const bookingData = await bookingResponse.json();
            if (bookingData.success) {
              console.log('[AI SMS] Successfully booked appointment:', bookingData);
              // Add booking confirmation to context
              conversationHistory.unshift({
                role: 'system',
                content: `IMPORTANT: You just successfully booked an appointment for ${bookingData.message || `${dateMatch[0]} at ${timeMatch[0]}`}. Confirm this to the user in a friendly way.`
              });
            }
          }
        }
      } else if (dateMatch || timeMatch) {
        // Partial info - ask for the missing piece
        const calendarContext = `
The user is asking about appointments. They mentioned ${dateMatch ? `date: ${dateMatch[0]}` : ''}${timeMatch ? ` time: ${timeMatch[0]}` : ''}.
${!dateMatch ? 'Ask what day works for them.' : ''}${!timeMatch ? 'Ask what time works for them.' : ''}
Available slots: ${availableSlots.length > 0 ? availableSlots.join(', ') : 'flexible'}`;

        conversationHistory.unshift({
          role: 'system',
          content: calendarContext
        });
      } else {
        // General scheduling inquiry - share available slots
        conversationHistory.unshift({
          role: 'system',
          content: `The user is asking about scheduling. Available slots: ${availableSlots.length > 0 ? availableSlots.join(', ') : 'Ask them for their preferred date and time.'}`
        });
      }
    } catch (e) {
      console.error('[AI SMS] Calendar booking error:', e);
    }
  }

  // Get lead info for context
  let leadId: string | null = null;
  const { data: leadData } = await supabase
    .from('leads')
    .select('id, first_name, last_name')
    .eq('organization_id', organizationId)
    .eq('phone_number', incomingMessage.From)
    .maybeSingle();
  leadId = leadData?.id || null;

  try {
    const aiProvider = settings?.ai_provider || 'lovable';

    if (aiProvider === 'retell') {
      console.log('[AI SMS] Retell SMS provider not supported yet, falling back to Lovable AI');
    }

    // Use Lovable AI (default)
    console.log('[AI SMS] Using Lovable AI for response generation');

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          ...conversationHistory
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`AI generation failed: ${response.status}`);
    }

    const data = await response.json();
    let generatedContent = data.choices?.[0]?.message?.content || 'I apologize, but I was unable to generate a response.';

    // Clean up any repeated text patterns (AI sometimes repeats itself)
    generatedContent = cleanRepeatedText(generatedContent);

    return generatedContent;
  } catch (error) {
    console.error('[AI SMS] Response generation failed:', error);
    throw error;
  }
}