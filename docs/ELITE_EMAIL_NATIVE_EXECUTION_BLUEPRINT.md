# Native email execution blueprint

## Decision

DialSmart should be the single operator experience and audit system. Instantly
and Mailgun should remain execution providers behind tightly scoped adapters;
they are not separate sources of truth and their credentials never reach the
browser, a chat prompt, an MCP client, or a campaign file.

Use the providers for distinct jobs:

| Provider | Native product role | First permitted use |
| --- | --- | --- |
| Instantly | Sequenced cold or reactivation outreach, mailbox health, campaign events, and reply routing | A human-approved 1-25-recipient cohort through a dedicated tenant adapter |
| Mailgun | Verified sender-domain delivery, reusable templates, message events, and transactional/operational mail | A separately approved, small, sender-verified message cohort or product notification |

This division follows the current provider capabilities: Instantly API V2
exposes scoped campaign and lead operations, while Mailgun exposes message,
domain-template, and domain/account webhook APIs. See [Instantly API V2
introduction](https://developer.instantly.ai/api-reference/introduction),
[Instantly lead operations](https://developer.instantly.ai/api-reference/groups/lead),
[Mailgun messages](https://documentation.mailgun.com/docs/mailgun/api-reference/send/mailgun/messages),
and [Mailgun webhooks](https://documentation.mailgun.com/docs/mailgun/user-manual/webhooks/webhooks).

## What "native" means

The customer sees one campaign in DialSmart. The campaign record owns the
brief, approved copy version, source evidence, sender identity, suppression
snapshot, cohort size, approval bindings, event receipts, and next action.
Provider-specific identifiers are attachment references, not the campaign's
identity.

```text
Campaign brief + approved research
             |
             v
DialSmart preflight and immutable release proposal
             |
             +-- no evidence / failed gate --> held, no provider request
             |
             v
Named human approval for a bounded cohort
             |
             v
Tenant-scoped server adapter --> Instantly OR Mailgun
             |
             v
Verified provider webhook --> normalized receipt + suppression/reply workflow
             |
             v
DialSmart operator inbox and morning beat
```

The browser never calls either provider. MCP can explain a campaign or return
a redacted status, but cannot retrieve credentials, upload recipients, create
a campaign, or send email. Server-side adapters must use one provider account
reference bound to one organization and one campaign release.

## Release state machine

`draft` -> `preflight_held | preflight_ready` -> `reviewed_cohort` ->
`human_execution_authorized` -> `provider_accepted` ->
`receipts_reconciling` -> `completed | paused | held`

Only the server adapter may move a release from
`human_execution_authorized` to `provider_accepted`. That request must be
single-use, expire within 24 hours, carry a cohort digest, an idempotency key,
the provider account reference, and the exact reviewed copy version. A retry
reuses the same idempotency key and never increases the cohort.

The existing `email:outbound:draft` and `email:elite-solar:handoff` commands
already build the first three review artifacts without recipient data or
provider calls. They are deliberately not send commands.

Before a future adapter sees a candidate, `email:elite-solar:review-release`
now verifies the reviewed draft, handoff proposal, and signed release together.
It returns only a redacted, no-send result and does not replace the adapter's
own signature, replay, suppression, provider, or approval checks.

## Required adapter contract

Each future adapter must provide four isolated operations:

1. `readiness`: a redacted read-only account/domain check. It must expose no
   mailbox address, API key, raw lead, inbox message, or recipient data.
2. `prepare`: verify the immutable release, exact tenant binding, sender,
   source/suppression digests, copy version, budget, and time window. It
   creates no provider resource.
3. `execute`: consume one signed, unexpired release for the bounded cohort.
   It can perform only the explicitly approved provider operation and records
   the provider response as a redacted receipt.
4. `receive_event`: authenticate the provider webhook, deduplicate it, map it
   to a minimal event vocabulary, and immediately make unsubscribe, complaint,
   bounce, or reply events available to suppression and operator workflows.

There must be no generic `provider.fetch(url, body)` or arbitrary MCP tool.
Every provider operation is allowlisted, versioned, idempotent, tenant-bound,
and certified before it is exposed in the app.

## Tomorrow's first use: Elite database reactivation

This is not a cold-email send. It is a small, reviewable reactivation test for
previously engaged people whose source basis, suppression state, and email
permissions are evidenced.

1. Put the sender domain, reply owner, booking destination, postal identity,
   and suppression source in the approved plan outside this repository.
2. Store a least-privilege provider key as a deployment secret, then run the
   existing one-request redacted readiness check. Do not put a key in chat,
   `.env`, the browser, an MCP configuration, or a campaign JSON file.
3. Use the approved Elite copy and compile the no-PII draft plus its 1-25
   recipient handoff proposal.
4. A named reviewer verifies the real recipient manifest and current
   suppression export outside the handoff compiler. The reviewed digest must
   match the release.
5. Implement and certify the appropriate tenant adapter before it gets a
   provider-write key. Start at one recipient, then the bounded 1-25 cohort;
   reconcile acceptance, bounce, unsubscribe, complaint, and reply receipts
   before any expansion.

## Website research and agent copy

When public company/product URLs are supplied, the agent may build a
versioned research brief and draft copy from public material. It must label
inferences, preserve source URLs, avoid invented guarantees, and keep the
research/copy stage separate from recipient selection and provider execution.
The exact source evidence and approved copy digest are what bind an execution
release—not a free-form agent conversation.

## Current boundary

Today, the product has the review-only campaign copy, no-send compiler,
small-cohort handoff proposal, a signed no-send execution-release candidate,
read-only readiness checks, and a pure redacted provider-event receipt
contract. The release candidate is stored outside the repository, contains no
recipient data, and must still be verified and single-use claimed by a future
tenant-bound server adapter; it cannot send or create a provider resource. The
legacy Resend endpoint is hard-disabled and included in contact-egress
certification; it is not a fallback route. No Instantly or Mailgun campaign,
recipient, mailbox, template, webhook, or email has been created or sent by
this work.
