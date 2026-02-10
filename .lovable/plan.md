

# Document verify_jwt and Cron Job Infrastructure in AUTONOMOUS_SYSTEM_FLOW.md

## What Changes

Add a new section to `AUTONOMOUS_SYSTEM_FLOW.md` (at the end, before or after the existing "Validation" section) covering:

1. **Edge Function Security (`verify_jwt`)** -- What it means, why some are `true` and others `false`, and that it lives in `supabase/config.toml`
2. **Cron Job Infrastructure** -- All 3 active cron jobs, how they work via `pg_cron` + `pg_net`, and that the anon key is used for authentication
3. **Quick reference table** of all cron jobs with their schedules

## Content to Add

A new section titled **"Infrastructure: Cron Jobs & Edge Function Security"** appended to the file, covering:

- **verify_jwt explained**: `true` = requires valid JWT (used for internal/authenticated functions), `false` = open access (used for external webhooks like Twilio/Telnyx/Retell that can't send JWTs). Configured in `supabase/config.toml`.
- **When you'd change it**: Only when adding a new external webhook integration. The AI handles this automatically during development.
- **Active cron jobs table**:

```text
Job Name                    | Schedule        | Target Function
----------------------------|-----------------|---------------------------
automation-scheduler-job    | Every 1 minute  | automation-scheduler
voice-broadcast-processor   | Every 1 minute  | voice-broadcast-queue
ai-autonomous-engine        | Every 5 minutes | ai-autonomous-engine
```

- **How cron jobs work**: `pg_cron` triggers `pg_net` HTTP POST to the edge function URL using the anon key as a Bearer token. No service role key is exposed in code.
- **Note**: These are Supabase infrastructure settings, not application code. They persist in the database and don't appear in source files.

## File Changed

- `AUTONOMOUS_SYSTEM_FLOW.md` -- append new section (approximately 50 lines of markdown)

No other files need changes.

