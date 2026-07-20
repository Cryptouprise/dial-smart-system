# Dial Smart MCP operator server

This package is the read-only operator companion for the Elite Solar Recovery pilot. It has no capability to call, text, launch a campaign, change a queue, write to GHL/another CRM, change a provider, or spend money.

## Offline Elite playbook

Set `DIALSMART_MCP_PROFILE=elite-pilot-playbook` to run four credential-free,
static Elite tools locally. This profile is useful immediately in an MCP client:
it explains the signed source shadow, testing ladder, email draft lane, and
next gate without reading or transmitting any tenant, campaign, lead, contact,
provider, credential, or browser data. It requires neither `DIALSMART_API_KEY`
nor `DIALSMART_API_URL`.

The offline profile exposes exactly:

- `dialsmart_elite_pilot_guide`
- `dialsmart_elite_source_shadow_plan`
- `dialsmart_elite_test_plan`
- `dialsmart_elite_email_draft_plan`

Every response is explicitly `offline`, has `provider_action: none`, and grants
no contact, launch, queue, CRM, or spend authority. This is not a fallback for
the authenticated observer and cannot show live campaign status.

## Authenticated observer catalog

The `observer` profile exposes exactly these six tenant-scoped R0 tools:

- `dialsmart_operator_context`
- `dialsmart_system_status`
- `dialsmart_elite_solar_brief`
- `dialsmart_elite_solar_pulse`
- `dialsmart_list_campaigns`
- `dialsmart_inspect_campaign`

Every tool sends the shared `control.command.v1` read envelope to the dedicated `mcp-observer` endpoint. The client produces a new replay-safe request ID and timestamp per request; a transport retry reuses that same envelope. The endpoint must independently derive the organization, live owner/admin membership, scopes, and fixed no-authority result. A client cannot name a tenant, select execute mode, or set an authority flag.

Runtime validation rejects unknown fields. Campaign inspection requires an exact canonical lowercase UUID. The only `include` values are `validation`, `live_stats`, `dispositions`, and `release_status`.

Historical lead, call, SMS, provider, campaign-mutation, retry, dispatch, DNC-write, and audit-writing code is deliberately not advertised to an MCP client. The old API gateway is not a compatible MCP endpoint.

## Current launch status

The dedicated `mcp-observer` Edge source exists, but is compile-time disabled. No MCP credential, tenant installation, durable receipt deployment, or public endpoint has been provisioned. Therefore the authenticated observer package must not be configured against a live URL or described as active. The separate `elite-pilot-playbook` profile is static and safe to run locally now.

Do not mint an admin key, point the observer profile at `api-gateway`, deploy the disabled adapter, or widen the observer catalog. The explicit offline playbook profile never carries a credential or an endpoint and cannot be repointed to one.

The activation evidence required for an isolated staging installation is:

1. A clean database replay and generated types in a supported environment.
2. One revocable, least-privilege API key bound server-side to one active **MCP** installation, Elite Solar Recovery organization, and owner/admin principal.
3. Durable receipt/replay, identity revocation, scope narrowing, collision, and tenant-isolation evidence with synthetic data.
4. A reviewed release that enables only the isolated R0 endpoint.
5. A separate Elite shadow-import and owned-phone path before any campaign contact is considered.

None of those steps grants contact authority to the MCP server.

## Local certification

From this directory:

```bash
npm ci --ignore-scripts
npm audit
npm run build
npm test
```

The tests verify the exact six-tool authenticated observer catalog, strict runtime argument bounds, the static no-authority offline playbook catalog, direct observer-envelope behavior, and that no legacy effect tool is advertised.

The executable requires both `DIALSMART_API_KEY` and an explicit `DIALSMART_API_URL` before it starts. When this is eventually provisioned, that URL must be the reviewed `mcp-observer` endpoint—not a legacy gateway.

That credential requirement applies only to `observer`. The explicit
`elite-pilot-playbook` profile is credential-free, static, and must never be
configured with an endpoint or used as a source of live status.

See [`../docs/EXTERNAL_OPERATOR_CONTROL_PLANE.md`](../docs/EXTERNAL_OPERATOR_CONTROL_PLANE.md) for the shared tenant, authentication, replay, and canary rules.
