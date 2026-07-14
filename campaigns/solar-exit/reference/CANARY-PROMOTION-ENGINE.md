# Solar Exit canary promotion engine

This is a read-only decision engine. It does not contact Retell, GHL, Supabase, or any lead, and its output never independently authorizes a call or launch. Every evidence-chain certificate carries `authorization_scope: "evidence_chain_only"`, `contact_authorized: false`, `launch_authorized: false`, and `external_trust_required: true`. It must be retained as a file-backed artifact and independently authenticated by the external launch trust root before it can contribute evidence to the separate production gate.

The fixed progression is:

`20 owned-phone calls -> 5 consented leads -> 20 consented leads -> 50 consented leads -> normal operation`

Any invalid input, reviewer hold, hard failure, or failed threshold returns `decision: "hold"` and no certificate. Every cohort requires its exact sample size and, after owned-phone certification, the exact predecessor certificate for the same bundle, provider agent/LLM versions, organization, GHL location, prompt, eligibility policy, and disposition policy.

Zero-tolerance gates are DNC/suppression, exact consent, wrong tenant, duplicate call/lead/provider call ID, provider identity/version, and global stop. The quantitative gates require 100% canonical webhook, terminal reconciliation, billing, and GHL shadow matches; zero mismatch rate; zero billing variance; webhook terminal evidence within 60 seconds; and terminal reconciliation within five minutes.

Each result carries immutable evidence IDs and SHA-256 digests. An accountable reviewer, distinct from the cohort operator, must bind their review to the digest returned by `computeCanaryEvidenceDigest`. These hashes provide version and tamper binding; the surrounding release process remains responsible for authenticating the reviewer and retaining the referenced evidence.

## Generate a complete evidence form

Use one of four deterministic templates instead of hand-authoring 5, 20, or 50 result records:

```text
node scripts/evaluate-solar-exit-canary.mjs --template owned_phone_20
node scripts/evaluate-solar-exit-canary.mjs --template live_5
node scripts/evaluate-solar-exit-canary.mjs --template live_20
node scripts/evaluate-solar-exit-canary.mjs --template live_50
```

Templates print to stdout only. The CLI has no template file-writing option, so it cannot create or overwrite a local file. Every generated form is structurally valid but intentionally evaluates to `hold`: consent and suppression checks are false, comparison metrics are unmatched, hashes and IDs are conspicuous replacement values, the reviewer decision is `hold`, and no certificate is issued. Live-stage forms include a syntactically complete placeholder predecessor certificate that must be replaced with the actual retained certificate from the preceding cohort.

After replacing every placeholder with retained evidence, compute the binding digest, have an independent reviewer record the decision, then evaluate the completed file. Template generation itself never authorizes contact and never touches Supabase, Retell, GHL, a network, or a lead.

Evaluate a JSON file without writes:

```text
node scripts/evaluate-solar-exit-canary.mjs --input evidence/owned-phone-results.json
```

Exit code `0` means the cohort passed (`promote` or `normal`), `2` means `hold`, and `1` means the file could not be read or parsed. Use `--evidence-digest` to compute the reviewer-binding digest before final review.
