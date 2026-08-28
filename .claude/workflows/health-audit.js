export const meta = {
  name: 'health-audit',
  description: 'Read-only daily health audit: security, RLS, deps, build, DB drift, doc drift — measures, never changes',
  whenToUse: 'Run daily (or before any release) to get one ranked report of what is wrong or drifting. Changes nothing; every finding is tagged safe-to-auto-fix or needs-human.',
  phases: [
    { title: 'Measure', detail: 'one agent per dimension, all read-only' },
    { title: 'Synthesize', detail: 'rank findings, tag each by fix-safety' },
  ],
}

// ---------------------------------------------------------------------------
// This is the "sense" layer of the daily improver: it only READS. No file is
// written, no migration applied, no dependency changed. It exists so a human
// (or a gated PR pipeline) always has an honest, current picture before anyone
// touches the code. Safe to run any time, as often as you like.
//
// The Supabase project is pinned so the DB dimensions work headless.
// ---------------------------------------------------------------------------
const PROJECT = 'emonjusymdripmkvtttc'

const DIM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['dimension', 'status', 'findings'],
  properties: {
    dimension: { type: 'string' },
    status: { type: 'string', enum: ['green', 'yellow', 'red'] },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'severity', 'detail', 'fix_safety'],
        properties: {
          title: { type: 'string' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'info'] },
          detail: { type: 'string' },
          fix_safety: {
            type: 'string',
            enum: ['auto-safe', 'gated-pr', 'needs-human', 'external'],
            description: 'auto-safe = mechanical, no behavior change (e.g. lockfile audit fix); gated-pr = a code change that must pass the full green gate + review; needs-human = a decision or judgement call; external = outside the repo (dashboard setting, provider console)',
          },
        },
      },
    },
  },
}

const RO = 'You are read-only. Do NOT edit files, apply migrations, install packages, or change any state. Only read, run non-mutating commands, and report. If a command would change state, describe it instead of running it.'

const dims = [
  {
    key: 'security-rls',
    prompt: `${RO}
Assess this Supabase-backed app's security posture. Using the Supabase MCP tools (ToolSearch "select:mcp__Supabase__get_advisors,mcp__Supabase__execute_sql" against project_id "${PROJECT}"):
- Pull get_advisors type "security" and summarize every WARN/ERROR.
- Scan public RLS policies for the cross-tenant leak shape: FOR ALL policies with missing/weaker WITH CHECK, tables with write policies but no user_id/organization_id column scoped via an unclear join, and SECURITY DEFINER functions callable by 'authenticated' that take a caller-controlled argument without re-scoping to auth.uid().
Note: RLS enabled with ZERO policies (demo_funnel_events, law_firm_beta_leads) is deny-all BY DESIGN — not a finding. Tag anything reachable by a non-operator tenant as at least high.`,
  },
  {
    key: 'dependencies',
    prompt: `${RO}
In /home/user/dial-smart-system, run \`npm audit --omit=dev --json\` and report every PRODUCTION-dependency vulnerability: package, severity, whether a fix is available, and whether the fix is semver-major (major = gated-pr/needs-human because it can break behavior; non-major lockfile fix = auto-safe). Ignore dev-only advisories but say how many there were.`,
  },
  {
    key: 'build-health',
    prompt: `${RO}
In /home/user/dial-smart-system, measure build health WITHOUT changing anything:
- \`npx tsc --noEmit\` — report error count.
- \`npx vite build\` — report success, wall-clock, and the main chunk size in KB (dist/assets/index-*.js).
- \`npm test\` runs a sharded runner (scripts/run-vitest-shards.mjs); report pass/fail counts and any file that fails. It can take a few minutes — let it finish.
Green only if tsc is 0 errors, build succeeds, and every test passes.`,
    heavy: true,
  },
  {
    key: 'db-drift',
    prompt: `${RO}
Detect drift between the migrations on disk and what is applied. Count \`supabase/migrations/*.sql\` files in /home/user/dial-smart-system, then use the Supabase MCP mcp__Supabase__list_migrations (project_id "${PROJECT}") to list applied versions. Report any on-disk migration whose version is NOT applied, and the newest applied version. Also list edge functions on disk vs mcp__Supabase__list_edge_functions and flag any on disk that are not deployed.`,
  },
  {
    key: 'doc-drift',
    prompt: `${RO}
Read the CURRENT STATE block at the top of /home/user/dial-smart-system/CLAUDE.md and spot-check its claims against reality: edge-function count (ls supabase/functions), migration count, main bundle size, test-file count, console.log count. Report any figure in the doc that no longer matches. Also flag any "(NOT DEPLOYED)" banner below the current-state block that is now stale.`,
  },
]

phase('Measure')
log(`Health audit: ${dims.length} read-only dimensions. Nothing will be changed.`)
const measured = await parallel(dims.map(d => () =>
  agent(d.prompt, {
    label: d.key,
    phase: 'Measure',
    schema: DIM_SCHEMA,
    agentType: 'general-purpose',
    effort: d.heavy ? 'medium' : 'low',
  })
))

const results = measured.filter(Boolean)
const allFindings = results.flatMap(r => (r.findings || []).map(f => ({ ...f, dimension: r.dimension })))
log(`${allFindings.length} findings across ${results.length}/${dims.length} dimensions.`)

phase('Synthesize')
const REPORT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['headline', 'overall', 'ranked', 'auto_safe_count', 'needs_human_count'],
  properties: {
    headline: { type: 'string' },
    overall: { type: 'string', enum: ['green', 'yellow', 'red'] },
    auto_safe_count: { type: 'number' },
    needs_human_count: { type: 'number' },
    ranked: {
      type: 'array',
      description: 'findings ranked most-urgent first',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'dimension', 'severity', 'fix_safety', 'recommendation'],
        properties: {
          title: { type: 'string' },
          dimension: { type: 'string' },
          severity: { type: 'string' },
          fix_safety: { type: 'string' },
          recommendation: { type: 'string', description: 'one line: the exact next action' },
        },
      },
    },
  },
}

const report = await agent(
`You are the audit synthesizer. Here are the raw findings from ${results.length} read-only dimensions:

${JSON.stringify(allFindings, null, 1)}

Produce one ranked report. Rank by real risk to a paying customer's data or a broken release first. For each finding give a one-line recommendation and keep its fix_safety tag. overall is red if any critical/high is unresolved, yellow if only medium/low, green if clean. Be blunt and specific; this is the daily driver's brief.`,
  { label: 'synthesize', phase: 'Synthesize', schema: REPORT_SCHEMA }
)

return {
  dimensions_run: results.length,
  dimensions_total: dims.length,
  report,
  raw_findings: allFindings,
}
