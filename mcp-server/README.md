# @dialsmart/mcp-server

A Model Context Protocol (MCP) server that lets **Claude Code, Claude Desktop, Cursor, Windsurf, Manus, and any other MCP-capable AI agent** drive the Dial Smart System: manage leads, launch campaigns, place calls, send SMS, pull analytics, and inspect the system.

```
[ Claude Code / any MCP client ]
            │
            │ MCP (stdio JSON-RPC)
            ▼
[ @dialsmart/mcp-server (this package) ]
            │
            │ HTTPS + Bearer dsk_live_…
            ▼
[ api-gateway edge function on Supabase ]
            │
            ▼
[ Dial Smart Postgres + 63 edge functions ]
```

You generate one API key, paste two lines into your MCP client config, and the AI immediately gets ~20 tools to operate your platform.

---

## 1. One-time setup: deploy the backend

This package is the *client*. The server side lives in your Dial Smart Supabase project.

### a) Run the migration

```bash
supabase db push
# or apply the file directly:
supabase migration apply 20260409020305_api_keys
```

This creates `api_keys`, `api_key_audit_log`, and the `touch_api_key()` function with RLS.

### b) Deploy the edge function

```bash
supabase functions deploy api-gateway --no-verify-jwt
```

`--no-verify-jwt` is required because the function authenticates with **its own** API key system (`dsk_live_...`), not the Supabase JWT verifier.

### c) Smoke test it

```bash
curl https://emonjusymdripmkvtttc.supabase.co/functions/v1/api-gateway/v1/health
# → { "success": true, "data": { "ok": true, "version": "0.1.0", ... } }
```

---

## 2. Generate yourself an API key

Run this once in the Supabase SQL editor (replace `<YOUR_USER_ID>`). The plaintext key is shown in the result — **copy it now, it won't be shown again**.

```sql
-- Generate a key plaintext + hash in one shot. SHA-256 of the plaintext is stored.
WITH gen AS (
  SELECT 'dsk_live_' || encode(gen_random_bytes(24), 'base64')
         |> replace('+', 'A') |> replace('/', 'B') |> replace('=', '') AS plaintext
)
INSERT INTO public.api_keys (
  user_id, organization_id, name, key_prefix, key_hash, scopes, rate_limit_per_minute
)
SELECT
  '<YOUR_USER_ID>'::uuid,
  (SELECT organization_id FROM organization_users WHERE user_id = '<YOUR_USER_ID>'::uuid LIMIT 1),
  'Claude Code (personal)',
  substring(plaintext, 1, 12),
  encode(digest(plaintext, 'sha256'), 'hex'),
  ARRAY['admin'],
  300
FROM gen
RETURNING id, name, key_prefix, scopes,
  (SELECT plaintext FROM gen) AS plaintext_show_once;
```

> **Don't have `pgcrypto`?** Run `CREATE EXTENSION IF NOT EXISTS pgcrypto;` first.

If the SQL pipe operator (`|>`) isn't supported in your Postgres version, use this simpler form instead:

```sql
DO $$
DECLARE
  v_user_id UUID := '<YOUR_USER_ID>'::uuid;
  v_org_id  UUID;
  v_plain   TEXT;
  v_hash    TEXT;
BEGIN
  v_plain := 'dsk_live_' || replace(replace(replace(encode(gen_random_bytes(24), 'base64'), '+',''), '/',''), '=','');
  v_hash  := encode(digest(v_plain, 'sha256'), 'hex');
  SELECT organization_id INTO v_org_id FROM organization_users WHERE user_id = v_user_id LIMIT 1;

  INSERT INTO public.api_keys (user_id, organization_id, name, key_prefix, key_hash, scopes, rate_limit_per_minute)
  VALUES (v_user_id, v_org_id, 'Claude Code (personal)', substring(v_plain, 1, 12), v_hash, ARRAY['admin'], 300);

  RAISE NOTICE '──────────────────────────────';
  RAISE NOTICE 'API KEY (copy now, shown once):';
  RAISE NOTICE '%', v_plain;
  RAISE NOTICE '──────────────────────────────';
END $$;
```

The plaintext is printed to the SQL editor's NOTICE log. Save it to a password manager.

### Scopes

The `scopes` column is an array. Use one of:

| Scope | Grants |
|---|---|
| `admin` | everything |
| `write` | every `<domain>:write` and `<domain>:read` |
| `read` | every `<domain>:read` |
| `leads:read` / `leads:write` | leads only |
| `campaigns:read` / `campaigns:write` | campaigns only |
| `calls:read` / `calls:write` | calls only |
| `sms:read` / `sms:write` | sms only |
| `system:read` | dashboard, phone numbers, credits |

For your personal "let Claude do everything" key: use `ARRAY['admin']`.

---

## 3. Install the MCP server

You have two options.

### Option A — local (npx, no install)

Once published to npm:

```bash
npx -y @dialsmart/mcp-server
```

For now, since we're developing locally, build it once:

```bash
cd mcp-server
npm install
npm run build
```

The compiled entrypoint is `mcp-server/dist/index.js`.

### Option B — global install

```bash
npm install -g @dialsmart/mcp-server
dialsmart-mcp   # runs the server on stdio
```

---

## 4. Wire it into Claude Code

### Claude Code on the web (this very session)

Claude Code on the web supports MCP servers via the `mcpServers` settings. In your account's MCP configuration, add:

```json
{
  "mcpServers": {
    "dialsmart": {
      "command": "node",
      "args": ["/absolute/path/to/dial-smart-system/mcp-server/dist/index.js"],
      "env": {
        "DIALSMART_API_KEY": "dsk_live_...",
        "DIALSMART_API_URL": "https://emonjusymdripmkvtttc.supabase.co/functions/v1/api-gateway"
      }
    }
  }
}
```

### Claude Code CLI

Add to `~/.config/claude/mcp.json` (or wherever your platform stores it):

```json
{
  "mcpServers": {
    "dialsmart": {
      "command": "npx",
      "args": ["-y", "@dialsmart/mcp-server"],
      "env": {
        "DIALSMART_API_KEY": "dsk_live_..."
      }
    }
  }
}
```

Then restart Claude Code. You should see "dialsmart" in the connected MCP servers list.

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or the equivalent on Windows/Linux:

```json
{
  "mcpServers": {
    "dialsmart": {
      "command": "npx",
      "args": ["-y", "@dialsmart/mcp-server"],
      "env": {
        "DIALSMART_API_KEY": "dsk_live_..."
      }
    }
  }
}
```

Restart Claude Desktop.

### Cursor / Windsurf / Zed

Same JSON shape as Claude Desktop, in their respective MCP settings. The MCP protocol is identical across all clients.

### Other agents (Manus, etc.)

Any agent that speaks MCP can use the same `command`/`args`/`env` config. If your agent only speaks raw HTTP and not MCP, you can call the underlying api-gateway endpoints directly:

```bash
curl https://emonjusymdripmkvtttc.supabase.co/functions/v1/api-gateway/v1/leads?limit=10 \
  -H "Authorization: Bearer dsk_live_..."
```

---

## 5. What Claude can now do

After connecting, type something like this in Claude Code:

> *"Show me how Dial Smart is doing today, then list the 5 campaigns that have generated the most calls in the last 24 hours, and for each one tell me whether the answer rate is healthy."*

Claude will call:

1. `dialsmart_system_stats` → snapshot
2. `dialsmart_list_campaigns` → all campaigns
3. `dialsmart_list_calls` (filtered per campaign + `since`)
4. Synthesize the answer

Other things Claude can do out of the box:

- **Lead triage** — *"Find every lead with status='callback' whose `next_callback_at` is in the past and reschedule them for tomorrow at 10am their local time."*
- **Campaign autopilot** — *"Pause any campaign whose answer rate in the last 24h is below 8%."*
- **Investigation** — *"Pull the transcript of call `<id>` and tell me why it ended in a hangup."*
- **Outbound** — *"Place a call to lead `<id>` using my Telnyx solar agent."*
- **DNC compliance** — *"Find the most recent inbound SMS that contains the word 'stop' and mark that lead DNC."*
- **Bulk follow-up** — *"Send this SMS to every lead in the 'Contacted - No Answer' status who I haven't messaged in 3 days."* (Claude will list, confirm, then loop `dialsmart_send_sms`.)

---

## 6. Tools reference

| Tool | Scope | Purpose |
|---|---|---|
| `dialsmart_whoami` | any | Return key identity / scopes |
| `dialsmart_system_stats` | system:read | Today's snapshot |
| `dialsmart_credits_balance` | system:read | Org credit balance |
| `dialsmart_list_phone_numbers` | system:read | Phone number inventory |
| `dialsmart_list_leads` | leads:read | List/search leads |
| `dialsmart_get_lead` | leads:read | Full lead record |
| `dialsmart_create_lead` | leads:write | Insert a lead |
| `dialsmart_update_lead` | leads:write | Patch lead fields |
| `dialsmart_mark_lead_dnc` | leads:write | DNC + dnc_list insert |
| `dialsmart_list_campaigns` | campaigns:read | List campaigns |
| `dialsmart_get_campaign` | campaigns:read | Full campaign config |
| `dialsmart_launch_campaign` | campaigns:write | Set status=active |
| `dialsmart_pause_campaign` | campaigns:write | Set status=paused |
| `dialsmart_list_calls` | calls:read | List call_logs |
| `dialsmart_get_call` | calls:read | Transcript + AI analysis |
| `dialsmart_place_call` | calls:write | Trigger outbound call |
| `dialsmart_list_sms` | sms:read | List SMS messages |
| `dialsmart_send_sms` | sms:write | Send outbound SMS |

---

## 7. Security notes

- The plaintext `dsk_live_...` token is shown **once at creation**. Only the SHA-256 hash is stored.
- Every request is audited in `api_key_audit_log` (key id, user id, method, path, status, IP, latency).
- Revoke a key: `UPDATE api_keys SET revoked_at = now(), revoked_reason = 'reason' WHERE id = '<key_id>';`
- The api-gateway function uses the **service role** internally to bypass RLS, then **manually scopes every query by `user_id`** from the API key. Do not modify those filters.
- If you ever expose this externally to customers, add: rate-limit enforcement, per-key quotas, IP allowlisting, and webhook signing.

---

## 8. Development

```bash
cd mcp-server
npm install
npm run dev   # tsc --watch
```

Files:

```
mcp-server/
├── src/
│   ├── index.ts          # MCP server bootstrap (stdio transport)
│   ├── client.ts         # Thin REST client for api-gateway
│   └── tools/
│       ├── index.ts      # Tool registry
│       ├── system.ts     # whoami, stats, credits, phone numbers
│       ├── leads.ts      # list/get/create/update/dnc
│       ├── campaigns.ts  # list/get/launch/pause
│       ├── calls.ts      # list/get/place
│       └── sms.ts        # list/send
└── README.md
```

Adding a new tool is ~15 lines: add it to the appropriate file in `src/tools/`, export it, and it shows up automatically.

---

## 9. Codebase monitoring (separate from this MCP)

This MCP gives an AI access to the **running Dial Smart app**. To also have an AI watch and fix the **codebase itself**, set up Claude Code's GitHub integration:

1. Push to `cryptouprise/dial-smart-system` (already configured)
2. Use Claude Code on the web (claude.ai/code) — sessions can be triggered manually or scheduled
3. Optionally add `.github/workflows/claude-review.yml` so Claude reviews every PR automatically

Both can run side-by-side: one Claude session watches the app via this MCP, another watches the repo via the GitHub integration.
