

# Set Up AI Autonomous Engine Cron Job

## What I Found

Both `pg_cron` and `pg_net` extensions are **already enabled**. There are already 2 cron jobs running successfully:

- `automation-scheduler-job` - runs every minute
- `voice-broadcast-processor` - runs every minute

These all use the **anon key** for authentication (same pattern we'll follow).

## What I'll Do

Run a single SQL statement via the insert tool to schedule the `ai-autonomous-engine` edge function to run every 5 minutes, matching the exact same pattern as the existing cron jobs.

```text
Job Name:     ai-autonomous-engine
Schedule:     Every 5 minutes (*/5 * * * *)
Target:       /functions/v1/ai-autonomous-engine
Auth:         Anon key (same as other cron jobs)
```

## Important Note

The `ai-autonomous-engine` edge function currently has `verify_jwt = true` in `config.toml`. Since the cron job uses the anon key (a valid JWT), this will work correctly -- the anon key IS a JWT that passes verification.

## Technical Detail

Single SQL command:
```sql
SELECT cron.schedule(
  'ai-autonomous-engine',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://emonjusymdripmkvtttc.supabase.co/functions/v1/ai-autonomous-engine',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer <anon_key>"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

No file changes needed. Just one SQL execution.

