-- Close two cross-tenant WRITE leaks surfaced by the full RLS audit and
-- confirmed with live rolled-back probes. Both are the same class of bug the
-- billing layer had: a permissive FOR ALL policy whose WITH CHECK silently
-- defaults to its (too-weak) USING expression, and because permissive policies
-- OR their checks together, the weak branch neuters the strict one on writes.
--
-- ---------------------------------------------------------------------------
-- 1. campaign_leads  (medium — cross-tenant write + unauthorized dialing)
-- ---------------------------------------------------------------------------
-- "Users can manage their own campaign leads" was FOR ALL with USING =
-- campaign-ownership and no WITH CHECK (so its write-check = campaign-ownership
-- only). The dedicated INSERT policy correctly required BOTH campaign- AND
-- lead-ownership, but the two are OR'd, so the effective INSERT check collapsed
-- to campaign-ownership. Result: an authenticated tenant B can enroll a victim
-- tenant A's private lead (by its UUID) into B's own campaign. B cannot even
-- SELECT that lead, but the service-role dispatcher reads campaign_leads by
-- campaign_id only and would then dial the victim's number under B's campaign,
-- leaking the phone number / transcript / disposition and creating unwanted-
-- dialing (TCPA) exposure. The UPDATE path was likewise repointable.
--
-- Fix: drop the redundant FOR ALL policy (the four per-command policies already
-- cover SELECT/INSERT/UPDATE/DELETE) and give UPDATE a WITH CHECK that requires
-- lead-ownership too. The app only SELECTs/INSERTs/DELETEs this table, so no
-- legitimate path is affected; a real owner adding their own lead to their own
-- campaign still passes.

DROP POLICY IF EXISTS "Users can manage their own campaign leads" ON public.campaign_leads;
DROP POLICY IF EXISTS "Users can update their campaign leads" ON public.campaign_leads;

CREATE POLICY "Users can update their campaign leads"
  ON public.campaign_leads
  FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_leads.campaign_id AND c.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.leads l WHERE l.id = campaign_leads.lead_id AND l.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_leads.campaign_id AND c.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.leads l WHERE l.id = campaign_leads.lead_id AND l.user_id = auth.uid())
  );

-- INSERT policy "Users can add their own leads to their campaigns" is retained
-- unchanged; with the FOR ALL gone it is no longer OR'd with a weaker check and
-- now enforces (campaign owned AND lead owned) as intended.
-- SELECT / DELETE policies (campaign-ownership) are retained unchanged.

-- ---------------------------------------------------------------------------
-- 2. sequence_templates  (shared-resource poisoning across all tenants)
-- ---------------------------------------------------------------------------
-- "Users manage own templates" was FOR ALL with USING =
-- (auth.uid() = user_id OR is_system_template = true) and no WITH CHECK. The
-- is_system_template branch is satisfied with no dependence on ownership, so any
-- authenticated user could INSERT a row flagged is_system_template = true (which
-- every tenant then sees and can use), and UPDATE or DELETE the real seeded
-- system templates. A malicious "system template" can inject arbitrary call/SMS
-- steps into other tenants' sequences. Confirmed live: plant, tamper, and delete
-- all succeeded as a non-owner.
--
-- Fix: system templates are platform-provided and seeded by service_role (which
-- bypasses RLS), and NO client code writes this table. So restrict all tenant
-- writes to the caller's OWN, non-system rows. Reading system + own templates is
-- unchanged.

DROP POLICY IF EXISTS "Users manage own templates" ON public.sequence_templates;

CREATE POLICY "Users insert own non-system templates"
  ON public.sequence_templates
  FOR INSERT
  WITH CHECK (auth.uid() = user_id AND COALESCE(is_system_template, false) = false);

CREATE POLICY "Users update own non-system templates"
  ON public.sequence_templates
  FOR UPDATE
  USING (auth.uid() = user_id AND COALESCE(is_system_template, false) = false)
  WITH CHECK (auth.uid() = user_id AND COALESCE(is_system_template, false) = false);

CREATE POLICY "Users delete own non-system templates"
  ON public.sequence_templates
  FOR DELETE
  USING (auth.uid() = user_id AND COALESCE(is_system_template, false) = false);

-- SELECT policy "Users see system and own templates" is retained unchanged.
