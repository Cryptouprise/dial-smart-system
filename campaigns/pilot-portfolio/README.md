# Dial Smart multi-account pilot portfolio

This is the operator-facing source of truth for the first four pilot tenants:
Elite Solar Recovery, Omega Accounting, Noble Gold, and Infinite AI.

It is deliberately a **read-only planning artifact**. It cannot create an
organization, access a CRM, provision a provider, read lead data, spend money,
or contact a person. Each pilot must have its own organization, provider
credentials, caller IDs, lead list, consent evidence, release candidate, and
approval chain. Nothing in this portfolio grants authority to share a resource
or to start a campaign.

## Use it

From the repository root:

```powershell
npm run portfolio:pilot:verify
npm run portfolio:pilot:summary
```

The verifier rejects duplicate tenant identities, any enabled production or
provider/CRM/spend authority, unknown pilots, an altered rollout order, and
claims that a campaign bundle exists when it has not been supplied.

## Current interpretation

| Pilot | Current state | First real next gate |
| --- | --- | --- |
| Elite Solar Recovery | Offline Solar Exit bundle and copy are review-ready | Isolated candidate plus zero-contact GHL shadow evaluation |
| Omega Accounting | Tenant test lane is reserved; campaign facts/copy are not supplied | Approved service definition, seller, consent and claims policy |
| Noble Gold | Tenant test lane is reserved; campaign facts/copy are not supplied | Approved service definition, seller, consent and claims policy |
| Infinite AI | Tenant test lane is reserved; campaign facts/copy are not supplied | Approved service definition, seller, consent and claims policy |

No pilot can skip zero-contact shadow validation, 20 company-owned-phone calls,
or the manually reviewed 5 → 20 → 50 lead canary sequence. A company may only
advance on its own evidence; a green result for one tenant does not advance any
other tenant.
