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

## Required evidence before a later provider handoff

1. The source is identified, permission/source basis is reviewed, and the list
   is hygiene-checked.
2. The sender domain, reply handling, and provider binding are verified.
3. Subject/body copy, claims, sender identity, postal address, unsubscribe path,
   and jurisdiction review are approved.
4. Suppressions are synchronized and provider/account health is confirmed.
5. A separate, signed recipient-import and release process authorizes a small
   staged campaign. That future process is deliberately not implemented here.

This boundary keeps Instantly or Mailgun as an external execution provider while
DialSmart owns the auditable campaign plan, review evidence, and safety gates.
