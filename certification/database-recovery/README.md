# Offline database recovery candidate

This foundation converts two independently captured, read-only production evidence artifacts into a locked migration-chain candidate for a brand-new disposable or staging database. It never connects to Supabase, executes SQL, repairs a ledger, deploys code, or authorizes production changes.

It is deliberately separate from `scripts/certify-fresh-database.mjs`. The existing certifier must remain red while the legacy migration folder cannot rebuild from zero; loading a snapshot ahead of those migrations would hide the broken history instead of reconciling it.

## Evidence already present

The workspace currently contains this schema-only export outside the repository:

```text
../../outputs/dialer-live-public-schema-2026-07-12.sql
```

Its pinned SHA-256 is `c87c5dccd8dcc250c0685cfb0d827524b13ec15c185e39bd8bc478f62a9783bf`. The compiler requires the exact 523,994-byte artifact, PostgreSQL 15.8 / pg_dump 15.18 headers, and the observed inventory of 134 tables, 56 functions, and 257 policies. It rejects top-level row-data statements, database/role/system mutation, psql connection or shell commands, non-public object creation, and common embedded-secret forms.

The schema dump is evidence, not a deployable migration. It contains security-critical owner, grant, revoke, policy, and function definitions. The only automatic transform is deterministic and recorded: normalize line endings, remove pg_dump's random `\\restrict` transport guards, make creation of the already-present `public` schema idempotent, and add a conspicuous offline-only header.

## Captured migration-ledger evidence

The workspace contains a standalone read-only capture and a separate provenance record outside the repository:

```text
../../outputs/dial-smart-remote-ledger-2026-07-13.json
../../outputs/dial-smart-remote-ledger-2026-07-13.provenance.json
```

The ledger has this exact minimal shape:

```json
{
  "format_version": 1,
  "capture_mode": "read_only",
  "source_project_ref": "emonjusymdripmkvtttc",
  "captured_at": "2026-07-13T16:44:41.211Z",
  "schema_dump_sha256": "c87c5dccd8dcc250c0685cfb0d827524b13ec15c185e39bd8bc478f62a9783bf",
  "rows": [
    {
      "version": "20250601121406",
      "name": ""
    }
  ]
}
```

The two independent official Supabase read-only routes agree on all 145 unique rows: the read-only SQL endpoint and the migration-history `GET` endpoint produce canonical rows SHA-256 `910028442f95b41e5e4a12631b973f66ab9916ab93a46f5a85589938f3fc15ee`. The production history contains 119 authentic empty-string `name` values and 26 nonempty names. Empty strings are preserved as evidence rather than invented from unrelated local filenames. Missing fields, `null`, non-string versions or names, leading or trailing whitespace, whitespace-only nonempty values, a different empty-name count, project drift, row drift, duplicate versions, duplicate JSON object keys, noncanonical timestamps, and extra document or row fields all fail closed.

The companion provenance file records both source endpoint paths, methods, counts, canonical hashes, the server-side capture time, the schema snapshot binding, and the matching PostgreSQL/catalog inventory. Its exact raw SHA-256, both route contracts, both response hashes, read-only flags, row metrics, cross-source agreement, credential posture, and no-production-mutation assertion are pinned in the recovery config and validated before a candidate can be emitted. The original route response envelopes are not retained, so this proves exact agreement with the reviewed provenance artifact rather than independently replaying the two remote captures. The artifact contains no access token, database password, connection string, service-role key, SQL body, or migration statement.

### Capture the ledger without writing to production

Use either the Supabase Dashboard SQL editor or the official read-only Management API while visibly authenticated to project `emonjusymdripmkvtttc`. Do not place a database password, service-role key, connection URL, or access token in the evidence file or a shell command. The current Lovable database-query connector cannot perform this export because it returns `403 insufficient_scope`.

Run the following as one SQL-editor operation after replacing `<EXACT_PROJECT_REF>` with the project reference shown in the Dashboard. The transaction is explicitly read-only, the query selects only migration version and name, and the final `ROLLBACK` closes the transaction without a write:

```sql
BEGIN TRANSACTION READ ONLY;

SELECT
  count(*) AS row_count,
  count(DISTINCT version) AS unique_versions,
  count(*) FILTER (
    WHERE name IS NULL
  ) AS null_name_rows,
  count(*) FILTER (
    WHERE name = ''
  ) AS empty_name_rows,
  count(*) FILTER (
    WHERE name <> '' AND btrim(name) = ''
  ) AS whitespace_only_name_rows
FROM supabase_migrations.schema_migrations;

WITH ledger AS (
  SELECT version::text AS version, name::text AS name
  FROM supabase_migrations.schema_migrations
)
SELECT jsonb_build_object(
  'format_version', 1,
  'capture_mode', 'read_only',
  'source_project_ref', 'emonjusymdripmkvtttc',
  'captured_at', to_char(
    clock_timestamp() AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  ),
  'schema_dump_sha256',
    'c87c5dccd8dcc250c0685cfb0d827524b13ec15c185e39bd8bc478f62a9783bf',
  'rows', jsonb_agg(
    jsonb_build_object('version', version, 'name', name)
    ORDER BY version
  )
) AS ledger_json
FROM ledger
HAVING count(*) = 145
   AND count(DISTINCT version) = 145
   AND count(*) FILTER (WHERE name IS NULL) = 0
   AND count(*) FILTER (WHERE name = '') = 119
   AND count(*) FILTER (
     WHERE name <> '' AND btrim(name) = ''
   ) = 0;

ROLLBACK;
```

The first result must say `row_count = 145`, `unique_versions = 145`, `null_name_rows = 0`, `empty_name_rows = 119`, and `whitespace_only_name_rows = 0`. The second result must contain exactly one JSON cell. If it returns no row or any count differs, stop: do not invent names, remove rows, change a pin, or edit the schema hash. A changed ledger means the schema and ledger need to be recaptured together and reviewed before any recovery configuration is updated.

Copy only the JSON value from `ledger_json` into a new UTF-8 file outside the repository. Do not save the surrounding SQL-editor result envelope or CSV quoting. Confirm that the file contains only the six documented top-level fields and that each row contains only `version` and `name`. Record its local evidence hash without exposing its contents:

```powershell
Get-FileHash -Algorithm SHA256 ..\..\outputs\dial-smart-remote-ledger-2026-07-13.json
```

The compiler verifies the ledger's exact raw SHA-256 before acceptance, rejects duplicate JSON keys before `JSON.parse`, requires string migration versions, requires the exact pinned canonical UTC capture time, and verifies the document shape, exact row count, unique versions, exact 119-empty/26-nonempty name profile, canonical rows digest, exact project ref, and source-snapshot binding. It also consumes the separately hash-pinned provenance artifact described above. It cannot independently prove who exported the files, so retain their authenticated capture context as operator evidence. Do not commit either evidence artifact.

## Dry run

```powershell
npm run certify:database-recovery:test
npm run certify:database-recovery:plan
```

The default command deliberately writes nothing and exits nonzero with `REMOTE_LEDGER_REQUIRED`; it still verifies the pinned schema artifact and inventories every local migration.

After the ledger JSON exists:

```powershell
npm run certify:database-recovery:plan -- `
  --remote-ledger ..\..\outputs\dial-smart-remote-ledger-2026-07-13.json `
  --remote-ledger-provenance ..\..\outputs\dial-smart-remote-ledger-2026-07-13.provenance.json
```

The provenance option is explicit above for audit clarity; when omitted, the compiler resolves the pinned provenance filename from the external `outputs` directory. This is still a write-free dry run. The reviewed GHL shadow-ingress and reconciliation migrations are now hash-pinned, so the current report must show `ready_to_emit: true`, `remote_access_performed: false`, and `database_execution_performed: false`.

## Explicit candidate emission

The compiler writes only when `--output` names an explicit path that does not already exist:

```powershell
npm run certify:database-recovery:plan -- `
  --remote-ledger ..\..\outputs\dial-smart-remote-ledger-2026-07-13.json `
  --remote-ledger-provenance ..\..\outputs\dial-smart-remote-ledger-2026-07-13.provenance.json `
  --output ..\..\outputs\<new-nonexistent-candidate-directory>
```

The current reviewed immutable output is `outputs/dial-smart-database-recovery-candidate-2026-07-13-v3`. Its complete raw `lineage-lock.json` SHA-256 is `53b18d34ff6e35c2fae7b3b377d1f87b67c769a24b1133a64ff8ff5650145db8`, and its canonical lineage content SHA-256 is `78a0f7fc9e65dc1f7bda7923db06a6a6cbefa11089384d317bdbcf76912f7c81`. The v2 output remains immutable historical evidence; do not overwrite, rename, or treat it as the current candidate. Never reuse an output path: every successor requires a new directory and a new independently recorded lock-file digest.

The emitted directory contains:

- `lineage-lock.json`, binding the schema, exact ledger, exact provenance artifact, both pinned read-only source routes and response hashes, every local migration, every classification, every candidate file, and every hash;
- `migrations/20260712000000_live_public_schema_baseline.sql`, the deterministic offline baseline candidate;
- only the 20 explicitly named and hash-pinned post-snapshot hardening migrations, producing a 21-file chain with the baseline;
- a warning README.

The v3 lock binds the exact current inventory of 172 repository migrations and 14 rollback-only SQL contracts. Every legacy local file is classified and excluded from the recovered chain. Every remote ledger row is classified as represented by the authoritative snapshot baseline. Any unapproved migration after the baseline cutoff, changed hardening hash, new collision, duplicate remote version, wrong source binding, source drift, scanner finding, contract drift, or existing output path blocks emission.

## What this does not prove

Emission is not database certification. The next separate step must run only against a disposable Supabase project and prove all of the following before a staging certificate can exist:

1. The baseline restores and its normalized public schema exactly matches the pinned source snapshot.
2. The baseline plus the 20 locked forward migrations replays from zero twice.
3. Both migration ledgers exactly match the 21-file candidate chain.
4. All 14 `supabase/tests/*.sql` contracts pass on both runs.
5. Database lint has zero errors.
6. Generated public-schema TypeScript types match the committed types.
7. Both final public-schema dumps are byte-identical after transport normalization.
8. The certificate records all source, ledger, migration, type, contract, and schema hashes and confirms that no remote target was available.

Never apply the baseline file to the existing production project. Production history repair remains a later, separately approved operation after the recovered staging lineage is certified.
