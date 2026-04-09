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

The migration ships with helper functions to create keys with specific
scopes. For personal admin use, grant the `admin` scope — it implies
everything else.

Run this in the Supabase SQL editor:

```sql
-- Replace <YOUR_AUTH_USER_ID> with your auth.users.id (find with:
-- select id, email from auth.users where email = 'your@email.com')
DO $$
DECLARE
  v_user_id uuid := '<YOUR_AUTH_USER_ID>';
  v_org_id uuid := (
    select organization_id from public.organization_users
    where user_id = v_user_id limit 1
  );
  v_plaintext text;
  v_hash text;
  v_prefix text;
BEGIN
  -- Generate a random key
  v_plaintext := 'dsk_live_' || encode(gen_random_bytes(24), 'base64');
  v_plaintext := replace(replace(replace(v_plaintext, '/', ''), '+', ''), '=', '');
  v_plaintext := substring(v_plaintext for 41); -- dsk_live_ + 32 chars
  v_hash := encode(digest(v_plaintext, 'sha256'), 'hex');
  v_prefix := substring(v_plaintext for 12);

  INSERT INTO public.api_keys (
    user_id, organization_id, name, key_hash, key_prefix, scopes, rate_limit_per_minute
  ) VALUES (
    v_user_id, v_org_id, 'Claude Code (admin)', v_hash, v_prefix, ARRAY['admin'], 600
  );

  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════';
  RAISE NOTICE 'YOUR API KEY (copy it now — shown ONCE):';
  RAISE NOTICE '  %', v_plaintext;
  RAISE NOTICE '═══════════════════════════════════════════════════';
  RAISE NOTICE '';
END $$;
```

Copy the `dsk_live_...` value from the NOTICE output. **This is the only
time it will ever be shown.** Store it in your password manager.

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

## 6. Wire into Claude Code (or any MCP client)

### Claude Code (local)

Add to your Claude Code MCP config (`~/.config/claude-code/mcp.json` on
Linux/Mac, `%APPDATA%\claude-code\mcp.json` on Windows):

```json
{
  "mcpServers": {
    "dialsmart": {
      "command": "node",
      "args": ["/absolute/path/to/dial-smart-system/mcp-server/dist/index.js"],
      "env": {
        "DIALSMART_API_KEY": "dsk_live_...your_key..."
      }
    }
  }
}
```

Restart Claude Code. Ask: *"Run dialsmart_health_check"* — you should
see all 7 probes pass.

### Claude Desktop

Same config but in `~/Library/Application Support/Claude/claude_desktop_config.json`.

### Cursor / Windsurf / Zed

Each has its own MCP config location — check their docs. The JSON shape
is the same.

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
