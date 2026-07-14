# Offline database recovery candidate

This directory was compiled from a pinned schema-only snapshot and a separately captured read-only migration ledger.
It has not been executed against any database and is not a production migration, deployment artifact, or launch certificate.

Lineage lock content SHA-256: 49715c87aea809c9858ec301c564f7aeb1c884da87a04ddad762d5f5d3f5533f

Next: use a separate disposable-only certifier to replay this exact chain twice and run every SQL contract, lint, type, and schema-determinism gate.
Never apply the baseline migration to the existing production database.
