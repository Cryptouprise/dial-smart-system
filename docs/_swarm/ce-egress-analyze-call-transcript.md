# ce-egress-analyze-call-transcript

- status: completed
- tldr: analyze-call-transcript: real LLM egress (Lovable Gateway) but blocked by always-503 gate; verify_jwt=false; CORS * but real auth; no bypass.

analyze-call-transcript: EGRESS=YES but UNREACHABLE. Two LLM chat-completion fetches to https://ai.gateway.lovable.dev/v1/chat/completions (lines 230, 335), model google/gemini-2.5-flash. verify_jwt=false (config.toml:173). Launch gate isFallbackTranscriptAnalysisTenantCertified() returns false (144-146), called at 156, 503 at 163, runs BEFORE first egress. CORS '*' (line 6) BUT real identity check present (service-role compare line 197; JWT getUser line 209; 401s at 183-188/210-215) -> NOT anonymous-reachable. No bypass: gate unconditional; OPTIONS (149-151) does no egress. No OpenRouter/Lithos/DeepSeek import (only serve + supabase-js at lines 2-3).

## Artifact

**Findings**

EGRESS: YES in code but UNREACHABLE at runtime. Two real external LLM chat-completion calls to https://ai.gateway.lovable.dev/v1/chat/completions (Lovable AI Gateway; model google/gemini-2.5-flash; auth Bearer lovableApiKey): line 230 inside the action==='compare_to_script' branch (line 225), and line 335 in the standard transcript-analysis branch (line 329). Both occur AFTER the 503 gate. verify_jwt: FALSE (supabase/config.toml lines 170-173). LAUNCH-QUARANTINED: one gate helper isFallbackTranscriptAnalysisTenantCertified() defined lines 144-146 (hard-returns false), call site line 156, 503 returned at line 163; it is the ONLY *Certified helper in the file and it runs BEFORE the first egress (230/335), so egress is unreachable. ANONYMOUS-BROWSER REACHABLE: NO - CORS '*' at line 6, but a real identity check exists: Authorization header required (401, lines 183-188); service-role token compare token===serviceRoleKey (line 197) with required bodyUserId (400, lines 199-204); otherwise JWT validation supabaseAdmin.auth.getUser(token) (line 209) with 401 on no user (lines 210-215). BYPASSES LAUNCH LOCK: NONE reaching egress - the 503 gate (line 156) is unconditional (no env/feature flag, no cron/scheduler branch, no webhook path); OPTIONS (lines 149-151) returns before the gate but performs no egress; the service-role branch is downstream of the gate. Internal call: supabaseAdmin.functions.invoke('disposition-router', ...) at line 704 is an internal Supabase function invoke, NOT a provider create call. No OpenRouter/DeepSeek/Lithos usage: the file imports only serve (line 2) and createClient (line 3); it does NOT import _shared/openrouter.ts or _shared/lithos.ts.

**evidence**

- index.ts:6  'Access-Control-Allow-Origin': '*',
- index.ts:144-146  function isFallbackTranscriptAnalysisTenantCertified(): boolean { return false; }
- index.ts:156  if (!isFallbackTranscriptAnalysisTenantCertified()) {
- index.ts:163  status: 503,
- index.ts:149-151  if (req.method === 'OPTIONS') { return new Response('ok', { headers: corsHeaders }) }
- index.ts:182-188  const authHeader = req.headers.get('Authorization'); if (!authHeader) { ... status: 401 ...
- index.ts:197  if (token === serviceRoleKey) {
- index.ts:199-204  if (!bodyUserId) { ... status: 400 ...
- index.ts:209  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
- index.ts:210-215  if (!user) { ... status: 401 ...
- index.ts:225  if (action === 'compare_to_script') {
- index.ts:230  const comparisonResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
- index.ts:329  // Standard transcript analysis
- index.ts:335  const analysisResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
- index.ts:704  const dispositionRouterResult = await supabaseAdmin.functions.invoke('disposition-router', {
- index.ts:2-3  import { serve } from "...http/server.ts"; import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
- config.toml:170-173  [functions.analyze-call-transcript] / # Launch-quarantined before secrets, database, or AI access. / # ... / verify_jwt = false  # Called internally by retell-call-webhook via service role key

**validation**

Full-file read of supabase/functions/analyze-call-transcript/index.ts (757 lines); read supabase/config.toml lines 160-184; grep for 'Certified' returned exactly lines 144 and 156; confirmed only two fetch( calls and two import statements. No files modified (research only).

**open_questions**

- Does retell-call-webhook actually invoke this function via service role, as the config comment (config.toml:173) claims? Requires reading that caller; out of scope for this single-file node.
- Are there any other callers (edge functions or client code) that invoke analyze-call-transcript?

**edge_cases_considered**

- OPTIONS (index.ts:149-151) returns before the gate but performs no egress, so it is not a bypass.
- Service-role branch (token === serviceRoleKey, index.ts:197) is a real auth path but sits downstream of the unconditional 503 gate (index.ts:156), so it cannot reach egress.
- AI-failure fallback path (index.ts:396-451) writes DB only, no egress.
- The 503 gate is the first statement after OPTIONS, before any env/secret read (index.ts:169+) or client creation (index.ts:180).

**what_i_did_not_check**

- Did not read retell-call-webhook or any other caller to confirm invocation (config.toml:173 asserts it but was not verified).
- Did not read _shared/*.ts helpers because this file imports none of them (only serve + supabase-js), so they are irrelevant to its egress/auth behavior.
- Did not verify deployed runtime state (static source only), so verify_jwt=false is read from config.toml, not from a live endpoint.

**confidence**: high