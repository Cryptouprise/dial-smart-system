# Offline database recovery candidate

This directory was compiled from a pinned schema-only snapshot and a separately captured read-only migration ledger.
It has not been executed against any database and is not a production migration, deployment artifact, or launch certificate.

Lineage lock content SHA-256: 51b1c90c079fd8e14373f9d797ee0acbde343c195110697f3a466ff62a2ddae6

Next: use a separate disposable-only certifier to replay this exact chain twice and run every SQL contract, lint, type, and schema-determinism gate.
Never apply the baseline migration to the existing production database.
