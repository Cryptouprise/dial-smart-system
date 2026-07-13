# Recovered database certification

This is the execution gate for an already emitted, hash-locked recovery candidate. It is separate from both the offline candidate compiler and the legacy fresh-database certifier.

Passing this gate proves only that one exact recovered lineage rebuilds deterministically in a disposable local Supabase project. It does not repair production migration history, deploy a staging database, authorize production writes, or authorize launch.

## External trust root

The certifier never auto-discovers a candidate. Supply its directory and the independently recorded SHA-256 of the complete `lineage-lock.json` file:

```powershell
Get-FileHash -Algorithm SHA256 `
  ..\..\outputs\dial-smart-database-recovery-candidate-2026-07-13-v4\lineage-lock.json
```

Do not read that digest from the candidate and then immediately trust it. Retain the digest from the reviewed compiler run or another authenticated evidence channel. A checksum stored inside the same directory is not an external trust root.

The current reviewed output has:

```text
lineage-lock.json SHA-256: 9fcd181ac2021f067b41258ba2eb7750854ba93aef051842632346cf49480e19
canonical payload SHA-256: d5db7177c73829aba322bda66ae8f622c14f039a22e08648a3760551187ca2b0
candidate migrations:      22 (1 baseline + 21 forward)
repository migrations:     173
rollback-only SQL contracts: 15
```

The complete-file digest is mandatory. The canonical payload digest is optional defense in depth. The certifier also recomputes the internal payload digest regardless of whether the optional flag is used.

The v2 and v3 candidates remain immutable historical evidence. Do not overwrite or rename them, and do not substitute their older hashes or counts for the current v4 trust root.

## Run

Start Docker Desktop and wait for the engine to become healthy. Then run:

```powershell
node scripts/certify-recovered-database.mjs `
  --candidate-dir ..\..\outputs\dial-smart-database-recovery-candidate-2026-07-13-v4 `
  --expected-lineage-file-sha256 9fcd181ac2021f067b41258ba2eb7750854ba93aef051842632346cf49480e19 `
  --expected-lineage-content-sha256 d5db7177c73829aba322bda66ae8f622c14f039a22e08648a3760551187ca2b0 `
  --certificate-out ..\..\outputs\dial-smart-recovered-database-certificate-2026-07-13-v4.json
```

The certificate path is optional; without it, the canonical certificate is printed. An explicit output must have an existing, non-linked parent, must not already exist, and must not be inside the recovery candidate. Nothing is written before every database gate and cleanup succeeds.

The certifier refuses:

- `--linked`, `--db-url`, `--project-id`, `--project-ref`, `--password`, caller-selected `--workdir`, and every unknown option;
- any nonempty database, Postgres, Supabase project, access-token, service-role, or connection credential environment variable;
- `DOCKER_HOST`, `DOCKER_CONTEXT`, `DOCKER_CONFIG`, Docker TLS overrides, or an active Docker endpoint other than local `unix://` or `npipe://`;
- URI, UNC, symlink, junction, extra-file, missing-file, traversal, and noncanonical candidate inputs;
- a candidate whose complete lock-file digest differs from the external trust root, even if an attacker rewrites both SQL and the lock's self-digest;
- any migration name, order, count, hash, lineage classification, source-snapshot binding, exact raw-ledger/capture-time pin, two-route provenance evidence, or safety state that differs from the pinned recovery manifest;
- any current repository migration addition, removal, byte-count change, or hash change since candidate emission; a stale candidate must be recompiled and receive a new externally reviewed lock-file digest.
- any mid-run change to the recovery manifest, database-certification manifest, `supabase/config.toml`, SQL contracts, committed types, or migrations.

Verified candidate, configuration, and rollback-only SQL-contract bytes are buffered before execution. Only those bytes are copied into a new random project below the operating system temporary directory. The migration, contract, and isolated-config trees are rechecked for exact entries, regular non-linked files, byte counts, and hashes before and after every replay. Every post-`mkdtemp` path is cleanup-guarded. The original candidate and current repository evidence are checked again after cleanup and before a certificate can be created.

## Evidence sequence

The exact Supabase CLI version and PostgreSQL major are pinned in `certification/database-certification.json` and must agree with the recovery manifest and isolated `config.toml`.

The local disposable project performs:

1. A baseline-only clean restore. Its exact migration ledger and PostgreSQL major are asserted, and its normalized public-schema dump must match the locked source baseline.
2. Installation of the 21 verified forward-hardening files into the temporary clone.
3. Full replay 1 from zero. The exact ordered 22-row migration ledger is asserted—not merely its count. The public schema is dumped before the 15 contracts, every contract must have one top-level `BEGIN` and final `ROLLBACK` with no top-level `COMMIT`, all contracts run, and a second dump must prove they left the schema unchanged. Database lint must have zero errors and generated public types must match the committed types.
4. Full replay 2 from zero with the same exact ledger, rollback-only contracts, before/after schema proof, lint, types, and final schema dump.
5. Comparison of both generated type sets and both normalized final public schemas.
6. Reverification that the source candidate, all three policy/runtime configuration files, current SQL contracts, migrations, and committed types did not change during the run.
7. Removal of the disposable containers, volumes, and OS-temporary project before any certificate is written.

The resulting deterministic certificate records the candidate fingerprint, complete lock-file and payload digests, source, exact remote-ledger and independent two-route provenance bindings, every migration and SQL-contract hash, policy/runtime configuration hashes, verified local Docker context/transport, repeated temporary-tree fingerprints, committed/generated type hashes, baseline schema fingerprint, final schema fingerprint, and exact-ledger evidence.

It also permanently records:

```text
authorization_scope: disposable_recovery_lineage_evidence_only
launch_authorized: false
staging_deploy_authorized: false
production_write_authorized: false
remote_database_access_performed: false
active_docker_endpoint_verified_local: true
known_remote_database_credential_environment_variables_present: false
production_database_target_supplied_to_children: false
external_package_or_container_image_network_access: not_attested
```

The local database target is proven by local-only arguments, an unlinked isolated workdir, credential-environment rejection, Docker-override rejection, and a verified local Unix socket or Windows named-pipe endpoint. The certificate deliberately says only that known remote credential environment variables were absent and no production database target was supplied to children; it does not claim children were incapable of reading every user-level credential store. General network silence is intentionally not claimed: pinned `npx` resolution may download the Supabase CLI and Supabase/Docker may pull pinned local-runtime images.

## Docker unavailable

Candidate verification happens before Docker is checked. If Docker is missing or stopped, the command exits nonzero and says that database execution did not start and no certificate was created. That is a prerequisite failure, not a partial certification. Start Docker and rerun the same command; never create or hand-edit a certificate to bypass it.

The non-Docker safety suite is:

```powershell
node --test scripts/certify-recovered-database.test.mjs
```

It exercises external trust-root attacks, self-rehashed tampering, exact ledger/capture/provenance pins, Docker overrides and remote endpoints, path/count/hash drift, temporary-tree tampering, rollback-only SQL contracts, configuration staleness, cleanup after setup failure, exact-ledger SQL, schema/type drift, deterministic non-authorizing certificates, exclusive output, the current v4 candidate, and the truthful Docker-unavailable failure contract. The v2 and v3 candidates remain immutable historical evidence rather than the current certification input.
