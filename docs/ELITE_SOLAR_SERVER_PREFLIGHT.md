# Elite Solar server preflight

`elite-solar-preflight` is the browser-safe, server-owned companion to the
local operator preflight. It exists so the signed-in Elite owner can request a
redacted provider-readiness snapshot without exposing provider keys to the
browser or invoking any campaign/lead/contact route.

It is not deployed or provisioned by this repository work. Until the exact
deployment settings below exist, it responds with
`ELITE_SOLAR_PREFLIGHT_NOT_PROVISIONED` before authentication, database access,
or provider access.

## Fixed boundary

The endpoint accepts only `POST {}`. It rejects query parameters, request
fields, non-owner sessions, unknown origins, malformed bearers, and oversized
bodies. It never accepts a provider URL, agent ID, email domain, mailbox,
recipient, campaign, contact, or credential from the browser.

When provisioned, it can make only these official `GET` requests:

| Lane | Maximum reads | Fixed endpoint |
| --- | ---: | --- |
| Retell | 2 | Exact configured agent version, then its exact bound LLM version |
| Instantly | 1 | `/api/v2/accounts?limit=1` |
| Mailgun | 1 | Exact configured sender-domain read on the US or EU API base |

No POST, PUT, PATCH, DELETE, contact lookup, recipient import, campaign
creation, mailbox listing, template action, provider write, or external message
exists in this endpoint. Its output excludes all provider keys, IDs, URLs,
prompts, domains, mailbox data, response bodies, and customer data.

## Required deployment values

Set these only in the server-side secret/configuration store, never in the
browser, repository, shell history, chat, campaign files, or MCP settings:

```text
ELITE_SOLAR_PREFLIGHT_ENABLED=true
ELITE_SOLAR_PREFLIGHT_OWNER_USER_ID=<exact signed-in Elite owner UUID>
ELITE_SOLAR_PREFLIGHT_ALLOWED_ORIGIN=https://<exact-dashboard-origin>

RETELL_API_KEY=<least-privilege read key>
RETELL_AGENT_ID=<reviewed agent identifier>
RETELL_AGENT_VERSION=<reviewed numeric version>
RETELL_EXPECTED_WEBHOOK_URL=<canonical HTTPS webhook>

INSTANTLY_API_KEY=<least-privilege read key>
MAILGUN_API_KEY=<least-privilege read key>
MAILGUN_DOMAIN=<verified sender domain>
MAILGUN_REGION=eu # only when the EU Mailgun base is used
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are required by the edge runtime
only to validate the caller's signed-in user. A service-role bearer is never
accepted from a caller. The global provider configuration is intentionally
bound to exactly one Elite owner; do not reuse this endpoint for another tenant
or provider account. Multi-account provider mapping must use a separately
tenant-scoped Vault-backed design.

## Operator experience

The Elite Launch Control panel contains an explicit **Check secured provider
readiness** button. Opening the panel makes no request. A button press calls
only this endpoint with `{}` and displays only one of three finite redacted
states:

- configuration required;
- readiness blocked/attention required; or
- readiness observed.

Every result retains false contact, launch, queue, CRM, provider-write, and
spend authority. A healthy result is never consent evidence, a source shadow,
a release, or permission to contact anyone.

## Verification before deployment

```powershell
npm run certify:elite-solar-preflight
npm run campaign:solar-exit:operator-preflight
```

After deployment, request the preflight only from the exact configured Elite
owner and dashboard origin. Review its redacted output, then continue with the
signed 25-record zero-contact source shadow and owned-phone evidence. Do not
use a healthy provider read to bypass either gate.
