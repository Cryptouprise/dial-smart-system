# Campaign contact release gate

This is the final default-deny authorization for a real Retell campaign call.
It is intentionally not a campaign editor, a scheduler, or a launch button.
The system ships with no release rows, so every campaign call is denied until a
separate, reviewed release record exists.

## What the gate checks

Immediately after the live Retell agent and LLM are fetched, the outbound-call
edge function requires an exact active release for all of the following:

- organization, user, campaign, and lead;
- Retell provider, agent ID/version, LLM ID/version, and owned caller-number
  ID;
- a small explicit lead cohort (5, 20, 50, or a bounded normal cohort);
- an unrevoked, unexpired evidence bundle; and
- the campaign, lead, enrollment, membership, and caller-number ownership
  relationships still being current.

The decision is made before a credit reservation and again at the physical
Retell boundary. A missing, malformed, unavailable, expired, revoked, changed,
or mismatched result is a denial. It does not fall back to a UI flag, a test
flag, a campaign status, or a provider default.

## Evidence binding

Each immutable release records SHA-256 fingerprints for the compiled campaign
bundle, database certificate, owned-phone/provider proof, global-stop drill,
seller-DNC drill, voice-opt-out drill, conversation suite, HighLevel shadow
reconciliation, approval chain, and independent external trust root. The
database stores only these fingerprints, not lead data or credentials.

Rows cannot be edited or deleted. The sole permitted mutation is revocation;
revocation is permanent. Cohort members are immutable and cannot be added to an
expired or revoked release.

## Current operating status

This implements the enforcement boundary and its isolated database contract.
It does **not** create a Solar Exit release, contact a lead, reserve credit,
deploy an edge function, or change Retell, Telnyx, HighLevel, or any CRM.

Before a human may create a first `canary_5` release, the team still needs a
reviewed service-only release-builder workflow plus real, independently
authenticated evidence for the exact Solar Exit tenant, caller ID, agent/LLM
versions, and five owned/authorized test contacts. A release record is not a
substitute for consent, DNC, calling-hours, billing, callback, or provider
webhook controls; those continue to be separately enforced at the call
boundary.

## Verification

Run the pure edge-gate test locally:

```powershell
npm run certify:campaign-contact-release
```

The full SQL contract runs only in the disposable fresh-database certification
project. It proves no release means no call, changed LLM versions are denied,
release evidence and cohorts are immutable, revocation denies immediately, and
browser roles cannot read or invoke the gate.
