# Dial Smart MCP observer server

This package is a fail-closed, read-only MCP observer draft. It is not a production control plane and does not authorize calls, texts, campaign launch, queue changes, CRM writes, or provider spend.

## Certified catalog

The server exposes exactly four tools in its only accepted capability profile, `observer`:

- `dialsmart_whoami`
- `dialsmart_system_stats`
- `dialsmart_list_campaigns`
- `dialsmart_get_campaign`

Every other profile is rejected. Legacy lead, call, SMS, phone-number, campaign-mutation, retry, dispatch, DNC-write, and audit-writing tools remain internal historical code and are not advertised to MCP clients.

Arguments are enforced at runtime as well as described in JSON Schema. Unknown fields are rejected. Campaign inspection requires an exact canonical lowercase UUID, so path traversal and alternate API-route selection cannot pass through the observer catalog.

## Current launch status

The production API gateway is compile-time disabled. A real server credential is not yet bound through the reviewed external installation/principal and durable receipt plane. Consequently, this package must not be configured against production or described as live.

Do not mint an admin key for this server, select an organization with an unordered SQL query, deploy the legacy gateway, or widen `DIALSMART_MCP_PROFILE`. Those actions bypass the tenant and certification boundary.

The remaining activation path is:

1. Certify the complete database replay and generated types in a fresh supported environment.
2. Provision one revocable, least-privilege credential bound server-side to one active installation, organization, and owner/admin principal.
3. Install the shared durable replay/receipt submitter and tenant-scoped observer executor.
4. Verify exact-retry, collision, cross-tenant, revocation, and zero-authority behavior with synthetic data.
5. Deploy to an isolated installation only after the reviewed commit and evidence are approved.

## Local certification

From this directory:

```bash
npm ci --ignore-scripts
npm audit
npm run build
npm test
```

The tests verify the exact four-tool catalog, runtime argument bounds, noncanonical campaign rejection, path-traversal rejection, and refusal of non-observer profiles.

## Local process contract

The executable requires both `DIALSMART_API_KEY` and an explicit `DIALSMART_API_URL` before it starts. That process contract does not make a credential or endpoint safe. Until the activation gates above are complete, do not point the package at a live gateway.

See [`../docs/EXTERNAL_OPERATOR_CONTROL_PLANE.md`](../docs/EXTERNAL_OPERATOR_CONTROL_PLANE.md) for the shared tenant, authentication, replay, and canary rules.
