# Outbound email: Instantly and Mailgun draft boundary

This folder is the beginning of a separate outbound-email lane. It is not part
of the Elite Solar calling campaign, and it cannot import recipients, create a
provider campaign, change a queue, or send a message.

`instant-mailgun-draft.template.json` is a non-PII, intentionally held example.
Copy it outside the repository, replace the placeholder references with real
evidence references, and compile it:

```powershell
npm run email:outbound:draft -- --input C:\safe\approved-email-plan.json
```

The compiler accepts only an evidence plan. It rejects recipient data,
mailbox addresses, credentials, arbitrary provider options, and unknown fields.
An all-green plan is still only `draft_ready_for_human_provider_review`; its
provider action remains `none` and it grants no contact, launch, queue, CRM, or
spend authority.

`elite-solar-reactivation-copy.md` is the companion, review-only copy pack for
previously engaged Elite Solar Recovery contacts. It is deliberately distinct
from a cold-prospecting campaign and from the Solar calling campaign.

## Required evidence before a later provider handoff

1. The source is identified, permission/source basis is reviewed, and the list
   is hygiene-checked.
2. The sender domain, reply handling, and provider binding are verified.
3. Subject/body copy, claims, sender identity, postal address, unsubscribe path,
   and jurisdiction review are approved.
4. Suppressions are synchronized and provider/account health is confirmed.
5. A separate, signed recipient-import and release process authorizes a small
   staged campaign.

## Elite Solar small-cohort provider handoff

After a reviewed handoff proposal exists, create a separate, signed, **no-send**
execution-release candidate outside this repository. This is evidence for a
future tenant-bound adapter; it does not import a recipient, create a provider
campaign, or send email.

```powershell
npm run email:elite-solar:provision-release-key -- --destination C:\safe\elite-email-release-key --key-id elite-email-release-v1
npm run email:elite-solar:release-candidate -- --template
npm run email:elite-solar:release-candidate -- --proposal C:\safe\elite-handoff.json --request C:\safe\elite-release-request.json --hmac-key-file C:\safe\elite-email-release-key\elite-solar-email-execution-release-hmac-v1.bin --output C:\safe\elite-execution-release.json
npm run email:elite-solar:release-candidate -- --verify --input C:\safe\elite-execution-release.json --hmac-key-file C:\safe\elite-email-release-key\elite-solar-email-execution-release-hmac-v1.bin
```

The request contains only a key ID, approved signer reference, bounded
idempotency key, and expiry no later than the existing handoff. Keep the raw
recipient manifest, provider key, and release key out of the repository and
chat. A future adapter must independently verify the signature, durable
single-use claim, live source/suppression state, provider binding, and human
approvals before it is even allowed to make a provider request.

For the Elite Solar Recovery **database-reactivation** email lane, a second
compiler can prepare a 1–25-recipient, non-PII handoff proposal for a named human
to execute in Instantly or Mailgun. It accepts only the reviewed draft plan and
a separate release request containing references plus recipient-list and
suppression digests. It never receives recipient rows, email addresses, API
keys, or send options, and it cannot call either provider.

Print a safe request shape first:

```powershell
npm run email:elite-solar:handoff -- --template
```

After the existing draft compiles green, store the review-only release request
outside the repository and compile the handoff:

```powershell
npm run email:elite-solar:handoff -- --draft C:\safe\approved-email-plan.json --release C:\safe\elite-email-release.json
```

The result remains `awaiting_separate_human_provider_execution` with
`provider_action: none`. A named reviewer must independently verify the actual
recipient manifest, suppression snapshot, provider account, and final copy
before any provider-side import or send.

This boundary keeps Instantly or Mailgun as an external execution provider while
DialSmart owns the auditable campaign plan, review evidence, and safety gates.
The older Resend edge function is separately hard-disabled and is now included
in the repository-wide contact-egress certification. It is not an alternative
execution path for this campaign.

The native product/provider design, adapter boundary, and first-cohort release
sequence are in [the email execution blueprint](../../docs/ELITE_EMAIL_NATIVE_EXECUTION_BLUEPRINT.md).

## Read-only provider readiness

The following commands each make one authenticated `GET` and output a redacted
health summary. They never list leads, inspect an inbox, create a campaign,
alter warmup, or send mail. Keep each key in the local process environment; do
not put it in a plan file, command argument, or this repository.

```powershell
$env:INSTANTLY_API_KEY = '<read-only-accounts-key>'
npm run email:instantly:readiness

$env:MAILGUN_API_KEY = '<mailgun-key>'
$env:MAILGUN_DOMAIN = '<verified-sender-domain>'
npm run email:mailgun:readiness
```

For Instantly, the account probe reads a one-account sample only and emits
counts of setup, warmup, and tracking-domain indicators. For Mailgun, the
domain probe reads the configured sender-domain state and DNS-record counts.
A passing probe proves only that the configured read endpoint is reachable; it
is not campaign, recipient-import, or send authorization.

For a single redacted morning check, use:

```powershell
npm run email:providers:readiness
```

With neither provider configured it makes zero provider-read probe calls and
lists only the required environment-variable names. With a configured provider
it invokes that provider's existing one-request read-only probe. It never falls
through to a send, import, mailbox, campaign, or webhook operation.

## Future provider-event receipts

`scripts/lib/email-provider-event-receipt.mjs` is the future server-adapter
contract for authenticated Instantly and Mailgun webhooks. It converts a
provider payload into a tenant-bound, HMAC-redacted receipt, never a raw
recipient record. Replies, bounces, unsubscribes, complaints, and correlation
failures require operator/suppression review; the library has no database,
provider, or message capability. It is intentionally not exposed as a CLI or
public webhook until a tenant-bound signature verifier, replay store, event
receipt table, and suppression workflow are deployed and certified.
