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
- A disabled-by-default, authenticated signed-release registration endpoint.
  It validates one exact Elite tenant/campaign binding and a server-only HMAC
  before it can persist a release. Registration keeps the release in
  `pending_adapter_provisioning`; it cannot prepare, claim, send, or import.
- A service-only preparation gate and immutable no-PII source/suppression
  attestation record. It can move an exact registered release to `prepared`
  only when a fresh Ed25519-signed proof matches its source reference,
  recipient-manifest digest, suppression digest, count, tenant/campaign/owner,
  expiry window, and active email stop controls. Preparation is not a claim or
  a provider request.
- A summary-only tenant-member status RPC. It exposes status/counts only—not
  recipient records, provider IDs, sender mailboxes, keys, messages, or raw
  webhook payloads.
- A disabled-by-default, exact-owner status endpoint and dashboard card. They
  expose only the latest release state, bounded cohort count, and expiry; they
  cannot mutate the ledger or call a provider.

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
2. Certify and deploy the service-only preparation gate, with its exact
   owner/origin/key configuration and a named test. The source attestation
   builder, database boundary, and disabled authenticated preparation endpoint
   are coded, but no migration or endpoint has been deployed by this work.
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

## Source/suppression attestation contract

`scripts/lib/elite-email-source-attestation.mjs` is an external-only utility
for a maximum 25-record reactivation cohort. It accepts raw data only in the
local source checker, requires explicit per-recipient email permission and a
clear global, tenant, campaign, provider, unsubscribe, spam, and permanent
bounce check, then emits an Ed25519-signed artifact containing digests and
opaque references only. Recipient emails, contact references, and permission
references are deliberately excluded from the artifact and database.

Use `npm run email:elite-solar:create-source-proof -- --template` to view the
external source schema, or run it with external source, recipient-HMAC key,
Ed25519 private-key, signing-ID, signer-reference, and output paths. The
command rejects repository paths for every input and output. Its result is the
safe, no-PII JSON file selected by the Launch Control preparation step.

The proof must be less than five minutes old when issued and no older than 24
hours at expiry. The preparation function additionally refuses evidence that
would expire before the registered release. A current stop control is a hard
no-prepare outcome. Neither component has a provider client, send queue,
recipient import, or network call.

## Release-preparation deployment contract

The Edge function remains unavailable until the secret manager supplies all of
the following exact values for this tenant/campaign:

- `ELITE_EMAIL_RELEASE_PREPARATION_ENABLED=true`;
- exact owner, origin, organization, and campaign IDs;
- the expected source-attestation signing key ID and signer principal
  reference; and
- the Ed25519 SPKI public key as `base64:<standard-base64-DER>`, plus its
  SHA-256 digest.

Only the public verification key belongs here. The source-attestation private
key and recipient-HMAC key must remain in the external source checker, never
in a browser, repository, MCP configuration, or Edge function. The endpoint
requires the configured owner’s JWT and exact browser origin. It only invokes
the service-only preparation RPC; it has no provider HTTP client.

## Release-status deployment contract

The dashboard status card stays unavailable until the release-ledger migration
has been applied and the secret manager sets
`ELITE_EMAIL_RELEASE_STATUS_ENABLED=true` plus the exact owner, origin,
organization, and campaign IDs. The endpoint performs one tenant-bound
database read and returns no recipient, provider-account, sender, copy, or key
data. It never acts as an execution or approval control.

## Release-registration deployment contract

Do not set these in a repository file, browser, MCP configuration, or chat.
After isolated database replay and deployment approval, the secret manager must
hold all of the following for one Elite Solar tenant/campaign:

- `ELITE_EMAIL_RELEASE_REGISTRATION_ENABLED=true`
- exact owner, origin, organization, and campaign IDs;
- the approved `ELITE_EMAIL_RELEASE_REGISTRATION_SIGNING_KEY_ID`; and
- `ELITE_EMAIL_RELEASE_REGISTRATION_SIGNING_HMAC_KEY` as
  `base64url:<43 unpadded characters>` representing exactly 32 random bytes.

The release artifact's `execution_key_id` must exactly match the configured
key ID. A signing mismatch, tenant/campaign mismatch, expired artifact,
recipient-bearing input, or altered no-authority invariant receives a hold and
does not create a database row. A successfully registered row remains
`pending_adapter_provisioning`; it is still ineligible for the existing claim
function until a future server adapter proves live source and suppression
evidence and transitions it to `prepared`.
