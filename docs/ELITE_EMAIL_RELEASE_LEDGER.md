# Elite email execution ledger

The 20260720120000_elite_email_execution_ledger.sql migration is the database
contract for the eventual native Elite Solar email adapter. It is **not applied
or deployed by this repository work**. It must first clear the project's
isolated database-recovery and schema-replay process.

## What it adds

- A tenant-, owner-, campaign-, provider-, release-fingerprint-, and
  idempotency-bound release row.
- A strict release state machine beginning at
  pending_adapter_provisioning; a normal insert can never start prepared or
  claimed.
- A service-role-only atomic claim that locks one prepared release and moves it
  to claimed exactly once. Any non-claim result is a hard
  **do-not-call-the-provider** outcome.
- A check of the existing global, tenant, campaign, provider, and channel stop
  controls before a claim; the fixed channel vocabulary now includes email.
- Immutable, deduplicated HMAC receipt rows for provider events.
- A disabled-by-default, authenticated Mailgun receipt endpoint. It verifies
  Mailgun's HMAC, a bounded timestamp window, an exact server-owned
  release/account/domain binding, and a one-time HMAC-redacted replay token
  before it can record a receipt. It cannot send, import a recipient, read a
  mailbox, or mutate a suppression list.
- A summary-only tenant-member status RPC. It exposes status/counts only—not
  recipient records, provider IDs, sender mailboxes, keys, messages, or raw
  webhook payloads.

The schema deliberately has no send queue, recipient import, email address,
mailbox, message body, provider key, arbitrary URL, or generic HTTP column.
Those do not belong in a release ledger.

## State boundary

    pending_adapter_provisioning
      -> prepared
      -> claimed
      -> provider_accepted
      -> reconciliation_required | completed

    Any eligible state -> held | revoked

Prepared does not mean send. It is only the state a future server adapter may
attempt to claim after independently verifying the signed release, current
recipient-manifest digest, suppression snapshot, exact approved copy, sender,
provider binding, and human authorization.

## What remains before any execution

1. Certify and apply this migration in an isolated staging/recovered database;
   do not push the current divergent migration history straight to production.
2. Build the server adapter that verifies the signed release using a
   server-only key and creates a release row only after all independent live
   gates are present.
3. Add a recipient source designed for the approved campaign scope, plus
   source/consent and suppression checks. The adapter must never accept raw
   recipient data from the browser or MCP.
4. Implement one allowlisted Instantly or Mailgun operation behind the atomic
   claim, then record provider acceptance and authenticated receipts. Mailgun
   receipt intake is now coded but remains un-deployed and disabled until the
   preceding migration, exact release binding, server-only keys, and a named
   test are certified.
5. Run the first company-owned/synthetic provider test, then a named
   human-reviewed small cohort.

Until all five steps are evidenced, the ledger is a safety foundation, not a
provider connection or launch authorization.
