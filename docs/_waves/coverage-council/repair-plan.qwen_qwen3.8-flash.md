# The ordered repair plan - reviewer qwen/qwen3.8-flash

cost: $0.0082

---

## Scope and evidence limits

FACT: The supplied excerpts prove the following relevant points:

- `supabase/functions-live/README.md:9-11` — live snapshots exist so fixes are built on live behavior, not GitHub `main`, which carries unreleased 503 “certification gate” changes.
- `supabase/functions-live/README.md:66-68` — for the 11/02 re-snapshot, live and source are byte-identical on branch `wholesale` for all 8 files.
- `supabase/functions-live/README.md:81` — the 503 `*_NOT_CERTIFIED` gates exist only on GitHub `main`, never on live.
- `supabase/functions-live/README.md:28-29` — live function snapshots include `call-dispatcher` and `retell-call-webhook`.
- `supabase/functions/stripe-webhook/index.ts:368` — webhook reads `session.metadata?.amount_cents`.
- `grep 'organization_id' in src/components/CampaignWizard.tsx` returned no hits.
- `src/lib/launchSafety.ts:128-159` — browser dispatch, autonomous action, contact egress, and provider administration are fail-closed.

THEORY / GIVEN: The exact count of 73 gates, 40+ disabled functions, 85 org-blind tables, `generate-daily-report`, `get_user_organizations`, migration file path, provisioning file path, and Retell secret name are not fully shown in the supplied evidence. I do not claim they are absent from the repo; I only state what the excerpts show.

I did NOT check: full repo file list, exact 73 gate files, actual migration contents, all 85 table names, `get_user_organizations` definition, all RLS policies, provisioning function path, Retell webhook line numbers, test suite, env vars, or provider API behavior.

---

## Ordered repair plan by risk removed / effort

### 0. Deploy-gate decision: do not deploy `main`; deploy live snapshot / `wholesale`

**Defect addressed:** (a) 73 `NOT_CERTIFIED` gates on `main`, not live.

**Exact files / source to change:**

- Deployment source: use branch `wholesale` or the live snapshot set, not `main`.
  - FACT: `supabase/functions-live/README.md:66-68` says live and source are byte-identical on branch `wholesale` for the re-snapshotted files.
- No individual code file change is safe until the 73 gates are enumerated and certified.

**Precise change:**

1. Freeze production deploys from `main`.
2. Deploy only from `wholesale` / live snapshot bytes.
3. Cherry-pick fixes into the live-source tree, not merge `main` wholesale.

**Both options and consequences:**

- **Option A: deploy `main`**
  - THEORY / GIVEN: question states this adds 73 `NOT_CERTIFIED` gates and disables 40+ working functions including dialer and `generate-daily-report`.
  - FACT: `supabase/functions-live/README.md:81` confirms `*_NOT_CERTIFIED` 503 gates exist on `main` but not live.
  - Consequence: production outage of dialing/reporting paths.

- **Option B: deploy live snapshot / `wholesale`**
  - FACT: `supabase/functions-live/README.md:66-68` says live and source are byte-identical for the verified files.
  - Consequence: live behavior is preserved; unreleased `main` certification gates stay out of production.

**Test that proves it:**

- Diff every deploy candidate against `supabase/functions-live/*` and assert no new 503 `*_NOT_CERTIFIED` branches.
- Smoke test dialer and daily-report paths before deploy.

**Blast radius if wrong:**

- Wrong source selection disables live functions, stops dialing, and breaks operational reporting.

---

### 1. Fix Stripe credit metadata mismatch

**Defect addressed:** (d) checkout sets `credit_amount_cents`; webhook reads `amount_cents`, so purchases grant zero.

**Exact file:**

- `supabase/functions/stripe-webhook/index.ts`

**Evidence:**

- FACT: `supabase/functions/stripe-webhook/index.ts:368` reads `session.metadata?.amount_cents`.
- FACT: `supabase/functions/stripe-webhook/index.ts:384` and `:419` pass `p_amount_cents` into credit logic.

**Precise change:**

At `supabase/functions/stripe-webhook/index.ts:368`, replace:

```ts
const amountCents = parseInt(session.metadata?.amount_cents || "0");
```

with:

```ts
const amountCents = parseInt(
  session.metadata?.credit_amount_cents ??
  session.metadata?.amount_cents ??
  "0"
);
```

**Test that proves it:**

- Unit/integration test:
  1. Create fake checkout session metadata `{ credit_amount_cents: "5000" }`.
  2. Invoke webhook handler.
  3. Assert the RPC receives `p_amount_cents = 5000` / equivalent credit amount.
- Negative test: metadata missing both keys grants zero.
- Legacy test: if old sessions only have `amount_cents`, fallback still works.

**Blast radius if wrong:**

- If key is wrong, customers pay and receive zero credits.
- If fallback is too broad, non-credit sessions could grant credits incorrectly.

---

### 2. Neutralize or scope the bare `DELETE FROM lead_pipeline_positions`

**Defect addressed:** (c) migration `20260407220336_3e4797af` is a bare `DELETE FROM lead_pipeline_positions` with no `WHERE`.

**Exact file:**

- THEORY: `supabase/migrations/20260407220336_3e4797af.sql`  
  The migration id is given in the question; exact path is not shown in the supplied evidence.

**Precise change:**

If the migration has not been applied to production:

Replace the bare delete with a tenant-scoped delete or no-op when no tenant context exists. Example:

```sql
delete from public.lead_pipeline_positions
where organization_id = current_setting('app.organization_id', true)::uuid;
```

If the intended migration is administrative and requires an explicit target org, instead make it a guarded RPC:

```sql
delete from public.lead_pipeline_positions
where organization_id = p_organization_id;
```

Do not run a global delete.

If the migration has already been applied:

- Do not edit applied migration history in place.
- Restore `lead_pipeline_positions` from backup.
- Add a compensating migration that recreates the intended scoped behavior.

**Test that proves it:**

- Staging test with two organizations:
  1. Seed org A and org B pipeline positions.
  2. Set `app.organization_id` to org A or pass org A to RPC.
  3. Run migration / RPC.
  4. Assert only org A rows are deleted; org B rows remain.
- Missing-context test:
  1. Run without `app.organization_id`.
  2. Assert zero rows are deleted.

**Blast radius if wrong:**

- Bare delete wipes all tenants’ pipeline positions.
- Wrong `WHERE` deletes the wrong tenant or leaves stale rows.

---

### 3. Add `organization_id` to campaign wizard insert

**Defect addressed:** (b) campaign wizard omits `organization_id`, so insert fails.

**Exact file:**

- `src/components/CampaignWizard.tsx`

**Evidence:**

- FACT: `grep 'organization_id' in src/components/CampaignWizard.tsx` returned no hits.

**Precise change:**

1. Include `organization_id` in the campaign insert payload.
2. Do not trust the browser value as authoritative. The server action / API must derive the organization from the authenticated session and overwrite or validate the client value.

Client-side payload shape:

```ts
organization_id: authOrganizationId
```

Server-side requirement:

```ts
// Trusted server action must set/validate organization_id from session.
```

**Test that proves it:**

- Fresh-org E2E:
  1. Provision a new org.
  2. Complete campaign wizard.
  3. Assert campaign insert succeeds.
  4. Assert DB row has the correct `organization_id`.
- Cross-tenant test:
  1. User in org A submits org B `organization_id`.
  2. Assert server rejects or overwrites to org A.

**Blast radius if wrong:**

- If omitted, new tenants cannot create campaigns.
- If wrong or unvalidated, campaigns can be inserted into another tenant.

---

### 4. Fix Retell webhook signing-key failure

**Defect addressed:** (b) Retell call webhook 503s without its signing key.

**Exact file:**

- THEORY source path: `supabase/functions/retell-call-webhook/index.ts`
  - FACT: `supabase/functions-live/README.md:29` lists live snapshot `functions/retell-call-webhook/index.ts`.
  - FACT: `supabase/functions-live/README.md:10-11` says edit `supabase/functions/<slug>/`, not live snapshots.

**Precise change:**

1. Provision the Retell signing secret in the deployed function environment.
2. Add explicit startup validation:

```ts
const retellSigningKey = Deno.env.get("RETELL_SIGNING_KEY");
if (!retellSigningKey) {
  console.error("RETELL_SIGNING_KEY is not configured");
  return new Response("Webhook signing key is not configured", { status: 503 });
}
```

3. Verify incoming webhook signatures and fail closed:

```ts
if (!signatureValid) {
  return new Response("Invalid signature", { status: 401 });
}
```

4. Do not write call outcomes when signature is missing or invalid.

**Test that proves it:**

- Missing secret test:
  1. Deploy without secret.
  2. Assert function returns 503 and logs alert, with no DB writes.
- Invalid signature test:
  1. Send signed-looking payload with bad signature.
  2. Assert 401 and no DB writes.
- Valid signature test:
  1. Send valid signed webhook.
  2. Assert 200 and expected call-log/outcome write.

**Blast radius if wrong:**

- If the webhook accepts unsigned payloads, attackers can spoof call outcomes.
- If the secret is missing, real Retell events fail and call state becomes stale.

---

### 5. Make dispatcher cron wake tenants that do not yet have due queue rows

**Defect addressed:** (b) dispatcher cron only wakes tenants that already have due queue rows.

**Exact file:**

- THEORY source path: `supabase/functions/call-dispatcher/index.ts`
  - FACT: `supabase/functions-live/README.md:28` lists live snapshot `functions/call-dispatcher/index.ts`.

**Precise change:**

Change the cron selector from “only tenants with due queue rows” to “tenants with active campaigns, scheduled queues, or onboarding-ready state,” then create/claim due rows inside the dispatcher.

Conceptual query change:

```sql
-- old idea:
where exists (select 1 from lead_queue where due_at <= now())

-- new idea:
where exists (
  select 1
  from campaigns
  where campaigns.organization_id = orgs.id
    and campaigns.status = 'active'
)
or exists (
  select 1
  from lead_queue
  where lead_queue.organization_id = orgs.id
    and lead_queue.due_at <= now()
)
```

Exact table/column names must be confirmed from the dispatcher source.

**Test that proves it:**

- Fresh tenant with active campaign but zero due queue rows:
  1. Run dispatcher cron.
  2. Assert tenant is woken.
  3. Assert due rows are created or claimed if appropriate.
- Idle tenant test:
  1. Tenant with no active campaign and no due rows.
  2. Assert dispatcher does not wake it unnecessarily.

**Blast radius if wrong:**

- Too narrow: new tenants never get dispatched.
- Too broad: cron wakes all tenants, creates load, or starts unintended work.

---

### 6. Provision a phone number for fresh organizations

**Defect addressed:** (b) fresh org is provisioned with no phone number.

**Exact file:**

- Not identifiable from supplied evidence.
- FACT: `supabase/functions-live/README.md:10-1
