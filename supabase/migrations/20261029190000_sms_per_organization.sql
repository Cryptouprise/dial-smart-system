-- P5 (Fable 2026-10-29): texting becomes per-company. The four SMS tables get organization_id, are backfilled from
-- what can be proven (lead -> our phone number -> conversation -> the user's company), get the same two phase-1
-- triggers and the same four "Company ..." policies as the eight phase-1 tables. Additive only: the per-user policies
-- ("Users can view/create/update/delete their own ...", LIVE-SCHEMA.md:30-33) stay and OR with the new ones.
-- Style follows 20261029142121_phase1_org_scope.sql: no BEGIN/COMMIT (the migration runner wraps it), DO-block loops,
-- SECURITY INVOKER guard already in place from 20261029150000_phase1_scope_guard_fix.sql (not redefined here).
--
-- Live facts relied on (LIVE-SCHEMA.md, UPDATE section 10/29): phone_numbers.organization_id NOT NULL; leads.organization_id
-- NOT NULL; organization_users(organization_id, user_id, role); public.default_organization_for_user(uuid) exists
-- (SECURITY DEFINER, executable by service_role/postgres); public.set_organization_from_user() and
-- public.enforce_organization_scope() exist; user_in_organization(uuid) and is_org_admin(uuid) take ONE argument.
-- sms_conversations has NO lead_id (our number is last_from_number); sms_messages has lead_id, from_number, to_number, direction.

-- =========================================================================================================
-- 1. organization_id on the four SMS tables + indexes
-- =========================================================================================================
ALTER TABLE public.sms_conversations   ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT;
ALTER TABLE public.sms_messages        ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT;
ALTER TABLE public.sms_context_history ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT;
ALTER TABLE public.ai_sms_settings     ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_sms_conversations_organization_id   ON public.sms_conversations(organization_id);
CREATE INDEX IF NOT EXISTS idx_sms_messages_organization_id        ON public.sms_messages(organization_id);
CREATE INDEX IF NOT EXISTS idx_sms_context_history_organization_id ON public.sms_context_history(organization_id);
CREATE INDEX IF NOT EXISTS idx_ai_sms_settings_organization_id     ON public.ai_sms_settings(organization_id);
-- The two lookups the patched functions run on every inbound text / inbox load.
CREATE INDEX IF NOT EXISTS idx_sms_conversations_org_contact       ON public.sms_conversations(organization_id, contact_phone);
CREATE INDEX IF NOT EXISTS idx_sms_messages_org_created            ON public.sms_messages(organization_id, created_at DESC);

-- =========================================================================================================
-- 2. Backfill (each step only touches rows still NULL; order matters: proven sources first, user default last)
--    Phone matching normalizes to the last 10 digits (regexp_replace(x,'[^0-9]','','g')) because phone_numbers.number
--    and Twilio E.164 values differ only in the +1 prefix. A digit string owned by MORE THAN ONE company is skipped
--    (HAVING count(DISTINCT organization_id) = 1) - never guess a tenant.
-- =========================================================================================================

-- 2a. sms_messages from the lead it was sent to / received from.
-- expect: every row with a lead_id whose lead has a company gets that company.
UPDATE public.sms_messages m
   SET organization_id = l.organization_id
  FROM public.leads l
 WHERE m.organization_id IS NULL
   AND m.lead_id = l.id
   AND l.organization_id IS NOT NULL;

-- 2b. sms_messages from OUR number (from_number on outbound, to_number on inbound).
-- expect: rows whose our-side number is a phone_numbers row of exactly one company get that company.
WITH owned AS (
  SELECT right(regexp_replace(number, '[^0-9]', '', 'g'), 10) AS digits,
         min(organization_id::text)::uuid                   AS organization_id
    FROM public.phone_numbers
   WHERE organization_id IS NOT NULL
   GROUP BY 1
  HAVING count(DISTINCT organization_id) = 1
)
UPDATE public.sms_messages m
   SET organization_id = o.organization_id
  FROM owned o
 WHERE m.organization_id IS NULL
   AND o.digits = right(regexp_replace(CASE WHEN m.direction = 'outbound' THEN m.from_number ELSE m.to_number END, '[^0-9]', '', 'g'), 10);

-- 2c. sms_messages where the direction column disagrees with the numbers: match either side.
-- expect: a handful at most (rows whose direction was stored wrong); usually 0.
WITH owned AS (
  SELECT right(regexp_replace(number, '[^0-9]', '', 'g'), 10) AS digits,
         min(organization_id::text)::uuid                   AS organization_id
    FROM public.phone_numbers
   WHERE organization_id IS NOT NULL
   GROUP BY 1
  HAVING count(DISTINCT organization_id) = 1
)
UPDATE public.sms_messages m
   SET organization_id = o.organization_id
  FROM owned o
 WHERE m.organization_id IS NULL
   AND o.digits IN (right(regexp_replace(m.from_number, '[^0-9]', '', 'g'), 10),
                    right(regexp_replace(m.to_number,   '[^0-9]', '', 'g'), 10));

-- 2d. sms_conversations from the company of its messages (only when all its messages agree).
-- expect: every conversation that has at least one message resolved above gets that company.
UPDATE public.sms_conversations c
   SET organization_id = x.organization_id
  FROM (SELECT conversation_id, min(organization_id::text)::uuid AS organization_id
          FROM public.sms_messages
         WHERE conversation_id IS NOT NULL AND organization_id IS NOT NULL
         GROUP BY conversation_id
        HAVING count(DISTINCT organization_id) = 1) x
 WHERE c.organization_id IS NULL
   AND c.id = x.conversation_id;

-- 2e. sms_conversations from our number recorded on the thread (last_from_number).
-- expect: conversations with no messages but a last_from_number owned by exactly one company.
WITH owned AS (
  SELECT right(regexp_replace(number, '[^0-9]', '', 'g'), 10) AS digits,
         min(organization_id::text)::uuid                   AS organization_id
    FROM public.phone_numbers
   WHERE organization_id IS NOT NULL
   GROUP BY 1
  HAVING count(DISTINCT organization_id) = 1
)
UPDATE public.sms_conversations c
   SET organization_id = o.organization_id
  FROM owned o
 WHERE c.organization_id IS NULL
   AND c.last_from_number IS NOT NULL
   AND o.digits = right(regexp_replace(c.last_from_number, '[^0-9]', '', 'g'), 10);

-- 2f. sms_conversations from the owner's default company (single membership, or owner/admin membership if several).
-- expect: the remainder (live: 1 org / 1 user / 1 membership, so this resolves everything left).
UPDATE public.sms_conversations
   SET organization_id = public.default_organization_for_user(user_id)
 WHERE organization_id IS NULL;

-- 2g. sms_messages that still lack a company inherit their conversation's.
-- expect: rows without lead_id whose numbers did not match phone_numbers but that sit in a resolved thread.
UPDATE public.sms_messages m
   SET organization_id = c.organization_id
  FROM public.sms_conversations c
 WHERE m.organization_id IS NULL
   AND m.conversation_id = c.id
   AND c.organization_id IS NOT NULL;

-- 2h. sms_messages from the owner's default company (last resort).
-- expect: 0 rows left NULL after this on the live data set.
UPDATE public.sms_messages
   SET organization_id = public.default_organization_for_user(user_id)
 WHERE organization_id IS NULL;

-- 2i. sms_context_history from its conversation, else the owner's default company.
-- expect: all rows resolved.
UPDATE public.sms_context_history h
   SET organization_id = c.organization_id
  FROM public.sms_conversations c
 WHERE h.organization_id IS NULL
   AND h.conversation_id = c.id
   AND c.organization_id IS NOT NULL;
UPDATE public.sms_context_history
   SET organization_id = public.default_organization_for_user(user_id)
 WHERE organization_id IS NULL;

-- 2j. ai_sms_settings (one row per user) from the owner's default company.
-- expect: all rows resolved.
UPDATE public.ai_sms_settings
   SET organization_id = public.default_organization_for_user(user_id)
 WHERE organization_id IS NULL;

-- 2k. Report. -- expect: null_org = 0 on all four rows. Rows with null_org > 0 belong to users with NO membership;
--     they stay readable through the untouched per-user policies and must be assigned by hand before any NOT NULL step.
SELECT 'sms_conversations'   AS table_name, count(*) FILTER (WHERE organization_id IS NULL) AS null_org, count(*) AS total FROM public.sms_conversations
UNION ALL
SELECT 'sms_messages',        count(*) FILTER (WHERE organization_id IS NULL), count(*) FROM public.sms_messages
UNION ALL
SELECT 'sms_context_history', count(*) FILTER (WHERE organization_id IS NULL), count(*) FROM public.sms_context_history
UNION ALL
SELECT 'ai_sms_settings',     count(*) FILTER (WHERE organization_id IS NULL), count(*) FROM public.ai_sms_settings;

-- =========================================================================================================
-- 3. Phase-1 triggers extended to the four SMS tables (same names, same functions, same DO-loop pattern).
--    set_organization_from_user: BEFORE INSERT, fills organization_id from the user's membership when NULL
--    (keeps any caller that forgets the column working). tenant_scope_guard: BEFORE INSERT OR UPDATE, browser roles may
--    only write a company they belong to and may never move a row to another company; service_role/postgres exempt.
--    Alphabetical trigger order guarantees set_... runs before tenant_... .
-- =========================================================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sms_conversations','sms_messages','sms_context_history','ai_sms_settings'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_organization_from_user ON public.%I', t);
    EXECUTE format('CREATE TRIGGER set_organization_from_user BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_organization_from_user()', t);
    EXECUTE format('DROP TRIGGER IF EXISTS tenant_scope_guard ON public.%I', t);
    EXECUTE format('CREATE TRIGGER tenant_scope_guard BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_organization_scope()', t);
  END LOOP;
END $$;

-- =========================================================================================================
-- 4. Company-membership policies ADDED beside the per-user ones (exact phase-1 predicates; permissive => OR).
--    Nothing is dropped: "Users can view/create/update/delete their own conversations", "Users can view/create/update
--    their own messages", "Users can view/create their own context", "Users can view/create/update their own settings"
--    keep working exactly as today.
-- =========================================================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sms_conversations','sms_messages','sms_context_history','ai_sms_settings'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Company members can view" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Company members can insert" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Company members can update" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Company admins can delete" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Company members can view"   ON public.%I FOR SELECT USING (organization_id IS NOT NULL AND public.user_in_organization(organization_id))', t);
    EXECUTE format('CREATE POLICY "Company members can insert" ON public.%I FOR INSERT WITH CHECK (organization_id IS NOT NULL AND public.user_in_organization(organization_id))', t);
    EXECUTE format('CREATE POLICY "Company members can update" ON public.%I FOR UPDATE USING (organization_id IS NOT NULL AND public.user_in_organization(organization_id)) WITH CHECK (organization_id IS NOT NULL AND public.user_in_organization(organization_id))', t);
    EXECUTE format('CREATE POLICY "Company admins can delete"  ON public.%I FOR DELETE USING (organization_id IS NOT NULL AND public.is_org_admin(organization_id))', t);
  END LOOP;
END $$;

-- =========================================================================================================
-- 5. Per-company AI-reply switch lives in organizations.settings (jsonb). No new column; documented on the column.
--    There is no existing comment on organizations.settings (checked supabase/migrations, 10/29), so this does not
--    overwrite anything; the packs key from 20261029010000_industry_packs.sql is restated so the comment stays complete.
--    Read by twilio-sms-webhook and ai-sms-processor before generating an AI reply: false => store the inbound text,
--    send nothing. Absent or any other value => replies allowed. Example: UPDATE public.organizations
--    SET settings = coalesce(settings,'{}') || '{"sms_ai_reply": false}' WHERE id = '<org>';
-- =========================================================================================================
COMMENT ON COLUMN public.organizations.settings IS
  'Free-form per-company settings (jsonb). Known keys: "packs" (array of industry pack ids, see 20261029010000_industry_packs.sql); "sms_ai_reply" (boolean, default true when absent) - when false the company''s inbound texts are stored but no AI auto-reply is generated or sent (twilio-sms-webhook, ai-sms-processor).';
