# MCP observer activation checklist

This is a future **isolated staging** checklist, not a deployment guide for a live dialer. The checked-in `mcp-observer` Edge entry point is compile-time disabled and must stay disabled until every item below has independently retained evidence. It cannot be unlocked through an environment variable, a database value, or an MCP client setting.

Do not deploy `api-gateway`, mint an admin key, use a key that is not MCP-bound, or point this package at an API-gateway URL. Those are historical paths that bypass the reviewed observer receipt boundary.

## What is safe now

From the repository root:

```powershell
npm run certify:mcp
npm run certify:control-plane
```

These are local code checks. They do not contact a lead, CRM, provider, or GHL.

## Preconditions for a proposed staging activation

1. Rebuild and certify the database migration history in an isolated, disposable staging project. Retain the recovery certificate.
2. Create one isolated testing organization and one company-owned owner/admin test user. Do not use Elite Solar Recovery data yet.
3. Create an active `mcp` external-control installation and principal bound to that exact organization and test user. Bind only domain-separated identifier HMACs and the verification-evidence digest—never a raw credential.
4. Mint one short-lived, revocable `dsk_live_` key constrained to `system:read` and `campaigns:read`. The runtime must resolve it to the matching **MCP** installation/principal, not a Zapier or legacy API binding.
5. Set the server-side identifier-HMAC secret and version in the isolated deployment secret store. Do not put either into the MCP config, Git, browser, logs, or a command argument.
6. Run synthetic request evidence for malformed bodies, wrong tenant, revoked key, narrowed role/scope, exact replay, event-ID collision, every R1–R3 command, and result-authority widening. All must fail closed.
7. Obtain independent review approving a code change that enables only the isolated R0 endpoint. No real data, provider, CRM, queue, text, call, or campaign activation belongs in this step.

Only then may a local MCP client be configured with this shape, against the reviewed staging `mcp-observer` URL:

```json
{
  "mcpServers": {
    "dialsmart-observer": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/dist/index.js"],
      "env": {
        "DIALSMART_API_URL": "https://<staging-project>.supabase.co/functions/v1/mcp-observer",
        "DIALSMART_API_KEY": "<staging-read-only-key>",
        "DIALSMART_MCP_PROFILE": "observer"
      }
    }
  }
}
```

Use only `dialsmart_operator_context`, `dialsmart_elite_solar_brief`, or `dialsmart_elite_solar_pulse` to verify the R0 surface. A valid answer must continue to report every authority flag as `false`.

## Elite Solar progression after staging

The MCP observer is never a launch switch. After synthetic staging evidence, Elite Solar still progresses separately through its signed direct-import shadow, provider/webhook certification, 20 owned-phone calls, and manually reviewed 5/20/50-lead canaries. See [`../campaigns/solar-exit/README.md`](../campaigns/solar-exit/README.md) and [`../docs/EXTERNAL_OPERATOR_CONTROL_PLANE.md`](../docs/EXTERNAL_OPERATOR_CONTROL_PLANE.md).
