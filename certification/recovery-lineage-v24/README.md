# Offline database recovery candidate

This directory was compiled from a pinned schema-only snapshot and a separately captured read-only migration ledger.
It has not been executed against any database and is not a production migration, deployment artifact, or launch certificate.

Lineage lock content SHA-256: 03eee611d322dc0368814027f1b8c5d518422a79ff66969dabc1f6cca3b3821c

Next: use a separate disposable-only certifier to replay this exact chain twice and run every SQL contract, lint, type, and schema-determinism gate.
Never apply the baseline migration to the existing production database.
