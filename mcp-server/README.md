# Dial Smart MCP observer server

This package is the read-only operator companion for the Elite Solar Recovery pilot. It has no capability to call, text, launch a campaign, change a queue, write to GHL/another CRM, change a provider, or spend money.

## Certified catalog

The sole accepted profile is `observer`. It exposes exactly these six tenant-scoped R0 tools:

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

The dedicated `mcp-observer` Edge source exists, but is compile-time disabled. No MCP credential, tenant installation, durable receipt deployment, or public endpoint has been provisioned. Therefore this package must not be configured against a live URL or described as active.

Do not mint an admin key, point this package at `api-gateway`, deploy the disabled adapter, or widen `DIALSMART_MCP_PROFILE`. Those paths bypass the reviewed observer boundary.

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

The tests verify the exact six-tool catalog, strict runtime argument bounds, direct observer-envelope behavior, refusal of non-observer profiles, and that no legacy effect tool is advertised.

The executable requires both `DIALSMART_API_KEY` and an explicit `DIALSMART_API_URL` before it starts. When this is eventually provisioned, that URL must be the reviewed `mcp-observer` endpoint—not a legacy gateway.

See [`../docs/EXTERNAL_OPERATOR_CONTROL_PLANE.md`](../docs/EXTERNAL_OPERATOR_CONTROL_PLANE.md) for the shared tenant, authentication, replay, and canary rules.
