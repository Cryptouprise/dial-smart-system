# External operator control plane

This document defines the safety boundary for operating Dial Smart through Slack, Microsoft Teams, Zapier, or MCP. It describes the reviewed local design and the gates required before any adapter may control a live tenant. It is not a deployment or launch authorization.

## Current status

The control-plane work is local to a draft pull request. It has not been merged or deployed, no production installation has been created, and no call, text, CRM write, queue mutation, or provider spend has been authorized by this work.

| Surface | Current reviewed state |
| --- | --- |
| Slack | The local draft removes the legacy mutation, dispatch, AI, service-role, and `response_url` paths. Its replacement is a compile-time-locked signed R0 adapter wired to a tenant-scoped read-only runtime and durable receipt claim contract. The public entry point remains hard-disabled and is not deployed or provisioned. |
| Microsoft Teams | The local draft now has a compile-time-locked inbound R0 adapter: it verifies Bot Framework JWTs against a pinned, bounded Microsoft OpenID-key resolver; binds the declared tenant, bot app, route, and user through the shared server-side installation/principal checks; and claims a durable receipt before its tenant-scoped read. It acknowledges only an accepted command over HTTP. It has no bot registration, deployment, durable reply outbox, or visible Teams reply yet, so it is not a usable Teams bot. |
| Zapier | The generic lead-intake route remains excluded because it writes leads/queues and can reach dispatch. The local draft adds a separate compile-time-locked R0 adapter with strict key/body/command checks, a revocable API-key resolver, tenant-scoped read-only runtime, and durable receipt claim contract. The public entry point remains hard-disabled and is not deployed or provisioned. |
| MCP | The server now exposes exactly four R0 tools through its fail-closed `observer` profile. Mutating and lead/call/SMS tools are not advertised, but the API gateway it depends on remains disabled and the shared durable receipt plane is not deployed. MCP is therefore not a live control plane. |

Phase 1 is intentionally observation-only. The shared command vocabulary exposes only these R0 commands:

- `operator.context`
- `system.status`
- `campaign.list`
- `campaign.inspect` using an exact canonical campaign UUID

The finite aliases `release <campaign UUID>`, `campaign release <campaign UUID>`, and `campaign readiness <campaign UUID>` resolve only to `campaign.inspect` with the bounded `release_status` view. That view is a non-PII server release summary; it always carries `contact_authorized: false` and `launch_certified: false`.

Phase 1 is also deliberately owner/admin-only. The shared registry and durable SQL claim boundary both reject organization members and managers, even for R0; broadening observer access is a later policy decision that requires its own review.

Every Phase 1 result must retain the following authority values, without an adapter-specific override:

```json
{
  "contact_authorized": false,
  "launch_authorized": false,
  "queue_mutation_authorized": false,
  "crm_write_authorized": false,
  "spend_authorized": false
}
```

## What the current runtime can and cannot do

The implemented Slack, Zapier, and Teams runtime is an R0 observer foundation. It can return a bounded, tenant-and-user-scoped view of campaign configuration, aggregate operational metadata, and a service-only campaign release summary after it has resolved an active installation, verified external principal, and live owner/admin membership. It can answer only the four command names above. It never selects lead phone numbers, transcripts, recordings, message bodies, callback URLs, provider credentials, release evidence fingerprints, caller IDs, or cohort members.

It cannot create a lead, edit a campaign, schedule a callback, write to GHL, call Telnyx or Retell, invoke an AI agent, place a call or text, spend money, or turn any of its own authority flags on. A successful observer result is a read and an append-only receipt only; it is not a dialer launch signal.

The Slack and Zapier Edge entry points each contain a compile-time `false` launch constant. No environment variable, request field, or database record can flip that constant. While it remains false, the endpoint returns before reading its body, credentials, database, or network. Changing it is a future reviewed release step, never a provisioning shortcut.

The Teams Edge adapter also contains a compile-time `false` launch constant. It can acknowledge a verified bounded command in a controlled test, but deliberately cannot yet deliver a visible Teams reply: the Microsoft bot registration, app credential handling, durable response outbox, delivery worker, and staging evidence do not exist. It therefore remains unavailable, not a setting waiting to be turned on.

## R0 provisioning checklist (not an activation checklist)

This is the exact evidence and configuration required before a controlled synthetic-data staging review can be proposed. Completing these items does **not** authorize a public endpoint, real lead data, CRM writes, calls, or texting.

1. Use one isolated non-production organization and a company-owned test user. Do not bind Elite Solar Recovery, Omega Accounting, Noble Gold, or Infinite AI until synthetic staging evidence is complete.
2. Generate and retain a 256-bit-or-stronger URL-safe HMAC secret for `EXTERNAL_CONTROL_IDENTIFIER_HMAC_KEY`; set a version string in `EXTERNAL_CONTROL_IDENTIFIER_KEY_VERSION`. The code accepts this as URL-safe secret material (at least 43 characters); it is not written into SQL, logs, claims, or receipts.
3. Create active, immutable server-side installation and principal records for exactly one staging organization. Store only the domain-separated HMACs of the external tenant, app/key, route, and principal IDs, together with verification-evidence SHA-256. Bind the principal to a current owner/admin user.
4. For Slack, provision a single test app with an exact `/dial-smart` slash command and signing secret. The runtime binds the signed Slack team ID, API app ID, fixed route, and signed user ID; it accepts no `response_url` authority.
5. For Zapier, mint one short-lived, revocable, read-only `dsk_live_` API key bound to the test organization and owner/admin user. Limit its scopes to `system:read` and `campaigns:read`; it must be supplied only as an HTTP Bearer credential, never in the request body or Zap configuration text. Every action body must also carry its stable exact-UTC `source_occurred_at`, so a delivery retry retains the same payload-bound replay identity rather than receiving a new server timestamp.
Additional Teams prerequisite: register exactly one test bot/application and bind only its immutable application ID, tenant ID, fixed route, and one test user through server-side installation/principal records. Before any outbound reply is contemplated, add a durable reply outbox plus delivery worker that validates the signed `serviceUrl` again at send time; no activity field may select a tenant or grant authority.
6. Deploy nothing public yet. First run the complete control-plane certification plus synthetic request tests against an isolated staging project; retain receipt, exact replay, collision, revoked-key, narrowed-role, wrong-tenant, malformed-request, and R1–R3 rejection evidence.
7. Only after an independent review of that evidence may a separate code-reviewed release consider enabling one R0 endpoint for the isolated staging tenant. The first Elite Solar Recovery step remains a no-contact shadow observation, followed by the existing owned-phone canary process under its separate gates.

## Required request and execution flow

All adapters must terminate at one shared server-side boundary:

```text
authenticated adapter
  -> strict canonical command
  -> installation and external-principal resolution
  -> live organization membership, role, and scope check
  -> durable replay claim
  -> registered command and risk policy
  -> approval gate, when required
  -> shared executor
  -> existing queue/provider effect ledger
  -> durable response outbox
```

An adapter may authenticate and normalize transport details; it may not decide tenant membership, invent scopes, execute SQL mutations, call a provider, or grant itself authority. The accepted wire command has a fixed version and strict schema. Tenant, user, role, scopes, internal-service status, and authority flags are server-derived and are not accepted from the request body.

Conversational aliases are a finite, deterministic vocabulary. Unknown, fuzzy, or ambiguous text returns an unsupported-command/help response. It is never forwarded to an LLM, AI tool router, or legacy command path, and it never creates an effect. Exact UUID selectors are required where a command names a resource; fuzzy campaign-name matching is not an authorization mechanism.

## Tenant and principal binding

Each signed or credentialed request resolves to a server-owned installation and external principal. The installation binds the channel account or credential to an organization and an allowlisted capability profile. The principal binds the external channel identity to an application user. Neither `tenant_alias`, organization IDs, user IDs, roles, nor scopes supplied by a webhook payload are trusted.

For every request, including retries, the server rechecks that the installation and principal are active and that the application user has a current, direct membership in the resolved organization. It then derives the user's current organization role and intersects the installation scopes, principal scopes, and command requirements. Removing a membership, disabling an installation, revoking a principal, or narrowing a scope must take effect on the next request. Service-role database access is an implementation tool, not a substitute for these checks.

Installations and external identities must be explicitly organization-bound. A Slack workspace/user pair, Teams bot/conversation identity, Zapier credential, or MCP key cannot silently select among Elite Solar Recovery, Omega Accounting, Noble Gold, Infinite AI, or any other tenant.

## Durable replay claims and receipts

Process memory is not replay protection. Before dispatch, the server atomically claims a durable request identity and stores a canonical intent hash that binds:

- organization and application user;
- channel and installation;
- canonical command name and arguments; and
- requested mode.

Approval material is evaluated separately and cannot change the claimed intent. An exact retry with the same request identity and intent returns the retained receipt or continues the same recorded state machine; it does not execute again. Reusing a request identity with a different intent hash is a payload collision. The server rejects and records that collision, creates no effect, and does not let a later request overwrite the first intent.

Receipts are append-only evidence of authentication context, authorization decision, command risk, state transitions, result, error code, effect-ledger references, and the fixed no-authority projection. They must not contain secrets or unrestricted payloads. The response outbox is also durable so a Slack, Teams, or Zapier delivery retry cannot cause command re-execution. Outbox delivery status and command execution status are separate facts.

## Risk and approval model

| Tier | Meaning | Examples | Phase 1 |
| --- | --- | --- | --- |
| R0 | Tenant-scoped query with no external effect | operator context, status, list, inspect | Allowed after authentication and authorization |
| R1 | Draft-only internal work that cannot contact, launch, enqueue, write CRM data, or spend | create or update an inactive campaign draft | Registered for future review; blocked |
| R2 | Bounded reversible or safer-state operational change | pause or stage under an explicit policy | Registered for future review; blocked |
| R3 | Contact, launch, provider invocation, or spend | activate, dispatch, call, SMS | Blocked; requires separate certification and explicit approval |

The risk registry is code-owned and fail-closed: an unregistered command cannot execute. Role and scope checks apply at every tier. A valid approval can satisfy only the approval requirement for the exact preclaimed intent; it cannot supply identity, tenant membership, role, scope, provider readiness, consent, DNC clearance, campaign certification, or idempotency. Phase 1 runs the observer profile, so every non-R0 command is rejected even if a request includes an approval handle.

## Adapter authentication requirements

Authentication proves where a request came from; it does not by itself authorize a Dial Smart tenant or command.

### Slack

Slack requests must be verified against the unmodified raw HTTP body before parsing. Require `X-Slack-Request-Timestamp` within the five-minute replay window, build Slack's versioned signature base string, calculate its HMAC-SHA256 with the signing secret, and compare it to `X-Slack-Signature` in constant time. Missing or malformed headers, stale timestamps, bad signatures, or missing secrets fail closed. The signed Slack `team_id` and `user_id` then resolve through the server-owned installation/principal bindings; a response URL is not identity and must be restricted to the authenticated request's response flow. See [Verifying requests from Slack](https://api.slack.com/docs/verifying-requests-from-slack).

### Microsoft Teams

An incoming Bot Framework activity must carry a Bearer JWT that is validated using Microsoft's current OpenID metadata and signing keys. Validate the signature and algorithm plus the documented issuer and audience/application-ID rules, and validate the activity's `serviceUrl` as required before sending a reply. Tenant, conversation, or user fields in the activity are inputs to a server-owned installation/principal lookup, not direct Dial Smart authority. See [Bot Connector authentication](https://learn.microsoft.com/en-us/azure/bot-service/rest-api/bot-framework-rest-connector-authentication?view=azure-bot-service-4.0) and the [Teams bots overview](https://learn.microsoft.com/en-us/microsoftteams/platform/bots/overview).

### Zapier

REST Hook subscription and callback mechanics do not authenticate a Dial Smart operator. A Zapier integration must use a documented authentication scheme, such as OAuth 2.0 or a revocable API key, whose server-side record is bound to one installation, organization, principal/service account, and finite scopes. Secrets must be stored through the platform's credential mechanism, rotatable, revocable, and never accepted in a command body. Subscription identity, callback URLs, and hook payload fields cannot select a tenant or grant command authority. See [REST Hook triggers](https://docs.zapier.com/integrations/build/cli-hook-trigger) and [Zapier authentication](https://docs.zapier.com/integrations/build/auth).

### MCP

MCP clients receive only the certified observer tool catalog. Any requested capability profile other than `observer` fails closed. The server credential must map to one active installation and principal, and the same live membership, scope, durable replay, registry, receipt, and tenant rules apply; transport possession alone is insufficient. Legacy direct-call, SMS, campaign mutation, retry, dispatch, DNC-write, and audit-writing tools are not part of the certified catalog.

## Canary path

The external control plane should advance only when the preceding evidence is retained:

1. Pass strict-schema, deterministic-parser, authorization, intent-hash, exact-retry, payload-collision, tenant-isolation, privilege, and outbox tests locally.
2. Replay the complete database migration chain in a clean supported environment and retain the recovery certificate before deploying its tables, policies, or functions.
3. Deploy one disabled-by-default adapter to an isolated test installation. Verify R0 responses and fixed false authority flags with synthetic data; verify that every R1-R3 and unknown command is rejected.
4. Bind Elite Solar Recovery as the first explicit tenant and run real-input, no-contact shadow observation. Compare the adapter's R0 results and receipts with the source data; create no queue, CRM, provider, call, or SMS effect.
5. Independently certify the dialer/provider path, then run the separate exactly-20-owned-phone canary. The operator plane remains R0 during this step.
6. Only after signed evidence and a human release decision, advance the product through bounded 5, 20, and 50 lead cohorts. R3 remains unavailable from external adapters until its own approval and effect-ledger certification is complete.
7. Add Omega Accounting as the second installation/organization to prove cross-account isolation before considering Noble Gold or Infinite AI. A tenant-isolation failure immediately stops expansion.

No shadow result is permission to contact a lead. No successful R0 query is evidence that calls, texts, consent, DNC enforcement, billing, CRM writes, or provider failover are launch-ready.

## Operational readiness gate

Before an adapter is called production-ready, retain evidence for all of the following:

- clean database replay; reviewed row-level security, grants, security-definer functions, append-only constraints, and cross-tenant negative tests;
- strict transport authentication tests, key rotation/revocation, secret isolation, clock-skew handling, rate limits, request-size limits, and malformed-input rejection;
- durable exact-retry and payload-collision tests across restarts and concurrent deliveries;
- executor idempotency tied to the existing queue/provider effect ledger, with no direct provider or CRM side door;
- durable outbox retry/dead-letter handling that cannot replay the underlying command;
- redacted structured logs, receipt retention, audit export, tenant-scoped metrics, alerts for auth failures/collisions/stuck commands, and traceable command-to-effect IDs;
- adapter and global kill switches that fail closed, plus tested rollback, backup/restore, incident response, and credential-compromise runbooks;
- load and failure-injection tests for timeouts, duplicate webhooks, partial database failures, provider failures, and delayed callbacks;
- consent, DNC, calling-window, owned-phone, provider, billing, and campaign release gates independently certified before any R3 capability; and
- a named human release owner who reviews canary evidence and explicitly approves each cohort expansion.

Until those gates are satisfied and the reviewed commit is deployed, the truthful status is: locally hardened observer design, draft PR, no production operator capability, and no launch authority.
