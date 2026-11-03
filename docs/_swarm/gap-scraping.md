# gap-scraping

- status: completed
- tldr: gap-scraping: demo-scrape-website is demo-only, extracts no phones; leads enter by CSV. Cheapest path = new lead-scout edge fn reusing its Firecrawl plumbing.

gap-scraping COMPLETE (high confidence). Verdict: demo-scrape-website IS real Firecrawl tech but its ONLY purpose is a business-website AI-demo knowledge base - it extracts ZERO phone numbers / lead data and writes only to demo_sessions. Leads enter dial-smart by CSV only (LeadImportDialog.tsx Papa.parse, LeadUpload.tsx, bulk-lead-import edge fn). No enrichment/phone-lookup exists anywhere (apify grep = 0; skiptrace/county hits are the unrelated DoorBoss app). Cheapest path: add ONE new authenticated edge function supabase/functions/lead-scout/index.ts that reuses demo-scrape-website's Firecrawl plumbing (normalizePublicUrl 83-100, /v1/scrape 137-145, /v1/map+key-page loop 155-198, FIRECRAWL_API_KEY 111), adds extractPhones(), and inserts to leads via bulk-lead-import's normalizePhone (46-55)+ON CONFLICT. Do NOT extend demo-scrape-website (8/day IP limit, demo_sessions-only, public unauth).

## Artifact

**Findings**

PURPOSE (FACT): demo-scrape-website is a real Firecrawl scraper whose ONLY purpose is building an AI-phone-demo knowledge base. It scrapes business website CONTENT (/v1/scrape 137-141; /v1/map 155-159 to find about/team/services/contact/FAQ pages, scraped 183-197), optionally enriches via Lovable AI gateway (208-219), and stores to demo_sessions (252-270). NO PHONE EXTRACTION (FACT): it extracts ZERO phone numbers or lead data - AI prompt (214) asks only for business_name/products_services/target_audience/value_props/knowledge_base; fallback inferFallbackInfo (49-81) and usefulSentences (41-47) only strip markdown/select sentences and actively filter OUT contact noise (regex at 42 drops phone/e-mail/address/zip). No phone regex, no libphonenumber, no tel:/mailto parsing. The only phone in demo_sessions is the VISITOR'S OWN prospect_phone (migration 20260201201405 lines 26-28), submitted via DemoPhoneInput.tsx, not scraped. HOW LEADS GET IN = CSV ONLY (FACT), 3 paths, zero enrichment: (a) LeadImportDialog.tsx Papa.parse (17,265-301) -> leads, lead_source 'CSV Import' (325-333,375); (b) LeadUpload.tsx hand-rolled CSV parser (98-151) -> leads (230-420); (c) supabase/functions/bulk-lead-import/index.ts server-side bulk (1-9,46-55), still CSV-fed. LeadManager.tsx is display only. NO ENRICHMENT/LOOKUP EXISTS (FACT): grep apify=0 matches; skiptrace/county hits are ONLY the unrelated DoorBoss app (scripts/ship/_d2d_*, src/packs/door_to_door/) which never touches dial-smart leads. No edge function does phone/owner lookup. Nearest-named are not lookups: validate-phone-numbers inventories Twilio numbers (31); reachability-scoring is disabled/503 (21-31); telnyx-knowledge-base crawls URLs for RAG only. CHEAPEST PATH = BUILD ONE NEW EDGE FUNCTION reusing demo-scrape-website's Firecrawl plumbing. SPECIFIC FUNCTION TO ADD: supabase/functions/lead-scout/index.ts. Copy normalizePublicUrl(83-100), the /v1/scrape block(137-145), the /v1/map+key-page loop(155-198), FIRECRAWL_API_KEY read(111), then ADD extractPhones(sourceText) and write to leads via bulk-lead-import's normalizePhone(46-55)+ON CONFLICT insert. WHY NOT extend demo-scrape-website: it is IP-rate-limited to 8/day (8,125-135), writes only demo_sessions, and is a public unauth demo funnel - wrong host and rate budget. Reuse the plumbing in a new authenticated function = no new vendor, key already provisioned, pattern loop already built.

**evidence**

- supabase/functions/demo-scrape-website/index.ts:111 FIRECRAWL_API_KEY read
- supabase/functions/demo-scrape-website/index.ts:137-145 Firecrawl /v1/scrape
- supabase/functions/demo-scrape-website/index.ts:155-198 Firecrawl /v1/map + key-page loop
- supabase/functions/demo-scrape-website/index.ts:208-219 Lovable AI gateway (knowledge_base only)
- supabase/functions/demo-scrape-website/index.ts:214 AI prompt lists business/knowledge fields, no phone
- supabase/functions/demo-scrape-website/index.ts:42 noise regex EXCLUDES phone/e-mail/address
- supabase/functions/demo-scrape-website/index.ts:252-270 writes demo_sessions, not leads
- src/components/LeadImportDialog.tsx:17,265-301,325-333,375 Papa.parse CSV -> leads (lead_source CSV Import)
- src/components/LeadUpload.tsx:98-151,230-420 hand-rolled CSV parser -> leads
- supabase/functions/bulk-lead-import/index.ts:1-9,46-55 server bulk CSV import, normalizePhone
- supabase/functions/validate-phone-numbers/index.ts:29-55 Twilio inventory only
- supabase/functions/reachability-scoring/index.ts:9-31 disabled/uncertified
- supabase/functions/telnyx-knowledge-base/index.ts:1-21 URL crawl for RAG only
- supabase/migrations/20260201201405_c44606be-d9b7-4384-94d9-be79fd6fe5ad.sql:20-44 demo_sessions columns incl visitor prospect_phone
- grep firecrawl -> 1 file only; grep apify -> 0 files

**validation**

Read every line of the 283-line target file; read LeadImportDialog.tsx and LeadUpload.tsx in full; read headers of bulk-lead-import, validate-phone-numbers, reachability-scoring, telnyx-knowledge-base; repo-wide grep for firecrawl (1 file), apify (0), skiptrace/county (DoorBoss-only), scrape/prospect UI (Demo funnel only); confirmed demo_sessions schema from its CREATE TABLE migration. All claims FACT with file:line unless marked THEORY.

**open_questions**

- Who are the target websites whose phones should be scraped (business directory lists? prospect company sites? county records?), which determines whether a single-site Firecrawl scrape or a directory/crawler pattern is needed.
- Are scraped leads intended to be written straight to the shared `leads` table as cold outbound, and is there a compliance/consent gate required before dialing scraped numbers?
- Should phone extraction use pure regex or an LLM pass (Lovable/OpenRouter) for accuracy on obfuscated numbers?
- Does an Apify-based lead pipeline exist OUTSIDE this repo (per the AGENTS.md apify skill, Cole/wholesale work) that would make building here redundant?

**what_i_did_not_check**

- Did not run the function or make live Firecrawl calls - behavior inferred from source (read-only lane).
- Did not inspect GHL ingestion paths (ghl-integration, ghl-shadow-ingest) which may import leads from GoHighLevel - a possible 4th lead-in path.
- Did not enumerate all ~110 edge functions line-by-line for a hidden lookup service; relied on name inventory + targeted greps, so an inconspicuously-named enrichment function could be missed.
- Did not verify FIRECRAWL_API_KEY is actually set in Supabase secrets.
- Did not exhaustively scan docs/ or wholesale pack trees for a planned-but-unbuilt lead-scout design.
- Did not check whether a phone/lead scraping pipeline already exists OUTSIDE this repo (e.g. Cole/wholesale Apify) that could be wired in.

**confidence**: high