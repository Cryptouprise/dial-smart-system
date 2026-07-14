# Dial Smart recovered database lineage v4

This directory is the reviewed, schema-only CI replay input for the recovered database lineage. It is not the historical `supabase/migrations` folder and must not be applied to production.

- Candidate: `dial-smart-database-recovery-candidate-2026-07-13-v4`
- Chain: 1 baseline plus 21 forward migrations (22 exact files)
- Repository inventory bound by the lock: 173 migration files
- Rollback-only SQL contracts: 15 files under `supabase/tests`
- Raw `lineage-lock.json` SHA-256: `9fcd181ac2021f067b41258ba2eb7750854ba93aef051842632346cf49480e19`
- Canonical lineage content SHA-256: `d5db7177c73829aba322bda66ae8f622c14f039a22e08648a3760551187ca2b0`

GitHub fresh-database CI points `DATABASE_CERTIFICATION_MIGRATIONS_DIR` at this exact directory. Any change to these files requires a new recovery candidate, new external digests, and a new review checkpoint.
