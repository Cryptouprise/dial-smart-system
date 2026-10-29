-- LIVE-ONLY migration pulled from supabase_migrations.schema_migrations on 2026-10-28 (never committed to repo).
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
