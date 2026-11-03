# gap-ads

- status: completed
- tldr: Ads gap: 0% built. No Meta/Google Ads, pixel, or ad tables anywhere. Closest assets: bulk-lead-import + LeadImportDialog. Cheapest step: FB Lead Ads webhook into existing leads table.

ADS GAP: 0% built. No Meta/Facebook Ads, Google Ads, ad account, creative, pixel, or budget code exists anywhere in dial-smart-system. 'campaign' in this repo = dialing/outbound campaigns, never advertising. 'facebook' appears only as tag examples (SMART_LISTS_GUIDE.md:84,91), a scoring weight (ai-autonomous-engine/index.ts:4517), a test fixture (DoorToDoorEnroll.test.ts:192-205), a robots.txt UA, and a SQL comment. No ad SDK in package.json:75-168; no ad tables in migrations; no Ad* components in src/. Closest adjacent assets: LeadImportDialog.tsx / LeadUpload.tsx (CSV lead ingest), bulk-lead-import edge fn (accepts lead_source+tags, 5000/batch dedup - best reuse target), demo-funnel-track (landing events, but NO utm/fbclid/gclid/pixel), content/ folder (97 SEO articles = marketing content, not ad creative). Cheapest path: full ad buying = BUILD NEW (needs Meta Marketing API OAuth + new tables + UI, no analog). Cheapest first step = EXTEND existing pattern: Facebook Lead Ads webhook -> new edge fn modeled on bulk-lead-import + _shared/ghl-webhook-signature.ts -> existing leads table.

## Artifact

**Findings**

ADS GAP = 0% BUILT. There is NO ad-platform integration of any kind in dial-smart-system: no Meta/Facebook Ads API, no Google Ads API, no ad account, no ad campaign/creative/budget/targeting, no pixel, no conversions API. The word 'campaign' throughout the repo means CALLING/DIALING campaigns and outbound email/SMS bundles, never advertising campaigns. 'facebook' appears only as (a) illustrative lead-source tag examples in docs, (b) a lead-scoring weight, (c) a test fixture, (d) a robots.txt crawler user-agent, (e) a SQL comment. Closest adjacent assets that an ad feature could plug into: LeadImportDialog.tsx + LeadUpload.tsx (CSV lead ingest), bulk-lead-import edge function (accepts lead_source/tags, 5000/batch, ON CONFLICT dedup), demo-funnel-track edge function (landing-page events but NO utm/fbclid/gclid/pixel), the content/ folder (97 SEO articles - marketing CONTENT, not ad creative) and campaigns/ (outbound email). Cheapest path: an ad-feature would be BUILD NEW for actual ad buying/management, but the cheapest first step is to EXTEND an existing pattern - add a Facebook Lead Ads webhook edge function modeled on bulk-lead-import + _shared/ghl-webhook-signature.ts, landing ad-sourced leads into the existing leads table. Full ad buying (create/manage campaigns, budget, creative, targeting from the app) has no existing analog and would require Meta Marketing API OAuth + new tables + new UI.

**evidence**

- package.json:75-168 - dependencies contain NO facebook/meta/google-ads/gtag/gtm/pixel SDK (only react, supabase, telnyx, twilio, stripe-adjacent, radix, etc.)
- grep 'meta_ads|google_ads|ad_account|ad_campaign|ads_manager' over C:/Users/charl/dial-smart-system = 0 matches
- grep 'AdCampaign|AdCreative|AdAccount|AdsManager|ad_spend|adSpend|AdBudget' over src/ = 0 matches
- grep 'facebook_ads|meta_ads|google_ads|ad_account|ad_campaign|ad_spend|ad_creative' over supabase/migrations = 0 matches
- SMART_LISTS_GUIDE.md:84,91 - 'facebook' only as example lead-source tag ('facebook-ad-campaign fb', Lead Source examples csv-import/facebook/google-ads/referral)
- supabase/functions/ai-autonomous-engine/index.ts:4517 - 'referral':1.0, 'facebook':0.8, 'google':0.7 (lead-source scoring weight, not ad integration)
- src/packs/door_to_door/__tests__/DoorToDoorEnroll.test.ts:192,195,205 - test fixture tags:['facebook'], lead_source:'facebook_ads' (proves data model can hold ad-sourced leads; no Meta connection)
- public/robots.txt:15 - 'User-agent: facebookexternalhit' (crawler allowlist, unrelated to ads)
- src/components/LeadImportDialog.tsx:11,19-70 - CSV import dialog (lucide Megaphone icon decorative); imports phone/name/email/city/state; closest 'lead ingest' asset
- supabase/functions/bulk-lead-import/index.ts:19,37-44,50 - accepts lead_source + tags, MAX_BATCH_SIZE 5000, ON CONFLICT dedup (reuse target for ad-sourced leads)
- supabase/functions/demo-funnel-track/index.ts:8-47 - landing events only (law_firm_landing_view, website_submitted...); ALLOWED_METADATA_KEYS has NO utm/fbclid/gclid/pixel/referrer
- src/components/CampaignLeadManager.tsx, src/hooks/useCampaignReadiness.ts, src/components/CampaignReadinessChecker.tsx - 'campaign' = dialing campaign UI, not advertising

**validation**

Read-only greps + file reads across src/, supabase/functions/, supabase/migrations/, docs/, package.json. Negative-control greps for ad SDKs, ad tables, and ad-tool symbols all returned 0. Confirmed the positive 'facebook' hits are non-ad (tag examples, scoring weight, test fixture, crawler UA, SQL comment). Confirmed package.json has no ad dependency. NOTE: the first shell invocation was blocked by the destructive-command gate (mis-parsed findstr) and was abandoned in favor of native read/grep tools - no writes made.

**open_questions**

- Does a parallel/companion repo (e.g., the Lovable app project mirrored elsewhere, or Hermes/server-side) hold an ad integration not present in this repo copy? Not checked.
- Is there a live Supabase DB table for ad leads/spend that has no corresponding migration committed here? Not checked (repo-only scan).
- Do any of the 78 supabase/functions not individually opened contain ad code? Only name/symbol-level grepped, not fully enumerated.
- Product intent: does 'run ads from here' mean (a) ad-lead ingest only, or (b) full ad management (create/budget/creative/targeting)? Changes cheapest-path answer materially.

**what_i_did_not_check**

- The full text of all 78 edge functions (grepped by name/symbol only)
- The live Supabase database schema (only repo migrations scanned)
- CLAUDE.md and other docs/ files in full
- Any Lovable-side or Hermes-side ad config outside C:/Users/charl/dial-smart-system
- The 781 remaining lines of LeadImportDialog.tsx beyond line 70
- Whether an ad SDK appears transitively via a lockfile (package-lock.json / node_modules not inspected)

**confidence**: high