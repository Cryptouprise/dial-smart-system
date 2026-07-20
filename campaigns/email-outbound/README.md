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
