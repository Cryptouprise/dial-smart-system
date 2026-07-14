# Dial Smart recovered database lineage v5

This is the current reviewed, schema-only CI replay input. v5 is a successor to v4 because the baseline transform removes local-incompatible `supabase_admin` default-privilege statements while preserving the captured public schema.

- Candidate: `dial-smart-database-recovery-candidate-2026-07-13-v5`
- Chain: 1 baseline plus 21 forward migrations (22 exact files)
- Raw `lineage-lock.json` SHA-256: `c85b3bbc669d60b2010ac0192aed2d2ccf50d688a175cece18db9f1c1e29083b`
- Canonical lineage content SHA-256: `318ceddea799b40a5ad5c35fbfb5d2b61542700d070d91a33cd55163d17a2dbd`

This directory is for disposable GitHub/staging replay only. Never apply it to the existing production project.
