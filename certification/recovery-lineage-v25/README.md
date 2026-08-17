# Offline database recovery candidate

This directory was compiled from a pinned schema-only snapshot and a separately captured read-only migration ledger.
It has not been executed against any database and is not a production migration, deployment artifact, or launch certificate.

Lineage lock content SHA-256: 39a2519d6cdd8c6c2b3e6250088e7c7b6f1e9280d61141497c43cfdd847293cb

Next: use a separate disposable-only certifier to replay this exact chain twice and run every SQL contract, lint, type, and schema-determinism gate.
Never apply the baseline migration to the existing production database.
