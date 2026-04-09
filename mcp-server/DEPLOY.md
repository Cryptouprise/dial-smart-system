# Dial Smart MCP + API Gateway — Deployment + Smoke Test

This is the definitive ordered checklist to go from a fresh branch to a
fully working MCP server that Claude Code (or any MCP client) can use to
operate Dial Smart.

Run each step. If anything fails, stop and debug before moving on.

---

## 0. Prerequisites

- [ ] Supabase CLI installed: `supabase --version` works
- [ ] You're logged in: `supabase login`
- [ ] You're linked to the right project: `supabase link --project-ref emonjusymdripmkvtttc`
- [ ] Node 18+ installed: `node --version`
- [ ] You're on the right branch: `git checkout claude/api-mcp-integration-WoM88`

---

## 1. Apply the database migration

Creates the `api_keys` and `api_key_audit_log` tables plus the
`touch_api_key()` function. Safe to re-run.

```bash
# From the repo root
supabase db push
```

**Verify** in the Supabase SQL editor:

```sql
select count(*) from public.api_keys;
-- expect: 0 (table exists, no rows yet)

select proname from pg_proc where proname = 'touch_api_key';
-- expect: 1 row
```

---

## 2. Deploy the api-gateway edge function

**CRITICAL:** this function uses its own API key system, NOT Supabase JWT.
You MUST deploy with `--no-verify-jwt` or every request returns 401.

```bash
supabase functions deploy api-gateway --no-verify-jwt
```

**Verify** the function is live:

```bash
curl https://emonjusymdripmkvtttc.supabase.co/functions/v1/api-gateway/v1/health
# expect: {"success":true,"data":{"ok":true,"version":"0.2.0",...}}
```

If you get a 401, the `--no-verify-jwt` flag was missed. Redeploy.

---

## 3. Mint yourself an API key

Migration `20260409030000_mint_api_key_helper.sql` (also applied in
step 1) gives you a reusable `public.mint_api_key()` function. For
personal admin use, grant the `admin` scope — it implies everything.

**Option A — open `mcp-server/scripts/mint-admin-key.sql`**, replace
`YOUR_EMAIL@example.com` with your email, and run it in the Supabase
SQL Editor.

**Option B — run this one-liner directly** in the SQL Editor:

```sql
SELECT *
FROM public.mint_api_key(
  p_user_id => (SELECT id FROM auth.users WHERE email = 'YOUR_EMAIL@example.com' LIMIT 1),
  p_name    => 'Claude Code (admin)',
  p_scopes  => ARRAY['admin']::TEXT[]
);
```

The result row contains a `plaintext` column — that's your key. **It
is shown exactly once.** Copy it immediately and store it in your
password manager.

To list your active keys later (no plaintext — just metadata):

```sql
SELECT id, name, key_prefix, scopes, rate_limit_per_minute,
       last_used_at, created_at, expires_at
FROM public.api_keys
WHERE revoked_at IS NULL
ORDER BY created_at DESC;
```

---

## 4. Build the MCP server

```bash
cd mcp-server
npm install
npm run build
npm test    # unit tests — should pass green
```

Expected output: `npm test` finishes with all client + tool registry
tests green. If anything fails, stop and fix before moving on.

---

## 5. Smoke-test against your live deployment

The smoke test runs every read-only endpoint against your real API. It
does NOT place any calls, create any leads, or send any SMS.

```bash
# Still in mcp-server/
DIALSMART_API_KEY=dsk_live_...your_real_key... npm run smoke
```

Expected output: 13 green checkmarks.

```
Dial Smart MCP smoke test
API: https://emonjusymdripmkvtttc.supabase.co/functions/v1/api-gateway
Key: dsk_live_ABC...

  ✔ public health check        123ms
  ✔ whoami                     88ms
  ✔ system_stats               156ms
  ✔ credits_balance            72ms
  ✔ deep_health_check          411ms
  ✔ list_phone_numbers         95ms
  ✔ phone_number_health        110ms
  ✔ list_leads                 102ms
  ✔ search_leads               114ms
  ✔ list_campaigns             87ms
  ✔ list_calls                 99ms
  ✔ find_stuck_calls           98ms
  ✔ list_sms                   94ms

13/13 probes passed
All probes passed.
```

**If any probe fails**, the error tells you exactly which endpoint broke.
Common issues:

| Symptom | Fix |
|---|---|
| `[401] Invalid API key` | Key wasn't inserted correctly. Re-run step 3. |
| `[401] Missing Authorization header` | `DIALSMART_API_KEY` env var not set. |
| `[404] Unknown route` | Old function deployed. Re-deploy with `--no-verify-jwt`. |
| `[500] column ... does not exist` | Schema drift. Check the specific table. |
| Network error on `public health check` | Function not deployed. Re-run step 2. |

---

## 5b. (Optional) Validate the write path

After the read-only smoke test passes, run the write-path smoke test
ONCE to confirm create/update/search/DNC all work end-to-end. It
creates a throwaway lead with phone `+15555555XXX` (reserved test
range, can never actually dial), updates it, verifies the update,
searches for it by tag, and marks it DNC for cleanup. No real calls
are placed.

```bash
# Still in mcp-server/
CONFIRM=yes DIALSMART_API_KEY=dsk_live_... npm run smoke:write
```

Expected output:

```
  ✔ create_lead (tagged mcp-write-smoke)     147ms
  ✔ update_lead (set priority + notes)       112ms
  ✔ get_lead (verify update persisted)        89ms
  ✔ search_leads (tag = mcp-write-smoke)     134ms
  ✔ mark_lead_dnc (cleanup)                  121ms
  ✔ get_lead (verify DNC stuck)               91ms

All 6 write-path probes passed.
```

The test lead stays in your DB as an audit record, tagged
`mcp-write-smoke` and marked DNC. It is safe to leave it there — you
can query it later with `SELECT * FROM leads WHERE tags @> ARRAY['mcp-write-smoke']::text[]`.

**Why CONFIRM=yes?** Without the flag the script refuses to run. This
prevents muscle-memory mistakes where you think you're running the
read-only smoke test and accidentally create test data.

## 6. Wire into Claude Code (or any MCP client)

### Claude Code (CLI) — recommended

Use the official `claude mcp add` command. This stores the server in your
user-level config and embeds your API key safely (never touches the repo).

**Windows (cmd.exe or PowerShell):**

```cmd
claude mcp add dialsmart --scope user --env DIALSMART_API_KEY=dsk_live_...your_key... -- node "C:\Users\charl\dial-smart-system\mcp-server\dist\index.js"
```

**macOS / Linux:**

```bash
claude mcp add dialsmart \
  --scope user \
  --env DIALSMART_API_KEY=dsk_live_...your_key... \
  -- node /absolute/path/to/dial-smart-system/mcp-server/dist/index.js
```

**Verify it loaded:**

```bash
claude mcp list
# expect: dialsmart  user  stdio  node ...

claude mcp get dialsmart
# expect: full server details with the env var redacted
```

**Test it from inside Claude Code:**

Start `claude` in any directory and type:

```
/mcp
```

You should see `dialsmart` listed as connected. Then ask:

> "Run dialsmart_health_check and tell me if the stack is healthy."

Claude Code will invoke the tool and print the response. If you see all
7 probes pass, you're done.

**To remove or re-add later:**

```bash
claude mcp remove dialsmart --scope user
# then re-add with a new key if rotating
```

### Claude Desktop

Edit `%APPDATA%\Claude\claude_desktop_config.json` (Windows) or
`~/Library/Application Support/Claude/claude_desktop_config.json` (Mac):

```json
{
  "mcpServers": {
    "dialsmart": {
      "command": "node",
      "args": ["C:\\Users\\charl\\dial-smart-system\\mcp-server\\dist\\index.js"],
      "env": {
        "DIALSMART_API_KEY": "dsk_live_...your_key..."
      }
    }
  }
}
```

Restart Claude Desktop. The dialsmart tools will appear in the tools
menu.

### Cursor / Windsurf / Zed

Each has its own MCP config UI. The JSON shape above works in all of
them — just put it in their respective config files. Use forward
slashes in paths even on Windows; Node handles them fine.

### Other AI agents (Manus, etc.)

If the agent supports MCP via stdio, point it at
`node /path/to/mcp-server/dist/index.js` with `DIALSMART_API_KEY` in
the environment. If it only supports HTTP/SSE, you'll need to wrap the
stdio server with a stdio→HTTP bridge — out of scope for this doc.

---

## 7. First real-world test

With the MCP wired up, try these prompts in Claude Code against your
actual account:

1. *"Run dialsmart_health_check and tell me if the stack is healthy."*
2. *"Use dialsmart_system_stats to tell me what's happened in the last 24 hours."*
3. *"List my campaigns with dialsmart_list_campaigns."*
4. *"Pick one of my campaigns and run dialsmart_pre_launch_audit on it."*

If step 4 returns a clean audit, you're ready to use the MCP during a
live campaign.

---

## 8. Rotating / revoking a key

**Revoke** (instant):

```sql
update public.api_keys
  set revoked_at = now()
  where key_prefix = 'dsk_live_ABC';  -- use your key's prefix
```

**Rotate**: Mint a new key (repeat step 3), update your client config,
then revoke the old one.

---

## Gotchas learned the hard way

- `--no-verify-jwt` is mandatory. Forgetting it = 401 on every request.
- The API key plaintext is shown **once**. If you lose it, mint a new one — you can't recover the old one from the hash.
- The smoke test does not place calls or send SMS. It only verifies connectivity + read access.
- If `dialsmart_create_lead` ever fails with an `organization_id` constraint error, add `organization_id` to the insert payload in `api-gateway/index.ts` — the gateway already forwards it when present.
- Audit log rows are never deleted. Add a retention job if you run this for months without customer cleanup.
