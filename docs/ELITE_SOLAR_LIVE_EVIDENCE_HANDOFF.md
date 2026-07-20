# Elite Solar: first live-evidence handoff

This is the short list for moving the already-tested, review-only Elite Solar
pilot into actual evidence gathering. It is not permission to contact anyone.
Do not paste leads, phone numbers, emails, records, exports, screenshots with
customer data, API keys, or provider tokens into chat or this repository.

## 1. Campaign identity and human approvals

Provide external, reviewable references for:

- Exact legal seller and DBA; approved identity, postal address, and public
  offer/product source.
- The booking destination, human reply owner, and stated service boundaries.
- Named copy, compliance, and business-owner approvers, plus the applicable
  state/jurisdiction review.
- Exact Retell agent/version candidate, caller identity, calling-window policy,
  recording/review policy, and escalation owner.

These references bind the candidate. A good-looking script, a GHL record, or a
historical appointment does not substitute for them.

## 2. Signed, zero-contact source shadow

Prepare an external, short-lived **25-record** database-reactivation export.
Every record must include the original seller/source/form disclosure evidence,
the original consented phone for the intended call, state, and current
suppression/revocation status. Keep the real rows outside the repository.

Create keys outside the repository, then use the direct-import tools to sign
and evaluate the export. The result must be a clean redacted, tenant-bound,
zero-contact shadow report. It is evidence only; it does not authorize a
provider request or campaign release.

## 3. Owned-phone and optional email-provider setup

- Put Retell and any provider keys only in the approved deployment secret
  store. Never put them in a shell history, `.env` file, campaign JSON,
  browser field, MCP config, or chat.
- Configure 20 company-owned test phone lifecycles for the Retell candidate;
  preserve human review of recording/transcript, webhook, DNC, global-stop,
  billing, and reconciliation evidence.
- For email, select the provider role: Instantly for a sequenced outbound
  cohort, Mailgun for verified sending-domain/templates/events. Provide a
  verified sender, reply owner, postal identity, unsubscribe path, source
  basis, and a current suppression snapshot. The first email cohort remains
  1-25 reviewed recipients after a separate release.

Run only redacted readiness checks after secrets are configured:

```powershell
npm run ghl:solar:readiness
npm run email:providers:readiness
npm run campaign:solar-exit:test
```

## What happens after the handoff

1. Build the isolated launch-disabled candidate with non-secret references.
2. Verify the signed source shadow; resolve every mismatch or hold.
3. Test the Retell candidate only with synthetic or company-owned phones.
4. Submit the result for named human review.
5. Only after the complete evidence chain passes may a reviewer request a
   manually reviewed five-person canary. There is no automatic launch path.

The current package keeps direct import as the primary path; GHL is useful but
not required. Instantly and Mailgun are optional execution providers, not
campaign sources of truth.
