# Offline database recovery candidate

This directory was compiled from a pinned schema-only snapshot and a separately captured read-only migration ledger.
It has not been executed against any database and is not a production migration, deployment artifact, or launch certificate.

Lineage lock content SHA-256: e164e5eea5daeb2d3675e4c3e765e1d288a04e23effcdecfd6470369d56d1215

Next: use a separate disposable-only certifier to replay this exact chain twice and run every SQL contract, lint, type, and schema-determinism gate.
Never apply the baseline migration to the existing production database.
