# Contact egress surface audit

The product has older Retell, Twilio, Telnyx, Assistable, broadcast, test, and
demo endpoints in addition to the canonical Solar Exit path. This audit makes
their source-level safety state explicit and verifies it in CI.

Run:

```powershell
npm run certify:contact-egress-surfaces
```

It verifies these rules:

- the sole certified Retell campaign boundary uses the final per-lead,
  version-bound campaign contact-release evaluator;
- direct broadcast, Telnyx, Assistable, public-demo, and legacy Twilio test
  surfaces remain hard-disabled in source; and
- an environment variable, UI flag, or stale deployment configuration cannot
  substitute for that source lock.

This is not a deployment attestation. A deployed environment must still be
confirmed to run the reviewed commit before it can inherit this result.
